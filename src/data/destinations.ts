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
    view: { yaw: -18, pitch: 50, distance: 150 },
  },
  {
    id: 'patras',
    name: 'Patras',
    region: 'Achaea',
    lon: 21.7345,
    lat: 38.2462,
    tagline: 'Gateway to the Peloponnese.',
    description:
      "Greece's third-largest city climbs from the harbour to a Byzantine and Venetian castle. Watch the Rio–Antirrio Bridge leap across the gulf and visit the vast Church of Saint Andrew, the city's patron saint.",
    highlights: ['Rio–Antirrio Bridge', 'Church of Saint Andrew', 'Patras Castle'],
    photos: withCaptions(media.patras, ['Rio–Antirrio Bridge', 'Church of Saint Andrew', 'Patras Castle']),
    view: { yaw: 12, pitch: 52, distance: 120 },
  },
  {
    id: 'chlemoutsi',
    name: 'Chlemoutsi Castle',
    region: 'Ilia',
    lon: 21.1153,
    lat: 37.8836,
    tagline: 'A Crusader fortress above the Ionian Sea.',
    description:
      'Built by the Frankish princes of Achaea in the 13th century, Chlemoutsi crowns a hill near Kyllini with views across the water to Zakynthos.',
    highlights: ['13th-century keep', 'Views to Zakynthos', 'Kyllini beaches'],
    photos: withCaptions(media.chlemoutsi, ['Chlemoutsi Castle', 'The castle gate', 'Sunset over Kyllini']),
    view: { yaw: -14, pitch: 54, distance: 100 },
  },
  {
    id: 'turtle-bay',
    name: 'Turtle Bay',
    region: 'Laganas, Zakynthos',
    lon: 20.8695,
    lat: 37.7225,
    tagline: 'Where loggerhead turtles come ashore.',
    description:
      'Laganas Bay is the heart of the National Marine Park of Zakynthos. Sail out to Marathonisi, the Turtle Island, and watch loggerhead turtles surface in the clear water.',
    highlights: ['Marathonisi (Turtle Island)', 'Loggerhead turtles', 'National Marine Park'],
    photos: withCaptions(media.turtleBay, ['Loggerhead turtle', 'Marathonisi island', 'Protected nests']),
    view: { yaw: 16, pitch: 50, distance: 90 },
  },
  {
    id: 'olympia',
    name: 'Olympia',
    region: 'Ilia',
    lon: 21.63,
    lat: 37.638,
    tagline: 'Birthplace of the Olympic Games.',
    description:
      'Walk through the vaulted tunnel into the stadium where athletes raced from 776 BC, past the Temple of Zeus and the Temple of Hera, where the Olympic flame is still lit today.',
    highlights: ['Ancient stadium', 'Temple of Zeus', 'Archaeological Museum'],
    photos: withCaptions(media.olympia, ['Into the stadium', 'Temple of Hera', 'The palaestra']),
    view: { yaw: -10, pitch: 54, distance: 100 },
  },
  {
    id: 'barbalekou',
    name: 'Barbalekou Tower',
    region: 'Trifylia, Messinia',
    lon: 21.824142,
    lat: 37.386581,
    tagline: 'A quiet finale in the hills of Trifylia.',
    description:
      'The journey ends among the olive-covered hills of Trifylia at Barbalekou Tower, a peaceful corner of Messinia far from the crowds.',
    highlights: ['Barbalekou Tower', 'Trifylia hills', 'Olive groves'],
    photos: withCaptions(media.barbalekou, ['Barbalekou Tower', 'Olive groves', 'Evening in the hills']),
    view: { yaw: 14, pitch: 52, distance: 105 },
  },
];
