import { useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import { ETICHETTA_STATO } from '../domain/etichette'
import { paroleCapitolo, useStudio } from '../store'
import { COLORE_STATO, COLORI, TAVOLO_CAPITOLI } from './layout'
import { useQualita } from './qualita'


/** I capitoli come volumi sul tavolo: colore per stato, altezza per parole scritte. */
export function Capitoli3D() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const apriSezione = useStudio((s) => s.apriSezione)
  const completa = useQualita() === 'completa'
  const [sopra, setSopra] = useState<string | null>(null)

  const volumi = useMemo(() => {
    const n = capitoli.length
    const passo = Math.min(1.2, 7.6 / Math.max(1, n))
    return capitoli.map((c, i) => ({
      id: c.id,
      numero: i + 1,
      titolo: c.titolo,
      stato: c.stato,
      prima: c.sezioni[0]?.id ?? null,
      x: (i - (n - 1) / 2) * passo,
      alto: 0.45 + Math.min(1, paroleCapitolo(c) / 4000) * 0.9,
    }))
  }, [capitoli])

  return (
    <group position={[TAVOLO_CAPITOLI[0], 0, TAVOLO_CAPITOLI[1]]}>
      {/* tavolo basso */}
      <mesh position={[0, 0.42, 0]} castShadow={completa} receiveShadow>
        <boxGeometry args={[8.4, 0.08, 1.2]} />
        <meshStandardMaterial color={COLORI.bianco} roughness={0.5} />
      </mesh>
      {[-3.9, 3.9].map((x) => (
        <mesh key={x} position={[x, 0.2, 0]}>
          <boxGeometry args={[0.08, 0.4, 1]} />
          <meshStandardMaterial color={COLORI.rovereScuro} />
        </mesh>
      ))}
      {volumi.map((v) => (
        <group key={v.id} position={[v.x, 0.46, 0]}>
          <mesh
            position={[0, v.alto / 2, 0]}
            castShadow={completa}
            onClick={(e) => {
              e.stopPropagation()
              apriSezione(v.id, v.prima)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setSopra(v.id)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setSopra(null)
              document.body.style.cursor = ''
            }}
          >
            <boxGeometry args={[0.62, v.alto, 0.5]} />
            <meshStandardMaterial
              color={COLORE_STATO[v.stato]}
              roughness={0.55}
              emissive={sopra === v.id ? '#fff6d8' : '#000000'}
              emissiveIntensity={sopra === v.id ? 0.25 : 0}
            />
          </mesh>
          <Html position={[0, v.alto + 0.75, 0]} center distanceFactor={9} zIndexRange={[30, 10]}>
            <div className={`etichetta-scena etichetta-capitolo ${sopra === v.id ? 'etichetta-sopra' : ''}`}>
              <strong>Cap. {v.numero}</strong>
              <span>{ETICHETTA_STATO[v.stato]}</span>
              {sopra === v.id && <em>{v.titolo}</em>}
            </div>
          </Html>
        </group>
      ))}
    </group>
  )
}
