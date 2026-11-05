export type Segment =
  | { kind: 'intro'; t0: number; t1: number }
  | { kind: 'approach'; t0: number; t1: number }
  | { kind: 'dwell'; stop: number; t0: number; t1: number }
  | { kind: 'leg'; leg: number; t0: number; t1: number }
  | { kind: 'outro'; t0: number; t1: number };

export interface Timeline {
  segments: Segment[];
  total: number;
}

const INTRO = 0.5;
const APPROACH = 1.1;
const DWELL = 1.4;
const OUTRO = 1.2;

const LEG_PACE = 1.5;

export const legUnits = (km: number) => LEG_PACE * Math.min(3, Math.max(1.3, 0.9 + km / 240));

export function buildTimeline(legKm: number[]): Timeline {
  const segments: Segment[] = [];
  let t = 0;
  const push = (seg: Segment) => {
    segments.push(seg);
    t = seg.t1;
  };
  push({ kind: 'intro', t0: t, t1: t + INTRO });
  push({ kind: 'approach', t0: t, t1: t + APPROACH });
  for (let i = 0; i <= legKm.length; i++) {
    push({ kind: 'dwell', stop: i, t0: t, t1: t + DWELL });
    if (i < legKm.length) push({ kind: 'leg', leg: i, t0: t, t1: t + legUnits(legKm[i]) });
  }
  push({ kind: 'outro', t0: t, t1: t + OUTRO });
  return { segments, total: t };
}

export function locate(timeline: Timeline, t: number): { seg: Segment; u: number } {
  const { segments } = timeline;
  const clamped = Math.min(Math.max(t, 0), timeline.total);
  const seg = segments.find((s) => clamped <= s.t1) ?? segments[segments.length - 1];
  return { seg, u: (clamped - seg.t0) / (seg.t1 - seg.t0) };
}

export function dwellOf(timeline: Timeline, stop: number) {
  return timeline.segments.find((s): s is Extract<Segment, { kind: 'dwell' }> => s.kind === 'dwell' && s.stop === stop);
}
