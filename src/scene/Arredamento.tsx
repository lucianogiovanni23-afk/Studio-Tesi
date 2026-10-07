import { useMemo } from 'react'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { avanzamento } from '../domain/avanzamento'
import { useStudio } from '../store'
import { COLORI, COLORE_STATO } from './layout'
import { useQualita } from './qualita'

/**
 * Arredamento dell'open space: vetrata a tutta parete sulla campagna
 * calabrese, pavimento in resina chiara, parete a listelli verde oliva,
 * libreria divisoria, schermo con l'avanzamento, zona relax e luci lineari.
 */

/** Panorama oltre la vetrata: cielo, mare all'orizzonte, colline e uliveti. */
function usePanorama(): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === 'undefined') return null
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 384
    const g = c.getContext('2d')
    if (!g) return null
    const cielo = g.createLinearGradient(0, 0, 0, 230)
    cielo.addColorStop(0, '#7fb2d8')
    cielo.addColorStop(0.7, '#cfe2ec')
    cielo.addColorStop(1, '#eef2ec')
    g.fillStyle = cielo
    g.fillRect(0, 0, 1024, 384)
    // nuvole leggere
    g.fillStyle = 'rgba(255,255,255,0.55)'
    for (const [x, y, r] of [[160, 60, 34], [200, 66, 26], [610, 44, 40], [660, 52, 28], [880, 80, 24]]) {
      g.beginPath()
      g.ellipse(x, y, r * 2.2, r * 0.6, 0, 0, Math.PI * 2)
      g.fill()
    }
    // mare
    g.fillStyle = '#6f9fbf'
    g.fillRect(0, 200, 1024, 18)
    // colline
    const collina = (base: number, ampiezza: number, colore: string, fase: number) => {
      g.fillStyle = colore
      g.beginPath()
      g.moveTo(0, 384)
      for (let x = 0; x <= 1024; x += 8) g.lineTo(x, base + Math.sin(x / 140 + fase) * ampiezza + Math.sin(x / 47 + fase) * (ampiezza / 4))
      g.lineTo(1024, 384)
      g.fill()
    }
    collina(222, 10, '#a7b88d', 0)
    collina(250, 14, '#93a873', 2)
    collina(290, 8, '#7f9659', 4)
    // uliveti a file
    for (let fila = 0; fila < 4; fila++) {
      for (let x = (fila % 2) * 18; x < 1024; x += 36) {
        g.fillStyle = fila > 1 ? '#566b3a' : '#66804a'
        g.beginPath()
        g.arc(x, 286 + fila * 26, 9 + fila * 2.5, 0, Math.PI * 2)
        g.fill()
      }
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
}

function Vetrata() {
  const panorama = usePanorama()
  const montanti = [-5.5, -3.67, -1.83, 0, 1.83, 3.67, 5.5]
  return (
    <group>
      <mesh position={[0, 2.3, -6.6]}>
        <planeGeometry args={[16, 5.2]} />
        <meshBasicMaterial map={panorama ?? undefined} color={panorama ? '#ffffff' : '#cfe2ec'} toneMapped={false} />
      </mesh>
      {/* vetro leggermente riflettente */}
      <mesh position={[0, 2.2, -6.02]}>
        <planeGeometry args={[11, 4.4]} />
        <meshStandardMaterial color="#dfeaf0" transparent opacity={0.08} roughness={0.05} metalness={0.2} />
      </mesh>
      {montanti.map((x) => (
        <mesh key={x} position={[x, 2.2, -6]}>
          <boxGeometry args={[0.06, 4.4, 0.08]} />
          <meshStandardMaterial color={COLORI.nero} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {[0.02, 4.38].map((y) => (
        <mesh key={y} position={[0, y, -6]}>
          <boxGeometry args={[11.06, 0.06, 0.1]} />
          <meshStandardMaterial color={COLORI.nero} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {/* pareti piene ai lati della vetrata */}
      {[-9, 9].map((x) => (
        <mesh key={x} position={[x, 2.2, -6.05]} receiveShadow>
          <boxGeometry args={[7, 4.4, 0.12]} />
          <meshStandardMaterial color={COLORI.parete} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** Parete a listelli verde oliva dietro la libreria: il tocco "studio di design". */
function Listelli() {
  const listelli = useMemo(() => Array.from({ length: 32 }, (_, i) => -12.3 + i * 0.2), [])
  return (
    <group position={[0, 0, -5.96]}>
      <mesh position={[-8.9, 2.2, -0.02]}>
        <boxGeometry args={[6.6, 4.4, 0.02]} />
        <meshStandardMaterial color={COLORI.olivaScuro} roughness={0.9} />
      </mesh>
      {listelli.map((x) => (
        <mesh key={x} position={[x + 0.6, 2.2, 0.03]}>
          <boxGeometry args={[0.1, 4.4, 0.06]} />
          <meshStandardMaterial color={COLORI.oliva} roughness={0.75} />
        </mesh>
      ))}
    </group>
  )
}

function Pianta({ posizione, scala = 1, alta = false }: { posizione: [number, number, number]; scala?: number; alta?: boolean }) {
  const ombre = useQualita() === 'completa'
  return (
    <group position={posizione} scale={scala}>
      <mesh position={[0, alta ? 0.42 : 0.24, 0]} castShadow={ombre}>
        <cylinderGeometry args={[0.26, 0.22, alta ? 0.84 : 0.48, 24]} />
        <meshStandardMaterial color={COLORI.nero} roughness={0.5} />
      </mesh>
      {(alta
        ? [
            [0, 1.5, 0, 0.42],
            [0.25, 1.2, 0.1, 0.32],
            [-0.24, 1.3, -0.06, 0.34],
            [0.05, 1.9, -0.05, 0.3],
            [-0.1, 2.15, 0.08, 0.22],
          ]
        : [
            [0, 0.85, 0, 0.36],
            [0.2, 0.72, 0.08, 0.26],
            [-0.18, 0.78, -0.05, 0.28],
          ]
      ).map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow={ombre}>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={i % 2 ? '#4d6d33' : '#5f8240'} roughness={0.8} flatShading />
        </mesh>
      ))}
      {alta && (
        <mesh position={[0, 1.0, 0]}>
          <cylinderGeometry args={[0.025, 0.035, 1.2, 8]} />
          <meshStandardMaterial color="#6b5440" />
        </mesh>
      )}
    </group>
  )
}

/** Libreria divisoria: un libro per ogni fonte in biblioteca, colorato per stato. */
function Libreria() {
  const fonti = useStudio((s) => s.progetto.fonti)
  const vai = useStudio((s) => s.vai)
  const ombre = useQualita() === 'completa'
  const libri = useMemo(() => {
    const colori: Record<string, string> = { da_leggere: '#c9bfa8', letta: '#4f8fbf', usata: '#6b7d2e', scartata: '#a4553a' }
    return fonti.slice(0, 80).map((f, i) => ({
      id: f.id,
      ripiano: Math.floor(i / 20),
      x: -1.0 + (i % 20) * 0.1,
      h: 0.27 + ((f.numero * 7) % 5) * 0.025,
      colore: colori[f.stato] ?? '#c9bfa8',
    }))
  }, [fonti])
  return (
    <group position={[-10.4, 0, -4.6]} rotation={[0, 0.5, 0]}>
      {[-1.15, 1.15].map((x) => (
        <mesh key={x} position={[x, 1.25, 0]} castShadow={ombre}>
          <boxGeometry args={[0.04, 2.5, 0.4]} />
          <meshStandardMaterial color={COLORI.nero} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {[0.1, 0.72, 1.34, 1.96, 2.48].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow={ombre} receiveShadow>
          <boxGeometry args={[2.3, 0.035, 0.38]} />
          <meshStandardMaterial color={COLORI.rovere} roughness={0.6} />
        </mesh>
      ))}
      {libri.map((l) => (
        <mesh key={l.id} position={[l.x, 0.12 + l.ripiano * 0.62 + l.h / 2, 0.02]} castShadow={ombre}>
          <boxGeometry args={[0.075, l.h, 0.28]} />
          <meshStandardMaterial color={l.colore} roughness={0.7} />
        </mesh>
      ))}
      <Html position={[0, 2.85, 0]} center distanceFactor={11} zIndexRange={[20, 10]}>
        <button type="button" className="etichetta-scena etichetta-arredo" onClick={() => vai('biblioteca')}>
          <strong>Biblioteca</strong>
          <span>{fonti.length} fonti</span>
        </button>
      </Html>
    </group>
  )
}

/** Grande schermo a parete con l'avanzamento in pagine di ogni capitolo. */
function Schermo() {
  const progetto = useStudio((s) => s.progetto)
  const vai = useStudio((s) => s.vai)
  const a = useMemo(() => avanzamento(progetto), [progetto])
  const righe = a.capitoli.slice(0, 8)
  return (
    <group position={[8.4, 2.25, -5.92]}>
      <RoundedBox args={[3.4, 2.0, 0.08]} radius={0.04} smoothness={3}>
        <meshStandardMaterial color="#141619" roughness={0.3} metalness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[3.24, 1.84]} />
        <meshStandardMaterial color="#20252b" emissive="#1b2a33" emissiveIntensity={0.6} />
      </mesh>
      {righe.map((c, i) => {
        const quota = Math.min(1, c.pagine / Math.max(1, c.obiettivoMin))
        const colore = COLORE_STATO[progetto.capitoli[i]?.stato ?? 'da_fare']
        const y = 0.45 - i * (1.2 / Math.max(1, righe.length))
        const largh = 2.6
        return (
          <group key={c.id} position={[0.15, y, 0.05]}>
            <mesh>
              <planeGeometry args={[largh, 0.07]} />
              <meshBasicMaterial color="#39424b" />
            </mesh>
            <mesh position={[-largh / 2 + (largh * Math.max(0.015, quota)) / 2, 0, 0.002]}>
              <planeGeometry args={[largh * Math.max(0.015, quota), 0.07]} />
              <meshBasicMaterial color={colore} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
      <Html position={[0, 1.3, 0.1]} center distanceFactor={11} zIndexRange={[20, 10]}>
        <button type="button" className="etichetta-scena etichetta-arredo" onClick={() => vai('cruscotto')}>
          <strong>La tesi</strong>
          <span>
            {a.pagine.toLocaleString('it-IT', { maximumFractionDigits: 1 })} di {a.pagineMin}–{a.pagineMax} pagine
          </span>
        </button>
      </Html>
    </group>
  )
}

/** Angolo relax: divano, poltrona, tavolino e tappeto. */
function Relax() {
  const ombre = useQualita() === 'completa'
  return (
    <group position={[-7.5, 0, -3.3]} rotation={[0, 0.55, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.2, 0.006, 0.7]} receiveShadow>
        <circleGeometry args={[1.9, 48]} />
        <meshStandardMaterial color="#e2ddd2" roughness={0.95} />
      </mesh>
      <RoundedBox args={[2.3, 0.42, 0.9]} radius={0.12} position={[0, 0.3, 0]} castShadow={ombre}>
        <meshStandardMaterial color={COLORI.tessuto} roughness={0.95} />
      </RoundedBox>
      <RoundedBox args={[2.3, 0.6, 0.24]} radius={0.1} position={[0, 0.66, -0.36]} castShadow={ombre}>
        <meshStandardMaterial color={COLORI.tessuto} roughness={0.95} />
      </RoundedBox>
      {[-1.12, 1.12].map((x) => (
        <RoundedBox key={x} args={[0.2, 0.55, 0.9]} radius={0.08} position={[x, 0.42, 0]} castShadow={ombre}>
          <meshStandardMaterial color={COLORI.tessuto} roughness={0.95} />
        </RoundedBox>
      ))}
      <RoundedBox args={[0.5, 0.36, 0.16]} radius={0.07} position={[-0.6, 0.66, -0.15]} rotation={[-0.25, 0.2, 0]}>
        <meshStandardMaterial color={COLORI.oliva} roughness={0.9} />
      </RoundedBox>
      {/* tavolino */}
      <mesh position={[0.2, 0.4, 1.25]} castShadow={ombre}>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 40]} />
        <meshStandardMaterial color={COLORI.rovere} roughness={0.5} />
      </mesh>
      <mesh position={[0.2, 0.2, 1.25]}>
        <cylinderGeometry args={[0.04, 0.04, 0.4, 10]} />
        <meshStandardMaterial color={COLORI.nero} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0.35, 0.44, 1.2]}>
        <boxGeometry args={[0.32, 0.03, 0.24]} />
        <meshStandardMaterial color="#c75b3c" roughness={0.8} />
      </mesh>
    </group>
  )
}

/** Tavolo riunioni rotondo con sedie. */
function Riunioni() {
  const ombre = useQualita() === 'completa'
  return (
    <group position={[7.3, 0, -3.0]}>
      <mesh position={[0, 0.74, 0]} castShadow={ombre} receiveShadow>
        <cylinderGeometry args={[0.85, 0.85, 0.04, 48]} />
        <meshStandardMaterial color={COLORI.piano} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.72, 12]} />
        <meshStandardMaterial color={COLORI.nero} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.03, 32]} />
        <meshStandardMaterial color={COLORI.nero} metalness={0.5} roughness={0.4} />
      </mesh>
      {[0, 2.1, 4.2].map((a) => (
        <group key={a} position={[Math.sin(a) * 1.15, 0, Math.cos(a) * 1.15]} rotation={[0, a + Math.PI, 0]}>
          <RoundedBox args={[0.48, 0.07, 0.46]} radius={0.03} position={[0, 0.46, 0]} castShadow={ombre}>
            <meshStandardMaterial color={COLORI.oliva} roughness={0.85} />
          </RoundedBox>
          <RoundedBox args={[0.46, 0.38, 0.06]} radius={0.03} position={[0, 0.72, -0.22]} castShadow={ombre}>
            <meshStandardMaterial color={COLORI.oliva} roughness={0.85} />
          </RoundedBox>
          {[-0.18, 0.18].map((x) =>
            [-0.18, 0.18].map((z) => (
              <mesh key={`${x}${z}`} position={[x, 0.22, z]}>
                <cylinderGeometry args={[0.015, 0.015, 0.44, 6]} />
                <meshStandardMaterial color={COLORI.nero} />
              </mesh>
            )),
          )}
        </group>
      ))}
    </group>
  )
}

/** Luci lineari sospese sopra le scrivanie. */
function LuciLineari() {
  const completa = useQualita() === 'completa'
  return (
    <group>
      {[
        [-3.1, -1.75, 0.18],
        [3.1, -1.75, -0.18],
      ].map(([x, z, r]) => (
        <group key={x} position={[x, 3.5, z]} rotation={[0, r, 0]}>
          <mesh>
            <boxGeometry args={[3.6, 0.05, 0.12]} />
            <meshStandardMaterial color={COLORI.nero} roughness={0.4} metalness={0.4} />
          </mesh>
          <mesh position={[0, -0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.5, 0.08]} />
            <meshStandardMaterial color="#fff6e3" emissive="#fff1d2" emissiveIntensity={2} side={THREE.DoubleSide} />
          </mesh>
          {[-1.6, 1.6].map((dx) => (
            <mesh key={dx} position={[dx, 0.46, 0]}>
              <cylinderGeometry args={[0.004, 0.004, 0.9, 4]} />
              <meshStandardMaterial color="#444" />
            </mesh>
          ))}
          {completa && <pointLight position={[0, -0.25, 0]} intensity={2.4} distance={6} decay={1.5} color="#fff1d8" />}
        </group>
      ))}
    </group>
  )
}

export function Sala() {
  const ombre = useQualita() === 'completa'
  return (
    <group>
      {/* pavimento in resina chiara */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 22]} />
        <meshStandardMaterial color={COLORI.pavimento} roughness={0.42} metalness={0.02} />
      </mesh>
      {/* tappeto della zona di lavoro */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, -1.5]} receiveShadow>
        <planeGeometry args={[11.5, 3.6]} />
        <meshStandardMaterial color="#c7c1b5" roughness={0.98} />
      </mesh>
      {/* pareti laterali */}
      {[-12.5, 12.5].map((x) => (
        <mesh key={x} position={[x, 2.2, 3]} receiveShadow>
          <boxGeometry args={[0.2, 4.4, 18]} />
          <meshStandardMaterial color={COLORI.parete} roughness={0.92} />
        </mesh>
      ))}
      {/* soffitto con strisce di luce incassate */}
      <mesh position={[0, 4.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[25, 22]} />
        <meshStandardMaterial color="#f4f3ef" emissive="#e9e6df" emissiveIntensity={0.55} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {[-7.5, -2.5, 2.5, 7.5].map((x) => (
        <mesh key={x} position={[x, 4.4, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, 12]} />
          <meshStandardMaterial color="#fffaf0" emissive="#fff6e4" emissiveIntensity={1.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <Vetrata />
      <Listelli />
      <Libreria />
      <Schermo />
      <Relax />
      <Riunioni />
      <LuciLineari />
      <Pianta posizione={[-5.0, 0, -5.3]} alta scala={1.1} />
      <Pianta posizione={[5.1, 0, -5.3]} alta />
      <Pianta posizione={[-9.6, 0, -1.6]} scala={1.2} />
      <Pianta posizione={[10.4, 0, -4.9]} alta scala={0.95} />
      {/* mobile basso sotto la vetrata */}
      <mesh position={[0, 0.3, -5.6]} castShadow={ombre} receiveShadow>
        <boxGeometry args={[5, 0.6, 0.5]} />
        <meshStandardMaterial color={COLORI.piano} roughness={0.4} />
      </mesh>
      <Pianta posizione={[-1.8, 0.6, -5.6]} scala={0.55} />
      <Pianta posizione={[1.6, 0.6, -5.6]} scala={0.5} />
    </group>
  )
}

/** Postazione moderna: piano bianco, gambe nere, monitor sottile di lato, tastiera e accessori. */
export function Scrivania({ colore, schermoAcceso }: { colore: string; schermoAcceso: boolean }) {
  const ombre = useQualita() === 'completa'
  return (
    <group>
      <RoundedBox args={[1.7, 0.04, 0.82]} radius={0.015} smoothness={2} position={[0, 0.74, 0]} castShadow={ombre} receiveShadow>
        <meshStandardMaterial color={COLORI.piano} roughness={0.3} />
      </RoundedBox>
      {/* bordo in rovere */}
      <mesh position={[0, 0.715, 0]}>
        <boxGeometry args={[1.66, 0.025, 0.78]} />
        <meshStandardMaterial color={COLORI.rovere} roughness={0.6} />
      </mesh>
      {[-0.78, 0.78].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {[-0.33, 0.33].map((z) => (
            <mesh key={z} position={[0, 0.36, z]} castShadow={ombre}>
              <boxGeometry args={[0.04, 0.72, 0.04]} />
              <meshStandardMaterial color={COLORI.nero} roughness={0.4} metalness={0.4} />
            </mesh>
          ))}
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.04, 0.04, 0.7]} />
            <meshStandardMaterial color={COLORI.nero} roughness={0.4} metalness={0.4} />
          </mesh>
        </group>
      ))}
      {/* monitor di lato, girato verso la persona: il viso resta libero */}
      <group position={[0.5, 0.76, -0.1]} rotation={[0, Math.PI + 0.55, 0]}>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.22, 0.015, 0.16]} />
          <meshStandardMaterial color={COLORI.nero} metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.17, -0.03]}>
          <boxGeometry args={[0.035, 0.3, 0.025]} />
          <meshStandardMaterial color={COLORI.nero} metalness={0.5} roughness={0.35} />
        </mesh>
        <RoundedBox args={[0.68, 0.4, 0.025]} radius={0.01} position={[0, 0.42, 0]} castShadow={ombre}>
          <meshStandardMaterial color={COLORI.nero} roughness={0.3} metalness={0.3} />
        </RoundedBox>
        <mesh position={[0, 0.42, 0.014]}>
          <planeGeometry args={[0.64, 0.36]} />
          <meshStandardMaterial color="#19212b" emissive={schermoAcceso ? colore : '#1e2e3c'} emissiveIntensity={schermoAcceso ? 0.7 : 0.35} />
        </mesh>
      </group>
      {/* tastiera, mouse, tazza, quaderno */}
      <mesh position={[-0.05, 0.77, -0.22]}>
        <boxGeometry args={[0.42, 0.015, 0.13]} />
        <meshStandardMaterial color="#e8e8e6" roughness={0.5} />
      </mesh>
      <mesh position={[0.25, 0.77, -0.22]} scale={[1, 0.5, 1.5]}>
        <sphereGeometry args={[0.03, 12, 8]} />
        <meshStandardMaterial color="#e8e8e6" roughness={0.5} />
      </mesh>
      <mesh position={[-0.6, 0.81, 0.05]}>
        <cylinderGeometry args={[0.04, 0.037, 0.1, 18]} />
        <meshStandardMaterial color={colore} roughness={0.35} />
      </mesh>
      <mesh position={[-0.42, 0.765, -0.05]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.2, 0.012, 0.28]} />
        <meshStandardMaterial color="#2b2d30" roughness={0.6} />
      </mesh>
    </group>
  )
}
