import { DataTexture, ShaderMaterial, Vector2, Vector3, type Texture } from 'three';
import { DEPTH_MAX, ELEV_MAX, KM_PER_PX, SDF_RANGE, TEX_H, TEX_W } from './projection';

const common = /* glsl */ `
  uniform sampler2D uHeight;
  uniform sampler2D uMasks;
  uniform float uElevMax;
  uniform float uDepthMax;
  uniform float uSdfRange;
  uniform float uExag;
  uniform float uRise;
  varying vec2 vUv;
  varying vec3 vWorld;

  float decodeH(float v) {
    float t = v * 255.0 - 128.0;
    return t >= 0.0 ? pow(t / 127.0, 2.0) * uElevMax : -pow(-t / 128.0, 2.0) * uDepthMax;
  }
`;

const vertexShader = /* glsl */ `
  ${common}
  uniform float uLod;

  void main() {
    vUv = uv;
    float h = decodeH(textureLod(uHeight, uv, uLod).r);
    float sdf = (textureLod(uMasks, uv, uLod).r * 255.0 - 128.0) / 127.0 * uSdfRange;
    float land = smoothstep(-1.0, 3.0, sdf);
    vec3 p = position;
    p.y += max(h, 0.0) * 0.001 * uExag * land * uRise;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  ${common}
  uniform vec2 uTexel;
  uniform float uTexelKm;
  uniform float uTime;
  uniform vec3 uLightDir;
  uniform vec3 uFog;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uFocus;
  uniform float uFocusAmt;
  uniform float uFocusRadius;
  uniform sampler2D uCover;
  uniform float uCoverAmt;

  float landH(vec2 uv) {
    return max(decodeH(texture2D(uHeight, uv).r), 0.0);
  }

  float isoLine(float v) {
    float w = max(fwidth(v), 1e-4);
    return 1.0 - smoothstep(0.0, 1.0, abs(fract(v - 0.5) - 0.5) / w);
  }

  void main() {
    vec4 m = texture2D(uMasks, vUv);
    float sdf = (m.r * 255.0 - 128.0) / 127.0 * uSdfRange;
    float greece = smoothstep(0.25, 0.75, m.g);
    float h = decodeH(texture2D(uHeight, vUv).r);
    float aa = max(fwidth(sdf), 1e-3);
    float land = smoothstep(-0.6 * aa, 0.6 * aa, sdf);

    vec2 dx = vec2(uTexel.x, 0.0);
    vec2 dy = vec2(0.0, uTexel.y);
    float k = 0.001 * uExag * max(uRise, 0.15) / (2.0 * uTexelKm);
    vec3 n = normalize(vec3((landH(vUv - dx) - landH(vUv + dx)) * k, 1.0, (landH(vUv + dy) - landH(vUv - dy)) * k));
    float diffuse = clamp(dot(n, uLightDir), 0.0, 1.0);
    float slope = 1.0 - n.y;

    float e = clamp(max(h, 0.0) / 2400.0, 0.0, 1.0);
    vec3 landCol = mix(vec3(0.976, 0.910, 0.745), vec3(0.957, 0.792, 0.420), smoothstep(0.0, 0.28, e));
    landCol = mix(landCol, vec3(0.835, 0.635, 0.353), smoothstep(0.32, 0.72, e));
    landCol = mix(landCol, vec3(0.980, 0.960, 0.910), smoothstep(0.8, 1.0, e));
    vec3 neighbor = mix(vec3(0.243, 0.396, 0.518), vec3(0.353, 0.494, 0.600), e);
    landCol = mix(neighbor, landCol, greece);
    vec4 lc = texture2D(uCover, vUv);
    float cov = greece * uCoverAmt * (1.0 - smoothstep(0.78, 0.95, e));
    landCol = mix(landCol, vec3(0.80, 0.76, 0.52), smoothstep(0.35, 0.95, lc.a) * 0.3 * cov);
    landCol = mix(landCol, vec3(0.90, 0.86, 0.58), smoothstep(0.2, 0.8, lc.b) * 0.5 * cov);
    landCol = mix(landCol, vec3(0.45, 0.60, 0.33), smoothstep(0.1, 0.65, lc.r) * 0.82 * cov);
    landCol = mix(landCol, vec3(0.95, 0.93, 0.89), smoothstep(0.08, 0.5, lc.g) * 0.85 * cov);
    float hBlur = max(decodeH(textureLod(uHeight, vUv, 4.5).r), 0.0);
    float cavity = clamp((max(h, 0.0) - hBlur) / 450.0, -1.0, 1.0);
    float light = 0.24 + 0.76 * diffuse;
    vec3 shade = mix(vec3(0.30, 0.40, 0.56), vec3(1.07, 1.04, 0.98), light);
    landCol *= mix(vec3(1.0), shade, 0.88);
    landCol *= 1.0 + cavity * 0.22;
    landCol = mix(landCol, landCol * 0.8, isoLine(max(h, 0.0) / 250.0) * 0.45 * greece * step(40.0, h) * (1.0 - slope * 0.5));

    float depth = clamp(-h / 3500.0, 0.0, 1.0);
    vec3 seaCol = mix(vec3(0.384, 0.722, 0.827), vec3(0.165, 0.525, 0.722), smoothstep(0.0, 0.045, depth));
    seaCol = mix(seaCol, vec3(0.0, 0.325, 0.518), smoothstep(0.05, 0.3, depth));
    seaCol = mix(seaCol, vec3(0.0, 0.208, 0.345), smoothstep(0.35, 1.0, depth));
    float coastGlow = exp(-max(-sdf, 0.0) / 3.5);
    seaCol = mix(seaCol, vec3(0.78, 0.91, 0.94), coastGlow * 0.34);
    seaCol = mix(seaCol, seaCol * 1.18 + 0.025, isoLine(-h / 500.0) * 0.28 * step(120.0, -h));

    vec3 col = mix(seaCol, landCol, land);
    float coast = 1.0 - smoothstep(0.35, 1.35, abs(sdf) / aa);
    col = mix(col, vec3(1.0, 0.985, 0.94), coast * 0.6);

    float fd = length(vWorld.xz - uFocus.xz);
    float fw = max(fwidth(fd), 1e-3);
    float glow = exp(-(fd * fd) / (uFocusRadius * uFocusRadius * 0.08));
    col = mix(col, vec3(0.949, 0.757, 0.306), glow * 0.28 * uFocusAmt);
    for (int i = 0; i < 2; i++) {
      float t = fract(uTime * 0.28 + float(i) * 0.5);
      float r = t * uFocusRadius;
      float ring = 1.0 - smoothstep(0.0, fw * 1.6, abs(fd - r));
      col = mix(col, vec3(0.988, 0.824, 0.400), ring * (1.0 - t) * 0.9 * uFocusAmt);
    }

    float dist = distance(vWorld, cameraPosition);
    float fog = smoothstep(uFogNear, uFogFar, dist);
    vec2 eUv = min(vUv, 1.0 - vUv);
    float edge = smoothstep(0.0, 0.2, min(eUv.x, eUv.y));
    col = mix(uFog, col, edge * (1.0 - fog));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const FOG_HEX = '#03304f';

export function srgb(hex: string): Vector3 {
  const n = parseInt(hex.slice(1), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function createTerrainMaterial(height: Texture, masks: Texture, lod: number) {
  const blank = new DataTexture(new Uint8Array(4), 1, 1);
  blank.needsUpdate = true;
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uHeight: { value: height },
      uMasks: { value: masks },
      uLod: { value: lod },
      uElevMax: { value: ELEV_MAX },
      uDepthMax: { value: DEPTH_MAX },
      uSdfRange: { value: SDF_RANGE },
      uExag: { value: 7 },
      uRise: { value: 0 },
      uTexel: { value: new Vector2(1 / TEX_W, 1 / TEX_H) },
      uTexelKm: { value: KM_PER_PX },
      uTime: { value: 0 },
      uLightDir: { value: new Vector3(-0.7, 0.5, 0.18).normalize() },
      uFog: { value: srgb(FOG_HEX) },
      uFogNear: { value: 900 },
      uFogFar: { value: 2600 },
      uFocus: { value: new Vector3() },
      uFocusAmt: { value: 0 },
      uFocusRadius: { value: 24 },
      uCover: { value: blank },
      uCoverAmt: { value: 0 },
    },
  });
}
