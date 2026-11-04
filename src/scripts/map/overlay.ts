import { Vector3, type PerspectiveCamera } from 'three';

export interface OverlayFrame {
  camera: PerspectiveCamera;
  pins: Vector3[];
  cardsStop: number;
  cardsVisible: boolean;
  focusStop: number;
  progress: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DESKTOP_SLOTS = [
  { w: 300, rot: -2.5 },
  { w: 236, rot: 2.2 },
  { w: 214, rot: -1.4 },
];

export class Overlay {
  private root: HTMLElement;
  private pins: HTMLElement[];
  private groups: HTMLElement[];
  private links: SVGPathElement[];
  private linkSvg: SVGSVGElement;
  private tourItems: HTMLElement[];
  private content: HTMLElement | null;
  private tourbar: HTMLElement | null;
  private v = new Vector3();
  private width = 0;
  private height = 0;
  private docked = false;
  private safe: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private contentRect: Rect | null = null;
  private activeGroup = -1;
  private lastFocus = -2;
  private cardSizes: { w: number; h: number }[][] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.pins = [...root.querySelectorAll<HTMLElement>('[data-pin]')];
    this.groups = [...root.querySelectorAll<HTMLElement>('[data-stop-cards]')];
    this.linkSvg = root.querySelector<SVGSVGElement>('[data-links]')!;
    this.links = [...this.linkSvg.querySelectorAll<SVGPathElement>('path')];
    this.tourItems = [...root.querySelectorAll<HTMLElement>('[data-tour-item]')];
    this.content = root.querySelector<HTMLElement>('[data-content]');
    this.tourbar = root.querySelector<HTMLElement>('[data-tourbar]');
  }

  get isDocked() {
    return this.docked;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const stage = this.root.getBoundingClientRect();
    const bar = this.tourbar?.getBoundingClientRect();
    const barTop = bar ? bar.top - stage.top : height;
    const c = this.content?.getBoundingClientRect();
    this.docked = width < 900;
    this.contentRect = c ? { x: c.left - stage.left, y: c.top - stage.top, w: c.width, h: c.height } : null;
    const left = !this.docked && this.contentRect ? this.contentRect.x + this.contentRect.w + 28 : 16;
    const top = this.docked && this.contentRect ? this.contentRect.y + this.contentRect.h + 12 : 104;
    this.safe = { x: left, y: top, w: width - 20 - left, h: barTop - 14 - top };
    this.root.style.setProperty('--tourbar-top', `${barTop}px`);
    this.cardSizes = this.groups.map((g) => {
      const cards = [...g.querySelectorAll<HTMLElement>('[data-card]')];
      return cards.map((card, i) => {
        const w = this.cardWidth(i);
        card.style.width = `${w}px`;
        return { w, h: w * 0.75 + (this.docked ? 30 : 46) + 16 };
      });
    });
  }

  private cardWidth(i: number) {
    if (this.docked) return Math.min(170, (this.width - 32 - 20) / 3);
    const scale = Math.min(1.12, Math.max(0.72, this.width / 1440));
    return Math.round(DESKTOP_SLOTS[i].w * scale);
  }

  focusPoint(): { x: number; y: number } {
    if (this.docked) {
      const top = this.safe.y;
      const bottom = this.safe.y + this.safe.h - (this.cardSizes[0]?.[0]?.h ?? 140) - 20;
      return { x: 0.5, y: Math.min(0.78, Math.max(0.45, (top + bottom) / 2 / this.height)) };
    }
    const cx = this.safe.x + this.safe.w * 0.42;
    return { x: cx / this.width, y: 0.6 };
  }

  overviewArea(): Rect {
    if (this.docked) {
      const bottom = this.safe.y + this.safe.h;
      return { x: 0.06, y: (this.safe.y + 20) / this.height, w: 0.88, h: (bottom - this.safe.y - 40) / this.height };
    }
    return {
      x: (this.safe.x + 10) / this.width,
      y: 0.2,
      w: (this.safe.w - 30) / this.width,
      h: (this.safe.y + this.safe.h - 30) / this.height - 0.2,
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
    const screen = f.pins.map((p) => this.project(p, f.camera));

    screen.forEach((s, i) => {
      const el = this.pins[i];
      el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
      const hidden = !s.visible || s.y > this.safe.y + this.safe.h + 6 || this.insideContent(s.x, s.y);
      el.classList.toggle('is-hidden', hidden);
      el.classList.toggle('is-active', i === f.focusStop);
    });

    if (f.focusStop !== this.lastFocus) {
      this.tourItems.forEach((item, i) => {
        const active = i === f.focusStop;
        item.classList.toggle('is-active', active);
        item.style.setProperty('--p', '0');
        const btn = item.querySelector('button');
        if (active) btn?.setAttribute('aria-current', 'step');
        else btn?.removeAttribute('aria-current');
      });
      this.lastFocus = f.focusStop;
    }
    this.tourItems[f.focusStop]?.style.setProperty('--p', f.progress.toFixed(3));

    if (this.activeGroup !== f.cardsStop || !f.cardsVisible) {
      this.groups.forEach((g, i) => g.classList.toggle('is-visible', f.cardsVisible && i === f.cardsStop));
      this.linkSvg.classList.toggle('is-visible', f.cardsVisible);
      this.activeGroup = f.cardsVisible ? f.cardsStop : -1;
    }
    if (f.cardsStop < 0) return;

    const pin = screen[f.cardsStop];
    const rects = this.layoutCards(pin.x, pin.y, f.cardsStop);
    const cards = this.groups[f.cardsStop].querySelectorAll<HTMLElement>('[data-card]');
    rects.forEach((r, i) => {
      const card = cards[i];
      if (!card) return;
      const rot = this.docked ? [-2, 1.5, -1][i] : DESKTOP_SLOTS[i].rot;
      card.style.transform = `translate3d(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px, 0) rotate(${rot}deg)`;
      const tx = Math.max(r.x, Math.min(pin.x, r.x + r.w));
      const ty = Math.max(r.y, Math.min(pin.y, r.y + r.h));
      const dx = tx - pin.x;
      const dy = ty - pin.y;
      const len = Math.hypot(dx, dy) || 1;
      const sx = pin.x + (dx / len) * 12;
      const sy = pin.y + (dy / len) * 12;
      this.links[i]?.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}`);
    });
  }

  private layoutCards(px: number, py: number, stop: number): Rect[] {
    const sizes = this.cardSizes[stop] ?? [];
    const s = this.safe;
    if (this.docked) {
      const total = sizes.reduce((a, b) => a + b.w, 0) + 10 * (sizes.length - 1);
      let x = (this.width - total) / 2;
      const bottom = s.y + s.h;
      return sizes.map((size) => {
        const r = { x, y: bottom - size.h, w: size.w, h: size.h };
        x += size.w + 10;
        return r;
      });
    }
    const [a, b, c] = sizes;
    const raw: Rect[] = [
      { x: px - a.w * 0.56, y: py - a.h - 64, w: a.w, h: a.h },
      { x: px + 44, y: py + 38, w: b.w, h: b.h },
      { x: px - c.w - 46, y: py + 4, w: c.w, h: c.h },
    ];
    return raw.map((r) => {
      const x = Math.min(Math.max(r.x, s.x), s.x + s.w - r.w);
      const y = Math.min(Math.max(r.y, s.y), s.y + s.h - r.h);
      const out = { x, y, w: r.w, h: r.h };
      if (px > out.x - 18 && px < out.x + out.w + 18 && py > out.y - 18 && py < out.y + out.h + 18) {
        out.x = px < out.x + out.w / 2 ? px + 30 : px - out.w - 30;
        out.x = Math.min(Math.max(out.x, s.x), s.x + s.w - out.w);
      }
      return out;
    });
  }
}
