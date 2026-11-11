import { BELL, BELL_CORE, BREAM, INK, SLIM, TURTLE, type FishShape } from './shapes';

export interface SeaState {
  cam: number;
  depth: number;
  rise: number;
  level: number;
}

interface Layer {
  par: number;
  scale: number;
  alpha: number;
  speed: [number, number];
  flee: number;
}

interface Member {
  hx: number;
  hy: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
}

interface School {
  layer: number;
  shape: FishShape;
  color: string;
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  len: number;
  reach: number;
  sway: number;
  patrol: boolean;
  members: Member[];
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  v: number;
  phase: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  a: number;
  vx: number;
  vy: number;
  par: number;
}

interface Jelly {
  x: number;
  y: number;
  size: number;
  phase: number;
  drift: number;
}

interface Froth {
  x: number;
  y: number;
  r: number;
  v: number;
  life: number;
  span: number;
}

interface Turtle {
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  size: number;
  phase: number;
  wait: number;
}

const TAU = Math.PI * 2;
const LANE_FADE = 0.13;
const LAYERS: Layer[] = [
  { par: 0.22, scale: 0.44, alpha: 0.34, speed: [10, 18], flee: 0 },
  { par: 0.44, scale: 0.7, alpha: 0.62, speed: [18, 30], flee: 0.6 },
  { par: 0.72, scale: 1, alpha: 0.95, speed: [28, 46], flee: 1 },
];
const NEAR_INKS = [INK.cream, INK.cream, INK.sunSoft, INK.sun];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const wrap = (v: number, min: number, max: number) => {
  const span = max - min;
  return ((((v - min) % span) + span) % span) + min;
};

export class SeaLife {
  readonly pointer = { x: 0, y: 0, on: false };
  edge = 0;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr: number;
  private unit = 1;
  private wide = true;
  private cam = 0;
  private seeded = false;
  private frames = 0;
  private frameTime = 0;
  private schools: School[] = [];
  private bubbles: Bubble[] = [];
  private motes: Mote[] = [];
  private jellies: Jelly[] = [];
  private froth: Froth[] = [];
  private turtle: Turtle | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private still: boolean,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  resize(w: number, h: number) {
    if (w < 1 || h < 1) return;
    const before = this.w * this.h;
    const wide = w > 960;
    const reseed = !this.seeded || wide !== this.wide || Math.abs(w * h - before) > before * 0.3;
    this.w = w;
    this.h = h;
    this.wide = wide;
    this.unit = clamp(w / 1440, 0.56, 1.15);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    if (reseed) this.populate();
  }

  private populate() {
    const { w, h, unit, wide } = this;
    this.seeded = true;
    const plan = wide ? [0, 0, 1, 1, 1, 2, 2, 2] : [0, 1, 1, 2];
    this.schools = plan.map((layer) => this.school(layer, false));
    for (let i = 0; i < (wide ? 3 : 2); i++) this.schools.push(this.school(i % 2 ? 1 : 2, true));
    this.schools.sort((a, b) => a.layer - b.layer);
    this.bubbles = Array.from({ length: wide ? 30 : 16 }, () => ({
      x: rand(0, w),
      y: rand(0, h),
      r: rand(1.6, 6.5) * unit,
      v: rand(26, 64),
      phase: rand(0, TAU),
    }));
    this.motes = Array.from({ length: wide ? 70 : 34 }, () => ({
      x: rand(0, w),
      y: rand(0, h),
      r: rand(0.6, 1.7),
      a: rand(0.14, 0.5),
      vx: rand(-5, 5),
      vy: rand(1, 7),
      par: rand(0.3, 0.85),
    }));
    this.jellies = Array.from({ length: wide ? 3 : 2 }, (_, i) => ({
      x: wide ? this.edge + (w - this.edge) * (0.22 + i * 0.3) : w * (0.2 + i * 0.6) + rand(-40, 40),
      y: h * rand(0.3, 0.9),
      size: rand(46, 70) * unit,
      phase: rand(0, TAU),
      drift: rand(0, TAU),
    }));
    this.turtle = {
      x: wide ? this.edge + (w - this.edge) * 0.5 : w * 0.62,
      y: h * 0.3,
      dir: -1,
      speed: rand(15, 21) * unit,
      size: (wide ? 230 : 190) * unit,
      phase: rand(0, TAU),
      wait: 0,
    };
    this.froth = [];
  }

  private school(layer: number, solo: boolean): School {
    const { w, h, unit, wide } = this;
    const L = LAYERS[layer];
    const patrol = wide && (solo || layer === 2);
    const count = solo ? (Math.random() < 0.5 ? 1 : 2) : Math.round(rand(7, 13) * (wide ? 1 : 0.7));
    const len = (solo ? rand(84, 112) : rand(36, 48)) * L.scale * unit;
    const reach = solo ? len * 1.3 : count * len * 0.42;
    return {
      layer,
      shape: solo ? BREAM : SLIM,
      color: layer === 2 ? NEAR_INKS[Math.floor(Math.random() * NEAR_INKS.length)] : layer ? INK.cream : INK.mist,
      x: patrol ? rand(this.edge + w * LANE_FADE, w) : rand(0, w),
      y: h * rand(0.14, 0.92),
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: rand(L.speed[0], L.speed[1]) * unit * (solo ? 0.7 : 1),
      len,
      reach,
      sway: rand(0, TAU),
      patrol,
      members: Array.from({ length: count }, () => ({
        hx: rand(-1, 1) * reach,
        hy: rand(-1, 1) * reach * 0.36,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
        phase: rand(0, TAU),
        size: rand(0.8, 1.15),
      })),
    };
  }

  private lane(x: number) {
    if (!this.wide) return 0.62;
    const t = clamp((x - this.edge) / (this.w * LANE_FADE), 0, 1);
    return t * t * (3 - 2 * t);
  }

  frame(dt: number, s: SeaState) {
    const { ctx, w, h } = this;
    if (!this.seeded) return;
    const shift = s.cam - this.cam;
    const fade = 1 - s.depth * 0.22;
    this.cam = s.cam;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this.drawMotes(dt, shift, fade);
    this.drawSchools(0, dt, shift, fade);
    for (const j of this.jellies) this.drawJelly(j, dt, shift, fade);
    this.drawSchools(1, dt, shift, fade);
    this.drawTurtle(dt, shift, fade);
    this.drawSchools(2, dt, shift, fade);
    this.drawBubbles(dt, shift, fade);
    this.drawFroth(dt, s);
    ctx.globalAlpha = 1;

    if (dt > 0) this.adapt(dt);
  }

  private adapt(dt: number) {
    this.frames++;
    this.frameTime += dt;
    if (this.frames < 90) return;
    if (this.frameTime / this.frames > 0.024 && this.dpr > 1) {
      this.dpr = Math.max(1, this.dpr - 0.25);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
    }
    this.frames = 0;
    this.frameTime = 0;
  }

  private drawMotes(dt: number, shift: number, fade: number) {
    const { ctx, w, h } = this;
    ctx.fillStyle = INK.cream;
    for (const m of this.motes) {
      m.x = wrap(m.x + m.vx * dt, -4, w + 4);
      m.y = wrap(m.y + m.vy * dt - shift * m.par, -4, h + 4);
      ctx.globalAlpha = m.a * fade;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.fill();
    }
  }

  private drawSchools(layer: number, dt: number, shift: number, fade: number) {
    const { w, h, unit, pointer } = this;
    const L = LAYERS[layer];
    const scare = 130 * unit;
    for (const sc of this.schools) {
      if (sc.layer !== layer) continue;
      const margin = sc.reach + sc.len + 40;
      sc.x += sc.dir * sc.speed * dt;
      sc.sway += dt * 0.35;
      sc.y = wrap(sc.y + Math.sin(sc.sway) * 6 * dt - shift * L.par, -margin, h + margin);
      if (sc.dir > 0 && sc.x - margin > w) {
        if (sc.patrol) sc.dir = -1;
        else sc.x = -margin;
        sc.y = h * rand(0.1, 0.92);
      } else if (sc.dir < 0 && sc.x < (sc.patrol ? this.edge - margin : -margin)) {
        if (sc.patrol) sc.dir = 1;
        else sc.x = w + margin;
        sc.y = h * rand(0.1, 0.92);
      }
      for (const m of sc.members) {
        const x = sc.x + sc.dir * m.hx + m.ox;
        const y = sc.y + m.hy + m.oy;
        if (pointer.on && L.flee) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < scare) {
            const push = (1 - d / scare) * 1500 * L.flee * dt;
            m.vx += (dx / d) * push;
            m.vy += (dy / d) * push;
          }
        }
        m.vx += (-m.ox * 5 - m.vx * 3.2) * dt;
        m.vy += (-m.oy * 5 - m.vy * 3.2) * dt;
        m.ox += m.vx * dt;
        m.oy += m.vy * dt;
        m.phase += dt * (7 + sc.speed * 0.12 + Math.hypot(m.vx, m.vy) * 0.03);
        const seen = sc.patrol || layer === 2 ? this.lane(x) : layer ? 0.3 + 0.7 * this.lane(x) : 1;
        if (seen < 0.02) continue;
        this.drawFish(sc, x, y, sc.len * m.size, Math.sin(m.phase) * 0.42, clamp(m.vy * 0.004, -0.4, 0.4), L.alpha * fade * seen);
      }
    }
  }

  private drawFish(sc: School, x: number, y: number, len: number, wag: number, tilt: number, alpha: number) {
    const { ctx } = this;
    const { shape } = sc;
    const k = len / 100;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc.dir * k, k);
    ctx.rotate(tilt - wag * 0.1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = sc.color;
    ctx.save();
    ctx.translate(shape.pivot, 0);
    ctx.rotate(wag);
    ctx.translate(-shape.pivot, 0);
    ctx.fill(shape.tail);
    ctx.restore();
    ctx.fill(shape.fins);
    ctx.fill(shape.body);
    if (sc.layer === 2 || shape === BREAM) {
      ctx.fillStyle = INK.navy;
      if (shape === BREAM) {
        ctx.globalAlpha = alpha * 0.2;
        ctx.fillRect(-9, -17, 5, 32);
        ctx.fillRect(5, -19, 5, 35);
        ctx.fillRect(19, -16, 5, 30);
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.arc(-21, 0, 5, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath();
      ctx.arc(shape.eye[0], shape.eye[1], shape.eye[2], 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawJelly(j: Jelly, dt: number, shift: number, fade: number) {
    const { ctx, w, h, unit, wide } = this;
    const pad = j.size * 2;
    j.phase += dt * 1.5;
    const pulse = Math.sin(j.phase);
    const before = j.y;
    j.y = wrap(j.y - (5 + Math.max(0, pulse) * 16) * unit * dt - shift * 0.34, -pad, h + pad);
    if (Math.abs(j.y - before) > h) j.x = wide ? rand(this.edge + w * LANE_FADE, w * 0.95) : w * rand(0.1, 0.9);
    j.x += Math.sin(j.phase * 0.31 + j.drift) * 5 * dt;
    const seen = fade * this.lane(j.x);
    if (seen < 0.02) return;

    const k = j.size / 60;
    ctx.save();
    ctx.translate(j.x, j.y);
    ctx.scale(k, k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK.cream;
    ctx.globalAlpha = 0.34 * seen;
    for (let i = 0; i < 6; i++) {
      const x0 = -22 + i * 8.8;
      ctx.lineWidth = i % 2 ? 1.4 : 2.4;
      ctx.beginPath();
      ctx.moveTo(x0, 2);
      for (let n = 1; n <= 7; n++) ctx.lineTo(x0 + Math.sin(j.phase * 1.2 - n * 0.75 + i) * (1.5 + n * 1.1), 2 + n * (i % 2 ? 9 : 6.5));
      ctx.stroke();
    }
    ctx.scale(1 + pulse * 0.07, 1 - pulse * 0.09);
    ctx.fillStyle = INK.cream;
    ctx.globalAlpha = 0.3 * seen;
    ctx.fill(BELL);
    ctx.globalAlpha = 0.55 * seen;
    ctx.lineWidth = 1.5;
    ctx.stroke(BELL);
    ctx.fillStyle = INK.sunSoft;
    ctx.globalAlpha = 0.5 * seen;
    ctx.fill(BELL_CORE);
    ctx.restore();
  }

  private drawTurtle(dt: number, shift: number, fade: number) {
    const { ctx, w, h, wide } = this;
    const t = this.turtle;
    if (!t) return;
    if (t.wait > 0) {
      t.wait -= dt;
      return;
    }
    const pad = t.size;
    t.phase += dt * 1.9;
    t.x += t.dir * t.speed * dt;
    t.y = wrap(t.y + Math.sin(t.phase * 0.5) * 5 * dt - shift * 0.56, -pad, h + pad);
    if (t.dir > 0 ? t.x - pad > w : t.x < (wide ? this.edge - pad : -pad)) {
      const turn = wide && t.dir < 0;
      t.dir = turn ? 1 : wide ? -1 : Math.random() < 0.5 ? 1 : -1;
      if (!turn) t.x = t.dir > 0 ? -pad : w + pad;
      t.y = h * rand(0.2, 0.75);
      t.wait = rand(3, 8);
      return;
    }
    const seen = fade * this.lane(t.x);
    if (seen < 0.02) return;

    const k = t.size / 220;
    const stroke = Math.sin(t.phase);
    const [sx, sy] = TURTLE.shoulder;
    const [hx, hy] = TURTLE.hip;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.dir * k, k);
    ctx.rotate(Math.sin(t.phase * 0.5) * 0.04 - 0.06);
    ctx.globalAlpha = 0.92 * seen;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-0.25 - stroke * 0.42);
    ctx.translate(-sx, -sy);
    ctx.fillStyle = INK.olive;
    ctx.fill(TURTLE.flipper);
    ctx.restore();

    ctx.fillStyle = INK.sage;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(stroke * 0.16);
    ctx.translate(-hx, -hy);
    ctx.fill(TURTLE.rear);
    ctx.restore();
    ctx.fill(TURTLE.tail);
    ctx.fill(TURTLE.head);
    ctx.fillStyle = INK.cream;
    ctx.fill(TURTLE.belly);
    ctx.fillStyle = INK.brown;
    ctx.fill(TURTLE.shell);
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.3 * seen;
    ctx.stroke(TURTLE.scutes);
    ctx.globalAlpha = 0.92 * seen;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(0.12 + stroke * 0.5);
    ctx.translate(-sx, -sy);
    ctx.fillStyle = INK.sage;
    ctx.fill(TURTLE.flipper);
    ctx.restore();

    ctx.fillStyle = INK.navy;
    ctx.beginPath();
    ctx.arc(TURTLE.eye[0], TURTLE.eye[1], TURTLE.eye[2], 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawBubbles(dt: number, shift: number, fade: number) {
    const { ctx, w, h } = this;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 1.2;
    for (const b of this.bubbles) {
      const before = b.y;
      b.phase += dt * 2;
      b.y = wrap(b.y - b.v * dt - shift * 0.9, -14, h + 60);
      if (Math.abs(b.y - before) > h * 0.5) b.x = rand(0, w);
      const x = b.x + Math.sin(b.phase) * b.r * 0.9;
      ctx.beginPath();
      ctx.arc(x, b.y, b.r, 0, TAU);
      ctx.globalAlpha = 0.1 * fade;
      ctx.fill();
      ctx.globalAlpha = 0.55 * fade;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - b.r * 0.34, b.y - b.r * 0.34, b.r * 0.2, 0, TAU);
      ctx.globalAlpha = 0.75 * fade;
      ctx.fill();
    }
  }

  private drawFroth(dt: number, s: SeaState) {
    const { ctx, w, h } = this;
    if (!this.still && s.rise > 60 && s.level < h) {
      const burst = Math.min(5, Math.floor(s.rise * dt * 0.05 + Math.random()));
      for (let i = 0; i < burst && this.froth.length < 110; i++) {
        const low = Math.random() < 0.4;
        this.froth.push({
          x: rand(0, w),
          y: low ? s.level + rand(0, 30) : rand(6, 48),
          r: low ? rand(2, 5.5) : rand(1.2, 3.4),
          v: low ? rand(90, 190) : rand(14, 40),
          life: 0,
          span: low ? rand(1.2, 2.2) : rand(0.5, 1.1),
        });
      }
    }
    if (!this.froth.length) return;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.1;
    this.froth = this.froth.filter((f) => {
      f.life += dt;
      f.y -= f.v * dt;
      if (f.life >= f.span || f.y < 2) return false;
      ctx.globalAlpha = (1 - f.life / f.span) * 0.7;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.stroke();
      return true;
    });
  }
}
