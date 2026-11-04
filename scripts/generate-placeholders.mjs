import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', 'public', 'images', 'placeholders');

const C = {
  blue: '#005384',
  blueD: '#003a5e',
  blueDD: '#002a43',
  blueN: '#001b2e',
  blueM: '#2c7db0',
  blueL: '#8db8d2',
  blueLL: '#c4d8e2',
  blueP: '#dfeaf0',
  sun: '#f2c14e',
  sunD: '#d9a21b',
  sunDD: '#a87610',
  sunL: '#f7d88a',
  sunLL: '#fbedc6',
  cream: '#f2ebe2',
  paper: '#faf7f2',
  white: '#ffffff',
  stone: '#e4d6bf',
  stoneD: '#c9b593',
  rock: '#cdb89a',
  rockD: '#a88f6e',
  olive: '#636b2f',
  oliveD: '#4b5124',
  sage: '#98a869',
  brown: '#6f4e37',
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(r, n) {
  const pts = Array.from({ length: n + 2 }, () => r());
  return (u) => {
    const x = Math.max(0, Math.min(0.9999, u)) * n;
    const i = Math.floor(x);
    const f = x - i;
    const t = f * f * (3 - 2 * f);
    return pts[i] * (1 - t) + pts[i + 1] * t;
  };
}

const f1 = (n) => Number(n.toFixed(1));

class Scene {
  constructor(w, h, seed) {
    this.w = w;
    this.h = h;
    this.r = rng(seed);
    this.defs = [];
    this.body = [];
    this.uid = 0;
  }
  id(prefix) {
    return `${prefix}${++this.uid}`;
  }
  linear(stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) {
    const id = this.id('g');
    const s = stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
    this.defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${s}</linearGradient>`);
    return `url(#${id})`;
  }
  radial(stops, { cx = 0.5, cy = 0.5, r = 0.5 } = {}) {
    const id = this.id('r');
    const s = stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
    this.defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${s}</radialGradient>`);
    return `url(#${id})`;
  }
  clip(d) {
    const id = this.id('c');
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return `url(#${id})`;
  }
  add(s) {
    this.body.push(s);
    return this;
  }
  rect(x, y, w, h, fill, extra = '') {
    return this.add(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}" ${extra}/>`);
  }
  path(d, fill, extra = '') {
    return this.add(`<path d="${d}" fill="${fill}" ${extra}/>`);
  }
  circle(cx, cy, r, fill, extra = '') {
    return this.add(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${fill}" ${extra}/>`);
  }
  toString(title) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${title}"><title>${title}</title><defs>${this.defs.join('')}</defs>${this.body.join('')}</svg>\n`;
  }
}

const SKIES = {
  day: [
    [0, '#8fbad3'],
    [0.55, '#cfe1ea'],
    [1, '#f6f0e4'],
  ],
  golden: [
    [0, '#9fc2d6'],
    [0.5, '#f3dfae'],
    [1, '#f7d88a'],
  ],
  dusk: [
    [0, '#002a43'],
    [0.45, '#2c6f9e'],
    [0.8, '#d9b77a'],
    [1, '#f7d88a'],
  ],
  night: [
    [0, '#001b2e'],
    [1, '#0b4670'],
  ],
};

function sky(s, kind, horizon) {
  s.rect(0, 0, s.w, horizon + 4, s.linear(SKIES[kind]));
  if (kind === 'night') stars(s, 140, horizon);
}

function sun(s, x, y, r, color = C.sunL, glow = C.sunLL) {
  s.circle(x, y, r * 3.2, s.radial([
    [0, glow, 0.85],
    [1, glow, 0],
  ]));
  s.circle(x, y, r, color);
}

function stars(s, n, maxY) {
  for (let i = 0; i < n; i++) {
    const r = s.r() * 1.6 + 0.4;
    s.circle(s.r() * s.w, s.r() * maxY * 0.9, r, C.sunLL, `opacity="${f1(0.35 + s.r() * 0.6)}"`);
  }
}

function ridge(s, { base, amp, fill, seed = 1, x0 = -10, x1 = null, bottom = null, step = 10, shape = null, detail = 1 }) {
  const r = rng(seed);
  const n1 = noise(r, 3);
  const n2 = noise(r, 8);
  const n3 = noise(r, 26);
  const end = x1 ?? s.w + 10;
  const b = bottom ?? s.h;
  let d = `M${x0} ${b}`;
  for (let x = x0; x <= end + step; x += step) {
    const u = (Math.min(x, end) - x0) / (end - x0);
    const env = shape ? shape(u) : 1;
    const v = n1(u) * 0.55 + n2(u) * 0.3 + n3(u) * 0.15 * detail;
    d += `L${f1(Math.min(x, end))} ${f1(base - amp * env * v)}`;
  }
  d += `L${end} ${b}Z`;
  s.path(d, fill);
  return d;
}

function sea(s, y, top, bottom, { sparkle = C.white, lines = 26, opacity = 0.35 } = {}) {
  s.rect(0, y, s.w, s.h - y, s.linear([
    [0, top],
    [1, bottom],
  ]));
  for (let i = 0; i < lines; i++) {
    const yy = y + 6 + Math.pow(s.r(), 1.6) * (s.h - y - 10);
    const len = 20 + s.r() * 90 * (1 + (yy - y) / (s.h - y));
    const x = s.r() * s.w;
    s.rect(x, yy, len, 1.6 + (yy - y) / (s.h - y) * 2, sparkle, `opacity="${f1(opacity * (0.4 + s.r() * 0.6))}" rx="1"`);
  }
}

function sunPath(s, x, y, w, color = C.sunL) {
  for (let i = 0; i < 18; i++) {
    const yy = y + 4 + i * 12 + s.r() * 6;
    const ww = w * (0.35 + s.r() * 0.65) * (1 + i * 0.05);
    s.rect(x - ww / 2 + (s.r() - 0.5) * 20, yy, ww, 2.4, color, `opacity="${f1(0.75 - i * 0.03)}" rx="1.2"`);
  }
}

function column(s, x, base, w, h, { fill = C.cream, shade = C.stoneD, capital = true, broken = 0, flutes = true }) {
  const top = base - h * (1 - broken);
  const tw = w * 0.86;
  const dx = (w - tw) / 2;
  if (broken > 0) {
    const j = h * 0.04;
    s.path(`M${f1(x)} ${f1(base)}L${f1(x + dx * (1 - broken))} ${f1(top + j)}L${f1(x + w * 0.35)} ${f1(top - j)}L${f1(x + w * 0.6)} ${f1(top + j * 0.4)}L${f1(x + w - dx * (1 - broken))} ${f1(top - j * 0.6)}L${f1(x + w)} ${f1(base)}Z`, fill);
  } else {
    s.path(`M${f1(x)} ${f1(base)}L${f1(x + dx)} ${f1(top)}L${f1(x + w - dx)} ${f1(top)}L${f1(x + w)} ${f1(base)}Z`, fill);
  }
  s.path(`M${f1(x + w * 0.62)} ${f1(base)}L${f1(x + w - dx * 1.1)} ${f1(top + 2)}L${f1(x + w - dx)} ${f1(top)}L${f1(x + w)} ${f1(base)}Z`, shade, 'opacity="0.55"');
  if (flutes && w > 10) {
    for (let k = 1; k < 4; k++) {
      const fx = x + (w * k) / 4;
      s.rect(fx - 0.6, top + 4, 1.2, base - top - 6, shade, 'opacity="0.35"');
    }
  }
  if (capital && !broken) {
    s.rect(x - w * 0.12, top - w * 0.16, w * 1.24, w * 0.16, fill);
    s.rect(x - w * 0.18, top - w * 0.3, w * 1.36, w * 0.15, fill);
    s.rect(x - w * 0.18, top - w * 0.18, w * 1.36, w * 0.03, shade, 'opacity="0.5"');
  }
  return top - (capital && !broken ? w * 0.3 : 0);
}

function temple(s, { x, base, w, cols, colH, fill = C.cream, shade = C.stoneD, ruined = [], pediment = true, roofH = null, steps = 3, restored = false, broken = {}, entab = true }) {
  const stepH = colH * 0.045;
  for (let i = 0; i < steps; i++) {
    const inset = i * stepH * 1.4;
    s.rect(x - stepH * 4 + inset, base - (i + 1) * stepH, w + stepH * 8 - inset * 2, stepH, i % 2 ? fill : C.paper);
    s.rect(x - stepH * 4 + inset, base - i * stepH - 1.5, w + stepH * 8 - inset * 2, 1.5, shade, 'opacity="0.6"');
  }
  const b = base - steps * stepH;
  const cw = w / (cols * 1.75 - 0.75);
  const gap = (w - cw * cols) / (cols - 1);
  let capTop = b - colH;
  for (let i = 0; i < cols; i++) {
    if (ruined.includes(i)) continue;
    const t = column(s, x + i * (cw + gap), b, cw, colH, { fill, shade, broken: broken[i] ?? 0 });
    if (!broken[i]) capTop = Math.min(capTop, t);
  }
  if (!entab) return { top: capTop };
  const archH = colH * 0.11;
  const friezeH = colH * 0.12;
  const corniceH = colH * 0.05;
  const ex = x - cw * 0.25;
  const ew = w + cw * 0.5;
  const archY = capTop - archH;
  s.rect(ex, archY, ew, archH, fill);
  s.rect(ex, archY + archH - 2, ew, 2, shade, 'opacity="0.55"');
  const friezeY = archY - friezeH;
  s.rect(ex, friezeY, ew, friezeH, restored ? C.blue : fill);
  const tri = Math.max(6, Math.round(ew / (cw * 0.75)));
  const tw = ew / tri;
  for (let i = 0; i < tri; i++) {
    if (restored) {
      s.rect(ex + i * tw + tw * 0.08, friezeY + 3, tw * 0.42, friezeH - 6, C.blueD);
      s.rect(ex + i * tw + tw * 0.56, friezeY + 3, tw * 0.38, friezeH - 6, C.sun, 'opacity="0.92"');
      s.rect(ex + i * tw + tw * 0.2, friezeY + 3, tw * 0.06, friezeH - 6, C.blueN, 'opacity="0.5"');
    } else {
      s.rect(ex + i * tw + tw * 0.1, friezeY + 3, tw * 0.36, friezeH - 6, shade, 'opacity="0.35"');
    }
  }
  const cornY = friezeY - corniceH;
  s.rect(ex - cw * 0.2, cornY, ew + cw * 0.4, corniceH, restored ? C.sun : fill);
  if (restored) s.rect(ex - cw * 0.2, cornY + corniceH - 3, ew + cw * 0.4, 3, C.blueD);
  if (pediment) {
    const ph = roofH ?? ew * 0.14;
    const px = ex - cw * 0.2;
    const pw = ew + cw * 0.4;
    s.path(`M${f1(px)} ${f1(cornY)}L${f1(px + pw / 2)} ${f1(cornY - ph)}L${f1(px + pw)} ${f1(cornY)}Z`, restored ? C.sun : fill);
    const inset = corniceH * 1.1;
    s.path(`M${f1(px + inset * 3)} ${f1(cornY - 1)}L${f1(px + pw / 2)} ${f1(cornY - ph + inset * 1.6)}L${f1(px + pw - inset * 3)} ${f1(cornY - 1)}Z`, restored ? C.blue : shade, restored ? '' : 'opacity="0.45"');
    return { top: cornY - ph, cornY, px, pw, ph, inset };
  }
  return { top: cornY, cornY };
}

function cypress(s, x, base, h, fill = C.oliveD) {
  const w = h * 0.16;
  s.path(`M${f1(x)} ${f1(base)}C${f1(x - w)} ${f1(base - h * 0.35)} ${f1(x - w * 0.6)} ${f1(base - h * 0.8)} ${f1(x)} ${f1(base - h)}C${f1(x + w * 0.6)} ${f1(base - h * 0.8)} ${f1(x + w)} ${f1(base - h * 0.35)} ${f1(x)} ${f1(base)}Z`, fill);
}

function olive(s, x, base, r, fill = C.sage, dark = C.olive) {
  s.rect(x - r * 0.08, base - r * 1.1, r * 0.16, r * 1.1, C.brown);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    s.circle(x + Math.cos(a) * r * 0.55, base - r * 1.45 + Math.sin(a) * r * 0.35, r * (0.45 + s.r() * 0.2), i % 2 ? fill : dark);
  }
  s.circle(x, base - r * 1.55, r * 0.55, fill);
}

function cube(s, x, base, w, h, { wall = C.white, side = '#d8e5ec', depth = 0.22, door = C.blue, windows = 1, win = C.blueD, roofDome = false, domeColor = C.blue } = {}) {
  const d = w * depth;
  s.path(`M${f1(x + w)} ${f1(base)}L${f1(x + w + d)} ${f1(base - d * 0.5)}L${f1(x + w + d)} ${f1(base - h - d * 0.5)}L${f1(x + w)} ${f1(base - h)}Z`, side);
  s.path(`M${f1(x)} ${f1(base - h)}L${f1(x + d)} ${f1(base - h - d * 0.5)}L${f1(x + w + d)} ${f1(base - h - d * 0.5)}L${f1(x + w)} ${f1(base - h)}Z`, C.paper);
  s.rect(x, base - h, w, h, wall);
  if (door) s.rect(x + w * 0.38, base - h * 0.42, w * 0.22, h * 0.42, door, 'rx="1.5"');
  for (let i = 0; i < windows; i++) s.rect(x + w * (0.12 + i * 0.6), base - h * 0.75, w * 0.18, h * 0.18, win, 'rx="1"');
  if (roofDome) dome(s, x + w / 2, base - h, w * 0.36, domeColor);
}

function dome(s, cx, y, r, fill = C.blue) {
  s.rect(cx - r * 0.95, y - r * 0.35, r * 1.9, r * 0.35, C.white);
  s.path(`M${f1(cx - r)} ${f1(y - r * 0.33)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(cx + r)} ${f1(y - r * 0.33)}Z`, fill);
  s.path(`M${f1(cx - r * 0.55)} ${f1(y - r * 0.6)}A${f1(r * 0.7)} ${f1(r * 0.7)} 0 0 1 ${f1(cx + r * 0.1)} ${f1(y - r * 1.2)}`, 'none', `stroke="${C.blueL}" stroke-width="${f1(r * 0.12)}" stroke-linecap="round" opacity="0.6"`);
  s.rect(cx - 1, y - r * 1.62, 2, r * 0.32, C.sunD);
  s.rect(cx - r * 0.12, y - r * 1.52, r * 0.24, 2, C.sunD);
}

function pillar(s, x, base, w, h, { fill = C.rock, shade = C.rockD, lean = 0, seed = 1 } = {}) {
  const r = rng(seed);
  const top = base - h;
  const d = `M${f1(x)} ${f1(base)}C${f1(x - w * 0.05)} ${f1(base - h * 0.5)} ${f1(x + w * 0.02 + lean)} ${f1(top + h * 0.12)} ${f1(x + w * 0.18 + lean)} ${f1(top + h * 0.03)}C${f1(x + w * 0.35 + lean)} ${f1(top - h * 0.02)} ${f1(x + w * 0.7 + lean)} ${f1(top - h * 0.02)} ${f1(x + w * 0.86 + lean)} ${f1(top + h * 0.05)}C${f1(x + w * 1.02 + lean)} ${f1(top + h * 0.2)} ${f1(x + w * 1.05)} ${f1(base - h * 0.5)} ${f1(x + w)} ${f1(base)}Z`;
  s.path(d, fill);
  const cp = s.clip(d);
  let g = `<g clip-path="${cp}">`;
  g += `<rect x="${f1(x + w * 0.62 + lean * 0.5)}" y="${f1(top)}" width="${f1(w * 0.5)}" height="${f1(h)}" fill="${shade}" opacity="0.45"/>`;
  for (let i = 0; i < 9; i++) {
    const sx = x + r() * w;
    g += `<rect x="${f1(sx)}" y="${f1(top + r() * h * 0.3)}" width="${f1(1.5 + r() * 2.5)}" height="${f1(h * (0.3 + r() * 0.6))}" fill="${shade}" opacity="${f1(0.25 + r() * 0.3)}"/>`;
  }
  for (let i = 0; i < 4; i++) {
    const yy = top + h * (0.25 + r() * 0.6);
    g += `<rect x="${f1(x - 5)}" y="${f1(yy)}" width="${f1(w + 10)}" height="${f1(2 + r() * 3)}" fill="${shade}" opacity="0.22"/>`;
  }
  s.add(`${g}</g>`);
  return { top, cx: x + w / 2 + lean };
}

function monastery(s, cx, top, w, { wall = C.cream, roof = C.brown, lit = false } = {}) {
  const h = w * 0.32;
  s.rect(cx - w / 2, top - h, w * 0.62, h, wall);
  s.path(`M${f1(cx - w / 2 - 4)} ${f1(top - h)}L${f1(cx - w / 2 + w * 0.31)} ${f1(top - h - w * 0.12)}L${f1(cx - w / 2 + w * 0.62 + 4)} ${f1(top - h)}Z`, roof);
  s.rect(cx + w * 0.12, top - h * 0.75, w * 0.38, h * 0.75, wall);
  s.path(`M${f1(cx + w * 0.1)} ${f1(top - h * 0.75)}L${f1(cx + w * 0.31)} ${f1(top - h * 0.75 - w * 0.09)}L${f1(cx + w * 0.52)} ${f1(top - h * 0.75)}Z`, roof);
  s.rect(cx - w * 0.04, top - h - w * 0.26, w * 0.1, w * 0.2, wall);
  s.path(`M${f1(cx - w * 0.06)} ${f1(top - h - w * 0.26)}L${f1(cx + w * 0.01)} ${f1(top - h - w * 0.33)}L${f1(cx + w * 0.08)} ${f1(top - h - w * 0.26)}Z`, roof);
  for (let i = 0; i < 4; i++) s.rect(cx - w / 2 + w * (0.07 + i * 0.13), top - h * 0.62, w * 0.05, h * 0.22, lit ? C.sun : C.blueD, 'rx="1"');
}

function windmill(s, x, base, h, { body = C.white, roof = C.sunDD, sail = C.cream, angle = 12 } = {}) {
  const w = h * 0.42;
  s.path(`M${f1(x - w / 2)} ${f1(base)}L${f1(x - w * 0.42)} ${f1(base - h)}L${f1(x + w * 0.42)} ${f1(base - h)}L${f1(x + w / 2)} ${f1(base)}Z`, body);
  s.path(`M${f1(x + w * 0.1)} ${f1(base)}L${f1(x + w * 0.18)} ${f1(base - h)}L${f1(x + w * 0.42)} ${f1(base - h)}L${f1(x + w / 2)} ${f1(base)}Z`, '#dbe6ec');
  s.path(`M${f1(x - w * 0.5)} ${f1(base - h)}L${f1(x)} ${f1(base - h - w * 0.55)}L${f1(x + w * 0.5)} ${f1(base - h)}Z`, roof);
  s.rect(x - w * 0.1, base - h * 0.3, w * 0.2, h * 0.3, C.blue, 'rx="2"');
  s.rect(x - w * 0.08, base - h * 0.72, w * 0.16, h * 0.14, C.blueD, 'rx="1"');
  const hx = x - w * 0.15;
  const hy = base - h * 0.95;
  const L = h * 0.95;
  let g = '';
  for (let i = 0; i < 8; i++) {
    const a = ((angle + i * 45) * Math.PI) / 180;
    const ex = hx + Math.cos(a) * L;
    const ey = hy + Math.sin(a) * L;
    g += `<line x1="${f1(hx)}" y1="${f1(hy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="${C.brown}" stroke-width="2.2"/>`;
    const a2 = a + 0.32;
    g += `<path d="M${f1(hx + Math.cos(a) * L * 0.25)} ${f1(hy + Math.sin(a) * L * 0.25)}L${f1(ex)} ${f1(ey)}L${f1(hx + Math.cos(a2) * L * 0.82)} ${f1(hy + Math.sin(a2) * L * 0.82)}Z" fill="${sail}" opacity="0.95"/>`;
  }
  s.add(g);
  s.circle(hx, hy, w * 0.08, C.brown);
}

function boat(s, x, y, w, { hull = C.white, stripe = C.blue, sail = true } = {}) {
  s.path(`M${f1(x)} ${f1(y)}L${f1(x + w)} ${f1(y)}L${f1(x + w * 0.86)} ${f1(y + w * 0.16)}L${f1(x + w * 0.12)} ${f1(y + w * 0.16)}Z`, hull);
  s.rect(x + w * 0.05, y + w * 0.04, w * 0.88, w * 0.035, stripe);
  if (sail) {
    s.rect(x + w * 0.48, y - w * 0.85, 2, w * 0.85, C.brown);
    s.path(`M${f1(x + w * 0.5)} ${f1(y - w * 0.8)}L${f1(x + w * 0.5)} ${f1(y - w * 0.06)}L${f1(x + w * 0.9)} ${f1(y - w * 0.06)}Z`, C.paper);
    s.path(`M${f1(x + w * 0.47)} ${f1(y - w * 0.7)}L${f1(x + w * 0.47)} ${f1(y - w * 0.06)}L${f1(x + w * 0.18)} ${f1(y - w * 0.06)}Z`, C.sunLL);
  }
}

function crenellated(s, x, base, w, h, { fill = C.stone, shade = C.stoneD, merlon = 16 } = {}) {
  s.rect(x, base - h, w, h, fill);
  const n = Math.floor(w / (merlon * 1.8));
  const gap = (w - n * merlon) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) s.rect(x + i * (merlon + gap), base - h - merlon * 0.8, merlon, merlon * 0.8, fill);
  for (let i = 0; i < 5; i++) s.rect(x, base - h + (h / 5) * i + 6, w, 1.4, shade, 'opacity="0.35"');
}

function tower(s, cx, base, w, h, { fill = C.stone, shade = C.stoneD } = {}) {
  s.rect(cx - w / 2, base - h, w, h, s.linear([
    [0, fill],
    [0.55, fill],
    [1, shade],
  ], { x2: 1, y2: 0 }));
  const n = 4;
  const mw = w / (n * 2 - 1);
  for (let i = 0; i < n; i++) s.rect(cx - w / 2 + i * mw * 2, base - h - mw * 0.9, mw, mw * 0.9, fill);
  s.rect(cx - w / 2 - 4, base - h, w + 8, 6, shade, 'opacity="0.5"');
  s.rect(cx - 3, base - h * 0.7, 6, h * 0.16, C.blueDD, 'opacity="0.7" rx="3"');
  s.rect(cx - 3, base - h * 0.4, 6, h * 0.12, C.blueDD, 'opacity="0.7" rx="3"');
}

function grain(s, opacity = 0.05) {
  const id = s.id('n');
  s.defs.push(`<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0.1  0 0 0 0 0.2  0 0 0 0.9 0"/></filter>`);
  s.rect(0, 0, s.w, s.h, '#000', `filter="url(#${id})" opacity="${opacity}"`);
}

function vignette(s, strength = 0.22) {
  s.rect(0, 0, s.w, s.h, s.radial([
    [0.55, C.blueN, 0],
    [1, C.blueN, strength],
  ], { r: 0.75 }));
}

const W = 1200;
const H = 900;

const scenes = {
  'athens-1'(s) {
    sky(s, 'golden', 620);
    sun(s, 905, 360, 70);
    ridge(s, { base: 600, amp: 120, fill: '#c3d3d6', seed: 11, shape: (u) => 0.5 + 0.5 * Math.sin(u * 3.2) });
    ridge(s, { base: 650, amp: 60, fill: '#d5cdb4', seed: 12 });
    const rockTop = 520;
    s.path(`M120 760C170 700 190 610 240 560C270 535 300 528 340 526L860 522C900 524 930 540 960 575C1000 625 1030 700 1080 760Z`, C.rock);
    s.path(`M760 523L860 522C900 524 930 540 960 575C1000 625 1030 700 1080 760L840 760C860 680 820 590 760 523Z`, C.rockD, 'opacity="0.55"');
    s.path(`M240 560C300 600 280 680 330 760L120 760C170 700 190 610 240 560Z`, C.rockD, 'opacity="0.35"');
    temple(s, { x: 370, base: rockTop + 2, w: 430, cols: 13, colH: 96, ruined: [6], broken: { 9: 0.35 }, roofH: 36, fill: C.paper, shade: C.stoneD });
    for (let i = 0; i < 9; i++) cypress(s, 160 + i * 26 + s.r() * 10, 760, 60 + s.r() * 50, i % 2 ? C.oliveD : C.olive);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 15; i++) {
        const w = 70 + s.r() * 40;
        const x = i * 86 - 40 + row * 30 + s.r() * 12;
        const base = 810 + row * 46;
        cube(s, x, base, w, 38 + s.r() * 18, { door: null, windows: 1, win: '#a9c6d8', side: row % 2 ? '#e6dccb' : '#dde7ec', wall: row % 2 ? C.cream : C.paper, depth: 0.14 });
      }
    }
    grain(s);
    vignette(s, 0.18);
  },
  'athens-2'(s) {
    sky(s, 'day', 600);
    ridge(s, { base: 560, amp: 110, fill: '#b4cbd6', seed: 21 });
    ridge(s, { base: 610, amp: 50, fill: C.sage, seed: 22, detail: 0.6 });
    s.rect(0, 640, W, H - 640, s.linear([
      [0, '#c9c38f'],
      [1, '#a9a36a'],
    ]));
    s.path(`M520 900C560 800 590 720 600 655L640 655C660 720 700 800 760 900Z`, C.stone);
    temple(s, { x: 330, base: 660, w: 540, cols: 6, colH: 230, fill: '#efe2c9', shade: '#c6ad84', broken: { 4: 0.02 } });
    for (let i = 0; i < 4; i++) olive(s, 70 + i * 70 + s.r() * 20, 760 + s.r() * 40, 46 + s.r() * 12);
    for (let i = 0; i < 4; i++) olive(s, 930 + i * 70 + s.r() * 20, 760 + s.r() * 40, 46 + s.r() * 12);
    cypress(s, 260, 690, 170);
    cypress(s, 950, 690, 150);
    grain(s);
    vignette(s, 0.16);
  },
  'athens-3'(s) {
    sky(s, 'dusk', 640);
    s.circle(1010, 190, 34, C.sunLL);
    ridge(s, { base: 640, amp: 90, fill: '#1d5a85', seed: 31 });
    s.path(`M560 700C640 620 700 420 760 330C775 310 790 310 805 330C860 420 930 610 1020 700Z`, C.blueDD);
    s.rect(772, 302, 26, 22, C.cream);
    dome(s, 785, 304, 12, C.cream);
    s.path(`M60 720C110 660 160 640 200 636L420 634C460 640 500 670 540 720Z`, C.blueD);
    temple(s, { x: 230, base: 636, w: 170, cols: 8, colH: 40, fill: C.sunL, shade: C.sunD, roofH: 16 });
    s.rect(0, 690, W, H - 690, C.blueDD);
    for (let row = 0; row < 7; row++) {
      for (let i = 0; i < 36; i++) {
        const x = i * 36 - 20 + s.r() * 12 + (row % 2) * 14;
        const y = 700 + row * 30 + s.r() * 8;
        const w = 22 + s.r() * 20;
        s.rect(x, y, w, 24, row % 2 ? '#05314f' : '#0a3b5e');
        if (s.r() > 0.35) s.rect(x + 4 + s.r() * (w - 10), y + 6, 4, 5, C.sun, `opacity="${f1(0.6 + s.r() * 0.4)}"`);
      }
    }
    grain(s, 0.06);
  },
  'delphi-1'(s) {
    sky(s, 'day', 560);
    ridge(s, { base: 470, amp: 220, fill: '#a9c2cf', seed: 41, shape: (u) => 0.4 + 0.6 * Math.sin(u * Math.PI * 0.9) });
    ridge(s, { base: 560, amp: 180, fill: '#8aa58f', seed: 42, shape: (u) => 0.5 + 0.5 * Math.cos(u * 2.4) });
    ridge(s, { base: 640, amp: 90, fill: C.sage, seed: 43 });
    s.rect(0, 700, W, H - 700, s.linear([
      [0, '#c8bf8c'],
      [1, '#a39a66'],
    ]));
    const cx = 600;
    const base = 740;
    for (let i = 0; i < 3; i++) s.add(`<ellipse cx="${cx}" cy="${base - i * 14}" rx="${330 - i * 24}" ry="${62 - i * 6}" fill="${i % 2 ? C.stone : C.paper}"/>`);
    s.add(`<ellipse cx="${cx}" cy="${base - 42}" rx="${262}" ry="${44}" fill="${C.stoneD}" opacity="0.35"/>`);
    const stumps = [
      [-230, 0.82],
      [-160, 0.9],
      [190, 0.86],
      [250, 0.94],
      [-60, 0.93],
    ];
    for (const [dx, b] of stumps) column(s, cx + dx, base - 34, 34, 230, { fill: C.cream, shade: C.stoneD, broken: b });
    const cols = [-110, -20, 70];
    let top = 0;
    for (const dx of cols) top = column(s, cx + dx, base - 34, 40, 250, { fill: C.cream, shade: C.stoneD });
    s.path(`M${cx - 130} ${top}L${cx + 130} ${top - 8}L${cx + 132} ${top - 46}L${cx - 128} ${top - 36}Z`, C.cream);
    s.path(`M${cx - 130} ${top - 22}L${cx + 131} ${top - 30}L${cx + 131} ${top - 26}L${cx - 130} ${top - 18}Z`, C.stoneD, 'opacity="0.5"');
    for (let i = 0; i < 6; i++) cypress(s, 70 + i * 34, 700, 110 + s.r() * 60);
    for (let i = 0; i < 5; i++) olive(s, 980 + i * 50, 730 + s.r() * 30, 40);
    grain(s);
    vignette(s, 0.16);
  },
  'delphi-2'(s) {
    sky(s, 'golden', 420);
    sun(s, 230, 230, 54);
    s.path(`M0 420L120 300L240 260L380 200L520 230L640 160L760 210L900 150L1040 220L1200 180L1200 900L0 900Z`, '#cdb08a');
    s.path(`M640 160L760 210L900 150L1040 220L1200 180L1200 520L620 520Z`, '#b3936b', 'opacity="0.6"');
    ridge(s, { base: 560, amp: 70, fill: '#9daa6c', seed: 51, detail: 0.5 });
    const cx = 600;
    const cy = 760;
    for (let i = 0; i < 12; i++) {
      const rx = 470 - i * 30;
      const ry = 290 - i * 19;
      s.path(`M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}Z`, i % 2 ? C.stone : C.paper);
      s.path(`M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`, 'none', `stroke="${C.stoneD}" stroke-width="1.4" opacity="0.6"`);
    }
    s.path(`M${cx - 110} ${cy}A110 64 0 0 1 ${cx + 110} ${cy}Z`, '#d8c7a4');
    s.rect(cx - 6, cy - 300, 12, 300, C.stoneD, 'opacity="0.35"');
    s.rect(0, cy, W, H - cy, s.linear([
      [0, '#bfae80'],
      [1, '#9a8a5c'],
    ]));
    temple(s, { x: 360, base: 880, w: 480, cols: 6, colH: 120, ruined: [1, 4], broken: { 2: 0.45, 5: 0.6 }, entab: false });
    for (let i = 0; i < 5; i++) cypress(s, 90 + i * 30, 880, 130 + s.r() * 50);
    grain(s);
    vignette(s, 0.18);
  },
  'delphi-3'(s) {
    sky(s, 'golden', 400);
    sun(s, 820, 330, 46);
    ridge(s, { base: 380, amp: 60, fill: '#a7bccb', seed: 61 });
    sea(s, 395, '#7fb0cf', '#5c97bf', { lines: 30, sparkle: C.sunLL, opacity: 0.6 });
    sunPath(s, 820, 396, 120);
    const layers = ['#a8b27a', '#909c5e', '#7c874c', '#636b2f'];
    layers.forEach((fill, i) => {
      const base = 520 + i * 110;
      ridge(s, { base, amp: 90 - i * 10, fill, seed: 62 + i, detail: 0.5 });
      for (let k = 0; k < 40 + i * 12; k++) {
        const x = s.r() * W;
        const y = base - 30 + s.r() * 110;
        s.circle(x, y, 6 + i * 3 + s.r() * 4, i % 2 ? C.oliveD : C.olive, 'opacity="0.85"');
      }
    });
    grain(s);
    vignette(s, 0.15);
  },
  'meteora-1'(s) {
    sky(s, 'day', 700);
    ridge(s, { base: 520, amp: 140, fill: '#b9ccd6', seed: 71 });
    pillar(s, 60, 900, 220, 420, { fill: '#d6c3a2', shade: '#b39d79', seed: 72 });
    pillar(s, 270, 900, 180, 330, { fill: '#cdb994', shade: '#ae976f', seed: 73 });
    const p = pillar(s, 560, 900, 420, 690, { fill: C.rock, shade: C.rockD, lean: -20, seed: 74 });
    monastery(s, p.cx + 10, p.top + 30, 300);
    ridge(s, { base: 900, amp: 90, fill: C.olive, seed: 75 });
    for (let i = 0; i < 12; i++) cypress(s, 40 + i * 100 + s.r() * 40, 900, 70 + s.r() * 50, C.oliveD);
    grain(s);
    vignette(s, 0.16);
  },
  'meteora-2'(s) {
    sky(s, 'golden', 900);
    sun(s, 700, 400, 64);
    const layers = [
      ['#c9d8df', [[-30, 210, 380], [290, 240, 430], [640, 220, 360], [960, 270, 420]]],
      ['#8db8d2', [[110, 230, 470], [470, 210, 560], [820, 260, 450]]],
      ['#2c6f9e', [[-80, 270, 340], [1010, 260, 370]]],
    ];
    let top = null;
    layers.forEach(([fill, ps], li) => {
      ps.forEach(([x, w, h], i) => {
        const p = pillar(s, x, 900, w, h, { fill, shade: li === 2 ? C.blueDD : C.blueM, lean: (i % 2 ? 1 : -1) * 8, seed: 800 + li * 10 + i });
        if (li === 1 && i === 1) top = p;
      });
      s.rect(0, 660 + li * 40, W, 200, s.linear([
        [0, C.white, 0],
        [0.5, C.white, 0.45 - li * 0.1],
        [1, C.white, 0],
      ]));
    });
    monastery(s, top.cx, top.top + 26, 150, { wall: C.paper, roof: C.blueD });
    grain(s);
  },
  'meteora-3'(s) {
    sky(s, 'night', 900);
    s.circle(920, 170, 46, C.sunLL);
    s.circle(940, 160, 40, '#05304f');
    const ps = [
      [40, 230, 520, 91],
      [300, 180, 430, 92],
      [520, 330, 640, 93],
      [880, 260, 520, 94],
    ];
    for (const [x, w, h, seed] of ps) pillar(s, x, 900, w, h, { fill: '#0b3a5e', shade: '#062c48', seed });
    monastery(s, 690, 900 - 640 + 30, 260, { wall: '#1d4f75', roof: '#0a3352', lit: true });
    monastery(s, 1010, 900 - 520 + 34, 160, { wall: '#1d4f75', roof: '#0a3352', lit: true });
    s.rect(0, 830, W, 70, '#03243d');
    for (let i = 0; i < 70; i++) s.circle(s.r() * W, 840 + s.r() * 55, 1.6 + s.r() * 1.8, C.sun, `opacity="${f1(0.5 + s.r() * 0.5)}"`);
    grain(s, 0.06);
  },
  'santorini-1'(s) {
    sky(s, 'day', 470);
    sea(s, 470, '#4f95c2', '#005384', { lines: 34 });
    s.path(`M0 380C120 400 220 430 300 470L1200 520L1200 900L0 900Z`, '#d9c3a0');
    s.path(`M0 520C200 560 300 620 380 700L520 900L0 900Z`, '#c8ad83', 'opacity="0.7"');
    const rows = [
      [520, 7, 0],
      [600, 8, 30],
      [690, 9, -10],
      [790, 10, 20],
    ];
    for (const [base, n, off] of rows)
      for (let i = 0; i < n; i++) {
        const w = 70 + s.r() * 50;
        const x = 380 + off + i * 92 - (base - 520) * 0.4 + s.r() * 12;
        cube(s, x, base, w, 54 + s.r() * 30, { windows: s.r() > 0.5 ? 2 : 1 });
      }
    cube(s, 610, 560, 120, 92, { windows: 0, door: C.blue });
    dome(s, 670, 468, 70);
    cube(s, 860, 650, 110, 80, { windows: 1 });
    dome(s, 915, 570, 58);
    cube(s, 470, 700, 90, 70, { windows: 0 });
    dome(s, 515, 630, 46);
    s.rect(780, 400, 46, 150, C.white);
    s.path(`M776 400L803 360L830 400Z`, C.blue);
    s.rect(791, 420, 24, 40, C.blueD, 'rx="12"');
    grain(s, 0.04);
    vignette(s, 0.14);
  },
  'santorini-2'(s) {
    sky(s, 'dusk', 560);
    sun(s, 420, 520, 72, C.sun, C.sunL);
    sea(s, 560, '#2c6f9e', '#002a43', { lines: 24, sparkle: C.sunL, opacity: 0.5 });
    sunPath(s, 420, 560, 170);
    s.path(`M0 560C120 540 210 548 300 562Z`, '#0a3352');
    s.path(`M560 562C640 530 720 520 800 545L840 562Z`, '#0a3352');
    s.path(`M760 900L780 640C820 560 900 470 1000 430C1080 400 1150 400 1200 410L1200 900Z`, '#0d3a5c');
    for (let i = 0; i < 18; i++) s.rect(840 + i * 20 + s.r() * 6, 455 - (i < 9 ? i * 3 : 27) + s.r() * 6, 14, 12, C.cream, 'opacity="0.9"');
    for (let i = 0; i < 18; i++) s.rect(845 + i * 20, 462 - (i < 9 ? i * 3 : 27), 3, 3, C.sun);
    boat(s, 240, 690, 120, { hull: C.paper, stripe: C.sun });
    grain(s, 0.06);
  },
  'santorini-3'(s) {
    sky(s, 'golden', 560);
    sun(s, 230, 420, 50);
    sea(s, 560, '#5c97bf', '#005384', { lines: 28, sparkle: C.sunLL, opacity: 0.55 });
    s.path(`M-20 900L-20 650C200 620 420 600 620 610C800 620 1000 660 1220 640L1220 900Z`, '#d8c09a');
    s.path(`M-20 720C300 700 600 700 1220 720L1220 900L-20 900Z`, '#c4a77c', 'opacity="0.5"');
    windmill(s, 640, 640, 240, { angle: 18 });
    for (let i = 0; i < 5; i++) cube(s, 820 + i * 74, 700 + s.r() * 10, 64, 52 + s.r() * 18);
    cube(s, 160, 690, 90, 70);
    dome(s, 205, 620, 40);
    grain(s, 0.04);
    vignette(s, 0.16);
  },
  'crete-1'(s) {
    sky(s, 'day', 560);
    ridge(s, { base: 520, amp: 150, fill: '#b4c8cf', seed: 101 });
    ridge(s, { base: 590, amp: 80, fill: '#a5ad74', seed: 102 });
    s.rect(0, 640, W, H - 640, s.linear([
      [0, '#d5c59b'],
      [1, '#b9a576'],
    ]));
    const base = 760;
    s.rect(230, base, 740, 22, C.stone);
    s.rect(210, base + 22, 780, 22, C.paper);
    s.rect(250, 380, 700, 380, '#e8d9bd');
    s.rect(250, 380, 700, 26, C.cream);
    s.rect(250, 406, 700, 18, C.blue);
    for (let i = 0; i < 24; i++) s.circle(268 + i * 28.5, 415, 6, C.sun);
    s.rect(300, 430, 600, 330, '#d6ad73');
    s.rect(300, 430, 600, 40, '#b98d55', 'opacity="0.6"');
    s.rect(300, 560, 600, 34, C.blue, 'opacity="0.85"');
    for (let i = 0; i < 20; i++) s.path(`M${310 + i * 30} 594L${325 + i * 30} 566L${340 + i * 30} 594Z`, C.sun, 'opacity="0.9"');
    for (const dx of [405, 555, 705]) s.rect(dx, 610, 50, 150, '#8a6440', 'rx="2"');
    const xs = [330, 480, 630, 780];
    for (const x of xs) {
      s.path(`M${x} ${base}L${x - 8} 470L${x + 70} 470L${x + 62} ${base}Z`, C.brown);
      s.path(`M${x + 40} ${base}L${x + 44} 470L${x + 70} 470L${x + 62} ${base}Z`, '#4f3524', 'opacity="0.6"');
      s.rect(x - 18, 446, 98, 24, C.blueDD, 'rx="10"');
      s.rect(x - 22, 432, 106, 14, C.blueD);
    }
    s.path(`M440 380L440 330C440 310 470 310 470 330L470 350L530 350L530 330C530 310 560 310 560 330L560 380Z`, C.cream);
    s.path(`M640 380L640 330C640 310 670 310 670 330L670 350L730 350L730 330C730 310 760 310 760 330L760 380Z`, C.cream);
    for (let i = 0; i < 4; i++) olive(s, 80 + i * 40, 820, 38);
    for (let i = 0; i < 4; i++) cypress(s, 1030 + i * 40, 790, 120 + s.r() * 40);
    grain(s);
    vignette(s, 0.16);
  },
  'crete-2'(s) {
    s.rect(0, 0, W, H, s.linear([
      [0, '#2c7db0'],
      [1, '#005384'],
    ], { x2: 1, y2: 1 }));
    s.path(`M0 0L560 0C520 140 560 300 700 380C860 470 1000 460 1200 520L1200 0Z`, '#c8ad83');
    s.path(`M0 0L420 0C380 120 420 260 560 340C700 420 900 430 1200 470L1200 520C1000 460 860 470 700 380C560 300 520 140 560 0`, '#a98d64', 'opacity="0.6"');
    s.path(`M0 220C200 300 380 420 520 560C640 680 820 760 1200 760L1200 900L0 900Z`, '#9fd3de');
    s.path(`M0 300C220 380 380 500 500 620C620 740 840 820 1200 820L1200 900L0 900Z`, '#7fc2d6');
    s.path(`M80 900C160 760 260 640 420 560C560 490 700 470 860 520C760 520 620 560 520 640C420 720 340 800 300 900Z`, C.paper);
    s.path(`M300 900C340 800 420 720 520 640C600 580 700 540 800 528C700 560 600 620 540 700C480 780 450 840 440 900Z`, C.sunLL, 'opacity="0.8"');
    s.path(`M860 520C900 500 960 500 1000 520C960 560 900 560 860 520Z`, '#a98d64');
    for (let i = 0; i < 40; i++) s.rect(s.r() * W, 560 + s.r() * 340, 20 + s.r() * 50, 2, C.white, `opacity="${f1(0.25 + s.r() * 0.3)}" rx="1"`);
    boat(s, 940, 660, 70, { sail: false, hull: C.white, stripe: C.blue });
    boat(s, 1040, 720, 60, { sail: false, hull: C.white, stripe: C.sun });
    grain(s, 0.04);
    vignette(s, 0.14);
  },
  'crete-3'(s) {
    sky(s, 'golden', 520);
    sun(s, 980, 360, 56);
    sea(s, 520, '#5c97bf', '#003a5e', { lines: 30, sparkle: C.sunLL, opacity: 0.55 });
    sunPath(s, 980, 520, 110);
    s.path(`M-20 640C200 600 420 590 620 560C700 548 760 540 820 540L830 566C760 570 700 578 630 590C430 620 220 640 -20 680Z`, C.stone);
    s.path(`M-20 668C220 632 430 610 630 584L830 562L832 572C760 578 700 586 630 598C430 628 220 652 -20 690Z`, C.stoneD, 'opacity="0.6"');
    s.path(`M786 545L796 330L838 330L848 545Z`, C.cream);
    s.path(`M818 545L826 330L838 330L848 545Z`, C.stoneD, 'opacity="0.5"');
    s.rect(780, 318, 74, 14, C.stone);
    s.rect(796, 280, 42, 38, C.sunL);
    s.circle(817, 299, 26, s.radial([
      [0, C.sunLL, 0.9],
      [1, C.sunLL, 0],
    ]));
    s.path(`M792 280L817 256L842 280Z`, C.blueD);
    const colors = [C.sunL, C.cream, C.blueLL, C.sunLL, C.white, '#e8c98f'];
    for (let i = 0; i < 9; i++) {
      const w = 70 + s.r() * 30;
      cube(s, -20 + i * 82, 900, w, 150 + s.r() * 90, { wall: colors[i % colors.length], side: '#d9cdb8', windows: 2, door: C.blue, depth: 0.1 });
    }
    boat(s, 360, 690, 90, { hull: C.white, stripe: C.blue });
    boat(s, 520, 720, 80, { hull: C.paper, stripe: C.sun, sail: false });
    grain(s, 0.04);
    vignette(s, 0.16);
  },
  'rhodes-1'(s) {
    sky(s, 'day', 700);
    s.rect(0, 700, W, H - 700, s.linear([
      [0, '#c3ba86'],
      [1, '#9d9461'],
    ]));
    crenellated(s, -10, 720, 1220, 240, { merlon: 22 });
    tower(s, 470, 720, 170, 400);
    tower(s, 730, 720, 170, 400);
    s.path(`M555 720L555 560C555 520 645 520 645 560L645 720Z`, C.blueDD, 'opacity="0.85"');
    s.rect(548, 500, 104, 20, C.stoneD);
    s.rect(560, 480, 80, 20, C.stone);
    tower(s, 110, 720, 120, 320);
    tower(s, 1090, 720, 120, 320);
    s.rect(0, 720, W, 30, C.stoneD, 'opacity="0.5"');
    for (let i = 0; i < 3; i++) {
      const x = 260 + i * 330;
      s.rect(x - 4, 640, 8, 120, C.brown);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI - Math.PI;
        s.path(`M${x} 640Q${f1(x + Math.cos(a) * 60)} ${f1(640 + Math.sin(a) * 50)} ${f1(x + Math.cos(a) * 95)} ${f1(660 + Math.sin(a) * 10)}`, 'none', `stroke="${k % 2 ? C.olive : C.sage}" stroke-width="10" stroke-linecap="round"`);
      }
    }
    grain(s);
    vignette(s, 0.16);
  },
  'rhodes-2'(s) {
    sky(s, 'day', 480);
    sea(s, 480, '#5aa6cf', '#005384', { lines: 30 });
    s.path(`M0 650C140 600 300 590 420 620C460 640 470 700 440 760L0 760Z`, '#9fd3de', 'opacity="0.7"');
    s.path(`M560 900L600 520C640 380 720 280 840 250C940 228 1060 240 1200 260L1200 900Z`, '#c9ad80');
    s.path(`M900 250C1000 240 1100 246 1200 262L1200 900L980 900C1000 700 960 420 900 250Z`, '#a98d64', 'opacity="0.6"');
    crenellated(s, 700, 290, 440, 60, { merlon: 14 });
    temple(s, { x: 820, base: 232, w: 220, cols: 7, colH: 80, ruined: [], steps: 2, roofH: 22, fill: C.paper, entab: false });
    for (let row = 0; row < 5; row++)
      for (let i = 0; i < 8 - row; i++) cube(s, 600 + row * 30 + i * 70 + s.r() * 10, 640 + row * 60, 56 + s.r() * 24, 40 + s.r() * 16);
    s.path(`M0 760C160 740 320 760 470 800L520 900L0 900Z`, C.sunLL);
    boat(s, 240, 560, 90);
    grain(s, 0.04);
    vignette(s, 0.14);
  },
  'rhodes-3'(s) {
    sky(s, 'golden', 520);
    sun(s, 200, 380, 52);
    sea(s, 520, '#5c97bf', '#003a5e', { lines: 34, sparkle: C.sunLL, opacity: 0.55 });
    s.path(`M80 600L1120 560L1140 610L60 660Z`, C.stone);
    s.path(`M60 640L1140 594L1140 610L60 660Z`, C.stoneD, 'opacity="0.6"');
    windmill(s, 330, 615, 150, { angle: 5 });
    windmill(s, 560, 606, 150, { angle: 25 });
    windmill(s, 790, 597, 150, { angle: 40 });
    tower(s, 1060, 580, 120, 160);
    s.circle(1060, 380, 18, C.sunL);
    for (let i = 0; i < 5; i++) boat(s, 120 + i * 200 + s.r() * 50, 730 + s.r() * 80, 90 + s.r() * 30, { hull: i % 2 ? C.paper : C.white, stripe: i % 2 ? C.sun : C.blue, sail: i % 2 === 0 });
    grain(s, 0.04);
    vignette(s, 0.16);
  },
};

function statue(s, x, base, h, dir) {
  const w = h * 0.34;
  const fill = C.paper;
  s.path(`M${f1(x - w / 2)} ${f1(base)}L${f1(x - w * 0.3)} ${f1(base - h * 0.6)}Q${f1(x)} ${f1(base - h * 0.78)} ${f1(x + w * 0.3)} ${f1(base - h * 0.6)}L${f1(x + w / 2)} ${f1(base)}Z`, fill);
  s.path(`M${f1(x - w * 0.18)} ${f1(base)}L${f1(x - w * 0.08)} ${f1(base - h * 0.5)}`, 'none', `stroke="${C.stoneD}" stroke-width="1.5" opacity="0.6"`);
  s.path(`M${f1(x + w * 0.15)} ${f1(base)}L${f1(x + w * 0.06)} ${f1(base - h * 0.45)}`, 'none', `stroke="${C.stoneD}" stroke-width="1.5" opacity="0.6"`);
  s.circle(x, base - h * 0.84, h * 0.095, fill);
  s.path(`M${f1(x + dir * w * 0.2)} ${f1(base - h * 0.62)}L${f1(x + dir * w * 0.8)} ${f1(base - h * 0.42)}`, 'none', `stroke="${fill}" stroke-width="${f1(h * 0.075)}" stroke-linecap="round"`);
}

function reclining(s, x, base, len, dir) {
  const fill = C.paper;
  const h = len * 0.2;
  s.path(`M${f1(x - (dir * len) / 2)} ${f1(base)}Q${f1(x)} ${f1(base - h * 1.4)} ${f1(x + (dir * len) / 2)} ${f1(base - h * 0.4)}L${f1(x + (dir * len) / 2)} ${f1(base)}Z`, fill);
  s.circle(x + (dir * len) / 2 - dir * h * 0.2, base - h * 1.1, h * 0.5, fill);
}

function parthenon(s, restored) {
  sky(s, 'day', 700);
  if (!restored) {
    s.path(`M940 700L940 210L952 210L952 700Z`, C.sunD);
    s.path(`M946 210L1180 210L1180 222L946 222Z`, C.sunD);
    for (let i = 0; i < 12; i++) s.path(`M${960 + i * 18} 210L${969 + i * 18} 222`, 'none', `stroke="${C.sunDD}" stroke-width="2"`);
    s.path(`M1150 222L1150 330`, 'none', `stroke="${C.blueDD}" stroke-width="2"`);
    s.rect(1140, 330, 20, 14, C.blueDD);
    for (let i = 0; i < 22; i++) s.path(`M940 ${230 + i * 21}L952 ${242 + i * 21}`, 'none', `stroke="${C.sunDD}" stroke-width="2"`);
  }
  s.path(`M0 700C200 690 400 684 600 684C800 684 1000 690 1200 700L1200 900L0 900Z`, '#d7c49d');
  s.rect(0, 760, W, 140, s.linear([
    [0, '#cdb88d'],
    [1, '#b39d72'],
  ]));
  const fill = restored ? '#f4ead8' : '#e6dac3';
  const shade = restored ? '#d5c19c' : '#bfae8c';
  const t = temple(s, { x: 220, base: 720, w: 760, cols: 8, colH: 300, fill, shade, restored, pediment: restored, roofH: 120 });
  if (!restored) {
    const y = t.cornY;
    s.path(`M190 ${y}L330 ${y - 50}L360 ${y - 40}L380 ${y}Z`, fill);
    s.path(`M840 ${y}L870 ${y - 46}L940 ${y - 24}L1010 ${y}Z`, fill);
    s.rect(420, y - 6, 140, 8, C.paper);
    for (let i = 0; i < 9; i++) s.rect(150 + s.r() * 900, 760 + s.r() * 70, 30 + s.r() * 60, 18 + s.r() * 20, i % 2 ? C.stone : C.stoneD, 'rx="3"');
  } else {
    const { px, pw, ph, cornY } = t;
    const base = cornY - 6;
    const figures = [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73, 0.2, 0.8];
    for (const u of figures) {
      const avail = (ph - 14) * (1 - Math.abs(u - 0.5) * 2) - 6;
      const fx = px + pw * u;
      statue(s, fx, base, avail * (u === 0.5 ? 0.98 : 0.92), u < 0.5 ? -1 : 1);
    }
    reclining(s, px + pw * 0.11, base, 74, 1);
    reclining(s, px + pw * 0.89, base, 74, -1);
    s.path(`M${f1(px + pw / 2 - 16)} ${f1(cornY - ph - 4)}L${f1(px + pw / 2)} ${f1(cornY - ph - 34)}L${f1(px + pw / 2 + 16)} ${f1(cornY - ph - 4)}Z`, C.sunD);
    s.path(`M${f1(px - 6)} ${f1(cornY)}L${f1(px + 10)} ${f1(cornY - 34)}L${f1(px + 26)} ${f1(cornY)}Z`, C.sunD);
    s.path(`M${f1(px + pw - 26)} ${f1(cornY)}L${f1(px + pw - 10)} ${f1(cornY - 34)}L${f1(px + pw + 6)} ${f1(cornY)}Z`, C.sunD);
    const archY = cornY + 300 * 0.05 + 300 * 0.12;
    for (let i = 0; i < 8; i++) s.circle(250 + i * 100, archY + 15, 11, C.sun, `stroke="${C.sunDD}" stroke-width="2"`);
    for (let i = 0; i < 26; i++) s.rect(180 + i * 33, cornY - 3, 10, 8, C.blueD);
  }
  grain(s, 0.04);
}

const titles = {
  'athens-1': 'Placeholder: the Parthenon at golden hour',
  'athens-2': 'Placeholder: Temple of Hephaestus in the Ancient Agora',
  'athens-3': 'Placeholder: Lycabettus Hill at dusk',
  'delphi-1': 'Placeholder: Tholos of Athena Pronaia',
  'delphi-2': 'Placeholder: the ancient theatre of Delphi',
  'delphi-3': 'Placeholder: olive groves running down to the sea',
  'meteora-1': 'Placeholder: monastery on a Meteora pillar',
  'meteora-2': 'Placeholder: Meteora pillars at sunrise',
  'meteora-3': 'Placeholder: Meteora at night',
  'santorini-1': 'Placeholder: blue domes of Oia',
  'santorini-2': 'Placeholder: sunset over the caldera',
  'santorini-3': 'Placeholder: windmill above the caldera',
  'crete-1': 'Placeholder: Palace of Knossos',
  'crete-2': 'Placeholder: Balos lagoon',
  'crete-3': 'Placeholder: Chania harbour lighthouse',
  'rhodes-1': 'Placeholder: walls of Rhodes Old Town',
  'rhodes-2': 'Placeholder: Acropolis of Lindos',
  'rhodes-3': 'Placeholder: windmills of Mandraki harbour',
};

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  let seed = 1;
  for (const [name, draw] of Object.entries(scenes)) {
    const s = new Scene(W, H, seed++ * 7919);
    draw(s);
    await fs.writeFile(path.join(OUT, `${name}.svg`), s.toString(titles[name]));
  }
  for (const [name, restored] of [
    ['ar-today', false],
    ['ar-reconstructed', true],
  ]) {
    const s = new Scene(W, H, 4242);
    parthenon(s, restored);
    await fs.writeFile(path.join(OUT, `${name}.svg`), s.toString(restored ? 'Placeholder: Parthenon reconstructed in AR' : 'Placeholder: Parthenon today'));
  }
  const files = await fs.readdir(OUT);
  console.log(`Wrote ${files.length} placeholders to public/images/placeholders`);
}

main();
