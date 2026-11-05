import { animate, motionValue, type AnimationPlaybackControls } from 'motion';
import {
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MathUtils,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
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
import { decodeHeight, lonLatToPx, lonLatToWorld, MAP_H, MAP_W, TEX_H, TEX_W } from './projection';
import { RouteLines } from './routes';
import { attachSteps } from './steps';
import { createTerrainMaterial, FOG_HEX } from './terrainMaterial';
import { disposeVehicleMaterials, HeroVehicle, Traffic } from './vehicles';

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

const flightDuration = (a: Pose, b: Pose) =>
  MathUtils.clamp(0.8 + a.target.distanceTo(b.target) / 600 + Math.abs(Math.log(b.distance / a.distance)) * 0.35, 0.9, 1.6);
const drawDuration = (length: number) => MathUtils.clamp(1.1 + length / 90, 2, 4.5);

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
  return (lon: number, lat: number) => {
    const [px, py] = lonLatToPx(lon, lat);
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

  const ground = stops.map((s) => {
    const { x, z } = lonLatToWorld(s.lon, s.lat);
    return new Vector3(x, sampleHeight(s.lon, s.lat) * 0.001 * EXAG, z);
  });
  const paths: LegPath[] = buildLegPaths(route, sampleHeight, EXAG);
  const lines = new RouteLines(paths);
  scene.add(lines.group);

  const fog = new Fog(FOG_HEX, 900, 2600);
  const seaScene = new Scene();
  const fxScene = new Scene();
  for (const s of [seaScene, fxScene]) {
    s.fog = fog;
    s.add(new HemisphereLight(0xfff6e6, 0x2b4f6e, 1.7));
    const sun = new DirectionalLight(0xfff0d8, 2.6);
    sun.position.copy(material.uniforms.uLightDir.value).multiplyScalar(100);
    s.add(sun);
  }
  const traffic = new Traffic(paths);
  seaScene.add(traffic.sea);
  fxScene.add(traffic.road);
  const hero = new HeroVehicle();
  fxScene.add(hero.group);
  renderer.autoClear = false;

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
      distance: stops[i].view.distance * aspectBoost * (overlay.isDocked ? 1.15 : 1),
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
  const headA = new Vector3();
  const headB = new Vector3();
  let lastDrawn = 0;
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
    let heading: Vector3 | null = null;
    const speed = MathUtils.clamp(Math.abs(d - lastDrawn) / Math.max(dt, 1e-3) / 60, 0, 1);
    if (Math.abs(d - drawTo) > 0.05 && leg < paths.length) {
      const segment = displaySegment(paths[leg], along);
      traveler = {
        pos: pointOn(paths[leg], along, tmp),
        mode: segmentAt(paths[leg], along).mode,
        title: `${stops[leg].name} → ${stops[leg + 1].name}`,
        meta: `${segment.km} km by ${segment.mode === 'sea' ? 'ferry' : 'road'}`,
      };
      heading = pointOn(paths[leg], along + 1.5, headA, true).sub(pointOn(paths[leg], along - 1.5, headB, true));
      if (drawTo < d) heading.negate();
      if (heading.lengthSq() < 1e-6) heading = null;
      else heading.normalize();
    }
    lastDrawn = d;

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
    un.uFogNear.value = pose.distance * 0.9;
    un.uFogFar.value = pose.distance * 2.6 + 400;

    pinWorld.forEach((pin, i) => pin.set(ground[i].x, ground[i].y * riseE + 0.6, ground[i].z));
    lines.group.scale.y = Math.max(riseE, 0.001);
    if (traveler) traveler.pos.y *= riseE;
    lines.setTime(time);
    fog.near = un.uFogNear.value;
    fog.far = un.uFogFar.value;
    traffic.update(reducedMotion ? 0 : dt, reducedMotion ? 0 : time, riseE);
    hero.update(traveler ? traveler.pos : null, heading, traveler?.mode ?? 'road', pose.distance * 0.034, speed, dt, time);

    renderer.clear();
    renderer.render(scene, camera);
    renderer.render(seaScene, camera);
    renderer.clearDepth();
    renderer.render(fxScene, camera);
    overlay.update({
      camera,
      pins: pinWorld,
      activeStop,
      nextStop: arrived ? -1 : toStop,
      polaroidStop: Math.abs(d - drawTo) <= 0.05 ? activeStop : -1,
      traveler,
      fills,
      current: shown === nodes.outro ? last : nodes.stopAt(shown),
      panel: nodes.panel(shown),
      intro: node === 0 ? p : fromNode === 0 ? 1 - p : 0,
    });

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
      traffic.dispose();
      disposeVehicleMaterials();
      geometry.dispose();
      material.dispose();
      height.dispose();
      masks.dispose();
      renderer.dispose();
    },
  };
}
