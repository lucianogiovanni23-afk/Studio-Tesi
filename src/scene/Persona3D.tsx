import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Persona } from '../agents/agenti'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { useStudio } from '../store'

/**
 * Una persona seduta alla scrivania, in abito e cravatta, rivolta verso la
 * telecamera. Geometrie semplici, proporzioni realistiche: respira, si guarda
 * intorno, scrive al portatile quando lavora e parla quando la scegli.
 */

function scurisci(colore: string, quanto: number): string {
  return `#${new THREE.Color(colore).multiplyScalar(1 - quanto).getHexString()}`
}

function Capelli({ a }: { a: Persona['aspetto'] }) {
  const mat = <meshStandardMaterial color={a.capelli} roughness={0.85} />
  return (
    <group>
      {/* calotta */}
      <mesh position={[0, 0.018, -0.006]} scale={[1, 1, 1.02]}>
        <sphereGeometry args={[0.122, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.34]} />
        {mat}
      </mesh>
      {/* nuca */}
      <mesh position={[0, -0.01, -0.03]} scale={[1, 1.05, 0.95]}>
        <sphereGeometry args={[0.12, 24, 16, Math.PI * 1.08, Math.PI * 0.84, Math.PI * 0.15, Math.PI * 0.52]} />
        {mat}
      </mesh>
      {a.taglio === 'caschetto' && (
        <mesh position={[0, -0.06, -0.012]}>
          <cylinderGeometry args={[0.128, 0.138, 0.16, 28, 1, true, Math.PI * 0.42, Math.PI * 1.16]} />
          <meshStandardMaterial color={a.capelli} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
      {a.taglio === 'raccolti' && (
        <mesh position={[0, 0.03, -0.13]}>
          <sphereGeometry args={[0.048, 16, 12]} />
          {mat}
        </mesh>
      )}
      {a.taglio === 'ricci' &&
        [-0.07, -0.025, 0.025, 0.07].map((x) => (
          <mesh key={x} position={[x, 0.1, 0.035]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            {mat}
          </mesh>
        ))}
      {a.barba && (
        <mesh position={[0, -0.075, 0.045]} scale={[1, 0.62, 0.8]}>
          <sphereGeometry args={[0.085, 20, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55]} />
          <meshStandardMaterial color={a.capelli} roughness={0.95} />
        </mesh>
      )}
    </group>
  )
}

function Testa({ a, bocca }: { a: Persona['aspetto']; bocca: React.RefObject<THREE.Mesh> }) {
  const scuro = '#2a211c'
  return (
    <group>
      <mesh castShadow scale={[0.92, 1.08, 0.98]}>
        <sphereGeometry args={[0.115, 32, 24]} />
        <meshStandardMaterial color={a.pelle} roughness={0.62} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.106, -0.005, -0.005]} scale={[0.5, 1, 0.8]}>
          <sphereGeometry args={[0.026, 12, 10]} />
          <meshStandardMaterial color={a.pelle} roughness={0.7} />
        </mesh>
      ))}
      {/* occhi, sopracciglia, naso, bocca */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.038, 0.02, 0.1]}>
            <sphereGeometry args={[0.0125, 12, 10]} />
            <meshStandardMaterial color={scuro} roughness={0.3} />
          </mesh>
          <mesh position={[s * 0.04, 0.045, 0.103]} rotation={[0, 0, s * -0.12]}>
            <boxGeometry args={[0.038, 0.008, 0.006]} />
            <meshStandardMaterial color={a.capelli} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.006, 0.115]} scale={[0.7, 1, 1]}>
        <sphereGeometry args={[0.017, 12, 10]} />
        <meshStandardMaterial color={scurisci(a.pelle, 0.06)} roughness={0.6} />
      </mesh>
      <mesh ref={bocca} position={[0, -0.05, 0.102]}>
        <boxGeometry args={[0.04, 0.008, 0.008]} />
        <meshStandardMaterial color="#8d4a45" roughness={0.6} />
      </mesh>
      {a.occhiali && (
        <group position={[0, 0.02, 0.112]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.038, 0, 0]}>
              <torusGeometry args={[0.024, 0.0035, 8, 24]} />
              <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.4} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.03, 0.004, 0.004]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        </group>
      )}
      <Capelli a={a} />
    </group>
  )
}

function Braccio({ lato, abito, pelle, avambraccio }: { lato: 1 | -1; abito: string; pelle: string; avambraccio: React.RefObject<THREE.Group> }) {
  return (
    <group>
      <mesh position={[lato * 0.205, 1.075, -0.01]} scale={[1, 0.85, 0.8]} castShadow>
        <sphereGeometry args={[0.075, 16, 12]} />
        <meshStandardMaterial color={abito} roughness={0.75} />
      </mesh>
      <mesh position={[lato * 0.23, 0.94, 0.02]} rotation={[-0.22, 0, lato * 0.06]} castShadow>
        <capsuleGeometry args={[0.052, 0.2, 6, 12]} />
        <meshStandardMaterial color={abito} roughness={0.75} />
      </mesh>
      {/* gomito: da qui l'avambraccio va verso il portatile */}
      <group ref={avambraccio} position={[lato * 0.235, 0.81, 0.06]} rotation={[Math.PI / 2 - 0.12, 0, lato * -0.18]}>
        <mesh position={[0, 0.13, 0]} castShadow>
          <capsuleGeometry args={[0.047, 0.2, 6, 12]} />
          <meshStandardMaterial color={abito} roughness={0.75} />
        </mesh>
        <mesh position={[0, 0.255, 0]}>
          <cylinderGeometry args={[0.044, 0.044, 0.03, 14]} />
          <meshStandardMaterial color="#f4f4f1" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.3, 0]} scale={[1, 1.15, 0.6]}>
          <sphereGeometry args={[0.042, 14, 10]} />
          <meshStandardMaterial color={pelle} roughness={0.65} />
        </mesh>
      </group>
    </group>
  )
}

export function Persona3D({
  persona,
  lavora,
  scelta,
  parla,
  sfasamento,
  ombre,
}: {
  persona: Persona
  lavora: boolean
  scelta: boolean
  parla: boolean
  sfasamento: number
  ombre: boolean
}) {
  const a = persona.aspetto
  const fermo = useMovimentoRidotto()
  const busto = useRef<THREE.Group>(null)
  const testa = useRef<THREE.Group>(null)
  const bocca = useRef<THREE.Mesh>(null)
  const sx = useRef<THREE.Group>(null)
  const dx = useRef<THREE.Group>(null)
  const risvolto = useMemo(() => scurisci(a.abito, -0.25), [a.abito])
  const pantaloni = useMemo(() => scurisci(a.abito, 0.08), [a.abito])

  useFrame((stato, delta) => {
    if (fermo) return
    const t = stato.clock.elapsedTime + sfasamento
    if (busto.current) busto.current.scale.y = 1 + Math.sin(t * 1.7) * 0.008
    if (testa.current) {
      // Chi è scelto guarda verso di te; gli altri si guardano intorno o guardano lo schermo.
      const yaw = scelta ? 0 : lavora ? Math.sin(t * 0.7) * 0.08 : Math.sin(t * 0.35) * 0.35
      const pitch = lavora && !scelta ? 0.22 : scelta ? -0.04 : Math.sin(t * 0.5) * 0.04
      const k = 1 - Math.exp(-delta * 4)
      testa.current.rotation.y += (yaw - testa.current.rotation.y) * k
      testa.current.rotation.x += (pitch - testa.current.rotation.x) * k
    }
    // Il labiale dura finché l'agente sta "parlando" nella conversazione.
    const parlaOra = parla && useStudio.getState().parlaFino > Date.now()
    if (bocca.current) bocca.current.scale.y = parlaOra ? 1 + Math.abs(Math.sin(t * 13)) * 2.2 : 1
    const battuta = lavora ? Math.sin(t * 14) * 0.05 : 0
    if (sx.current) sx.current.rotation.x = Math.PI / 2 - 0.12 + battuta
    if (dx.current) dx.current.rotation.x = Math.PI / 2 - 0.12 - battuta
  })

  return (
    <group>
      {/* sedia da ufficio */}
      <mesh position={[0, 0.45, -0.02]} castShadow={ombre}>
        <boxGeometry args={[0.5, 0.07, 0.48]} />
        <meshStandardMaterial color="#2a2c2f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.86, -0.27]} rotation={[-0.08, 0, 0]} castShadow={ombre}>
        <boxGeometry args={[0.48, 0.66, 0.07]} />
        <meshStandardMaterial color="#2a2c2f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.22, -0.02]}>
        <cylinderGeometry args={[0.03, 0.03, 0.4, 10]} />
        <meshStandardMaterial color="#8d9196" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.03, -0.02]}>
        <cylinderGeometry args={[0.28, 0.28, 0.04, 5]} />
        <meshStandardMaterial color="#2a2c2f" roughness={0.6} />
      </mesh>

      {/* gambe */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.1, 0.55, 0.17]} castShadow={ombre}>
            <boxGeometry args={[0.15, 0.14, 0.44]} />
            <meshStandardMaterial color={pantaloni} roughness={0.8} />
          </mesh>
          <mesh position={[s * 0.1, 0.3, 0.38]}>
            <boxGeometry args={[0.125, 0.42, 0.13]} />
            <meshStandardMaterial color={pantaloni} roughness={0.8} />
          </mesh>
          <mesh position={[s * 0.1, 0.045, 0.44]}>
            <boxGeometry args={[0.12, 0.08, 0.25]} />
            <meshStandardMaterial color="#141414" roughness={0.35} />
          </mesh>
        </group>
      ))}

      <group ref={busto}>
        {/* giacca */}
        <mesh position={[0, 0.84, -0.02]} scale={[1, 1, 0.62]} castShadow={ombre}>
          <cylinderGeometry args={[0.215, 0.185, 0.56, 28]} />
          <meshStandardMaterial color={a.abito} roughness={0.78} />
        </mesh>
        {/* camicia, risvolti e cravatta */}
        <mesh position={[0, 1.0, 0.107]} rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[0.105, 0.22, 0.01]} />
          <meshStandardMaterial color="#f7f7f4" roughness={0.6} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.058, 0.985, 0.113]} rotation={[-0.08, 0, s * 0.36]}>
            <boxGeometry args={[0.045, 0.27, 0.012]} />
            <meshStandardMaterial color={risvolto} roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[0, 1.095, 0.118]}>
          <boxGeometry args={[0.038, 0.034, 0.02]} />
          <meshStandardMaterial color={a.cravatta} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.965, 0.119]} rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[0.044, 0.23, 0.012]} />
          <meshStandardMaterial color={a.cravatta} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.845, 0.124]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.031, 0.031, 0.012]} />
          <meshStandardMaterial color={a.cravatta} roughness={0.5} />
        </mesh>
        {/* colletto */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.035, 1.12, 0.085]} rotation={[0.3, 0, s * 0.6]}>
            <boxGeometry args={[0.05, 0.03, 0.01]} />
            <meshStandardMaterial color="#f7f7f4" roughness={0.6} />
          </mesh>
        ))}
        <Braccio lato={-1} abito={a.abito} pelle={a.pelle} avambraccio={sx} />
        <Braccio lato={1} abito={a.abito} pelle={a.pelle} avambraccio={dx} />
        {/* collo e testa */}
        <mesh position={[0, 1.16, 0]}>
          <cylinderGeometry args={[0.05, 0.055, 0.1, 16]} />
          <meshStandardMaterial color={a.pelle} roughness={0.65} />
        </mesh>
        <group ref={testa} position={[0, 1.3, 0.01]}>
          <Testa a={a} bocca={bocca} />
        </group>
      </group>
    </group>
  )
}
