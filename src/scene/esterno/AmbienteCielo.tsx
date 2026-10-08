import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useCielo } from '../notte'
import { aggiornaCielo, creaCielo } from './cielo'
import { statoAtmosfera } from './atmosfera'

/**
 * Da mettere dentro <Environment>: la sala vista dal suo centro, con le
 * pareti chiare e, al posto della vetrata, il cielo vero del momento e la
 * campagna sotto l'orizzonte. Così i riflessi su schermi, pavimento e vetro
 * hanno i colori di fuori (azzurro, oro al tramonto, blu di notte).
 */
export function AmbienteCielo() {
  const cielo = useCielo()
  const stato = useMemo(() => statoAtmosfera(cielo), [cielo])
  const sky = useMemo(() => creaCielo(800, false), [])
  useLayoutEffect(() => aggiornaCielo(sky, stato.sole, stato.parametri), [sky, stato])
  useEffect(() => () => (sky.material as THREE.Material).dispose(), [sky])

  // luminosità delle pareti: la sala di giorno è chiara, di notte la illuminano le lampade
  const giorno = 1 - stato.notte
  const k = 0.03 + 0.15 * giorno * THREE.MathUtils.lerp(0.55, 1, THREE.MathUtils.smoothstep(stato.sole.y, 0, 0.5))
  const parete = new THREE.Color('#f3f2ee').multiplyScalar(k)
  const pavimento = new THREE.Color('#d9d4cc').multiplyScalar(k * 0.75)
  const soffitto = new THREE.Color('#f3f2ee').multiplyScalar(k * 0.8)
  const campagna = new THREE.Color(0.2, 0.17, 0.1).multiplyScalar(0.25 + 0.75 * giorno * stato.luceIntensita).lerp(stato.orizzonte, 0.35)

  // centro dell'ambiente: occhi di chi siede in sala (y 1.6, z 2)
  const W = 12.5
  const Y0 = -1.6
  const Y1 = 5
  // il soffitto dell'ambiente sta sopra le lampade (Lightformer) della sala
  const YS = 9
  const Z0 = -8
  const Z1 = 10
  return (
    <group>
      <primitive object={sky} />
      <mesh position={[0, -40, -400]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2000, 800]} />
        <meshBasicMaterial color={campagna} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, Y0, (Z0 + Z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * W, Z1 - Z0]} />
        <meshBasicMaterial color={pavimento} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, YS, (Z0 + Z1) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2 * W, Z1 - Z0]} />
        <meshBasicMaterial color={soffitto} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {[-W, W].map((x) => (
        <mesh key={x} position={[x, (Y0 + YS) / 2, (Z0 + Z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[Z1 - Z0, YS - Y0]} />
          <meshBasicMaterial color={parete} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, (Y0 + YS) / 2, Z1]}>
        <planeGeometry args={[2 * W, YS - Y0]} />
        <meshBasicMaterial color={parete} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* parete della vetrata: piena ai lati e sopra, aperta al centro */}
      <mesh position={[0, (Y1 + YS) / 2, Z0]}>
        <planeGeometry args={[2 * W, YS - Y1]} />
        <meshBasicMaterial color={parete} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (5.5 + (W - 5.5) / 2), (Y0 + Y1) / 2, Z0]}>
          <planeGeometry args={[W - 5.5, Y1 - Y0]} />
          <meshBasicMaterial color={parete} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * La luce che entra dalla vetrata: di giorno ha il colore del sole del
 * momento (calda al tramonto) e arriva dalla sua direzione quando il sole è
 * davanti alla vetrata; di notte è la luna, fredda e debole.
 */
export function LuceVetrata() {
  const cielo = useCielo()
  const { posizione, colore, intensita } = useMemo(() => {
    const s = statoAtmosfera(cielo)
    if (s.notte > 0.5) return { posizione: new THREE.Vector3(-2, 5, -10), colore: new THREE.Color('#7f97e0'), intensita: 0.35 }
    const davanti = s.sole.z < -0.1 && s.sole.y > 0
    const posizione = davanti ? s.sole.clone().multiplyScalar(14).add(new THREE.Vector3(0, 1, -6)) : new THREE.Vector3(0, 5, -10)
    const luceCielo = new THREE.Color('#e9f2ff')
    const colore = luceCielo.clone().lerp(s.luce, davanti ? 0.75 : 0.25 * s.oro)
    const intensita = THREE.MathUtils.lerp(0.18, davanti ? 0.85 : 0.55, s.luceIntensita)
    return { posizione, colore, intensita }
  }, [cielo])
  return <directionalLight position={posizione} intensity={intensita} color={colore} />
}
