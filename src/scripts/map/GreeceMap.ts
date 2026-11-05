import { animate, motionValue, type AnimationPlaybackControls } from 'motion';
import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MathUtils,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { asset } from '../../lib/asset';
import { applyPose, clonePose, flyTo, type Pose } from './camera';
import { journeyNodes } from './journey';
import { Overlay, type Traveler } from './overlay';
import { buildLegPaths, pointOn, segmentAt, type LegPath, type RouteData } from './path';
import { decodeHeight, KM_PER_PX, lonLatToPx, lonLatToWorld, MAP_H, MAP_W, TEX_H, TEX_W } from './projection';
import { RouteLines } from './routes';
import { attachSteps } from './steps';
import { createTerrainMaterial, FOG_HEX, srgb } from './terrainMaterial';
import { DetailLayer, type DetailData, type ShadowAt } from './detail';
import { PoiLabels } from './poi';

export interface MapStop {
  name: string;
  lon: number;
  lat: number;
  view: { yaw: number; pitch: number; distance: number };
}

export interface MapOptions {
  root: HTMLElement;
  section: HTMLElement;
  canvas: HTMLCanvasElement;
  stops: MapStop[];
  route: RouteData;
  reducedMotion: boolean;
  onReady?: () => void;
  onArrive?: (stop: number) => void;
}

export interface GreeceMapHandle {
  goTo(stop: number): void;
  scrollYEnd(): number;
  dispose(): void;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

type Bezier = [number, number, number, number];

const EXAG = 7;
const FOV = 30;
const smooth = MathUtils.smoothstep;

const CAMERA_EASE: Bezier = [0.65, 0, 0.35, 1];
const DRAW_EASE: Bezier = [0.45, 0, 0.3, 1];
const DRAW_DELAY = 0.15;
const PANEL_SWITCH = 0.35;

interface Mood {
  label: string;
  az: number;
  el: number;
  sun: [number, number, number];
  shade: [number, number, number];
  fog: string;
  night: number;
  glint: number;
  cloud: number;
}

const MOODS: Mood[] = [
  { label: 'Late morning', az: 255.6, el: 34.7, sun: [1.07, 1.04, 0.98], shade: [0.3, 0.4, 0.56], fog: '#03304f', night: 0, glint: 0.3, cloud: 0.45 },
  { label: 'Dawn · 06:20', az: 88, el: 7, sun: [1.28, 0.88, 0.7], shade: [0.3, 0.28, 0.5], fog: '#272c57', night: 0.3, glint: 0.9, cloud: 0.35 },
  { label: 'Morning · 09:10', az: 118, el: 26, sun: [1.14, 1.04, 0.9], shade: [0.31, 0.39, 0.55], fog: '#0b4269', night: 0, glint: 0.6, cloud: 0.55 },
  { label: 'Noon · 13:00', az: 195, el: 62, sun: [1.1, 1.08, 1.0], shade: [0.36, 0.45, 0.6], fog: '#0a4f7b', night: 0, glint: 0.5, cloud: 0.7 },
  { label: 'Afternoon · 16:30', az: 240, el: 28, sun: [1.15, 1.0, 0.8], shade: [0.3, 0.37, 0.54], fog: '#0a456c', night: 0, glint: 1.0, cloud: 0.5 },
  { label: 'Golden hour · 19:40', az: 283, el: 6, sun: [1.38, 0.8, 0.46], shade: [0.34, 0.25, 0.42], fog: '#3a2950', night: 0.12, glint: 1.0, cloud: 0.35 },
  { label: 'Blue hour · 21:05', az: 120, el: 30, sun: [0.5, 0.58, 0.85], shade: [0.1, 0.12, 0.24], fog: '#0b1833', night: 0.75, glint: 0.35, cloud: 0.2 },
  { label: 'Night · 23:30', az: 150, el: 42, sun: [0.38, 0.46, 0.72], shade: [0.07, 0.09, 0.18], fog: '#061224', night: 1, glint: 0.3, cloud: 0.12 },
];

const moodDir = (m: Mood) => {
  const az = MathUtils.degToRad(m.az);
  const el = MathUtils.degToRad(m.el);
  return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
};
const MOOD_DIR = MOODS.map(moodDir);
const MOOD_FOG = MOODS.map((m) => srgb(m.fog));
const MOOD_SUN = MOODS.map((m) => new Vector3(...m.sun));
const MOOD_SHADE = MOODS.map((m) => new Vector3(...m.shade));

const flightDuration = (a: Pose, b: Pose) =>
  MathUtils.clamp(0.8 + a.target.distanceTo(b.target) / 600 + Math.abs(Math.log(b.distance / a.distance)) * 0.35, 0.9, 1.6);
const drawDuration = (length: number) => MathUtils.clamp(0.6 + length / 180, 1.2, 3);

function heightSampler(image: CanvasImageSource) {
  const scale = 0.5;
  const w = Math.round(TEX_W * scale);
  const h = Math.round(TEX_H * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const atPx = (px: number, py: number) => {
    const x = MathUtils.clamp(px * scale - 0.5, 0, w - 2);
    const y = MathUtils.clamp(py * scale - 0.5, 0, h - 2);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = (xx: number, yy: number) => decodeHeight(data[(yy * w + xx) * 4]);
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return Math.max(0, top * (1 - fy) + bottom * fy);
  };
  return Object.assign((lon: number, lat: number) => atPx(...lonLatToPx(lon, lat)), { px: atPx });
}

function boundsOf(points: Vector3[]): Bounds {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of points) {
    b.minX = Math.min(b.minX, p.x);
    b.maxX = Math.max(b.maxX, p.x);
    b.minZ = Math.min(b.minZ, p.z);
    b.maxZ = Math.max(b.maxZ, p.z);
  }
  return b;
}

export async function createGreeceMap(opts: MapOptions): Promise<GreeceMapHandle> {
  const { root, section, canvas, stops, route, reducedMotion } = opts;
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(FOG_HEX);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);

  const loader = new TextureLoader();
  const [height, masks] = await Promise.all([loader.loadAsync(asset('map/height.webp')), loader.loadAsync(asset('map/masks.png'))]);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const t of [height, masks] as Texture[]) t.anisotropy = aniso;
  const sampleHeight = heightSampler(height.image as CanvasImageSource);

  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const segX = small ? 300 : 560;
  const segY = Math.round((segX * TEX_H) / TEX_W);
  const geometry = new PlaneGeometry(MAP_W, MAP_H, segX, segY);
  geometry.rotateX(-Math.PI / 2);
  const material = createTerrainMaterial(height, masks, Math.max(0, Math.log2(TEX_W / segX) - 0.5));
  material.uniforms.uExag.value = EXAG;

  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const fog = new Fog(FOG_HEX, 900, 2600);
  scene.fog = fog;
  const hemi = new HemisphereLight(0xfff6e6, 0x40607a, 1.9);
  scene.add(hemi);
  const sun = new DirectionalLight(0xfff0d8, 2.4);
  sun.position.copy(material.uniforms.uLightDir.value).multiplyScalar(100);
  scene.add(sun);

  const vertexH = new Float32Array((segX + 1) * (segY + 1)).fill(NaN);
  const vertexHeight = (i: number, j: number) => {
    const k = j * (segX + 1) + i;
    if (Number.isNaN(vertexH[k])) vertexH[k] = sampleHeight.px((i / segX) * TEX_W, (j / segY) * TEX_H) * 0.001 * EXAG;
    return vertexH[k];
  };
  const surface = (x: number, z: number) => {
    const gx = MathUtils.clamp(((x + MAP_W / 2) / MAP_W) * segX, 0, segX - 1e-6);
    const gz = MathUtils.clamp(((z + MAP_H / 2) / MAP_H) * segY, 0, segY - 1e-6);
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const top = vertexHeight(i, j) * (1 - fx) + vertexHeight(i + 1, j) * fx;
    const bottom = vertexHeight(i, j + 1) * (1 - fx) + vertexHeight(i + 1, j + 1) * fx;
    return top * (1 - fz) + bottom * fz;
  };

  let detail: DetailLayer | null = null;
  let poi: PoiLabels | null = null;
  let coverAmt = 0;
  let coverTex: Texture | null = null;
  let disposed = false;
  loader.loadAsync(asset('map/landcover.webp')).then((t) => {
    if (disposed) return t.dispose();
    t.anisotropy = aniso;
    coverTex = t;
    material.uniforms.uCover.value = t;
  }, console.error);
  fetch(asset('map/detail.json'))
    .then((r) => r.json() as Promise<DetailData>)
    .then((data) => {
      if (disposed) return;
      detail = new DetailLayer(data, surface);
      detail.setResolution(width, height2);
      scene.add(detail.group, detail.roads);
      poi = new PoiLabels(root, detail.landmarks);
      const layer = detail;
      const queue = MOODS.map((_, i) => i);
      const idle = (fn: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 30));
      const next = () => {
        const k = queue.shift();
        if (k === undefined || disposed) return;
        layer.computeShadows(k, MOOD_DIR[k], shadowAt);
        idle(next);
      };
      idle(next);
    }, console.error);

  const shadowAt: ShadowAt = (x, y, z, dir) => {
    const fl = Math.hypot(dir.x, dir.z);
    if (dir.y <= 0.02 || fl < 1e-3) return 1;
    const dx = dir.x / fl;
    const dz = dir.z / fl;
    const rise = dir.y / fl;
    const start = y + 0.05;
    let s = 0.7;
    let lit = 1;
    for (let i = 0; i < 22 && lit > 0; i++) {
      const th = sampleHeight.px((x + dx * s) / KM_PER_PX + TEX_W / 2, (z + dz * s) / KM_PER_PX + TEX_H / 2) * 0.001 * EXAG;
      lit = Math.min(lit, MathUtils.clamp(((start + s * rise - th) * 6) / s + 0.5, 0, 1));
      s *= 1.22;
    }
    return lit;
  };
  const sunTint = new Vector3();

  const dayChip = root.querySelector<HTMLElement>('[data-daychip]');
  const dayLabel = root.querySelector<HTMLElement>('[data-daychip-label]');
  let dayShown = '';
  const clear = new Color();

  const ground = stops.map((s) => {
    const { x, z } = lonLatToWorld(s.lon, s.lat);
    return new Vector3(x, sampleHeight(s.lon, s.lat) * 0.001 * EXAG, z);
  });
  const paths: LegPath[] = buildLegPaths(route, sampleHeight, EXAG);
  const lines = new RouteLines(paths);
  scene.add(lines.group);

  const nodes = journeyNodes(stops.length);
  const last = stops.length - 1;
  const legStart = paths.reduce<number[]>((acc, p) => [...acc, acc[acc.length - 1] + p.length], [0]);
  const routeLength = legStart[paths.length];

  const camera = new PerspectiveCamera(FOV, 1, 1, 6000);
  const overlay = new Overlay(root);
  const pinWorld = ground.map((g) => g.clone());

  let width = 1;
  let height2 = 1;
  let sectionTop = 0;

  const stopPose = (i: number): Pose => {
    const f = overlay.focusPoint();
    const aspectBoost = MathUtils.clamp(1.25 / (width / height2), 1, 1.7);
    return {
      target: ground[i].clone(),
      distance: stops[i].view.distance * 0.62 * aspectBoost * (overlay.isDocked ? 1.15 : 1),
      yaw: stops[i].view.yaw,
      pitch: stops[i].view.pitch,
      fx: f.x,
      fy: f.y,
    };
  };

  const fitPose = (b: Bounds, pitch: number, yaw: number, margin: number, labelPad: number, area = overlay.overviewArea()): Pose => {
    const ex = b.maxX - b.minX + margin * 2 + labelPad;
    const ez = b.maxZ - b.minZ + margin * 2;
    const vt = Math.tan(MathUtils.degToRad(FOV / 2));
    const ht = vt * (width / height2);
    const dx = ex / (2 * ht * area.w);
    const dz = (ez * Math.cos(MathUtils.degToRad(pitch))) / (2 * vt * area.h);
    return {
      target: new Vector3((b.minX + b.maxX + labelPad) / 2, 0, (b.minZ + b.maxZ) / 2 + 10),
      distance: Math.max(dx, dz) * 1.04,
      yaw,
      pitch,
      fx: area.x + area.w / 2,
      fy: area.y + area.h / 2,
    };
  };

  const overviewPose = () =>
    fitPose(boundsOf(ground), overlay.isDocked ? 30 : 42, -6, overlay.isDocked ? 120 : 70, overlay.isDocked ? 110 : 40);

  let poses = { overview: overviewPose(), stops: stops.map((_, i) => stopPose(i)) };
  const nodePose = (n: number) => {
    const s = nodes.stopAt(n);
    return s >= 0 ? poses.stops[s] : poses.overview;
  };

  const tmp = new Vector3();
  const pose: Pose = clonePose(poses.overview);
  const fromPose: Pose = clonePose(poses.overview);
  const scratch: Pose = clonePose(poses.overview);

  const copyPose = (src: Pose, out: Pose) => {
    out.target.copy(src.target);
    out.distance = src.distance;
    out.yaw = src.yaw;
    out.pitch = src.pitch;
    out.fx = src.fx;
    out.fy = src.fy;
    return out;
  };

  const displaySegment = (leg: LegPath, d: number) => {
    const seg = segmentAt(leg, d);
    if (seg.km >= 10) return seg;
    return leg.segments.reduce((best, s) => (s.km >= 10 && Math.abs((s.start + s.end) / 2 - d) < Math.abs((best.start + best.end) / 2 - d) ? s : best), leg.segments.find((s) => s.km >= 10) ?? seg);
  };

  const measure = () => {
    const rect = root.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height2 = Math.max(1, rect.height);
    renderer.setSize(width, height2, false);
    camera.aspect = width / height2;
    overlay.resize(width, height2);
    lines.setResolution(width, height2);
    detail?.setResolution(width, height2);
    sectionTop = section.getBoundingClientRect().top + window.scrollY;
    poses = { overview: overviewPose(), stops: stops.map((_, i) => stopPose(i)) };
  };
  measure();

  const ro = new ResizeObserver(measure);
  ro.observe(root);
  ro.observe(section);
  const content = root.querySelector('[data-content]');
  if (content) ro.observe(content);
  const tourbar = root.querySelector('[data-tourbar]');
  if (tourbar) ro.observe(tourbar);

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  let node = 0;
  let fromNode = 0;
  let drawTo = 0;
  const flight = motionValue(1);
  const drawn = motionValue(0);
  let flightAnim: AnimationPlaybackControls | null = null;
  let drawAnim: AnimationPlaybackControls | null = null;

  const drawFor = (n: number) => (n >= nodes.outro ? routeLength : legStart[Math.max(0, nodes.stopAt(n))]);
  const legAt = (d: number) => {
    let i = 0;
    while (i < paths.length && d >= legStart[i + 1]) i++;
    return i;
  };

  const evalPose = (out: Pose) => {
    const p = flight.get();
    return p >= 1 ? copyPose(nodePose(node), out) : flyTo(fromPose, nodePose(node), p, out);
  };

  const show = (target: number, instant = reducedMotion) => {
    const n = MathUtils.clamp(target, 0, nodes.count - 1);
    if (n === node) return;
    copyPose(evalPose(scratch), fromPose);
    fromNode = flight.get() < PANEL_SWITCH ? fromNode : node;
    node = n;
    flightAnim?.stop();
    drawAnim?.stop();
    const to = drawFor(n);
    if (instant) {
      flight.jump(1);
      drawn.jump(to);
    } else {
      flight.jump(0);
      flightAnim = animate(flight, 1, { duration: flightDuration(fromPose, nodePose(n)), ease: CAMERA_EASE });
      const from = drawn.get();
      if (to !== from) {
        drawAnim = animate(drawn, to, { duration: drawDuration(Math.abs(to - from)), ease: DRAW_EASE, delay: from === drawTo ? DRAW_DELAY : 0 });
      }
    }
    drawTo = to;
  };

  let rise = reducedMotion ? 1 : 0;
  let time = 0;
  let lastNow = performance.now();
  let raf = 0;
  let inView = true;
  let frames = 0;
  let frameTime = 0;
  let readyFired = false;
  let arrivedStop = -1;
  const fills = stops.map(() => 0);

  const render = (now: number) => {
    raf = requestAnimationFrame(render);
    const dt = Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;
    time += dt;

    const p = flight.get();
    const arrived = p >= 1;
    evalPose(pose);

    rise = Math.min(1, rise + dt / 2.6);
    const riseE = 1 - (1 - rise) ** 3;
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);
    camera.setViewOffset(width, height2, (0.5 - pose.fx) * width, (0.5 - pose.fy) * height2, width, height2);
    applyPose(camera, pose, -pointer.sx * 2.2, pointer.sy * 1.4);

    const toStop = nodes.stopAt(node);
    const shown = p < PANEL_SWITCH ? fromNode : node;
    const focusStop = p < 0.5 ? nodes.stopAt(fromNode) : toStop;
    const focusAmt = p < 0.5 ? 1 - smooth(p, 0, 0.3) : smooth(p, 0.7, 1);
    const activeStop = arrived ? toStop : -1;

    const d = drawn.get();
    const leg = legAt(d);
    const along = leg < paths.length ? d - legStart[leg] : 0;
    lines.setProgress(leg, along);
    let traveler: Traveler | null = null;
    if (Math.abs(d - drawTo) > 0.05 && leg < paths.length) {
      const segment = displaySegment(paths[leg], along);
      traveler = {
        pos: pointOn(paths[leg], along, tmp),
        mode: segment.mode,
        title: `${stops[leg].name} → ${stops[leg + 1].name}`,
        meta: `${segment.km} km by ${segment.mode === 'sea' ? 'ferry' : 'road'}`,
      };
    }

    for (let i = 0; i < last; i++) fills[i] = MathUtils.clamp((d - legStart[i]) / paths[i].length, 0, 1);
    fills[last] = node === nodes.outro ? p : fromNode === nodes.outro ? 1 - p : 0;

    if (activeStop !== arrivedStop) {
      arrivedStop = activeStop;
      if (activeStop >= 0) opts.onArrive?.(activeStop);
    }

    const un = material.uniforms;
    un.uTime.value = time;
    un.uRise.value = riseE;
    un.uFocusAmt.value = focusStop >= 0 ? focusAmt : 0;
    if (focusStop >= 0) un.uFocus.value.copy(ground[focusStop]);
    un.uFocusRadius.value = MathUtils.clamp(pose.distance * 0.2, 14, 60);
    const ma = Math.min(fromNode, MOODS.length - 1);
    const mb = Math.min(node, MOODS.length - 1);
    const mt = arrived ? 1 : smooth(p, 0.05, 0.95);
    const mix = (a: number, b: number) => a + (b - a) * mt;
    un.uLightDir.value.lerpVectors(MOOD_DIR[ma], MOOD_DIR[mb], mt).normalize();
    un.uSunColor.value.lerpVectors(MOOD_SUN[ma], MOOD_SUN[mb], mt);
    un.uShadeColor.value.lerpVectors(MOOD_SHADE[ma], MOOD_SHADE[mb], mt);
    un.uFog.value.lerpVectors(MOOD_FOG[ma], MOOD_FOG[mb], mt);
    un.uNight.value = mix(MOODS[ma].night, MOODS[mb].night) * (coverTex ? 1 : 0.85);
    un.uGlint.value = mix(MOODS[ma].glint, MOODS[mb].glint);
    un.uCloud.value = mix(MOODS[ma].cloud, MOODS[mb].cloud);
    const fogV = un.uFog.value;
    renderer.setClearColor(clear.setRGB(fogV.x, fogV.y, fogV.z, SRGBColorSpace));
    fog.color.copy(clear);
    const night = un.uNight.value;
    const sunC = un.uSunColor.value;
    const sunMax = Math.max(sunC.x, sunC.y, sunC.z);
    sunTint.copy(sunC).divideScalar(sunMax);
    sun.position.copy(un.uLightDir.value).multiplyScalar(100);
    sun.color.setRGB(sunTint.x, sunTint.y, sunTint.z, SRGBColorSpace);
    sun.intensity = 2.4 * sunMax * (1 - night * 0.72);
    hemi.color.setRGB(0.8 + sunTint.x * 0.2, 0.78 + sunTint.y * 0.2, 0.74 + sunTint.z * 0.2, SRGBColorSpace).lerp(clear.setRGB(0.45, 0.55, 0.9, SRGBColorSpace), night);
    const shade = un.uShadeColor.value;
    hemi.groundColor.setRGB(shade.x * 0.85, shade.y * 0.85, shade.z * 0.85, SRGBColorSpace);
    hemi.intensity = 1.9 * (1 - night * 0.7);
    clear.setRGB(fogV.x, fogV.y, fogV.z, SRGBColorSpace);
    detail?.setShadows(ma, mb, mt);
    const label = MOODS[Math.min(shown, MOODS.length - 1)].label;
    if (label !== dayShown && dayLabel && dayChip) {
      dayLabel.textContent = label;
      dayChip.dataset.night = String(MOODS[Math.min(shown, MOODS.length - 1)].night >= 0.5);
      dayShown = label;
    }
    un.uFogNear.value = pose.distance * 0.9;
    un.uFogFar.value = pose.distance * 2.6 + 400;

    pinWorld.forEach((pin, i) => pin.set(ground[i].x, ground[i].y * riseE + 0.6, ground[i].z));
    lines.group.scale.y = Math.max(riseE, 0.001);
    if (traveler) traveler.pos.y *= riseE;
    lines.setTime(time);
    fog.near = un.uFogNear.value;
    fog.far = un.uFogFar.value;
    if (coverTex) {
      coverAmt = reducedMotion ? 1 : Math.min(1, coverAmt + dt / 1.6);
      un.uCoverAmt.value = MathUtils.smoothstep(coverAmt, 0, 1) * riseE;
    }
    const drawnIn = Math.abs(d - drawTo) <= 0.05;
    detail?.update(pose.distance, activeStop >= 0 ? ground[activeStop] : null, rise >= 1 ? dt : 0, reducedMotion, un.uNight.value);

    renderer.render(scene, camera);
    overlay.update({
      camera,
      pins: pinWorld,
      activeStop,
      nextStop: arrived ? -1 : toStop,
      polaroidStop: activeStop,
      traveler,
      fills,
      current: shown === nodes.outro ? last : nodes.stopAt(shown),
      panel: nodes.panel(shown),
      intro: node === 0 ? p : fromNode === 0 ? 1 - p : 0,
    });
    poi?.update(camera, width, height2, activeStop >= 0 && drawnIn ? ground[activeStop] : null, overlay.occupied, overlay.safeArea);

    if (!readyFired) {
      readyFired = true;
      opts.onReady?.();
    }

    frames++;
    frameTime += dt;
    if (frames === 90) {
      if (frameTime / frames > 0.024 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height2, false);
      }
      frames = 0;
      frameTime = 0;
    }
  };

  const startLoop = () => {
    if (raf) return;
    lastNow = performance.now();
    raf = requestAnimationFrame(render);
  };
  const stopLoop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const syncLoop = () => (inView && !document.hidden ? startLoop() : stopLoop());

  const isActive = () => inView && !document.documentElement.classList.contains('menu-open') && Math.abs(window.scrollY - sectionTop) < 2;
  const syncLock = () => section.classList.toggle('is-locked', isActive());
  window.addEventListener('scroll', syncLock, { passive: true });

  const io = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    syncLoop();
    syncLock();
  });
  io.observe(root);
  document.addEventListener('visibilitychange', syncLoop);
  syncLoop();
  syncLock();

  const detachSteps = attachSteps({
    root: section,
    active: isActive,
    canStep: (dir) => (dir > 0 ? node < nodes.outro : node > 0),
    step: (dir) => show(node + dir),
    leave: () => window.scrollTo({ top: sectionTop + section.offsetHeight }),
  });

  return {
    goTo(stop: number) {
      if (Math.abs(window.scrollY - sectionTop) > 1) window.scrollTo({ top: sectionTop });
      show(nodes.ofStop(stop));
    },
    scrollYEnd() {
      return sectionTop + section.offsetHeight;
    },
    dispose() {
      disposed = true;
      detail?.dispose();
      poi?.dispose();
      coverTex?.dispose();
      stopLoop();
      ro.disconnect();
      io.disconnect();
      detachSteps();
      flightAnim?.stop();
      drawAnim?.stop();
      flight.destroy();
      drawn.destroy();
      document.removeEventListener('visibilitychange', syncLoop);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', syncLock);
      lines.dispose();
      geometry.dispose();
      material.dispose();
      height.dispose();
      masks.dispose();
      renderer.dispose();
    },
  };
}
