import { Vector3, type PerspectiveCamera } from 'three';
import type { Mode } from './path';

export interface Traveler {
  pos: Vector3;
  mode: Mode;
  title: string;
  meta: string;
}

export interface OverlayFrame {
  camera: PerspectiveCamera;
  pins: Vector3[];
  activeStop: number;
  nextStop: number;
  polaroidStop: number;
  traveler: Traveler | null;
  fills: number[];
  current: number;
  panel: string;
  intro: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SLOTS = [
  { w: 262, rot: -6 },
  { w: 216, rot: 5 },
  { w: 198, rot: -3 },
];
const DOCKED_ROT = [-5, 3, -2];

export class Overlay {
  private root: HTMLElement;
  private pins: HTMLElement[];
  private groups: HTMLElement[];
  private links: SVGPathElement[];
  private linkSvg: SVGSVGElement;
  private items: HTMLElement[];
  private panels: Map<string, HTMLElement>;
  private content: HTMLElement | null;
  private tourbar: HTMLElement | null;
  private traveler: HTMLElement | null;
  private travelerTitle: HTMLElement | null;
  private travelerMeta: HTMLElement | null;
  private v = new Vector3();
  private width = 0;
  private height = 0;
  private barBottom = 0;
  private docked = false;
  private safe: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private contentRect: Rect | null = null;
  occupied: Rect[] = [];
  private sizes: { w: number; h: number }[][] = [];
  private labelW: number[] = [];
  private travelerW = 0;
  private state = { group: -1, current: -2, panel: '', intro: -1, title: '', meta: '', mode: '', traveler: false, side: 'right' };

  constructor(root: HTMLElement) {
    this.root = root;
    this.pins = [...root.querySelectorAll<HTMLElement>('[data-pin]')];
    this.groups = [...root.querySelectorAll<HTMLElement>('[data-polaroids]')];
    this.linkSvg = root.querySelector<SVGSVGElement>('[data-links]')!;
    this.links = [...this.linkSvg.querySelectorAll<SVGPathElement>('path')];
    this.items = [...root.querySelectorAll<HTMLElement>('[data-tour-item]')];
    this.panels = new Map([...root.querySelectorAll<HTMLElement>('[data-panel]')].map((p) => [p.dataset.panel!, p]));
    this.content = root.querySelector<HTMLElement>('[data-content]');
    this.tourbar = root.querySelector<HTMLElement>('[data-tourbar]');
    this.traveler = root.querySelector<HTMLElement>('[data-traveler]');
    this.travelerTitle = root.querySelector<HTMLElement>('[data-traveler-title]');
    this.travelerMeta = root.querySelector<HTMLElement>('[data-traveler-meta]');
  }

  get safeArea(): Rect {
    return this.safe;
  }

  get isDocked() {
    return this.docked;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const stage = this.root.getBoundingClientRect();
    const bar = this.tourbar?.getBoundingClientRect();
    this.barBottom = bar ? bar.bottom - stage.top : 0;
    const c = this.content?.getBoundingClientRect();
    this.docked = width < 900;
    this.contentRect = c ? { x: c.left - stage.left, y: c.top - stage.top, w: c.width, h: c.height } : null;
    const left = !this.docked && this.contentRect ? this.contentRect.x + this.contentRect.w + 28 : 16;
    const top = this.docked && this.contentRect ? this.contentRect.y + this.contentRect.h + 12 : Math.max(112, this.barBottom + 28);
    const bottom = height - (this.docked ? 16 : 24);
    this.safe = { x: left, y: top, w: width - 20 - left, h: bottom - top };
    this.travelerW = 0;
    this.labelW = this.pins.map((p) => p.querySelector<HTMLElement>('.pin__label')?.offsetWidth ?? 80);
    this.sizes = this.groups.map((g) =>
      [...g.querySelectorAll<HTMLElement>('[data-polaroid]')].map((el, i) => {
        const w = this.polaroidWidth(i);
        el.style.width = `${w}px`;
        return { w, h: Math.round(w * 0.955 + (this.docked ? 40 : 50)) };
      }),
    );
  }

  private polaroidWidth(i: number) {
    if (this.docked) return Math.round(Math.min(124, (this.width - 32 - 24) / 3));
    const scale = Math.min(1.12, Math.max(0.72, this.width / 1440));
    return Math.round(SLOTS[i].w * scale * 0.78);
  }

  focusPoint(): { x: number; y: number } {
    if (this.docked) {
      const top = this.safe.y;
      const bottom = this.safe.y + this.safe.h - (this.sizes[0]?.[0]?.h ?? 150) - 16;
      return { x: 0.5, y: Math.min(0.78, Math.max(0.42, (top + bottom) / 2 / this.height)) };
    }
    return { x: (this.safe.x + this.safe.w * 0.42) / this.width, y: 0.6 };
  }

  overviewArea(): Rect {
    if (this.docked) {
      const bottom = this.safe.y + this.safe.h;
      return { x: 0.06, y: (this.safe.y + 20) / this.height, w: 0.88, h: (bottom - this.safe.y - 40) / this.height };
    }
    const top = Math.max(0.2, (this.safe.y + 10) / this.height);
    return {
      x: (this.safe.x + 10) / this.width,
      y: top,
      w: (this.safe.w - 30) / this.width,
      h: (this.safe.y + this.safe.h - 20) / this.height - top,
    };
  }

  private project(p: Vector3, camera: PerspectiveCamera) {
    this.v.copy(p).project(camera);
    return {
      x: ((this.v.x + 1) / 2) * this.width,
      y: ((1 - this.v.y) / 2) * this.height,
      visible: this.v.z < 1 && Math.abs(this.v.x) < 1.3 && Math.abs(this.v.y) < 1.3,
    };
  }

  private insideContent(x: number, y: number) {
    const c = this.contentRect;
    if (!c) return false;
    return x > c.x - 16 && x < c.x + c.w + 16 && y > c.y - 16 && y < c.y + c.h + 16;
  }

  update(f: OverlayFrame) {
    const s = this.state;
    const screen = f.pins.map((p) => this.project(p, f.camera));
    const hidden = screen.map((p) => !p.visible || p.y > this.height - 6 || p.y < this.barBottom + 16 || this.insideContent(p.x, p.y));
    const placed: Rect[] = screen.flatMap((p, i) => (hidden[i] ? [] : [{ x: p.x - 10, y: p.y - 10, w: 20, h: 20 }]));
    const order = screen.map((_, i) => i).sort((a, b) => Number(b === f.activeStop) - Number(a === f.activeStop) || Number(b === f.nextStop) - Number(a === f.nextStop) || a - b);
    for (const i of order) {
      const p = screen[i];
      const el = this.pins[i];
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      el.classList.toggle('is-hidden', hidden[i]);
      el.classList.toggle('is-active', i === f.activeStop);
      el.classList.toggle('is-next', i === f.nextStop);
      if (hidden[i]) continue;
      const active = i === f.activeStop;
      const w = this.labelW[i] * (active ? 1.3 : 1);
      const h = active ? 32 : 26;
      const right = { x: p.x + 14, y: p.y - h / 2, w, h };
      const left = { x: p.x - 14 - w, y: p.y - h / 2, w, h };
      const fits = (r: Rect) => r.x > 4 && r.x + r.w < this.width - 4 && !placed.some((o) => !(r.x + r.w < o.x || o.x + o.w < r.x || r.y + r.h < o.y || o.y + o.h < r.y) && !(o.x === p.x - 10 && o.y === p.y - 10));
      const choice = fits(right) ? right : fits(left) ? left : null;
      el.classList.toggle('is-left', choice === left);
      el.classList.toggle('is-quiet', !choice && !active);
      if (choice) placed.push(choice);
    }

    this.items.forEach((item, i) => item.style.setProperty('--p', f.fills[i].toFixed(3)));
    if (f.current !== s.current) {
      this.items.forEach((item, i) => {
        item.classList.toggle('is-active', i === f.current);
        const btn = item.querySelector('button');
        if (i === f.current) btn?.setAttribute('aria-current', 'step');
        else btn?.removeAttribute('aria-current');
      });
      const item = this.items[f.current];
      const list = item?.parentElement;
      if (this.docked && item && list) {
        list.scrollTo({ left: item.offsetLeft - list.offsetLeft - (list.clientWidth - item.offsetWidth) / 2, behavior: 'smooth' });
      }
      s.current = f.current;
    }

    if (f.panel !== s.panel) {
      this.panels.forEach((el, key) => {
        const active = key === f.panel;
        el.classList.toggle('is-active', active);
        el.inert = !active;
      });
      s.panel = f.panel;
    }

    const intro = Math.round(f.intro * 100) / 100;
    if (intro !== s.intro) {
      this.root.style.setProperty('--intro', String(intro));
      s.intro = intro;
    }

    this.updateTraveler(f.traveler, f.camera);

    if (f.polaroidStop !== s.group) {
      this.groups.forEach((g, i) => g.classList.toggle('is-visible', i === f.polaroidStop));
      this.linkSvg.classList.toggle('is-visible', f.polaroidStop >= 0);
      s.group = f.polaroidStop;
    }
    this.occupied = [...placed];
    if (this.contentRect) this.occupied.push(this.contentRect);
    if (f.polaroidStop < 0) return;

    const pin = screen[f.polaroidStop];
    const rects = this.layout(pin.x, pin.y, f.polaroidStop);
    this.occupied.push(...rects);
    const els = this.groups[f.polaroidStop].querySelectorAll<HTMLElement>('[data-polaroid]');
    rects.forEach((r, i) => {
      const el = els[i];
      if (!el) return;
      const rot = this.docked ? DOCKED_ROT[i] : SLOTS[i].rot;
      el.style.transform = `translate3d(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px, 0) rotate(${rot}deg)`;
      const tx = Math.max(r.x, Math.min(pin.x, r.x + r.w));
      const ty = Math.max(r.y, Math.min(pin.y, r.y + r.h));
      const dx = tx - pin.x;
      const dy = ty - pin.y;
      const len = Math.hypot(dx, dy) || 1;
      this.links[i]?.setAttribute('d', `M${(pin.x + (dx / len) * 12).toFixed(1)} ${(pin.y + (dy / len) * 12).toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}`);
    });
  }

  private updateTraveler(t: Traveler | null, camera: PerspectiveCamera) {
    const el = this.traveler;
    if (!el) return;
    const s = this.state;
    const p = t && this.project(t.pos, camera);
    const visible = !!p && p.visible && p.x > 0 && p.x < this.width && p.y > this.barBottom + 21 && p.y < this.height;
    if (visible !== s.traveler) {
      el.classList.toggle('is-visible', visible);
      s.traveler = visible;
    }
    if (!t || !p) return;
    if (t.mode !== s.mode) {
      el.dataset.mode = t.mode;
      s.mode = t.mode;
    }
    if (t.title !== s.title && this.travelerTitle) {
      this.travelerTitle.textContent = t.title;
      s.title = t.title;
      this.travelerW = 0;
    }
    if (t.meta !== s.meta && this.travelerMeta) {
      this.travelerMeta.textContent = t.meta;
      s.meta = t.meta;
      this.travelerW = 0;
    }
    this.travelerW ||= el.offsetWidth;
    const w = this.travelerW;
    const leftLimit = !this.docked && this.contentRect ? this.contentRect.x + this.contentRect.w + 8 : 12;
    const rightRoom = this.width - 12 - (p.x - 21 + w);
    const side = rightRoom >= (s.side === 'right' ? 0 : 40) ? 'right' : p.x + 21 - w >= leftLimit ? 'left' : 'below';
    if (side !== s.side) {
      el.classList.toggle('is-flipped', side === 'left');
      el.classList.toggle('is-below', side === 'below');
      s.side = side;
    }
    el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
  }

  private layout(px: number, py: number, stop: number): Rect[] {
    const sizes = this.sizes[stop] ?? [];
    const s = this.safe;
    if (this.docked) {
      const gap = 12;
      const total = sizes.reduce((a, b) => a + b.w, 0) + gap * (sizes.length - 1);
      let x = (this.width - total) / 2;
      const bottom = s.y + s.h;
      return sizes.map((size, i) => {
        const r = { x, y: bottom - size.h - (i === 1 ? 10 : 0), w: size.w, h: size.h };
        x += size.w + gap;
        return r;
      });
    }
    const [a, b, c] = sizes;
    const raw: Rect[] = [
      { x: px - a.w * 0.6, y: py - a.h - 52, w: a.w, h: a.h },
      { x: px + 52, y: py + 22, w: b.w, h: b.h },
      { x: px - c.w - 44, y: py + 18, w: c.w, h: c.h },
    ];
    return raw.map((r) => {
      const out = {
        x: Math.min(Math.max(r.x, s.x), s.x + s.w - r.w),
        y: Math.min(Math.max(r.y, s.y), s.y + s.h - r.h),
        w: r.w,
        h: r.h,
      };
      if (px > out.x - 18 && px < out.x + out.w + 18 && py > out.y - 18 && py < out.y + out.h + 18) {
        out.x = px < out.x + out.w / 2 ? px + 34 : px - out.w - 34;
        out.x = Math.min(Math.max(out.x, s.x), s.x + s.w - out.w);
      }
      return out;
    });
  }
}
