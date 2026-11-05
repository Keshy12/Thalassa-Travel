import outline from '../data/greece-outline.json';

const WORLD = 256 * 2 ** 8;

export { outline };

export function toOutline(lon: number, lat: number): [number, number] {
  const s = Math.sin((lat * Math.PI) / 180);
  const x = ((lon + 180) / 360) * WORLD;
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD;
  return [(x - outline.projection.originX) * outline.projection.scale, (y - outline.projection.originY) * outline.projection.scale];
}
