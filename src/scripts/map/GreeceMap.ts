import { motionValue, springValue } from 'motion';
import { Mesh, MathUtils, PerspectiveCamera, PlaneGeometry, Scene, TextureLoader, Vector3, WebGLRenderer, type Texture } from 'three';
import { asset } from '../../lib/asset';
import { applyPose, clonePose, easeInOutSine, flyTo, lerpAngle, type Pose } from './camera';
import { buildTimeline, dwellOf, locate, type Segment } from './journey';
import { Overlay, type Traveler } from './overlay';
import { buildLegPaths, pointOn, segmentAt, type LegPath, type RouteData } from './path';
import { decodeHeight, lonLatToPx, lonLatToWorld, MAP_H, MAP_W, TEX_H, TEX_W } from './projection';
import { RouteLines } from './routes';
import { createTerrainMaterial, FOG_HEX } from './terrainMaterial';

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
  scrollYFor(stop: number): number;
  scrollYEnd(): number;
  dispose(): void;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const EXAG = 7;
const FOV = 30;
const smooth = MathUtils.smoothstep;

const SCROLL_SPRING = { stiffness: 30, damping: 11, restDelta: 0.0005 };
const TRACK_PULL = 1.3;
const TRACK_LAG = 0.12;
const TRACK_TURN = 20;

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

  const timeline = buildTimeline(route.legs.map((l) => l.km));
  section.style.setProperty('--units', String(timeline.total));
  const dwells = stops.map((_, i) => dwellOf(timeline, i)!);
  const last = stops.length - 1;

  const camera = new PerspectiveCamera(FOV, 1, 1, 6000);
  const overlay = new Overlay(root);
  const pinWorld = ground.map((g) => g.clone());

  let width = 1;
  let height2 = 1;
  let sectionTop = 0;
  let scrollable = 1;

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

  const legFitPose = (i: number) => {
    const f = overlay.focusPoint();
    const area = { x: f.x - 0.22, y: f.y - 0.25, w: 0.44, h: 0.4 };
    return fitPose(boundsOf(paths[i].points), 46, (stops[i].view.yaw + stops[i + 1].view.yaw) / 2, 30, 0, overlay.isDocked ? overlay.overviewArea() : area);
  };

  let poses = { overview: overviewPose(), stops: stops.map((_, i) => stopPose(i)) };

  const tmp = new Vector3();
  const tmpSmooth = new Vector3();
  const ahead = new Vector3();
  const behind = new Vector3();
  const pose: Pose = clonePose(poses.overview);

  const legPose = (i: number, u: number, out: Pose) => {
    const a = poses.stops[i];
    const b = poses.stops[i + 1];
    const leg = paths[i];
    const e = easeInOutSine(u);
    const d = e * leg.length;
    const w = smooth(u, 0, 0.2) * (1 - smooth(u, 0.8, 1));
    const pull = TRACK_PULL + Math.min(0.4, leg.km / 500);
    out.distance = Math.exp(MathUtils.lerp(Math.log(a.distance), Math.log(b.distance), e)) * (1 + (pull - 1) * w);
    pointOn(leg, d - out.distance * TRACK_LAG * Math.min(1, width / height2 / 1.6), tmpSmooth, true);
    out.target.lerpVectors(a.target, b.target, e).lerp(tmpSmooth, w);
    const span = out.distance * 0.3;
    pointOn(leg, d - span, behind, true);
    pointOn(leg, d + span, ahead, true);
    const side = MathUtils.radToDeg(Math.atan2(ahead.z - behind.z, behind.x - ahead.x));
    const yaw = lerpAngle(a.yaw, b.yaw, e);
    const turn = lerpAngle(yaw, side, 1) - yaw;
    out.yaw = yaw + TRACK_TURN * Math.sin(MathUtils.degToRad(2 * turn)) * w;
    out.pitch = MathUtils.lerp(a.pitch, b.pitch, e) - 4 * w;
    out.fx = MathUtils.lerp(a.fx, b.fx, e);
    out.fy = MathUtils.lerp(a.fy, b.fy, e);
  };

  const copyPose = (src: Pose, out: Pose) => {
    out.target.copy(src.target);
    out.distance = src.distance;
    out.yaw = src.yaw;
    out.pitch = src.pitch;
    out.fx = src.fx;
    out.fy = src.fy;
  };

  const poseAt = (seg: Segment, u: number, out: Pose) => {
    if (reducedMotion) {
      if (seg.kind === 'dwell') copyPose(poses.stops[seg.stop], out);
      else if (seg.kind === 'leg') copyPose(legFitPose(seg.leg), out);
      else copyPose(poses.overview, out);
      return;
    }
    const arc = Math.sin(Math.PI * u);
    switch (seg.kind) {
      case 'intro':
        copyPose(poses.overview, out);
        out.yaw += arc * 2;
        break;
      case 'approach':
        flyTo(poses.overview, poses.stops[0], u, out);
        break;
      case 'dwell':
        copyPose(poses.stops[seg.stop], out);
        out.yaw += arc * 3;
        out.distance *= 1 - arc * 0.04;
        break;
      case 'leg':
        legPose(seg.leg, u, out);
        break;
      case 'outro':
        flyTo(poses.stops[last], poses.overview, u, out);
        break;
    }
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
    scrollable = Math.max(1, section.offsetHeight - root.offsetHeight);
    poses = { overview: overviewPose(), stops: stops.map((_, i) => stopPose(i)) };
  };
  measure();

  const scrollT = () => MathUtils.clamp((window.scrollY - sectionTop) / scrollable, 0, 1) * timeline.total;
  const progress = motionValue(scrollT());
  const eased = reducedMotion ? progress : springValue(progress, SCROLL_SPRING);
  const onScroll = () => progress.set(scrollT());
  window.addEventListener('scroll', onScroll, { passive: true });
  let ts = eased.get();

  const ro = new ResizeObserver(() => {
    measure();
    onScroll();
  });
  ro.observe(root);
  ro.observe(section);
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
  let lastNow = performance.now();
  let raf = 0;
  let inView = true;
  let frames = 0;
  let frameTime = 0;
  let readyFired = false;
  let arrived = -1;
  const fills = stops.map(() => 0);

  const render = (now: number) => {
    raf = requestAnimationFrame(render);
    const dt = Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;
    time += dt;

    const target = progress.get();
    ts = eased.get();
    const settled = Math.abs(target - ts) < 0.5;
    const { seg, u } = locate(timeline, ts);
    poseAt(seg, u, pose);

    rise = Math.min(1, rise + dt / 2.6);
    const riseE = 1 - (1 - rise) ** 3;
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);
    camera.setViewOffset(width, height2, (0.5 - pose.fx) * width, (0.5 - pose.fy) * height2, width, height2);
    applyPose(camera, pose, -pointer.sx * 2.2, pointer.sy * 1.4);

    let activeStop = -1;
    let nextStop = -1;
    let polaroidStop = -1;
    let focusStop = -1;
    let focusAmt = 0;
    let panel = 'intro';
    let traveler: Traveler | null = null;

    if (seg.kind === 'approach') {
      focusStop = 0;
      focusAmt = smooth(u, 0.75, 1);
      panel = u < 0.5 ? 'intro' : 'stop-0';
      lines.setProgress(-1, 0);
    } else if (seg.kind === 'dwell') {
      activeStop = focusStop = seg.stop;
      focusAmt = 1;
      panel = `stop-${seg.stop}`;
      if (settled && u > 0.1 && u < 0.92) polaroidStop = seg.stop;
      lines.setProgress(seg.stop, 0);
    } else if (seg.kind === 'leg') {
      const i = seg.leg;
      const leg = paths[i];
      const d = easeInOutSine(u) * leg.length;
      nextStop = i + 1;
      focusStop = u < 0.5 ? i : i + 1;
      focusAmt = u < 0.5 ? 1 - smooth(u, 0, 0.15) : smooth(u, 0.85, 1);
      panel = `stop-${u < 0.5 ? i : i + 1}`;
      lines.setProgress(i, d);
      if (u > 0.03 && u < 0.97) {
        const shown = displaySegment(leg, d);
        traveler = {
          pos: pointOn(leg, d, tmp),
          mode: shown.mode,
          title: `${stops[i].name} → ${stops[i + 1].name}`,
          meta: `${shown.km} km by ${shown.mode === 'sea' ? 'ferry' : 'road'}`,
        };
      }
    } else if (seg.kind === 'outro') {
      focusStop = last;
      focusAmt = 1 - smooth(u, 0, 0.25);
      panel = u < 0.35 ? `stop-${last}` : 'outro';
      lines.setProgress(paths.length, 0);
    } else {
      lines.setProgress(-1, 0);
    }

    let current = -1;
    stops.forEach((_, i) => {
      const start = dwells[i].t0;
      const end = i < last ? dwells[i + 1].t0 : timeline.total;
      fills[i] = MathUtils.clamp((ts - start) / (end - start), 0, 1);
      if (ts >= start && (ts < end || i === last)) current = i;
    });

    if (activeStop !== arrived) {
      arrived = activeStop;
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

    pinWorld.forEach((p, i) => p.set(ground[i].x, ground[i].y * riseE + 0.6, ground[i].z));
    lines.group.scale.y = Math.max(riseE, 0.001);
    if (traveler) traveler.pos.y *= riseE;
    lines.setTime(time);

    renderer.render(scene, camera);
    overlay.update({
      camera,
      pins: pinWorld,
      activeStop,
      nextStop,
      polaroidStop,
      traveler,
      fills,
      current,
      panel,
      intro: 1 - smooth(ts, 0, 0.35),
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

  const io = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    syncLoop();
  });
  io.observe(root);
  document.addEventListener('visibilitychange', syncLoop);
  syncLoop();

  const yForT = (t: number) => sectionTop + (t / timeline.total) * scrollable;

  return {
    scrollYFor(stop: number) {
      const d = dwells[stop];
      return yForT(d.t0 + (d.t1 - d.t0) * 0.5);
    },
    scrollYEnd() {
      return sectionTop + section.offsetHeight;
    },
    dispose() {
      stopLoop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', syncLoop);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      eased.destroy();
      progress.destroy();
      lines.dispose();
      geometry.dispose();
      material.dispose();
      height.dispose();
      masks.dispose();
      renderer.dispose();
    },
  };
}
