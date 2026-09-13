import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { AGENT_BY_ID, type AgentId } from '../agents'
import { usePipelineStore, type AgentPhase } from '../store'
import { LAYOUT, WALK_SPEED } from './layout'

/** Stati animati del personaggio (indipendenti dalla fase logica della pipeline). */
type Pose = 'idle' | 'walking' | 'working' | 'waiting' | 'done'

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: 'in pausa',
  waiting: 'aspetta il turno',
  walking: 'sta arrivando…',
  working: 'sta lavorando…',
  done: 'fatto ✓',
  error: 'errore ⚠',
}

/** Il personaggio va alla scrivania appena parte il suo turno e ci resta fino al reset. */
function isAtDesk(phase: AgentPhase): boolean {
  return phase === 'walking' || phase === 'working' || phase === 'done' || phase === 'error'
}

const tmpDir = new THREE.Vector2()

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

/** Posizione e direzione lungo il percorso, con t normalizzato sulla lunghezza totale. */
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
  dir.set(0, 1)
}

export function Character({ id }: { id: AgentId }) {
  const agent = AGENT_BY_ID[id]
  const layout = LAYOUT[id]
  const phase = usePipelineStore((s) => s.agents[id].phase)

  const path = useMemo(() => buildPath(layout.path), [layout.path])
  const offset = useMemo(() => layout.index * 1.37, [layout.index])

  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)

  const progress = useRef(0)
  const heading = useRef(0)
  const position = useMemo(() => new THREE.Vector2(), [])
  const direction = useMemo(() => new THREE.Vector2(), [])

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1)
    const t = state.clock.elapsedTime + offset

    // --- spostamento lungo il percorso -------------------------------------
    const target = isAtDesk(phase) ? 1 : 0
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

    // Arrivato a destinazione: la pipeline può far partire la chiamata API.
    if (phase === 'walking' && progress.current >= 1) {
      usePipelineStore.getState().setArrived(id, true)
    }

    // --- orientamento -------------------------------------------------------
    let targetHeading = 0 // a riposo e alla scrivania guarda verso la camera
    if (moving) {
      tmpDir.copy(direction)
      if (target === 0) tmpDir.negate() // torna indietro sullo stesso percorso
      targetHeading = Math.atan2(tmpDir.x, tmpDir.y)
    }
    // Percorso più corto sul cerchio, così non fa mezzo giro su se stesso.
    const delta = ((targetHeading - heading.current + Math.PI) % (Math.PI * 2)) - Math.PI
    heading.current += delta * Math.min(1, dt * 9)
    if (root.current) root.current.rotation.y = heading.current

    // --- posa ---------------------------------------------------------------
    let pose: Pose
    if (moving) pose = 'walking'
    else if (phase === 'working') pose = 'working'
    else if (phase === 'done') pose = 'done'
    else if (phase === 'waiting' || phase === 'walking' || phase === 'error') pose = 'waiting'
    else pose = 'idle'

    let armXL = 0
    let armXR = 0
    let armZ = 0.07
    let legXL = 0
    let legXR = 0
    let headX = 0
    let headY = 0
    let bobY = 0
    let leanX = 0
    let swayZ = 0

    switch (pose) {
      case 'walking': {
        const swing = Math.sin(t * 9)
        legXL = swing * 0.62
        legXR = -swing * 0.62
        armXL = -swing * 0.55
        armXR = swing * 0.55
        bobY = Math.abs(Math.sin(t * 9)) * 0.07
        leanX = 0.07
        break
      }
      case 'working': {
        const typing = Math.sin(t * 13)
        armXL = -1.25 + typing * 0.24
        armXR = -1.25 - typing * 0.24
        armZ = 0.3
        headX = 0.34
        leanX = 0.15
        bobY = -0.05 + Math.sin(t * 2.2) * 0.012
        break
      }
      case 'waiting': {
        headY = Math.sin(t * 0.9) * 0.75
        headX = Math.sin(t * 0.45) * 0.1
        swayZ = Math.sin(t * 1.1) * 0.05
        bobY = Math.sin(t * 1.7) * 0.025
        armXL = Math.sin(t * 1.3) * 0.1
        armXR = -Math.sin(t * 1.3) * 0.1
        break
      }
      case 'done': {
        armXL = -2.5
        armXR = -2.5
        armZ = 0.75
        headX = -0.12
        bobY = Math.abs(Math.sin(t * 3.1)) * 0.09
        break
      }
      default: {
        // idle: respiro e leggera oscillazione
        bobY = Math.sin(t * 1.6) * 0.035
        swayZ = Math.sin(t * 0.8) * 0.03
        armXL = Math.sin(t * 1.6) * 0.06
        armXR = -Math.sin(t * 1.6) * 0.06
        headY = Math.sin(t * 0.5) * 0.18
      }
    }

    const lambda = 9
    if (body.current) {
      body.current.position.y = THREE.MathUtils.damp(body.current.position.y, bobY, lambda, dt)
      body.current.rotation.x = THREE.MathUtils.damp(body.current.rotation.x, leanX, lambda, dt)
      body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, swayZ, lambda, dt)
    }
    if (head.current) {
      head.current.rotation.x = THREE.MathUtils.damp(head.current.rotation.x, headX, lambda, dt)
      head.current.rotation.y = THREE.MathUtils.damp(head.current.rotation.y, headY, lambda, dt)
    }
    if (armL.current) {
      armL.current.rotation.x = THREE.MathUtils.damp(armL.current.rotation.x, armXL, lambda, dt)
      armL.current.rotation.z = THREE.MathUtils.damp(armL.current.rotation.z, -armZ, lambda, dt)
    }
    if (armR.current) {
      armR.current.rotation.x = THREE.MathUtils.damp(armR.current.rotation.x, armXR, lambda, dt)
      armR.current.rotation.z = THREE.MathUtils.damp(armR.current.rotation.z, armZ, lambda, dt)
    }
    if (legL.current) {
      legL.current.rotation.x = THREE.MathUtils.damp(legL.current.rotation.x, legXL, lambda, dt)
    }
    if (legR.current) {
      legR.current.rotation.x = THREE.MathUtils.damp(legR.current.rotation.x, legXR, lambda, dt)
    }
  })

  const skin = '#f0d7bd'
  const dark = '#2b3242'

  return (
    <group ref={root}>
      <group ref={body}>
        {/* busto */}
        <RoundedBox args={[0.62, 0.82, 0.44]} radius={0.1} smoothness={2} position={[0, 1.06, 0]} castShadow>
          <meshStandardMaterial color={agent.color} flatShading roughness={0.75} metalness={0.05} />
        </RoundedBox>
        {/* colletto */}
        <mesh position={[0, 1.44, 0]} castShadow>
          <boxGeometry args={[0.46, 0.1, 0.36]} />
          <meshStandardMaterial color={dark} flatShading roughness={0.9} />
        </mesh>

        {/* testa cubica smussata */}
        <group ref={head} position={[0, 1.74, 0]}>
          <RoundedBox args={[0.5, 0.5, 0.46]} radius={0.13} smoothness={2} castShadow>
            <meshStandardMaterial color={skin} flatShading roughness={0.85} />
          </RoundedBox>
          {/* capelli / cappuccio nel colore dell'agente */}
          <mesh position={[0, 0.2, -0.02]} castShadow>
            <boxGeometry args={[0.52, 0.16, 0.48]} />
            <meshStandardMaterial color={agent.color} flatShading roughness={0.7} />
          </mesh>
          {/* occhi */}
          <mesh position={[-0.12, 0.02, 0.235]}>
            <boxGeometry args={[0.08, 0.08, 0.03]} />
            <meshStandardMaterial color={dark} />
          </mesh>
          <mesh position={[0.12, 0.02, 0.235]}>
            <boxGeometry args={[0.08, 0.08, 0.03]} />
            <meshStandardMaterial color={dark} />
          </mesh>
        </group>

        {/* braccia: il gruppo è la spalla, la mesh scende verso il basso */}
        <group ref={armL} position={[-0.38, 1.36, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <boxGeometry args={[0.16, 0.6, 0.18]} />
            <meshStandardMaterial color={agent.color} flatShading roughness={0.75} />
          </mesh>
          <mesh position={[0, -0.63, 0]} castShadow>
            <boxGeometry args={[0.17, 0.14, 0.19]} />
            <meshStandardMaterial color={skin} flatShading roughness={0.85} />
          </mesh>
        </group>
        <group ref={armR} position={[0.38, 1.36, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <boxGeometry args={[0.16, 0.6, 0.18]} />
            <meshStandardMaterial color={agent.color} flatShading roughness={0.75} />
          </mesh>
          <mesh position={[0, -0.63, 0]} castShadow>
            <boxGeometry args={[0.17, 0.14, 0.19]} />
            <meshStandardMaterial color={skin} flatShading roughness={0.85} />
          </mesh>
        </group>

        {/* gambe: il gruppo è l'anca */}
        <group ref={legL} position={[-0.16, 0.66, 0]}>
          <mesh position={[0, -0.33, 0]} castShadow>
            <boxGeometry args={[0.2, 0.66, 0.2]} />
            <meshStandardMaterial color={dark} flatShading roughness={0.9} />
          </mesh>
        </group>
        <group ref={legR} position={[0.16, 0.66, 0]}>
          <mesh position={[0, -0.33, 0]} castShadow>
            <boxGeometry args={[0.2, 0.66, 0.2]} />
            <meshStandardMaterial color={dark} flatShading roughness={0.9} />
          </mesh>
        </group>
      </group>

      {/* nuvoletta 2D ancorata sopra la testa */}
      <Html position={[0, 2.55, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
        <div className="bubble" style={{ borderColor: agent.color }}>
          <strong style={{ color: agent.color }}>{agent.shortName}</strong>
          <span>{PHASE_LABEL[phase]}</span>
        </div>
      </Html>
    </group>
  )
}
