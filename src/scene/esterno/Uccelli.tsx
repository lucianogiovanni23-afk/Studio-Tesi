import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { uniformiCielo } from './atmosfera'

const N = 7
// appoggi riutilizzati a ogni fotogramma
const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const s = new THREE.Vector3()
const p = new THREE.Vector3()
const dir = new THREE.Vector3()

/** Sagoma di un uccello: corpo e due ali, che battono nel vertex shader. */
function geometriaUccello() {
  const p = [
    // ala sinistra
    0, 0, 0.12, -0.55, 0.02, -0.02, 0, 0, -0.1,
    // ala destra
    0, 0, 0.12, 0, 0, -0.1, 0.55, 0.02, -0.02,
    // corpo
    0, 0.02, 0.25, -0.05, 0, -0.05, 0.05, 0, -0.05,
    0, 0.02, -0.05, -0.05, 0, -0.3, 0.05, 0, -0.3,
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  return g
}

/**
 * Uno stormo che ogni tanto attraversa la valle davanti alla vetrata, di
 * giorno: poche istanze, nessun peso.
 */
export function Uccelli({ attivi }: { attivi: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geometria = useMemo(() => geometriaUccello(), [])
  const materiale = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTempo: uniformiCielo.uTempo, uFoschia: uniformiCielo.uFoschia, uNotte: uniformiCielo.uNotte },
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform float uTempo;
          varying float vD;
          void main() {
            vec3 p = position;
            float fase = float(gl_InstanceID) * 1.7;
            float batti = sin(uTempo * 11.0 + fase);
            p.y += abs(p.x) * batti * 0.9;
            vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
            vD = length(wp.xyz - cameraPosition);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uFoschia;
          varying float vD;
          void main() {
            vec3 c = mix(vec3(0.03, 0.03, 0.035), uFoschia, clamp(vD / 900.0, 0.0, 0.7));
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  )
  useEffect(
    () => () => {
      geometria.dispose()
      materiale.dispose()
    },
    [geometria, materiale],
  )

  const volo = useRef({ t: 0, attesa: 6, durata: 26, da: new THREE.Vector3(), a: new THREE.Vector3(), seme: 1 })

  useFrame((_, dt) => {
    const im = mesh.current
    if (!im) return
    const v = volo.current
    if (!attivi) {
      im.visible = false
      return
    }
    if (v.attesa > 0) {
      v.attesa -= dt
      im.visible = false
      if (v.attesa <= 0) {
        // nuovo passaggio: da un lato all'altro della valle, a quote e distanze diverse
        v.seme = (v.seme * 16807) % 2147483647
        const r = (v.seme % 1000) / 1000
        const lato = r > 0.5 ? 1 : -1
        const dist = 45 + r * 110
        const quota = 6 + r * 22
        v.da.set(-lato * (40 + dist * 0.9), quota, -6 - dist)
        v.a.set(lato * (40 + dist * 0.9), quota + (r - 0.5) * 14, -6 - dist - 30 + r * 40)
        v.durata = 14 + dist / 9
        v.t = 0
      }
      return
    }
    v.t += dt / v.durata
    if (v.t >= 1) {
      v.attesa = 20 + ((v.seme >> 3) % 25)
      im.visible = false
      return
    }
    im.visible = true
    dir.subVectors(v.a, v.da).normalize()
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
    for (let i = 0; i < N; i++) {
      const off = i - (N - 1) / 2
      p.lerpVectors(v.da, v.a, v.t)
      // formazione a V morbida che si deforma un poco
      p.x += -dir.x * Math.abs(off) * 2.2 + Math.sin(v.t * 20 + i) * 0.6
      p.z += -dir.z * Math.abs(off) * 2.2 + off * 1.6
      p.y += Math.sin(v.t * 9 + i * 1.3) * 0.8
      s.setScalar(0.85 + (i % 3) * 0.12)
      m.compose(p, q, s)
      im.setMatrixAt(i, m)
    }
    im.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geometria, materiale, N]} frustumCulled={false} visible={false} />
}
