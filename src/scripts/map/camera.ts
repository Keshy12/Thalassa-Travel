import { MathUtils, Vector3, type PerspectiveCamera } from 'three';

export interface Pose {
  target: Vector3;
  distance: number;
  yaw: number;
  pitch: number;
  fx: number;
  fy: number;
}

export const clonePose = (p: Pose): Pose => ({ ...p, target: p.target.clone() });

export function lerpAngle(a: number, b: number, t: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

export function flyTo(a: Pose, b: Pose, e: number, out: Pose, travel = a.target.distanceTo(b.target)) {
  out.target.lerpVectors(a.target, b.target, e);
  out.yaw = lerpAngle(a.yaw, b.yaw, e);
  const hi = Math.max(a.distance, b.distance);
  const bump = Math.log(Math.max(hi, travel) / hi);
  const arc = Math.sin(Math.PI * e);
  out.distance = Math.exp(MathUtils.lerp(Math.log(a.distance), Math.log(b.distance), e) + bump * arc);
  out.pitch = MathUtils.lerp(a.pitch, b.pitch, e) - Math.min(10, bump * 8) * arc;
  out.fx = MathUtils.lerp(a.fx, b.fx, e);
  out.fy = MathUtils.lerp(a.fy, b.fy, e);
  return out;
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
