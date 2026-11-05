import { Vector3, type PerspectiveCamera } from 'three';
import type { Landmark } from './detail';
import type { Rect } from './overlay';

const LATIN = /^[\x20-\x7e’'–]+$/;
const MAX = 4;

export class PoiLabels {
  private layer: HTMLElement;
  private els: HTMLElement[];
  private widths: number[];
  private shown = new Set<number>();
  private v = new Vector3();

  constructor(
    root: HTMLElement,
    private landmarks: Landmark[],
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'poi-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    this.els = landmarks.map((l) => {
      const el = document.createElement('div');
      el.className = 'poi';
      el.dataset.kind = l.kind;
      const dot = document.createElement('i');
      const text = document.createElement('span');
      text.textContent = l.name;
      el.append(dot, text);
      this.layer.append(el);
      return el;
    });
    const anchor = root.querySelector('[data-traveler]');
    root.insertBefore(this.layer, anchor);
    this.widths = this.els.map((el) => el.offsetWidth || 120);
  }

  update(camera: PerspectiveCamera, width: number, height: number, stop: Vector3 | null, avoid: Rect[], safe: Rect) {
    const next = new Set<number>();
    const pos: { x: number; y: number; left: boolean }[] = [];
    if (stop) {
      const candidates = this.landmarks
        .map((l, i) => ({ i, d: Math.hypot(l.pos.x - stop.x, l.pos.z - stop.z), latin: LATIN.test(l.name) }))
        .filter((c) => c.d > 3.5 && c.d < 32)
        .sort((a, b) => Number(b.latin) - Number(a.latin) || a.d - b.d);
      const placed: Rect[] = [];
      for (const c of candidates) {
        if (next.size >= MAX) break;
        this.v.copy(this.landmarks[c.i].pos).project(camera);
        if (this.v.z > 1) continue;
        const x = ((this.v.x + 1) / 2) * width;
        const y = ((1 - this.v.y) / 2) * height;
        if (x < safe.x - 40 || x > width - 8 || y < safe.y || y > safe.y + safe.h) continue;
        this.widths[c.i] ||= this.els[c.i].offsetWidth;
        const w = this.widths[c.i];
        const right = { x: x + 6, y: y - 11, w, h: 22 };
        const left = { x: x - 6 - w, y: y - 11, w, h: 22 };
        const clear = (r: Rect) =>
          r.x > 6 && r.x + r.w < width - 6 && ![...avoid, ...placed].some((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
        const choice = clear(right) ? right : clear(left) ? left : null;
        if (!choice) continue;
        placed.push(choice);
        next.add(c.i);
        pos[c.i] = { x, y, left: choice === left };
      }
    }
    this.els.forEach((el, i) => {
      const on = next.has(i);
      if (on !== this.shown.has(i)) el.classList.toggle('is-visible', on);
      if (on) {
        el.classList.toggle('is-left', pos[i].left);
        el.style.transform = `translate3d(${pos[i].x.toFixed(1)}px, ${pos[i].y.toFixed(1)}px, 0)`;
      }
    });
    this.shown = next;
  }

  dispose() {
    this.layer.remove();
  }
}
