import meta from '../../data/map-meta.json';

const WORLD = meta.tile * 2 ** meta.zoom;

export const KM_PER_PX = meta.kmPerPx;
export const TEX_W = meta.pixels.width;
export const TEX_H = meta.pixels.height;
export const MAP_W = TEX_W * KM_PER_PX;
export const MAP_H = TEX_H * KM_PER_PX;
export const ELEV_MAX = meta.elevMax;
export const DEPTH_MAX = meta.depthMax;
export const SDF_RANGE = meta.sdfRange;

export function lonLatToPx(lon: number, lat: number): [number, number] {
  const s = Math.sin((lat * Math.PI) / 180);
  const x = ((lon + 180) / 360) * WORLD - meta.pixels.x0;
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD - meta.pixels.y0;
  return [x, y];
}

export function lonLatToWorld(lon: number, lat: number): { x: number; z: number } {
  const [px, py] = lonLatToPx(lon, lat);
  return { x: (px - TEX_W / 2) * KM_PER_PX, z: (py - TEX_H / 2) * KM_PER_PX };
}

export function decodeHeight(byte: number): number {
  const t = byte - 128;
  return t >= 0 ? (t / 127) ** 2 * ELEV_MAX : -((-t / 128) ** 2) * DEPTH_MAX;
}
