import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type * as THREE from 'three'
import { AGENTE } from '../agents/agenti'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { useStudio } from '../store'
import type { AgentKey, Schermata } from '../types'
import { COLORI, POSTAZIONI } from './layout'
import { useQualita } from './qualita'
import { ReasoningBubble } from './ReasoningBubble'

const SCHERMATA_POSTAZIONE: Record<AgentKey, Schermata> = {
  bibliotecario: 'ricerca',
  lettore: 'corso',
  scrittore: 'scrittura',
  revisore: 'revisione',
}

const COLORE_STATO_AGENTE = {
  riposo: '#c8c2b0',
  lavoro: '#c9a43a',
  attesa: '#4f8fbf',
  fatto: '#6b8a2e',
  errore: '#c0473a',
}

/** Oggetti sulla scrivania, diversi per ogni agente. */
function Arredi({ k }: { k: AgentKey }) {
  const fileCorso = useStudio((s) => s.progetto.courseFiles.length)
  if (k === 'scrittore') {
    return (
      <group position={[0, 0.78, 0.05]}>
        <mesh position={[0, 0.01, 0.12]}>
          <boxGeometry args={[0.6, 0.02, 0.4]} />
          <meshStandardMaterial color="#d6d8dc" metalness={0.4} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.2, -0.08]} rotation={[-0.25, 0, 0]}>
          <boxGeometry args={[0.6, 0.38, 0.02]} />
          <meshStandardMaterial color="#2f3640" roughness={0.3} emissive="#e8f1f8" emissiveIntensity={0.25} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0.55, 0.005 + i * 0.006, 0.1]} rotation={[0, 0.1 * i, 0]}>
            <boxGeometry args={[0.32, 0.004, 0.42]} />
            <meshStandardMaterial color={COLORI.bianco} />
          </mesh>
        ))}
      </group>
    )
  }
  if (k === 'lettore') {
    const quanti = Math.min(12, fileCorso)
    return (
      <group position={[0, 0.78, 0.05]}>
        {Array.from({ length: Math.max(1, quanti) }, (_, i) => (
          <mesh key={i} position={[-0.35, 0.03 + i * 0.055, 0]} rotation={[0, (i % 3) * 0.08, 0]}>
            <boxGeometry args={[0.42, 0.05, 0.32]} />
            <meshStandardMaterial
              color={quanti === 0 ? '#e9e3d3' : i % 2 ? COLORI.oliva : COLORI.olivaChiaro}
              transparent={quanti === 0}
              opacity={quanti === 0 ? 0.5 : 1}
            />
          </mesh>
        ))}
        {/* leggio con un libro aperto */}
        <mesh position={[0.3, 0.12, 0]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.5, 0.02, 0.34]} />
          <meshStandardMaterial color={COLORI.crema} />
        </mesh>
      </group>
    )
  }
  if (k === 'revisore') {
    return (
      <group position={[0, 0.78, 0.05]}>
        <mesh position={[0.45, 0.02, -0.1]}>
          <cylinderGeometry args={[0.1, 0.12, 0.04, 16]} />
          <meshStandardMaterial color="#3a3f47" />
        </mesh>
        <mesh position={[0.45, 0.25, -0.1]} rotation={[0, 0, -0.2]}>
          <cylinderGeometry args={[0.015, 0.015, 0.45, 8]} />
          <meshStandardMaterial color="#3a3f47" />
        </mesh>
        <mesh position={[0.38, 0.47, -0.02]} rotation={[0.6, 0, 0]}>
          <coneGeometry args={[0.1, 0.14, 16, 1, true]} />
          <meshStandardMaterial color="#3a3f47" emissive="#ffe7b0" emissiveIntensity={0.35} side={2} />
        </mesh>
        <mesh position={[-0.1, 0.005, 0.12]}>
          <boxGeometry args={[0.36, 0.006, 0.48]} />
          <meshStandardMaterial color={COLORI.bianco} />
        </mesh>
      </group>
    )
  }
  return (
    <group position={[0, 0.78, 0.05]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.3 + i * 0.09, 0.15, -0.1]}>
          <boxGeometry args={[0.07, 0.3, 0.24]} />
          <meshStandardMaterial color={['#4f8fbf', '#c9a43a', '#7d8f3a', '#a4553a'][i]} />
        </mesh>
      ))}
      <mesh position={[0.35, 0.005, 0.1]}>
        <boxGeometry args={[0.4, 0.008, 0.3]} />
        <meshStandardMaterial color={COLORI.bianco} />
      </mesh>
    </group>
  )
}

/** Postazione di un agente: scrivania, figura stilizzata, etichetta e nuvoletta. */
export function Agente3D({ k }: { k: AgentKey }) {
  const definizione = AGENTE[k]
  const runtime = useStudio((s) => s.agenti[k])
  const nuvoletta = useStudio((s) => s.nuvoletta)
  const apri = useStudio((s) => s.apriNuvoletta)
  const vai = useStudio((s) => s.vai)
  const completa = useQualita() === 'completa'
  const fermo = useMovimentoRidotto()
  const [sopra, setSopra] = useState(false)

  const corpo = useRef<THREE.Group>(null)
  const alone = useRef<THREE.Mesh>(null)
  const [x, z] = POSTAZIONI[k].scrivania

  useFrame((stato, delta) => {
    if (fermo) return
    const t = stato.clock.elapsedTime
    const lavora = runtime.status === 'lavoro'
    if (corpo.current) {
      corpo.current.position.y = lavora ? Math.abs(Math.sin(t * 3.2)) * 0.05 : Math.sin(t * 1.2 + x) * 0.012
      corpo.current.rotation.y = lavora ? Math.sin(t * 1.6) * 0.18 : 0
    }
    if (alone.current) {
      alone.current.rotation.z += delta * (lavora ? 2.4 : 0.4)
      const s = runtime.status === 'attesa' ? 1 + Math.sin(t * 3) * 0.08 : 1
      alone.current.scale.setScalar(s)
    }
  })

  const mostraAlone = runtime.status !== 'riposo'
  const coloreAlone = COLORE_STATO_AGENTE[runtime.status]
  const etichetta =
    runtime.etichetta ||
    (runtime.status === 'riposo' ? (definizione.fase > 1 ? `operativo dalla fase ${definizione.fase}` : 'pronto') : '')

  const cursore = (attivo: boolean) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    setSopra(attivo)
    document.body.style.cursor = attivo ? 'pointer' : ''
  }

  return (
    <group position={[x, 0, z]}>
      {/* scrivania: piano bianco e gambe in rovere */}
      <group
        onClick={(e) => {
          e.stopPropagation()
          vai(SCHERMATA_POSTAZIONE[k])
        }}
        onPointerOver={cursore(true)}
        onPointerOut={cursore(false)}
      >
        <mesh position={[0, 0.76, 0]} castShadow={completa} receiveShadow>
          <boxGeometry args={[1.8, 0.05, 0.85]} />
          <meshStandardMaterial color={COLORI.bianco} roughness={0.45} />
        </mesh>
        {[-0.82, 0.82].map((dx) => (
          <mesh key={dx} position={[dx, 0.37, 0]}>
            <boxGeometry args={[0.05, 0.74, 0.75]} />
            <meshStandardMaterial color={COLORI.rovereScuro} roughness={0.6} />
          </mesh>
        ))}
        <Arredi k={k} />
      </group>

      {/* figura stilizzata, dietro la scrivania e rivolta verso la telecamera */}
      <group
        position={[0, 0, -0.75]}
        onClick={(e) => {
          e.stopPropagation()
          apri(nuvoletta === k ? null : k)
        }}
        onPointerOver={cursore(true)}
        onPointerOut={cursore(false)}
      >
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.26, 0.3, 0.5, 20]} />
          <meshStandardMaterial color={COLORI.crema} roughness={0.7} />
        </mesh>
        <group ref={corpo}>
          <mesh position={[0, 1.02, 0]} castShadow={completa}>
            <capsuleGeometry args={[0.26, 0.55, 8, 16]} />
            <meshStandardMaterial color={definizione.colore} roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.22, 0.05, 10, 24]} />
            <meshStandardMaterial color={COLORI.crema} roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.66, 0]} castShadow={completa}>
            <sphereGeometry args={[0.21, 24, 16]} />
            <meshStandardMaterial color="#efe2c9" roughness={0.6} />
          </mesh>
          {mostraAlone && (
            <mesh ref={alone} position={[0, 2.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.24, 0.025, 8, 32, runtime.status === 'lavoro' ? Math.PI * 1.4 : Math.PI * 2]} />
              <meshStandardMaterial color={coloreAlone} emissive={coloreAlone} emissiveIntensity={0.5} />
            </mesh>
          )}
        </group>
      </group>

      <Html position={[0, 2.5, -0.75]} center distanceFactor={9} zIndexRange={[30, 10]}>
        <button
          type="button"
          className={`etichetta-scena etichetta-agente stato-${runtime.status} ${sopra ? 'etichetta-sopra' : ''}`}
          onClick={() => apri(nuvoletta === k ? null : k)}
          style={{ borderColor: definizione.colore }}
        >
          <strong>
            <span className="punto" style={{ background: definizione.colore }} />
            {definizione.nome}
          </strong>
          {etichetta && <span>{etichetta}</span>}
        </button>
      </Html>

      {nuvoletta === k && <ReasoningBubble agentKey={k} />}
    </group>
  )
}
