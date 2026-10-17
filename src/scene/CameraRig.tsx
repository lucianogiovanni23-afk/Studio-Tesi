import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import type { AgentKey } from '../types'
import { EVENTO_VOLO, puntoSchermo } from './punti'
import { ALTEZZA_SALA, CAMERA_BERSAGLIO, CAMERA_CASA, CAMERA_INGRESSO, DIETRO_SCRIVANIA, INGRESSO_BERSAGLIO, POSTAZIONI } from './layout'

/** Riferimento minimo a OrbitControls: bastano il bersaglio, update() ed enabled. */
export interface ControlliOrbita {
  target: THREE.Vector3
  update: () => void
  enabled: boolean
}

const DURATA = 1.4
/** Volo verso lo schermo prima di aprire una pagina: breve, non deve mai far aspettare. */
const DURATA_VOLO = 0.6
/** Entrata dalla porta a vetri, a ogni apertura dell'app. */
const DURATA_INTRO = 3.4
/** Distanza dallo schermo a fine volo. */
const DISTANZA_SCHERMO = 0.32

/** Come entra la telecamera quando si apre l'ufficio. */
export type Ingresso = { tipo: 'intro' } | null

/** Posa della telecamera "dentro" lo schermo di k, e punto di controllo della curva di volo. */
function posaSchermo(k: AgentKey, pos: THREE.Vector3, bers: THREE.Vector3, ctrl: THREE.Vector3) {
  const { centro, normale } = puntoSchermo(k)
  bers.copy(centro)
  pos.copy(centro).addScaledVector(normale, DISTANZA_SCHERMO)
  ctrl.copy(centro).addScaledVector(normale, 1.3)
  ctrl.y += 0.75
}
/** La telecamera non sale mai fin dentro le lamelle del soffitto. */
const QUOTA_MASSIMA = ALTEZZA_SALA - 1.2

/**
 * Transizione fluida verso la postazione scelta (o la vista d'insieme). Con
 * prefers-reduced-motion la telecamera arriva subito, senza animazione.
 * A ogni apertura dell'app (intro) entra dalla porta a vetri in fondo e plana
 * sulla sala.
 */
export function CameraRig({
  controlli,
  fuoco,
  token,
  ingresso = null,
  partenza = false,
  salta = 0,
  onFineIntro,
}: {
  controlli: React.MutableRefObject<ControlliOrbita | null>
  fuoco: AgentKey | null
  token: number
  /** Entrata dalla porta: la telecamera aspetta fuori finché `partenza` diventa vero. */
  ingresso?: Ingresso
  partenza?: boolean
  /** Cambia per saltare l'entrata e arrivare subito alla vista d'insieme. */
  salta?: number
  onFineIntro?: () => void
}) {
  const camera = useThree((s) => s.camera)
  const invalida = useThree((s) => s.invalidate)
  const ridotto = useMovimentoRidotto()

  const avanzamento = useRef(1)
  const durata = useRef(DURATA)
  const inIntro = useRef(false)
  const inVolo = useRef(false)
  const bersaglio = useRef(new THREE.Vector3())
  const daPos = useRef(new THREE.Vector3())
  const daBers = useRef(new THREE.Vector3())
  const aPos = useRef(new THREE.Vector3())
  const aBers = useRef(new THREE.Vector3())
  /** Punto di controllo della curva di volo: si passa sopra la spalla della persona, non attraverso il monitor. */
  const controllo = useRef(new THREE.Vector3())
  /** L'entrata è pronta ma aspetta il via (la schermata di caricamento sta ancora sparendo). */
  const inAttesa = useRef(false)
  const fine = useRef(onFineIntro)
  fine.current = onFineIntro

  const chiudiIntro = () => {
    if (!inIntro.current) return
    inIntro.current = false
    if (controlli.current) controlli.current.enabled = true
    fine.current?.()
  }

  // Entrata: la telecamera si mette fuori dalla porta e aspetta il via.
  useEffect(() => {
    if (!ingresso || ridotto) return
    inIntro.current = true
    inAttesa.current = true
    if (controlli.current) controlli.current.enabled = false
    durata.current = DURATA_INTRO
    daPos.current.set(...CAMERA_INGRESSO)
    daBers.current.set(...INGRESSO_BERSAGLIO)
    aPos.current.set(...CAMERA_CASA)
    aBers.current.set(...CAMERA_BERSAGLIO)
    camera.position.copy(daPos.current)
    camera.lookAt(daBers.current)
    avanzamento.current = 1
    invalida()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!partenza || !inAttesa.current) return
    inAttesa.current = false
    avanzamento.current = 0
    invalida()
  }, [partenza, invalida])

  // Salto (tocco, clic o Esc): si arriva subito alla vista d'insieme.
  useEffect(() => {
    if (salta === 0 || !inIntro.current) return
    inAttesa.current = false
    avanzamento.current = 1
    camera.position.set(...CAMERA_CASA)
    const c = controlli.current
    if (c) {
      c.target.set(...CAMERA_BERSAGLIO)
      c.enabled = true
    }
    camera.lookAt(...CAMERA_BERSAGLIO)
    c?.update()
    chiudiIntro()
    invalida()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salta])

  useEffect(() => {
    if (token === 0) return
    inAttesa.current = false
    chiudiIntro()
    if (inVolo.current) {
      inVolo.current = false
      if (controlli.current) controlli.current.enabled = true
    }
    durata.current = DURATA
    daPos.current.copy(camera.position)
    daBers.current.copy(controlli.current?.target ?? bersaglio.current.set(...CAMERA_BERSAGLIO))
    if (fuoco) {
      // Primo piano della persona scelta, un po' dall'alto come chi le si siede davanti.
      const [x, z] = POSTAZIONI[fuoco].scrivania
      aBers.current.set(x, 1.12, z + DIETRO_SCRIVANIA)
      aPos.current.set(x * 0.84, 2.3, z + 3.25)
    } else {
      aPos.current.set(...CAMERA_CASA)
      aBers.current.set(...CAMERA_BERSAGLIO)
    }
    avanzamento.current = ridotto ? 1 : 0
    if (ridotto) {
      camera.position.copy(aPos.current)
      if (controlli.current) {
        controlli.current.target.copy(aBers.current)
        controlli.current.update()
      } else camera.lookAt(aBers.current)
    }
    invalida()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, fuoco, camera, controlli, ridotto, invalida])

  // Volo dentro lo schermo: la telecamera accelera verso il monitor, poi si apre la pagina.
  useEffect(() => {
    if (ridotto) return
    const vola = (e: Event) => {
      const k = (e as CustomEvent<AgentKey>).detail
      if (!k || !POSTAZIONI[k]) return
      chiudiIntro()
      inAttesa.current = false
      inVolo.current = true
      durata.current = DURATA_VOLO
      daPos.current.copy(camera.position)
      daBers.current.copy(controlli.current?.target ?? bersaglio.current.set(...CAMERA_BERSAGLIO))
      posaSchermo(k, aPos.current, aBers.current, controllo.current)
      if (controlli.current) controlli.current.enabled = false
      avanzamento.current = 0
      invalida()
    }
    window.addEventListener(EVENTO_VOLO, vola)
    return () => window.removeEventListener(EVENTO_VOLO, vola)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controlli, ridotto, invalida])

  useFrame((_, grezzo) => {
    if (inAttesa.current) {
      // ferma in posizione finché non parte l'entrata
      if (controlli.current?.enabled) controlli.current.enabled = false
      camera.position.copy(daPos.current)
      camera.lookAt(daBers.current)
      return
    }
    if (avanzamento.current >= 1) {
      if (inVolo.current) return
      // rete di sicurezza: mai sopra il soffitto
      if (camera.position.y > QUOTA_MASSIMA) camera.position.y = QUOTA_MASSIMA
      return
    }
    const c = controlli.current
    // Durante l'intro OrbitControls è spento: niente vincoli sugli angoli a metà strada.
    if (inIntro.current && c && c.enabled) c.enabled = false
    avanzamento.current = Math.min(1, avanzamento.current + Math.min(grezzo, 0.1) / durata.current)
    const t = avanzamento.current
    const morbido = inVolo.current
      ? t * t * (2.2 - 1.2 * t) // accelera verso lo schermo
      : inIntro.current
      ? t * t * t * (t * (t * 6 - 15) + 10) // parte piano, attraversa la porta, si posa piano
      : t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2
    camera.position.lerpVectors(daPos.current, aPos.current, morbido)
    if (inVolo.current) {
      // curva di Bézier quadratica: alle spalle della persona, poi dentro lo schermo
      const u = 1 - morbido
      camera.position
        .copy(daPos.current)
        .multiplyScalar(u * u)
        .addScaledVector(controllo.current, 2 * u * morbido)
        .addScaledVector(aPos.current, morbido * morbido)
      bersaglio.current.lerpVectors(daBers.current, aBers.current, Math.min(1, morbido * 1.6))
      camera.lookAt(bersaglio.current)
    } else if (inIntro.current) {
      // una leggera curva verso l'alto, come una ripresa con il drone
      camera.position.y += Math.sin(morbido * Math.PI) * 0.35
      bersaglio.current.lerpVectors(daBers.current, aBers.current, morbido)
      if (c) c.target.copy(bersaglio.current)
      camera.lookAt(bersaglio.current)
      if (t >= 1) {
        chiudiIntro()
        c?.update()
      }
    } else if (c) {
      c.target.lerpVectors(daBers.current, aBers.current, morbido)
      c.update()
    } else {
      camera.lookAt(aBers.current)
    }
    // il prossimo fotogramma lo chiede il Motore (la visuale si muove → piena velocità, fino al limite FPS)
  })

  return null
}
