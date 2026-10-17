import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useFermo, useGrafica } from '../qualita'
import { Precompila } from '../Motore'
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
import { INDICE_STAGIONE, meseCorrente, stagioneDelMese, type Stagione } from './stagioni'

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

function Mare({ livello, risoluzione, stato }: { livello: number; risoluzione: number; stato: StatoAtmosfera }) {
  const normali = useTexture(`${BASE}acqua-normali.jpg`, prepara(false))
  const acqua = useMemo(() => {
    const g = new THREE.PlaneGeometry(40000, 26000)
    const a = new Acqua(g, { normali, specchio: livello === 2, riflessi: livello > 0, risoluzione, ogni: 2 })
    a.rotation.x = -Math.PI / 2
    a.position.set(0, Y_MARE, -6 - 13000 + 2000)
    return a
  }, [normali, livello, risoluzione])
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

function Terreno({ dettaglio, texture, oliviFino, stagione }: { dettaglio: boolean; texture: number; oliviFino: number; stagione: Stagione }) {
  const erba = useTexture(`${BASE}erba-${texture === 2 ? 1024 : 512}.jpg`, prepara(true, true, [1, 2, 8][texture]))
  const geometria = useMemo(() => geometriaTerreno(!dettaglio), [dettaglio])
  const materiale = useMemo(() => {
    return materialeTerreno(erba, oliviFino, INDICE_STAGIONE[stagione])
  }, [erba, oliviFino, stagione])
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
 * Cambia con le stagioni (vedi stagioni.ts): raccolta delle olive in autunno,
 * ulivi in fiore in primavera, erba secca d'estate.
 */
/** Fin dove arrivano gli ulivi per "Distanza visiva alberi": vicina, media, lontana. */
const OLIVI_FINO = [300, 420, 720]

export default function Esterno() {
  const g = useGrafica()
  // "Lontana" è il dettaglio pieno di prima: terreno fitto, paese con tutte le lucine, ulivi vicini veri
  const dettaglio = g.alberi === 2
  const fermo = useFermo()
  const cielo = useCielo()
  // la stagione si legge all'apertura della sala (basta: cambia una volta ogni tre mesi)
  const stagione = useMemo(() => stagioneDelMese(meseCorrente()), [])
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

  const oliviFino = OLIVI_FINO[g.alberi]
  const densita = g.vegetazione / 100
  const dati = useMemo(() => {
    const c = costruisci(!dettaglio)
    const alberi = piantaOlivi(oliviFino, densita)
    return { costruito: c, alberi }
  }, [dettaglio, oliviFino, densita])
  useEffect(
    () => () => {
      dati.costruito.geometria.dispose()
      dati.costruito.luci.dispose()
    },
    [dati],
  )

  return (
    // l'esterno ha shader e istanze propri: resta fuori dall'unione dei mobili della sala
    <group userData={{ vivo: true }}>
      <Cielo stato={stato} />
      <Suspense fallback={null}>
        <Terreno dettaglio={dettaglio} texture={g.texture} oliviFino={oliviFino} stagione={stagione} />
        <Costruito dati={dati.costruito} />
      </Suspense>
      <Suspense fallback={null}>
        <Mare livello={g.mare} risoluzione={g.risSpecchio} stato={stato} />
      </Suspense>
      <Suspense fallback={null}>
        <Uliveto alberi={dati.alberi} distanza={g.alberi} rilievo={g.texture === 2} sole={stato.sole} notte={stato.notte} stagione={stagione} />
      </Suspense>
      <Suspense fallback={null}>
        <Luna notte={stato.notte} />
        {g.cielo && <Nuvole stato={stato} />}
        <Precompila />
      </Suspense>
      {g.cielo && <Uccelli attivi={!fermo && stato.notte < 0.5} />}
    </group>
  )
}
