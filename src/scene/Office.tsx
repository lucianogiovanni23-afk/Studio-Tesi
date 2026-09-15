import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useStudioStore } from '../store'
import { AGENT_ORDER } from '../agents/definitions'
import { Worker } from './Worker'
import { WorkstationMesh } from './Workstation'
import { ROOM } from './layout'

const WALL = '#3d4457'
const WALL_SIDE = '#333a4b'
const CEILING = '#2a3040'

/** Pavimento a doghe low-poly, con tonalità alternate. */
function Floor() {
  const planks = useMemo(() => {
    const depth = 1.1
    const count = Math.ceil((ROOM.halfDepth * 2) / depth)
    const tones = ['#8a5a37', '#96633e', '#7e5132', '#8f5d3a', '#87573a']
    return Array.from({ length: count }, (_, i) => ({
      z: -ROOM.halfDepth + depth / 2 + i * depth,
      color: tones[i % tones.length],
      tilt: ((i % 3) - 1) * 0.003,
    }))
  }, [])

  return (
    <group>
      {planks.map((plank, i) => (
        <mesh key={i} position={[0, -0.06, plank.z]} rotation={[0, plank.tilt, 0]} receiveShadow>
          <boxGeometry args={[ROOM.halfWidth * 2, 0.12, 1.05]} />
          <meshStandardMaterial color={plank.color} flatShading roughness={0.92} />
        </mesh>
      ))}
    </group>
  )
}

/** Finestra con telaio, vetro luminoso e traversi. */
function Window({ x }: { x: number }) {
  return (
    <group position={[x, 4.0, -ROOM.halfDepth + 0.14]}>
      <mesh castShadow>
        <boxGeometry args={[2.5, 1.9, 0.14]} />
        <meshStandardMaterial color="#5b6478" flatShading roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <planeGeometry args={[2.24, 1.64]} />
        <meshStandardMaterial
          color="#bcd7ef"
          emissive="#9fc6e8"
          emissiveIntensity={0.85}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0, 0.09]}>
        <boxGeometry args={[0.07, 1.64, 0.03]} />
        <meshStandardMaterial color="#5b6478" flatShading />
      </mesh>
      <mesh position={[0, 0, 0.09]}>
        <boxGeometry args={[2.24, 0.07, 0.03]} />
        <meshStandardMaterial color="#5b6478" flatShading />
      </mesh>
      {/* davanzale */}
      <mesh position={[0, -1.03, 0.1]} castShadow>
        <boxGeometry args={[2.7, 0.12, 0.34]} />
        <meshStandardMaterial color="#6a7387" flatShading roughness={0.8} />
      </mesh>
    </group>
  )
}

/** Plafoniera a soffitto. */
function CeilingLamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, ROOM.wallHeight - 0.25, z]}>
      <mesh castShadow>
        <boxGeometry args={[2.6, 0.16, 0.7]} />
        <meshStandardMaterial color="#4a5265" flatShading roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.09, 0]}>
        <planeGeometry args={[2.4, 0.56]} />
        <meshStandardMaterial
          color="#fdf6e3"
          emissive="#fff3d6"
          emissiveIntensity={1.5}
          side={2}
        />
      </mesh>
      <pointLight position={[0, -0.5, 0]} color="#fff0d2" intensity={14} distance={13} decay={2} />
    </group>
  )
}

/** Lavagna a muro: mostra le fonti approvate o un estratto della bozza scelta. */
function Whiteboard() {
  const selectedSources = useStudioStore((s) => s.selectedSources)
  const approvalStatus = useStudioStore((s) => s.approvalStatus)
  const drafts = useStudioStore((s) => s.drafts)
  const running = useStudioStore((s) => s.running)
  const chosen = drafts.find((d) => d.review?.ok) ?? drafts[0]
  const approved = approvalStatus === 'approved'

  return (
    <group position={[0, 3.1, -ROOM.halfDepth + 0.13]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[8.2, 3.1, 0.14]} />
        <meshStandardMaterial color="#c9b68f" flatShading roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.08]} receiveShadow>
        <boxGeometry args={[7.8, 2.72, 0.04]} />
        <meshStandardMaterial color="#f6f4ef" flatShading roughness={0.95} />
      </mesh>
      <mesh position={[0, -1.62, 0.12]} castShadow>
        <boxGeometry args={[8.2, 0.12, 0.26]} />
        <meshStandardMaterial color="#b9a37c" flatShading roughness={0.85} />
      </mesh>

      <Html transform scale={0.4} position={[0, 0, 0.12]} zIndexRange={[10, 0]}>
        <div className="board">
          {chosen && approved ? (
            <>
              <div className="board-title">Bozza in lavorazione — {chosen.label}</div>
              <p className="board-approach">{chosen.approach}</p>
              <p className="board-body">{chosen.text.slice(0, 900)}…</p>
            </>
          ) : approved && selectedSources.length > 0 ? (
            <>
              <div className="board-title">Fonti approvate ({selectedSources.length})</div>
              <ul className="board-list">
                {selectedSources.slice(0, 7).map((s) => (
                  <li key={s.url}>
                    <strong>{s.title}</strong>
                    <span>{s.url}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="board-empty">
              {running
                ? 'La squadra è al lavoro: qui compariranno le fonti approvate e la bozza.'
                : 'Lavagna vuota. Carica il materiale del corso, scrivi argomento e capitolo, poi avvia la squadra.'}
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.24, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.2, 0.48, 6]} />
        <meshStandardMaterial color="#9c6b4a" flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.84, 0]} castShadow>
        <icosahedronGeometry args={[0.48, 0]} />
        <meshStandardMaterial color="#3f7d52" flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0.2, 1.22, -0.1]} castShadow>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#4c9160" flatShading roughness={0.9} />
      </mesh>
      <mesh position={[-0.22, 1.12, 0.14]} castShadow>
        <icosahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color="#4c9160" flatShading roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Armadietto basso con due sportelli e qualche faldone sopra. */
function Cabinet({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.1, 1.0, 0.7]} />
        <meshStandardMaterial color="#6f7789" flatShading roughness={0.8} />
      </mesh>
      {[-0.76, 0.76].map((x) => (
        <group key={x} position={[x, 0.5, 0.37]}>
          <mesh>
            <boxGeometry args={[1.4, 0.84, 0.04]} />
            <meshStandardMaterial color="#7e879b" flatShading roughness={0.75} />
          </mesh>
          <mesh position={[0.55, 0, 0.04]}>
            <boxGeometry args={[0.2, 0.06, 0.04]} />
            <meshStandardMaterial color="#c3cad8" flatShading metalness={0.4} />
          </mesh>
        </group>
      ))}
      {[
        ['#c96f5a', -0.9],
        ['#5a8bc9', -0.3],
        ['#c9b45a', 0.3],
      ].map(([color, x], i) => (
        <mesh key={i} position={[Number(x), 1.14, 0]} rotation={[0, i * 0.12, 0]} castShadow>
          <boxGeometry args={[0.16, 0.28, 0.44]} />
          <meshStandardMaterial color={String(color)} flatShading roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

export function Office() {
  return (
    <group>
      <Floor />

      {/* parete di fondo con lavagna e due finestre */}
      <mesh position={[0, ROOM.wallHeight / 2, -ROOM.halfDepth]} receiveShadow>
        <boxGeometry args={[ROOM.halfWidth * 2, ROOM.wallHeight, 0.22]} />
        <meshStandardMaterial color={WALL} flatShading roughness={0.95} />
      </mesh>
      {/* pareti laterali */}
      <mesh position={[-ROOM.halfWidth, ROOM.wallHeight / 2, 0]} receiveShadow>
        <boxGeometry args={[0.22, ROOM.wallHeight, ROOM.halfDepth * 2]} />
        <meshStandardMaterial color={WALL_SIDE} flatShading roughness={0.95} />
      </mesh>
      <mesh position={[ROOM.halfWidth, ROOM.wallHeight / 2, 0]} receiveShadow>
        <boxGeometry args={[0.22, ROOM.wallHeight, ROOM.halfDepth * 2]} />
        <meshStandardMaterial color={WALL_SIDE} flatShading roughness={0.95} />
      </mesh>
      {/* soffitto */}
      <mesh position={[0, ROOM.wallHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.halfWidth * 2, ROOM.halfDepth * 2]} />
        <meshStandardMaterial color={CEILING} roughness={1} />
      </mesh>
      {/* battiscopa */}
      <mesh position={[0, 0.13, -ROOM.halfDepth + 0.16]}>
        <boxGeometry args={[ROOM.halfWidth * 2, 0.26, 0.1]} />
        <meshStandardMaterial color="#2b3141" flatShading roughness={0.9} />
      </mesh>

      <Window x={-6.6} />
      <Window x={6.6} />
      <Whiteboard />

      <CeilingLamp x={-5} z={-4} />
      <CeilingLamp x={5} z={-4} />
      <CeilingLamp x={0} z={1.5} />

      <Plant position={[-8.4, 0, -7.2]} />
      <Plant position={[8.4, 0, -7.2]} />
      <Cabinet position={[-8, 0, 2.6]} />

      {/* tappeto della zona di attesa */}
      <mesh position={[0, 0.015, 5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[15, 3.6]} />
        <meshStandardMaterial color="#39405a" roughness={1} />
      </mesh>

      {AGENT_ORDER.map((key) => (
        <WorkstationMesh key={`ws-${key}`} agentKey={key} />
      ))}
      {AGENT_ORDER.map((key) => (
        <Worker key={`worker-${key}`} agentKey={key} />
      ))}
    </group>
  )
}
