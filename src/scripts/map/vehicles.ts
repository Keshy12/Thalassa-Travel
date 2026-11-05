import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShaderMaterial,
  Vector3,
  type Material,
} from 'three';
import type { LegPath, Mode } from './path';
import { lonLatToWorld } from './projection';

const mat = (color: string, extra: Partial<{ emissive: string; roughness: number; metalness: number }> = {}) =>
  new MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: extra.roughness ?? 0.65,
    metalness: extra.metalness ?? 0,
    emissive: extra.emissive ? new Color(extra.emissive) : undefined,
  });

const PALETTE = {
  sun: mat('#f2c14e'),
  white: mat('#faf7f2'),
  navy: mat('#0b2a45'),
  blue: mat('#003a5e'),
  glass: mat('#16384f', { roughness: 0.25, metalness: 0.2 }),
  tyre: mat('#1d2328', { roughness: 0.9 }),
  light: mat('#fff4cc', { emissive: '#ffe08a' }),
  red: mat('#c4473a'),
  teal: mat('#2c7db0'),
  sail: mat('#fffdf8', { roughness: 0.9 }),
  wood: mat('#9a6b3f'),
};

function box(w: number, h: number, d: number, material: Material, x = 0, y = 0, z = 0) {
  const m = new Mesh(new BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

function blobShadow(w: number, d: number, opacity = 0.28) {
  const m = new Mesh(
    new CircleGeometry(0.5, 24),
    new MeshBasicMaterial({ color: 0x001b2e, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.position.y = 0.005;
  m.renderOrder = -1;
  return m;
}

export interface CarModel {
  root: Group;
  wheels: Mesh[];
  body: Group;
}

export function createCar(paint: Material = PALETTE.sun): CarModel {
  const root = new Group();
  const body = new Group();
  root.add(blobShadow(0.62, 1.15));
  root.add(body);

  body.add(box(0.46, 0.16, 1, paint, 0, 0.17, 0));
  body.add(box(0.44, 0.06, 0.34, paint, 0, 0.28, 0.32));
  const cabin = box(0.4, 0.17, 0.5, PALETTE.glass, 0, 0.335, -0.06);
  body.add(cabin);
  body.add(box(0.41, 0.035, 0.44, PALETTE.white, 0, 0.43, -0.07));
  body.add(box(0.48, 0.05, 1.02, PALETTE.navy, 0, 0.1, 0));
  body.add(box(0.09, 0.05, 0.02, PALETTE.light, -0.15, 0.2, 0.505));
  body.add(box(0.09, 0.05, 0.02, PALETTE.light, 0.15, 0.2, 0.505));
  body.add(box(0.09, 0.04, 0.02, PALETTE.red, -0.16, 0.2, -0.505));
  body.add(box(0.09, 0.04, 0.02, PALETTE.red, 0.16, 0.2, -0.505));

  const wheelGeo = new CylinderGeometry(0.1, 0.1, 0.08, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [
    [-0.23, 0.31],
    [0.23, 0.31],
    [-0.23, -0.3],
    [0.23, -0.3],
  ].map(([x, z]) => {
    const w = new Mesh(wheelGeo, PALETTE.tyre);
    w.position.set(x, 0.1, z);
    root.add(w);
    return w;
  });

  return { root, wheels, body };
}

function hullGeometry(width: number, length: number, height: number) {
  const hw = width / 2;
  const hl = length / 2;
  const s = new Shape();
  s.moveTo(-hw * 0.92, -hl);
  s.lineTo(hw * 0.92, -hl);
  s.lineTo(hw, hl * 0.35);
  s.quadraticCurveTo(hw * 0.7, hl * 0.85, 0, hl);
  s.quadraticCurveTo(-hw * 0.7, hl * 0.85, -hw, hl * 0.35);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(Math.PI / 2);
  g.translate(0, height, 0);
  return g;
}

export interface ShipModel {
  root: Group;
  body: Group;
  wake: Mesh;
}

const wakeVertex = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const wakeFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    float along = vUv.y;
    float across = abs(vUv.x * 2.0 - 1.0);
    float edge = smoothstep(0.55, 0.95, across) * (1.0 - smoothstep(0.95, 1.0, across));
    float centre = (1.0 - smoothstep(0.0, 0.45, across)) * 0.45;
    float ripples = 0.65 + 0.35 * sin(along * 38.0 - uTime * 7.0 + across * 6.0);
    float fade = pow(1.0 - along, 1.6) * uSpeed;
    float a = (edge * ripples + centre) * fade;
    gl_FragColor = vec4(vec3(1.0), a * 0.85);
    #include <fog_fragment>
  }
`;

function wakeMesh(width: number, length: number, spread: number) {
  const g = new BufferGeometry();
  const hw = width / 2;
  const tail = length;
  const positions = [-hw, 0, 0, hw, 0, 0, -spread, 0, -tail, spread, 0, -tail];
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const material = new ShaderMaterial({
    vertexShader: wakeVertex,
    fragmentShader: wakeFragment,
    uniforms: { uTime: { value: 0 }, uSpeed: { value: 1 }, fogColor: { value: new Color() }, fogNear: { value: 1 }, fogFar: { value: 2000 } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const m = new Mesh(g, material);
  m.position.y = 0.01;
  m.renderOrder = -1;
  return m;
}

export function createFerry(): ShipModel {
  const root = new Group();
  const body = new Group();
  const wake = wakeMesh(0.3, 2.6, 0.75);
  wake.position.z = -0.42;
  root.add(wake);
  root.add(body);

  body.add(new Mesh(hullGeometry(0.34, 1, 0.12), PALETTE.blue));
  const deck = new Mesh(hullGeometry(0.3, 0.92, 0.05), PALETTE.white);
  deck.position.set(0, 0.12, -0.01);
  body.add(deck);
  body.add(box(0.26, 0.09, 0.56, PALETTE.white, 0, 0.21, -0.1));
  body.add(box(0.265, 0.025, 0.5, PALETTE.glass, 0, 0.23, -0.1));
  body.add(box(0.2, 0.08, 0.32, PALETTE.white, 0, 0.295, -0.06));
  body.add(box(0.205, 0.022, 0.26, PALETTE.glass, 0, 0.31, -0.04));
  const funnel = new Mesh(new CylinderGeometry(0.045, 0.055, 0.14, 10), PALETTE.sun);
  funnel.position.set(0, 0.4, -0.2);
  body.add(funnel);
  const cap = new Mesh(new CylinderGeometry(0.047, 0.047, 0.03, 10), PALETTE.navy);
  cap.position.set(0, 0.48, -0.2);
  body.add(cap);
  return { root, body, wake };
}

export function createSailboat(): ShipModel {
  const root = new Group();
  const body = new Group();
  const wake = wakeMesh(0.16, 1.4, 0.36);
  wake.position.z = -0.4;
  root.add(wake);
  root.add(body);
  body.add(new Mesh(hullGeometry(0.22, 0.8, 0.07), PALETTE.white));
  body.add(box(0.12, 0.04, 0.24, PALETTE.wood, 0, 0.09, -0.12));
  const mast = new Mesh(new CylinderGeometry(0.008, 0.01, 0.7, 6), PALETTE.navy);
  mast.position.set(0, 0.42, 0.06);
  body.add(mast);
  const sail = new Mesh(new ConeGeometry(0.2, 0.62, 3, 1, true), PALETTE.sail);
  sail.scale.set(0.12, 1, 1);
  sail.position.set(0, 0.42, -0.04);
  body.add(sail);
  return { root, body, wake };
}

export function createCargo(): ShipModel {
  const root = new Group();
  const body = new Group();
  const wake = wakeMesh(0.3, 2.2, 0.6);
  wake.position.z = -0.48;
  root.add(wake);
  root.add(body);
  body.add(new Mesh(hullGeometry(0.3, 1.1, 0.1), PALETTE.red));
  const colors = [PALETTE.teal, PALETTE.sun, PALETTE.white, PALETTE.blue];
  for (let i = 0; i < 4; i++) body.add(box(0.24, 0.07, 0.15, colors[i], 0, 0.135, 0.28 - i * 0.16));
  body.add(box(0.26, 0.16, 0.12, PALETTE.white, 0, 0.18, -0.46));
  return { root, body, wake };
}

function setWake(ship: ShipModel, time: number, speed: number) {
  const m = ship.wake.material as ShaderMaterial;
  m.uniforms.uTime.value = time;
  m.uniforms.uSpeed.value = speed;
}


function orient(obj: Object3D, pos: Vector3, dir: Vector3) {
  obj.position.copy(pos);
  const flat = Math.hypot(dir.x, dir.z) || 1;
  obj.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
  obj.rotateX(-Math.atan2(dir.y, flat) * 0.6);
}

export class HeroVehicle {
  readonly group = new Group();
  private car = createCar();
  private ferry = createFerry();
  private dir = new Vector3(0, 0, 1);
  private mode: Mode | null = null;
  private pop = 0;
  private spin = 0;

  constructor() {
    this.car.root.visible = false;
    this.ferry.root.visible = false;
    this.group.add(this.car.root, this.ferry.root);
    this.group.visible = false;
  }

  update(pos: Vector3 | null, heading: Vector3 | null, mode: Mode, scale: number, speed: number, dt: number, time: number) {
    if (!pos || !heading) {
      this.pop = Math.max(0, this.pop - dt * 5);
      if (this.pop === 0) {
        this.group.visible = false;
        this.mode = null;
      }
      this.group.scale.setScalar(scale * MathUtils.smootherstep(this.pop, 0, 1));
      return;
    }
    if (mode !== this.mode) {
      this.mode = mode;
      this.pop = Math.min(this.pop, 0.4);
      this.dir.copy(heading);
    }
    this.group.visible = true;
    this.pop = Math.min(1, this.pop + dt * 4);
    this.dir.lerp(heading, Math.min(1, dt * 8)).normalize();
    const sea = mode === 'sea';
    this.car.root.visible = !sea;
    this.ferry.root.visible = sea;
    orient(this.group, pos, sea ? this.dir.clone().setY(0) : this.dir);
    if (sea) this.group.position.y = 0.01;
    const s = MathUtils.smootherstep(this.pop, 0, 1) + Math.sin(this.pop * Math.PI) * 0.18;
    this.group.scale.setScalar(scale * Math.max(0.001, s));
    if (sea) {
      this.ferry.body.position.y = Math.sin(time * 2.6) * 0.012;
      this.ferry.body.rotation.z = Math.sin(time * 1.7) * 0.05;
      this.ferry.body.rotation.x = Math.sin(time * 2.1 + 1) * 0.025;
      setWake(this.ferry, time, MathUtils.clamp(speed, 0.2, 1));
    } else {
      this.spin += dt * 30 * MathUtils.clamp(speed, 0, 1);
      this.car.wheels.forEach((w) => (w.rotation.x = this.spin));
      this.car.body.position.y = Math.abs(Math.sin(time * 18)) * 0.012 * speed;
    }
  }
}

interface Lane {
  points: Vector3[];
  cum: number[];
  length: number;
  loop: boolean;
}

function laneFrom(points: Vector3[], loop: boolean): Lane {
  const pts = loop ? [...points, points[0]] : points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { points: pts, cum, length: cum[cum.length - 1], loop };
}

function laneAt(lane: Lane, d: number, out: Vector3, dir: Vector3) {
  const c = lane.cum;
  let i = 0;
  while (i < c.length - 2 && c[i + 1] < d) i++;
  const a = lane.points[i];
  const b = lane.points[i + 1];
  const t = MathUtils.clamp((d - c[i]) / (c[i + 1] - c[i] || 1), 0, 1);
  out.lerpVectors(a, b, t);
  dir.subVectors(b, a).normalize();
  return out;
}

const SEA_LANES: { kind: 'ferry' | 'sail' | 'cargo'; loop: boolean; speed: number; pts: number[][] }[] = [
  { kind: 'ferry', loop: false, speed: 1.6, pts: [[23.625, 37.935], [23.58, 37.86], [23.47, 37.76], [23.44, 37.748]] },
  { kind: 'cargo', loop: false, speed: 1.1, pts: [[23.63, 37.93], [23.75, 37.8], [23.95, 37.62], [24.3, 37.42]] },
  { kind: 'ferry', loop: false, speed: 1.8, pts: [[21.72, 38.255], [21.55, 38.3], [21.3, 38.33], [21.0, 38.42], [20.55, 38.55]] },
  { kind: 'ferry', loop: false, speed: 1.5, pts: [[21.158, 37.94], [21.05, 38.02], [20.86, 38.12], [20.77, 38.15]] },
  { kind: 'ferry', loop: false, speed: 1.4, pts: [[21.158, 37.942], [21.1, 37.93], [21.0, 37.85], [20.92, 37.79], [20.905, 37.784]] },
  { kind: 'sail', loop: true, speed: 0.6, pts: [[20.92, 37.68], [20.98, 37.66], [21.0, 37.7], [20.95, 37.72]] },
  { kind: 'sail', loop: true, speed: 0.55, pts: [[21.05, 37.82], [21.1, 37.8], [21.12, 37.85], [21.06, 37.86]] },
  { kind: 'sail', loop: true, speed: 0.6, pts: [[22.35, 38.2], [22.5, 38.17], [22.55, 38.22], [22.4, 38.25]] },
  { kind: 'sail', loop: true, speed: 0.55, pts: [[23.45, 37.84], [23.55, 37.82], [23.56, 37.88], [23.47, 37.9]] },
  { kind: 'sail', loop: true, speed: 0.5, pts: [[21.5, 38.27], [21.6, 38.26], [21.62, 38.3], [21.52, 38.31]] },
  { kind: 'cargo', loop: false, speed: 1.0, pts: [[21.2, 37.6], [21.0, 37.9], [20.85, 38.3]] },
];

interface Mover {
  obj: Object3D;
  ship?: ShipModel;
  car?: CarModel;
  lane: Lane;
  speed: number;
  d: number;
  dir: 1 | -1;
  wait: number;
  offset: number;
}

const ROAD_PAINTS = [PALETTE.white, PALETTE.teal, PALETTE.red, PALETTE.white, PALETTE.blue];

export class Traffic {
  readonly sea = new Group();
  readonly road = new Group();
  private movers: Mover[] = [];
  private p = new Vector3();
  private d = new Vector3();
  private side = new Vector3();

  constructor(paths: LegPath[]) {
    SEA_LANES.forEach((l, i) => {
      const pts = l.pts.map(([lon, lat]) => {
        const { x, z } = lonLatToWorld(lon, lat);
        return new Vector3(x, 0, z);
      });
      const lane = laneFrom(pts, l.loop);
      const ship = l.kind === 'ferry' ? createFerry() : l.kind === 'sail' ? createSailboat() : createCargo();
      const size = l.kind === 'ferry' ? 2.3 : l.kind === 'sail' ? 1.3 : 2.7;
      ship.root.scale.setScalar(size);
      this.sea.add(ship.root);
      this.movers.push({ obj: ship.root, ship, lane, speed: l.speed, d: lane.length * ((i * 0.37) % 1), dir: 1, wait: 0, offset: 0 });
    });

    let n = 0;
    for (const leg of paths) {
      for (const seg of leg.segments) {
        if (seg.mode !== 'road' || seg.end - seg.start < 25) continue;
        const lane = laneFrom(seg.points, false);
        const count = Math.max(1, Math.round(lane.length / 45));
        for (let k = 0; k < count * 2; k++) {
          const car = createCar(ROAD_PAINTS[n++ % ROAD_PAINTS.length]);
          car.root.children[0].visible = false;
          car.root.scale.setScalar(1.25);
          this.road.add(car.root);
          const dir: 1 | -1 = k % 2 ? 1 : -1;
          this.movers.push({ obj: car.root, car, lane, speed: 1.3 + (k % 3) * 0.25, d: lane.length * (((k + 0.5) / (count * 2) + n * 0.13) % 1), dir, wait: 0, offset: 0.32 });
        }
      }
    }
  }

  update(dt: number, time: number, rise: number) {
    for (const m of this.movers) {
      if (m.wait > 0) {
        m.wait -= dt;
      } else {
        m.d += m.speed * dt * m.dir;
        if (m.lane.loop) {
          m.d = ((m.d % m.lane.length) + m.lane.length) % m.lane.length;
        } else if (m.d > m.lane.length || m.d < 0) {
          m.d = MathUtils.clamp(m.d, 0, m.lane.length);
          m.dir = m.dir === 1 ? -1 : 1;
          m.wait = m.car ? 0.6 : 2.5;
        }
      }
      laneAt(m.lane, m.d, this.p, this.d);
      if (m.dir < 0) this.d.negate();
      if (m.offset) {
        this.side.set(this.d.z, 0, -this.d.x).normalize().multiplyScalar(-m.offset * 1.25);
        this.p.add(this.side);
      }
      this.p.y *= rise;
      orient(m.obj, this.p, m.ship ? this.d.setY(0) : this.d);
      const moving = m.wait > 0 ? 0 : 1;
      if (m.ship) {
        m.ship.body.rotation.z = Math.sin(time * 1.6 + m.speed * 9) * 0.06;
        m.ship.body.position.y = Math.sin(time * 2.2 + m.speed * 5) * 0.01;
        setWake(m.ship, time, moving);
      } else if (m.car) {
        const spin = time * 30 * moving;
        m.car.wheels.forEach((w) => (w.rotation.x = spin));
      }
    }
  }

  dispose() {
    for (const g of [this.sea, this.road])
      g.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
  }
}

export function disposeVehicleMaterials() {
  Object.values(PALETTE).forEach((m) => m.dispose());
}
