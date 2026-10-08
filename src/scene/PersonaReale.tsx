import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneScheletro } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Persona } from '../agents/agenti'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { useStudio } from '../store'
import type { AgentKey, AgentStatus } from '../types'
import { MISURE, RigPersona, type StatoPersona } from './posaPersona'
import { useQualita } from './qualita'
import { Sedia } from './Sedia'

/**
 * Persona realistica (avatar Microsoft Rocketbox, licenza MIT) seduta alla
 * scrivania. Il GLB si scarica solo quando la scena 3D lo chiede; la posa
 * seduta e le animazioni sono procedurali (vedi posaPersona.ts).
 * Stesse props di Persona3D: lavora, scelta, parla, saluto quando lo stato
 * diventa "fatto".
 */

const DURATA_SALUTO = 2.2

function urlPersona(chiave: AgentKey, ridotta: boolean) {
  return `${import.meta.env.BASE_URL}assets/persone/${chiave}${ridotta ? '-ridotta' : ''}.glb`
}

/** Ritocchi ai materiali del GLB: pelle e stoffa con un velo di "sheen", capelli in alpha test. */
function preparaMateriali(radice: THREE.Object3D, completa: boolean) {
  const fatti = new Map<THREE.Material, THREE.Material>()
  radice.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isMesh) return
    const vecchio = mesh.material as THREE.MeshStandardMaterial
    let nuovo = fatti.get(vecchio)
    if (!nuovo) {
      const nome = vecchio.name
      if (completa && (nome.endsWith('_body') || nome.endsWith('_head'))) {
        const pelle = nome.endsWith('_head')
        const m = new THREE.MeshPhysicalMaterial()
        THREE.MeshStandardMaterial.prototype.copy.call(m, vecchio)
        m.defines = { STANDARD: '', PHYSICAL: '' }
        m.sheen = pelle ? 0.18 : 0.55
        m.sheenRoughness = pelle ? 0.45 : 0.75
        m.sheenColor.set(pelle ? '#ffd9c4' : '#ffffff')
        if (!pelle) m.sheenColorMap = vecchio.map
        m.envMapIntensity = pelle ? 0.75 : 0.6
        nuovo = m
      } else {
        const m = vecchio.clone()
        m.envMapIntensity = 0.7
        if (nome.endsWith('_opacity')) {
          // capelli e ciglia: ritaglio netto (alpha test), niente ordinamento delle trasparenze
          m.alphaTest = 0.3
          m.transparent = false
        }
        if (nome.endsWith('_glasses')) {
          m.transparent = true
          m.depthWrite = false
        }
        nuovo = m
      }
      fatti.set(vecchio, nuovo)
    }
    mesh.material = nuovo
  })
}

export function PersonaReale({
  chiave,
  persona,
  lavora,
  status,
  scelta,
  parla,
  sfasamento,
  ombre,
}: {
  chiave: AgentKey
  persona: Persona
  lavora: boolean
  status?: AgentStatus
  scelta: boolean
  parla: boolean
  sfasamento: number
  ombre: boolean
}) {
  const completa = useQualita() === 'completa'
  const gltf = useGLTF(urlPersona(chiave, !completa), false, true)
  const fermo = useMovimentoRidotto()

  const { radice, rig } = useMemo(() => {
    const radice = cloneScheletro(gltf.scene)
    preparaMateriali(radice, completa)
    const rig = new RigPersona(radice)
    return { radice, rig }
  }, [gltf, completa])

  useEffect(() => {
    radice.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = ombre
        o.receiveShadow = ombre
      }
    })
  }, [radice, ombre])

  useEffect(
    () => () => {
      // i materiali sono copie di questa istanza; geometrie e texture restano nella cache di useGLTF
      const visti = new Set<THREE.Material>()
      radice.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (m && !visti.has(m)) {
          visti.add(m)
          m.dispose()
        }
      })
    },
    [radice],
  )

  // Saluto: quando lo stato diventa "fatto" la persona si gira verso di te e alza la mano.
  const saluto = useRef({ richiesto: false, inizio: -1, peso: 0 })
  const statoPrima = useRef(status)
  useEffect(() => {
    if (status === 'fatto' && statoPrima.current !== undefined && statoPrima.current !== 'fatto') saluto.current.richiesto = true
    statoPrima.current = status
  }, [status])

  const statoRef = useRef<StatoPersona>({ t: 0, dt: 0, lavora: 0, guarda: null, parla: false, saluto: 0, salutoDa: 0, girata: 0, sorriso: 0 })
  const cameraRef = useRef(new THREE.Vector3())

  useFrame((s, delta) => {
    if (fermo) return
    const dt = Math.min(delta, 0.1)
    const ora = s.clock.elapsedTime
    const sal = saluto.current
    if (sal.richiesto) {
      sal.richiesto = false
      sal.inizio = ora
    }
    const trascorso = sal.inizio < 0 ? 99 : ora - sal.inizio
    sal.peso += ((trascorso < DURATA_SALUTO ? 1 : 0) - sal.peso) * (1 - Math.exp(-dt * 7))

    const stato = statoRef.current
    const camera = cameraRef.current
    // la telecamera nello spazio della persona
    camera.copy(s.camera.position)
    radice.worldToLocal(camera)
    const guardaTe = scelta || sal.peso > 0.5

    stato.t = ora + sfasamento
    stato.dt = dt
    stato.lavora += ((lavora && !guardaTe ? 1 : 0) - stato.lavora) * (1 - Math.exp(-dt * 4))
    stato.guarda = guardaTe ? camera : lavora ? MISURE.monitor : null
    stato.parla = parla && useStudio.getState().parlaFino > Date.now()
    stato.saluto = sal.peso
    stato.salutoDa = trascorso
    stato.girata = THREE.MathUtils.clamp(Math.atan2(camera.x, camera.z), -0.7, 0.7)
    stato.sorriso = sal.peso > 0.3 ? 0.55 : scelta ? 0.22 : 0
    rig.aggiorna(stato)
  })

  return (
    <group>
      <Sedia accento={persona.aspetto.cravatta} ombre={ombre} />
      <primitive object={radice} />
    </group>
  )
}
