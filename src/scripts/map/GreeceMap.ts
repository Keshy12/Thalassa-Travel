import { Mesh, MathUtils, PerspectiveCamera, PlaneGeometry, Scene, TextureLoader, Vector3, WebGLRenderer, type Texture } from 'three';
import { asset } from '../../lib/asset';
import { Overlay } from './overlay';
import { decodeHeight, lonLatToPx, lonLatToWorld, MAP_H, MAP_W, TEX_H, TEX_W } from './projection';
import { Routes } from './routes';
import { createTerrainMaterial, FOG_HEX } from './terrainMaterial';
import { applyPose, Tour, type Pose, type Step } from './tour';

export interface MapStop {
  lon: number;
  lat: number;
  view: { yaw: number; pitch: number; distance: number };
}

export interface MapOptions {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  stops: MapStop[];
  reducedMotion: boolean;
  onReady?: () => void;
}

export interface GreeceMapHandle {
  goTo(stop: number): void;
  setPaused(paused: boolean): void;
  readonly paused: boolean;
  dispose(): void;
}

const EXAG = 7;
const FOV = 30;
const SEQUENCE: Step[] = [
  { kind: 'overview' },
  { kind: 'stop', index: 0 },
  { kind: 'stop', index: 1 },
  { kind: 'stop', index: 2 },
  { kind: 'overview' },
  { kind: 'stop', index: 3 },
  { kind: 'stop', index: 4 },
  { kind: 'stop', index: 5 },
];

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

export async function createGreeceMap(opts: MapOptions): Promise<GreeceMapHandle> {
  const { root, canvas, stops, reducedMotion } = opts;
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
  const lod = Math.max(0, Math.log2(TEX_W / segX) - 0.5);
  const geometry = new PlaneGeometry(MAP_W, MAP_H, segX, segY);
  geometry.rotateX(-Math.PI / 2);
  const material = createTerrainMaterial(height, masks, lod);
  material.uniforms.uExag.value = EXAG;
  const terrain = new Mesh(geometry, material);

  const scene = new Scene();
  scene.add(terrain);

  const ground = stops.map((s) => {
    const { x, z } = lonLatToWorld(s.lon, s.lat);
    return new Vector3(x, sampleHeight(s.lon, s.lat) * 0.001 * EXAG, z);
  });
  const routes = new Routes(ground.map((g) => g.clone()));
  scene.add(routes.group);

  const camera = new PerspectiveCamera(FOV, 1, 1, 6000);
  const overlay = new Overlay(root);
  const pinWorld = ground.map((g) => g.clone());

  let width = 1;
  let height2 = 1;

  const stopPose = (i: number): Pose => {
    const s = stops[i];
    const f = overlay.focusPoint();
    const aspectBoost = MathUtils.clamp(1.25 / (width / height2), 1, 1.7);
    return {
      target: ground[i].clone(),
      distance: s.view.distance * aspectBoost * (overlay.isDocked ? 1.15 : 1),
      yaw: s.view.yaw,
      pitch: s.view.pitch,
      fx: f.x,
      fy: f.y,
    };
  };

  const overviewPose = (): Pose => {
    const area = overlay.overviewArea();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const g of ground) {
      minX = Math.min(minX, g.x);
      maxX = Math.max(maxX, g.x);
      minZ = Math.min(minZ, g.z);
      maxZ = Math.max(maxZ, g.z);
    }
    const pitch = overlay.isDocked ? 30 : 42;
    const margin = overlay.isDocked ? 120 : 70;
    const ex = maxX - minX + margin * 2;
    const ez = maxZ - minZ + margin * 2;
    const vt = Math.tan(MathUtils.degToRad(FOV / 2));
    const ht = vt * (width / height2);
    const dx = ex / (2 * ht * area.w);
    const dz = (ez * Math.cos(MathUtils.degToRad(pitch))) / (2 * vt * area.h);
    return {
      target: new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2 + 10),
      distance: Math.max(dx, dz) * 1.04,
      yaw: -6,
      pitch,
      fx: area.x + area.w / 2,
      fy: area.y + area.h / 2,
    };
  };

  const poseFor = (step: Step) => (step.kind === 'stop' ? stopPose(step.index) : overviewPose());

  const resize = () => {
    const rect = root.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height2 = Math.max(1, rect.height);
    renderer.setSize(width, height2, false);
    camera.aspect = width / height2;
    overlay.resize(width, height2);
    routes.setResolution(width, height2);
    tour?.refreshTarget();
  };

  let tour: Tour | undefined;
  resize();
  const start = overviewPose();
  start.distance *= reducedMotion ? 1 : 1.7;
  start.pitch = reducedMotion ? start.pitch : 22;
  start.yaw = reducedMotion ? start.yaw : -24;
  tour = new Tour({ sequence: SEQUENCE, poseFor, reducedMotion, holdStop: 7, holdOverview: 2.6 }, start);

  const ro = new ResizeObserver(resize);
  ro.observe(root);
  const content = root.querySelector('[data-content]');
  if (content) ro.observe(content);

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!reducedMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  let rise = reducedMotion ? 1 : 0;
  let time = 0;
  let last = performance.now();
  let raf = 0;
  let inView = true;
  let lastArrived = -1;
  let routeValue = 0;
  let frames = 0;
  let frameTime = 0;
  let readyFired = false;

  const updateRoutes = () => {
    const t = tour!;
    const step = t.step;
    const e = t.flightT < 0.5 ? 4 * t.flightT ** 3 : 1 - (-2 * t.flightT + 2) ** 3 / 2;
    if (step.kind === 'stop') {
      if (t.phase === 'fly') {
        routeValue = lastArrived === step.index - 1 ? step.index - 1 + e : step.index;
      } else {
        routeValue = step.index;
        lastArrived = step.index;
      }
    } else if (t.stepIndex === 0 && t.phase === 'fly' && lastArrived >= 0) {
      routeValue = lastArrived * (1 - e);
      if (t.flightT >= 1) lastArrived = -1;
    } else if (t.stepIndex === 0 && t.phase === 'hold') {
      routeValue = 0;
      lastArrived = -1;
    }
    routes.setProgress(routeValue);
  };

  const render = (now: number) => {
    raf = requestAnimationFrame(render);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;
    const t = tour!;

    rise = Math.min(1, rise + dt / 2.6);
    const riseE = 1 - (1 - rise) ** 3;
    t.update(dt);

    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);
    camera.setViewOffset(width, height2, (0.5 - t.pose.fx) * width, (0.5 - t.pose.fy) * height2, width, height2);
    applyPose(camera, t.pose, -pointer.sx * 2.4, pointer.sy * 1.6);

    const u = material.uniforms;
    u.uTime.value = time;
    u.uRise.value = riseE;
    const focus = t.stopIndex;
    u.uFocusAmt.value = focus >= 0 ? t.focusAmount : 0;
    if (focus >= 0) u.uFocus.value.copy(ground[focus]);
    u.uFocusRadius.value = MathUtils.clamp(t.pose.distance * 0.2, 14, 60);
    u.uFogNear.value = t.pose.distance * 0.9;
    u.uFogFar.value = t.pose.distance * 2.6 + 400;

    pinWorld.forEach((p, i) => p.set(ground[i].x, ground[i].y * riseE + 0.6, ground[i].z));
    routes.group.scale.y = Math.max(riseE, 0.001);
    routes.setTime(time);
    updateRoutes();

    renderer.render(scene, camera);
    overlay.update({
      camera,
      pins: pinWorld,
      cardsStop: focus,
      cardsVisible: t.cardsVisible,
      focusStop: focus,
      progress: t.holdProgress,
    });

    if (!readyFired) {
      readyFired = true;
      opts.onReady?.();
    }

    frames++;
    frameTime += dt;
    if (frames === 90) {
      const avg = frameTime / frames;
      if (avg > 0.024 && dpr > 1) {
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
    last = performance.now();
    raf = requestAnimationFrame(render);
  };
  const stopLoop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const syncLoop = () => (inView && !document.hidden ? startLoop() : stopLoop());

  const io = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    syncLoop();
  });
  io.observe(root);
  document.addEventListener('visibilitychange', syncLoop);
  syncLoop();

  return {
    goTo(stop: number) {
      tour!.goTo(stop);
    },
    setPaused(p: boolean) {
      tour!.paused = p;
    },
    get paused() {
      return tour!.paused;
    },
    dispose() {
      stopLoop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', syncLoop);
      window.removeEventListener('pointermove', onPointer);
      routes.dispose();
      geometry.dispose();
      material.dispose();
      height.dispose();
      masks.dispose();
      renderer.dispose();
    },
  };
}
