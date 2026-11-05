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

function bridge(s, deckY, x0, x1, pylons, { color = C.cream, cable = C.paper } = {}) {
  const span = (x1 - x0) / (pylons + 1);
  for (let i = 1; i <= pylons; i++) {
    const px = x0 + span * i;
    const top = deckY - 200;
    let g = '';
    for (let k = 1; k <= 10; k++) {
      const off = span * 0.47 * (k / 10);
      const ty = top + 10 + k * 5;
      g += `<line x1="${f1(px)}" y1="${f1(ty)}" x2="${f1(px - off)}" y2="${deckY}" stroke="${cable}" stroke-width="1.5" opacity="0.8"/>`;
      g += `<line x1="${f1(px)}" y1="${f1(ty)}" x2="${f1(px + off)}" y2="${deckY}" stroke="${cable}" stroke-width="1.5" opacity="0.8"/>`;
    }
    s.add(g);
    s.path(`M${f1(px - 20)} ${deckY + 64}L${f1(px - 4)} ${top}L${f1(px + 4)} ${top}L${f1(px + 20)} ${deckY + 64}L${f1(px + 11)} ${deckY + 64}L${f1(px)} ${deckY - 46}L${f1(px - 11)} ${deckY + 64}Z`, color);
    s.rect(px - 28, deckY + 64, 56, 26, C.stoneD);
  }
  s.rect(x0 - 60, deckY - 6, x1 - x0 + 120, 12, color);
  s.rect(x0 - 60, deckY + 6, x1 - x0 + 120, 4, C.stoneD, 'opacity="0.6"');
}

function church(s, cx, base, w) {
  const h = w * 0.4;
  s.rect(cx - w / 2, base - h, w, h, C.cream);
  s.rect(cx - w / 2, base - h, w, w * 0.025, C.paper);
  for (let i = 0; i < 9; i++) {
    const x = cx - w / 2 + w * 0.065 + i * w * 0.1;
    const r = w * 0.022;
    s.path(`M${f1(x)} ${f1(base - h * 0.2)}V${f1(base - h * 0.62)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(x + r * 2)} ${f1(base - h * 0.62)}V${f1(base - h * 0.2)}Z`, C.blueD, 'opacity="0.85"');
  }
  s.path(`M${f1(cx - w * 0.07)} ${base}V${f1(base - h * 0.5)}A${f1(w * 0.07)} ${f1(w * 0.07)} 0 0 1 ${f1(cx + w * 0.07)} ${f1(base - h * 0.5)}V${base}Z`, C.blueDD, 'opacity="0.85"');
  for (const dx of [-0.38, 0.38]) dome(s, cx + dx * w, base - h, w * 0.07, C.blue);
  const dy = base - h - w * 0.13;
  s.rect(cx - w * 0.17, dy, w * 0.34, w * 0.13, C.cream);
  for (let i = 0; i < 6; i++) s.rect(cx - w * 0.15 + i * w * 0.055, dy + w * 0.035, w * 0.025, w * 0.06, C.blueD, 'rx="3" opacity="0.8"');
  s.path(`M${f1(cx - w * 0.19)} ${f1(dy)}A${f1(w * 0.19)} ${f1(w * 0.2)} 0 0 1 ${f1(cx + w * 0.19)} ${f1(dy)}Z`, C.blue);
  s.path(`M${f1(cx - w * 0.11)} ${f1(dy - w * 0.07)}A${f1(w * 0.13)} ${f1(w * 0.13)} 0 0 1 ${f1(cx + w * 0.02)} ${f1(dy - w * 0.17)}`, 'none', `stroke="${C.blueL}" stroke-width="${f1(w * 0.012)}" stroke-linecap="round" opacity="0.6"`);
  s.rect(cx - 2, dy - w * 0.26, 4, w * 0.07, C.sunD);
  s.rect(cx - w * 0.02, dy - w * 0.24, w * 0.04, 4, C.sunD);
}

function turtle(s, cx, cy, size, angle = -12) {
  const sh = '#7a5a32';
  const fl = '#8f7a4c';
  let g = `<g transform="translate(${f1(cx)} ${f1(cy)}) rotate(${angle})">`;
  g += `<ellipse cx="${f1(-size * 0.42)}" cy="${f1(-size * 0.5)}" rx="${f1(size * 0.46)}" ry="${f1(size * 0.13)}" fill="${fl}" transform="rotate(-38 ${f1(-size * 0.42)} ${f1(-size * 0.5)})"/>`;
  g += `<ellipse cx="${f1(-size * 0.42)}" cy="${f1(size * 0.5)}" rx="${f1(size * 0.46)}" ry="${f1(size * 0.13)}" fill="${fl}" transform="rotate(38 ${f1(-size * 0.42)} ${f1(size * 0.5)})"/>`;
  g += `<ellipse cx="${f1(size * 0.55)}" cy="${f1(-size * 0.32)}" rx="${f1(size * 0.22)}" ry="${f1(size * 0.09)}" fill="${fl}" transform="rotate(30 ${f1(size * 0.55)} ${f1(-size * 0.32)})"/>`;
  g += `<ellipse cx="${f1(size * 0.55)}" cy="${f1(size * 0.32)}" rx="${f1(size * 0.22)}" ry="${f1(size * 0.09)}" fill="${fl}" transform="rotate(-30 ${f1(size * 0.55)} ${f1(size * 0.32)})"/>`;
  g += `<ellipse cx="${f1(-size * 0.86)}" cy="0" rx="${f1(size * 0.2)}" ry="${f1(size * 0.16)}" fill="${fl}"/>`;
  g += `<circle cx="${f1(-size * 0.95)}" cy="${f1(-size * 0.06)}" r="${f1(size * 0.025)}" fill="${C.blueN}"/>`;
  g += `<ellipse cx="0" cy="0" rx="${f1(size * 0.66)}" ry="${f1(size * 0.5)}" fill="${sh}"/>`;
  g += `<ellipse cx="${f1(-size * 0.04)}" cy="${f1(-size * 0.06)}" rx="${f1(size * 0.56)}" ry="${f1(size * 0.4)}" fill="#946c3c"/>`;
  const cells = [
    [-0.3, 0], [0, 0], [0.28, 0], [-0.15, -0.24], [0.15, -0.24], [-0.15, 0.24], [0.15, 0.24],
  ];
  for (const [x, y] of cells) g += `<ellipse cx="${f1(x * size)}" cy="${f1(y * size)}" rx="${f1(size * 0.13)}" ry="${f1(size * 0.1)}" fill="none" stroke="#5e4424" stroke-width="${f1(size * 0.025)}" opacity="0.7"/>`;
  g += '</g>';
  s.add(g);
}

function fish(s, x, y, size, fill = C.sunL) {
  s.path(`M${f1(x)} ${f1(y)}C${f1(x + size * 0.4)} ${f1(y - size * 0.35)} ${f1(x + size)} ${f1(y - size * 0.2)} ${f1(x + size * 1.1)} ${f1(y)}C${f1(x + size)} ${f1(y + size * 0.2)} ${f1(x + size * 0.4)} ${f1(y + size * 0.35)} ${f1(x)} ${f1(y)}Z M${f1(x + size * 1.05)} ${f1(y)}L${f1(x + size * 1.45)} ${f1(y - size * 0.25)}L${f1(x + size * 1.4)} ${f1(y + size * 0.25)}Z`, fill, 'opacity="0.85"');
}

function archway(s, cx, base, w, h) {
  const r = w * 0.32;
  s.rect(cx - w / 2, base - h, w, h, C.stone);
  for (let i = 1; i < 7; i++) s.rect(cx - w / 2, base - h + (h / 7) * i, w, 1.6, C.stoneD, 'opacity="0.45"');
  const top = base - h * 0.82 + r;
  s.path(`M${f1(cx - r)} ${base}V${f1(top)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(cx + r)} ${f1(top)}V${base}Z`, s.linear([
    [0, '#2b2418'],
    [0.6, '#4a3f2c'],
    [1, '#2b2418'],
  ]));
  s.path(`M${f1(cx - r * 0.42)} ${base}V${f1(top + r * 0.45)}A${f1(r * 0.42)} ${f1(r * 0.42)} 0 0 1 ${f1(cx + r * 0.42)} ${f1(top + r * 0.45)}V${base}Z`, s.linear([
    [0, '#cfe1ea'],
    [0.55, '#f6f0e4'],
    [0.56, '#b9b06e'],
    [1, '#9da35a'],
  ]));
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (Math.PI * i) / 10;
    s.add(`<line x1="${f1(cx + Math.cos(a) * r)}" y1="${f1(top + Math.sin(a) * r)}" x2="${f1(cx + Math.cos(a) * (r + 26))}" y2="${f1(top + Math.sin(a) * (r + 26))}" stroke="${C.stoneD}" stroke-width="2" opacity="0.7"/>`);
  }
  s.path(`M${f1(cx - r - 26)} ${f1(top)}A${f1(r + 26)} ${f1(r + 26)} 0 0 1 ${f1(cx + r + 26)} ${f1(top)}`, 'none', `stroke="${C.stoneD}" stroke-width="2" opacity="0.7"`);
}

function pine(s, x, base, h, fill = C.oliveD) {
  s.path(`M${f1(x - 4)} ${base}C${f1(x - 2)} ${f1(base - h * 0.4)} ${f1(x + 8)} ${f1(base - h * 0.7)} ${f1(x + 4)} ${f1(base - h * 0.82)}L${f1(x + 10)} ${f1(base - h * 0.82)}C${f1(x + 14)} ${f1(base - h * 0.6)} ${f1(x + 6)} ${f1(base - h * 0.4)} ${f1(x + 6)} ${base}Z`, C.brown);
  const w = h * 0.55;
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    s.add(`<ellipse cx="${f1(x + 7 - w / 2 + w * t)}" cy="${f1(base - h * (0.86 + Math.sin(t * Math.PI) * 0.1))}" rx="${f1(w * 0.24)}" ry="${f1(h * 0.09)}" fill="${i % 2 ? fill : C.olive}"/>`);
  }
}

function towerHouse(s, x, base, w, h, { lit = false, fill = C.stone, shade = C.stoneD } = {}) {
  s.rect(x, base - h, w, h, fill);
  s.rect(x + w * 0.62, base - h, w * 0.38, h, shade, 'opacity="0.45"');
  for (let i = 1; i < 9; i++) s.rect(x, base - h + (h / 9) * i, w, 1.4, shade, 'opacity="0.4"');
  const n = 5;
  const mw = w / (n * 2 - 1);
  for (let i = 0; i < n; i++) s.rect(x + i * mw * 2, base - h - mw * 0.9, mw, mw * 0.9, fill);
  for (let i = 0; i < 6; i++) s.rect(x + w * 0.1 + i * w * 0.14, base - h + 4, w * 0.06, 10, shade, 'opacity="0.7"');
  const win = lit ? C.sun : '#3b3226';
  s.rect(x + w * 0.4, base - h * 0.78, w * 0.16, h * 0.08, win, 'rx="3"');
  s.rect(x + w * 0.18, base - h * 0.52, w * 0.13, h * 0.07, win, 'rx="3"');
  s.rect(x + w * 0.62, base - h * 0.52, w * 0.13, h * 0.07, win, 'rx="3"');
  s.path(`M${f1(x + w * 0.38)} ${base}V${f1(base - h * 0.16)}A${f1(w * 0.12)} ${f1(w * 0.12)} 0 0 1 ${f1(x + w * 0.62)} ${f1(base - h * 0.16)}V${base}Z`, '#3b3226');
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
  'patras-1'(s) {
    sky(s, 'golden', 560);
    sun(s, 900, 380, 58);
    ridge(s, { base: 560, amp: 120, fill: '#9fb4c0', seed: 201, shape: (u) => 0.6 + 0.4 * Math.sin(u * 2.4) });
    ridge(s, { base: 572, amp: 40, fill: '#7f9aa8', seed: 202 });
    sea(s, 570, '#5c97bf', '#003a5e', { lines: 30, sparkle: C.sunLL, opacity: 0.55 });
    sunPath(s, 900, 572, 120);
    bridge(s, 610, -60, 1260, 4);
    s.path(`M-20 900L-20 700C120 690 240 720 330 760C420 800 470 860 500 900Z`, '#c8ad83');
    for (let i = 0; i < 4; i++) cypress(s, 40 + i * 46, 770 + i * 8, 120 + s.r() * 40);
    grain(s, 0.04);
    vignette(s, 0.16);
  },
  'patras-2'(s) {
    sky(s, 'day', 680);
    ridge(s, { base: 600, amp: 90, fill: '#b9cbd4', seed: 211 });
    s.rect(0, 680, W, H - 680, s.linear([
      [0, '#e8dcc6'],
      [1, '#cdbb98'],
    ]));
    church(s, 600, 700, 760);
    for (const x of [90, 1110]) {
      s.rect(x - 5, 520, 10, 200, C.brown);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI - Math.PI;
        s.path(`M${x} 520Q${f1(x + Math.cos(a) * 70)} ${f1(520 + Math.sin(a) * 60)} ${f1(x + Math.cos(a) * 110)} ${f1(545 + Math.sin(a) * 12)}`, 'none', `stroke="${k % 2 ? C.olive : C.sage}" stroke-width="12" stroke-linecap="round"`);
      }
    }
    for (let i = 0; i < 14; i++) s.rect(150 + i * 66, 760, 28, 6, C.stoneD, 'opacity="0.5" rx="3"');
    grain(s);
    vignette(s, 0.16);
  },
  'patras-3'(s) {
    sky(s, 'golden', 520);
    sun(s, 260, 330, 50);
    sea(s, 520, '#5c97bf', '#003a5e', { lines: 24, sparkle: C.sunLL, opacity: 0.5 });
    s.path(`M380 900L420 640C470 520 560 450 700 430C820 412 950 430 1220 470L1220 900Z`, '#bfa47c');
    s.path(`M820 420C920 420 1060 440 1220 470L1220 900L960 900C980 720 920 540 820 420Z`, '#a68b62', 'opacity="0.6"');
    crenellated(s, 560, 450, 420, 70, { merlon: 16 });
    tower(s, 560, 450, 90, 150);
    tower(s, 980, 450, 100, 170);
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < 9 - row; i++) cube(s, 430 + row * 40 + i * 86 + s.r() * 12, 620 + row * 70, 66 + s.r() * 20, 46 + s.r() * 14, { side: '#e6dccb', win: '#a9c6d8', door: null });
    boat(s, 140, 690, 120, { hull: C.white, stripe: C.blue, sail: false });
    grain(s, 0.04);
    vignette(s, 0.16);
  },
  'chlemoutsi-1'(s) {
    sky(s, 'day', 520);
    sea(s, 500, '#7fb0cf', '#2c7db0', { lines: 20 });
    s.path(`M760 505C820 470 900 455 1000 462C1080 468 1140 485 1200 505Z`, '#7f9aa8');
    ridge(s, { base: 560, amp: 60, fill: '#a5ad74', seed: 221, detail: 0.5 });
    s.path(`M-20 900L-20 620C140 520 300 420 460 400C620 380 760 440 900 560C980 630 1060 720 1220 760L1220 900Z`, C.sage);
    s.path(`M600 395C700 400 800 470 900 560C980 630 1060 720 1220 760L1220 900L700 900C760 700 700 520 600 395Z`, C.olive, 'opacity="0.45"');
    crenellated(s, 300, 430, 400, 110, { merlon: 18 });
    tower(s, 300, 430, 70, 150);
    tower(s, 700, 430, 70, 150);
    s.rect(420, 250, 160, 70, C.stone);
    crenellated(s, 400, 330, 200, 90, { merlon: 14 });
    for (let i = 0; i < 16; i++) olive(s, 60 + s.r() * 1100, 640 + s.r() * 220, 22 + s.r() * 10);
    grain(s);
    vignette(s, 0.15);
  },
  'chlemoutsi-2'(s) {
    sky(s, 'golden', 900);
    sun(s, 600, 420, 70);
    s.rect(0, 0, W, H, C.stone, 'opacity="0"');
    crenellated(s, -20, 900, 1240, 520, { merlon: 30 });
    s.path(`M440 900V600A160 160 0 0 1 760 600V900Z`, s.linear([
      [0, '#f7d88a'],
      [0.6, '#fbedc6'],
      [0.61, '#b9b06e'],
      [1, '#98a869'],
    ]));
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (Math.PI * i) / 12;
      s.add(`<line x1="${f1(600 + Math.cos(a) * 160)}" y1="${f1(600 + Math.sin(a) * 160)}" x2="${f1(600 + Math.cos(a) * 196)}" y2="${f1(600 + Math.sin(a) * 196)}" stroke="${C.stoneD}" stroke-width="2.4" opacity="0.7"/>`);
    }
    s.path(`M404 600A196 196 0 0 1 796 600`, 'none', `stroke="${C.stoneD}" stroke-width="2.4" opacity="0.7"`);
    s.rect(0, 860, W, 40, '#9da35a');
    grain(s);
    vignette(s, 0.2);
  },
  'chlemoutsi-3'(s) {
    sky(s, 'dusk', 560);
    sun(s, 380, 540, 64, C.sun, C.sunL);
    sea(s, 560, '#2c6f9e', '#002a43', { lines: 26, sparkle: C.sunL, opacity: 0.5 });
    sunPath(s, 380, 560, 150);
    s.path(`M140 562C220 540 320 536 420 548C470 554 500 560 520 562Z`, '#0a3352');
    s.path(`M640 900L700 640C760 600 860 580 1000 590C1100 598 1160 610 1220 620L1220 900Z`, '#0d3a5c');
    for (let i = 0; i < 14; i++) s.circle(720 + i * 34 + s.r() * 10, 625 + s.r() * 30, 2.5, C.sun);
    s.path(`M520 700L760 700L740 728L540 728Z`, C.white);
    s.rect(560, 672, 150, 28, C.paper);
    s.rect(600, 652, 70, 20, C.cream);
    s.rect(640, 632, 12, 22, C.blue);
    for (let i = 0; i < 6; i++) s.rect(570 + i * 22, 680, 12, 8, C.blueD);
    grain(s, 0.06);
  },
  'turtle-1'(s) {
    s.rect(0, 0, W, H, s.linear([
      [0, '#9fd8e3'],
      [0.45, '#3b9cc4'],
      [1, '#0b4f80'],
    ]));
    for (let i = 0; i < 6; i++) {
      const x = 120 + i * 190 + s.r() * 60;
      s.path(`M${f1(x)} 0L${f1(x + 60)} 0L${f1(x + 260)} 900L${f1(x + 120)} 900Z`, C.white, 'opacity="0.07"');
    }
    s.path(`M-20 900L-20 780C200 740 420 770 640 750C860 730 1040 760 1220 740L1220 900Z`, '#e3cf9c');
    for (let i = 0; i < 12; i++) s.path(`M${f1(s.r() * W)} ${f1(800 + s.r() * 80)}q30 -8 60 0`, 'none', `stroke="#c9b27a" stroke-width="3" opacity="0.6"`);
    for (let i = 0; i < 9; i++) {
      const x = 60 + i * 130 + s.r() * 40;
      s.path(`M${f1(x)} 820C${f1(x - 20)} 760 ${f1(x + 20)} 700 ${f1(x - 6)} 640`, 'none', `stroke="${i % 2 ? C.olive : C.sage}" stroke-width="7" stroke-linecap="round"`);
    }
    turtle(s, 600, 420, 230, -14);
    for (let i = 0; i < 9; i++) fish(s, 120 + s.r() * 980, 140 + s.r() * 520, 22 + s.r() * 16, i % 3 ? C.sunL : C.white);
    for (let i = 0; i < 18; i++) s.circle(650 + s.r() * 120, 120 + s.r() * 220, 3 + s.r() * 5, C.white, 'opacity="0.45"');
    grain(s, 0.04);
  },
  'turtle-2'(s) {
    s.rect(0, 0, W, H, s.linear([
      [0, '#2c7db0'],
      [1, '#005384'],
    ], { x2: 1, y2: 1 }));
    s.path(`M200 520C260 380 420 300 600 300C780 300 940 380 1000 520C1040 620 980 720 860 760C700 812 480 810 340 760C230 720 170 620 200 520Z`, '#7fc6d9');
    s.path(`M260 520C300 420 430 360 600 360C770 360 900 420 940 520C970 600 920 680 820 712C690 752 500 752 380 712C290 680 240 600 260 520Z`, '#9fd8e3');
    s.path(`M320 560C360 460 470 410 600 410C740 410 850 460 880 560C900 630 860 680 780 700C690 724 520 724 430 700C350 678 300 630 320 560Z`, C.sage);
    s.path(`M350 600C380 520 480 470 600 470C720 470 820 520 850 600C760 640 450 640 350 600Z`, C.olive);
    s.path(`M330 640C420 690 780 690 870 640C860 680 820 704 760 716C660 736 540 736 440 716C380 704 340 680 330 640Z`, C.sunLL);
    boat(s, 920, 760, 90, { sail: false, hull: C.white, stripe: C.blue });
    boat(s, 180, 300, 70, { sail: false, hull: C.white, stripe: C.sun });
    for (let i = 0; i < 30; i++) s.rect(s.r() * W, s.r() * H, 18 + s.r() * 40, 2, C.white, `opacity="${f1(0.2 + s.r() * 0.3)}" rx="1"`);
    grain(s, 0.04);
    vignette(s, 0.14);
  },
  'turtle-3'(s) {
    sky(s, 'day', 420);
    ridge(s, { base: 420, amp: 70, fill: '#9fb7a0', seed: 251, shape: (u) => Math.max(0, 1 - u * 1.2) });
    sea(s, 430, '#5aa6cf', '#005384', { lines: 26 });
    s.path(`M-20 900L-20 560C200 600 420 660 620 740C760 796 860 850 940 900Z`, '#9fd3de', 'opacity="0.75"');
    s.path(`M-20 900L-20 640C180 680 380 740 560 810C640 840 700 870 740 900Z`, C.sunLL);
    s.path(`M-20 900L-20 700C140 730 300 780 440 840C490 862 530 882 560 900Z`, '#ecd9a8');
    for (let i = 0; i < 5; i++) {
      const x = 90 + i * 70;
      const y = 760 + i * 22;
      for (const dx of [-16, 16]) s.rect(x + dx - 2, y - 30, 4, 34, C.brown);
      s.path(`M${x - 18} ${y - 8}L${x + 18} ${y - 8}`, 'none', `stroke="${C.sunD}" stroke-width="2"`);
      s.rect(x - 12, y - 46, 24, 14, C.paper, 'rx="2"');
    }
    turtle(s, 300, 690, 46, 120);
    grain(s, 0.04);
    vignette(s, 0.14);
  },
  'olympia-1'(s) {
    sky(s, 'day', 600);
    for (let i = 0; i < 7; i++) pine(s, -20 + i * 190 + s.r() * 40, 600, 200 + s.r() * 60);
    ridge(s, { base: 640, amp: 80, fill: C.sage, seed: 261, detail: 0.4 });
    s.rect(0, 640, W, H - 640, s.linear([
      [0, '#b9b06e'],
      [1, '#9da35a'],
    ]));
    archway(s, 600, 880, 760, 520);
    grain(s);
    vignette(s, 0.2);
  },
  'olympia-2'(s) {
    sky(s, 'golden', 640);
    sun(s, 980, 360, 52);
    for (let i = 0; i < 6; i++) pine(s, 40 + i * 230 + s.r() * 60, 640, 230 + s.r() * 60);
    s.rect(0, 640, W, H - 640, s.linear([
      [0, '#c9c38f'],
      [1, '#a9a36a'],
    ]));
    temple(s, { x: 270, base: 800, w: 660, cols: 6, colH: 220, ruined: [2], broken: { 0: 0.15, 4: 0.55, 5: 0.3 }, entab: false, fill: '#e8dcc6', shade: C.stoneD });
    for (let i = 0; i < 8; i++) s.rect(200 + s.r() * 800, 820 + s.r() * 50, 30 + s.r() * 50, 16 + s.r() * 14, i % 2 ? C.stone : C.stoneD, 'rx="3"');
    grain(s);
    vignette(s, 0.16);
  },
  'olympia-3'(s) {
    sky(s, 'day', 560);
    for (let i = 0; i < 5; i++) pine(s, 60 + i * 260 + s.r() * 50, 560, 200 + s.r() * 40);
    s.rect(0, 560, W, H - 560, s.linear([
      [0, '#bfc58a'],
      [1, '#98a869'],
    ]));
    for (let row = 0; row < 2; row++) {
      const base = 640 + row * 170;
      const h = 150 + row * 90;
      const cw = 24 + row * 12;
      const n = 11 - row * 3;
      for (let i = 0; i < n; i++) column(s, 70 + i * ((1060 - row * 40) / n) + row * 30, base, cw, h, { fill: C.cream, shade: C.stoneD, broken: s.r() > 0.82 ? 0.25 + s.r() * 0.3 : 0 });
    }
    grain(s);
    vignette(s, 0.16);
  },
  'barbalekou-1'(s) {
    sky(s, 'day', 560);
    ridge(s, { base: 520, amp: 120, fill: '#b4c8cf', seed: 271 });
    ridge(s, { base: 600, amp: 90, fill: '#a5ad74', seed: 272 });
    s.path(`M-20 900L-20 700C160 640 340 600 520 590C700 580 880 620 1220 700L1220 900Z`, C.sage);
    towerHouse(s, 520, 600, 170, 330);
    for (let i = 0; i < 18; i++) olive(s, 30 + s.r() * 1140, 680 + s.r() * 200, 26 + s.r() * 12);
    cypress(s, 470, 610, 150);
    cypress(s, 720, 610, 130);
    grain(s);
    vignette(s, 0.16);
  },
  'barbalekou-2'(s) {
    sky(s, 'golden', 460);
    sun(s, 300, 340, 46);
    ridge(s, { base: 440, amp: 70, fill: '#a7bccb', seed: 281 });
    const layers = ['#a8b27a', '#909c5e', '#7c874c', '#636b2f'];
    layers.forEach((fill, i) => {
      const base = 520 + i * 110;
      ridge(s, { base, amp: 80 - i * 10, fill, seed: 282 + i, detail: 0.5 });
      for (let k = 0; k < 22 + i * 6; k++) {
        const x = (k / (22 + i * 6)) * W + s.r() * 20;
        s.circle(x, base - 10 + (k % 2) * 30 + s.r() * 40, 8 + i * 4, i % 2 ? C.oliveD : C.olive, 'opacity="0.9"');
      }
      if (i === 0) towerHouse(s, 840, base - 52, 34, 70);
    });
    grain(s);
    vignette(s, 0.15);
  },
  'barbalekou-3'(s) {
    sky(s, 'dusk', 640);
    s.circle(960, 200, 30, C.sunLL);
    ridge(s, { base: 600, amp: 110, fill: '#1d5a85', seed: 291 });
    ridge(s, { base: 700, amp: 90, fill: '#0d3a5c', seed: 292 });
    towerHouse(s, 500, 720, 150, 300, { lit: true, fill: '#0a3352', shade: '#05243d' });
    s.path(`M-20 900L-20 740C200 700 400 690 600 700C800 710 1000 740 1220 760L1220 900Z`, '#062b47');
    for (let i = 0; i < 40; i++) s.circle(s.r() * W, 40 + s.r() * 400, 0.8 + s.r() * 1.4, C.sunLL, `opacity="${f1(0.4 + s.r() * 0.5)}"`);
    for (let i = 0; i < 10; i++) s.circle(100 + s.r() * 1000, 760 + s.r() * 100, 2.2, C.sun, 'opacity="0.85"');
    grain(s, 0.06);
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
  'patras-1': 'Placeholder: the Rio–Antirrio Bridge',
  'patras-2': 'Placeholder: Church of Saint Andrew, Patras',
  'patras-3': 'Placeholder: Patras Castle above the city',
  'chlemoutsi-1': 'Placeholder: Chlemoutsi Castle above the Ionian Sea',
  'chlemoutsi-2': 'Placeholder: the castle gate at Chlemoutsi',
  'chlemoutsi-3': 'Placeholder: sunset over Kyllini harbour',
  'turtle-1': 'Placeholder: a loggerhead turtle underwater',
  'turtle-2': 'Placeholder: Marathonisi, the Turtle Island',
  'turtle-3': 'Placeholder: protected turtle nests on Laganas beach',
  'olympia-1': 'Placeholder: the tunnel into the ancient stadium of Olympia',
  'olympia-2': 'Placeholder: the Temple of Hera at Olympia',
  'olympia-3': 'Placeholder: columns of the palaestra at Olympia',
  'barbalekou-1': 'Placeholder: Barbalekou Tower among olive trees',
  'barbalekou-2': 'Placeholder: olive groves of Trifylia',
  'barbalekou-3': 'Placeholder: Barbalekou Tower at dusk',
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
