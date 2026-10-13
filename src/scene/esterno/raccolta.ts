import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { altezza, type Olivo } from './terreno'

/**
 * Raccolta delle olive (autunno): reti verdi e arancioni stese sotto alcuni
 * ulivi vicini, cassette piene di olive e una scala appoggiata a un tronco.
 * Tutto fuso in due geometrie (reti e attrezzi): due sole chiamate di disegno.
 */

const COLORI_RETE = ['#2b6a33', '#c4561c', '#33733a', '#cf6420']
const COLORI_CASSETTA = ['#2a6a35', '#b84524', '#2b5590', '#2a6a35']
const OLIVE = '#2a1a26'
const LEGNO = '#9a7350'

function colora(g: THREE.BufferGeometry, colore: string): THREE.BufferGeometry {
  const c = new THREE.Color(colore)
  const n = g.getAttribute('position').count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

function scatola(l: number, h: number, p: number, colore: string, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(l, h, p)
  g.translate(0, h / 2, 0)
  g.applyMatrix4(m)
  return colora(g, colore)
}

/** Generatore pseudo-casuale fisso: la raccolta è sempre uguale. */
function generatore(seme: number) {
  let s = seme
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export interface Raccolta {
  reti: THREE.BufferGeometry
  attrezzi: THREE.BufferGeometry
}

export function costruisciRaccolta(alberi: Olivo[]): Raccolta | null {
  if (alberi.length === 0) return null
  const r = generatore(2024)
  const reti: THREE.BufferGeometry[] = []
  const attrezzi: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const SU = new THREE.Vector3(0, 1, 0)

  alberi.forEach((a, i) => {
    // rete: un disco morbido che segue il terreno, più largo della chioma
    const raggio = 3.3 * a.scala + 0.4
    const rete = new THREE.PlaneGeometry(raggio * 2, raggio * 2, 18, 18)
    rete.rotateX(-Math.PI / 2)
    rete.rotateY(r() * Math.PI)
    const pos = rete.getAttribute('position')
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v) + a.x + 0.3
      const z = pos.getZ(v) + a.z + 0.2
      // un po' di pieghe, come una rete stesa a mano
      const piega = Math.sin(x * 2.1 + z * 1.3) * 0.025
      pos.setXYZ(v, x, altezza(x, z) + 0.05 + piega, z)
    }
    rete.computeVertexNormals()
    reti.push(colora(rete, COLORI_RETE[i % COLORI_RETE.length]))

    // cassette accanto alla rete, qualcuna impilata
    const nCassette = i < 2 ? 3 : 1
    const ang0 = r() * Math.PI * 2
    for (let c = 0; c < nCassette; c++) {
      const ang = ang0 + c * 0.32
      const d = raggio + 0.5 + c * 0.05
      const x = a.x + Math.sin(ang) * d
      const z = a.z + Math.cos(ang) * d
      const y = altezza(x, z)
      const impila = c === 1 ? 2 : 1
      for (let k = 0; k < impila; k++) {
        m.compose(new THREE.Vector3(x, y + k * 0.3, z), q.setFromAxisAngle(SU, ang + (r() - 0.5) * 0.4), new THREE.Vector3(1, 1, 1))
        attrezzi.push(scatola(0.56, 0.3, 0.38, COLORI_CASSETTA[(i + c + k) % COLORI_CASSETTA.length], m))
        // olive a colmo
        m.compose(new THREE.Vector3(x, y + k * 0.3 + 0.27, z), q, new THREE.Vector3(1, 1, 1))
        attrezzi.push(scatola(0.5, 0.05, 0.32, OLIVE, m))
      }
    }

    // una scala di legno appoggiata al primo albero
    if (i === 0) {
      const ang = ang0 + Math.PI * 0.8
      const base = new THREE.Vector3(a.x + Math.sin(ang) * 1.5, 0, a.z + Math.cos(ang) * 1.5)
      base.y = altezza(base.x, base.z)
      const lung = 3.1
      const incl = 0.5
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-incl, ang, 0, 'YXZ'))
      for (const lato of [-0.22, 0.22]) {
        m.compose(base.clone().add(new THREE.Vector3(lato, 0, 0).applyQuaternion(rot)), rot, new THREE.Vector3(1, 1, 1))
        attrezzi.push(scatola(0.05, lung, 0.06, LEGNO, m))
      }
      for (let p = 0.3; p < lung - 0.1; p += 0.32) {
        m.compose(base.clone().add(new THREE.Vector3(0, p, 0).applyQuaternion(rot)), rot, new THREE.Vector3(1, 1, 1))
        attrezzi.push(scatola(0.44, 0.035, 0.04, LEGNO, m))
      }
    }
  })

  const unisci = (lista: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(lista.map((x) => (x.index ? x.toNonIndexed() : x)))
    for (const x of lista) x.dispose()
    return g
  }
  return { reti: unisci(reti), attrezzi: unisci(attrezzi) }
}
