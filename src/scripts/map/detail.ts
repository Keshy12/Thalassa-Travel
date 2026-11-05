import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector2,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { lonLatToWorld } from './projection';

export type LandmarkKind = 'castle' | 'ruin' | 'lighthouse';

export interface DetailData {
  origin: [number, number];
  scale: number;
  trees: number[];
  houses: number[];
  landmarks: [number, number, LandmarkKind, string][];
  roads: [number, number[]][];
}

export interface Landmark {
  kind: LandmarkKind;
  name: string;
  pos: Vector3;
}

type SurfaceAt = (x: number, z: number) => number;

function painted(geo: BufferGeometry, hex: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new Color(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

function at(geo: BufferGeometry, x: number, y: number, z: number) {
  geo.translate(x, y, z);
  return geo;
}

const merge = (parts: BufferGeometry[]) => mergeGeometries(parts, false)!;

function roundTree() {
  return merge([
    painted(at(new CylinderGeometry(0.05, 0.07, 0.3, 5), 0, 0.15, 0), '#6d4c33'),
    painted(at(new IcosahedronGeometry(0.36, 0), 0, 0.55, 0), '#ffffff'),
  ]);
}

function cypress() {
  return merge([
    painted(at(new CylinderGeometry(0.04, 0.05, 0.16, 5), 0, 0.08, 0), '#6d4c33'),
    painted(at(new ConeGeometry(0.19, 1.05, 6), 0, 0.66, 0), '#ffffff'),
  ]);
}

function house() {
  const roof = new ConeGeometry(0.26, 0.15, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1, 1, 1.25);
  return merge([
    painted(at(new BoxGeometry(0.34, 0.2, 0.42), 0, 0.1, 0), '#fbf7ef'),
    painted(at(new BoxGeometry(0.346, 0.045, 0.426), 0, 0.115, 0), '#dfe8ee'),
    painted(at(roof, 0, 0.275, 0), '#c8673f'),
  ]);
}

function block() {
  return merge([
    painted(at(new BoxGeometry(0.38, 0.5, 0.38), 0, 0.25, 0), '#f4efe6'),
    painted(at(new BoxGeometry(0.4, 0.03, 0.4), 0, 0.515, 0), '#d9d2c4'),
    painted(at(new BoxGeometry(0.39, 0.035, 0.39), 0, 0.2, 0), '#7fa6bd'),
    painted(at(new BoxGeometry(0.39, 0.035, 0.39), 0, 0.36, 0), '#7fa6bd'),
  ]);
}

function castle() {
  const parts = [painted(at(new BoxGeometry(1.1, 0.42, 1.1), 0, 0.21, 0), '#e7dcc5')];
  for (const [x, z] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ]) {
    parts.push(painted(at(new CylinderGeometry(0.17, 0.19, 0.72, 8), x, 0.36, z), '#efe6d2'));
    parts.push(painted(at(new ConeGeometry(0.21, 0.26, 8), x, 0.85, z), '#c8673f'));
  }
  parts.push(painted(at(new BoxGeometry(0.42, 0.95, 0.42), 0, 0.475, 0), '#f3ebd9'));
  return merge(parts);
}

function ruin() {
  const parts = [painted(at(new BoxGeometry(1.25, 0.1, 0.75), 0, 0.05, 0), '#e9e0cc')];
  for (let i = 0; i < 5; i++) {
    for (const z of [-0.27, 0.27]) {
      if (i === 3 && z > 0) continue;
      parts.push(painted(at(new CylinderGeometry(0.06, 0.07, 0.62, 7), -0.5 + i * 0.25, 0.41, z), '#fbf6ea'));
    }
  }
  parts.push(painted(at(new BoxGeometry(1.2, 0.08, 0.7), 0, 0.76, 0), '#f1e8d6'));
  const pediment = new CylinderGeometry(0.42, 0.42, 1.2, 3, 1);
  pediment.rotateZ(Math.PI / 2);
  pediment.scale(1, 0.32, 0.84);
  parts.push(painted(at(pediment, 0, 0.86, 0), '#f6efe1'));
  return merge(parts);
}

function lighthouse() {
  return merge([
    painted(at(new CylinderGeometry(0.4, 0.45, 0.14, 10), 0, 0.07, 0), '#e7dcc5'),
    painted(at(new CylinderGeometry(0.16, 0.24, 0.5, 10), 0, 0.39, 0), '#fbf7ef'),
    painted(at(new CylinderGeometry(0.155, 0.17, 0.2, 10), 0, 0.74, 0), '#c4473a'),
    painted(at(new CylinderGeometry(0.17, 0.155, 0.4, 10), 0, 1.04, 0), '#fbf7ef'),
    painted(at(new CylinderGeometry(0.13, 0.13, 0.14, 10), 0, 1.31, 0), '#ffe08a'),
    painted(at(new ConeGeometry(0.19, 0.18, 10), 0, 1.47, 0), '#c4473a'),
  ]);
}

export interface GrowUniforms {
  uGrow: { value: number };
  uReveal: { value: number };
  uRevealCenter: { value: Vector2 };
  uShadowMix: { value: number };
  uNight: { value: number };
}

export type ShadowAt = (x: number, y: number, z: number, dir: Vector3) => number;

function growMaterial(u: GrowUniforms, opts: { roughness?: number } = {}) {
  const m = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: opts.roughness ?? 0.85 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = `uniform float uGrow;\nuniform float uReveal;\nuniform vec2 uRevealCenter;\nuniform float uShadowMix;\nattribute vec2 aShadow;\nvarying float vShadow;\nvarying float vLit;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
      #else
        vec2 ip = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
      #endif
      float g = clamp((uReveal - distance(ip, uRevealCenter)) / 9.0, 0.0, 1.0) * uGrow;
      g = g * g * (3.0 - 2.0 * g);
      transformed *= g;
      vShadow = mix(aShadow.x, aShadow.y, uShadowMix);
      #ifdef USE_INSTANCING
        vLit = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
      #else
        vLit = 1.0;
      #endif`,
    );
    shader.fragmentShader = `uniform float uNight;\nvarying float vShadow;\nvarying float vLit;\n${shader.fragmentShader}`
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_COLOR
          float win = step(0.08, vColor.b - vColor.r);
          float wall = step(0.75, min(vColor.r, vColor.g)) * step(vColor.r - vColor.b, 0.25);
          float lamp = step(0.95, vColor.r) * step(0.65, vColor.g) * step(vColor.g, 0.85) * step(vColor.b, 0.4);
          float on = step(0.32, vLit);
          totalEmissiveRadiance += vec3(1.0, 0.68, 0.34) * ((wall * 0.62 + win * 1.6) * on + lamp * 3.5) * uNight;
        #endif`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= mix(0.18, 1.0, vShadow);
        reflectedLight.directSpecular *= vShadow;`,
      );
  };
  return m;
}

function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class DetailLayer {
  readonly group = new Group();
  readonly roads = new Group();
  readonly landmarks: Landmark[] = [];
  readonly uniforms: GrowUniforms = {
    uGrow: { value: 0 },
    uReveal: { value: 0 },
    uRevealCenter: { value: new Vector2() },
    uShadowMix: { value: 0 },
    uNight: { value: 0 },
  };
  private materials: Material[] = [];
  private roadMaterials: LineMaterial[] = [];
  private meshes: { mesh: InstancedMesh; base: Float32Array; shadow: InstancedBufferAttribute }[] = [];
  private shadowCache = new Map<number, Float32Array[]>();
  private shadowPair = '';
  private roadDay = [new Color(0xfff3d6), new Color(0xffffff)];
  private roadNight = new Color(0xffb35c);

  constructor(data: DetailData, surface: SurfaceAt) {
    const [lon0, lat0] = data.origin;
    const toWorld = (ex: number, ey: number) => {
      const { x, z } = lonLatToWorld(lon0 + ex / data.scale, lat0 + ey / data.scale);
      return new Vector3(x, surface(x, z), z);
    };

    const foliage = growMaterial(this.uniforms);
    const built = growMaterial(this.uniforms, { roughness: 0.7 });
    this.materials.push(foliage, built);

    const greens = ['#5f8f45', '#6f9c4c', '#4f7f3f', '#7aa356', '#577f3a'].map((h) => new Color(h));
    const darkGreens = ['#3f6b3a', '#355f33', '#47753f'].map((h) => new Color(h));
    this.instanced(data.trees, 3, toWorld, [roundTree(), cypress()], foliage, (i, type) => ({
      scale: 0.8 + hash(i) * 0.5,
      color: type ? darkGreens[i % darkGreens.length] : greens[i % greens.length],
    }));
    this.instanced(data.houses, 3, toWorld, [house(), block()], built, (i) => ({ scale: 0.85 + hash(i + 7) * 0.4 }));

    const kinds: LandmarkKind[] = ['castle', 'ruin', 'lighthouse'];
    const shapes = { castle: castle(), ruin: ruin(), lighthouse: lighthouse() };
    const landmarkMaterial = growMaterial(this.uniforms, { roughness: 0.75 });
    this.materials.push(landmarkMaterial);
    for (const kind of kinds) {
      const list = data.landmarks.filter((l) => l[2] === kind);
      const mesh = new InstancedMesh(shapes[kind], landmarkMaterial, list.length);
      const m = new Matrix4();
      const q = new Quaternion();
      list.forEach(([ex, ey, , name], i) => {
        const pos = toWorld(ex, ey);
        q.setFromAxisAngle(new Vector3(0, 1, 0), hash(i + 3) * Math.PI);
        m.compose(pos, q, new Vector3(1.15, 1.15, 1.15));
        mesh.setMatrixAt(i, m);
        this.landmarks.push({ kind, name, pos: pos.clone().setY(pos.y + 1.4) });
      });
      this.track(mesh);
    }

    this.buildRoads(data.roads, toWorld);
  }

  private instanced(
    flat: number[],
    stride: number,
    toWorld: (ex: number, ey: number) => Vector3,
    shapes: BufferGeometry[],
    material: Material,
    style: (i: number, type: number) => { scale: number; color?: Color },
  ) {
    const byType = shapes.map(() => [] as number[]);
    for (let i = 0; i < flat.length; i += stride) byType[flat[i + 2]]?.push(i);
    shapes.forEach((geo, type) => {
      const idx = byType[type];
      const mesh = new InstancedMesh(geo, material, idx.length);
      const m = new Matrix4();
      const q = new Quaternion();
      const s = new Vector3();
      const axis = new Vector3(0, 1, 0);
      idx.forEach((i, k) => {
        const pos = toWorld(flat[i], flat[i + 1]);
        const st = style(i, type);
        q.setFromAxisAngle(axis, hash(i) * Math.PI * 2);
        s.setScalar(st.scale);
        m.compose(pos, q, s);
        mesh.setMatrixAt(k, m);
        if (st.color) mesh.setColorAt(k, st.color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.track(mesh);
    });
  }

  private track(mesh: InstancedMesh) {
    const base = new Float32Array(mesh.count * 3);
    const m = new Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      base.set([m.elements[12], m.elements[13], m.elements[14]], i * 3);
    }
    const shadow = new InstancedBufferAttribute(new Float32Array(mesh.count * 2).fill(1), 2);
    mesh.geometry.setAttribute('aShadow', shadow);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.meshes.push({ mesh, base, shadow });
  }

  hasShadows(key: number) {
    return this.shadowCache.has(key);
  }

  computeShadows(key: number, dir: Vector3, shadowAt: ShadowAt) {
    if (this.shadowCache.has(key)) return;
    this.shadowCache.set(
      key,
      this.meshes.map(({ base }) => {
        const out = new Float32Array(base.length / 3);
        for (let i = 0; i < out.length; i++) out[i] = shadowAt(base[i * 3], base[i * 3 + 1], base[i * 3 + 2], dir);
        return out;
      }),
    );
  }

  setShadows(from: number, to: number, mix: number) {
    this.uniforms.uShadowMix.value = mix;
    const pair = `${from}:${to}`;
    const a = this.shadowCache.get(from);
    const b = this.shadowCache.get(to);
    if (pair === this.shadowPair || !a || !b) return;
    this.shadowPair = pair;
    this.meshes.forEach(({ shadow }, k) => {
      const arr = shadow.array as Float32Array;
      for (let i = 0; i < a[k].length; i++) {
        arr[i * 2] = a[k][i];
        arr[i * 2 + 1] = b[k][i];
      }
      shadow.needsUpdate = true;
    });
  }

  private buildRoads(roads: DetailData['roads'], toWorld: (ex: number, ey: number) => Vector3) {
    const byRank: number[][] = [[], []];
    for (const [rank, flat] of roads) {
      const pts: Vector3[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        const p = toWorld(flat[i], flat[i + 1]);
        p.y += 0.28;
        pts.push(p);
      }
      const out = byRank[Math.min(rank, 1)];
      for (let i = 1; i < pts.length; i++) out.push(pts[i - 1].x, pts[i - 1].y, pts[i - 1].z, pts[i].x, pts[i].y, pts[i].z);
    }
    const styles = [
      { color: 0xfff3d6, linewidth: 2.2, opacity: 0.9 },
      { color: 0xffffff, linewidth: 1.2, opacity: 0.55 },
    ];
    byRank.forEach((positions, i) => {
      if (!positions.length) return;
      const geo = new LineSegmentsGeometry();
      geo.setPositions(positions);
      const mat = new LineMaterial({ ...styles[i], transparent: true, depthWrite: false });
      this.roadMaterials.push(mat);
      const lines = new LineSegments2(geo, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 0.5;
      this.roads.add(lines);
    });
  }

  setResolution(w: number, h: number) {
    for (const m of this.roadMaterials) m.resolution.set(w, h);
  }

  update(cameraDistance: number, revealCenter: Vector3 | null, dt: number, instant: boolean, night = 0) {
    this.uniforms.uNight.value = night;
    const near = 1 - MathUtils.smoothstep(cameraDistance, 230, 340);
    const u = this.uniforms;
    u.uGrow.value = near;
    this.group.visible = near > 0.001;
    if (revealCenter && u.uReveal.value === 0) u.uRevealCenter.value.set(revealCenter.x, revealCenter.z);
    if (revealCenter || u.uReveal.value > 0) u.uReveal.value = instant ? 5000 : Math.min(5000, u.uReveal.value + dt * 70);
    const roadFade = 1 - MathUtils.smoothstep(cameraDistance, 320, 700);
    this.roads.visible = roadFade > 0.01;
    this.roadMaterials.forEach((m, i) => {
      m.opacity = (i ? 0.55 : 0.9) * roadFade * (1 - night * (i ? 0.35 : 0.1));
      m.color.lerpColors(this.roadDay[i], this.roadNight, night * 0.85);
    });
  }

  dispose() {
    for (const g of [this.group, this.roads])
      g.traverse((o) => {
        if (o instanceof InstancedMesh || o instanceof LineSegments2) o.geometry.dispose();
      });
    this.materials.forEach((m) => m.dispose());
    this.roadMaterials.forEach((m) => m.dispose());
  }
}
