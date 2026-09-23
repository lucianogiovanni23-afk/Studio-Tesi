import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { AGENTE, type AgentDefinition } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { AgentKey, AgentStatus } from '../types'
import { POSTAZIONI, VELOCITA_PASSO } from './layout'
import { ReasoningBubble } from './ReasoningBubble'

type Posa = 'idle' | 'walking' | 'working' | 'waiting' | 'done' | 'error'

const INCARNATO = '#e8c9a8'
const CAMICIA = '#eae6dc'
const SCURO = '#161a23'

/** Il broker resta alla postazione da quando parte il suo turno fino al reset. */
function allaPostazione(stato: AgentStatus): boolean {
  return stato !== 'idle'
}

function posaPer(stato: AgentStatus, inMovimento: boolean): Posa {
  if (inMovimento) return 'walking'
  switch (stato) {
    case 'working':
      return 'working'
    case 'waiting':
      return 'waiting'
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

interface Percorso {
  punti: THREE.Vector2[]
  lunghezze: number[]
  totale: number
}

function costruisciPercorso(tappe: [number, number][]): Percorso {
  const punti = tappe.map(([x, z]) => new THREE.Vector2(x, z))
  const lunghezze: number[] = []
  let totale = 0
  for (let i = 1; i < punti.length; i++) {
    const d = punti[i].distanceTo(punti[i - 1])
    lunghezze.push(d)
    totale += d
  }
  return { punti, lunghezze, totale }
}

function campiona(p: Percorso, t: number, fuori: THREE.Vector2, direzione: THREE.Vector2) {
  let resto = THREE.MathUtils.clamp(t, 0, 1) * p.totale
  for (let i = 0; i < p.lunghezze.length; i++) {
    const segmento = p.lunghezze[i]
    if (resto <= segmento || i === p.lunghezze.length - 1) {
      const k = segmento === 0 ? 0 : THREE.MathUtils.clamp(resto / segmento, 0, 1)
      fuori.copy(p.punti[i]).lerp(p.punti[i + 1], k)
      direzione.copy(p.punti[i + 1]).sub(p.punti[i])
      if (direzione.lengthSq() > 0) direzione.normalize()
      return
    }
    resto -= segmento
  }
  fuori.copy(p.punti[p.punti.length - 1])
  direzione.set(0, -1)
}

/** Dettaglio distintivo montato sulla testa. */
function DettaglioTesta({ agente }: { agente: AgentDefinition }) {
  if (agente.dettaglio === 'occhiali') {
    return (
      <group position={[0, 0.02, 0.24]}>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <boxGeometry args={[0.13, 0.11, 0.02]} />
            <meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <mesh>
          <boxGeometry args={[0.1, 0.02, 0.02]} />
          <meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    )
  }
  if (agente.dettaglio === 'auricolare') {
    return (
      <group>
        <mesh position={[0.25, 0.02, 0.02]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.06, 8]} />
          <meshStandardMaterial color="#12161d" flatShading roughness={0.7} />
        </mesh>
        <mesh position={[0.2, -0.08, 0.12]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.04, 0.16, 0.03]} />
          <meshStandardMaterial color="#12161d" flatShading />
        </mesh>
      </group>
    )
  }
  return null
}

/** Dettaglio distintivo montato sul busto. */
function DettaglioBusto({ agente }: { agente: AgentDefinition }) {
  switch (agente.dettaglio) {
    case 'fazzoletto':
      return (
        <mesh position={[-0.22, 1.16, 0.23]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.11, 0.07, 0.02]} />
          <meshStandardMaterial color={agente.colore} flatShading roughness={0.7} />
        </mesh>
      )
    case 'orologio':
      return (
        <mesh position={[0.34, 0.92, 0.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.045, 0.045, 0.03, 10]} />
          <meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.25} />
        </mesh>
      )
    case 'cartellino':
      return (
        <group position={[0.2, 1.1, 0.23]}>
          <mesh>
            <boxGeometry args={[0.15, 0.1, 0.015]} />
            <meshStandardMaterial color="#efe9d8" flatShading />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.015, 0.07, 0.015]} />
            <meshStandardMaterial color="#8d8677" flatShading />
          </mesh>
        </group>
      )
    default:
      return null
  }
}

export function Broker({ agentKey }: { agentKey: AgentKey }) {
  const agente = AGENTE[agentKey]
  const postazione = POSTAZIONI[agentKey]
  const stato = useStudioStore((s) => s.agenti[agentKey].status)
  const microLabel = useStudioStore((s) => s.agenti[agentKey].microLabel)
  const nuvolettaAperta = useStudioStore((s) => s.nuvolettaAperta === agentKey)
  const alternaNuvoletta = useStudioStore((s) => s.alternaNuvoletta)
  const [sopra, setSopra] = useState(false)

  const ridotto = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  )

  const percorso = useMemo(() => costruisciPercorso(postazione.percorso), [postazione.percorso])
  const sfasamento = useMemo(() => postazione.indice * 1.37, [postazione.indice])

  const radice = useRef<THREE.Group>(null)
  const corpo = useRef<THREE.Group>(null)
  const testa = useRef<THREE.Group>(null)
  const spallaSx = useRef<THREE.Group>(null)
  const spallaDx = useRef<THREE.Group>(null)
  const gomitoSx = useRef<THREE.Group>(null)
  const gomitoDx = useRef<THREE.Group>(null)
  const ancaSx = useRef<THREE.Group>(null)
  const ancaDx = useRef<THREE.Group>(null)
  const ginocchioSx = useRef<THREE.Group>(null)
  const ginocchioDx = useRef<THREE.Group>(null)

  const avanzamento = useRef(0)
  const direzioneCorpo = useRef(0)
  const seduto = useRef(0)
  const posizione = useMemo(() => new THREE.Vector2(), [])
  const direzione = useMemo(() => new THREE.Vector2(), [])
  const appoggio = useMemo(() => new THREE.Vector2(), [])

  useFrame((state, deltaGrezzo) => {
    const dt = Math.min(deltaGrezzo, 0.1)
    const t = state.clock.elapsedTime + sfasamento

    // --- spostamento reale lungo il percorso ---------------------------------
    const obiettivo = allaPostazione(stato) ? 1 : 0
    const passo = percorso.totale > 0 ? (VELOCITA_PASSO / percorso.totale) * dt : 1
    let inMovimento = false
    if (avanzamento.current < obiettivo) {
      avanzamento.current = Math.min(obiettivo, avanzamento.current + passo)
      inMovimento = true
    } else if (avanzamento.current > obiettivo) {
      avanzamento.current = Math.max(obiettivo, avanzamento.current - passo)
      inMovimento = true
    }

    campiona(percorso, avanzamento.current, posizione, direzione)
    if (radice.current) {
      radice.current.position.x = posizione.x
      radice.current.position.z = posizione.y
    }

    if (stato === 'walking' && avanzamento.current >= 1) {
      useStudioStore.getState().setArrivato(agentKey, true)
    }

    const posa = posaPer(stato, inMovimento)

    // --- si siede davvero sulla poltrona -------------------------------------
    const obiettivoSeduta = !inMovimento && (posa === 'working' || posa === 'waiting') ? 1 : 0
    seduto.current = THREE.MathUtils.damp(seduto.current, obiettivoSeduta, 6, dt)
    const sit = seduto.current

    // --- orientamento ---------------------------------------------------------
    let direzioneObiettivo: number
    if (inMovimento) {
      appoggio.copy(direzione)
      if (obiettivo === 0) appoggio.negate()
      direzioneObiettivo = Math.atan2(appoggio.x, appoggio.y)
    } else if (posa === 'working') {
      direzioneObiettivo = Math.PI // rivolto alla scrivania
    } else {
      direzioneObiettivo = 0 // rivolto verso di me
    }
    const delta = ((direzioneObiettivo - direzioneCorpo.current + Math.PI) % (Math.PI * 2)) - Math.PI
    direzioneCorpo.current += delta * Math.min(1, dt * 7)
    if (radice.current) radice.current.rotation.y = direzioneCorpo.current

    // --- posa -----------------------------------------------------------------
    let spallaXSx = 0
    let spallaXDx = 0
    let spallaZ = 0.08
    let gomitoXSx = 0
    let gomitoXDx = 0
    let ancaXSx = 0
    let ancaXDx = 0
    let ginocchioXSx = 0
    let ginocchioXDx = 0
    let testaX = 0
    let testaY = 0
    let saliscendi = 0
    let inclinazione = 0
    let oscillazione = 0

    const ampiezza = ridotto ? 0.25 : 1

    switch (posa) {
      case 'walking': {
        const passoOnda = Math.sin(t * 8.5)
        ancaXSx = passoOnda * 0.6
        ancaXDx = -passoOnda * 0.6
        ginocchioXSx = Math.max(0, -passoOnda) * 0.5
        ginocchioXDx = Math.max(0, passoOnda) * 0.5
        spallaXSx = -passoOnda * 0.5
        spallaXDx = passoOnda * 0.5
        gomitoXSx = -0.25
        gomitoXDx = -0.25
        saliscendi = Math.abs(Math.sin(t * 8.5)) * 0.07
        inclinazione = 0.07
        break
      }
      case 'working': {
        // Mani sulla tastiera, testa verso lo schermo.
        const battuta = Math.sin(t * 14) * ampiezza
        spallaXSx = -1.02 + battuta * 0.06
        spallaXDx = -1.02 - battuta * 0.06
        spallaZ = 0.2
        gomitoXSx = -0.45 - battuta * 0.12
        gomitoXDx = -0.45 + battuta * 0.12

        // Ogni tanto la destra si sposta sul mouse.
        const alMouse = Math.sin(t * 0.32) > 0.62
        if (alMouse) {
          spallaXDx = -1.16 + Math.sin(t * 1.4) * 0.05
          gomitoXDx = -0.3
        }

        // Il Ricercatore alterna con il telefono all'orecchio.
        if (agentKey === 'ricercatore' && Math.sin(t * 0.21) > 0.55) {
          spallaXDx = -2.1
          gomitoXDx = -1.5
          spallaZ = 0.34
          testaY = 0.22
        }

        testaX = 0.34
        inclinazione = 0.2
        break
      }
      case 'waiting': {
        // Seduto ma girato verso di me: guarda l'orologio al polso.
        const guarda = Math.sin(t * 0.55)
        testaY = Math.sin(t * 0.8) * 0.7 * ampiezza
        testaX = guarda > 0.7 ? 0.4 : Math.sin(t * 0.42) * 0.1
        spallaXSx = -0.2
        spallaXDx = guarda > 0.7 ? -1.35 : -0.2 - Math.sin(t * 1.2) * 0.07
        gomitoXSx = -0.7
        gomitoXDx = guarda > 0.7 ? -1.9 : -0.7
        spallaZ = 0.18
        oscillazione = Math.sin(t * 1.05) * 0.04 * ampiezza
        break
      }
      case 'done': {
        // In piedi, si sistema la giacca: posa soddisfatta.
        spallaXSx = -0.5
        spallaXDx = -0.5
        spallaZ = 0.3
        gomitoXSx = -1.1
        gomitoXDx = -1.1
        testaX = -0.06
        saliscendi = Math.sin(t * 1.5) * 0.028 * ampiezza
        oscillazione = Math.sin(t * 0.7) * 0.03 * ampiezza
        break
      }
      case 'error': {
        // Mano alla fronte.
        spallaXSx = -0.15
        spallaXDx = -2.35
        spallaZ = 0.26
        gomitoXSx = -0.4
        gomitoXDx = -1.5
        testaX = 0.28
        oscillazione = Math.sin(t * 1.6) * 0.05 * ampiezza
        break
      }
      default: {
        // idle: respiro e, ogni tanto, si sistema la cravatta.
        const cravatta = Math.sin(t * 0.27) > 0.82
        saliscendi = Math.sin(t * 1.6) * 0.035 * ampiezza
        oscillazione = Math.sin(t * 0.8) * 0.03 * ampiezza
        spallaXSx = Math.sin(t * 1.6) * 0.06 * ampiezza
        spallaXDx = cravatta ? -1.5 : -Math.sin(t * 1.6) * 0.06 * ampiezza
        gomitoXDx = cravatta ? -1.7 : 0
        testaY = Math.sin(t * 0.5) * 0.2 * ampiezza
      }
    }

    // Da seduto: bacino più basso, cosce in avanti, stinchi verso il basso.
    ancaXSx = THREE.MathUtils.lerp(ancaXSx, -1.5, sit)
    ancaXDx = THREE.MathUtils.lerp(ancaXDx, -1.5, sit)
    ginocchioXSx = THREE.MathUtils.lerp(ginocchioXSx, 1.45, sit)
    ginocchioXDx = THREE.MathUtils.lerp(ginocchioXDx, 1.45, sit)
    saliscendi -= 0.09 * sit

    const lambda = 9
    const smorza = (rif: { current: THREE.Group | null }, asse: 'x' | 'y' | 'z', valore: number) => {
      if (!rif.current) return
      rif.current.rotation[asse] = THREE.MathUtils.damp(rif.current.rotation[asse], valore, lambda, dt)
    }

    if (corpo.current) {
      corpo.current.position.y = THREE.MathUtils.damp(corpo.current.position.y, saliscendi, lambda, dt)
      corpo.current.rotation.x = THREE.MathUtils.damp(corpo.current.rotation.x, inclinazione, lambda, dt)
      corpo.current.rotation.z = THREE.MathUtils.damp(corpo.current.rotation.z, oscillazione, lambda, dt)
    }
    smorza(testa, 'x', testaX)
    smorza(testa, 'y', testaY)
    smorza(spallaSx, 'x', spallaXSx)
    smorza(spallaSx, 'z', -spallaZ)
    smorza(spallaDx, 'x', spallaXDx)
    smorza(spallaDx, 'z', spallaZ)
    smorza(gomitoSx, 'x', gomitoXSx)
    smorza(gomitoDx, 'x', gomitoXDx)
    smorza(ancaSx, 'x', ancaXSx)
    smorza(ancaDx, 'x', ancaXDx)
    smorza(ginocchioSx, 'x', ginocchioXSx)
    smorza(ginocchioDx, 'x', ginocchioXDx)
  })

  return (
    <group ref={radice} position={[postazione.attesa[0], 0, postazione.attesa[1]]}>
      <group
        ref={corpo}
        onClick={(e) => {
          e.stopPropagation()
          alternaNuvoletta(agentKey)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setSopra(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setSopra(false)
          document.body.style.cursor = 'auto'
        }}
      >
        {/* giacca */}
        <RoundedBox args={[0.64, 0.82, 0.44]} radius={0.08} smoothness={2} position={[0, 1.04, 0]} castShadow>
          <meshStandardMaterial
            color={agente.abito}
            flatShading
            roughness={0.85}
            emissive={sopra ? agente.colore : '#000000'}
            emissiveIntensity={sopra ? 0.3 : 0}
          />
        </RoundedBox>
        {/* camicia e bretelle */}
        <mesh position={[0, 1.1, 0.21]}>
          <boxGeometry args={[0.22, 0.6, 0.04]} />
          <meshStandardMaterial color={CAMICIA} flatShading roughness={0.8} />
        </mesh>
        {[-0.13, 0.13].map((x) => (
          <mesh key={x} position={[x, 1.12, 0.225]}>
            <boxGeometry args={[0.05, 0.58, 0.02]} />
            <meshStandardMaterial color="#6b2f3a" flatShading roughness={0.8} />
          </mesh>
        ))}
        {/* cravatta nel colore dell'agente */}
        <group position={[0, 1.3, 0.235]}>
          <mesh>
            <boxGeometry args={[0.09, 0.09, 0.02]} />
            <meshStandardMaterial color={agente.colore} flatShading roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.24, 0]}>
            <boxGeometry args={[0.12, 0.42, 0.02]} />
            <meshStandardMaterial color={agente.colore} flatShading roughness={0.6} />
          </mesh>
        </group>
        {/* colletto */}
        <mesh position={[0, 1.45, 0.02]} castShadow>
          <boxGeometry args={[0.42, 0.1, 0.36]} />
          <meshStandardMaterial color={CAMICIA} flatShading roughness={0.8} />
        </mesh>
        {/* bacino */}
        <mesh position={[0, 0.66, 0]} castShadow>
          <boxGeometry args={[0.56, 0.22, 0.4]} />
          <meshStandardMaterial color={SCURO} flatShading roughness={0.9} />
        </mesh>

        <DettaglioBusto agente={agente} />

        {/* testa */}
        <group ref={testa} position={[0, 1.72, 0]}>
          <RoundedBox args={[0.46, 0.48, 0.44]} radius={0.1} smoothness={2} castShadow>
            <meshStandardMaterial color={INCARNATO} flatShading roughness={0.85} />
          </RoundedBox>
          <mesh position={[0, 0.21, -0.02]} castShadow>
            <boxGeometry args={[0.48, 0.14, 0.46]} />
            <meshStandardMaterial color="#2c2118" flatShading roughness={0.8} />
          </mesh>
          {[-0.11, 0.11].map((x) => (
            <mesh key={x} position={[x, 0.02, 0.225]}>
              <boxGeometry args={[0.07, 0.07, 0.03]} />
              <meshStandardMaterial color={SCURO} />
            </mesh>
          ))}
          <DettaglioTesta agente={agente} />
        </group>

        {/* braccia: spalla → gomito → mano */}
        {(
          [
            ['Sx', -0.39, spallaSx, gomitoSx],
            ['Dx', 0.39, spallaDx, gomitoDx],
          ] as const
        ).map(([lato, x, rifSpalla, rifGomito]) => (
          <group key={lato} ref={rifSpalla} position={[x, 1.36, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <boxGeometry args={[0.17, 0.4, 0.18]} />
              <meshStandardMaterial color={agente.abito} flatShading roughness={0.85} />
            </mesh>
            <group ref={rifGomito} position={[0, -0.4, 0]}>
              <mesh position={[0, -0.19, 0]} castShadow>
                <boxGeometry args={[0.15, 0.38, 0.16]} />
                <meshStandardMaterial color={agente.abito} flatShading roughness={0.85} />
              </mesh>
              {/* polsino */}
              <mesh position={[0, -0.36, 0]}>
                <boxGeometry args={[0.155, 0.05, 0.165]} />
                <meshStandardMaterial color={CAMICIA} flatShading />
              </mesh>
              <mesh position={[0, -0.44, 0]} castShadow>
                <boxGeometry args={[0.15, 0.14, 0.17]} />
                <meshStandardMaterial color={INCARNATO} flatShading roughness={0.85} />
              </mesh>
            </group>
          </group>
        ))}

        {/* gambe: anca → ginocchio → scarpa */}
        {(
          [
            ['Sx', -0.16, ancaSx, ginocchioSx],
            ['Dx', 0.16, ancaDx, ginocchioDx],
          ] as const
        ).map(([lato, x, rifAnca, rifGinocchio]) => (
          <group key={lato} ref={rifAnca} position={[x, 0.62, 0]}>
            <mesh position={[0, -0.17, 0]} castShadow>
              <boxGeometry args={[0.2, 0.34, 0.2]} />
              <meshStandardMaterial color={SCURO} flatShading roughness={0.9} />
            </mesh>
            <group ref={rifGinocchio} position={[0, -0.34, 0]}>
              <mesh position={[0, -0.15, 0]} castShadow>
                <boxGeometry args={[0.18, 0.3, 0.18]} />
                <meshStandardMaterial color={SCURO} flatShading roughness={0.9} />
              </mesh>
              <mesh position={[0, -0.31, 0.05]} castShadow>
                <boxGeometry args={[0.19, 0.09, 0.28]} />
                <meshStandardMaterial color="#0d1016" flatShading roughness={0.5} />
              </mesh>
            </group>
          </group>
        ))}
      </group>

      {/* micro-etichetta di stato: separata dalla nuvoletta */}
      {microLabel && (
        <Html position={[0, 2.28, 0]} center distanceFactor={8} zIndexRange={[12, 0]}>
          <div className="micro-etichetta" style={{ borderColor: agente.colore }}>
            <span className="micro-punto" style={{ background: agente.colore }} />
            {microLabel}
          </div>
        </Html>
      )}

      {/* nuvoletta di ragionamento: una sola aperta per volta */}
      {nuvolettaAperta && <ReasoningBubble agentKey={agentKey} />}
    </group>
  )
}
