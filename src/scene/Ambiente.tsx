import { useMemo } from 'react'
import * as THREE from 'three'
import { COLORI } from './layout'
import { useQualita } from './qualita'

/** Cupola del cielo con sfumatura dalla linea dell'orizzonte (crema) allo zenit (azzurro). */
function Cielo() {
  const materiale = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          alto: { value: new THREE.Color('#7db4de') },
          basso: { value: new THREE.Color('#f5eedb') },
        },
        vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 alto; uniform vec3 basso; varying vec3 vPos;
          void main(){ float h = clamp(pow(max(normalize(vPos).y, 0.0) * 5.0, 0.7), 0.0, 1.0); gl_FragColor = vec4(mix(basso, alto, h), 1.0);
          #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  return (
    <mesh material={materiale} renderOrder={-1}>
      <sphereGeometry args={[110, 32, 16]} />
    </mesh>
  )
}

/** Uliveto in filari, disegnato con due instancedMesh (tronchi e chiome). */
function Uliveto({ quanti }: { quanti: number }) {
  const alberi = useMemo(() => {
    const fuori: { x: number; z: number; s: number; r: number }[] = []
    // Generatore deterministico: la scena è identica a ogni avvio.
    let seme = 7
    const caso = () => {
      seme = (seme * 16807) % 2147483647
      return seme / 2147483647
    }
    const file = Math.ceil(quanti / 22)
    for (let f = 0; f < file && fuori.length < quanti; f++) {
      for (let c = 0; c < 22 && fuori.length < quanti; c++) {
        const x = -46 + c * 4.4 + (f % 2) * 2.2 + (caso() - 0.5) * 0.8
        const z = -9 - f * 4.2 + (caso() - 0.5) * 0.8
        fuori.push({ x, z, s: 0.8 + caso() * 0.5, r: caso() * Math.PI })
      }
    }
    return fuori
  }, [quanti])

  const chiome = alberi.length * 3

  return (
    <group>
      <instancedMesh
        args={[undefined, undefined, alberi.length]}
        frustumCulled={false}
        ref={(m) => {
          if (!m) return
          const mat = new THREE.Matrix4()
          alberi.forEach((a, i) => {
            mat.compose(
              new THREE.Vector3(a.x, 0.55 * a.s, a.z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, a.r, 0.08)),
              new THREE.Vector3(a.s, a.s, a.s),
            )
            m.setMatrixAt(i, mat)
          })
          m.instanceMatrix.needsUpdate = true
        }}
      >
        <cylinderGeometry args={[0.12, 0.2, 1.1, 6]} />
        <meshStandardMaterial color={COLORI.tronco} roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, chiome]}
        frustumCulled={false}
        ref={(m) => {
          if (!m) return
          const mat = new THREE.Matrix4()
          const colore = new THREE.Color()
          const tinte = ['#7f8f4e', '#93a06a', '#a3ad82', '#6f8046']
          alberi.forEach((a, i) => {
            for (let k = 0; k < 3; k++) {
              const ang = a.r + (k * Math.PI * 2) / 3
              const dx = Math.cos(ang) * 0.45 * a.s
              const dz = Math.sin(ang) * 0.45 * a.s
              const dim = (0.7 + 0.15 * k) * a.s
              mat.compose(
                new THREE.Vector3(a.x + dx, (1.35 + 0.18 * k) * a.s, a.z + dz),
                new THREE.Quaternion(),
                new THREE.Vector3(dim, dim * 0.75, dim),
              )
              m.setMatrixAt(i * 3 + k, mat)
              m.setColorAt(i * 3 + k, colore.set(tinte[(i + k) % tinte.length]))
            }
          })
          m.instanceMatrix.needsUpdate = true
          if (m.instanceColor) m.instanceColor.needsUpdate = true
        }}
      >
        <icosahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  )
}

/** Colline e una striscia di mare all'orizzonte. */
function Paesaggio() {
  const colline: [number, number, number, number, string][] = [
    [-44, -84, 26, 3.2, '#a7b27a'],
    [-10, -90, 30, 4, '#b6b985'],
    [28, -86, 26, 3.5, '#9eab70'],
    [60, -80, 20, 2.6, '#b3b07f'],
  ]
  return (
    <group>
      <mesh position={[0, 0.02, -104]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[260, 30]} />
        <meshStandardMaterial color="#86bcd9" roughness={0.4} />
      </mesh>
      {colline.map(([x, z, r, h, c], i) => (
        <mesh key={i} position={[x, 0, z]} scale={[1, h / r, 0.6]}>
          <sphereGeometry args={[r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={c} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  )
}

/** Piattaforma in rovere chiaro, con vetrata sul retro e qualche pianta. */
function Studio() {
  const completa = useQualita() === 'completa'
  return (
    <group>
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[19, 0.2, 11]} />
        <meshStandardMaterial color={COLORI.rovere} roughness={0.7} />
      </mesh>
      {/* tappeto morbido sotto il tavolo dei capitoli */}
      <mesh position={[0, 0.005, 2.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[9.5, 2.6]} />
        <meshStandardMaterial color="#efe6cf" roughness={1} />
      </mesh>
      {/* vetrata: montanti sottili e vetro appena azzurrato */}
      {[-9.4, -4.7, 0, 4.7, 9.4].map((x) => (
        <mesh key={x} position={[x, 1.6, -5.4]} castShadow={completa}>
          <boxGeometry args={[0.08, 3.2, 0.08]} />
          <meshStandardMaterial color={COLORI.bianco} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 3.2, -5.4]}>
        <boxGeometry args={[18.9, 0.08, 0.1]} />
        <meshStandardMaterial color={COLORI.bianco} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.6, -5.42]}>
        <planeGeometry args={[18.8, 3.2]} />
        <meshStandardMaterial color="#d9ecf7" transparent opacity={0.16} roughness={0.1} metalness={0.1} />
      </mesh>
      {/* vasi con piccoli ulivi */}
      {[
        [-8.6, 3.8],
        [8.6, 3.8],
      ].map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <mesh position={[0, 0.3, 0]} castShadow={completa}>
            <cylinderGeometry args={[0.35, 0.28, 0.6, 16]} />
            <meshStandardMaterial color="#c97f5a" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.95, 0]}>
            <cylinderGeometry args={[0.04, 0.06, 0.8, 6]} />
            <meshStandardMaterial color={COLORI.tronco} />
          </mesh>
          <mesh position={[0, 1.45, 0]} castShadow={completa}>
            <icosahedronGeometry args={[0.45, 0]} />
            <meshStandardMaterial color="#8d9c5e" flatShading roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function Ambiente() {
  const completa = useQualita() === 'completa'
  return (
    <group>
      <Cielo />
      <mesh position={[0, -0.21, -40]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[220, 120]} />
        <meshStandardMaterial color={COLORI.terra} roughness={1} />
      </mesh>
      <Paesaggio />
      <Uliveto quanti={completa ? 220 : 88} />
      <Studio />
    </group>
  )
}
