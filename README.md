# Thalassa Travel

Landing page for Thalassa Travel: small-group journeys across Greece with an AR device included on every trip.

The hero is a scroll-driven journey over a real-time 3D relief map of Greece (three.js). As you scroll, the camera follows a car or ferry along the planned trip. Real roads and ferry lanes are drawn as you travel, and polaroid photos pop up at each destination.

## Stack

- [Astro](https://astro.build) 7, static output, TypeScript
- [three.js](https://threejs.org) without wrappers, loaded lazily so the page renders before the map
- [Motion](https://motion.dev) springs for the eased, scroll-linked camera
- Plain CSS with custom properties. No UI component libraries
- Self-hosted brand fonts: Marcellus (display) and Montserrat (text), per the brand book

## Scripts

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (Node 22.23+) |
| `npm run dev` | Dev server at `localhost:4321` |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run check` | Type-check `.astro` and `.ts` files |
| `npm run data:map` | Rebuild the terrain textures in `public/map/` (downloads source data) |
| `npm run data:route` | Rebuild the trip route in `src/data/route.json` (downloads road data) |
| `npm run data:placeholders` | Regenerate the placeholder illustrations |

## Where things live

```
src/
  data/
    media.ts          single manifest of every image slot
    destinations.ts   the six stops: copy, coordinates, captions, camera view
    route.json        generated road and ferry route between the stops
    journeys.ts       itineraries and prices
    site.ts           name, contact details, navigation
    laurel.json       laurel branches from the logo, used as decoration
  components/         one Astro component per page section
  scripts/map/        three.js map: terrain shader, scroll timeline, camera, route lines, DOM overlay
  styles/global.css   design tokens (colours, type scale, spacing)
public/
  brand/              logo variants exported from the Illustrator files
  map/                generated terrain textures
  images/placeholders generated placeholder illustrations
scripts/              map, route and placeholder generators
```

## The trip

Athens → Patras → Chlemoutsi Castle → Turtle Bay (Laganas, Zakynthos) → Olympia → Barbalekou Tower.

`scripts/build-route.mjs` finds the land legs on the Natural Earth road network. It uses hand-drawn ferry lanes for Kyllini ⇄ Zakynthos and checks them against the coastline data. To change the trip:

1. Edit the stops in `src/data/destinations.ts`.
2. Edit `places`, `lanes` and `legs` in `scripts/build-route.mjs`.
3. Run `npm run data:route`.

The scroll length of the hero section follows from the leg distances.

## Replacing the photos

Every image on the page comes from `src/data/media.ts`. Put the real photos and videos from the company folders in `public/images/` and point the entries in `media.ts` at them. Nothing else needs to change.

- Map polaroids and destination cards: at least 1200 px wide. Polaroids are cropped square, cards 4:3
- AR comparison (`arToday` / `arReconstructed`): a matching pair with identical framing, 4:3

## Placeholder content

Copy, prices, testimonials, FAQ answers, AR device claims and contact details (`src/data/site.ts`) are placeholders. Replace them before going live. The Barbalekou Tower text is deliberately generic because no public information about it could be found. The contact form only validates in the browser. Connect it to a backend or form service.

## Brand

- Logo files in `public/brand/` are exported from the supplied Illustrator files and follow the brand book: minimum size 75 px on screen, clear space of one "T" width, no recolouring. The badge version (white circle) is used on the map and dark backgrounds.
- The laurel branches are used on their own as decoration, with the client's permission.
- Brand blue `#005384`, cream `#F2EBE2` and light blue `#C4D8E2` come from the brand book. The yellow accent `#F2C14E` is not in the brand book; it was added for the blue and yellow palette. All colours are tokens in `src/styles/global.css`.

## Map

`scripts/build-map-data.mjs` downloads Natural Earth country outlines and AWS Terrain Tiles (zoom 8). It writes:

- `public/map/height.webp`: elevation and depth
- `public/map/masks.png`: coastline distance field and Greece mask
- `src/data/map-meta.json` and `src/data/greece-outline.json`

The camera view for each stop is the `view` field in `destinations.ts`. Timeline proportions (intro, stops, legs, outro) are in `src/scripts/map/journey.ts`.

The map pauses when off-screen or in a background tab, and lowers its resolution on slow devices. With `prefers-reduced-motion`, the camera cuts between stops instead of flying, and the route still draws as you scroll. Browsers without WebGL 2 get a static outline map.

## Data attribution

- Map and road data: [Natural Earth](https://www.naturalearthdata.com/) (public domain)
- Elevation: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) on AWS Open Data (Mapzen), including SRTM, GMTED2010, ETOPO1 and Copernicus EU-DEM data
