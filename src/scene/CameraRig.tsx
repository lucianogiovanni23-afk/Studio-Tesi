import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStudioStore } from '../store'
import { CAMERA_BERSAGLIO, CAMERA_CASA, POSTAZIONI } from './layout'

/** Riferimento minimo a OrbitControls: bastano il bersaglio e update(). */
export interface ControlliOrbita {
  target: THREE.Vector3
  update: () => void
}

const DURATA = 1.1

/**
 * Transizione fluida verso la postazione scelta. Finita l'animazione i
 * controlli tornano liberi, così si può continuare a orbitare a mano.
 */
export function CameraRig({ controlli }: { controlli: React.MutableRefObject<ControlliOrbita | null> }) {
  const camera = useThree((s) => s.camera)
  const fuoco = useStudioStore((s) => s.fuocoCamera)
  const token = useStudioStore((s) => s.tokenFuoco)

  const ridotto = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  )

  const avanzamento = useRef(1)
  const daPosizione = useRef(new THREE.Vector3())
  const daBersaglio = useRef(new THREE.Vector3())
  const aPosizione = useRef(new THREE.Vector3())
  const aBersaglio = useRef(new THREE.Vector3())

  useEffect(() => {
    if (token === 0) return

    daPosizione.current.copy(camera.position)
    daBersaglio.current.copy(controlli.current?.target ?? new THREE.Vector3(...CAMERA_BERSAGLIO))

    if (fuoco) {
      const [sx, sz] = POSTAZIONI[fuoco].sedia
      aBersaglio.current.set(sx, 1.35, sz - 0.5)
      aPosizione.current.set(sx * 0.55, 3.4, sz + 5.2)
    } else {
      aPosizione.current.set(...CAMERA_CASA)
      aBersaglio.current.set(...CAMERA_BERSAGLIO)
    }

    // Con prefers-reduced-motion si salta l'animazione e si arriva subito.
    avanzamento.current = ridotto ? 1 : 0
    if (ridotto) {
      camera.position.copy(aPosizione.current)
      if (controlli.current) {
        controlli.current.target.copy(aBersaglio.current)
        controlli.current.update()
      }
    }
  }, [token, fuoco, camera, controlli, ridotto])

  useFrame((_, deltaGrezzo) => {
    if (avanzamento.current >= 1) return
    const dt = Math.min(deltaGrezzo, 0.1)
    avanzamento.current = Math.min(1, avanzamento.current + dt / DURATA)

    const t = avanzamento.current
    const morbido = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    camera.position.lerpVectors(daPosizione.current, aPosizione.current, morbido)
    if (controlli.current) {
      controlli.current.target.lerpVectors(daBersaglio.current, aBersaglio.current, morbido)
      controlli.current.update()
    } else {
      camera.lookAt(aBersaglio.current)
    }
  })

  return null
}
