import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStudioStore } from '../store'
import { CAMPANELLA } from './layout'

/** Durata dell'oscillazione dopo la suonata, in secondi. */
const DURATA_OSCILLAZIONE = 3.2

/**
 * Campanella di contrattazione vicino all'ingresso: oscilla e suona quando la
 * pipeline completa il capitolo. Il suono è sintetizzato con Web Audio, senza
 * file esterni, ed è disattivabile dalle impostazioni.
 */
function suona(volume = 0.25) {
  try {
    const Contesto =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Contesto) return
    const ctx = new Contesto()

    // Due parziali leggermente stonate danno il timbro metallico della campana.
    const parziali = [
      { frequenza: 880, ampiezza: 1 },
      { frequenza: 1320, ampiezza: 0.6 },
      { frequenza: 2490, ampiezza: 0.25 },
    ]

    const uscita = ctx.createGain()
    uscita.gain.value = volume
    uscita.connect(ctx.destination)

    const adesso = ctx.currentTime
    for (const parziale of parziali) {
      const osc = ctx.createOscillator()
      const guadagno = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = parziale.frequenza
      guadagno.gain.setValueAtTime(0.0001, adesso)
      guadagno.gain.exponentialRampToValueAtTime(parziale.ampiezza, adesso + 0.01)
      guadagno.gain.exponentialRampToValueAtTime(0.0001, adesso + 2.4)
      osc.connect(guadagno)
      guadagno.connect(uscita)
      osc.start(adesso)
      osc.stop(adesso + 2.5)
    }

    window.setTimeout(() => void ctx.close(), 2800)
  } catch {
    // Audio non disponibile (permessi, contesto sospeso): la scena resta muta.
  }
}

export function TradingBell() {
  const suonata = useStudioStore((s) => s.campanellaSuonata)
  const audioAttivo = useStudioStore((s) => s.audioAttivo)

  const campana = useRef<THREE.Group>(null)
  const battente = useRef<THREE.Mesh>(null)
  const inizio = useRef<number | null>(null)

  useEffect(() => {
    if (!suonata) {
      inizio.current = null
      return
    }
    inizio.current = performance.now() / 1000
    if (audioAttivo) suona()
  }, [suonata, audioAttivo])

  useFrame((state) => {
    if (!campana.current) return
    if (inizio.current === null) {
      campana.current.rotation.z = THREE.MathUtils.damp(campana.current.rotation.z, 0, 5, 0.016)
      return
    }

    const trascorso = state.clock.elapsedTime - (state.clock.elapsedTime - (performance.now() / 1000 - inizio.current))
    const tempo = performance.now() / 1000 - inizio.current
    if (tempo > DURATA_OSCILLAZIONE) {
      inizio.current = null
      return
    }

    // Oscillazione smorzata.
    const ampiezza = 0.5 * Math.exp(-tempo * 1.4)
    campana.current.rotation.z = Math.sin(tempo * 16) * ampiezza
    if (battente.current) {
      battente.current.position.x = Math.sin(tempo * 16 + 0.6) * ampiezza * 0.12
    }
    void trascorso
  })

  return (
    <group position={CAMPANELLA}>
      {/* colonnina e mensola */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 1.2, 8]} />
        <meshStandardMaterial color="#3a2a1a" flatShading roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.24, 0]} castShadow>
        <boxGeometry args={[0.6, 0.08, 0.3]} />
        <meshStandardMaterial color="#c9a227" metalness={0.75} roughness={0.35} />
      </mesh>

      {/* campana, appesa alla mensola */}
      <group ref={campana} position={[0, 1.2, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <cylinderGeometry args={[0.26, 0.16, 0.4, 14, 1, true]} />
          <meshStandardMaterial
            color="#d4af37"
            metalness={0.85}
            roughness={0.28}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, -0.02, 0]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial color="#d4af37" metalness={0.85} roughness={0.28} />
        </mesh>
        <mesh ref={battente} position={[0, -0.44, 0]}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshStandardMaterial color="#8a6f1c" metalness={0.7} roughness={0.4} />
        </mesh>
      </group>
    </group>
  )
}
