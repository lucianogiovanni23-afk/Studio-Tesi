import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { AGENT_ORDER } from '../agents'
import { Character } from './Character'
import { Desk } from './Desk'
import { Room } from './Room'

/** Punto verso cui guarda la camera: al centro delle scrivanie, poco sopra il pavimento. */
const TARGET: [number, number, number] = [0, 2.1, -3.3]

export function Scene() {
  return (
    <div className="scene">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 8.2, 10.6], fov: 41, near: 0.1, far: 100 }}
      >
        <color attach="background" args={['#1b2130']} />
        <fog attach="fog" args={['#1b2130', 20, 40]} />

        {/* luce ambientale soffusa + direzionale principale */}
        <ambientLight intensity={0.85} color="#c2cce4" />
        <hemisphereLight args={['#dbe3f7', '#3a2c1e', 0.6]} />
        <directionalLight
          position={[7, 11, 7]}
          intensity={1.45}
          color="#fff3e0"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-bias={-0.0005}
        />
        {/* luce di riempimento frontale, senza ombre */}
        <directionalLight position={[-7, 5, 9]} intensity={0.45} color="#9fb6e8" />
        {/* le luci puntiformi colorate vivono dentro ogni Desk */}

        <Suspense fallback={null}>
          <Room />
          {AGENT_ORDER.map((id) => (
            <Desk key={`desk-${id}`} id={id} />
          ))}
          {AGENT_ORDER.map((id) => (
            <Character key={`char-${id}`} id={id} />
          ))}
        </Suspense>

        {/* vista leggermente dall'alto, con rotazione limitata */}
        <OrbitControls
          target={TARGET}
          enablePan={false}
          minDistance={7}
          maxDistance={22}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.35}
          minAzimuthAngle={-Math.PI / 5}
          maxAzimuthAngle={Math.PI / 5}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>
      <p className="scene-hint">Trascina per ruotare la vista · rotella per lo zoom</p>
    </div>
  )
}
