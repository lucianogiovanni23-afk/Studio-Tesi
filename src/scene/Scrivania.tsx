import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { COLORI } from './layout'
import { useNotte, useQualita } from './qualita'
import { textureAlone } from './notte'
import { useRgb } from './rgb'

/**
 * Postazione da "setup" di ultima generazione: scrivania scura con luce LED
 * sul bordo, PC con vetro temperato e ventole RGB, monitor curvo ultrawide
 * su braccio, tastiera meccanica retroilluminata e tappetino XXL.
 */

/** Quello che si vede sul monitor: un'interfaccia scura con il colore della persona. */
interface Schermata {
  texture: THREE.CanvasTexture
  /** Ridisegna la pagina di testo scorsa di `scorrimento` pixel. */
  pagina: (scorrimento: number, cursore: boolean) => void
}

const RIGA = 11
const PAGINA = { x: 96, y: 16, w: 210, h: 160 }

function useSchermata(colore: string): Schermata | null {
  const schermata = useMemo<Schermata | null>(() => {
    if (typeof document === 'undefined') return null
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 192
    const g = c.getContext('2d')
    if (!g) return null
    const sfondo = g.createLinearGradient(0, 0, 512, 192)
    sfondo.addColorStop(0, '#0d1117')
    sfondo.addColorStop(1, '#161b26')
    g.fillStyle = sfondo
    g.fillRect(0, 0, 512, 192)
    // barra laterale
    g.fillStyle = '#1c2230'
    g.fillRect(0, 0, 70, 192)
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i === 1 ? colore : '#2c3446'
      g.fillRect(14, 18 + i * 26, 42, 10)
    }
    // grafico a destra
    g.strokeStyle = colore
    g.lineWidth = 3
    g.beginPath()
    for (let x = 0; x <= 170; x += 10) g.lineTo(326 + x, 120 - Math.sin(x / 26) * 26 - x / 6)
    g.stroke()
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? '#2c3446' : colore
      g.globalAlpha = i % 2 ? 1 : 0.65
      g.fillRect(330 + i * 34, 160 - (20 + ((i * 29) % 30)), 22, 20 + ((i * 29) % 30))
    }
    g.globalAlpha = 1
    const texture = new THREE.CanvasTexture(c)
    texture.colorSpace = THREE.SRGBColorSpace
    // pagina di testo: righe che scorrono mentre la persona scrive
    const pagina = (scorrimento: number, cursore: boolean) => {
      const { x, y, w, h } = PAGINA
      g.fillStyle = '#e9edf3'
      g.fillRect(x, y, w, h)
      g.save()
      g.beginPath()
      g.rect(x, y + 4, w, h - 8)
      g.clip()
      const primo = Math.floor(scorrimento / RIGA)
      const scarto = scorrimento - primo * RIGA
      let ultima = 0
      for (let i = 0; i < 16; i++) {
        const n = primo + i
        const ry = y + 10 + i * RIGA - scarto
        // ogni 9 righe un titoletto nel colore della persona, poi un paragrafo
        const pos = n % 9
        if (pos === 8) continue
        const titolo = pos === 0
        g.fillStyle = titolo ? colore : '#9aa3b2'
        const largh = titolo ? 90 : pos === 7 ? 60 + ((n * 13) % 40) : 120 + ((n * 37) % 60)
        g.fillRect(x + 14, ry, largh, titolo ? 6 : 4)
        if (ry < y + h - 12) ultima = ry
        if (ry >= y + h - 12 && ultima === 0) ultima = ry
      }
      g.restore()
      if (cursore) {
        g.fillStyle = colore
        g.fillRect(x + 14 + 150, Math.min(y + h - 16, ultima) - 3, 3, 10)
      }
      texture.needsUpdate = true
    }
    pagina(0, false)
    return { texture, pagina }
  }, [colore])
  useEffect(() => () => schermata?.texture.dispose(), [schermata])
  return schermata
}

/** Monitor curvo 34" ultrawide: segmento di cilindro, cornice sottilissima, braccio in alluminio. */
function MonitorCurvo({ colore, acceso, lavora }: { colore: string; acceso: boolean; lavora: boolean }) {
  const s = useSchermata(colore)
  const schermata = s?.texture ?? null
  const ombre = useQualita() === 'completa'
  const notte = useNotte()
  const fermo = useMovimentoRidotto()
  const scorre = useRef({ y: 0, attesa: 0, cursore: false, sporca: false })

  // Mentre lavora il testo scorre (a scatti leggeri, ~12 volte al secondo: niente allocazioni).
  useFrame((stato, delta) => {
    if (!s) return
    const r = scorre.current
    if (!lavora || fermo) {
      if (r.sporca) {
        r.sporca = false
        r.y = 0
        s.pagina(0, false)
      }
      return
    }
    r.attesa += delta
    if (r.attesa < 0.08) return
    r.y += r.attesa * 14
    r.attesa = 0
    r.cursore = Math.floor(stato.clock.elapsedTime * 2.5) % 2 === 0
    r.sporca = true
    s.pagina(r.y, r.cursore)
  })
  const R = 1.1
  const L = 0.74
  return (
    <group>
      {/* braccio a morsetto */}
      <mesh position={[0, 0.02, -0.12]}>
        <boxGeometry args={[0.07, 0.04, 0.07]} />
        <meshStandardMaterial color="#c9ccd1" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.2, -0.12]}>
        <cylinderGeometry args={[0.018, 0.018, 0.38, 12]} />
        <meshStandardMaterial color="#c9ccd1" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.39, -0.07]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.12, 10]} />
        <meshStandardMaterial color="#c9ccd1" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* scocca posteriore */}
      <mesh position={[0, 0.4, R]} castShadow={ombre}>
        <cylinderGeometry args={[R + 0.014, R + 0.014, 0.33, 48, 1, true, Math.PI - L / 2 - 0.006, L + 0.012]} />
        <meshStandardMaterial color="#121418" roughness={0.35} metalness={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* pannello */}
      <mesh position={[0, 0.4, R]}>
        <cylinderGeometry args={[R, R, 0.318, 48, 1, true, Math.PI - L / 2, L]} />
        <meshStandardMaterial
          map={schermata ?? undefined}
          color={schermata ? '#ffffff' : '#19212b'}
          emissive="#ffffff"
          emissiveMap={schermata ?? undefined}
          emissiveIntensity={notte ? (acceso ? 1.35 : 0.7) : acceso ? 0.95 : 0.4}
          roughness={0.25}
          side={THREE.BackSide}
          toneMapped={false}
        />
      </mesh>
      {/* striscia luminosa sul retro, verso la parete */}
      <mesh position={[0, 0.4, R]}>
        <cylinderGeometry args={[R + 0.018, R + 0.018, 0.012, 48, 1, true, Math.PI - L / 2 + 0.05, L - 0.1]} />
        <meshBasicMaterial color={colore} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {notte && (
        <>
          {/* bagliore dello schermo sulla parete e sul piano */}
          <mesh position={[0, 0.4, -0.06]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[1.25, 0.75]} />
            <meshBasicMaterial map={textureAlone() ?? undefined} color={acceso ? '#8fb4ff' : '#4a5f99'} transparent opacity={acceso ? 0.5 : 0.28} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.4, -0.08]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.9, 0.42]} />
            <meshBasicMaterial map={textureAlone() ?? undefined} color={colore} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          {ombre && <pointLight position={[0, 0.4, 0.35]} intensity={acceso ? 0.9 : 0.45} distance={1.8} decay={2} color="#a9c4ff" />}
        </>
      )}
    </group>
  )
}

/** Ventola RGB che gira. */
function Ventola({ posizione, materiale, gira }: { posizione: [number, number, number]; materiale: (m: THREE.MeshBasicMaterial | null) => void; gira: boolean }) {
  const pale = useRef<THREE.Group>(null)
  useFrame((_, d) => {
    if (gira && pale.current) pale.current.rotation.z += d * 9
  })
  return (
    <group position={posizione}>
      <mesh>
        <torusGeometry args={[0.058, 0.008, 8, 32]} />
        <meshBasicMaterial ref={materiale} toneMapped={false} />
      </mesh>
      <group ref={pale}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <mesh key={i} rotation={[0, 0, (i / 7) * Math.PI * 2]} position={[0, 0, -0.004]}>
            <boxGeometry args={[0.012, 0.05, 0.004]} />
            <meshStandardMaterial color="#20232a" roughness={0.5} transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0, -0.002]}>
        <circleGeometry args={[0.016, 16]} />
        <meshStandardMaterial color="#2a2e36" />
      </mesh>
    </group>
  )
}

/** Case con vetro temperato su due lati, tre ventole frontali, scheda video e RAM illuminate. */
function PcGaming({ colore, sfasamento }: { colore: string; sfasamento: number }) {
  const completa = useQualita() === 'completa'
  const notte = useNotte()
  const fermo = useMovimentoRidotto()
  const rgb = useRgb(sfasamento)
  const W = 0.24
  const H = 0.5
  const D = 0.44
  return (
    <group>
      {/* telaio */}
      <RoundedBox args={[W, 0.03, D]} radius={0.01} position={[0, 0.015, 0]} castShadow={completa}>
        <meshStandardMaterial color="#111317" roughness={0.4} metalness={0.6} />
      </RoundedBox>
      <RoundedBox args={[W, 0.03, D]} radius={0.01} position={[0, H - 0.015, 0]}>
        <meshStandardMaterial color="#111317" roughness={0.4} metalness={0.6} />
      </RoundedBox>
      <mesh position={[-W / 2 + 0.01, H / 2, 0]}>
        <boxGeometry args={[0.02, H, D]} />
        <meshStandardMaterial color="#14161b" roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh position={[0, H / 2, -D / 2 + 0.01]}>
        <boxGeometry args={[W, H, 0.02]} />
        <meshStandardMaterial color="#14161b" roughness={0.45} metalness={0.5} />
      </mesh>
      {/* interno: scheda madre, scheda video, RAM, dissipatore */}
      <mesh position={[-W / 2 + 0.025, H / 2, 0]}>
        <boxGeometry args={[0.01, H - 0.08, D - 0.08]} />
        <meshStandardMaterial color="#1b1f27" roughness={0.6} />
      </mesh>
      <RoundedBox args={[0.13, 0.05, 0.3]} radius={0.008} position={[-0.03, 0.2, -0.02]}>
        <meshStandardMaterial color="#23262d" roughness={0.35} metalness={0.7} />
      </RoundedBox>
      <mesh position={[0.036, 0.2, -0.02]}>
        <boxGeometry args={[0.002, 0.012, 0.26]} />
        <meshBasicMaterial ref={rgb(0)} toneMapped={false} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.07, 0.36, -0.13 + i * 0.022]}>
          <boxGeometry args={[0.03, 0.07, 0.008]} />
          <meshBasicMaterial ref={rgb(1 + i)} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[-0.06, 0.36, 0.04]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 24]} />
        <meshStandardMaterial color={colore} emissive={colore} emissiveIntensity={0.6} roughness={0.3} />
      </mesh>
      {/* tre ventole sul frontale */}
      {[0.12, 0.25, 0.38].map((y, i) => (
        <Ventola key={y} posizione={[0.005, y, D / 2 - 0.03]} materiale={rgb(5 + i) as (m: THREE.MeshBasicMaterial | null) => void} gira={!fermo} />
      ))}
      {/* vetri temperati: frontale e laterale */}
      <mesh position={[0, H / 2, D / 2 - 0.004]}>
        <boxGeometry args={[W - 0.01, H - 0.04, 0.006]} />
        <meshPhysicalMaterial color="#9fb0c4" transparent opacity={0.16} roughness={0.05} metalness={0.1} clearcoat={1} />
      </mesh>
      <mesh position={[W / 2 - 0.003, H / 2, 0]}>
        <boxGeometry args={[0.006, H - 0.04, D - 0.02]} />
        <meshPhysicalMaterial color="#9fb0c4" transparent opacity={0.14} roughness={0.05} metalness={0.1} clearcoat={1} />
      </mesh>
      {/* striscia LED sotto il case */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W + 0.04, D + 0.04]} />
        <meshBasicMaterial ref={rgb(8)} transparent opacity={0.35} toneMapped={false} />
      </mesh>
      {completa && <pointLight position={[0, H / 2, 0]} intensity={notte ? 1.3 : 0.35} distance={notte ? 1.6 : 0.9} color={colore} />}
      {notte && (
        <>
          {/* alone RGB: un finto "bloom" senza post-processing */}
          <sprite position={[0.02, H / 2, D / 2 + 0.02]} scale={[0.75, 0.9, 1]}>
            <spriteMaterial ref={rgb(9) as never} map={textureAlone() ?? undefined} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
          <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial ref={rgb(10)} map={textureAlone() ?? undefined} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  )
}

/** Tastiera meccanica con retroilluminazione che scorre. */
function Tastiera({ sfasamento }: { sfasamento: number }) {
  const rgb = useRgb(sfasamento + 0.3, 0.08, 0.6)
  const tasti = useMemo(() => {
    const t: [number, number][] = []
    for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) t.push([-0.196 + c * 0.028, -0.05 + r * 0.025])
    return t
  }, [])
  return (
    <group>
      <RoundedBox args={[0.44, 0.022, 0.14]} radius={0.006} position={[0, 0.011, 0]}>
        <meshStandardMaterial color="#16181d" roughness={0.4} metalness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0.0225, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.42, 0.125]} />
        <meshBasicMaterial ref={rgb(0)} toneMapped={false} />
      </mesh>
      {tasti.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.03, z]}>
          <boxGeometry args={[0.022, 0.014, 0.02]} />
          <meshStandardMaterial color="#202329" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

export function Scrivania({
  colore,
  schermoAcceso,
  lavora = false,
  sfasamento = 0,
}: {
  colore: string
  schermoAcceso: boolean
  lavora?: boolean
  sfasamento?: number
}) {
  const ombre = useQualita() === 'completa'
  const notte = useNotte()
  const led = useRgb(sfasamento + 0.5, 0.05, 0.55)
  return (
    <group>
      {/* piano in laminato grafite con bordo smussato */}
      <RoundedBox args={[1.8, 0.045, 0.86]} radius={0.018} smoothness={3} position={[0, 0.74, 0]} castShadow={ombre} receiveShadow>
        <meshStandardMaterial color="#25282d" roughness={0.45} metalness={0.15} />
      </RoundedBox>
      {/* striscia LED sotto il bordo, verso la sala */}
      <mesh position={[0, 0.712, 0.425]}>
        <boxGeometry args={[1.7, 0.008, 0.008]} />
        <meshBasicMaterial ref={led(0)} toneMapped={false} />
      </mesh>
      {notte && (
        // luce del LED che cade sul pavimento davanti alla scrivania
        <mesh position={[0, 0.012, 0.55]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.4, 1.1]} />
          <meshBasicMaterial ref={led(1)} map={textureAlone() ?? undefined} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {/* gambe a portale in alluminio scuro, regolabili in altezza */}
      {[-0.8, 0.8].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.36, 0]} castShadow={ombre}>
            <boxGeometry args={[0.07, 0.72, 0.07]} />
            <meshStandardMaterial color="#1a1c20" roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.06, 0.2, 0.06]} />
            <meshStandardMaterial color="#3a3e45" roughness={0.3} metalness={0.8} />
          </mesh>
          <RoundedBox args={[0.08, 0.035, 0.72]} radius={0.012} position={[0, 0.018, 0]}>
            <meshStandardMaterial color="#1a1c20" roughness={0.35} metalness={0.7} />
          </RoundedBox>
        </group>
      ))}
      {/* tappetino XXL */}
      <RoundedBox args={[1.1, 0.004, 0.36]} radius={0.002} position={[0.05, 0.765, -0.2]}>
        <meshStandardMaterial color="#121418" roughness={0.95} />
      </RoundedBox>
      <mesh position={[0.05, 0.768, -0.02]}>
        <boxGeometry args={[1.1, 0.002, 0.004]} />
        <meshBasicMaterial color={colore} toneMapped={false} />
      </mesh>

      {/* monitor curvo di lato, girato verso la persona: il viso resta libero */}
      <group position={[0.56, 0.76, -0.14]} rotation={[0, Math.PI + 0.95, 0]}>
        <MonitorCurvo colore={colore} acceso={schermoAcceso} lavora={lavora} />
      </group>
      {/* PC sul piano, vetro verso la sala */}
      <group position={[-0.66, 0.763, 0.1]} rotation={[0, 0.25, 0]}>
        <PcGaming colore={colore} sfasamento={sfasamento} />
      </group>
      {/* tastiera, mouse, cuffie */}
      <group position={[-0.02, 0.767, -0.24]}>
        <Tastiera sfasamento={sfasamento} />
      </group>
      <group position={[0.3, 0.77, -0.24]}>
        <mesh scale={[1, 0.45, 1.6]}>
          <sphereGeometry args={[0.032, 16, 12]} />
          <meshStandardMaterial color="#16181d" roughness={0.35} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.012, -0.01]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.006, 0.03]} />
          <meshBasicMaterial color={colore} toneMapped={false} />
        </mesh>
      </group>
      {/* supporto cuffie */}
      <group position={[0.78, 0.765, 0.22]}>
        <mesh position={[0, 0.005, 0]}>
          <cylinderGeometry args={[0.05, 0.055, 0.01, 24]} />
          <meshStandardMaterial color={COLORI.nero} metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.27, 8]} />
          <meshStandardMaterial color={COLORI.nero} metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.27, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.075, 0.012, 10, 24, Math.PI]} />
          <meshStandardMaterial color="#1d2025" roughness={0.5} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, 0.2, s * 0.075]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.035, 20]} />
            <meshStandardMaterial color="#1d2025" roughness={0.5} emissive={colore} emissiveIntensity={0.15} />
          </mesh>
        ))}
      </group>
      {/* tazza */}
      <mesh position={[-0.35, 0.81, -0.02]}>
        <cylinderGeometry args={[0.038, 0.034, 0.09, 18]} />
        <meshStandardMaterial color={colore} roughness={0.35} />
      </mesh>
    </group>
  )
}
