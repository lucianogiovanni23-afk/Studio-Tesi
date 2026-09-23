import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SALA } from './layout'

/**
 * Skyline notturno oltre le finestre: sagome generiche e anonime, con le
 * finestre accese disegnate in un solo instancedMesh per non pesare su iPad.
 */

interface Torre {
  x: number
  larghezza: number
  altezza: number
  profondita: number
  tono: number
}

const FINESTRA = 0.09

/** Generatore deterministico: la scena è identica a ogni caricamento. */
function creaCasuale(seme: number): () => number {
  let stato = seme
  return () => {
    stato = (stato * 1664525 + 1013904223) % 4294967296
    return stato / 4294967296
  }
}

function generaTorri(): Torre[] {
  const casuale = creaCasuale(20260923)
  const torri: Torre[] = []
  let x = -16
  while (x < 16) {
    const larghezza = 1.4 + casuale() * 2.2
    torri.push({
      x: x + larghezza / 2,
      larghezza,
      altezza: 3 + casuale() * 9,
      profondita: 1.2 + casuale() * 1.6,
      tono: casuale(),
    })
    x += larghezza + 0.35 + casuale() * 0.5
  }
  return torri
}

function generaFinestre(torri: Torre[]): { x: number; y: number; z: number }[] {
  const casuale = creaCasuale(987654321)
  const punti: { x: number; y: number; z: number }[] = []
  for (const torre of torri) {
    const colonne = Math.max(1, Math.floor(torre.larghezza / 0.42))
    const righe = Math.max(1, Math.floor(torre.altezza / 0.55))
    for (let c = 0; c < colonne; c++) {
      for (let r = 0; r < righe; r++) {
        // Solo una parte delle finestre è illuminata: è notte fonda.
        if (casuale() > 0.55) continue
        punti.push({
          x: torre.x - torre.larghezza / 2 + 0.21 + c * 0.42,
          y: 0.45 + r * 0.55,
          z: torre.profondita / 2 + 0.01,
        })
      }
    }
  }
  return punti
}

export function Skyline() {
  const torri = useMemo(() => generaTorri(), [])
  const finestre = useRef<THREE.InstancedMesh>(null)

  const posizioniFinestre = useMemo(() => generaFinestre(torri), [torri])

  useLayoutEffect(() => {
    const mesh = finestre.current
    if (!mesh) return
    const matrice = new THREE.Matrix4()
    const colore = new THREE.Color()

    posizioniFinestre.forEach((p, i) => {
      matrice.makeTranslation(p.x, p.y, p.z)
      mesh.setMatrixAt(i, matrice)
      // Sfumature fra ambra e crema, come le luci al neon dell'epoca.
      const caldo = (i % 7) / 7
      colore.setRGB(1, 0.78 + caldo * 0.15, 0.45 + caldo * 0.25)
      mesh.setColorAt(i, colore)
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [posizioniFinestre])

  return (
    <group position={[0, 0, -SALA.semiProfondita - 7]}>
      {/* cielo notturno */}
      <mesh position={[0, 8, -3]}>
        <planeGeometry args={[60, 30]} />
        <meshBasicMaterial color="#060b16" />
      </mesh>

      {torri.map((torre, i) => (
        <mesh key={i} position={[torre.x, torre.altezza / 2, 0]}>
          <boxGeometry args={[torre.larghezza, torre.altezza, torre.profondita]} />
          <meshBasicMaterial color={new THREE.Color().setHSL(0.6, 0.25, 0.06 + torre.tono * 0.05)} />
        </mesh>
      ))}

      <instancedMesh
        ref={finestre}
        args={[undefined, undefined, Math.max(1, posizioniFinestre.length)]}
        frustumCulled={false}
      >
        <planeGeometry args={[FINESTRA * 2.2, FINESTRA * 3]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
