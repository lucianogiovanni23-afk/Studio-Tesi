import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AGENT_BY_ID, type AgentId } from '../agents'
import { usePipelineStore } from '../store'
import { LAYOUT } from './layout'

const WOOD = '#8a5a3b'
const WOOD_DARK = '#6d452c'
const METAL = '#39414f'

/**
 * Scrivania low-poly con laptop. Lo schermo e la luce puntiforme dedicata
 * si accendono del colore dell'agente quando sta lavorando.
 */
export function Desk({ id }: { id: AgentId }) {
  const agent = AGENT_BY_ID[id]
  const [x, , z] = LAYOUT[id].deskPosition
  const phase = usePipelineStore((s) => s.agents[id].phase)

  const screen = useRef<THREE.MeshStandardMaterial>(null)
  const lamp = useRef<THREE.PointLight>(null)

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1)
    const t = state.clock.elapsedTime

    let target = 0.05
    if (phase === 'working') target = 1.15 + Math.sin(t * 6) * 0.22 // pulsa mentre elabora
    else if (phase === 'walking') target = 0.45
    else if (phase === 'done') target = 0.55
    else if (phase === 'error') target = 0.3 + Math.abs(Math.sin(t * 3)) * 0.5

    if (screen.current) {
      screen.current.emissiveIntensity = THREE.MathUtils.damp(
        screen.current.emissiveIntensity,
        target,
        6,
        dt,
      )
    }
    if (lamp.current) {
      lamp.current.intensity = THREE.MathUtils.damp(lamp.current.intensity, target * 5.5, 6, dt)
    }
  })

  const errorColor = '#ef4444'
  const lightColor = phase === 'error' ? errorColor : agent.color

  return (
    <group position={[x, 0, z]}>
      {/* piano */}
      <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.1, 1.1]} />
        <meshStandardMaterial color={WOOD} flatShading roughness={0.8} />
      </mesh>
      {/* gambe */}
      {[
        [-0.88, -0.44],
        [0.88, -0.44],
        [-0.88, 0.44],
        [0.88, 0.44],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.37, lz]} castShadow>
          <boxGeometry args={[0.1, 0.74, 0.1]} />
          <meshStandardMaterial color={METAL} flatShading roughness={0.6} metalness={0.3} />
        </mesh>
      ))}

      {/* laptop: base + schermo inclinato verso il personaggio */}
      <mesh position={[0, 0.85, -0.05]} castShadow>
        <boxGeometry args={[0.74, 0.04, 0.48]} />
        <meshStandardMaterial color={METAL} flatShading roughness={0.5} metalness={0.4} />
      </mesh>
      <group position={[0, 0.87, 0.19]} rotation={[0.34, 0, 0]}>
        <mesh position={[0, 0.21, 0]} castShadow>
          <boxGeometry args={[0.72, 0.44, 0.035]} />
          <meshStandardMaterial
            ref={screen}
            color="#11151f"
            emissive={lightColor}
            emissiveIntensity={0.05}
            flatShading
            roughness={0.4}
          />
        </mesh>
      </group>

      {/* luce colorata dedicata alla scrivania */}
      <pointLight
        ref={lamp}
        position={[0, 1.5, 0.1]}
        color={lightColor}
        intensity={0.2}
        distance={7}
        decay={2}
      />

      {/* dettagli: pila di fogli e tazza */}
      <mesh position={[-0.72, 0.87, 0.2]} rotation={[0, 0.24, 0]} castShadow>
        <boxGeometry args={[0.3, 0.06, 0.4]} />
        <meshStandardMaterial color="#eae3d6" flatShading roughness={0.95} />
      </mesh>
      <mesh position={[0.7, 0.91, 0.22]} castShadow>
        <cylinderGeometry args={[0.09, 0.08, 0.16, 6]} />
        <meshStandardMaterial color={WOOD_DARK} flatShading roughness={0.85} />
      </mesh>
    </group>
  )
}
