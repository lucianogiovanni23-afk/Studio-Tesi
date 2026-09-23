import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { AGENTI, NOME_SOCIETA, SOTTOTITOLO_SOCIETA } from '../agents/definitions'
import { useStudioStore } from '../store'
import { Broker } from './Broker'
import { QuoteBoard } from './QuoteBoard'
import { Skyline } from './Skyline'
import { TradingBell } from './TradingBell'
import { Workstation } from './Workstation'
import { SALA } from './layout'

const PANNELLATURA = '#3d2718'
const PANNELLATURA_CHIARA = '#4d3320'
const MOQUETTE = '#123026'
const SOFFITTO = '#141a24'

/** Pannellature in legno scuro con lesene, sulla parete di fondo. */
function ParetePannellata() {
  const lesene = useMemo(() => [-8.4, -4.2, 4.2, 8.4], [])

  return (
    <group>
      <mesh position={[0, SALA.altezza / 2, -SALA.semiProfondita]} receiveShadow>
        <boxGeometry args={[SALA.semiLarghezza * 2, SALA.altezza, 0.24]} />
        <meshStandardMaterial color={PANNELLATURA} flatShading roughness={0.9} />
      </mesh>
      {/* zoccolatura e cornice alta */}
      <mesh position={[0, 0.45, -SALA.semiProfondita + 0.16]}>
        <boxGeometry args={[SALA.semiLarghezza * 2, 0.9, 0.1]} />
        <meshStandardMaterial color={PANNELLATURA_CHIARA} flatShading roughness={0.85} />
      </mesh>
      <mesh position={[0, SALA.altezza - 0.3, -SALA.semiProfondita + 0.16]}>
        <boxGeometry args={[SALA.semiLarghezza * 2, 0.22, 0.12]} />
        <meshStandardMaterial color="#c9a227" metalness={0.6} roughness={0.45} />
      </mesh>
      {lesene.map((x) => (
        <mesh key={x} position={[x, SALA.altezza / 2, -SALA.semiProfondita + 0.2]} castShadow>
          <boxGeometry args={[0.44, SALA.altezza, 0.18]} />
          <meshStandardMaterial color={PANNELLATURA_CHIARA} flatShading roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/** Grande finestra sul fondo, da cui si vede lo skyline. */
function Finestrone({ x, larghezza }: { x: number; larghezza: number }) {
  return (
    <group position={[x, 3.1, -SALA.semiProfondita + 0.06]}>
      {/* telaio in ottone */}
      <mesh castShadow>
        <boxGeometry args={[larghezza + 0.3, 3.1, 0.12]} />
        <meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.4} />
      </mesh>
      {/* vetro: lascia passare lo skyline dietro */}
      <mesh position={[0, 0, -0.14]}>
        <planeGeometry args={[larghezza, 2.8]} />
        <meshBasicMaterial transparent opacity={0.08} color="#9fc6e8" />
      </mesh>
      {/* traversi */}
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[0.06, 2.8, 0.04]} />
        <meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[larghezza, 0.06, 0.04]} />
        <meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.4} />
      </mesh>
    </group>
  )
}

/** Plafoniera a soffitto. */
function Plafoniera({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, SALA.altezza - 0.22, z]}>
      <mesh castShadow>
        <boxGeometry args={[2.6, 0.16, 0.7]} />
        <meshStandardMaterial color="#2b323f" flatShading roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 0.56]} />
        <meshStandardMaterial color="#fdf3dd" emissive="#ffe9c2" emissiveIntensity={1.3} />
      </mesh>
      <pointLight position={[0, -0.5, 0]} color="#ffe0b0" intensity={11} distance={12} decay={2} />
    </group>
  )
}

/** Lavagna laterale: fonti approvate o estratto dell'opzione scelta. */
function Lavagna() {
  const approvazione = useStudioStore((s) => s.approvazione)
  const opzioni = useStudioStore((s) => s.opzioni)
  const fonti = useStudioStore((s) => s.fonti)
  const selezionate = useStudioStore((s) => s.selezionate)
  const approvate = useMemo(() => {
    const scelte = new Set(selezionate.map((v) => v.url))
    return fonti.filter((f) => scelte.has(f.url))
  }, [fonti, selezionate])
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)

  const scelta = opzioni.find((o) => o.stato === 'ok' && o.valutazione && o.valutazione.criticita.length === 0)
    ?? opzioni.find((o) => o.stato === 'ok')

  const approvato = approvazione === 'approvata'

  return (
    <group position={[-SALA.semiLarghezza + 0.28, 2.9, -2.2]} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[6.4, 3.4, 0.16]} />
        <meshStandardMaterial color="#c9a227" metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0, 0.1]} receiveShadow>
        <boxGeometry args={[6.05, 3.05, 0.04]} />
        <meshStandardMaterial color="#12301f" roughness={0.95} />
      </mesh>

      {/* 480px * 0.025 * 0.49 ≈ 5,9 unità di larghezza */}
      <Html transform scale={0.49} position={[0, 0, 0.14]} zIndexRange={[10, 0]}>
        <div className="lavagna">
          {scelta?.risultato && approvato ? (
            <>
              <div className="lavagna-titolo">{scelta.risultato.titolo}</div>
              <p className="lavagna-sottotitolo">
                {scelta.etichetta} · {scelta.risultato.parole} parole
              </p>
              <p className="lavagna-testo">{scelta.risultato.paragrafi[0]?.testo.slice(0, 620)}…</p>
            </>
          ) : approvato && approvate.length > 0 ? (
            <>
              <div className="lavagna-titolo">Fonti approvate ({approvate.length})</div>
              <ul className="lavagna-elenco">
                {approvate.slice(0, 6).map((f) => (
                  <li key={f.url}>
                    <strong>{f.titolo}</strong>
                    <span>{f.url}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="lavagna-vuota">
              {inEsecuzione
                ? 'La squadra è al lavoro. Qui compariranno le fonti approvate e il capitolo.'
                : 'Lavagna libera. Carica il materiale del corso, poi apri la seduta.'}
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}

/** Insegna della società: nome di fantasia, nessun riferimento reale. */
function Insegna() {
  return (
    <group position={[0, 5.55, -SALA.semiProfondita + 0.2]}>
      <Html transform scale={0.4} position={[0, 0, 0.06]} zIndexRange={[9, 0]}>
        <div className="insegna">
          <strong>{NOME_SOCIETA}</strong>
          <span>{SOTTOTITOLO_SOCIETA}</span>
        </div>
      </Html>
    </group>
  )
}

function Pianta({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.24, 0.6, 8]} />
        <meshStandardMaterial color="#8a6f1c" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#1f5e3a" flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0.24, 1.42, -0.1]} castShadow>
        <icosahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#2a7a4b" flatShading roughness={0.9} />
      </mesh>
    </group>
  )
}

export function TradingFloor() {
  return (
    <group>
      {/* moquette */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SALA.semiLarghezza * 2, SALA.semiProfondita * 2]} />
        <meshStandardMaterial color={MOQUETTE} roughness={1} />
      </mesh>

      <ParetePannellata />

      {/* pareti laterali */}
      {[-SALA.semiLarghezza, SALA.semiLarghezza].map((x) => (
        <mesh key={x} position={[x, SALA.altezza / 2, 0]} receiveShadow>
          <boxGeometry args={[0.24, SALA.altezza, SALA.semiProfondita * 2]} />
          <meshStandardMaterial color={PANNELLATURA} flatShading roughness={0.9} />
        </mesh>
      ))}

      {/* soffitto */}
      <mesh position={[0, SALA.altezza, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SALA.semiLarghezza * 2, SALA.semiProfondita * 2]} />
        <meshStandardMaterial color={SOFFITTO} roughness={1} />
      </mesh>

      <Finestrone x={-6.3} larghezza={4.4} />
      <Finestrone x={6.3} larghezza={4.4} />
      <Skyline />

      <QuoteBoard />
      <Insegna />
      <Lavagna />
      <TradingBell />

      <Plafoniera x={-5} z={-4} />
      <Plafoniera x={5} z={-4} />
      <Plafoniera x={0} z={1.5} />

      <Pianta position={[-9, 0, -7.4]} />
      <Pianta position={[9, 0, -7.4]} />

      {AGENTI.map((a) => (
        <Workstation key={`ws-${a.key}`} agentKey={a.key} />
      ))}
      {AGENTI.map((a) => (
        <Broker key={`broker-${a.key}`} agentKey={a.key} />
      ))}
    </group>
  )
}
