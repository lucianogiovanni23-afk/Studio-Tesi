import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ContactShadows, Environment, Html, Lightformer, OrbitControls } from '@react-three/drei'
import { AGENTE, AGENTI } from '../agents/agenti'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { useModoUso } from '../hooks/useModoUso'
import { estrazioneInCorso, useStudio } from '../store'
import type { AgentKey } from '../types'
import { Sala } from './Arredamento'
import { Scrivania } from './Scrivania'
import { CameraRig, type ControlliOrbita } from './CameraRig'
import { CAMERA_BERSAGLIO, CAMERA_CASA, DIETRO_SCRIVANIA, POSTAZIONI } from './layout'
import { Persona3D } from './Persona3D'
import { ContestoQualita } from './qualita'

const STATO = {
  riposo: '',
  lavoro: 'sta lavorando…',
  attesa: 'aspetta te',
  fatto: 'ha finito',
  errore: 'ha un problema',
}

/** Una postazione: scrivania, persona, cartellino con nome e ruolo. */
function Postazione({ k, scelta, primoPiano, onScegli }: { k: AgentKey; scelta: boolean; primoPiano: boolean; onScegli: (k: AgentKey) => void }) {
  const def = AGENTE[k]
  const runtime = useStudio((s) => s.agenti[k])
  const completa = useStudio((s) => s.preferenze.modalitaScena) !== 'ridotta'
  const { scrivania, rotazione } = POSTAZIONI[k]
  const lavora = runtime.status === 'lavoro'
  const [sopra, setSopra] = useState(false)
  const cursore = (attivo: boolean) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    setSopra(attivo)
    document.body.style.cursor = attivo ? 'pointer' : ''
  }

  return (
    <group position={[scrivania[0], 0, scrivania[1]]} rotation={[0, rotazione, 0]}>
      <group
        onClick={(e) => {
          e.stopPropagation()
          onScegli(k)
        }}
        onPointerOver={cursore(true)}
        onPointerOut={cursore(false)}
      >
        <Scrivania colore={def.colore} schermoAcceso={lavora || scelta} sfasamento={scrivania[0] / 10} />
        <group position={[0, 0, DIETRO_SCRIVANIA]}>
          <Persona3D persona={def.persona} lavora={lavora} scelta={scelta} parla={scelta} sfasamento={scrivania[0]} ombre={completa} />
        </group>
        {/* alone a terra per chi stai ascoltando */}
        {(scelta || sopra) && (
          <mesh position={[0, 0.012, DIETRO_SCRIVANIA + 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.95, 1.08, 48]} />
            <meshBasicMaterial color={def.colore} transparent opacity={scelta ? 0.85 : 0.45} />
          </mesh>
        )}
      </group>
      {!primoPiano && (
      <Html position={[0, 1.8, DIETRO_SCRIVANIA]} center distanceFactor={9} zIndexRange={[30, 10]} pointerEvents="none">
        <button
          type="button"
          className={`etichetta-scena cartellino ${scelta ? 'cartellino-scelto' : ''} stato-${runtime.status}`}
          style={{ borderColor: def.colore }}
          onClick={() => onScegli(k)}
          aria-pressed={scelta}
        >
          <strong>{def.persona.nome}</strong>
          <span>{def.persona.titolo}</span>
          {STATO[runtime.status] && <em>{runtime.etichetta || STATO[runtime.status]}</em>}
        </button>
      </Html>
      )}
    </group>
  )
}

/**
 * L'ufficio: quattro scrivanie con le persone che interpretano gli agenti.
 * Toccando una persona la scegli e la telecamera si avvicina; la
 * conversazione con lei sta nel pannello accanto.
 */
/**
 * Sposta il centro ottico verso sinistra quando a destra c'è il pannello
 * della conversazione: la sala resta centrata nello spazio libero.
 */
function CentroOttico({ spostamento }: { spostamento: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalida = useThree((s) => s.invalidate)
  useEffect(() => {
    if (spostamento > 0 && size.width > spostamento * 1.6) camera.setViewOffset(size.width + spostamento, size.height, spostamento, 0, size.width, size.height)
    else camera.clearViewOffset()
    invalida()
    return () => camera.clearViewOffset()
  }, [camera, size.width, size.height, spostamento, invalida])
  return null
}

export function Scene({ qualita, spazioDestra = 0 }: { qualita: 'completa' | 'ridotta'; spazioDestra?: number }) {
  const completa = qualita === 'completa'
  const controlli = useRef<ControlliOrbita | null>(null)
  const modo = useModoUso()
  const fermo = useMovimentoRidotto()
  const scelto = useStudio((s) => s.agenteUfficio)
  const scegli = useStudio((s) => s.scegliAgente)
  const inquadratura = useStudio((s) => s.inquadratura)
  const estrazione = useStudio((s) => estrazioneInCorso(s.progetto))
  // All'avvio si vede tutta la sala; quando scegli una persona la telecamera la raggiunge.
  const [vista, setVista] = useState<AgentKey | null>(null)
  const [token, setToken] = useState(0)
  const [inquadraturaPrima, setInquadraturaPrima] = useState(inquadratura)

  if (inquadraturaPrima !== inquadratura) {
    setInquadraturaPrima(inquadratura)
    setVista(scelto)
    setToken((t) => t + 1)
  }

  useEffect(() => () => {
    document.body.style.cursor = ''
  }, [])

  const frameloop = estrazione ? 'never' : fermo ? 'demand' : 'always'

  return (
    <div className="scena scena-ufficio">
      <Canvas
        frameloop={frameloop}
        shadows={completa ? 'soft' : false}
        dpr={completa ? [1, 2] : 1}
        gl={{ antialias: true, powerPreference: completa ? 'high-performance' : 'low-power' }}
        camera={{ position: CAMERA_CASA, fov: 44, near: 0.1, far: 120 }}
        style={{ touchAction: 'pan-y' }}
        onCreated={({ camera }) => camera.lookAt(...CAMERA_BERSAGLIO)}
      >
        <color attach="background" args={['#eef0ee']} />
        <fog attach="fog" args={['#eef0ee', 26, 48]} />
        {/* luce d'ambiente generata in locale: riflessi morbidi senza scaricare niente */}
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={2.2} color="#fff6e8" position={[0, 3, -9]} scale={[16, 5, 1]} />
          <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 8, 1]} />
          <Lightformer form="rect" intensity={0.6} color="#dfe7ee" position={[-10, 3, 2]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
          <Lightformer form="rect" intensity={0.6} color="#fff0dc" position={[10, 3, 2]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
        </Environment>
        <hemisphereLight args={['#ffffff', '#b9ae9c', completa ? 0.45 : 0.9]} />
        <directionalLight
          position={[4, 9, 9]}
          intensity={completa ? 1.25 : 1.1}
          color="#fff4e6"
          castShadow={completa}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-13}
          shadow-camera-right={13}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-camera-near={1}
          shadow-camera-far={35}
          shadow-bias={-0.0003}
          shadow-normalBias={0.02}
        />
        {/* luce dalla vetrata, alle spalle delle persone */}
        <directionalLight position={[0, 5, -10]} intensity={0.55} color="#e9f2ff" />
        <ContestoQualita.Provider value={qualita}>
          <Suspense fallback={null}>
            <Sala etichette={vista === null} />
            {AGENTI.map((a) => (
              <Postazione key={a.key} k={a.key} scelta={scelto === a.key} primoPiano={vista === a.key} onScegli={scegli} />
            ))}
            {completa && <ContactShadows position={[0, 0.01, 0]} scale={30} resolution={1024} blur={2.4} opacity={0.38} far={3} frames={1} />}
          </Suspense>
        </ContestoQualita.Provider>

        <CentroOttico spostamento={spazioDestra} />
        <CameraRig controlli={controlli} fuoco={vista} token={token} />
        {modo === 'computer' && (
          <OrbitControls
            ref={controlli as never}
            target={CAMERA_BERSAGLIO}
            enablePan={false}
            enableZoom={false}
            enableDamping={!fermo}
            dampingFactor={0.08}
            minPolarAngle={1.2}
            maxPolarAngle={Math.PI / 2.15}
            minAzimuthAngle={-Math.PI / 5}
            maxAzimuthAngle={Math.PI / 5}
          />
        )}
      </Canvas>

      <div className="scena-comandi" role="toolbar" aria-label="Inquadrature">
        {vista !== null && (
          <button
            type="button"
            className="gettone gettone-sala"
            onClick={() => {
              setVista(null)
              setToken((t) => t + 1)
            }}
          >
            ← Tutta la sala
          </button>
        )}
      </div>
    </div>
  )
}
