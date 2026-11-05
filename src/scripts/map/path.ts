import { Vector3 } from 'three';
import { lonLatToWorld } from './projection';

export type Mode = 'road' | 'sea';

export interface RouteData {
  legs: { from: string; to: string; km: number; segments: { mode: Mode; km: number; points: number[][] }[] }[];
  totals: { road: number; sea: number };
}

export interface PathSegment {
  mode: Mode;
  km: number;
  start: number;
  end: number;
  points: Vector3[];
}

export interface LegPath {
  km: number;
  length: number;
  points: Vector3[];
  smooth: Vector3[];
  cum: number[];
  segments: PathSegment[];
}

const STEP = 1.2;
const SMOOTH = 22;
const LIFT = 0.5;

function sampleSegment(points: number[][], toWorld: (lon: number, lat: number, sea: boolean) => Vector3, sea: boolean) {
  const out: Vector3[] = [];
  for (let i = 1; i < points.length; i++) {
    const [lon0, lat0] = points[i - 1];
    const [lon1, lat1] = points[i];
    const a = toWorld(lon0, lat0, sea);
    const b = toWorld(lon1, lat1, sea);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
    for (let s = i === 1 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      out.push(toWorld(lon0 + (lon1 - lon0) * t, lat0 + (lat1 - lat0) * t, sea));
    }
  }
  return out;
}

export function buildLegPaths(route: RouteData, heightAt: (lon: number, lat: number) => number, exag: number): LegPath[] {
  const toWorld = (lon: number, lat: number, sea: boolean) => {
    const { x, z } = lonLatToWorld(lon, lat);
    return new Vector3(x, (sea ? 0 : heightAt(lon, lat) * 0.001 * exag) + LIFT, z);
  };

  return route.legs.map((leg) => {
    const points: Vector3[] = [];
    const segments: PathSegment[] = [];
    for (const seg of leg.segments) {
      const pts = sampleSegment(seg.points, toWorld, seg.mode === 'sea');
      if (points.length) pts[0].copy(points[points.length - 1]);
      const startIndex = Math.max(0, points.length - 1);
      points.push(...(points.length ? pts.slice(1) : pts));
      segments.push({ mode: seg.mode, km: seg.km, start: startIndex, end: points.length - 1, points: pts });
    }
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
    for (const s of segments) {
      s.start = cum[s.start];
      s.end = cum[s.end];
    }
    const smooth = points.map((_, i) => {
      const acc = new Vector3();
      let n = 0;
      for (let j = i; j >= 0 && cum[i] - cum[j] <= SMOOTH; j--, n++) acc.add(points[j]);
      for (let j = i + 1; j < points.length && cum[j] - cum[i] <= SMOOTH; j++, n++) acc.add(points[j]);
      return acc.divideScalar(n);
    });
    return { km: leg.km, length: cum[cum.length - 1], points, smooth, cum, segments };
  });
}

function locateIndex(cum: number[], d: number) {
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function pointOn(leg: LegPath, d: number, out: Vector3, smooth = false) {
  const list = smooth ? leg.smooth : leg.points;
  const clamped = Math.min(Math.max(d, 0), leg.length);
  const i = Math.min(locateIndex(leg.cum, clamped), list.length - 2);
  const span = leg.cum[i + 1] - leg.cum[i] || 1;
  return out.lerpVectors(list[i], list[i + 1], (clamped - leg.cum[i]) / span);
}

export function segmentAt(leg: LegPath, d: number): PathSegment {
  return leg.segments.find((s) => d <= s.end) ?? leg.segments[leg.segments.length - 1];
}
