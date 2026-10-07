import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useContestoEtichette } from './qualita'

const punto = new THREE.Vector3()

/**
 * Etichetta HTML nella scena che sparisce quando finirebbe sotto il pannello
 * della conversazione (lato destro) o durante l'intro.
 */
export function Etichetta({
  position,
  distanceFactor,
  zIndexRange,
  pointerEvents,
  children,
}: {
  position: [number, number, number]
  distanceFactor: number
  zIndexRange: [number, number]
  pointerEvents?: 'none' | 'auto'
  children: React.ReactNode
}) {
  const { spazioDestra, nascoste } = useContestoEtichette()
  const gruppo = useRef<THREE.Group>(null)
  const div = useRef<HTMLDivElement>(null)
  const meta = useRef(80)
  const conta = useRef(0)
  const size = useThree((s) => s.size)

  useFrame(({ camera }) => {
    const g = gruppo.current
    const d = div.current
    if (!g || !d) return
    // misura la larghezza vera ogni tanto (cambia con la distanza)
    if (conta.current++ % 30 === 0) {
      const w = d.getBoundingClientRect().width
      if (w > 0) meta.current = w / 2
    }
    g.getWorldPosition(punto)
    punto.project(camera)
    const x = ((punto.x + 1) / 2) * size.width
    const limite = size.width - spazioDestra - 10
    const ok = !nascoste && punto.z < 1 && x + meta.current < limite
    // drei può riscrivere lo stile del div: si confronta col valore reale
    const voluto = ok ? 'visible' : 'hidden'
    if (d.style.visibility !== voluto) d.style.visibility = voluto
  })

  return (
    <group ref={gruppo} position={position}>
      <Html ref={div} center distanceFactor={distanceFactor} zIndexRange={zIndexRange} pointerEvents={pointerEvents}>
        {children}
      </Html>
    </group>
  )
}
