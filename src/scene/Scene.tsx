import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { AGENTS } from '../agents/definitions'
import { useCoarsePointer } from '../hooks/useLayoutMode'
import { useStudioStore } from '../store'
import { CameraRig, type OrbitControlsLike } from './CameraRig'
import { Office } from './Office'
import { CAMERA_HOME, CAMERA_TARGET } from './layout'

export function Scene() {
  const controls = useRef<OrbitControlsLike | null>(null)
  const coarse = useCoarsePointer()
  const focusCamera = useStudioStore((s) => s.focusCamera)
  const cameraFocus = useStudioStore((s) => s.cameraFocus)
  const closeBubble = useStudioStore((s) => s.closeBubble)

  return (
    <div className="scene">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: CAMERA_HOME, fov: coarse ? 44 : 40, near: 0.1, far: 120 }}
        // Il canvas non deve catturare lo scroll della pagina su iPad.
        style={{ touchAction: 'pan-y' }}
        onPointerMissed={() => closeBubble()}
      >
        <color attach="background" args={['#1b2130']} />
        <fog attach="fog" args={['#1b2130', 26, 52]} />

        <ambientLight intensity={0.6} color="#c2cce4" />
        <hemisphereLight args={['#dbe3f7', '#3a2c1e', 0.5]} />
        <directionalLight
          position={[8, 13, 9]}
          intensity={1.15}
          color="#fff3e0"
          castShadow
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
        {/* luce di riempimento frontale, senza ombre */}
        <directionalLight position={[-8, 6, 11]} intensity={0.4} color="#9fb6e8" />

        <Suspense fallback={null}>
          <Office />
        </Suspense>

        <CameraRig controls={controls} />

        <OrbitControls
          ref={controls as never}
          target={CAMERA_TARGET}
          enablePan={false}
          minDistance={coarse ? 9 : 7}
          maxDistance={coarse ? 26 : 32}
          minPolarAngle={Math.PI / (coarse ? 5.2 : 6)}
          maxPolarAngle={Math.PI / (coarse ? 2.6 : 2.35)}
          minAzimuthAngle={-Math.PI / (coarse ? 6 : 4)}
          maxAzimuthAngle={Math.PI / (coarse ? 6 : 4)}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      <div className="scene-tools">
        <button
          type="button"
          className={`chip ${cameraFocus === null ? 'chip-on' : ''}`}
          onClick={() => focusCamera(null)}
        >
          Vista d'insieme
        </button>
        {AGENTS.map((agent) => (
          <button
            key={agent.key}
            type="button"
            className={`chip ${cameraFocus === agent.key ? 'chip-on' : ''}`}
            style={{ borderColor: cameraFocus === agent.key ? agent.color : undefined }}
            onClick={() => focusCamera(agent.key)}
          >
            <span className="chip-dot" style={{ background: agent.color }} />
            {agent.name}
          </button>
        ))}
      </div>

      <p className="scene-hint">
        Trascina per ruotare · pizzica o usa la rotella per lo zoom · tocca un agente per aprire la
        sua nuvoletta di ragionamento
      </p>
    </div>
  )
}
