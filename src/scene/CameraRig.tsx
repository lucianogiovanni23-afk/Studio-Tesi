import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import type { AgentKey } from '../types'
import { ALTEZZA_SALA, CAMERA_BERSAGLIO, CAMERA_CASA, CAMERA_INGRESSO, DIETRO_SCRIVANIA, INGRESSO_BERSAGLIO, POSTAZIONI } from './layout'

/** Riferimento minimo a OrbitControls: bastano il bersaglio, update() ed enabled. */
export interface ControlliOrbita {
  target: THREE.Vector3
  update: () => void
  enabled: boolean
}

const DURATA = 1.4
const DURATA_INTRO = 2.6
/** La telecamera non sale mai fin dentro le lamelle del soffitto. */
const QUOTA_MASSIMA = ALTEZZA_SALA - 1.2

/**
 * Transizione fluida verso la postazione scelta (o la vista d'insieme). Con
 * prefers-reduced-motion la telecamera arriva subito, senza animazione.
 * Alla prima visita (intro) entra dalla porta in fondo e plana sulla sala.
 */
export function CameraRig({
  controlli,
  fuoco,
  token,
  intro = false,
  onFineIntro,
}: {
  controlli: React.MutableRefObject<ControlliOrbita | null>
  fuoco: AgentKey | null
  token: number
  intro?: boolean
  onFineIntro?: () => void
}) {
  const camera = useThree((s) => s.camera)
  const invalida = useThree((s) => s.invalidate)
  const ridotto = useMovimentoRidotto()

  const avanzamento = useRef(1)
  const durata = useRef(DURATA)
  const inIntro = useRef(false)
  const bersaglio = useRef(new THREE.Vector3())
  const daPos = useRef(new THREE.Vector3())
  const daBers = useRef(new THREE.Vector3())
  const aPos = useRef(new THREE.Vector3())
  const aBers = useRef(new THREE.Vector3())
  const fine = useRef(onFineIntro)
  fine.current = onFineIntro

  const chiudiIntro = () => {
    if (!inIntro.current) return
    inIntro.current = false
    if (controlli.current) controlli.current.enabled = true
    fine.current?.()
  }

  // Intro: si parte fuori dalla porta, alle spalle della vista d'insieme.
  useEffect(() => {
    if (!intro || ridotto) return
    inIntro.current = true
    durata.current = DURATA_INTRO
    daPos.current.set(...CAMERA_INGRESSO)
    daBers.current.set(...INGRESSO_BERSAGLIO)
    aPos.current.set(...CAMERA_CASA)
    aBers.current.set(...CAMERA_BERSAGLIO)
    camera.position.copy(daPos.current)
    camera.lookAt(daBers.current)
    avanzamento.current = 0
    invalida()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (token === 0) return
    chiudiIntro()
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

  useFrame((_, grezzo) => {
    if (avanzamento.current >= 1) {
      // rete di sicurezza: mai sopra il soffitto
      if (camera.position.y > QUOTA_MASSIMA) camera.position.y = QUOTA_MASSIMA
      return
    }
    const c = controlli.current
    // Durante l'intro OrbitControls è spento: niente vincoli sugli angoli a metà strada.
    if (inIntro.current && c && c.enabled) c.enabled = false
    avanzamento.current = Math.min(1, avanzamento.current + Math.min(grezzo, 0.1) / durata.current)
    const t = avanzamento.current
    const morbido = inIntro.current
      ? 1 - Math.pow(1 - t, 3) * (1 - t * 0.35) // parte deciso e si posa piano
      : t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2
    camera.position.lerpVectors(daPos.current, aPos.current, morbido)
    if (inIntro.current) {
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
    invalida()
  })

  return null
}
