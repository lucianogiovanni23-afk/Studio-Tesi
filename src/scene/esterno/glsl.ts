/**
 * Pezzi di shader comuni all'esterno: luce del sole (o della luna), cielo
 * come luce ambiente e foschia che sale con la distanza fino al colore
 * dell'orizzonte. I materiali dell'esterno non usano le luci della sala.
 */
export const LUCE = /* glsl */ `
uniform vec3 uSoleDir;
uniform vec3 uSoleColore;
uniform vec3 uAmbCielo;
uniform vec3 uAmbTerra;
uniform vec3 uFoschia;
uniform vec3 uFoschiaSole;
uniform float uFoschiaDens;
uniform float uNotte;
uniform float uTempo;

vec3 illumina(vec3 albedo, vec3 n, float ao) {
  float nl = max(dot(n, uSoleDir), 0.0);
  vec3 amb = mix(uAmbTerra, uAmbCielo, n.y * 0.5 + 0.5);
  return albedo * (uSoleColore * nl + amb * ao);
}

vec3 foschia(vec3 col, vec3 wpos) {
  vec3 v = wpos - cameraPosition;
  float d = length(v);
  vec3 dir = v / max(d, 1e-3);
  // aria più densa in basso, vicino al mare
  float quota = clamp(1.0 - (wpos.y + 90.0) / 900.0, 0.35, 1.0);
  float f = 1.0 - exp(-d * uFoschiaDens * quota);
  float s = pow(max(dot(dir, normalize(vec3(uSoleDir.x, 0.0, uSoleDir.z))), 0.0), 6.0);
  return mix(col, uFoschia + uFoschiaSole * s, clamp(f, 0.0, 1.0));
}
`

/** Hash e rumore leggeri, uguali ovunque. */
export const RUMORE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float rumore(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * rumore(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
`
