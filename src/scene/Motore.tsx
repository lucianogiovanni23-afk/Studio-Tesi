import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GRADINI_AUTO, useGraficaStore } from '../grafica/grafica'
import { useStudio } from '../store'
import { useGrafica } from './qualita'

/**
 * Il "motore" della sala: decide quando ridisegnare.
 * - Disegna solo quando serve (frameloop "demand"): a piena velocità
 *   (fino al Limite FPS) mentre la visuale si muove, mentre tocchi o passi
 *   col mouse sulla sala, mentre un collega parla o saluta; da ferma scende
 *   a ~12 fotogrammi al secondo, abbastanza per respiro, ventole e mare.
 *   Con le animazioni spente, da ferma non ridisegna proprio.
 * - Misura quanto costa un fotogramma (anche a riposo) per il contatore FPS
 *   e per la modalità automatica.
 * - Risoluzione dinamica: mentre la visuale si muove abbassa la densità di
 *   pixel, da ferma torna nitida.
 * - Modalità automatica: se la sala resta sotto ~45 fps scende di un
 *   gradino (vedi GRADINI_AUTO); se resta sopra ~58 per un po' può risalire,
 *   mai sopra "Alta" e senza fare su e giù.
 */

const RIPOSO_FPS = 12

export const prestazioni = {
  /** Fino a quando (performance.now) si disegna a piena velocità. */
  attivoFino: 0,
  /** Fotogrammi disegnati nell'ultimo secondo. */
  fpsReale: 0,
  /** Fotogrammi al secondo che la sala reggerebbe disegnando sempre. */
  fpsPotenziale: 0,
  aRiposo: false,
  /** La scena è pronta da questo istante (0 = non ancora). */
  prontaDa: 0,
}

/** Qualcosa si muove o l'utente interagisce: piena velocità per `ms`. */
export function segnalaAttivita(ms = 1500) {
  prestazioni.attivoFino = Math.max(prestazioni.attivoFino, performance.now() + ms)
}

/* stato della modalità automatica per questa apertura dell'app */
const auto = { ultimoCambio: 0, buonoDa: 0, salito: false, bloccaSalita: false }

export function Motore({ inPausa, forzaAttivo }: { inPausa: boolean; forzaAttivo: boolean }) {
  const g = useGrafica()
  const invalida = useThree((s) => s.invalidate)
  const camera = useThree((s) => s.camera)
  const setDpr = useThree((s) => s.setDpr)
  const disegnato = useRef(false)
  const opzioni = useRef({ g, inPausa, forzaAttivo })
  useLayoutEffect(() => {
    opzioni.current = { g, inPausa, forzaAttivo }
  })
  const ultimaMatrice = useRef(new THREE.Matrix4())
  const ultimaProiezione = useRef(new THREE.Matrix4())
  const movimento = useRef({ fino: 0 })

  // ogni fotogramma disegnato: la visuale si è mossa?
  useFrame(() => {
    disegnato.current = true
    const m = camera.matrixWorld
    const p = camera.projectionMatrix
    if (!m.equals(ultimaMatrice.current) || !p.equals(ultimaProiezione.current)) {
      ultimaMatrice.current.copy(m)
      ultimaProiezione.current.copy(p)
      movimento.current.fino = performance.now() + 350
      segnalaAttivita(500)
    }
  })

  // colleghi che parlano, salutano o si girano: per un po' piena velocità
  useEffect(() => {
    return useStudio.subscribe((s, prima) => {
      if (s.agenteUfficio !== prima.agenteUfficio || s.inquadratura !== prima.inquadratura) segnalaAttivita(2500)
      if (s.parlaFino !== prima.parlaFino) segnalaAttivita(Math.max(0, s.parlaFino - Date.now()) + 500)
      for (const k of Object.keys(s.agenti) as (keyof typeof s.agenti)[]) {
        if (s.agenti[k].status !== prima.agenti[k].status) segnalaAttivita(s.agenti[k].status === 'fatto' ? 3200 : 800)
      }
    })
  }, [])

  // il giro principale: decide quando chiedere un fotogramma e misura
  useEffect(() => {
    let id = 0
    let ultimo = performance.now()
    let ultimaRichiesta = 0
    const intervalli: { t: number; dt: number }[] = []
    const disegni: number[] = []
    let dprAttuale = -1
    let ultimoControllo = 0

    const giro = (t: number) => {
      id = requestAnimationFrame(giro)
      const { g, inPausa, forzaAttivo } = opzioni.current
      const dt = t - ultimo
      ultimo = t
      if (disegnato.current) {
        disegnato.current = false
        disegni.push(t)
        // un intervallo che contiene un disegno dice quanto costa un fotogramma
        if (dt > 0 && dt < 5000) intervalli.push({ t, dt })
      }
      while (disegni.length && t - disegni[0] > 1000) disegni.shift()
      while (intervalli.length && t - intervalli[0].t > 5000) intervalli.shift()
      prestazioni.fpsReale = disegni.length
      const recenti = intervalli.filter((x) => t - x.t < 2000)
      const media = (xs: { dt: number }[]) => xs.reduce((s, x) => s + x.dt, 0) / Math.max(1, xs.length)
      prestazioni.fpsPotenziale = recenti.length ? Math.min(240, 1000 / media(recenti)) : prestazioni.fpsPotenziale

      if (inPausa) return
      const ora = performance.now()
      const attivo = forzaAttivo || ora < prestazioni.attivoFino
      prestazioni.aRiposo = !attivo
      const limite = g.extra.fps
      const intervallo = attivo ? (limite ? 1000 / limite : 0) : g.fermo ? Infinity : 1000 / RIPOSO_FPS
      if (ora - ultimaRichiesta >= intervallo - 2) {
        ultimaRichiesta = ora
        invalida()
      }

      // densità di pixel: scala di rendering e risoluzione dinamica
      const base = THREE.MathUtils.clamp((Math.min(window.devicePixelRatio || 1, g.tettoDpr) * g.scala) / 100, 0.5, 3)
      const muove = ora < movimento.current.fino
      const voluta = g.dinamica && muove ? Math.max(0.5, base * 0.7) : base
      if (Math.abs(voluta - dprAttuale) > 0.01) {
        dprAttuale = voluta
        setDpr(voluta)
      }

      // modalità automatica, una volta al secondo
      if (ora - ultimoControllo > 1000) {
        ultimoControllo = ora
        controllaAuto(ora, intervalli)
      }
    }
    id = requestAnimationFrame(giro)
    return () => cancelAnimationFrame(id)
  }, [invalida, setDpr])

  return null
}

function controllaAuto(ora: number, intervalli: { t: number; dt: number }[]) {
  const s = useGraficaStore.getState()
  if (s.preset !== 'automatica' || !prestazioni.prontaDa || document.hidden) return
  // si misura dopo che la sala si vede e dopo ogni cambio (gli shader nuovi pesano)
  if (ora - prestazioni.prontaDa < 3000 || ora - auto.ultimoCambio < 6000) return
  const finestra = intervalli.filter((x) => ora - x.t < 5000)
  if (finestra.length < 3) return
  const fps = 1000 / (finestra.reduce((a, x) => a + x.dt, 0) / finestra.length)
  if (fps < 45 && s.autoLivello < GRADINI_AUTO.length) {
    if (auto.salito) auto.bloccaSalita = true
    auto.ultimoCambio = ora
    auto.buonoDa = 0
    intervalli.length = 0
    s.impostaAuto(s.autoLivello + 1, true)
    return
  }
  if (fps > 58 && s.autoLivello > 0 && !auto.bloccaSalita) {
    if (!auto.buonoDa) auto.buonoDa = ora
    if (ora - auto.buonoDa > 20000) {
      auto.salito = true
      auto.ultimoCambio = ora
      auto.buonoDa = 0
      intervalli.length = 0
      s.impostaAuto(s.autoLivello - 1, false)
    }
  } else auto.buonoDa = 0
}

/**
 * Prepara in anticipo tutti i materiali della sala (anche quelli nascosti,
 * come i bagliori della notte): niente scatti la prima volta che compaiono.
 */
export function Precompila() {
  const attivo = useGrafica().extra.precompila
  const gl = useThree((s) => s.gl)
  const scena = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    if (!attivo) return
    try {
      gl.compile(scena, camera)
    } catch {
      /* se non riesce, si compila al primo fotogramma come sempre */
    }
    // solo all'arrivo: i materiali nuovi (impostazioni cambiate) si compilano quando servono
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

