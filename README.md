# Thalassa Travel

Landing page for Thalassa Travel: small-group journeys across Greece with an AR device included on every trip.

The hero is a real-time 3D relief map of Greece (three.js) built from real elevation and bathymetry data. It tours the six destinations, zooming out and in between stops, and shows three photos for each one.

## Stack

- [Astro](https://astro.build) 7, static output, TypeScript
- [three.js](https://threejs.org) without wrappers, loaded lazily so the page renders before the map
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
| `npm run data:map` | Rebuild the map textures in `public/map/` (downloads source data) |
| `npm run data:placeholders` | Regenerate the placeholder illustrations |

## Where things live

```
src/
  data/
    media.ts          single manifest of every image slot
    destinations.ts   tour stops: copy, coordinates, captions, camera view
    journeys.ts       itineraries and prices
    site.ts           name, contact details, navigation
  components/         one Astro component per page section
  scripts/map/        three.js map: terrain shader, camera tour, routes, DOM overlay
  styles/global.css   design tokens (colours, type scale, spacing)
public/
  brand/              logo variants (vector, traced from the brand book)
  map/                generated terrain textures
  images/placeholders generated placeholder illustrations
scripts/              data and placeholder generators
```

## Replacing the photos

Every image on the page comes from `src/data/media.ts`. Put the real photos in `public/images/` and point the entries in `media.ts` at them. Nothing else needs to change.

- Destination and map photos: 4:3, at least 1200×900
- AR comparison (`arToday` / `arReconstructed`): a matching pair with identical framing, 4:3

## Placeholder content

Copy, prices, testimonials, FAQ answers, AR device claims and contact details (`src/data/site.ts`) are placeholders. Replace them before going live. The contact form only validates in the browser. Connect it to a backend or form service.

## Brand

- Logo files in `public/brand/` follow the brand book: minimum size 75 px on screen, clear space of one "T" width, no recolouring. The badge version (white circle) is used on dark and photographic backgrounds.
- Brand blue `#005384`, cream `#F2EBE2` and light blue `#C4D8E2` come from the brand book. The yellow accent `#F2C14E` is not in the brand book; it was added for the blue and yellow palette. All colours are tokens in `src/styles/global.css`.

## Map

`scripts/build-map-data.mjs` downloads Natural Earth country outlines and AWS Terrain Tiles (zoom 8). It writes three files:

- `public/map/height.webp`: elevation and depth
- `public/map/masks.png`: coastline distance field and Greece mask
- `src/data/map-meta.json` and `src/data/greece-outline.json`

The camera view for each stop (`view` in `destinations.ts`) and the tour order (`SEQUENCE` in `src/scripts/map/GreeceMap.ts`) can be edited without regenerating data.

The map pauses when off-screen or in a background tab, and lowers its resolution on slow devices. It respects `prefers-reduced-motion`: no automatic tour, and stops are shown without camera flights. Browsers without WebGL 2 get a static outline map.

## Data attribution

- Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain)
- Elevation: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) on AWS Open Data (Mapzen), including SRTM, GMTED2010, ETOPO1 and Copernicus EU-DEM data
