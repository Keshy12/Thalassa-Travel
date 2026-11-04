import { media, type MediaItem } from './media';

export interface Journey {
  id: string;
  name: string;
  summary: string;
  days: number;
  groupSize: number;
  priceFrom: number;
  route: string[];
  image: MediaItem;
  badge?: string;
}

export const journeys: Journey[] = [
  {
    id: 'classical',
    name: 'Classical Mainland',
    summary: 'The Acropolis, the oracle of Delphi and the monasteries of Meteora in one unhurried loop.',
    days: 7,
    groupSize: 12,
    priceFrom: 1890,
    route: ['athens', 'delphi', 'meteora'],
    image: media.delphi[0],
  },
  {
    id: 'aegean',
    name: 'Aegean Islands',
    summary: 'From Athens by ferry to Santorini and on to Crete, with time for the beach between the ruins.',
    days: 9,
    groupSize: 12,
    priceFrom: 2450,
    route: ['athens', 'santorini', 'crete'],
    image: media.santorini[0],
    badge: 'Most popular',
  },
  {
    id: 'odyssey',
    name: 'The Grand Odyssey',
    summary: 'All six destinations, from the mainland to the Dodecanese, for travellers who want the full story.',
    days: 14,
    groupSize: 10,
    priceFrom: 3890,
    route: ['athens', 'delphi', 'meteora', 'santorini', 'crete', 'rhodes'],
    image: media.rhodes[1],
  },
];
