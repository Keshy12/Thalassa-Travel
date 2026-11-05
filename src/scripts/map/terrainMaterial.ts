import { DataTexture, ShaderMaterial, Vector2, Vector3, type Texture } from 'three';
import { DEPTH_MAX, ELEV_MAX, KM_PER_PX, MAP_H, MAP_W, SDF_RANGE, TEX_H, TEX_W } from './projection';

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
  uniform vec3 uSunColor;
  uniform vec3 uShadeColor;
  uniform float uNight;
  uniform float uGlint;
  uniform float uCloud;
  uniform sampler2D uCover;
  uniform vec2 uMapKm;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float a = 0.5;
    float v = 0.0;
    for (int i = 0; i < 4; i++) {
      v += vnoise(p) * a;
      p = p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }

  float sunShadow(vec2 uv, float h0) {
    vec2 sunXZ = uLightDir.xz;
    float fl = length(sunXZ);
    if (uLightDir.y <= 0.02 || fl < 1e-3) return 1.0;
    vec2 dir = sunXZ / fl;
    vec2 duv = vec2(dir.x / uMapKm.x, -dir.y / uMapKm.y);
    float rise = uLightDir.y / fl;
    float k = 0.001 * uExag * uRise;
    float start = h0 * k + 0.05;
    float s = 0.7;
    float lit = 1.0;
    for (int i = 0; i < 22; i++) {
      float th = max(decodeH(textureLod(uHeight, uv + duv * s, 1.0).r), 0.0) * k;
      float ray = start + s * rise;
      lit = min(lit, clamp((ray - th) * 6.0 / s + 0.5, 0.0, 1.0));
      s *= 1.22;
    }
    return lit;
  }

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
    float shadow = sunShadow(vUv, max(h, 0.0));
    float diffuse = clamp(dot(n, uLightDir), 0.0, 1.0) * mix(0.18, 1.0, shadow);
    float slope = 1.0 - n.y;

    float e = clamp(max(h, 0.0) / 2400.0, 0.0, 1.0);
    vec3 landCol = mix(vec3(0.976, 0.910, 0.745), vec3(0.957, 0.792, 0.420), smoothstep(0.0, 0.28, e));
    landCol = mix(landCol, vec3(0.835, 0.635, 0.353), smoothstep(0.32, 0.72, e));
    landCol = mix(landCol, vec3(0.980, 0.960, 0.910), smoothstep(0.8, 1.0, e));
    vec3 neighbor = mix(vec3(0.243, 0.396, 0.518), vec3(0.353, 0.494, 0.600), e);
    landCol = mix(neighbor, landCol, greece);
    float hBlur = max(decodeH(textureLod(uHeight, vUv, 4.5).r), 0.0);
    float cavity = clamp((max(h, 0.0) - hBlur) / 450.0, -1.0, 1.0);
    float light = 0.24 + 0.76 * diffuse;
    vec3 shade = mix(uShadeColor, uSunColor, light);
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

    seaCol *= mix(1.0, 0.72, (1.0 - shadow) * step(0.02, uLightDir.y));
    seaCol *= mix(vec3(1.0), uSunColor * 0.92, 0.35);
    vec3 view = normalize(cameraPosition - vWorld);
    vec2 wp = vWorld.xz * 0.55;
    float t = uTime * 0.6;
    vec2 wave = vec2(vnoise(wp + vec2(t, t * 0.4)) - 0.5, vnoise(wp * 1.7 - vec2(t * 0.7, -t * 0.5) + 9.0) - 0.5);
    vec3 wn = normalize(vec3(wave.x * 0.45, 1.0, wave.y * 0.45));
    vec3 hv = normalize(uLightDir + view);
    float sparkle = pow(max(dot(wn, hv), 0.0), 220.0) * 3.2 + pow(max(dot(vec3(0.0, 1.0, 0.0), hv), 0.0), 18.0) * 0.22;
    seaCol += uSunColor * sparkle * uGlint * step(0.0, uLightDir.y) * shadow;

    vec3 col = mix(seaCol, landCol, land);
    float cloud = smoothstep(0.52, 0.78, fbm(vWorld.xz * 0.012 + vec2(uTime * 0.012, uTime * 0.005))) * uCloud;
    col *= 1.0 - cloud * 0.3;
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

    col = mix(col, col * vec3(0.17, 0.22, 0.38), uNight * 0.86);
    float built = texture2D(uCover, vUv).g * greece * land;
    float spark = smoothstep(0.35, 0.95, vnoise(vWorld.xz * 2.4)) * (0.75 + 0.25 * sin(uTime * 3.0 + hash21(floor(vWorld.xz * 2.4)) * 40.0));
    float city = smoothstep(0.06, 0.55, built);
    float halo = smoothstep(0.02, 0.35, textureLod(uCover, vUv, 3.0).g) * greece;
    col += vec3(1.0, 0.74, 0.4) * (city * 0.42 + city * spark * 0.95 + halo * 0.22) * uNight;

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
      uSunColor: { value: new Vector3(1.07, 1.04, 0.98) },
      uShadeColor: { value: new Vector3(0.3, 0.4, 0.56) },
      uNight: { value: 0 },
      uGlint: { value: 0.3 },
      uCloud: { value: 0.5 },
      uCover: { value: blank },
      uMapKm: { value: new Vector2(MAP_W, MAP_H) },
    },
  });
}
