import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { ESPOSIZIONE, uniformiCielo } from './atmosfera'
import type { ParametriCielo } from './atmosfera'

/**
 * Il cielo fisico di three (Sky.js, modello di Preetham) con in più la notte:
 * blu profondo, stelle che brillano piano e il chiarore della luna.
 */
const NOTTE_GLSL = /* glsl */ `
uniform float uNotte;
uniform float uTempo;
uniform vec3 uLunaDir;
uniform float uStelle;

float hashStella(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 cieloNotte(vec3 dir) {
  float h = max(dir.y, 0.0);
  vec3 col = mix(vec3(0.020, 0.033, 0.068), vec3(0.0035, 0.0075, 0.024), pow(h, 0.45));
  // chiarore della luna
  float cm = max(dot(dir, uLunaDir), 0.0);
  col += vec3(0.55, 0.62, 0.8) * (pow(cm, 900.0) * 0.6 + pow(cm, 60.0) * 0.06 + pow(cm, 8.0) * 0.012);
  // stelle: una per cella, solo alcune accese, più fitte in alto
  if (uStelle > 0.5) {
    vec3 p = dir * 260.0;
    vec3 c = floor(p);
    float r = hashStella(c);
    if (r > 0.93) {
      vec3 centro = c + 0.5 + (vec3(hashStella(c + 3.1), hashStella(c + 7.7), hashStella(c + 1.9)) - 0.5) * 0.6;
      float dd = length(p - centro);
      float luce = smoothstep(0.16, 0.0, dd) * (0.35 + 2.4 * pow((r - 0.93) / 0.07, 3.0));
      float tremola = 0.75 + 0.25 * sin(uTempo * (1.5 + r * 3.0) + r * 40.0);
      vec3 tinta = mix(vec3(1.0, 0.86, 0.7), vec3(0.8, 0.88, 1.0), hashStella(c + 5.3));
      col += tinta * luce * tremola * smoothstep(0.0, 0.25, dir.y) * (1.0 - smoothstep(0.92, 1.0, cm));
    }
  }
  return col;
}
`

export function creaCielo(scala: number, stelle = true): Sky {
  const sky = new Sky()
  const m = sky.material as THREE.ShaderMaterial
  m.uniforms.uNotte = uniformiCielo.uNotte
  m.uniforms.uTempo = uniformiCielo.uTempo
  m.uniforms.uLunaDir = uniformiCielo.uLunaDir
  m.uniforms.uStelle = { value: stelle ? 1 : 0 }
  m.fragmentShader = m.fragmentShader
    .replace('void main() {', `${NOTTE_GLSL}\nvoid main() {`)
    .replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      `gl_FragColor = vec4( retColor * ${ESPOSIZIONE.toFixed(3)} * (1.0 - uNotte) + cieloNotte(direction) * uNotte, 1.0 );`,
    )
  m.fog = false
  sky.scale.setScalar(scala)
  sky.frustumCulled = false
  sky.renderOrder = -10
  return sky
}

export function aggiornaCielo(sky: Sky, sole: THREE.Vector3, p: ParametriCielo) {
  const u = (sky.material as THREE.ShaderMaterial).uniforms
  u.sunPosition.value.copy(sole)
  u.turbidity.value = p.turbidity
  u.rayleigh.value = p.rayleigh
  u.mieCoefficient.value = p.mieCoefficient
  u.mieDirectionalG.value = p.mieDirectionalG
}
