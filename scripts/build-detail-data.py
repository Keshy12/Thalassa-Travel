"""Build the land-cover texture and detail layers for the map.

Sources (no API keys needed):
  - ESA WorldCover 10 m 2021 (v200), read as Cloud-Optimised GeoTIFF overviews from AWS S3
  - Overture Maps (release below), read as GeoParquet from AWS S3 with bbox filters

Outputs:
  public/map/landcover.webp  RGBA, same pixel grid as height.webp
                             R = tree cover, G = built-up, B = cropland, A = shrub + grassland
  public/map/detail.json     trees, houses, landmarks and roads for the route region

Requires Python 3.11+ with: numpy scipy pillow rasterio pyarrow shapely
  python -m venv .venv && .venv/bin/pip install numpy scipy pillow rasterio pyarrow shapely
  .venv/bin/python scripts/build-detail-data.py
"""

import json
import math
import re
import os
import random
from pathlib import Path

import numpy as np
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import pyarrow.parquet as pq
import rasterio
from PIL import Image
from scipy.ndimage import uniform_filter
from shapely import wkb

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache' / 'detail'
META = json.loads((ROOT / 'src' / 'data' / 'map-meta.json').read_text())
OVERTURE = 'overturemaps-us-west-2/release/2026-10-21.0'
WORLDCOVER = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif'

MOSAIC = {'west': 18.0, 'east': 30.0, 'south': 33.0, 'north': 42.0}
PER_DEG = 750
REGION = {'west': 20.55, 'east': 24.1, 'south': 37.1, 'north': 38.45}
STOPS = [(23.7262, 37.9715), (21.7345, 38.2462), (21.1153, 37.8836), (20.8695, 37.7225), (21.63, 37.638), (21.824142, 37.3866)]
CLASSES = {'tree': [10], 'shrub': [20], 'grass': [30], 'crop': [40], 'built': [50]}

random.seed(7)
if os.environ.get('SSL_CERT_FILE'):
    os.environ.setdefault('CURL_CA_BUNDLE', os.environ['SSL_CERT_FILE'])


def worldcover_mosaic():
    cache = CACHE / 'worldcover-mosaic.npy'
    if cache.exists():
        return np.load(cache)
    w = int((MOSAIC['east'] - MOSAIC['west']) * PER_DEG)
    h = int((MOSAIC['north'] - MOSAIC['south']) * PER_DEG)
    out = np.zeros((h, w), dtype=np.uint8)
    size = 3 * PER_DEG
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif'):
        for lat in range(int(MOSAIC['south']), int(MOSAIC['north']), 3):
            for lon in range(int(MOSAIC['west']), int(MOSAIC['east']), 3):
                tile = f'N{lat:02d}E{lon:03d}'
                try:
                    with rasterio.open('/vsicurl/' + WORLDCOVER.format(tile=tile)) as src:
                        a = src.read(1, out_shape=(size, size))
                except rasterio.errors.RasterioIOError:
                    print('  no tile', tile)
                    continue
                row = int((MOSAIC['north'] - (lat + 3)) * PER_DEG)
                col = int((lon - MOSAIC['west']) * PER_DEG)
                out[row : row + size, col : col + size] = a
                print('  tile', tile)
    CACHE.mkdir(parents=True, exist_ok=True)
    np.save(cache, out)
    return out


def fractions(mosaic, size):
    return {k: uniform_filter(np.isin(mosaic, v).astype(np.float32), size=size, mode='nearest') for k, v in CLASSES.items()}


def mosaic_index(lon, lat):
    col = np.clip(((lon - MOSAIC['west']) * PER_DEG).astype(int), 0, None)
    row = np.clip(((MOSAIC['north'] - lat) * PER_DEG).astype(int), 0, None)
    return row, col


def px_to_lonlat(px, py):
    world = META['tile'] * 2 ** META['zoom']
    lon = (px + META['pixels']['x0']) / world * 360 - 180
    n = math.pi - 2 * math.pi * (py + META['pixels']['y0']) / world
    lat = np.degrees(np.arctan(np.sinh(n)))
    return lon, lat


def landcover_texture(frac):
    w, h = META['pixels']['width'], META['pixels']['height']
    px, py = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    lon, lat = px_to_lonlat(px, py)
    inside = (lon >= MOSAIC['west']) & (lon < MOSAIC['east']) & (lat >= MOSAIC['south']) & (lat < MOSAIC['north'])
    row, col = mosaic_index(np.where(inside, lon, MOSAIC['west']), np.where(inside, lat, MOSAIC['north']))
    row = np.minimum(row, frac['tree'].shape[0] - 1)
    col = np.minimum(col, frac['tree'].shape[1] - 1)

    def ch(arr):
        return np.where(inside, np.clip(arr[row, col] * 255, 0, 255), 0).astype(np.uint8)

    rgba = np.dstack([ch(frac['tree']), ch(frac['built']), ch(frac['crop']), ch(frac['shrub'] + frac['grass'])])
    out = ROOT / 'public' / 'map' / 'landcover.webp'
    img = Image.fromarray(rgba, 'RGBA').resize((w // 2, h // 2), Image.Resampling.BOX)
    img.save(out, 'WEBP', quality=80, method=6)
    print('  wrote', out.relative_to(ROOT), out.stat().st_size // 1024, 'KB')


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def scatter(frac, key, km, lo, hi, cap):
    r = REGION
    dlat = km / 111.0
    dlon = km / (111.0 * math.cos(math.radians((r['south'] + r['north']) / 2)))
    pts = []
    lat = r['south']
    while lat < r['north']:
        lon = r['west']
        while lon < r['east']:
            jlon = lon + random.random() * dlon
            jlat = lat + random.random() * dlat
            row, col = mosaic_index(np.array(jlon), np.array(jlat))
            f = float(frac[key][row, col])
            if random.random() < smoothstep(lo, hi, f):
                pts.append((jlon, jlat, f))
            lon += dlon
        lat += dlat
    if len(pts) > cap:
        pts = random.sample(pts, cap)
    return pts


SCALE = 2000


def enc(lon, lat):
    return round((lon - REGION['west']) * SCALE), round((lat - REGION['south']) * SCALE)


def overture(theme, kind, columns, extra=None):
    s3 = pafs.S3FileSystem(anonymous=True, region='us-west-2')
    d = ds.dataset(f'{OVERTURE}/theme={theme}/type={kind}/', filesystem=s3, format='parquet')
    r = REGION
    f = (pc.field('bbox', 'xmin') > r['west']) & (pc.field('bbox', 'xmax') < r['east'])
    f = f & (pc.field('bbox', 'ymin') > r['south']) & (pc.field('bbox', 'ymax') < r['north'])
    if extra is not None:
        f = f & extra
    return d.to_table(columns=columns, filter=f)


def cached_table(name, fetch):
    path = CACHE / f'{name}.parquet'
    if path.exists():
        return pq.read_table(path)
    t = fetch()
    CACHE.mkdir(parents=True, exist_ok=True)
    pq.write_table(t, path)
    return t


def km_between(a, b):
    dx = (a[0] - b[0]) * 111 * math.cos(math.radians(a[1]))
    dy = (a[1] - b[1]) * 111
    return math.hypot(dx, dy)


CASTLE = re.compile(r'κάστρ|castle|φρούρι|fortress|(^|\s)πύργος|tower', re.I)
ANCIENT = re.compile(r'ναό|ναος|temple|αρχαί|αρχαι|ancient|archaeolog|στάδι|stadium|θέατρ|theat|ιερό|sanctuary|τύμβ|tomb|acropol|ακρόπολ|odeon|ωδεί|agora|αγορά', re.I)
LIGHT = re.compile(r'φάρο|φαρο|lighthouse', re.I)
JUNK = re.compile(r'apartment|suite|villa|hotel|resort|studio|room|bank|home|village|square|πλατεία|accommodation|me gusta|cafe|bar|μουσεί|μουσει|museum|collection|ιερός ναός|ιερος ναος|λιμάνι|!|the one|olive temple|apollon tower|george castle', re.I)
RENAME = {
    'Κάστρο Χλεμούτσι / Clermont Ηλείας': 'Chlemoutsi Castle',
    'Κάστρο Πάτρας': 'Patras Castle',
    'Αρχαίο Στάδιο Ολυμπίας': 'Ancient Stadium of Olympia',
    'Ναός Επικούριου Απόλλωνα': 'Temple of Apollo Epicurius',
    'Κάστρο Αντιρρίου': 'Antirrio Castle',
    'Φρούριο Ρίου': 'Rio Castle',
    'Αρχαιολογικός Χώρος Βούντενης': 'Voudeni Mycenaean Cemetery',
    'Ναός της Αφαίας': 'Temple of Aphaia',
    'Φρούριο Ναυπάκτου': 'Nafpaktos Castle',
    'Αρχαίο Θέατρο Μεσσήνης': 'Theatre of Ancient Messene',
    'Τύμβος Μαραθώνα': 'Marathon Tomb',
    'Ιερό Αρτέμιδος Βραυρώνιας': 'Sanctuary of Artemis, Brauron',
    'Ιερό Θεάς Αφροδίτης': 'Sanctuary of Aphrodite',
    'Πύργος Βασιλίσσης': "Queen's Tower",
    'Αγία Σόφια Αρχαιολογικός Χώρος': 'Agia Sofia site',
}


def classify(name, kind):
    if JUNK.search(name):
        return None
    if LIGHT.search(name):
        return 'lighthouse'
    if CASTLE.search(name):
        return 'castle'
    if ANCIENT.search(name):
        return 'ruin'
    return None


def landmarks():
    t = cached_table('places', lambda: overture('places', 'place', ['names', 'basic_category', 'confidence', 'bbox']))
    kinds = {'castle': 'castle', 'fort': 'castle', 'lighthouse': 'lighthouse', 'historic_site': 'ruin', 'monument': 'ruin', 'museum': 'ruin'}
    rows = []
    for p in t.to_pylist():
        kind = kinds.get(p['basic_category'])
        names = p['names'] or {}
        common = dict(names.get('common') or [])
        name = common.get('en') or names.get('primary')
        if not kind or not name or (p['confidence'] or 0) < 0.6:
            continue
        kind = classify(name, kind)
        if not kind:
            continue
        name = RENAME.get(name.strip(), name.strip())
        b = p['bbox']
        lon, lat = (b['xmin'] + b['xmax']) / 2, (b['ymin'] + b['ymax']) / 2
        near = min(km_between((lon, lat), s) for s in STOPS)
        if near > 45:
            continue
        rows.append({'kind': kind, 'name': name.strip(), 'lon': lon, 'lat': lat, 'score': p['confidence'] - near / 200})
    rows.sort(key=lambda r: -r['score'])
    picked = []
    for r in rows:
        if any(km_between((r['lon'], r['lat']), (q['lon'], q['lat'])) < 2.5 for q in picked):
            continue
        if any(q['name'] == r['name'] for q in picked):
            continue
        picked.append(r)
        if len(picked) >= 90:
            break
    print('  landmarks', len(picked), {k: sum(1 for p in picked if p['kind'] == k) for k in set(kinds.values())})
    return [[*enc(p['lon'], p['lat']), p['kind'], p['name']] for p in picked]


def roads():
    t = cached_table(
        'roads',
        lambda: overture(
            'transportation',
            'segment',
            ['class', 'geometry'],
            (pc.field('subtype') == 'road') & pc.field('class').isin(['motorway', 'trunk', 'primary', 'secondary']),
        ),
    )
    t = t.filter(pc.field('class').isin(['motorway', 'trunk', 'primary']))
    rank = {'motorway': 0, 'trunk': 0, 'primary': 1}
    lines = []
    total = 0
    for r in t.to_pylist():
        g = wkb.loads(r['geometry']).simplify(0.0015)
        coords = list(g.coords)
        if len(coords) < 2:
            continue
        flat = []
        for lon, lat in coords:
            p = enc(lon, lat)
            if len(flat) >= 2 and flat[-2:] == list(p):
                continue
            flat.extend(p)
        if len(flat) < 4:
            continue
        total += len(coords)
        lines.append([rank[r['class']], flat])
    print('  roads', len(lines), 'polylines', total, 'points')
    return lines


def main():
    print('WorldCover')
    mosaic = worldcover_mosaic()
    landcover_texture(fractions(mosaic, 3))
    fine = fractions(mosaic, 2)
    print('Scatter')
    trees = scatter(fine, 'tree', 0.62, 0.3, 0.75, 18000)
    houses = scatter(fine, 'built', 0.4, 0.12, 0.55, 9000)
    print('  trees', len(trees), 'houses', len(houses))
    print('Overture')
    data = {
        'origin': [REGION['west'], REGION['south']],
        'scale': SCALE,
        'trees': [v for lon, lat, f in trees for v in (*enc(lon, lat), 1 if random.random() < 0.35 else 0)],
        'houses': [v for lon, lat, f in houses for v in (*enc(lon, lat), 1 if f > 0.62 else 0)],
        'landmarks': landmarks(),
        'roads': roads(),
    }
    out = ROOT / 'public' / 'map' / 'detail.json'
    out.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False))
    print('  wrote', out.relative_to(ROOT), out.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
