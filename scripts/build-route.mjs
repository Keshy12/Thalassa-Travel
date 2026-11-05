import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'map');
const ROADS_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson';
const meta = JSON.parse(await fs.readFile(path.join(ROOT, 'src', 'data', 'map-meta.json'), 'utf8'));

const places = {
  athens: [23.7262, 37.9715],
  patras: [21.7345, 38.2462],
  chlemoutsi: [21.1153, 37.8836],
  kyllini: [21.1497, 37.9367],
  zakynthosPort: [20.9005, 37.7817],
  turtleBay: [20.8695, 37.7225],
  olympia: [21.63, 37.638],
  aigio: [22.085, 38.245],
  barbalekou: [21.824142, 37.386581],
};

const lanes = {
  'kyllini-zakynthos': [
    [21.1497, 37.9367],
    [21.14, 37.952],
    [21.095, 37.945],
    [21.02, 37.865],
    [20.925, 37.79],
    [20.9005, 37.7817],
  ],
};
const reverse = (pts) => [...pts].reverse();

const legs = [
  { from: 'athens', to: 'patras', segments: [{ mode: 'road', from: 'athens', to: 'patras', via: ['aigio'] }] },
  { from: 'patras', to: 'chlemoutsi', segments: [{ mode: 'road', from: 'patras', to: 'chlemoutsi' }] },
  {
    from: 'chlemoutsi',
    to: 'turtleBay',
    segments: [
      { mode: 'road', from: 'chlemoutsi', to: 'kyllini', direct: true },
      { mode: 'sea', lane: 'kyllini-zakynthos' },
      { mode: 'road', from: 'zakynthosPort', to: 'turtleBay', direct: true },
    ],
  },
  {
    from: 'turtleBay',
    to: 'olympia',
    segments: [
      { mode: 'road', from: 'turtleBay', to: 'zakynthosPort', direct: true },
      { mode: 'sea', lane: 'kyllini-zakynthos', reverse: true },
      { mode: 'road', from: 'kyllini', to: 'olympia' },
    ],
  },
  { from: 'olympia', to: 'barbalekou', segments: [{ mode: 'road', from: 'olympia', to: 'barbalekou' }] },
];

const R = 6371;
function km([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const lengthKm = (pts) => pts.reduce((sum, p, i) => (i ? sum + km(pts[i - 1], p) : 0), 0);

async function cached(name, url) {
  const file = path.join(CACHE, name);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const text = await res.text();
    await fs.mkdir(CACHE, { recursive: true });
    await fs.writeFile(file, text);
    return text;
  }
}

function buildGraph(roads) {
  const ids = new Map();
  const coords = [];
  const adj = [];
  const node = ([lon, lat]) => {
    const key = `${lon.toFixed(4)},${lat.toFixed(4)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = coords.length;
      ids.set(key, id);
      coords.push([lon, lat]);
      adj.push([]);
    }
    return id;
  };
  const link = (a, b) => {
    if (a === b) return;
    const w = km(coords[a], coords[b]);
    adj[a].push([b, w]);
    adj[b].push([a, w]);
  };
  const ends = [];
  for (const f of roads) {
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const line of lines) {
      let prev = -1;
      for (const p of line) {
        const id = node(p);
        if (prev >= 0) link(prev, id);
        prev = id;
      }
      ends.push(node(line[0]), node(line[line.length - 1]));
    }
  }
  for (const e of ends) {
    if (adj[e].length > 1) continue;
    const near = [];
    for (let j = 0; j < coords.length; j++) {
      if (j === e || adj[e].some(([n]) => n === j)) continue;
      const d = km(coords[e], coords[j]);
      if (d < 6) near.push([d, j]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const close = near.filter(([d]) => d < 2.5);
    for (const [, j] of close.length ? close : near.slice(0, 1)) link(e, j);
  }
  return { coords, adj };
}

function nearestNodes(graph, p, count = 6) {
  return graph.coords
    .map((c, i) => [i, km(c, p)])
    .sort((a, b) => a[1] - b[1])
    .slice(0, count)
    .map(([i]) => i);
}

function dijkstra(graph, src, dst) {
  const n = graph.coords.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[src] = 0;
  const heap = [[0, src]];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === dst) break;
    for (const [v, w] of graph.adj[u]) {
      if (d + w < dist[v]) {
        dist[v] = d + w;
        prev[v] = u;
        push([dist[v], v]);
      }
    }
  }
  if (!Number.isFinite(dist[dst])) return null;
  const out = [];
  for (let u = dst; u >= 0; u = prev[u]) out.push(graph.coords[u]);
  return out.reverse();
}

function roadPath(graph, a, b) {
  let best = null;
  for (const s of nearestNodes(graph, a, 4))
    for (const t of nearestNodes(graph, b, 4)) {
      const p = dijkstra(graph, s, t);
      if (!p) continue;
      const total = lengthKm([a, ...p, b]);
      if (!best || total < best.total) best = { total, points: [a, ...p, b] };
    }
  if (!best) throw new Error(`No road path ${a} -> ${b}`);
  return best.points;
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
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
      const d = len < 1e-12 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > max) {
        max = d;
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

async function landSampler() {
  const { data, info } = await sharp(path.join(ROOT, 'public', 'map', 'masks.png')).raw().toBuffer({ resolveWithObject: true });
  const world = meta.tile * 2 ** meta.zoom;
  return ([lon, lat]) => {
    const s = Math.sin((lat * Math.PI) / 180);
    const x = Math.round(((lon + 180) / 360) * world - meta.pixels.x0);
    const y = Math.round((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world - meta.pixels.y0);
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return false;
    return data[(y * info.width + x) * info.channels] > 128;
  };
}

function checkLane(name, pts, isLand) {
  const issues = [];
  for (let i = 1; i < pts.length; i++) {
    const steps = Math.ceil(km(pts[i - 1], pts[i]) / 0.4);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
      const fromStart = lengthKm([...pts.slice(0, i), p]);
      const toEnd = lengthKm([p, ...pts.slice(i)]);
      if (fromStart < 2.5 || toEnd < 2.5) continue;
      if (isLand(p)) issues.push(`${name}: land near segment ${i - 1}->${i} at ${p[0].toFixed(3)}, ${p[1].toFixed(3)}`);
    }
  }
  return [...new Set(issues)];
}

const round = (pts) => pts.map(([lon, lat]) => [Number(lon.toFixed(4)), Number(lat.toFixed(4))]);

async function main() {
  const ne = JSON.parse(await cached('ne_10m_roads.geojson', ROADS_URL));
  const roads = ne.features.filter((f) => {
    if (!f.geometry || f.properties.type === 'Ferry Route') return false;
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    return lines.some((l) => l.some(([x, y]) => x > 19 && x < 29 && y > 34.7 && y < 42));
  });
  const graph = buildGraph(roads);
  console.log(`Road graph: ${graph.coords.length} nodes from ${roads.length} roads`);

  const isLand = await landSampler();
  const issues = Object.entries(lanes).flatMap(([name, pts]) => checkLane(name, pts, isLand));
  if (issues.length) {
    console.warn(`Ferry lanes crossing land:\n  ${issues.join('\n  ')}`);
  }

  const out = legs.map((leg) => {
    const segments = leg.segments.map((seg) => {
      let pts;
      if (seg.mode === 'sea') pts = seg.reverse ? reverse(lanes[seg.lane]) : lanes[seg.lane];
      else if (seg.direct) pts = [places[seg.from], places[seg.to]];
      else {
        const stops = [seg.from, ...(seg.via ?? []), seg.to].map((k) => places[k]);
        const joined = stops.slice(1).flatMap((p, i) => roadPath(graph, stops[i], p).slice(i ? 1 : 0));
        pts = simplify(joined, 0.0015);
      }
      return { mode: seg.mode, km: Math.round(lengthKm(pts)), points: round(pts) };
    });
    const total = segments.reduce((s, x) => s + x.km, 0);
    console.log(`${leg.from} -> ${leg.to}: ${segments.map((s) => `${s.mode} ${s.km} km (${s.points.length} pts)`).join(', ')}`);
    return { from: leg.from, to: leg.to, km: total, segments };
  });

  const totals = { road: 0, sea: 0 };
  for (const leg of out) for (const s of leg.segments) totals[s.mode] += s.km;
  await fs.writeFile(path.join(ROOT, 'src', 'data', 'route.json'), JSON.stringify({ legs: out, totals }));
  console.log(`Totals: ${totals.road} km by road, ${totals.sea} km by ferry`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
