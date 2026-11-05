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
    name: 'Classical Peloponnese',
    summary: 'From the Acropolis to the birthplace of the Olympic Games, by way of Patras and its great bridge.',
    days: 6,
    groupSize: 12,
    priceFrom: 1690,
    route: ['athens', 'patras', 'olympia'],
    image: media.olympia[0],
  },
  {
    id: 'ionian',
    name: 'Ionian Escape',
    summary: 'A Crusader castle above Kyllini, then the ferry to Zakynthos to meet the turtles of Laganas Bay.',
    days: 7,
    groupSize: 12,
    priceFrom: 1890,
    route: ['patras', 'chlemoutsi', 'turtle-bay'],
    image: media.turtleBay[0],
    badge: 'Most popular',
  },
  {
    id: 'odyssey',
    name: 'The Western Odyssey',
    summary: 'All six stops, from Athens across the Peloponnese to Zakynthos and the hills of Trifylia.',
    days: 10,
    groupSize: 10,
    priceFrom: 2890,
    route: ['athens', 'patras', 'chlemoutsi', 'turtle-bay', 'olympia', 'barbalekou'],
    image: media.chlemoutsi[0],
  },
];
