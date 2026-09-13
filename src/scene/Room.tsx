import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { usePipelineStore } from '../store'
import { ROOM } from './layout'

const PLANK_DEPTH = 1
const WALL_COLOR = '#3a4156'
const WALL_TRIM = '#2d3345'

/** Pavimento in legno low-poly: doghe con tonalità leggermente diverse. */
function WoodFloor() {
  const planks = useMemo(() => {
    const count = Math.round((ROOM.halfDepth * 2) / PLANK_DEPTH)
    const tones = ['#8a5a37', '#96633e', '#7e5132', '#8f5d3a', '#87573a']
    return Array.from({ length: count }, (_, i) => ({
      z: -ROOM.halfDepth + PLANK_DEPTH / 2 + i * PLANK_DEPTH,
      color: tones[i % tones.length],
      tilt: ((i % 3) - 1) * 0.004,
    }))
  }, [])

  return (
    <group>
      {planks.map((plank, i) => (
        <mesh
          key={i}
          position={[0, -0.06, plank.z]}
          rotation={[0, plank.tilt, 0]}
          receiveShadow
        >
          <boxGeometry args={[ROOM.halfWidth * 2, 0.12, PLANK_DEPTH * 0.96]} />
          <meshStandardMaterial color={plank.color} flatShading roughness={0.92} />
        </mesh>
      ))}
    </group>
  )
}

/** Lavagna sulla parete di fondo: mostra il report finale quando è pronto. */
function Whiteboard() {
  const finalReport = usePipelineStore((s) => s.finalReport)
  const running = usePipelineStore((s) => s.running)

  return (
    <group position={[0, 3.05, -ROOM.halfDepth + 0.12]}>
      {/* cornice */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[7.6, 3, 0.14]} />
        <meshStandardMaterial color="#cbb894" flatShading roughness={0.8} />
      </mesh>
      {/* superficie */}
      <mesh position={[0, 0, 0.08]} receiveShadow>
        <boxGeometry args={[7.2, 2.64, 0.04]} />
        <meshStandardMaterial color="#f6f4ef" flatShading roughness={0.95} />
      </mesh>
      {/* vaschetta per i pennarelli */}
      <mesh position={[0, -1.58, 0.12]} castShadow>
        <boxGeometry args={[7.6, 0.12, 0.24]} />
        <meshStandardMaterial color="#b9a37c" flatShading roughness={0.85} />
      </mesh>

      {/* 680px * 0.025 * 0.4 = 6.8 unità di scena di larghezza */}
      <Html transform scale={0.4} position={[0, 0, 0.12]} zIndexRange={[10, 0]}>
        <div className="board">
          <div className="board-title">Report finale</div>
          {finalReport ? (
            <pre className="board-body">{finalReport}</pre>
          ) : (
            <div className="board-empty">
              {running
                ? 'Gli agenti stanno lavorando… il report comparirà qui.'
                : 'La lavagna è vuota: avvia la pipeline per riempirla.'}
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}

/** Piantina low-poly per l'atmosfera. */
function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.19, 0.44, 6]} />
        <meshStandardMaterial color="#9c6b4a" flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <icosahedronGeometry args={[0.46, 0]} />
        <meshStandardMaterial color="#3f7d52" flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0.18, 1.14, -0.1]} castShadow>
        <icosahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#4c9160" flatShading roughness={0.9} />
      </mesh>
    </group>
  )
}

export function Room() {
  return (
    <group>
      <WoodFloor />

      {/* parete di fondo */}
      <mesh position={[0, ROOM.wallHeight / 2, -ROOM.halfDepth]} receiveShadow>
        <boxGeometry args={[ROOM.halfWidth * 2, ROOM.wallHeight, 0.2]} />
        <meshStandardMaterial color={WALL_COLOR} flatShading roughness={0.95} />
      </mesh>
      {/* pareti laterali */}
      <mesh position={[-ROOM.halfWidth, ROOM.wallHeight / 2, 0]} receiveShadow>
        <boxGeometry args={[0.2, ROOM.wallHeight, ROOM.halfDepth * 2]} />
        <meshStandardMaterial color={WALL_TRIM} flatShading roughness={0.95} />
      </mesh>
      <mesh position={[ROOM.halfWidth, ROOM.wallHeight / 2, 0]} receiveShadow>
        <boxGeometry args={[0.2, ROOM.wallHeight, ROOM.halfDepth * 2]} />
        <meshStandardMaterial color={WALL_TRIM} flatShading roughness={0.95} />
      </mesh>
      {/* battiscopa */}
      <mesh position={[0, 0.12, -ROOM.halfDepth + 0.14]}>
        <boxGeometry args={[ROOM.halfWidth * 2, 0.24, 0.1]} />
        <meshStandardMaterial color={WALL_TRIM} flatShading roughness={0.9} />
      </mesh>

      <Whiteboard />

      <Plant position={[-7, 0, -5.6]} />
      <Plant position={[7, 0, -5.6]} />

      {/* tappeto nell'area di riposo */}
      <mesh position={[0, 0.01, 1.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 3.4]} />
        <meshStandardMaterial color="#39405a" flatShading roughness={1} />
      </mesh>
    </group>
  )
}
