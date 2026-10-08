import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useMovimentoRidotto } from '../../hooks/useLayoutMode'
import { useCielo } from '../notte'
import { Acqua, LIVELLO_RIFLESSO } from './Acqua'
import { LUNA, applicaAtmosfera, statoAtmosfera, uniformiCielo, type StatoAtmosfera } from './atmosfera'
import { aggiornaCielo, creaCielo } from './cielo'
import { costruisci } from './costruito'
import { materialeCostruito, materialeLucine, materialeTerreno } from './materiali'
import { Nuvole } from './Nuvole'
import { geometriaTerreno, piantaOlivi, Y_MARE } from './terreno'
import { Uccelli } from './Uccelli'
import { Uliveto } from './Uliveto'
import { prepara } from './texture'

const BASE = `${import.meta.env.BASE_URL}assets/esterno/`
/** Fin dove arriva la vista: il mare all'orizzonte è a una decina di km. */
const LONTANO = 14000

function Cielo({ stato }: { stato: StatoAtmosfera }) {
  const sky = useMemo(() => {
    const s = creaCielo(LONTANO * 0.8)
    s.layers.enable(LIVELLO_RIFLESSO)
    return s
  }, [])
  useLayoutEffect(() => aggiornaCielo(sky, stato.sole, stato.parametri), [sky, stato])
  useEffect(() => () => (sky.material as THREE.Material).dispose(), [sky])
  return <primitive object={sky} />
}

function Luna({ notte }: { notte: number }) {
  const mappa = useTexture(`${BASE}luna.jpg`, prepara(true, false))
  const pos = useMemo(() => LUNA.clone().multiplyScalar(9000), [])
  const raggio = 9000 * Math.tan(THREE.MathUtils.degToRad(0.62))
  return (
    <mesh position={pos} visible={notte > 0.3} onUpdate={(o) => o.layers.enable(LIVELLO_RIFLESSO)} renderOrder={-5}>
      <sphereGeometry args={[raggio, 32, 16]} />
      <meshBasicMaterial map={mappa} color={[1.9, 1.85, 1.7]} fog={false} />
    </mesh>
  )
}

function Mare({ completa, stato }: { completa: boolean; stato: StatoAtmosfera }) {
  const normali = useTexture(`${BASE}acqua-normali.jpg`, prepara(false))
  const acqua = useMemo(() => {
    const g = new THREE.PlaneGeometry(40000, 26000)
    const a = new Acqua(g, { normali, specchio: completa, risoluzione: 512 })
    a.rotation.x = -Math.PI / 2
    a.position.set(0, Y_MARE, -6 - 13000 + 2000)
    return a
  }, [normali, completa])
  useLayoutEffect(() => {
    acqua.material.uniforms.uZenit.value.copy(stato.zenit)
  }, [acqua, stato])
  useEffect(
    () => () => {
      acqua.geometry.dispose()
      acqua.dispose()
    },
    [acqua],
  )
  return <primitive object={acqua} />
}

function Terreno({ completa, oliviFino }: { completa: boolean; oliviFino: number }) {
  const erba = useTexture(`${BASE}erba-${completa ? 1024 : 512}.jpg`, prepara(true, true, completa ? 8 : 2))
  const geometria = useMemo(() => geometriaTerreno(!completa), [completa])
  const materiale = useMemo(() => {
    return materialeTerreno(erba, oliviFino)
  }, [erba, oliviFino])
  useEffect(
    () => () => {
      geometria.dispose()
      materiale.dispose()
    },
    [geometria, materiale],
  )
  return <mesh geometry={geometria} material={materiale} frustumCulled={false} />
}

function Costruito({ dati }: { dati: ReturnType<typeof costruisci> }) {
  const pietra = useTexture(`${BASE}pietra.jpg`, prepara(true))
  const materiale = useMemo(() => {
    const m = materialeCostruito(pietra)
    m.side = THREE.DoubleSide
    return m
  }, [pietra])
  const lucine = useMemo(() => materialeLucine(), [])
  useEffect(
    () => () => {
      materiale.dispose()
      lucine.dispose()
    },
    [materiale, lucine],
  )
  return (
    <>
      <mesh geometry={dati.geometria} material={materiale} frustumCulled={false} />
      <points geometry={dati.luci} material={lucine} frustumCulled={false} />
    </>
  )
}

/**
 * La campagna calabrese vista dalla vetrata, in 3D vero: cielo fisico che
 * segue l'ora, mare in fondo, colline con uliveti a filari, muretti a secco,
 * casolari, nuvole e qualche uccello. Di notte stelle, luna e paesi accesi.
 */
export default function Esterno({ qualita }: { qualita: 'completa' | 'ridotta' }) {
  const completa = qualita === 'completa'
  const fermo = useMovimentoRidotto()
  const cielo = useCielo()
  const stato = useMemo(() => statoAtmosfera(cielo), [cielo])
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalida = useThree((s) => s.invalidate)

  // la vista arriva fino all'orizzonte (la sala da sola si ferma a 120 m)
  useEffect(() => {
    const prima = camera.far
    Object.assign(camera, { far: LONTANO })
    camera.updateProjectionMatrix()
    invalida()
    return () => {
      Object.assign(camera, { far: prima })
      camera.updateProjectionMatrix()
    }
  }, [camera, invalida])

  useLayoutEffect(() => {
    applicaAtmosfera(stato)
    uniformiCielo.uVento.value = fermo ? 0 : 1
    invalida()
  }, [stato, fermo, invalida])

  useFrame((s) => {
    if (!fermo) uniformiCielo.uTempo.value = s.clock.elapsedTime
  })

  const oliviFino = completa ? 720 : 420
  const dati = useMemo(() => {
    const c = costruisci(!completa)
    const alberi = piantaOlivi(oliviFino, completa ? 1 : 0.6)
    return { costruito: c, alberi }
  }, [completa, oliviFino])
  useEffect(
    () => () => {
      dati.costruito.geometria.dispose()
      dati.costruito.luci.dispose()
    },
    [dati],
  )

  return (
    <group>
      <Cielo stato={stato} />
      <Suspense fallback={null}>
        <Terreno completa={completa} oliviFino={oliviFino} />
        <Costruito dati={dati.costruito} />
      </Suspense>
      <Suspense fallback={null}>
        <Mare completa={completa} stato={stato} />
      </Suspense>
      <Suspense fallback={null}>
        <Uliveto alberi={dati.alberi} completa={completa} sole={stato.sole} notte={stato.notte} />
      </Suspense>
      <Suspense fallback={null}>
        <Luna notte={stato.notte} />
        <Nuvole stato={stato} />
      </Suspense>
      <Uccelli attivi={!fermo && stato.notte < 0.5} />
    </group>
  )
}
