export interface FishShape {
  body: Path2D;
  tail: Path2D;
  fins: Path2D;
  pivot: number;
  eye: [number, number, number];
}

const fish = (body: string, tail: string, fins: string, pivot: number, eye: [number, number, number]): FishShape => ({
  body: new Path2D(body),
  tail: new Path2D(tail),
  fins: new Path2D(fins),
  pivot,
  eye,
});

export const SLIM = fish(
  'M-30 0C-18-12 12-16 34-9C43-5.5 48-2 50 0C48 2.5 43 6 34 9.5C12 16.5-18 12.5-30 0Z',
  'M-25 0L-50-14C-45.5-5-45.5 5-50 14Z',
  'M-4-13C3-22 15-21 19-12.5ZM4 13.5C6 20 14 20 16 13Z',
  -27,
  [36, -2.5, 2.6],
);

export const BREAM = fish(
  'M-30 0C-23-21 8-30 31-17C41-11 47-5 50 0C47 6 41 12 31 17C8 29-23 20-30 0Z',
  'M-25 0L-50-19C-44.5-7-44.5 7-50 19Z',
  'M-14-21C-2-35 20-33 29-18ZM2 20C1 30-8 32-12 23Z',
  -27,
  [36, -5, 3.2],
);

export const TURTLE = {
  shell: new Path2D('M-74 6C-70-30-30-48 14-44C48-41 70-22 76 2C52 14-30 18-74 6Z'),
  belly: new Path2D('M-70 8C-30 22 44 20 74 4C56 18-28 26-70 8Z'),
  head: new Path2D('M62-15C73-25 92-27 104-20C114-13 114-2 104 3C93 8 76 7 62 0Z'),
  flipper: new Path2D('M40 2C58 6 64 30 38 60C26 73 8 78 0 74C16 56 28 36 30 8Z'),
  rear: new Path2D('M-58 4C-68 12-86 26-102 24C-98 13-80 2-62-2Z'),
  tail: new Path2D('M-72 4L-90 8L-72 12Z'),
  scutes: new Path2D('M-50-10C-30-28 10-33 46-21M-60 1C-20-11 30-11 68-3M-22-35L-16-9M16-37L18-10M-47-21L-41 0M47-29L47-8'),
  shoulder: [44, 6] as const,
  hip: [-60, 6] as const,
  eye: [99, -13, 2.6] as const,
};

export const BELL = new Path2D('M-30 0C-30-36 30-36 30 0C22 6 14 1 7 6C2 2-2 2-7 6C-14 1-22 6-30 0Z');
export const BELL_CORE = new Path2D('M-16-6C-16-24 16-24 16-6C8-2-8-2-16-6Z');

export const INK = {
  cream: '#f2ebe2',
  mist: '#c4d8e2',
  sun: '#f2c14e',
  sunSoft: '#f7d88a',
  sage: '#98a869',
  olive: '#636b2f',
  brown: '#6f4e37',
  navy: '#001b2e',
};
