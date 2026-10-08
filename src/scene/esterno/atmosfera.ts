import * as THREE from 'three'
import { direzioneDaCielo, type Cielo } from '../notte'

/**
 * Luce e colori dell'esterno, ricavati dallo stesso modello di cielo
 * (Preetham, come Sky.js di three) calcolato qui in JavaScript: così la
 * foschia sulle colline, il mare e la luce del sole hanno esattamente i
 * colori del cielo che si vede dalla vetrata.
 */

export interface ParametriCielo {
  turbidity: number
  rayleigh: number
  mieCoefficient: number
  mieDirectionalG: number
}

/* --- porta in JS dello shader di Sky.js (three/examples/jsm/objects/Sky.js, licenza MIT) --- */
const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5]
const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14]
const cutoffAngle = 1.6110731556870734
const steepness = 1.5
const EE = 1000

function sunIntensity(cosZ: number) {
  const z = THREE.MathUtils.clamp(cosZ, -1, 1)
  return EE * Math.max(0, 1 - Math.exp(-(cutoffAngle - Math.acos(z)) / steepness))
}

/** Colore (prima del tone mapping) del cielo nella direzione data. */
export function coloreCielo(dir: THREE.Vector3, sole: THREE.Vector3, p: ParametriCielo, out = new THREE.Color()): THREE.Color {
  const sunE = sunIntensity(sole.y)
  const sunfade = 1 - THREE.MathUtils.clamp(1 - Math.exp(sole.y / 450000), 0, 1)
  const rc = p.rayleigh - (1 - sunfade)
  const betaR = totalRayleigh.map((v) => v * rc)
  const c = 0.2 * p.turbidity * 10e-18
  const betaM = MieConst.map((v) => 0.434 * c * v * p.mieCoefficient)

  const zen = Math.acos(Math.max(0, dir.y))
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253))
  const sR = 8.4e3 * inv
  const sM = 1.25e3 * inv
  const cosT = dir.dot(sole)
  const rPhase = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2))
  const g2 = p.mieDirectionalG * p.mieDirectionalG
  const mPhase = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * p.mieDirectionalG * cosT + g2, 1.5))
  const mixK = THREE.MathUtils.clamp(Math.pow(1 - sole.y, 5), 0, 1)
  const ris = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const fex = Math.exp(-(betaR[i] * sR + betaM[i] * sM))
    const rapporto = (betaR[i] * rPhase + betaM[i] * mPhase) / (betaR[i] + betaM[i])
    let lin = Math.pow(sunE * rapporto * (1 - fex), 1.5)
    lin *= 1 + (Math.pow(sunE * rapporto * fex, 0.5) - 1) * mixK
    const l0 = 0.1 * fex
    const tex = (lin + l0) * 0.04 + [0, 0.0003, 0.00075][i]
    ris[i] = Math.pow(tex, 1 / (1.2 + 1.2 * sunfade))
  }
  return out.setRGB(ris[0], ris[1], ris[2])
}

/** Trasmittanza dell'atmosfera lungo la direzione del sole: la luce si arrossa al tramonto. */
function coloreSole(sole: THREE.Vector3, p: ParametriCielo, out: THREE.Color): THREE.Color {
  const zen = Math.acos(Math.max(0.0, sole.y))
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(Math.max(0.01, 93.885 - (zen * 180) / Math.PI), -1.253))
  const c = 0.2 * p.turbidity * 10e-18
  const v = [0, 1, 2].map((i) => {
    const bR = totalRayleigh[i] * p.rayleigh
    const bM = 0.434 * c * MieConst[i] * p.mieCoefficient
    return Math.exp(-(bR * 8.4e3 + bM * 1.25e3) * inv)
  })
  const m = Math.max(v[0], v[1], v[2], 1e-4)
  return out.setRGB(v[0] / m, v[1] / m, v[2] / m)
}

/* --- uniform condivise da tutti i materiali dell'esterno --- */

export const uniformiCielo = {
  uSoleDir: { value: new THREE.Vector3(0, 1, 0) },
  /** Luce diretta (sole di giorno, luna di notte). */
  uSoleColore: { value: new THREE.Color() },
  uAmbCielo: { value: new THREE.Color() },
  uAmbTerra: { value: new THREE.Color() },
  uFoschia: { value: new THREE.Color() },
  uFoschiaSole: { value: new THREE.Color() },
  uFoschiaDens: { value: 0.00028 },
  uNotte: { value: 0 },
  uTempo: { value: 0 },
  uVento: { value: 1 },
  /** Direzione della luna (per alone, riflesso sul mare). */
  uLunaDir: { value: new THREE.Vector3() },
}

export type UniformiCielo = typeof uniformiCielo

/**
 * Il modello di Preetham restituisce valori pensati per un'esposizione di
 * circa 0.5 (come nell'esempio di three): li scaliamo qui, una volta, per
 * cielo, foschia e luce, così la sala resta con la sua esposizione.
 */
export const ESPOSIZIONE = 0.34

/** Luna piena bassa sul mare, a ovest-sud-ovest: si vede dalla vetrata e si specchia. */
export const LUNA = direzioneDaCielo(10.5, 263)

export interface StatoAtmosfera {
  parametri: ParametriCielo
  /** Direzione del sole usata dal cielo (anche sotto l'orizzonte). */
  sole: THREE.Vector3
  /** 0 = pieno giorno, 1 = notte fonda. */
  notte: number
  /** Quanto è "dorata" la luce (alba/tramonto). */
  oro: number
  orizzonte: THREE.Color
  zenit: THREE.Color
  luce: THREE.Color
  /** Colore per l'esposizione della luce interna dalla vetrata. */
  luceIntensita: number
}

const tmp = new THREE.Vector3()

/** Tutto ciò che serve per colorare l'esterno in un dato momento. */
export function statoAtmosfera(cielo: Cielo): StatoAtmosfera {
  const sole = cielo.sole.clone()
  const alt = cielo.altezza
  // di giorno aria tersa; verso il tramonto più foschia e rosso
  const oro = THREE.MathUtils.clamp(1 - (alt - 2) / 16, 0, 1) * THREE.MathUtils.clamp((alt + 6) / 6, 0, 1)
  const parametri: ParametriCielo = {
    turbidity: THREE.MathUtils.lerp(3.2, 7.5, oro),
    rayleigh: THREE.MathUtils.lerp(1.35, 2.6, oro),
    mieCoefficient: THREE.MathUtils.lerp(0.0045, 0.006, oro),
    mieDirectionalG: THREE.MathUtils.lerp(0.78, 0.86, oro),
  }
  const notte = THREE.MathUtils.clamp((-alt - 1) / 9, 0, 1)
  const orizzonte = coloreCielo(tmp.set(0, 0.02, -1).normalize(), sole, parametri).multiplyScalar(ESPOSIZIONE)
  const zenit = coloreCielo(tmp.set(0, 1, 0), sole, parametri).multiplyScalar(ESPOSIZIONE)
  // notte: blu profondo, appena schiarito dalla luna
  const orizNotte = new THREE.Color(0.018, 0.03, 0.062)
  const zenNotte = new THREE.Color(0.006, 0.011, 0.03)
  orizzonte.lerp(orizNotte, notte)
  zenit.lerp(zenNotte, notte)
  const luce = new THREE.Color()
  coloreSole(tmp.copy(sole).setY(Math.max(sole.y, 0.02)).normalize(), parametri, luce)
  const forza = THREE.MathUtils.smoothstep(alt, -3, 10)
  return { parametri, sole, notte, oro, orizzonte, zenit, luce, luceIntensita: forza }
}

/** Aggiorna le uniform condivise. */
export function applicaAtmosfera(s: StatoAtmosfera) {
  const u = uniformiCielo
  const giorno = 1 - s.notte
  const forzaSole = THREE.MathUtils.smoothstep(s.sole.y, -0.02, 0.1)
  if (s.notte > 0.5) {
    // di notte la "luce diretta" è la luna
    u.uSoleDir.value.copy(LUNA)
    u.uSoleColore.value.setRGB(0.16, 0.2, 0.32)
  } else {
    u.uSoleDir.value.copy(s.sole).setY(Math.max(s.sole.y, 0.03)).normalize()
    u.uSoleColore.value.copy(s.luce).multiplyScalar(1.35 * forzaSole)
  }
  u.uAmbCielo.value.copy(s.zenit).multiplyScalar(1.15).lerp(s.orizzonte, 0.35)
  u.uAmbTerra.value.copy(s.orizzonte).multiplyScalar(0.45).lerp(new THREE.Color(0.18, 0.15, 0.1), 0.35 * giorno)
  if (s.notte > 0.5) {
    u.uAmbCielo.value.setRGB(0.028, 0.04, 0.075)
    u.uAmbTerra.value.setRGB(0.01, 0.012, 0.018)
  }
  u.uFoschia.value.copy(s.orizzonte)
  u.uFoschiaSole.value.copy(s.luce).multiplyScalar(0.55 * s.oro * forzaSole)
  u.uFoschiaDens.value = THREE.MathUtils.lerp(0.0001, 0.00024, s.oro)
  u.uNotte.value = s.notte
  u.uLunaDir.value.copy(LUNA)
}
