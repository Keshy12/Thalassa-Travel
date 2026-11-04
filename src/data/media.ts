import { asset } from '../lib/asset';

export interface MediaItem {
  src: string;
  alt: string;
}

const placeholder = (name: string, alt: string): MediaItem => ({ src: asset(`images/placeholders/${name}.svg`), alt });

export const media = {
  athens: [
    placeholder('athens-1', 'The Parthenon on the Acropolis at golden hour'),
    placeholder('athens-2', 'The Temple of Hephaestus in the Ancient Agora'),
    placeholder('athens-3', 'Lycabettus Hill above Athens at dusk'),
  ],
  delphi: [
    placeholder('delphi-1', 'The Tholos of Athena Pronaia at Delphi'),
    placeholder('delphi-2', 'The ancient theatre of Delphi below the cliffs of Mount Parnassus'),
    placeholder('delphi-3', 'Olive groves running down to the Gulf of Corinth'),
  ],
  meteora: [
    placeholder('meteora-1', 'A monastery on top of a sandstone pillar at Meteora'),
    placeholder('meteora-2', 'Meteora pillars rising out of the morning mist'),
    placeholder('meteora-3', 'Lit monasteries of Meteora at night'),
  ],
  santorini: [
    placeholder('santorini-1', 'Blue domes and white houses of Oia, Santorini'),
    placeholder('santorini-2', 'Sunset over the Santorini caldera'),
    placeholder('santorini-3', 'A windmill above the caldera'),
  ],
  crete: [
    placeholder('crete-1', 'The restored north portico of the Palace of Knossos'),
    placeholder('crete-2', 'The turquoise lagoon at Balos, Crete'),
    placeholder('crete-3', 'The Venetian lighthouse of Chania harbour'),
  ],
  rhodes: [
    placeholder('rhodes-1', 'The medieval walls of Rhodes Old Town'),
    placeholder('rhodes-2', 'The Acropolis of Lindos above the bay'),
    placeholder('rhodes-3', 'Windmills on the mole of Mandraki harbour'),
  ],
  arToday: placeholder('ar-today', 'The Parthenon today, without its roof and pediment sculptures'),
  arReconstructed: placeholder('ar-reconstructed', 'The Parthenon reconstructed with its sculptures and original painted colours'),
} satisfies Record<string, MediaItem | MediaItem[]>;
