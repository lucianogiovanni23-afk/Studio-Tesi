import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { AGENT_BY_KEY, type AgentDefinition } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { AgentKey, AgentStatus } from '../types'
import { WALK_SPEED, WORKSTATIONS } from './layout'
import { ReasoningBubble } from './ReasoningBubble'

type Pose = 'idle' | 'walking' | 'working' | 'waiting' | 'done'

const SKIN = '#f0d7bd'
const DARK = '#2b3242'

/** L'agente resta alla postazione da quando parte il suo turno fino al reset. */
function isAtDesk(status: AgentStatus): boolean {
  return status === 'walking' || status === 'working' || status === 'waiting' || status === 'done' || status === 'error'
}

function poseFor(status: AgentStatus, moving: boolean): Pose {
  if (moving) return 'walking'
  switch (status) {
    case 'working':
      return 'working'
    case 'waiting':
      return 'waiting'
    case 'done':
      return 'done'
    case 'error':
      return 'waiting'
    default:
      return 'idle'
  }
}

interface PathData {
  points: THREE.Vector2[]
  lengths: number[]
  total: number
}

function buildPath(path: [number, number][]): PathData {
  const points = path.map(([x, z]) => new THREE.Vector2(x, z))
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const d = points[i].distanceTo(points[i - 1])
    lengths.push(d)
    total += d
  }
  return { points, lengths, total }
}

function samplePath(path: PathData, t: number, out: THREE.Vector2, dir: THREE.Vector2) {
  let remaining = THREE.MathUtils.clamp(t, 0, 1) * path.total
  for (let i = 0; i < path.lengths.length; i++) {
    const segment = path.lengths[i]
    if (remaining <= segment || i === path.lengths.length - 1) {
      const k = segment === 0 ? 0 : THREE.MathUtils.clamp(remaining / segment, 0, 1)
      out.copy(path.points[i]).lerp(path.points[i + 1], k)
      dir.copy(path.points[i + 1]).sub(path.points[i])
      if (dir.lengthSq() > 0) dir.normalize()
      return
    }
    remaining -= segment
  }
  out.copy(path.points[path.points.length - 1])
  dir.set(0, -1)
}

/** Dettaglio caratterizzante, montato sulla testa o sul busto. */
function Trait({ agent }: { agent: AgentDefinition }) {
  switch (agent.trait) {
    case 'occhiali':
      return (
        <group position={[0, 0.02, 0.24]}>
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.13, 0.11, 0.02]} />
              <meshStandardMaterial color="#1a1f2a" flatShading roughness={0.4} metalness={0.3} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color="#1a1f2a" flatShading />
          </mesh>
        </group>
      )
    case 'cuffie':
      return (
        <group>
          {[-0.26, 0.26].map((x) => (
            <mesh key={x} position={[x, 0.01, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.11, 0.11, 0.07, 8]} />
              <meshStandardMaterial color="#1f2530" flatShading roughness={0.7} />
            </mesh>
          ))}
          <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.26, 0.032, 6, 12, Math.PI]} />
            <meshStandardMaterial color="#1f2530" flatShading roughness={0.7} />
          </mesh>
        </group>
      )
    default:
      return null
  }
}

/** Dettaglio montato sul busto (cravatta, sciarpa, cartellino). */
function BodyTrait({ agent }: { agent: AgentDefinition }) {
  switch (agent.trait) {
    case 'cravatta':
      return (
        <group position={[0, 1.28, 0.23]}>
          <mesh>
            <boxGeometry args={[0.1, 0.1, 0.03]} />
            <meshStandardMaterial color="#8c2f4a" flatShading roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.24, 0]}>
            <boxGeometry args={[0.13, 0.4, 0.03]} />
            <meshStandardMaterial color="#b03c5c" flatShading roughness={0.7} />
          </mesh>
        </group>
      )
    case 'sciarpa':
      return (
        <group position={[0, 1.42, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.15, 0.4]} />
            <meshStandardMaterial color="#c96f86" flatShading roughness={0.9} />
          </mesh>
          <mesh position={[0.14, -0.22, 0.2]} rotation={[0.1, 0, 0.12]} castShadow>
            <boxGeometry args={[0.14, 0.34, 0.05]} />
            <meshStandardMaterial color="#c96f86" flatShading roughness={0.9} />
          </mesh>
        </group>
      )
    case 'cartellino':
      return (
        <group position={[0.18, 1.14, 0.23]}>
          <mesh>
            <boxGeometry args={[0.16, 0.11, 0.02]} />
            <meshStandardMaterial color="#e9edf5" flatShading roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[0.02, 0.08, 0.02]} />
            <meshStandardMaterial color="#8892a5" flatShading />
          </mesh>
        </group>
      )
    default:
      return null
  }
}

export function Worker({ agentKey }: { agentKey: AgentKey }) {
  const agent = AGENT_BY_KEY[agentKey]
  const station = WORKSTATIONS[agentKey]
  const status = useStudioStore((s) => s.agents[agentKey].status)
  const microLabel = useStudioStore((s) => s.agents[agentKey].microLabel)
  const bubbleOpen = useStudioStore((s) => s.openBubbleAgent === agentKey)
  const toggleBubble = useStudioStore((s) => s.toggleBubble)
  const [hovered, setHovered] = useState(false)

  const path = useMemo(() => buildPath(station.path), [station.path])
  const phaseOffset = useMemo(() => station.index * 1.37, [station.index])

  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const shoulderL = useRef<THREE.Group>(null)
  const shoulderR = useRef<THREE.Group>(null)
  const elbowL = useRef<THREE.Group>(null)
  const elbowR = useRef<THREE.Group>(null)
  const hipL = useRef<THREE.Group>(null)
  const hipR = useRef<THREE.Group>(null)
  const kneeL = useRef<THREE.Group>(null)
  const kneeR = useRef<THREE.Group>(null)

  const progress = useRef(0)
  const heading = useRef(0)
  const seated = useRef(0)
  const position = useMemo(() => new THREE.Vector2(), [])
  const direction = useMemo(() => new THREE.Vector2(), [])
  const tmpDir = useMemo(() => new THREE.Vector2(), [])

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1)
    const t = state.clock.elapsedTime + phaseOffset

    // --- spostamento reale lungo il percorso -------------------------------
    const target = isAtDesk(status) ? 1 : 0
    const step = path.total > 0 ? (WALK_SPEED / path.total) * dt : 1
    let moving = false
    if (progress.current < target) {
      progress.current = Math.min(target, progress.current + step)
      moving = true
    } else if (progress.current > target) {
      progress.current = Math.max(target, progress.current - step)
      moving = true
    }

    samplePath(path, progress.current, position, direction)
    if (root.current) {
      root.current.position.x = position.x
      root.current.position.z = position.y
    }

    if (status === 'walking' && progress.current >= 1) {
      useStudioStore.getState().setArrived(agentKey, true)
    }

    const pose = poseFor(status, moving)

    // --- si siede davvero sulla sedia --------------------------------------
    const sitTarget = !moving && (pose === 'working' || pose === 'waiting') ? 1 : 0
    seated.current = THREE.MathUtils.damp(seated.current, sitTarget, 6, dt)
    const sit = seated.current

    // --- orientamento -------------------------------------------------------
    let targetHeading: number
    if (moving) {
      tmpDir.copy(direction)
      if (target === 0) tmpDir.negate()
      targetHeading = Math.atan2(tmpDir.x, tmpDir.y)
    } else if (pose === 'working') {
      targetHeading = Math.PI // rivolto alla scrivania
    } else {
      targetHeading = 0 // rivolto verso di me
    }
    const deltaHeading = ((targetHeading - heading.current + Math.PI) % (Math.PI * 2)) - Math.PI
    heading.current += deltaHeading * Math.min(1, dt * 7)
    if (root.current) root.current.rotation.y = heading.current

    // --- posa ---------------------------------------------------------------
    let shoulderXL = 0
    let shoulderXR = 0
    let shoulderZ = 0.08
    let elbowXL = 0
    let elbowXR = 0
    let hipXL = 0
    let hipXR = 0
    let kneeXL = 0
    let kneeXR = 0
    let headX = 0
    let headY = 0
    let bobY = 0
    let leanX = 0
    let swayZ = 0

    switch (pose) {
      case 'walking': {
        const swing = Math.sin(t * 8.5)
        hipXL = swing * 0.6
        hipXR = -swing * 0.6
        kneeXL = Math.max(0, -swing) * 0.5
        kneeXR = Math.max(0, swing) * 0.5
        shoulderXL = -swing * 0.5
        shoulderXR = swing * 0.5
        elbowXL = -0.25
        elbowXR = -0.25
        bobY = Math.abs(Math.sin(t * 8.5)) * 0.07
        leanX = 0.07
        break
      }
      case 'working': {
        // Mani sulla tastiera, testa chinata verso lo schermo.
        const typing = Math.sin(t * 14)
        shoulderXL = -1.02 + typing * 0.06
        shoulderXR = -1.02 - typing * 0.06
        shoulderZ = 0.2
        elbowXL = -0.45 - typing * 0.12
        elbowXR = -0.45 + typing * 0.12

        // Ogni tanto la destra si sposta sul mouse, a destra e più avanti.
        const onMouse = Math.sin(t * 0.32) > 0.62
        if (onMouse) {
          shoulderXR = -1.16 + Math.sin(t * 1.4) * 0.05
          elbowXR = -0.3
          shoulderZ = 0.2
        }

        headX = 0.36
        headY = onMouse ? 0.12 : Math.sin(t * 0.8) * 0.04
        leanX = 0.2
        break
      }
      case 'waiting': {
        // Seduto ma girato verso di me: si guarda in giro.
        headY = Math.sin(t * 0.8) * 0.8
        headX = Math.sin(t * 0.42) * 0.12
        shoulderXL = -0.2 + Math.sin(t * 1.2) * 0.07
        shoulderXR = -0.2 - Math.sin(t * 1.2) * 0.07
        elbowXL = -0.7
        elbowXR = -0.7
        shoulderZ = 0.16
        swayZ = Math.sin(t * 1.05) * 0.04
        break
      }
      case 'done': {
        // In piedi accanto alla sedia, posa rilassata.
        shoulderXL = -0.12
        shoulderXR = -0.12
        shoulderZ = 0.22
        elbowXL = -0.55
        elbowXR = -0.55
        headX = -0.06
        bobY = Math.sin(t * 1.5) * 0.028
        swayZ = Math.sin(t * 0.7) * 0.035
        break
      }
      default: {
        // idle: respiro leggero nella zona di attesa.
        bobY = Math.sin(t * 1.6) * 0.035
        swayZ = Math.sin(t * 0.8) * 0.03
        shoulderXL = Math.sin(t * 1.6) * 0.06
        shoulderXR = -Math.sin(t * 1.6) * 0.06
        headY = Math.sin(t * 0.5) * 0.2
      }
    }

    // Da seduto: bacino più basso, cosce in avanti, stinchi verso il basso.
    hipXL = THREE.MathUtils.lerp(hipXL, -1.5, sit)
    hipXR = THREE.MathUtils.lerp(hipXR, -1.5, sit)
    kneeXL = THREE.MathUtils.lerp(kneeXL, 1.45, sit)
    kneeXR = THREE.MathUtils.lerp(kneeXR, 1.45, sit)
    bobY -= 0.09 * sit

    const lambda = 9
    const damp = (ref: { current: THREE.Group | null }, axis: 'x' | 'y' | 'z', value: number) => {
      if (!ref.current) return
      ref.current.rotation[axis] = THREE.MathUtils.damp(ref.current.rotation[axis], value, lambda, dt)
    }

    if (body.current) {
      body.current.position.y = THREE.MathUtils.damp(body.current.position.y, bobY, lambda, dt)
      body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, leanX, lambda, dt)
      body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, swayZ, lambda, dt)
    }
    damp(head, 'x', headX)
    damp(head, 'y', headY)
    damp(shoulderL, 'x', shoulderXL)
    damp(shoulderL, 'z', -shoulderZ)
    damp(shoulderR, 'x', shoulderXR)
    damp(shoulderR, 'z', shoulderZ)
    damp(elbowL, 'x', elbowXL)
    damp(elbowR, 'x', elbowXR)
    damp(hipL, 'x', hipXL)
    damp(hipR, 'x', hipXR)
    damp(kneeL, 'x', kneeXL)
    damp(kneeR, 'x', kneeXR)
  })

  const limbColor = agent.color

  return (
    <group ref={root} position={[station.rest[0], 0, station.rest[1]]}>
      <group
        ref={body}
        onClick={(e) => {
          e.stopPropagation()
          toggleBubble(agentKey)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
      >
        {/* busto */}
        <RoundedBox
          args={[0.62, 0.8, 0.44]}
          radius={0.1}
          smoothness={2}
          position={[0, 1.04, 0]}
          castShadow
        >
          <meshStandardMaterial
            color={limbColor}
            flatShading
            roughness={0.75}
            emissive={hovered ? limbColor : '#000000'}
            emissiveIntensity={hovered ? 0.35 : 0}
          />
        </RoundedBox>
        {/* bacino */}
        <mesh position={[0, 0.66, 0]} castShadow>
          <boxGeometry args={[0.56, 0.22, 0.4]} />
          <meshStandardMaterial color={DARK} flatShading roughness={0.9} />
        </mesh>
        {/* colletto */}
        <mesh position={[0, 1.44, 0]} castShadow>
          <boxGeometry args={[0.44, 0.1, 0.36]} />
          <meshStandardMaterial color={DARK} flatShading roughness={0.9} />
        </mesh>

        <BodyTrait agent={agent} />

        {/* testa */}
        <group ref={head} position={[0, 1.72, 0]}>
          <RoundedBox args={[0.48, 0.48, 0.44]} radius={0.12} smoothness={2} castShadow>
            <meshStandardMaterial color={SKIN} flatShading roughness={0.85} />
          </RoundedBox>
          <mesh position={[0, 0.2, -0.02]} castShadow>
            <boxGeometry args={[0.5, 0.15, 0.46]} />
            <meshStandardMaterial color={limbColor} flatShading roughness={0.7} />
          </mesh>
          {[-0.11, 0.11].map((x) => (
            <mesh key={x} position={[x, 0.02, 0.225]}>
              <boxGeometry args={[0.075, 0.075, 0.03]} />
              <meshStandardMaterial color={DARK} />
            </mesh>
          ))}
          <Trait agent={agent} />
        </group>

        {/* braccia: spalla → gomito → mano */}
        {(
          [
            ['L', -0.38, shoulderL, elbowL],
            ['R', 0.38, shoulderR, elbowR],
          ] as const
        ).map(([side, x, shoulderRef, elbowRef]) => (
          <group key={side} ref={shoulderRef} position={[x, 1.36, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <boxGeometry args={[0.16, 0.4, 0.17]} />
              <meshStandardMaterial color={limbColor} flatShading roughness={0.75} />
            </mesh>
            <group ref={elbowRef} position={[0, -0.4, 0]}>
              <mesh position={[0, -0.19, 0]} castShadow>
                <boxGeometry args={[0.14, 0.38, 0.15]} />
                <meshStandardMaterial color={limbColor} flatShading roughness={0.75} />
              </mesh>
              <mesh position={[0, -0.43, 0]} castShadow>
                <boxGeometry args={[0.15, 0.14, 0.17]} />
                <meshStandardMaterial color={SKIN} flatShading roughness={0.85} />
              </mesh>
            </group>
          </group>
        ))}

        {/* gambe: anca → ginocchio → piede */}
        {(
          [
            ['L', -0.16, hipL, kneeL],
            ['R', 0.16, hipR, kneeR],
          ] as const
        ).map(([side, x, hipRef, kneeRef]) => (
          <group key={side} ref={hipRef} position={[x, 0.62, 0]}>
            <mesh position={[0, -0.17, 0]} castShadow>
              <boxGeometry args={[0.2, 0.34, 0.2]} />
              <meshStandardMaterial color={DARK} flatShading roughness={0.9} />
            </mesh>
            <group ref={kneeRef} position={[0, -0.34, 0]}>
              <mesh position={[0, -0.15, 0]} castShadow>
                <boxGeometry args={[0.18, 0.3, 0.18]} />
                <meshStandardMaterial color={DARK} flatShading roughness={0.9} />
              </mesh>
              <mesh position={[0, -0.31, 0.05]} castShadow>
                <boxGeometry args={[0.19, 0.09, 0.28]} />
                <meshStandardMaterial color="#171c26" flatShading roughness={0.8} />
              </mesh>
            </group>
          </group>
        ))}
      </group>

      {/* micro-etichetta di stato: sempre visibile, separata dalla nuvoletta */}
      {microLabel && (
        <Html position={[0, 2.28, 0]} center distanceFactor={8} zIndexRange={[12, 0]}>
          <div className="micro-label" style={{ borderColor: agent.color }}>
            <span className="micro-dot" style={{ background: agent.color }} />
            {microLabel}
          </div>
        </Html>
      )}

      {/* nuvoletta di ragionamento: una sola aperta alla volta */}
      {bubbleOpen && <ReasoningBubble agentKey={agentKey} />}
    </group>
  )
}
