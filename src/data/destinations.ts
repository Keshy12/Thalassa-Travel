import { media, type MediaItem } from './media';

export interface Photo extends MediaItem {
  caption: string;
}

export interface Destination {
  id: string;
  name: string;
  region: string;
  lon: number;
  lat: number;
  tagline: string;
  description: string;
  highlights: string[];
  photos: Photo[];
  view: { yaw: number; pitch: number; distance: number };
}

const withCaptions = (items: MediaItem[], captions: string[]): Photo[] =>
  items.map((item, i) => ({ ...item, caption: captions[i] ?? '' }));

export const destinations: Destination[] = [
  {
    id: 'athens',
    name: 'Athens',
    region: 'Attica',
    lon: 23.7262,
    lat: 37.9715,
    tagline: 'Where democracy, drama and philosophy began.',
    description:
      'Climb the Acropolis at first light, walk the Ancient Agora where Socrates argued, and end the day over dinner in the lanes of Plaka.',
    highlights: ['Acropolis & Parthenon', 'Ancient Agora', 'Plaka at night'],
    photos: withCaptions(media.athens, ['The Parthenon', 'Temple of Hephaestus', 'Lycabettus at dusk']),
    view: { yaw: -18, pitch: 50, distance: 175 },
  },
  {
    id: 'delphi',
    name: 'Delphi',
    region: 'Central Greece',
    lon: 22.501,
    lat: 38.4824,
    tagline: 'The navel of the ancient world.',
    description:
      'Follow the Sacred Way up the slopes of Mount Parnassus to the Temple of Apollo, the theatre and the stadium above a sea of olive trees.',
    highlights: ['Sanctuary of Apollo', 'Tholos of Athena Pronaia', 'Amfissa olive groves'],
    photos: withCaptions(media.delphi, ['Tholos of Athena Pronaia', 'The ancient theatre', 'Olive groves to the sea']),
    view: { yaw: 22, pitch: 52, distance: 165 },
  },
  {
    id: 'meteora',
    name: 'Meteora',
    region: 'Thessaly',
    lon: 21.6306,
    lat: 39.7217,
    tagline: 'Monasteries suspended in the air.',
    description:
      'Six monasteries still crown the sandstone pillars above the Thessalian plain. Arrive at sunrise, when mist fills the valley below.',
    highlights: ['Great Meteoron', 'Varlaam Monastery', 'Sunrise viewpoints'],
    photos: withCaptions(media.meteora, ['Monastery on the rock', 'Pillars at sunrise', 'Meteora by night']),
    view: { yaw: -28, pitch: 54, distance: 170 },
  },
  {
    id: 'santorini',
    name: 'Santorini',
    region: 'Cyclades',
    lon: 25.4318,
    lat: 36.4167,
    tagline: 'White villages on the rim of a volcano.',
    description:
      'Watch the sun go down over the caldera from Oia, sail to the volcanic islets and walk through Akrotiri, a Bronze Age town preserved in ash.',
    highlights: ['Oia sunset', 'Caldera cruise', 'Akrotiri excavations'],
    photos: withCaptions(media.santorini, ['Blue domes of Oia', 'Sunset over the caldera', 'Windmill above the caldera']),
    view: { yaw: 12, pitch: 50, distance: 135 },
  },
  {
    id: 'crete',
    name: 'Crete',
    region: 'Heraklion & Chania',
    lon: 25.1631,
    lat: 35.298,
    tagline: 'Minoan palaces and wild gorges.',
    description:
      'Walk the corridors of Knossos, the legendary palace of King Minos, swim in the lagoon at Balos and stroll the Venetian harbour of Chania.',
    highlights: ['Palace of Knossos', 'Balos lagoon', 'Chania old harbour'],
    photos: withCaptions(media.crete, ['Palace of Knossos', 'Balos lagoon', 'Chania lighthouse']),
    view: { yaw: -8, pitch: 50, distance: 210 },
  },
  {
    id: 'rhodes',
    name: 'Rhodes',
    region: 'Dodecanese',
    lon: 28.2278,
    lat: 36.4449,
    tagline: 'A medieval city of knights.',
    description:
      'Wander the Street of the Knights in one of the best-preserved medieval towns in Europe, then climb to the Acropolis of Lindos above its turquoise bay.',
    highlights: ['Palace of the Grand Master', 'Acropolis of Lindos', 'Mandraki harbour'],
    photos: withCaptions(media.rhodes, ['Old Town walls', 'Acropolis of Lindos', 'Mandraki harbour']),
    view: { yaw: 24, pitch: 52, distance: 170 },
  },
];
