import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStudioStore } from '../store'
import { CAMERA_HOME, CAMERA_TARGET, WORKSTATIONS } from './layout'

/** Riferimento minimo a OrbitControls: basta il target e update(). */
export interface OrbitControlsLike {
  target: THREE.Vector3
  update: () => void
}

const TRANSITION_SECONDS = 1.1

/**
 * Transizione fluida della telecamera verso la postazione scelta.
 * Finita l'animazione i controlli tornano liberi, così si può orbitare a mano.
 */
export function CameraRig({ controls }: { controls: React.MutableRefObject<OrbitControlsLike | null> }) {
  const camera = useThree((s) => s.camera)
  const focus = useStudioStore((s) => s.cameraFocus)
  const token = useStudioStore((s) => s.cameraFocusToken)

  const progress = useRef(1)
  const fromPosition = useRef(new THREE.Vector3())
  const fromTarget = useRef(new THREE.Vector3())
  const toPosition = useRef(new THREE.Vector3())
  const toTarget = useRef(new THREE.Vector3())

  useEffect(() => {
    if (token === 0) return

    fromPosition.current.copy(camera.position)
    fromTarget.current.copy(controls.current?.target ?? new THREE.Vector3(...CAMERA_TARGET))

    if (focus) {
      const station = WORKSTATIONS[focus]
      const [sx, sz] = station.seat
      toTarget.current.set(sx, 1.35, sz - 0.5)
      // Si arriva davanti alla postazione, leggermente dall'alto e di lato.
      toPosition.current.set(sx * 0.55, 3.5, sz + 5.2)
    } else {
      toPosition.current.set(...CAMERA_HOME)
      toTarget.current.set(...CAMERA_TARGET)
    }

    progress.current = 0
  }, [token, focus, camera, controls])

  useFrame((_, rawDelta) => {
    if (progress.current >= 1) return
    const dt = Math.min(rawDelta, 0.1)
    progress.current = Math.min(1, progress.current + dt / TRANSITION_SECONDS)

    // Ease-in-out cubica, così la transizione parte e finisce morbida.
    const t = progress.current
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    camera.position.lerpVectors(fromPosition.current, toPosition.current, eased)
    if (controls.current) {
      controls.current.target.lerpVectors(fromTarget.current, toTarget.current, eased)
      controls.current.update()
    } else {
      camera.lookAt(toTarget.current)
    }
  })

  return null
}
