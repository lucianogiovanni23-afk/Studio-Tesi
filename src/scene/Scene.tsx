import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { AGENTI } from '../agents/agenti'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { useModoUso } from '../hooks/useModoUso'
import { estrazioneInCorso, useStudio } from '../store'
import type { AgentKey } from '../types'
import { Agente3D } from './Agente3D'
import { Ambiente } from './Ambiente'
import { CameraRig, type ControlliOrbita } from './CameraRig'
import { Capitoli3D } from './Capitoli3D'
import { CAMERA_BERSAGLIO, CAMERA_CASA } from './layout'
import { ContestoQualita } from './qualita'
import { Scaffale } from './Scaffale'

/**
 * Lo studio della tesi in 3D: serve da cruscotto e da navigazione. I testi
 * restano nei pannelli 2D; qui si vedono lo stato dei capitoli, la biblioteca
 * e cosa stanno facendo i quattro agenti.
 */
export function Scene({ qualita }: { qualita: 'completa' | 'ridotta' }) {
  const completa = qualita === 'completa'
  const controlli = useRef<ControlliOrbita | null>(null)
  const modo = useModoUso()
  const fermo = useMovimentoRidotto()
  const chiudiNuvoletta = useStudio((s) => s.apriNuvoletta)
  const estrazione = useStudio((s) => estrazioneInCorso(s.progetto))
  const qualcunoLavora = useStudio((s) => Object.values(s.agenti).some((a) => a.status === 'lavoro' || a.status === 'attesa'))
  const [fuoco, setFuoco] = useState<AgentKey | null>(null)
  const [token, setToken] = useState(0)

  const inquadra = (k: AgentKey | null) => {
    setFuoco(k)
    setToken((t) => t + 1)
  }

  // Mentre si estrae il testo dei PDF la scena si ferma: il thread principale serve a pdf.js.
  // Nella versione ridotta, o senza animazioni, si ridisegna solo quando serve.
  const frameloop = estrazione ? 'never' : !completa || fermo ? (qualcunoLavora && !fermo ? 'always' : 'demand') : 'always'

  useEffect(() => () => {
    document.body.style.cursor = ''
  }, [])

  return (
    <div className="scena">
      <Canvas
        frameloop={frameloop}
        shadows={completa}
        dpr={completa ? [1, 2] : 1}
        gl={{ antialias: completa, powerPreference: completa ? 'high-performance' : 'low-power' }}
        camera={{ position: CAMERA_CASA, fov: 42, near: 0.1, far: 260 }}
        // Il canvas non deve catturare lo scroll della pagina sui dispositivi a tocco.
        style={{ touchAction: 'pan-y' }}
        onPointerMissed={() => chiudiNuvoletta(null)}
        onCreated={({ camera }) => camera.lookAt(...CAMERA_BERSAGLIO)}
      >
        <hemisphereLight args={['#fdf6e3', '#b7a77c', completa ? 0.85 : 1.1]} />
        <ambientLight intensity={completa ? 0.35 : 0.55} color="#fff8ea" />
        <directionalLight
          position={[9, 14, 8]}
          intensity={completa ? 1.6 : 1.3}
          color="#fff1d6"
          castShadow={completa}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-bias={-0.0004}
        />
        <fog attach="fog" args={['#eef1e4', 60, 150]} />

        <ContestoQualita.Provider value={qualita}>
          <Suspense fallback={null}>
            <Ambiente />
            <Scaffale />
            <Capitoli3D />
            {AGENTI.map((a) => (
              <Agente3D key={a.key} k={a.key} />
            ))}
          </Suspense>
        </ContestoQualita.Provider>

        <CameraRig controlli={controlli} fuoco={fuoco} token={token} />

        {/* Sul computer si può ruotare a mano; su iPad niente controlli, così il dito scorre la pagina. */}
        {modo === 'computer' && (
          <OrbitControls
            ref={controlli as never}
            target={CAMERA_BERSAGLIO}
            enablePan={false}
            enableZoom={false}
            enableDamping={!fermo}
            dampingFactor={0.08}
            minPolarAngle={Math.PI / 5}
            maxPolarAngle={Math.PI / 2.3}
            minAzimuthAngle={-Math.PI / 5}
            maxAzimuthAngle={Math.PI / 5}
          />
        )}
      </Canvas>

      <div className="scena-comandi" role="toolbar" aria-label="Inquadrature">
        <button type="button" className={`gettone ${fuoco === null ? 'gettone-attivo' : ''}`} onClick={() => inquadra(null)}>
          Vista d'insieme
        </button>
        {AGENTI.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`gettone ${fuoco === a.key ? 'gettone-attivo' : ''}`}
            onClick={() => inquadra(a.key)}
          >
            <span className="punto" style={{ background: a.colore }} />
            {a.nome}
          </button>
        ))}
      </div>
    </div>
  )
}
