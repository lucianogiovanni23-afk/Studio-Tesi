import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { MeshReflectorMaterial, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { avanzamento } from '../domain/avanzamento'
import { useStudio } from '../store'
import { ALTEZZA_SALA as H, COLORI, COLORE_STATO, PARETE_FONDO_Z, PORTA } from './layout'
import { useNotte, useQualita } from './qualita'
import { Etichetta } from './Etichetta'
import { textureAlone } from './notte'
import { uvMetriche, useMateriali } from './materiali'

/**
 * Arredamento dell'open space: vetrata a tutta parete sulla campagna
 * calabrese, pavimento in resina chiara, parete a listelli verde oliva,
 * libreria divisoria, schermo con l'avanzamento, zona relax e luci lineari.
 */

/** La campagna oltre la vetrata è un vero esterno 3D, caricato a parte solo con la scena. */
const Esterno = lazy(() => import('./esterno/Esterno'))

function Vetrata() {
  const notte = useNotte()
  const qualita = useQualita()
  const montanti = [-5.5, -3.67, -1.83, 0, 1.83, 3.67, 5.5]
  return (
    <group>
      <Suspense fallback={null}>
        <Esterno qualita={qualita} />
      </Suspense>
      {/* vetro leggermente riflettente */}
      <mesh position={[0, H / 2, -6.02]}>
        <planeGeometry args={[11, H]} />
        <meshStandardMaterial color={notte ? '#8ea2d8' : '#dfeaf0'} transparent opacity={notte ? 0.12 : 0.08} roughness={0.05} metalness={0.2} />
      </mesh>
      {montanti.map((x) => (
        <mesh key={x} position={[x, H / 2, -6]}>
          <boxGeometry args={[0.06, H, 0.08]} />
          <meshStandardMaterial color={COLORI.nero} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {[0.02, 4.4, H - 0.03].map((y) => (
        <mesh key={y} position={[0, y, -6]}>
          <boxGeometry args={[11.06, 0.06, 0.1]} />
          <meshStandardMaterial color={COLORI.nero} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {/* pareti piene ai lati della vetrata */}
      {[-9, 9].map((x) => (
        <mesh key={x} position={[x, H / 2, -6.05]} receiveShadow>
          <boxGeometry args={[7, H, 0.12]} />
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
      <mesh position={[-8.9, H / 2, -0.02]}>
        <boxGeometry args={[6.6, H, 0.02]} />
        <meshStandardMaterial color={COLORI.olivaScuro} roughness={0.9} />
      </mesh>
      {listelli.map((x) => (
        <mesh key={x} position={[x + 0.6, H / 2, 0.03]}>
          <boxGeometry args={[0.1, H, 0.06]} />
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
function Libreria({ etichetta }: { etichetta: boolean }) {
  const fonti = useStudio((s) => s.progetto.fonti)
  const vai = useStudio((s) => s.vai)
  const ombre = useQualita() === 'completa'
  const mat = useMateriali()
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
        <mesh key={x} ref={uvMetriche(0.4)} position={[x, 1.25, 0]} castShadow={ombre} material={mat.metallo('#26282c')}>
          <boxGeometry args={[0.04, 2.5, 0.4]} />
        </mesh>
      ))}
      {[0.1, 0.72, 1.34, 1.96, 2.48].map((y) => (
        <mesh key={y} ref={uvMetriche(0.8)} position={[0, y, 0]} castShadow={ombre} receiveShadow material={mat.rovere}>
          <boxGeometry args={[2.3, 0.035, 0.38]} />
        </mesh>
      ))}
      {libri.map((l) => (
        <mesh key={l.id} position={[l.x, 0.12 + l.ripiano * 0.62 + l.h / 2, 0.02]} castShadow={ombre}>
          <boxGeometry args={[0.075, l.h, 0.28]} />
          <meshStandardMaterial color={l.colore} roughness={0.7} />
        </mesh>
      ))}
      {etichetta && (
      <Etichetta position={[0, 2.85, 0]} distanceFactor={11} zIndexRange={[20, 10]}>
        <button type="button" className="etichetta-scena etichetta-arredo" onClick={() => vai('biblioteca')}>
          <strong>Biblioteca</strong>
          <span>{fonti.length} fonti</span>
        </button>
      </Etichetta>
      )}
    </group>
  )
}

/** Grande schermo a parete con l'avanzamento in pagine di ogni capitolo. */
function Schermo({ etichetta }: { etichetta: boolean }) {
  const progetto = useStudio((s) => s.progetto)
  const vai = useStudio((s) => s.vai)
  const a = useMemo(() => avanzamento(progetto), [progetto])
  const righe = a.capitoli.slice(0, 8)
  const notte = useNotte()
  return (
    <group position={[8.4, 2.25, -5.92]}>
      <RoundedBox args={[3.4, 2.0, 0.08]} radius={0.04} smoothness={3}>
        <meshStandardMaterial color="#141619" roughness={0.3} metalness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[3.24, 1.84]} />
        <meshStandardMaterial color="#20252b" emissive="#1b2a33" emissiveIntensity={notte ? 1.6 : 0.6} />
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
      {etichetta && (
      <Etichetta position={[0, 1.3, 0.1]} distanceFactor={11} zIndexRange={[20, 10]}>
        <button type="button" className="etichetta-scena etichetta-arredo" onClick={() => vai('cruscotto')}>
          <strong>La tesi</strong>
          <span>
            {a.pagine.toLocaleString('it-IT', { maximumFractionDigits: 1 })} di {a.pagineMin}–{a.pagineMax} pagine
          </span>
        </button>
      </Etichetta>
      )}
    </group>
  )
}

/** Angolo relax: divano, poltrona, tavolino e tappeto. */
function Relax() {
  const ombre = useQualita() === 'completa'
  const mat = useMateriali()
  const divano = mat.tessuto(COLORI.tessuto)
  const g = uvMetriche(0.25)
  return (
    <group position={[-7.5, 0, -3.3]} rotation={[0, 0.55, 0]}>
      <mesh ref={uvMetriche(0.12)} rotation={[-Math.PI / 2, 0, 0]} position={[0.2, 0.006, 0.7]} receiveShadow material={mat.tessuto('#e2ddd2')}>
        <circleGeometry args={[1.9, 48]} />
      </mesh>
      <RoundedBox ref={g} args={[2.3, 0.42, 0.9]} radius={0.12} position={[0, 0.3, 0]} castShadow={ombre} material={divano} />
      <RoundedBox ref={g} args={[2.3, 0.6, 0.24]} radius={0.1} position={[0, 0.66, -0.36]} castShadow={ombre} material={divano} />
      {[-1.12, 1.12].map((x) => (
        <RoundedBox key={x} ref={g} args={[0.2, 0.55, 0.9]} radius={0.08} position={[x, 0.42, 0]} castShadow={ombre} material={divano} />
      ))}
      {/* cuscini della seduta */}
      {[-0.52, 0.52].map((x) => (
        <RoundedBox key={x} ref={g} args={[1.0, 0.14, 0.7]} radius={0.06} smoothness={4} position={[x, 0.56, 0.06]} castShadow={ombre} material={divano} />
      ))}
      <RoundedBox ref={g} args={[0.5, 0.36, 0.16]} radius={0.07} position={[-0.6, 0.72, -0.15]} rotation={[-0.25, 0.2, 0]} material={mat.tessuto(COLORI.oliva)} />
      {/* tavolino */}
      <mesh ref={uvMetriche(0.8)} position={[0.2, 0.4, 1.25]} castShadow={ombre} material={mat.rovere}>
        <cylinderGeometry args={[0.5, 0.5, 0.04, 40]} />
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
  const mat = useMateriali()
  const stoffa = mat.tessuto(COLORI.oliva)
  const g = uvMetriche(0.25)
  return (
    <group position={[7.3, 0, -3.0]}>
      <mesh ref={uvMetriche(0.9)} position={[0, 0.74, 0]} castShadow={ombre} receiveShadow material={mat.rovere}>
        <cylinderGeometry args={[0.85, 0.85, 0.04, 48]} />
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
          <RoundedBox ref={g} args={[0.48, 0.07, 0.46]} radius={0.03} position={[0, 0.46, 0]} castShadow={ombre} material={stoffa} />
          <RoundedBox ref={g} args={[0.46, 0.38, 0.06]} radius={0.03} position={[0, 0.72, -0.22]} castShadow={ombre} material={stoffa} />
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

/**
 * Soffitto a doppia altezza: lamelle acustiche in rovere sospese, con tagli
 * di luce fra una fila e l'altra. È alto abbastanza da non vederci sopra
 * girando la visuale.
 */
function Soffitto() {
  const notte = useNotte()
  const mat = useMateriali()
  const lamelle = useRef<THREE.InstancedMesh>(null)
  const posizioni = useMemo(() => Array.from({ length: 64 }, (_, i) => -12.2 + i * 0.385), [])
  useLayoutEffect(() => {
    const m = lamelle.current
    if (!m) return
    uvMetriche(1.1)(m)
    const o = new THREE.Object3D()
    posizioni.forEach((x, i) => {
      o.position.set(x, H - 0.32, 1.75)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [posizioni])
  return (
    <group>
      <mesh position={[0, H, 1]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[25, 22]} />
        <meshStandardMaterial color="#e7e4de" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh ref={lamelle} args={[undefined, mat.rovere, posizioni.length]}>
        <boxGeometry args={[0.07, 0.42, 15.5]} />
      </instancedMesh>
      {[-7.5, -2.5, 2.5, 7.5].map((x) => (
        <mesh key={x} position={[x, H - 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.16, 16]} />
          <meshStandardMaterial color="#fffaf0" emissive={notte ? '#ffd9a0' : '#fff6e4'} emissiveIntensity={notte ? 4.5 : 2} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* fascia scura sopra la vetrata */}
      <mesh position={[0, H - 0.2, -5.95]}>
        <boxGeometry args={[25, 0.4, 0.1]} />
        <meshStandardMaterial color="#d9d5ce" roughness={0.85} />
      </mesh>
    </group>
  )
}

/** Luci lineari sospese sopra le scrivanie. */
function LuciLineari() {
  const completa = useQualita() === 'completa'
  const notte = useNotte()
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
            <meshStandardMaterial color="#fff6e3" emissive={notte ? '#ffd29a' : '#fff1d2'} emissiveIntensity={notte ? 5 : 2} side={THREE.DoubleSide} />
          </mesh>
          {[-1.6, 1.6].map((dx) => (
            <mesh key={dx} position={[dx, (H - 3.5) / 2, 0]}>
              <cylinderGeometry args={[0.004, 0.004, H - 3.5, 4]} />
              <meshStandardMaterial color="#444" />
            </mesh>
          ))}
          {completa && <pointLight position={[0, -0.25, 0]} intensity={notte ? 3.2 : 2.4} distance={notte ? 7 : 6} decay={1.5} color={notte ? '#ffcf8f' : '#fff1d8'} />}
          {notte && (
            <mesh position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[4.4, 0.7]} />
              <meshBasicMaterial map={textureAlone() ?? undefined} color="#ffb860" transparent opacity={0.45} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

/** Insegna sopra la porta, disegnata una volta. */
function useInsegna(): THREE.CanvasTexture | null {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 128
    const g = c.getContext('2d')
    if (!g) return null
    g.fillStyle = '#1d1f22'
    g.fillRect(0, 0, 512, 128)
    g.fillStyle = '#f1ead8'
    g.font = '600 54px Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('Studio tesi', 256, 58)
    g.fillStyle = '#9db04c'
    g.fillRect(196, 96, 120, 4)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => tex?.dispose(), [tex])
  return tex
}

/**
 * Parete di fondo con la porta a vetri: non si vede dalla vista d'insieme,
 * ma è da lì che entra la telecamera alla prima visita.
 */
function PareteIngresso() {
  const notte = useNotte()
  const mat = useMateriali()
  const insegna = useInsegna()
  const Z = PARETE_FONDO_Z
  const { larghezza: LP, altezza: HP } = PORTA
  const lato = (25 - LP) / 2
  const listelli = useMemo(() => {
    const l: number[] = []
    for (let x = LP / 2 + 0.35; x < LP / 2 + 3.2; x += 0.19) l.push(x, -x)
    return l
  }, [LP])
  return (
    <group>
      {/* due pezzi di parete ai lati della porta e l'architrave */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (LP / 2 + lato / 2), H / 2, Z]}>
          <boxGeometry args={[lato, H, 0.2]} />
          <meshStandardMaterial color={COLORI.parete} roughness={0.92} />
        </mesh>
      ))}
      <mesh position={[0, (H + HP) / 2, Z]}>
        <boxGeometry args={[LP, H - HP, 0.2]} />
        <meshStandardMaterial color={COLORI.parete} roughness={0.92} />
      </mesh>
      {/* telaio nero */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (LP / 2 + 0.03), HP / 2, Z]}>
          <boxGeometry args={[0.06, HP, 0.26]} />
          <meshStandardMaterial color={COLORI.nero} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, HP + 0.03, Z]}>
        <boxGeometry args={[LP + 0.12, 0.06, 0.26]} />
        <meshStandardMaterial color={COLORI.nero} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* ante a vetro aperte, scivolate dietro la parete */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (LP / 2 + LP / 4 + 0.05), HP / 2, Z + 0.16]} material={mat.vetro}>
          <boxGeometry args={[LP / 2, HP - 0.05, 0.03]} />
        </mesh>
      ))}
      {/* insegna sul lato esterno */}
      <mesh position={[0, HP + 0.55, Z + 0.11]}>
        <planeGeometry args={[2.0, 0.5]} />
        <meshBasicMaterial map={insegna ?? undefined} color={notte ? '#ffffff' : '#f4f1ea'} toneMapped={false} />
      </mesh>
      {/* faretti accanto alla porta, fuori */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (LP / 2 + 0.45), 2.4, Z + 0.19]}>
          <boxGeometry args={[0.12, 0.3, 0.04]} />
          <meshStandardMaterial color="#2a2c30" emissive="#ffcf8a" emissiveIntensity={notte ? 2.4 : 0.6} />
        </mesh>
      ))}
      {/* corridoio fuori dalla sala */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, Z + 4.5]}>
        <planeGeometry args={[25, 9]} />
        <meshStandardMaterial color={notte ? '#9a948a' : '#cfc8bc'} roughness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, Z + 0.75]}>
        <planeGeometry args={[LP - 0.3, 0.9]} />
        <meshStandardMaterial color={COLORI.olivaScuro} roughness={0.95} />
      </mesh>
      {/* facciata esterna: listelli in rovere ai lati della porta e due piante */}
      {listelli.map((x) => (
        <mesh key={x} ref={uvMetriche(1.1)} position={[x, (HP + 0.9) / 2, Z + 0.13]} material={mat.rovere}>
          <boxGeometry args={[0.08, HP + 0.9, 0.06]} />
        </mesh>
      ))}
      <Pianta posizione={[-2.05, 0, Z + 0.75]} alta scala={0.85} />
      <Pianta posizione={[2.05, 0, Z + 0.75]} alta scala={0.85} />
    </group>
  )
}

/** Le etichette dell'arredo si nascondono in primo piano, per non finire sopra la conversazione. */
/** Pavimento in resina: nella qualità completa riflette (sfocato) la sala e le luci. */
function Pavimento() {
  const completa = useQualita() === 'completa'
  const notte = useNotte()
  const mat = useMateriali()
  return (
    <mesh ref={uvMetriche(2.6)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.6]} receiveShadow material={completa ? undefined : mat.resina}>
      <planeGeometry args={[30, 23.2]} />
      {completa && (
        <MeshReflectorMaterial
          map={mat.resinaMappe.map}
          roughnessMap={mat.resinaMappe.roughnessMap}
          color="#bdb5a8"
          roughness={1}
          metalness={0.02}
          resolution={512}
          blur={[420, 140]}
          mixBlur={1}
          mixStrength={notte ? 1.6 : 0.35}
          mixContrast={1}
          mirror={0}
          depthScale={0.8}
          minDepthThreshold={0.35}
          maxDepthThreshold={1.25}
        />
      )}
    </mesh>
  )
}

export function Sala({ etichette = true }: { etichette?: boolean }) {
  const ombre = useQualita() === 'completa'
  const mat = useMateriali()
  return (
    <group>
      <Pavimento />
      {/* tappeto della zona di lavoro */}
      <mesh ref={uvMetriche(0.12)} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, -1.5]} receiveShadow material={mat.tessuto('#c7c1b5')}>
        <planeGeometry args={[11.5, 3.6]} />
      </mesh>
      {/* pareti laterali */}
      {[-12.5, 12.5].map((x) => (
        <mesh key={x} position={[x, H / 2, 3]} receiveShadow>
          <boxGeometry args={[0.2, H, 18]} />
          <meshStandardMaterial color={COLORI.parete} roughness={0.92} />
        </mesh>
      ))}
      <PareteIngresso />
      <Soffitto />
      <Vetrata />
      <Listelli />
      <Libreria etichetta={etichette} />
      <Schermo etichetta={etichette} />
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
