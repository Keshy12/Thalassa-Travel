import { Group, type Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { LegPath, PathSegment } from './path';

interface Drawn {
  segment: PathSegment;
  lines: Line2[];
  count: number;
}

function makeLine(points: Vector3[], material: LineMaterial, order: number) {
  const geometry = new LineGeometry();
  geometry.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const line = new Line2(geometry, material);
  line.computeLineDistances();
  line.renderOrder = order;
  line.frustumCulled = false;
  return line;
}

export class RouteLines {
  readonly group = new Group();
  private materials: LineMaterial[];
  private seaCore: LineMaterial;
  private legs: Drawn[][];

  constructor(legs: LegPath[]) {
    const base = { transparent: true, depthTest: false, depthWrite: false };
    const plannedRoad = new LineMaterial({ ...base, color: 0x0b2a45, linewidth: 2, opacity: 0.6, dashed: true, dashSize: 1.2, gapSize: 1.8 });
    const plannedSea = new LineMaterial({ ...base, color: 0xffffff, linewidth: 1.8, opacity: 0.6, dashed: true, dashSize: 1.6, gapSize: 2.4 });
    const roadCasing = new LineMaterial({ ...base, color: 0xffffff, linewidth: 7.5, opacity: 0.95 });
    const roadCore = new LineMaterial({ ...base, color: 0x003a5e, linewidth: 3.6, opacity: 1 });
    const seaCasing = new LineMaterial({ ...base, color: 0x002a43, linewidth: 7.5, opacity: 0.5 });
    this.seaCore = new LineMaterial({ ...base, color: 0xffffff, linewidth: 3.4, opacity: 1, dashed: true, dashSize: 3.5, gapSize: 2.8 });
    this.materials = [plannedRoad, plannedSea, roadCasing, roadCore, seaCasing, this.seaCore];

    for (const leg of legs)
      for (const segment of leg.segments) this.group.add(makeLine(segment.points, segment.mode === 'sea' ? plannedSea : plannedRoad, 1));

    this.legs = legs.map((leg) =>
      leg.segments.map((segment) => {
        const sea = segment.mode === 'sea';
        const lines = [makeLine(segment.points, sea ? seaCasing : roadCasing, 2), makeLine(segment.points, sea ? this.seaCore : roadCore, 3)];
        lines.forEach((l) => this.group.add(l));
        return { segment, lines, count: segment.points.length - 1 };
      }),
    );
    this.setProgress(-1, 0);
  }

  setProgress(leg: number, distance: number) {
    this.legs.forEach((drawn, i) => {
      for (const d of drawn) {
        let f = 0;
        if (i < leg) f = 1;
        else if (i === leg) {
          const span = d.segment.end - d.segment.start;
          f = span > 0 ? (distance - d.segment.start) / span : distance >= d.segment.end ? 1 : 0;
        }
        const n = Math.ceil(Math.min(1, Math.max(0, f)) * d.count);
        for (const line of d.lines) {
          line.visible = n > 0;
          line.geometry.instanceCount = n;
        }
      }
    });
  }

  setResolution(w: number, h: number) {
    for (const m of this.materials) m.resolution.set(w, h);
  }

  setTime(t: number) {
    this.seaCore.dashOffset = -t * 3;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof Line2) o.geometry.dispose();
    });
    this.materials.forEach((m) => m.dispose());
  }
}
