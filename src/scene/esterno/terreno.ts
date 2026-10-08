import * as THREE from 'three'

/**
 * La campagna fuori dalla vetrata, in metri, nello stesso sistema della sala
 * (la vetrata è a z = -6 e guarda verso -z, a ovest). L'ufficio sta in cima
 * a una collina: un giardino, poi terrazzamenti con muretti a secco, uliveti
 * che scendono in una valle larga fino al mare, colline ai lati.
 */

export const FACCIATA_Z = -6
/** Livello del mare rispetto al pavimento dell'ufficio. */
export const Y_MARE = -90
/** Quota del giardino subito fuori dalla vetrata. */
export const Y_GIARDINO = -0.32
/** Il giardino finisce con un muretto basso a questa distanza dalla facciata. */
export const FINE_GIARDINO = 9
const PASSO_TERRAZZE = 9
const FINE_TERRAZZE = 95

function smooth(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/* rumore deterministico (stesso risultato a ogni caricamento) */
function hash(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function rumore(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
function fbm(x: number, y: number, ottave = 4) {
  let s = 0
  let a = 0.5
  for (let i = 0; i < ottave; i++) {
    s += a * rumore(x, y)
    x = x * 2.03 + 17.1
    y = y * 2.03 + 9.3
    a *= 0.5
  }
  return s
}

/** Numeri casuali ripetibili. */
export function generatore(seme: number) {
  let s = seme >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Profilo della valle: scende ripida sotto la casa, poi dolce fino alla costa. */
function profilo(d: number) {
  if (d <= FINE_GIARDINO) return Y_GIARDINO
  const t = d - FINE_GIARDINO
  // pendenza dolce (circa 5%) che si addolcisce ancora verso la costa:
  // dalla sala si vedono gli uliveti fino al mare
  return Y_GIARDINO - 0.25 - 0.085 * t * (1 - t / 6000) - Math.max(0, t - 1500) * 0.05
}

/** Asse della valle, che serpeggia un poco. */
function asseValle(d: number) {
  return 30 * Math.sin(d / 340) - 20
}

/** Distanza "lungo la valle" con i terrazzamenti leggermente curvi. */
function dTerrazza(x: number, d: number) {
  return d + 2.2 * Math.sin(x / 19) + 1.4 * Math.sin(x / 7.3 + 1.3)
}

/** Centro della strada sterrata (in x) alla distanza d dalla facciata. */
export function stradaX(d: number) {
  return -16 - 0.22 * d + 20 * Math.sin(d / 65 + 0.4)
}
export const STRADA_INIZIO = 14
export const STRADA_FINE = 760

/** Quota del terreno nel punto (x, z). */
export function altezza(x: number, z: number): number {
  const d = Math.max(0, FACCIATA_Z - z)
  let base: number
  if (d < FINE_TERRAZZE && d > FINE_GIARDINO) {
    // terrazze: ripiani quasi piani separati da salti contenuti dai muretti
    const dt = dTerrazza(x, d) - FINE_GIARDINO
    const k = Math.max(0, dt / PASSO_TERRAZZE)
    const f = k - Math.floor(k)
    const gradino = Math.floor(k) + smooth(0.82, 1, f) + f * 0.12
    const dq = FINE_GIARDINO + 0.01 + gradino * PASSO_TERRAZZE
    const w = smooth(FINE_TERRAZZE - 20, FINE_TERRAZZE, d)
    base = THREE.MathUtils.lerp(profilo(dq), profilo(d), w)
  } else base = profilo(d)
  if (d <= FINE_GIARDINO) return Y_GIARDINO + (fbm(x * 0.3, z * 0.3, 2) - 0.5) * 0.06
  // colline ai lati della valle, che si allungano in promontori sul mare
  const ax = Math.abs(x - asseValle(d))
  const lontano = smooth(25, 380, d)
  const lati = (30 + 34 * smooth(500, 1500, d)) * smooth(45, 520, ax) * lontano
  const destra = x > 0 ? 1.0 + 0.6 * smooth(600, 1500, d) : 0.8
  // ondulazioni
  const morbide = (fbm(x / 210, z / 210) - 0.5) * 26 * smooth(40, 400, d)
  const fini = (fbm(x / 38, z / 38, 3) - 0.5) * 3.2 * smooth(FINE_GIARDINO, 60, d)
  return base + lati * destra + morbide + fini
}

export function normale(x: number, z: number, out = new THREE.Vector3()) {
  const e = 0.6
  const hx = altezza(x + e, z) - altezza(x - e, z)
  const hz = altezza(x, z + e) - altezza(x, z - e)
  return out.set(-hx, 2 * e, -hz).normalize()
}

/* --- appezzamenti: uliveto, campo d'erba secca, prato verde, terra arata --- */

export type Appezzamento = 'uliveto' | 'secco' | 'verde' | 'arato'
const LATO_APP = 64

function cellaAppezzamento(x: number, z: number) {
  // griglia ruotata di poco, così i confini non sono paralleli alla vetrata
  const c = Math.cos(0.22)
  const s = Math.sin(0.22)
  const u = (x * c - z * s) / LATO_APP
  const v = (x * s + z * c) / (LATO_APP * 0.8)
  return [Math.floor(u), Math.floor(v)] as const
}

export function appezzamento(x: number, z: number): Appezzamento {
  const d = FACCIATA_Z - z
  if (d < FINE_TERRAZZE) return 'uliveto'
  const [i, j] = cellaAppezzamento(x, z)
  const h = hash(i * 7 + 3, j * 13 + 5)
  if (h < 0.66) return 'uliveto'
  if (h < 0.82) return 'secco'
  if (h < 0.92) return 'arato'
  return 'verde'
}

/* --- geometria del terreno --- */

/** Righe in profondità: fitte vicino (terrazze nitide), sempre più rade verso il mare. */
function righe(ridotta: boolean): number[] {
  const r: number[] = []
  const k = ridotta ? 2 : 1
  for (let i = 0; i <= 12; i += k) r.push((FINE_GIARDINO * i) / 12)
  const n1 = ridotta ? 70 : 150
  for (let i = 1; i <= n1; i++) r.push(FINE_GIARDINO + ((FINE_TERRAZZE + 25 - FINE_GIARDINO) * i) / n1)
  const n2 = ridotta ? 70 : 130
  const d0 = FINE_TERRAZZE + 25
  for (let i = 1; i <= n2; i++) r.push(d0 * Math.pow(9000 / d0, i / n2))
  return r
}

export function geometriaTerreno(ridotta: boolean): THREE.BufferGeometry {
  const ds = righe(ridotta)
  const colonne = ridotta ? 120 : 220
  const nv = ds.length * (colonne + 1)
  const pos = new Float32Array(nv * 3)
  const nor = new Float32Array(nv * 3)
  const tipo = new Float32Array(nv * 4)
  const n = new THREE.Vector3()
  let p = 0
  for (const d of ds) {
    const z = FACCIATA_Z - d
    const meta = 70 + d * 1.35
    for (let j = 0; j <= colonne; j++) {
      // colonne più fitte al centro della vista
      const u = (j / colonne) * 2 - 1
      const x = Math.sign(u) * Math.pow(Math.abs(u), 1.35) * meta
      const y = altezza(x, z)
      pos.set([x, y, z], p * 3)
      normale(x, z, n)
      nor.set([n.x, n.y, n.z], p * 3)
      const a = appezzamento(x, z)
      tipo.set([a === 'uliveto' ? 1 : 0, a === 'secco' ? 1 : 0, a === 'verde' ? 1 : 0, a === 'arato' ? 1 : 0], p * 4)
      p++
    }
  }
  const idx: number[] = []
  for (let i = 0; i < ds.length - 1; i++) {
    for (let j = 0; j < colonne; j++) {
      const a = i * (colonne + 1) + j
      const b = a + colonne + 1
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('aTipo', new THREE.BufferAttribute(tipo, 4))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

/* --- olivi --- */

export interface Olivo {
  x: number
  y: number
  z: number
  scala: number
  rot: number
  variante: number
  /** Distanza dalla facciata: decide il livello di dettaglio. */
  d: number
}

/** Case e strade dove non piantare alberi. */
const SPAZI_LIBERI: { x: number; z: number; r: number }[] = []

export function azzeraSpazi() {
  SPAZI_LIBERI.length = 0
}

export function liberaSpazio(x: number, z: number, r: number) {
  SPAZI_LIBERI.push({ x, z, r })
}

function libero(x: number, z: number) {
  for (const s of SPAZI_LIBERI) if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) return false
  return true
}

/** Uliveti a filari sulle colline, solo dove si vedono dalla sala. */
export function piantaOlivi(maxD: number, densita = 1): Olivo[] {
  const r = generatore(1977)
  const out: Olivo[] = []
  const passo = 7.2
  for (let d = FINE_GIARDINO + 3.2; d < maxD; ) {
    // più lontano, filari più radi in lista (gli alberi lontani si confondono comunque)
    const z0 = FACCIATA_Z - d
    const meta = 30 + d * 1.05
    for (let x0 = -meta; x0 < meta; x0 += passo) {
      const x = x0 + (r() - 0.5) * 1.2
      const z = z0 + (r() - 0.5) * 1.2
      if (r() > densita && d > 150) continue
      if (appezzamento(x, z) !== 'uliveto') continue
      const xx = x
      const dd = FACCIATA_Z - z
      if (dd > FINE_GIARDINO && dd < FINE_TERRAZZE) {
        // sui terrazzamenti, lontano dal bordo del muretto
        const k = (dTerrazza(xx, dd) - FINE_GIARDINO) / PASSO_TERRAZZE
        const f = k - Math.floor(k)
        if (f > 0.68 || f < 0.12) continue
      }
      // un corridoio libero al centro: dalla sala si vede fino al mare
      if (dd < 115 && Math.abs(xx - 3 * Math.sin(dd / 20)) < 6 + dd * 0.15) continue
      const sx = stradaX(dd)
      if (dd > STRADA_INIZIO - 4 && dd < STRADA_FINE && Math.abs(xx - sx) < 5.5) continue
      if (!libero(xx, z)) continue
      const y = altezza(xx, z)
      if (y < Y_MARE + 3) continue
      out.push({ x: xx, y: y - 0.12, z, scala: 0.78 + r() * 0.42, rot: r() * Math.PI * 2, variante: Math.floor(r() * 3), d: dd })
    }
    d += passo * (d < 200 ? 1 : d < 450 ? 1.06 : 1.12)
  }
  return out
}
