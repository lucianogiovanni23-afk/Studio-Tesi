import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useStudioStore } from '../store'
import { SALA } from './layout'

/**
 * Tabellone a muro in stile LED ambra: al posto delle quotazioni scorre lo
 * stato della pipeline, alimentato dagli eventi reali dell'app.
 */
export function QuoteBoard() {
  const ticker = useStudioStore((s) => s.ticker)
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)

  const righe = useMemo(() => {
    if (ticker.length === 0) {
      return ['SEDUTA NON APERTA', 'CARICA IL MATERIALE DEL CORSO', 'POI AVVIA LA SQUADRA']
    }
    return ticker.slice(-6).map((v) => `${v.segno} ${v.testo}`)
  }, [ticker])

  return (
    <group position={[0, 4.35, -SALA.semiProfondita + 0.16]}>
      {/* cassa del tabellone */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[9.6, 1.8, 0.2]} />
        <meshStandardMaterial color="#14181f" flatShading roughness={0.7} />
      </mesh>
      {/* cornice in ottone */}
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[9.8, 2.0, 0.06]} />
        <meshStandardMaterial color="#c9a227" metalness={0.75} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.11]}>
        <boxGeometry args={[9.5, 1.7, 0.03]} />
        <meshStandardMaterial color="#0a0d12" roughness={0.9} />
      </mesh>

      {/* 760px * 0.025 * 0.49 ≈ 9,3 unità di larghezza */}
      <Html transform scale={0.49} position={[0, 0, 0.14]} zIndexRange={[10, 0]}>
        <div className="tabellone" aria-hidden>
          <div className="tabellone-intestazione">
            <span>HARROW &amp; VANCE · SALA OPERATIVA</span>
            <span className={inEsecuzione ? 'tabellone-stato attivo' : 'tabellone-stato'}>
              {inEsecuzione ? 'SEDUTA IN CORSO' : 'SEDUTA FERMA'}
            </span>
          </div>
          <ul className="tabellone-righe">
            {righe.map((riga, i) => (
              <li key={i}>{riga}</li>
            ))}
          </ul>
        </div>
      </Html>

      {/* alone ambra del tabellone */}
      <pointLight position={[0, 0, 1.2]} color="#f2b134" intensity={2.2} distance={7} decay={2} />
    </group>
  )
}
