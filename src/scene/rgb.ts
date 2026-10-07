import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'

/**
 * Luci RGB che scorrono lentamente fra i colori, come nei PC da gioco.
 * Restituisce un ref da dare ai materiali: ognuno parte da una tonalità
 * diversa (sfasamento) così le ventole non sono tutte uguali.
 */
export function useRgb(sfasamento = 0, velocita = 0.06, luminosita = 0.55) {
  const materiali = useRef<(THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | null)[]>([])
  const fermo = useMovimentoRidotto()
  const colore = useRef(new THREE.Color())
  useFrame((stato) => {
    const t = fermo ? 0 : stato.clock.elapsedTime
    materiali.current.forEach((m, i) => {
      if (!m) return
      colore.current.setHSL((t * velocita + sfasamento + i * 0.08) % 1, 0.9, luminosita)
      if ('emissive' in m) m.emissive.copy(colore.current)
      m.color.copy(colore.current)
    })
  })
  return (i: number) => (m: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | null) => {
    materiali.current[i] = m
  }
}
