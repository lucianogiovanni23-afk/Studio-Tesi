import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { AGENT_BY_KEY } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { AgentKey } from '../types'
import { SEAT_OFFSET, WORKSTATIONS } from './layout'

const WOOD = '#9b6a44'
const WOOD_DARK = '#6d452c'
const METAL = '#3a4250'
const PLASTIC = '#2a303c'

/** Griglia di tasti accennata sulla tastiera. */
function Keys() {
  const keys = useMemo(() => {
    const out: [number, number][] = []
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 12; col++) {
        out.push([-0.33 + col * 0.06, -0.075 + row * 0.05])
      }
    }
    return out
  }, [])

  return (
    <group position={[0, 0.026, 0]}>
      {keys.map(([x, z], i) => (
        <mesh key={i} position={[x, 0, z]}>
          <boxGeometry args={[0.045, 0.012, 0.038]} />
          <meshStandardMaterial color="#4b5361" flatShading roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

/** Sedia da ufficio con base a cinque razze. */
function OfficeChair({ color }: { color: string }) {
  const spokes = useMemo(
    () => Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2),
    [],
  )

  return (
    <group>
      {spokes.map((angle, i) => (
        <group key={i} rotation={[0, angle, 0]}>
          <mesh position={[0, 0.07, 0.24]} castShadow>
            <boxGeometry args={[0.07, 0.05, 0.48]} />
            <meshStandardMaterial color={PLASTIC} flatShading roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.035, 0.46]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.07, 6]} />
            <meshStandardMaterial color="#1d222c" flatShading roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* pistone */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.07, 0.42, 8]} />
        <meshStandardMaterial color={METAL} flatShading metalness={0.4} roughness={0.5} />
      </mesh>
      {/* seduta */}
      <mesh position={[0, 0.54, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.56, 0.11, 0.52]} />
        <meshStandardMaterial color={PLASTIC} flatShading roughness={0.85} />
      </mesh>
      {/* schienale, inclinato all'indietro */}
      <group position={[0, 0.6, 0.25]} rotation={[0.16, 0, 0]}>
        <mesh position={[0, 0.34, 0]} castShadow>
          <boxGeometry args={[0.54, 0.66, 0.1]} />
          <meshStandardMaterial color={PLASTIC} flatShading roughness={0.85} />
        </mesh>
        {/* poggiatesta nel colore dell'agente */}
        <mesh position={[0, 0.72, 0]} castShadow>
          <boxGeometry args={[0.34, 0.14, 0.11]} />
          <meshStandardMaterial color={color} flatShading roughness={0.7} />
        </mesh>
      </group>
      {/* braccioli */}
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, 0.7, 0.04]} castShadow>
          <boxGeometry args={[0.07, 0.06, 0.4]} />
          <meshStandardMaterial color="#1d222c" flatShading roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

export function WorkstationMesh({ agentKey }: { agentKey: AgentKey }) {
  const agent = AGENT_BY_KEY[agentKey]
  const station = WORKSTATIONS[agentKey]
  const status = useStudioStore((s) => s.agents[agentKey].status)

  const screen = useRef<THREE.MeshStandardMaterial>(null)
  const lamp = useRef<THREE.PointLight>(null)

  const working = status === 'working'
  const lightColor = status === 'error' ? '#ef4444' : agent.color

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1)
    const t = state.clock.elapsedTime

    // Lo schermo è scuro quando l'agente è inattivo e si illumina mentre lavora.
    let target = 0.04
    if (working) target = 1.2 + Math.sin(t * 5.5) * 0.22
    else if (status === 'waiting') target = 0.75
    else if (status === 'walking') target = 0.3
    else if (status === 'done') target = 0.45
    else if (status === 'error') target = 0.3 + Math.abs(Math.sin(t * 3)) * 0.55

    if (screen.current) {
      screen.current.emissiveIntensity = THREE.MathUtils.damp(
        screen.current.emissiveIntensity,
        target,
        6,
        dt,
      )
    }
    if (lamp.current) {
      // La luce colorata di postazione è accesa solo mentre l'agente è operativo.
      const lampTarget = working || status === 'waiting' || status === 'error' ? target * 4.2 : 0
      lamp.current.intensity = THREE.MathUtils.damp(lamp.current.intensity, lampTarget, 5, dt)
    }
  })

  const [x, z] = station.desk

  return (
    <group position={[x, 0, z]}>
      {/* --- scrivania: piano + gambe --- */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.3, 0.09, 1.15]} />
        <meshStandardMaterial color={WOOD} flatShading roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.58, -0.5]} castShadow>
        <boxGeometry args={[2.2, 0.28, 0.06]} />
        <meshStandardMaterial color={WOOD_DARK} flatShading roughness={0.85} />
      </mesh>
      {[
        [-1.05, -0.47],
        [1.05, -0.47],
        [-1.05, 0.47],
        [1.05, 0.47],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.35, lz]} castShadow>
          <boxGeometry args={[0.09, 0.7, 0.09]} />
          <meshStandardMaterial color={METAL} flatShading metalness={0.35} roughness={0.55} />
        </mesh>
      ))}

      {/* --- monitor su supporto, rivolto verso chi siede --- */}
      <group position={[0, 0.785, -0.3]}>
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[0.5, 0.04, 0.26]} />
          <meshStandardMaterial color={METAL} flatShading metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.09, 0.36, 0.08]} />
          <meshStandardMaterial color={METAL} flatShading metalness={0.4} roughness={0.5} />
        </mesh>
        <group position={[0, 0.66, 0.03]} rotation={[-0.12, 0, 0]}>
          {/* scocca */}
          <mesh castShadow>
            <boxGeometry args={[1.28, 0.78, 0.06]} />
            <meshStandardMaterial color="#20252f" flatShading roughness={0.6} />
          </mesh>
          {/* schermo emissivo, rivolto verso la sedia (+z) */}
          <mesh position={[0, 0.02, 0.04]}>
            <planeGeometry args={[1.16, 0.66]} />
            <meshStandardMaterial
              ref={screen}
              color="#0d1017"
              emissive={lightColor}
              emissiveIntensity={0.04}
              roughness={0.35}
            />
          </mesh>
        </group>
      </group>

      {/* --- tastiera davanti al monitor --- */}
      <group position={[0, 0.79, 0.14]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.82, 0.04, 0.3]} />
          <meshStandardMaterial color={PLASTIC} flatShading roughness={0.8} />
        </mesh>
        <Keys />
      </group>

      {/* --- mouse con tappetino --- */}
      <mesh position={[0.68, 0.787, 0.16]} receiveShadow>
        <boxGeometry args={[0.36, 0.008, 0.28]} />
        <meshStandardMaterial color="#2f3644" flatShading roughness={0.95} />
      </mesh>
      <mesh position={[0.68, 0.815, 0.14]} castShadow>
        <sphereGeometry args={[0.062, 8, 6]} />
        <meshStandardMaterial color="#d7dbe4" flatShading roughness={0.6} />
      </mesh>

      {/* --- dettagli sul piano: tazza, fogli, portapenne --- */}
      <group position={[-0.86, 0.785, 0.22]}>
        <mesh position={[0, 0.07, 0]} castShadow>
          <cylinderGeometry args={[0.085, 0.075, 0.15, 8]} />
          <meshStandardMaterial color="#e8e2d6" flatShading roughness={0.85} />
        </mesh>
        <mesh position={[0.1, 0.07, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <torusGeometry args={[0.045, 0.014, 6, 10]} />
          <meshStandardMaterial color="#e8e2d6" flatShading roughness={0.85} />
        </mesh>
      </group>
      <mesh position={[-0.82, 0.81, -0.22]} rotation={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.34, 0.05, 0.44]} />
        <meshStandardMaterial color="#f2ece0" flatShading roughness={0.95} />
      </mesh>
      <group position={[0.92, 0.785, -0.3]}>
        <mesh position={[0, 0.09, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.07, 0.18, 6]} />
          <meshStandardMaterial color={agent.color} flatShading roughness={0.7} />
        </mesh>
        {[-0.025, 0.02].map((dx, i) => (
          <mesh key={i} position={[dx, 0.21, i * 0.03]} rotation={[0.1 * i, 0, 0.12 * (i ? 1 : -1)]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.22, 5]} />
            <meshStandardMaterial color={i ? '#e05a5a' : '#3a6fd8'} flatShading roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* --- targhetta con nome e ruolo --- */}
      <group position={[-0.6, 0.8, 0.5]} rotation={[-0.34, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.02, 0.28, 0.03]} />
          <meshStandardMaterial color="#1b2029" flatShading roughness={0.7} />
        </mesh>
        {/* 160px * 0.025 * 0.245 ≈ 0,98 unità di scena di larghezza */}
        <Html transform occlude scale={0.245} position={[0, 0, 0.018]} zIndexRange={[8, 0]}>
          <div className="nameplate">
            <strong style={{ color: agent.color }}>{agent.name}</strong>
            <span>{agent.role}</span>
          </div>
        </Html>
      </group>

      {/* --- luce di postazione nel colore dell'agente --- */}
      <pointLight
        ref={lamp}
        position={[0, 1.75, 0.15]}
        color={lightColor}
        intensity={0}
        distance={6.5}
        decay={2}
      />

      {/* --- sedia: lo schienale sta dietro a chi siede, rivolto verso la telecamera --- */}
      <group position={[0, 0, SEAT_OFFSET]}>
        <OfficeChair color={agent.color} />
      </group>
    </group>
  )
}
