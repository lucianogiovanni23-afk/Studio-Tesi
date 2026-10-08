import { useCallback, useSyncExternalStore } from 'react'
import * as THREE from 'three'

/**
 * Ora del giorno nella sala. In automatico segue l'orologio di chi usa l'app
 * e il sole fuori dalla vetrata passa per alba, giorno, tramonto e notte.
 * Il pulsante "Giorno o notte" forza l'uno o l'altra; la scelta resta in
 * questo browser. Nessun dato meteo reale: il cielo è calcolato.
 */
export type PreferenzaNotte = 'auto' | 'giorno' | 'notte'
export type FaseGiorno = 'alba' | 'giorno' | 'tramonto' | 'notte'

const CHIAVE = 'studio-tesi.notte'
/** Solo per le prove: un'ora fissa (es. "19.4") al posto dell'orologio. */
const CHIAVE_PROVA = 'studio-tesi.ora-prova'

/** La campagna fuori dalla vetrata: colline sopra la costa calabrese. */
const LATITUDINE = 38.9
const LONGITUDINE = 16.6
/** Sotto questa altezza del sole (gradi) la sala passa alle luci della notte. */
const SOGLIA_NOTTE = -4

function leggiPreferenza(): PreferenzaNotte {
  try {
    const v = localStorage.getItem(CHIAVE)
    if (v === 'giorno' || v === 'notte' || v === 'auto') return v
  } catch {
    /* storage non disponibile */
  }
  return 'auto'
}

function oraDiProva(): number | null {
  try {
    const v = localStorage.getItem(CHIAVE_PROVA)
    if (v === null) return null
    const n = Number(v)
    return Number.isFinite(n) ? ((n % 24) + 24) % 24 : null
  } catch {
    return null
  }
}

/** Data e ora "dell'orologio", con l'eventuale ora di prova. */
function adesso(): Date {
  const d = new Date()
  const prova = oraDiProva()
  if (prova !== null) d.setHours(Math.floor(prova), Math.round((prova % 1) * 60), 0, 0)
  return d
}

function oraDecimale(d: Date): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

/** Ora legale in vigore per quella data (sul fuso di chi usa l'app). */
function oraLegale(d: Date): boolean {
  const gen = new Date(d.getFullYear(), 0, 1).getTimezoneOffset()
  const lug = new Date(d.getFullYear(), 6, 1).getTimezoneOffset()
  return d.getTimezoneOffset() < Math.max(gen, lug)
}

/**
 * Altezza e azimut del sole (gradi; azimut da nord verso est) per la Calabria,
 * leggendo l'orologio locale come se fosse l'ora italiana.
 */
export function posizioneSole(d: Date, ora = oraDecimale(d)): { altezza: number; azimut: number } {
  const inizio = new Date(d.getFullYear(), 0, 0)
  const giorno = Math.floor((d.getTime() - inizio.getTime()) / 86_400_000)
  const b = ((2 * Math.PI) / 365) * (giorno - 81)
  const equazioneTempo = (9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)) / 60
  const oraSolare = ora - (oraLegale(d) ? 1 : 0) + (LONGITUDINE - 15) / 15 + equazioneTempo
  const rad = Math.PI / 180
  const decl = 23.44 * Math.sin(b) * rad
  const lat = LATITUDINE * rad
  const h = 15 * (oraSolare - 12) * rad
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h)
  const altezza = Math.asin(THREE.MathUtils.clamp(sinAlt, -1, 1))
  const azSud = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat))
  return { altezza: altezza / rad, azimut: (azSud / rad + 180 + 360) % 360 }
}

/**
 * Direzione nel mondo della scena: la vetrata (-z) guarda a ovest, sul
 * Tirreno; +x è il nord, +z l'est.
 */
export function direzioneDaCielo(altezza: number, azimut: number, v = new THREE.Vector3()): THREE.Vector3 {
  const h = THREE.MathUtils.degToRad(altezza)
  const a = THREE.MathUtils.degToRad(azimut)
  return v.set(Math.cos(h) * Math.cos(a), Math.sin(h), Math.cos(h) * Math.sin(a))
}

function notteAllOra(d: Date, ora: number): boolean {
  return posizioneSole(d, ora).altezza < SOGLIA_NOTTE
}

export function notteDellOrologio(d = adesso()): boolean {
  return notteAllOra(d, oraDecimale(d))
}

/** L'ora mostrata fuori: quella vera, o una bella ora di giorno / di notte se l'hai forzata. */
function oraScena(preferenza: PreferenzaNotte, d: Date): number {
  const vera = oraDecimale(d)
  if (preferenza === 'auto') return vera
  const notteVera = notteAllOra(d, vera)
  if (preferenza === 'giorno') return notteVera ? 11 : vera
  return notteVera ? vera : 22.5
}

/* --- piccolo archivio condiviso: la sala, il cielo e il pulsante leggono lo stesso stato --- */

interface StatoOra {
  preferenza: PreferenzaNotte
  /** Arrotondata al minuto: il cielo si aggiorna una volta al minuto. */
  istante: number
}

let stato: StatoOra = { preferenza: leggiPreferenza(), istante: minuto() }
const ascoltatori = new Set<() => void>()
let timer: number | undefined

function minuto(): number {
  const d = adesso()
  d.setSeconds(0, 0)
  return d.getTime()
}

function aggiorna(parz: Partial<StatoOra>) {
  stato = { ...stato, ...parz }
  ascoltatori.forEach((f) => f())
}

function iscrivi(f: () => void) {
  ascoltatori.add(f)
  if (timer === undefined && typeof window !== 'undefined') {
    timer = window.setInterval(() => {
      const m = minuto()
      if (m !== stato.istante) aggiorna({ istante: m })
    }, 20_000)
  }
  return () => {
    ascoltatori.delete(f)
    if (ascoltatori.size === 0 && timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }
}

const leggi = () => stato

export interface Cielo {
  /** Ora decimale mostrata fuori (0–24). */
  ora: number
  fase: FaseGiorno
  notte: boolean
  /** Altezza e azimut del sole in gradi. */
  altezza: number
  azimut: number
  /** Direzione verso il sole, nel mondo della scena. */
  sole: THREE.Vector3
}

function calcolaCielo(s: StatoOra): Cielo {
  const d = new Date(s.istante)
  const ora = oraScena(s.preferenza, d)
  const { altezza, azimut } = posizioneSole(d, ora)
  const notte = altezza < SOGLIA_NOTTE
  const mattino = ora < 12.5
  const fase: FaseGiorno = notte ? 'notte' : altezza < 9 ? (mattino ? 'alba' : 'tramonto') : 'giorno'
  return { ora, fase, notte, altezza, azimut, sole: direzioneDaCielo(altezza, azimut) }
}

let cacheChiave: StatoOra | null = null
let cacheCielo: Cielo | null = null

function cieloDa(s: StatoOra): Cielo {
  if (cacheChiave !== s || !cacheCielo) {
    cacheChiave = s
    cacheCielo = calcolaCielo(s)
  }
  return cacheCielo
}

/** Il cielo del momento: posizione del sole, fase del giorno, notte sì o no. */
export function useCielo(): Cielo {
  return cieloDa(useSyncExternalStore(iscrivi, leggi, leggi))
}

export function useNotteScena(): { notte: boolean; preferenza: PreferenzaNotte; alterna: () => void; cielo: Cielo } {
  const s = useSyncExternalStore(iscrivi, leggi, leggi)
  const cielo = cieloDa(s)
  const notte = cielo.notte
  const alterna = useCallback(() => {
    const voluta = !notte
    // Se la scelta coincide con l'orologio torni a seguirlo.
    const nuova: PreferenzaNotte = voluta === notteDellOrologio() ? 'auto' : voluta ? 'notte' : 'giorno'
    aggiorna({ preferenza: nuova, istante: minuto() })
    try {
      localStorage.setItem(CHIAVE, nuova)
    } catch {
      /* storage non disponibile */
    }
  }, [notte])
  return { notte, preferenza: s.preferenza, alterna, cielo }
}

let alone: THREE.CanvasTexture | null = null

/** Sfumatura radiale bianca → trasparente, condivisa da tutti i bagliori. */
export function textureAlone(): THREE.CanvasTexture | null {
  if (alone) return alone
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (!g) return null
  const s = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  s.addColorStop(0, 'rgba(255,255,255,1)')
  s.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  s.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = s
  g.fillRect(0, 0, 64, 64)
  alone = new THREE.CanvasTexture(c)
  return alone
}
