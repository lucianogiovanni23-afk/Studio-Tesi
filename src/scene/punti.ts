import * as THREE from 'three'
import type { AgentKey } from '../types'
import { DIETRO_SCRIVANIA, POSTAZIONI } from './layout'

const SU = new THREE.Vector3(0, 1, 0)

/** Evento (window) che chiede alla telecamera di volare dentro lo schermo di una persona. */
export const EVENTO_VOLO = 'studio-tesi-vola-schermo'

/** Dove sta il viso della persona seduta alla postazione k (coordinate del mondo). */
export function puntoViso(k: AgentKey): [number, number, number] {
  const { scrivania, rotazione } = POSTAZIONI[k]
  const p = new THREE.Vector3(0, 1.18, DIETRO_SCRIVANIA).applyAxisAngle(SU, rotazione)
  return [scrivania[0] + p.x, p.y, scrivania[1] + p.z]
}

/**
 * Centro e normale dello schermo curvo della postazione k (vedi Scrivania:
 * monitor in [0.56, 0.76, -0.14], ruotato di π + 0.95, pannello a +0.4).
 */
export function puntoSchermo(k: AgentKey): { centro: THREE.Vector3; normale: THREE.Vector3 } {
  const { scrivania, rotazione } = POSTAZIONI[k]
  const centro = new THREE.Vector3(0.56, 0.76 + 0.4, -0.14).applyAxisAngle(SU, rotazione)
  centro.x += scrivania[0]
  centro.z += scrivania[1]
  const normale = new THREE.Vector3(0, 0, 1).applyAxisAngle(SU, rotazione + Math.PI + 0.95)
  return { centro, normale }
}

