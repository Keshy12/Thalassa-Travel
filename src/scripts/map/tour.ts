import { MathUtils, Vector3, type PerspectiveCamera } from 'three';

export interface Pose {
  target: Vector3;
  distance: number;
  yaw: number;
  pitch: number;
  fx: number;
  fy: number;
}

export type Step = { kind: 'overview' } | { kind: 'stop'; index: number };

export interface TourOptions {
  sequence: Step[];
  poseFor: (step: Step) => Pose;
  reducedMotion: boolean;
  holdStop?: number;
  holdOverview?: number;
}

export const clonePose = (p: Pose): Pose => ({ ...p, target: p.target.clone() });

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function lerpAngle(a: number, b: number, t: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

function interpolatePose(a: Pose, b: Pose, t: number, out: Pose) {
  const e = easeInOutCubic(t);
  out.target.lerpVectors(a.target, b.target, e);
  out.yaw = lerpAngle(a.yaw, b.yaw, e);
  const travel = a.target.distanceTo(b.target);
  const hi = Math.max(a.distance, b.distance);
  const bump = Math.log(Math.max(hi, travel * 1.15) / hi);
  const arc = Math.sin(Math.PI * e);
  out.distance = Math.exp(MathUtils.lerp(Math.log(a.distance), Math.log(b.distance), e) + bump * arc);
  out.pitch = MathUtils.lerp(a.pitch, b.pitch, e) - Math.min(12, bump * 9) * arc;
  out.fx = MathUtils.lerp(a.fx, b.fx, e);
  out.fy = MathUtils.lerp(a.fy, b.fy, e);
  return out;
}

function flightDuration(a: Pose, b: Pose) {
  const travel = a.target.distanceTo(b.target);
  const zoom = Math.abs(Math.log(a.distance / b.distance));
  return MathUtils.clamp(2.8 + travel / 300 + zoom * 0.45, 3.4, 6.2);
}

export function applyPose(camera: PerspectiveCamera, pose: Pose, yawOffset = 0, pitchOffset = 0) {
  const yaw = MathUtils.degToRad(pose.yaw + yawOffset);
  const pitch = MathUtils.degToRad(MathUtils.clamp(pose.pitch + pitchOffset, 5, 80));
  const s = Math.sin(pitch);
  camera.position.set(
    pose.target.x + pose.distance * s * Math.sin(yaw),
    pose.target.y + pose.distance * Math.cos(pitch),
    pose.target.z + pose.distance * s * Math.cos(yaw),
  );
  camera.lookAt(pose.target);
}

export class Tour {
  readonly pose: Pose;
  phase: 'fly' | 'hold' = 'fly';
  stepIndex = 0;
  paused = false;
  flightT = 0;
  holdT = 0;
  holdDuration = 0;
  private from: Pose;
  private to: Pose;
  private duration = 1;
  private manualHold = false;
  private driftDir = 1;
  private opts: TourOptions;

  constructor(opts: TourOptions, start: Pose) {
    this.opts = opts;
    this.pose = clonePose(start);
    this.from = clonePose(start);
    this.to = opts.poseFor(opts.sequence[0]);
    this.duration = opts.reducedMotion ? 0.001 : 3.4;
  }

  get step(): Step {
    return this.opts.sequence[this.stepIndex];
  }

  get stopIndex(): number {
    const s = this.step;
    return s.kind === 'stop' ? s.index : -1;
  }

  get holdProgress(): number {
    return this.phase === 'hold' && this.holdDuration > 0 ? Math.min(1, this.holdT / this.holdDuration) : 0;
  }

  get cardsVisible(): boolean {
    if (this.phase !== 'hold' || this.stopIndex < 0) return false;
    if (this.paused || this.opts.reducedMotion) return true;
    return this.holdT > 0.25 && this.holdT < this.holdDuration - 0.55;
  }

  get focusAmount(): number {
    if (this.stopIndex < 0) return 0;
    if (this.phase === 'fly') return MathUtils.smoothstep(this.flightT, 0.72, 1);
    return 1 - MathUtils.smoothstep(this.holdT, this.holdDuration - 0.6, this.holdDuration);
  }

  goTo(stop: number) {
    const idx = this.opts.sequence.findIndex((s) => s.kind === 'stop' && s.index === stop);
    if (idx < 0) return;
    this.startFlight(idx);
    this.manualHold = true;
  }

  refreshTarget() {
    const fresh = this.opts.poseFor(this.step);
    if (this.phase === 'fly') this.to = fresh;
    else {
      this.pose.fx = fresh.fx;
      this.pose.fy = fresh.fy;
      if (this.step.kind === 'overview') this.pose.distance = fresh.distance;
    }
  }

  private startFlight(idx: number) {
    this.stepIndex = idx;
    this.from = clonePose(this.pose);
    this.to = this.opts.poseFor(this.step);
    this.duration = this.opts.reducedMotion ? 0.001 : flightDuration(this.from, this.to);
    this.flightT = 0;
    this.phase = 'fly';
    this.manualHold = false;
  }

  update(dt: number) {
    if (this.phase === 'fly') {
      this.flightT = Math.min(1, this.flightT + dt / this.duration);
      interpolatePose(this.from, this.to, this.flightT, this.pose);
      if (this.flightT >= 1) {
        this.phase = 'hold';
        this.holdT = 0;
        const isStop = this.step.kind === 'stop';
        this.holdDuration = (isStop ? (this.opts.holdStop ?? 7) : (this.opts.holdOverview ?? 3)) + (this.manualHold ? 3 : 0);
        this.driftDir = -this.driftDir;
      }
      return;
    }

    if (!this.opts.reducedMotion) {
      this.pose.yaw += this.driftDir * (this.step.kind === 'stop' ? 1.5 : 0.8) * dt;
      if (this.step.kind === 'stop') this.pose.distance *= 1 - 0.006 * dt;
    }
    if (this.paused || this.opts.reducedMotion) return;
    this.holdT += dt;
    if (this.holdT >= this.holdDuration) this.startFlight((this.stepIndex + 1) % this.opts.sequence.length);
  }
}
