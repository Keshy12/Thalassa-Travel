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
  patras: [
    placeholder('patras-1', 'The Rio–Antirrio Bridge across the Gulf of Corinth'),
    placeholder('patras-2', 'The Church of Saint Andrew in Patras'),
    placeholder('patras-3', 'Patras Castle above the city and the harbour'),
  ],
  chlemoutsi: [
    placeholder('chlemoutsi-1', 'Chlemoutsi Castle on its hill above the Ionian Sea'),
    placeholder('chlemoutsi-2', 'The gate of Chlemoutsi Castle'),
    placeholder('chlemoutsi-3', 'Sunset over Kyllini harbour with the ferry to Zakynthos'),
  ],
  turtleBay: [
    placeholder('turtle-1', 'A loggerhead turtle swimming in Laganas Bay'),
    placeholder('turtle-2', 'Marathonisi, the Turtle Island, in Laganas Bay'),
    placeholder('turtle-3', 'Protected turtle nests on Laganas beach'),
  ],
  olympia: [
    placeholder('olympia-1', 'The vaulted tunnel into the ancient stadium of Olympia'),
    placeholder('olympia-2', 'The Temple of Hera at Olympia'),
    placeholder('olympia-3', 'Columns of the palaestra at Olympia'),
  ],
  barbalekou: [
    placeholder('barbalekou-1', 'Barbalekou Tower among olive trees'),
    placeholder('barbalekou-2', 'Olive groves in the hills of Trifylia'),
    placeholder('barbalekou-3', 'Barbalekou Tower at dusk'),
  ],
  arToday: placeholder('ar-today', 'The Parthenon today, without its roof and pediment sculptures'),
  arReconstructed: placeholder('ar-reconstructed', 'The Parthenon reconstructed with its sculptures and original painted colours'),
} satisfies Record<string, MediaItem | MediaItem[]>;
