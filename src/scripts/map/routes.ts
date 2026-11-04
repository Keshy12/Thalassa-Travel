import { Group, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const SEGMENTS = 72;

export class Routes {
  readonly group = new Group();
  private lines: Line2[] = [];
  private materials: LineMaterial[] = [];

  constructor(points: Vector3[]) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const lift = Math.min(70, Math.max(10, a.distanceTo(b) * 0.16));
      const pos: number[] = [];
      for (let s = 0; s <= SEGMENTS; s++) {
        const t = s / SEGMENTS;
        const p = new Vector3().lerpVectors(a, b, t);
        p.y += Math.sin(Math.PI * t) * lift + 0.6;
        pos.push(p.x, p.y, p.z);
      }
      const geometry = new LineGeometry();
      geometry.setPositions(pos);
      const material = new LineMaterial({
        color: 0xf2c14e,
        linewidth: 2.2,
        dashed: true,
        dashSize: 3.2,
        gapSize: 2.6,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      line.renderOrder = 2;
      geometry.instanceCount = 0;
      this.lines.push(line);
      this.materials.push(material);
      this.group.add(line);
    }
  }

  setProgress(value: number) {
    this.lines.forEach((line, i) => {
      const f = Math.min(1, Math.max(0, value - i));
      line.visible = f > 0;
      line.geometry.instanceCount = Math.round(f * SEGMENTS);
    });
  }

  setResolution(w: number, h: number) {
    for (const m of this.materials) m.resolution.set(w, h);
  }

  setTime(t: number) {
    for (const m of this.materials) m.dashOffset = -t * 2.2;
  }

  dispose() {
    this.lines.forEach((l) => l.geometry.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
