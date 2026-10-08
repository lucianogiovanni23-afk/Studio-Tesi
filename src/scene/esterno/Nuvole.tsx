import { useEffect, useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { LIVELLO_RIFLESSO } from './Acqua'
import { uniformiCielo, type StatoAtmosfera } from './atmosfera'

const QUOTA = 1100

/**
 * Uno strato di cumuli sul mare: un grande piano in quota con nuvole da una
 * texture di rumore frattale, che scorrono piano col vento. Ogni nuvola è
 * più chiara dal lato del sole e scura sotto; al tramonto si accende di rosa
 * e arancio, di notte resta appena visibile contro le stelle.
 */
export function Nuvole({ stato }: { stato: StatoAtmosfera }) {
  const rumore = useTexture(`${import.meta.env.BASE_URL}assets/esterno/nuvole.webp`, (t) => {
    const tex = Array.isArray(t) ? t[0] : t
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  })
  const materiale = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'StratoNuvole',
        uniforms: {
          ...uniformiCielo,
          uLuce: { value: new THREE.Color() },
          uOmbra: { value: new THREE.Color() },
          uCopertura: { value: 0.42 },
          uRumore: { value: rumore },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uLuce;
          uniform vec3 uOmbra;
          uniform float uCopertura;
          uniform vec3 uSoleDir;
          uniform vec3 uFoschia;
          uniform float uTempo;
          uniform sampler2D uRumore;
          varying vec3 vWorld;
          float densita(vec2 p) {
            vec3 t = texture2D(uRumore, p).rgb;
            float n = t.r + (texture2D(uRumore, p * 3.7 + t.b * 0.2).g - 0.5) * 0.45;
            return smoothstep(1.0 - uCopertura, 1.0 - uCopertura + 0.22, n);
          }
          void main() {
            vec2 vento = vec2(uTempo * 0.00025, uTempo * 0.00006);
            vec2 p = vWorld.xz / 16000.0 + vento;
            float d = densita(p);
            if (d < 0.01) discard;
            // autoombra: più nuvola verso il sole → più scura
            vec2 versoSole = normalize(uSoleDir.xz + vec2(1e-4)) * 0.008;
            float d2 = densita(p + versoSole);
            float luce = clamp(1.0 - (d2 - d) * 1.6 - d * 0.35, 0.0, 1.0);
            vec3 col = mix(uOmbra, uLuce, luce);
            // bordi sottili più luminosi in controluce
            vec3 v = normalize(vWorld - cameraPosition);
            float contro = pow(max(dot(v, uSoleDir), 0.0), 6.0);
            col += uLuce * contro * (1.0 - d) * 0.8;
            float dist = length(vWorld.xz - cameraPosition.xz);
            float lontano = smoothstep(4500.0, 12500.0, dist);
            col = mix(col, uFoschia, lontano * 0.75);
            float a = d * 0.92 * (1.0 - smoothstep(9000.0, 13000.0, dist));
            gl_FragColor = vec4(col, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [rumore],
  )

  useEffect(() => {
    const u = materiale.uniforms
    // di giorno bianche con la pancia grigio-azzurra; al tramonto rosa e oro; di notte blu scuro
    const sole = stato.luce.clone().multiplyScalar(1 - stato.notte)
    const luce = new THREE.Color(1, 1, 1).multiplyScalar(0.95).lerp(new THREE.Color(1.0, 0.55, 0.36).multiply(sole), stato.oro * 0.9)
    luce.multiplyScalar(THREE.MathUtils.lerp(1, 0.75, stato.oro)).lerp(new THREE.Color(0.07, 0.08, 0.12), stato.notte)
    const ombra = stato.zenit.clone().multiplyScalar(1.4).lerp(new THREE.Color(0.55, 0.57, 0.62), 0.55)
    ombra.lerp(new THREE.Color(0.42, 0.24, 0.26), stato.oro * 0.8).lerp(new THREE.Color(0.02, 0.025, 0.04), stato.notte)
    u.uLuce.value.copy(luce)
    u.uOmbra.value.copy(ombra)
  }, [materiale, stato])

  const mesh = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(28000, 26000), materiale)
    m.rotation.x = Math.PI / 2
    m.position.set(0, QUOTA, -6 - 12000)
    m.frustumCulled = false
    m.renderOrder = -8
    m.layers.enable(LIVELLO_RIFLESSO)
    return m
  }, [materiale])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      materiale.dispose()
    },
    [mesh, materiale],
  )
  return <primitive object={mesh} />
}
