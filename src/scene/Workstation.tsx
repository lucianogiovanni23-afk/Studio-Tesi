import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { AGENTE } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { AgentKey } from '../types'
import { POSTAZIONI, SEDIA_Z } from './layout'

const LEGNO = '#5a3922'
const LEGNO_SCURO = '#40281763'
const PELLE = '#1f3b2e'
const OTTONE = '#c9a227'
const PLASTICA = '#d8d2c0'
const METALLO = '#2f3542'

/** Griglia di tasti accennata, disegnata in un solo instancedMesh. */
function Tasti() {
  const posizioni = useMemo(() => {
    const fuori: [number, number][] = []
    for (let riga = 0; riga < 4; riga++) {
      for (let colonna = 0; colonna < 12; colonna++) {
        fuori.push([-0.33 + colonna * 0.06, -0.075 + riga * 0.05])
      }
    }
    return fuori
  }, [])

  return (
    <instancedMesh
      ref={(istanza) => {
        if (!istanza) return
        const matrice = new THREE.Matrix4()
        posizioni.forEach(([x, z], i) => {
          matrice.makeTranslation(x, 0, z)
          istanza.setMatrixAt(i, matrice)
        })
        istanza.instanceMatrix.needsUpdate = true
      }}
      args={[undefined, undefined, posizioni.length]}
      position={[0, 0.026, 0]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.045, 0.012, 0.038]} />
      <meshStandardMaterial color="#b9b2a0" flatShading roughness={0.8} />
    </instancedMesh>
  )
}

/** Poltrona direzionale in pelle con base a cinque razze. */
function Poltrona() {
  const razze = useMemo(() => Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2), [])

  return (
    <group>
      {razze.map((angolo, i) => (
        <group key={i} rotation={[0, angolo, 0]}>
          <mesh position={[0, 0.07, 0.24]} castShadow>
            <boxGeometry args={[0.07, 0.05, 0.48]} />
            <meshStandardMaterial color={METALLO} flatShading roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.035, 0.46]}>
            <cylinderGeometry args={[0.045, 0.045, 0.07, 6]} />
            <meshStandardMaterial color="#14181f" flatShading />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.07, 0.42, 8]} />
        <meshStandardMaterial color={OTTONE} flatShading metalness={0.6} roughness={0.4} />
      </mesh>
      {/* seduta e schienale alto, in pelle */}
      <mesh position={[0, 0.54, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.58, 0.12, 0.54]} />
        <meshStandardMaterial color={PELLE} flatShading roughness={0.75} />
      </mesh>
      <group position={[0, 0.6, 0.26]} rotation={[0.15, 0, 0]}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.56, 0.82, 0.11]} />
          <meshStandardMaterial color={PELLE} flatShading roughness={0.75} />
        </mesh>
      </group>
      {[-0.33, 0.33].map((x) => (
        <mesh key={x} position={[x, 0.72, 0.04]} castShadow>
          <boxGeometry args={[0.07, 0.06, 0.42]} />
          <meshStandardMaterial color="#14181f" flatShading />
        </mesh>
      ))}
    </group>
  )
}

/** Lampada da banchiere con paralume verde. */
function LampadaBanchiere({ acceso }: { acceso: boolean }) {
  const luce = useRef<THREE.PointLight>(null)
  const paralume = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((_, deltaGrezzo) => {
    const dt = Math.min(deltaGrezzo, 0.1)
    if (luce.current) {
      luce.current.intensity = THREE.MathUtils.damp(luce.current.intensity, acceso ? 2.4 : 0.35, 5, dt)
    }
    if (paralume.current) {
      paralume.current.emissiveIntensity = THREE.MathUtils.damp(
        paralume.current.emissiveIntensity,
        acceso ? 0.9 : 0.12,
        5,
        dt,
      )
    }
  })

  return (
    <group>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.04, 10]} />
        <meshStandardMaterial color={OTTONE} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.28, 6]} />
        <meshStandardMaterial color={OTTONE} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.32, 0]} rotation={[Math.PI, 0, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.05, 0.12, 12, 1, true]} />
        <meshStandardMaterial
          ref={paralume}
          color="#1f5e3a"
          emissive="#3fbf72"
          emissiveIntensity={0.12}
          side={THREE.DoubleSide}
          roughness={0.6}
        />
      </mesh>
      <pointLight ref={luce} position={[0, 0.26, 0]} color="#ffd9a0" intensity={0.35} distance={2.6} decay={2} />
    </group>
  )
}

/** Telefono fisso con filo a spirale. */
function Telefono() {
  const spirale = useMemo(() => {
    const punti: THREE.Vector3[] = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      punti.push(new THREE.Vector3(Math.sin(t * Math.PI * 6) * 0.03, -t * 0.14, 0.12 + t * 0.16))
    }
    return new THREE.CatmullRomCurve3(punti)
  }, [])

  return (
    <group>
      <mesh position={[0, 0.03, 0]} castShadow>
        <boxGeometry args={[0.28, 0.06, 0.22]} />
        <meshStandardMaterial color="#1b1f28" flatShading roughness={0.7} />
      </mesh>
      {/* cornetta */}
      <mesh position={[0, 0.09, -0.02]} castShadow>
        <boxGeometry args={[0.3, 0.06, 0.09]} />
        <meshStandardMaterial color="#12161d" flatShading roughness={0.6} />
      </mesh>
      <mesh>
        <tubeGeometry args={[spirale, 24, 0.012, 5, false]} />
        <meshStandardMaterial color="#12161d" roughness={0.8} />
      </mesh>
    </group>
  )
}

export function Workstation({ agentKey }: { agentKey: AgentKey }) {
  const agente = AGENTE[agentKey]
  const postazione = POSTAZIONI[agentKey]
  const stato = useStudioStore((s) => s.agenti[agentKey].status)

  const schermo = useRef<THREE.MeshStandardMaterial>(null)
  const luce = useRef<THREE.PointLight>(null)

  const alLavoro = stato === 'working'
  const coloreLuce = stato === 'error' ? '#c02b3a' : agente.colore

  useFrame((state, deltaGrezzo) => {
    const dt = Math.min(deltaGrezzo, 0.1)
    const t = state.clock.elapsedTime

    // Il CRT si illumina del colore dell'agente solo quando lavora.
    let obiettivo = 0.03
    if (alLavoro) obiettivo = 1.15 + Math.sin(t * 5.5) * 0.2
    else if (stato === 'waiting') obiettivo = 0.7
    else if (stato === 'walking') obiettivo = 0.25
    else if (stato === 'done') obiettivo = 0.4
    else if (stato === 'error') obiettivo = 0.3 + Math.abs(Math.sin(t * 3)) * 0.5

    if (schermo.current) {
      schermo.current.emissiveIntensity = THREE.MathUtils.damp(
        schermo.current.emissiveIntensity,
        obiettivo,
        6,
        dt,
      )
    }
    if (luce.current) {
      const obiettivoLuce = alLavoro || stato === 'waiting' || stato === 'error' ? obiettivo * 3.6 : 0
      luce.current.intensity = THREE.MathUtils.damp(luce.current.intensity, obiettivoLuce, 5, dt)
    }
  })

  const [x, z] = postazione.scrivania

  return (
    <group position={[x, 0, z]}>
      {/* --- scrivania massiccia con piano in pelle --- */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.1, 1.2]} />
        <meshStandardMaterial color={LEGNO} flatShading roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.775, 0]} receiveShadow>
        <boxGeometry args={[2.0, 0.012, 0.92]} />
        <meshStandardMaterial color={PELLE} roughness={0.9} />
      </mesh>
      {/* fianchi pieni, da scrivania direzionale */}
      {[-1.08, 1.08].map((fx) => (
        <mesh key={fx} position={[fx, 0.35, 0]} castShadow>
          <boxGeometry args={[0.2, 0.7, 1.1]} />
          <meshStandardMaterial color={LEGNO} flatShading roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 0.5, -0.52]}>
        <boxGeometry args={[2.0, 0.42, 0.06]} />
        <meshStandardMaterial color={LEGNO_SCURO} flatShading roughness={0.85} />
      </mesh>

      {/* --- monitor CRT color panna --- */}
      <group position={[0, 0.78, -0.32]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[1.0, 0.6, 0.72]} />
          <meshStandardMaterial color={PLASTICA} flatShading roughness={0.75} />
        </mesh>
        {/* cornice e schermo a fosfori, rivolti verso la sedia */}
        <mesh position={[0, 0.32, 0.37]}>
          <boxGeometry args={[0.86, 0.5, 0.04]} />
          <meshStandardMaterial color="#c2bba8" flatShading roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.32, 0.4]}>
          <planeGeometry args={[0.72, 0.4]} />
          <meshStandardMaterial
            ref={schermo}
            color="#0a0f14"
            emissive={coloreLuce}
            emissiveIntensity={0.03}
            roughness={0.35}
          />
        </mesh>
        {/* piedistallo */}
        <mesh position={[0, -0.02, 0]}>
          <boxGeometry args={[0.6, 0.05, 0.5]} />
          <meshStandardMaterial color={PLASTICA} flatShading roughness={0.8} />
        </mesh>
      </group>

      {/* --- tastiera e mouse --- */}
      <group position={[0, 0.79, 0.16]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.84, 0.04, 0.3]} />
          <meshStandardMaterial color={PLASTICA} flatShading roughness={0.8} />
        </mesh>
        <Tasti />
      </group>
      <mesh position={[0.72, 0.787, 0.18]} receiveShadow>
        <boxGeometry args={[0.34, 0.008, 0.26]} />
        <meshStandardMaterial color="#1d2a22" roughness={0.95} />
      </mesh>
      <mesh position={[0.72, 0.812, 0.16]} castShadow>
        <boxGeometry args={[0.1, 0.04, 0.15]} />
        <meshStandardMaterial color={PLASTICA} flatShading roughness={0.7} />
      </mesh>

      {/* --- telefono, tazza, fogli, portapenne --- */}
      <group position={[-0.82, 0.78, 0.2]}>
        <Telefono />
      </group>
      <group position={[0.42, 0.78, 0.36]}>
        <mesh position={[0, 0.07, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.065, 0.14, 10]} />
          <meshStandardMaterial color="#e8e2d2" flatShading roughness={0.7} />
        </mesh>
      </group>
      <mesh position={[-0.5, 0.8, -0.18]} rotation={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.32, 0.05, 0.42]} />
        <meshStandardMaterial color="#efe7d4" flatShading roughness={0.95} />
      </mesh>
      <group position={[0.92, 0.78, -0.3]}>
        <mesh position={[0, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.065, 0.16, 8]} />
          <meshStandardMaterial color={OTTONE} metalness={0.6} roughness={0.4} />
        </mesh>
      </group>

      {/* --- lampada da banchiere --- */}
      <group position={[-0.88, 0.78, -0.3]}>
        <LampadaBanchiere acceso={alLavoro || stato === 'waiting'} />
      </group>

      {/* --- targhetta in ottone --- */}
      <group position={[0.62, 0.79, 0.48]} rotation={[-0.32, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.92, 0.24, 0.02]} />
          <meshStandardMaterial color={OTTONE} metalness={0.75} roughness={0.32} />
        </mesh>
        {/* 150px * 0.025 * 0.24 = 0,9 unità di larghezza */}
        <Html transform occlude scale={0.24} position={[0, 0, 0.013]} zIndexRange={[8, 0]}>
          <div className="targhetta">
            <strong>{agente.nome}</strong>
            <span>{agente.ruolo}</span>
          </div>
        </Html>
      </group>

      {/* --- luce di postazione nel colore dell'agente --- */}
      <pointLight
        ref={luce}
        position={[0, 1.7, 0.2]}
        color={coloreLuce}
        intensity={0}
        distance={6}
        decay={2}
      />

      {/* --- poltrona --- */}
      <group position={[0, 0, SEDIA_Z]}>
        <Poltrona />
      </group>
    </group>
  )
}
