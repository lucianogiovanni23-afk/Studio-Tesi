import { Suspense, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { AGENTI } from '../agents/definitions'
import { useCoarsePointer } from '../hooks/useLayoutMode'
import { useStudioStore } from '../store'
import { CameraRig, type ControlliOrbita } from './CameraRig'
import { TradingFloor } from './TradingFloor'
import { CAMERA_BERSAGLIO, CAMERA_CASA } from './layout'
import { ContestoQualita } from './qualita'

export function Scene({ qualita }: { qualita: 'completa' | 'ridotta' }) {
  const completa = qualita === 'completa'
  const controlli = useRef<ControlliOrbita | null>(null)
  const grossolano = useCoarsePointer()
  const inquadra = useStudioStore((s) => s.inquadra)
  const fuoco = useStudioStore((s) => s.fuocoCamera)
  const chiudiNuvoletta = useStudioStore((s) => s.chiudiNuvoletta)
  // Mentre si estrae il testo dei PDF la scena si ferma: il thread principale
  // serve a pdf.js, e nessun agente può lavorare finché il materiale non è pronto.
  const estrazione = useStudioStore((s) =>
    s.courseFiles.some((f) => f.status === 'lettura' || f.status === 'estrazione'),
  )

  const ridotto = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  )

  return (
    <div className="scena">
      <Canvas
        frameloop={estrazione ? 'demand' : 'always'}
        shadows={completa}
        dpr={completa ? [1, 2] : 1}
        gl={{ antialias: completa, powerPreference: completa ? 'high-performance' : 'low-power' }}
        camera={{ position: CAMERA_CASA, fov: grossolano ? 44 : 40, near: 0.1, far: 140 }}
        // Il canvas non deve catturare lo scroll della pagina su iPad.
        style={{ touchAction: 'pan-y' }}
        onPointerMissed={() => chiudiNuvoletta()}
      >
        <color attach="background" args={['#070b12']} />
        <fog attach="fog" args={['#070b12', 26, 56]} />

        {/* luce calda da ufficio serale */}
        {/* senza plafoniere accese, la versione ridotta compensa con più luce ambiente */}
        <ambientLight intensity={completa ? 0.6 : 0.95} color="#d9c9a8" />
        <hemisphereLight args={['#e8d7b4', '#12301f', completa ? 0.55 : 0.8]} />
        <directionalLight
          position={[7, 12, 8]}
          intensity={completa ? 0.95 : 1.2}
          color="#ffe6bd"
          castShadow={completa}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={16}
          shadow-camera-bottom={-16}
          shadow-camera-near={1}
          shadow-camera-far={44}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-8, 6, 11]} intensity={0.3} color="#8fb0d8" />

        <ContestoQualita.Provider value={qualita}>
          <Suspense fallback={null}>
            <TradingFloor />
          </Suspense>
        </ContestoQualita.Provider>

        <CameraRig controlli={controlli} />

        <OrbitControls
          ref={controlli as never}
          target={CAMERA_BERSAGLIO}
          enablePan={false}
          enableDamping={!ridotto}
          dampingFactor={0.08}
          minDistance={grossolano ? 9 : 7}
          maxDistance={grossolano ? 26 : 32}
          minPolarAngle={Math.PI / (grossolano ? 5.2 : 6)}
          maxPolarAngle={Math.PI / (grossolano ? 2.6 : 2.35)}
          minAzimuthAngle={-Math.PI / (grossolano ? 6 : 4)}
          maxAzimuthAngle={Math.PI / (grossolano ? 6 : 4)}
        />
      </Canvas>

      <div className="scena-comandi">
        <button
          type="button"
          className={`gettone ${fuoco === null ? 'gettone-attivo' : ''}`}
          onClick={() => inquadra(null)}
        >
          Vista d'insieme
        </button>
        {AGENTI.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`gettone ${fuoco === a.key ? 'gettone-attivo' : ''}`}
            style={{ borderColor: fuoco === a.key ? a.colore : undefined }}
            onClick={() => inquadra(a.key)}
          >
            <span className="gettone-punto" style={{ background: a.colore }} />
            {a.nome}
          </button>
        ))}
      </div>

      <p className="scena-nota">
        Trascina per ruotare · pizzica o rotella per lo zoom · tocca un broker per il suo ragionamento
      </p>
    </div>
  )
}
