import { useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import { useStudio } from '../store'
import type { TemaFonte } from '../types'
import { COLORI, SCAFFALE } from './layout'
import { useQualita } from './qualita'

const COLORE_TEMA: Record<TemaFonte, string> = {
  raccolta: '#7d8f3a',
  frantoio: '#c9a43a',
  prezzi: '#a4553a',
  eventi_meteo: '#4f8fbf',
  strumenti_copertura: '#5d6a7a',
}

const RIPIANI = 4
const PER_RIPIANO = 18

/** La biblioteca come scaffale: un libro per ogni fonte, colorato per tema. */
export function Scaffale() {
  const fonti = useStudio((s) => s.progetto.fonti)
  const vai = useStudio((s) => s.vai)
  const completa = useQualita() === 'completa'
  const [sopra, setSopra] = useState(false)

  const libri = useMemo(
    () =>
      fonti.slice(0, RIPIANI * PER_RIPIANO).map((f, i) => ({
        id: f.id,
        ripiano: Math.floor(i / PER_RIPIANO),
        posto: i % PER_RIPIANO,
        colore: f.temi[0] ? COLORE_TEMA[f.temi[0]] : '#b9a98a',
        alto: 0.38 + ((i * 37) % 10) / 70,
        letta: f.stato !== 'da_leggere',
      })),
    [fonti],
  )

  return (
    <group
      position={[SCAFFALE[0], 0, SCAFFALE[1]]}
      onClick={(e) => {
        e.stopPropagation()
        vai('biblioteca')
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setSopra(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setSopra(false)
        document.body.style.cursor = ''
      }}
    >
      {/* fianchi e ripiani in rovere */}
      {[-1.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 1.25, 0]} castShadow={completa}>
          <boxGeometry args={[0.06, 2.5, 0.5]} />
          <meshStandardMaterial color={COLORI.rovereScuro} roughness={0.6} />
        </mesh>
      ))}
      {Array.from({ length: RIPIANI + 1 }, (_, r) => (
        <mesh key={r} position={[0, 0.05 + r * 0.6, 0]} receiveShadow>
          <boxGeometry args={[3.06, 0.05, 0.5]} />
          <meshStandardMaterial color={COLORI.rovereScuro} roughness={0.6} />
        </mesh>
      ))}
      {libri.map((l) => (
        <mesh
          key={l.id}
          position={[-1.36 + l.posto * 0.16, 0.08 + l.ripiano * 0.6 + l.alto / 2, 0.02]}
          castShadow={completa}
        >
          <boxGeometry args={[0.12, l.alto, 0.34]} />
          <meshStandardMaterial color={l.colore} roughness={0.7} emissive={l.letta ? '#000000' : '#fff2c4'} emissiveIntensity={l.letta ? 0 : 0.15} />
        </mesh>
      ))}
      <Html position={[-0.6, 3.05, 0]} center distanceFactor={9} zIndexRange={[30, 10]}>
        <div className={`etichetta-scena ${sopra ? 'etichetta-sopra' : ''}`}>
          <strong>Biblioteca</strong>
          <span>{fonti.length === 0 ? 'ancora vuota' : `${fonti.length} fonti`}</span>
        </div>
      </Html>
    </group>
  )
}
