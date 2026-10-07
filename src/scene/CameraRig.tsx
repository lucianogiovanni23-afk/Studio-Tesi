import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import type { AgentKey } from '../types'
import { CAMERA_BERSAGLIO, CAMERA_CASA, DIETRO_SCRIVANIA, POSTAZIONI } from './layout'

/** Riferimento minimo a OrbitControls: bastano il bersaglio e update(). */
export interface ControlliOrbita {
  target: THREE.Vector3
  update: () => void
}

const DURATA = 1.4

/**
 * Transizione fluida verso la postazione scelta (o la vista d'insieme). Con
 * prefers-reduced-motion la telecamera arriva subito, senza animazione.
 */
export function CameraRig({
  controlli,
  fuoco,
  token,
}: {
  controlli: React.MutableRefObject<ControlliOrbita | null>
  fuoco: AgentKey | null
  token: number
}) {
  const camera = useThree((s) => s.camera)
  const invalida = useThree((s) => s.invalidate)
  const ridotto = useMovimentoRidotto()

  const avanzamento = useRef(1)
  const daPos = useRef(new THREE.Vector3())
  const daBers = useRef(new THREE.Vector3())
  const aPos = useRef(new THREE.Vector3())
  const aBers = useRef(new THREE.Vector3())

  useEffect(() => {
    if (token === 0) return
    daPos.current.copy(camera.position)
    daBers.current.copy(controlli.current?.target ?? new THREE.Vector3(...CAMERA_BERSAGLIO))
    if (fuoco) {
      // Primo piano della persona scelta, un po' dall'alto come chi le si siede davanti.
      const [x, z] = POSTAZIONI[fuoco].scrivania
      aBers.current.set(x, 1.12, z + DIETRO_SCRIVANIA)
      aPos.current.set(x * 0.82, 2.35, z + 3.7)
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
  }, [token, fuoco, camera, controlli, ridotto, invalida])

  useFrame((_, grezzo) => {
    if (avanzamento.current >= 1) return
    avanzamento.current = Math.min(1, avanzamento.current + Math.min(grezzo, 0.1) / DURATA)
    const t = avanzamento.current
    const morbido = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    camera.position.lerpVectors(daPos.current, aPos.current, morbido)
    if (controlli.current) {
      controlli.current.target.lerpVectors(daBers.current, aBers.current, morbido)
      controlli.current.update()
    } else {
      camera.lookAt(aBers.current)
    }
    invalida()
  })

  return null
}
