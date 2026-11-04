import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'map');
const OUT_PUBLIC = path.join(ROOT, 'public', 'map');
const OUT_DATA = path.join(ROOT, 'src', 'data');

const BBOX = { west: 17.6, east: 31.0, south: 33.6, north: 42.6 };
const ZOOM = 8;
const TILE = 256;
const MASK_SS = 2;
const SDF_RANGE = 24;
const ELEV_MAX = 3000;
const DEPTH_MAX = 5000;
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const worldSize = TILE * 2 ** ZOOM;
const lonToX = (lon) => ((lon + 180) / 360) * worldSize;
const latToY = (lat) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize;
};

const X0 = Math.floor(lonToX(BBOX.west));
const X1 = Math.ceil(lonToX(BBOX.east));
const Y0 = Math.floor(latToY(BBOX.north));
const Y1 = Math.ceil(latToY(BBOX.south));
const W = X1 - X0;
const H = Y1 - Y0;

async function cached(name, url) {
  const file = path.join(CACHE, name);
  try {
    return await fs.readFile(file);
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buf);
    return buf;
  }
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await fn(queue.shift());
    }),
  );
}

async function buildElevation() {
  const elev = new Float32Array(W * H);
  const tiles = [];
  for (let ty = Math.floor(Y0 / TILE); ty <= Math.floor((Y1 - 1) / TILE); ty++)
    for (let tx = Math.floor(X0 / TILE); tx <= Math.floor((X1 - 1) / TILE); tx++) tiles.push([tx, ty]);

  let done = 0;
  await pool(tiles, 8, async ([tx, ty]) => {
    const png = await cached(`terrarium/${ZOOM}/${tx}/${ty}.png`, TILE_URL(ZOOM, tx, ty));
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let py = 0; py < TILE; py++) {
      const gy = ty * TILE + py - Y0;
      if (gy < 0 || gy >= H) continue;
      for (let px = 0; px < TILE; px++) {
        const gx = tx * TILE + px - X0;
        if (gx < 0 || gx >= W) continue;
        const i = (py * info.width + px) * info.channels;
        elev[gy * W + gx] = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
      }
    }
    process.stdout.write(`\r  tiles ${++done}/${tiles.length}`);
  });
  process.stdout.write('\n');
  return elev;
}

function ringToPath(ring, scale) {
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const x = ((lonToX(lon) - X0) * scale).toFixed(2);
    const y = ((latToY(lat) - Y0) * scale).toFixed(2);
    d += `${i ? 'L' : 'M'}${x} ${y}`;
  }
  return `${d}Z`;
}

function polygonsOf(feature) {
  const g = feature.geometry;
  if (!g) return [];
  return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
}

function featureBBox(feature) {
  let w = 180, e = -180, s = 90, n = -90;
  for (const poly of polygonsOf(feature))
    for (const [lon, lat] of poly[0]) {
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  return { w, e, s, n };
}

async function rasterize(features, scale) {
  const w = W * scale;
  const h = H * scale;
  const paths = features
    .flatMap((f) => polygonsOf(f))
    .map((poly) => poly.map((ring) => ringToPath(ring, scale)).join(''))
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#000"/><path fill="#fff" fill-rule="evenodd" d="${paths}"/></svg>`;
  const { data, info } = await sharp(Buffer.from(svg), { limitInputPixels: false, unlimited: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = data[i * info.channels];
  return { data: out, w, h };
}

function edt(grid, w, h) {
  const INF = 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    pass(h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  return grid;
}

function signedDistance(mask, w, h) {
  const toLand = new Float32Array(w * h);
  const toSea = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const land = mask[i] >= 128;
    toLand[i] = land ? 0 : 1e20;
    toSea[i] = land ? 1e20 : 0;
  }
  edt(toLand, w, h);
  edt(toSea, w, h);
  const sdf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    sdf[i] = mask[i] >= 128 ? Math.sqrt(toSea[i]) - 0.5 : 0.5 - Math.sqrt(toLand[i]);
  }
  return sdf;
}

function downsample(src, w, h, f) {
  const ow = Math.floor(w / f);
  const oh = Math.floor(h / f);
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      let s = 0;
      for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += src[(y * f + j) * w + x * f + i];
      out[y * ow + x] = s / (f * f);
    }
  return out;
}

function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const dist = len < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (dist > max) {
        max = dist;
        idx = i;
      }
    }
    if (max > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

function buildOutline(greece) {
  const gb = { w: 19.3, e: 29.75, s: 34.75, n: 41.8 };
  const ox = lonToX(gb.w);
  const oy = latToY(gb.n);
  const sx = 1000 / (lonToX(gb.e) - ox);
  const vbH = Math.round((latToY(gb.s) - oy) * sx);
  let d = '';
  for (const poly of polygonsOf(greece)) {
    const pts = poly[0].map(([lon, lat]) => [(lonToX(lon) - ox) * sx, (latToY(lat) - oy) * sx]);
    if (ringArea(pts) < 12) continue;
    const s = simplify(pts, 1.3);
    if (s.length < 4) continue;
    d += s.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
  }
  return {
    viewBox: `0 0 1000 ${vbH}`,
    width: 1000,
    height: vbH,
    projection: { originX: ox, originY: oy, scale: sx },
    d,
  };
}

async function main() {
  await fs.mkdir(OUT_PUBLIC, { recursive: true });
  await fs.mkdir(OUT_DATA, { recursive: true });
  console.log(`Raster ${W}x${H} px (zoom ${ZOOM})`);

  console.log('Elevation tiles…');
  const elev = await buildElevation();

  console.log('Natural Earth countries…');
  const ne = JSON.parse((await cached('ne_10m_admin_0_countries.geojson', NE_URL)).toString('utf8'));
  const inBox = ne.features.filter((f) => {
    const b = featureBBox(f);
    return b.e >= BBOX.west - 1 && b.w <= BBOX.east + 1 && b.n >= BBOX.south - 1 && b.s <= BBOX.north + 1;
  });
  const greece = inBox.find((f) => f.properties.ADM0_A3 === 'GRC');
  console.log(`  ${inBox.length} countries in view: ${inBox.map((f) => f.properties.ADM0_A3).join(', ')}`);

  console.log('Land mask + signed distance field…');
  const land = await rasterize(inBox, MASK_SS);
  const sdfHi = signedDistance(land.data, land.w, land.h);
  const sdf = downsample(sdfHi, land.w, land.h, MASK_SS).map((v) => v / MASK_SS);

  console.log('Greece mask…');
  const gr = await rasterize([greece], 1);

  console.log('Encoding textures…');
  const height = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) {
    const isLand = sdf[i] > 0;
    const h = elev[i];
    let v;
    if (isLand) v = 128 + 127 * Math.sqrt(Math.min(Math.max(h, 0), ELEV_MAX) / ELEV_MAX);
    else v = 128 - 128 * Math.sqrt(Math.min(Math.max(-h, 0), DEPTH_MAX) / DEPTH_MAX);
    height[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
  const masks = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    masks[i * 3] = Math.max(0, Math.min(255, Math.round(128 + (sdf[i] * 127) / SDF_RANGE)));
    masks[i * 3 + 1] = gr.data[i];
  }

  await sharp(height, { raw: { width: W, height: H, channels: 1 } })
    .webp({ quality: 90, smartSubsample: false })
    .toFile(path.join(OUT_PUBLIC, 'height.webp'));
  await sharp(masks, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(OUT_PUBLIC, 'masks.png'));

  const lat0 = (BBOX.north + BBOX.south) / 2;
  const kmPerPx = (156543.03392 * Math.cos((lat0 * Math.PI) / 180)) / 2 ** ZOOM / 1000;
  const meta = {
    zoom: ZOOM,
    tile: TILE,
    bbox: BBOX,
    pixels: { x0: X0, y0: Y0, width: W, height: H },
    kmPerPx,
    elevMax: ELEV_MAX,
    depthMax: DEPTH_MAX,
    sdfRange: SDF_RANGE,
  };
  await fs.writeFile(path.join(OUT_DATA, 'map-meta.json'), JSON.stringify(meta, null, 2));
  await fs.writeFile(path.join(OUT_DATA, 'greece-outline.json'), JSON.stringify(buildOutline(greece)));

  for (const f of ['height.webp', 'masks.png']) {
    const { size } = await fs.stat(path.join(OUT_PUBLIC, f));
    console.log(`  public/map/${f}: ${(size / 1024).toFixed(0)} KB`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
