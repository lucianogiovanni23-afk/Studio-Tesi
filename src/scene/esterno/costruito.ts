import * as THREE from 'three'
import { FACCIATA_Z, FINE_GIARDINO, Y_MARE, altezza, azzeraSpazi, generatore, liberaSpazio } from './terreno'

/**
 * Muretti a secco e casolari in pietra, costruiti una volta in un'unica
 * geometria (una sola chiamata di disegno). Le finestre accese di notte
 * diventano anche lucine con alone.
 */

interface Raccolta {
  pos: number[]
  nor: number[]
  col: number[]
  luce: number[]
  pietra: number[]
}

function quad(r: Raccolta, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, colore: THREE.Color, luce = 0, pietra = 0) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize()
  for (const v of [a, b, c, a, c, d]) {
    r.pos.push(v.x, v.y, v.z)
    r.nor.push(n.x, n.y, n.z)
    r.col.push(colore.r, colore.g, colore.b)
    r.luce.push(luce)
    r.pietra.push(pietra)
  }
}

function tri(r: Raccolta, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colore: THREE.Color) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
  for (const v of [a, b, c]) {
    r.pos.push(v.x, v.y, v.z)
    r.nor.push(n.x, n.y, n.z)
    r.col.push(colore.r, colore.g, colore.b)
    r.luce.push(0)
    r.pietra.push(0)
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Un tratto di muretto tra due punti, con la sommità e i due fianchi. */
function trattoMuro(r: Raccolta, x0: number, z0: number, x1: number, z1: number, alto0: number, alto1: number, basso0: number, basso1: number, spessore: number, colore: THREE.Color) {
  const dir = V(x1 - x0, 0, z1 - z0).normalize()
  const lato = V(-dir.z, 0, dir.x).multiplyScalar(spessore / 2)
  const a0 = V(x0, 0, z0).add(lato)
  const b0 = V(x0, 0, z0).sub(lato)
  const a1 = V(x1, 0, z1).add(lato)
  const b1 = V(x1, 0, z1).sub(lato)
  const y = (v: THREE.Vector3, h: number) => v.clone().setY(h)
  // sommità
  quad(r, y(a0, alto0), y(a1, alto1), y(b1, alto1), y(b0, alto0), colore, 0, 1)
  // fianchi
  quad(r, y(a0, basso0), y(a1, basso1), y(a1, alto1), y(a0, alto0), colore, 0, 1)
  quad(r, y(b1, basso1), y(b0, basso0), y(b0, alto0), y(b1, alto1), colore, 0, 1)
}

function muretti(r: Raccolta) {
  const pietra = new THREE.Color(0.62, 0.57, 0.5)
  // parapetto in fondo al giardino
  const zg = FACCIATA_Z - FINE_GIARDINO + 0.2
  for (let x = -45; x < 45; x += 1.5) {
    const x1 = x + 1.5
    const alto = altezza(x, zg + 1) + 0.42
    const alto1 = altezza(x1, zg + 1) + 0.42
    trattoMuro(r, x, zg, x1, zg, alto, alto1, altezza(x, zg - 1.2) - 0.3, altezza(x1, zg - 1.2) - 0.3, 0.5, pietra)
  }
  // muretti delle terrazze, lungo il ciglio di ogni ripiano
  for (let k = 0; k < 8; k++) {
    const obiettivo = FINE_GIARDINO + 9 * (k + 0.86)
    const meta = 34 + obiettivo * 1.1
    for (let x = -meta; x < meta; x += 1.8) {
      const x1 = x + 1.8
      const dz = (xx: number) => obiettivo - 2.2 * Math.sin(xx / 19) - 1.4 * Math.sin(xx / 7.3 + 1.3)
      const z0 = FACCIATA_Z - dz(x)
      const z1 = FACCIATA_Z - dz(x1)
      const sopra0 = altezza(x, z0 + 1.6)
      const sopra1 = altezza(x1, z1 + 1.6)
      trattoMuro(r, x, z0, x1, z1, sopra0 + 0.22, sopra1 + 0.22, altezza(x, z0 - 1.8) - 0.4, altezza(x1, z1 - 1.8) - 0.4, 0.55, pietra)
    }
  }
}

interface Casa {
  x: number
  d: number
  larg: number
  prof: number
  alt: number
  rot: number
  muro: 'pietra' | 'calce' | 'ocra'
}

function casolare(r: Raccolta, c: Casa, rnd: () => number, luci: number[]) {
  const z = FACCIATA_Z - c.d
  let base = Infinity
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) base = Math.min(base, altezza(c.x + (dx * c.larg) / 2, z + (dz * c.prof) / 2))
  base -= 0.6
  const top = base + 0.6 + c.alt
  const m = new THREE.Matrix4().makeRotationY(c.rot).setPosition(c.x, 0, z)
  const P = (x: number, y: number, zz: number) => V(x, y, zz).applyMatrix4(m)
  const w = c.larg / 2
  const p = c.prof / 2
  const coloreMuro =
    c.muro === 'pietra' ? new THREE.Color(0.78, 0.7, 0.58) : c.muro === 'calce' ? new THREE.Color(0.86, 0.83, 0.76) : new THREE.Color(0.8, 0.62, 0.42)
  const pietra = c.muro === 'pietra' ? 1 : 0
  const angoli = [P(-w, 0, p), P(w, 0, p), P(w, 0, -p), P(-w, 0, -p)]
  for (let i = 0; i < 4; i++) {
    const a = angoli[i]
    const b = angoli[(i + 1) % 4]
    quad(r, a.clone().setY(base), b.clone().setY(base), b.clone().setY(top), a.clone().setY(top), coloreMuro, 0, pietra)
  }
  // tetto a due falde in coppi
  const coppi = new THREE.Color(0.56, 0.27, 0.16).multiplyScalar(0.85 + rnd() * 0.25)
  const colmo = top + Math.min(c.larg, c.prof) * 0.28
  const sporto = 0.35
  const t = (x: number, y: number, zz: number) => P(x, y, zz).setY(y)
  quad(r, t(-w - sporto, top - 0.12, p + sporto), t(w + sporto, top - 0.12, p + sporto), t(w + sporto, colmo, 0), t(-w - sporto, colmo, 0), coppi)
  quad(r, t(w + sporto, top - 0.12, -p - sporto), t(-w - sporto, top - 0.12, -p - sporto), t(-w - sporto, colmo, 0), t(w + sporto, colmo, 0), coppi)
  tri(r, t(w, top, p), t(w, top, -p), t(w, colmo, 0), coloreMuro)
  tri(r, t(-w, top, -p), t(-w, top, p), t(-w, colmo, 0), coloreMuro)
  // finestre e porta sui quattro lati
  const scuro = new THREE.Color(0.05, 0.045, 0.04)
  const piani = c.alt > 5 ? 2 : 1
  const lati: [THREE.Vector3, THREE.Vector3, number][] = [
    [V(-w, 0, p + 0.03), V(1, 0, 0), c.larg],
    [V(w, 0, -p - 0.03), V(-1, 0, 0), c.larg],
    [V(w + 0.03, 0, p), V(0, 0, -1), c.prof],
    [V(-w - 0.03, 0, -p), V(0, 0, 1), c.prof],
  ]
  for (const [inizio, dir, lung] of lati) {
    const n = Math.max(1, Math.floor(lung / 3.2))
    for (let piano = 0; piano < piani; piano++) {
      for (let i = 0; i < n; i++) {
        const s = ((i + 0.5) / n) * lung
        const y0 = base + 0.6 + 1.0 + piano * 2.8
        const accesa = rnd() < 0.42 ? 1 : 0
        const c0 = inizio.clone().addScaledVector(dir, s - 0.45)
        const c1 = inizio.clone().addScaledVector(dir, s + 0.45)
        quad(r, P(c0.x, 0, c0.z).setY(y0), P(c1.x, 0, c1.z).setY(y0), P(c1.x, 0, c1.z).setY(y0 + 1.15), P(c0.x, 0, c0.z).setY(y0 + 1.15), scuro, accesa)
        if (accesa) {
          const centro = P((c0.x + c1.x) / 2, 0, (c0.z + c1.z) / 2).setY(y0 + 0.6)
          luci.push(centro.x, centro.y, centro.z, 0.9)
        }
      }
    }
  }
  liberaSpazio(c.x, z, Math.max(c.larg, c.prof) * 0.9 + 4)
}

const CASOLARI: Casa[] = [
  { x: -52, d: 128, larg: 13, prof: 8, alt: 6, rot: 0.25, muro: 'pietra' },
  { x: -41, d: 140, larg: 6, prof: 5, alt: 3.4, rot: 0.25, muro: 'pietra' },
  { x: 62, d: 215, larg: 11, prof: 7, alt: 5.6, rot: -0.4, muro: 'calce' },
  { x: -130, d: 340, larg: 14, prof: 9, alt: 6.2, rot: 0.6, muro: 'ocra' },
  { x: 150, d: 470, larg: 12, prof: 8, alt: 5.8, rot: -0.1, muro: 'pietra' },
  { x: -48, d: 545, larg: 10, prof: 7, alt: 5.5, rot: 0.9, muro: 'calce' },
  { x: 95, d: 640, larg: 9, prof: 7, alt: 3.6, rot: 0.3, muro: 'pietra' },
  { x: -210, d: 690, larg: 12, prof: 8, alt: 6, rot: -0.3, muro: 'calce' },
]

/** Un paesino sul promontorio a destra, verso il mare, con il campanile. */
function paese(rnd: () => number): Casa[] {
  const out: Casa[] = []
  const cx = 300
  const cd = 1250
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2
    const rr = Math.sqrt(rnd()) * 120
    const x = cx + Math.cos(a) * rr * 1.3
    const d = cd + Math.sin(a) * rr * 0.8
    if (altezza(x, FACCIATA_Z - d) < Y_MARE + 3) continue
    out.push({ x, d, larg: 7 + rnd() * 6, prof: 6 + rnd() * 4, alt: 5 + rnd() * 5, rot: (rnd() - 0.5) * 0.6, muro: rnd() < 0.55 ? 'calce' : rnd() < 0.5 ? 'ocra' : 'pietra' })
  }
  out.push({ x: cx + 10, d: cd - 10, larg: 4, prof: 4, alt: 19, rot: 0.1, muro: 'pietra' })
  return out
}

export interface Costruito {
  geometria: THREE.BufferGeometry
  luci: THREE.BufferGeometry
}

export function costruisci(ridotta: boolean): Costruito {
  const r: Raccolta = { pos: [], nor: [], col: [], luce: [], pietra: [] }
  const luci: number[] = []
  const rnd = generatore(4242)
  azzeraSpazi()
  muretti(r)
  for (const c of CASOLARI) casolare(r, c, rnd, luci)
  for (const c of paese(rnd)) casolare(r, c, rnd, luci)
  // lungo la costa: lampioni e case sparse, solo come lucine
  const rl = generatore(99)
  const n = ridotta ? 40 : 90
  for (let i = 0; i < n; i++) {
    const d = 1150 + rl() * 900
    const x = (rl() - 0.5) * (d * 1.6)
    const y = altezza(x, FACCIATA_Z - d)
    if (y < Y_MARE + 1 || y > Y_MARE + 70) continue
    luci.push(x, y + 3, FACCIATA_Z - d, 1.2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(r.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(r.nor, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(r.col, 3))
  g.setAttribute('aLuce', new THREE.Float32BufferAttribute(r.luce, 1))
  g.setAttribute('aPietra', new THREE.Float32BufferAttribute(r.pietra, 1))
  g.computeBoundingSphere()
  const gl = new THREE.BufferGeometry()
  const p: number[] = []
  const dim: number[] = []
  for (let i = 0; i < luci.length; i += 4) {
    p.push(luci[i], luci[i + 1], luci[i + 2])
    dim.push(luci[i + 3])
  }
  gl.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  gl.setAttribute('aDim', new THREE.Float32BufferAttribute(dim, 1))
  gl.computeBoundingSphere()
  return { geometria: g, luci: gl }
}
