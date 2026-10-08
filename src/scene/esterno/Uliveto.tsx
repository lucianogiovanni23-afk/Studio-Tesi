import { useEffect, useMemo } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { materialeCorteccia, materialeFoglie, materialeImpostori } from './materiali'
import { FACCIATA_Z, altezza, type Olivo } from './terreno'
import { LUNA } from './atmosfera'
import { textureAlone } from '../notte'
import { prepara } from './texture'

const BASE = `${import.meta.env.BASE_URL}assets/esterno/`

/** Gli ulivi grandi e vecchi del giardino, vicino alla vetrata. */
const PATRIARCHI: { x: number; d: number; scala: number; rot: number; variante: number }[] = [
  { x: -7.4, d: 5.0, scala: 1.08, rot: 0.6, variante: 3 },
  { x: 7.8, d: 6.2, scala: 1.15, rot: 2.2, variante: 0 },
  { x: -13.5, d: 19, scala: 1.0, rot: 4.1, variante: 3 },
]

interface Varianti {
  rami: THREE.BufferGeometry[]
  foglie: THREE.BufferGeometry[]
}

/**
 * Le geometrie compresse (meshopt) hanno coordinate quantizzate e la scala nel
 * nodo: le riporto in float, con la trasformazione applicata.
 */
function geometriaPiana(m: THREE.Mesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  for (const nome of ['position', 'normal', 'uv'] as const) {
    const a = m.geometry.getAttribute(nome)
    if (!a) continue
    const arr = new Float32Array(a.count * a.itemSize)
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : a.getZ(i)
    g.setAttribute(nome, new THREE.BufferAttribute(arr, a.itemSize))
  }
  if (m.geometry.index) g.setIndex(m.geometry.index.clone())
  g.applyMatrix4(m.matrixWorld)
  return g
}

/** Estrae rami e foglie di ogni albero e aggiunge alle foglie la normale "a cupola". */
function estrai(scena: THREE.Object3D): Varianti {
  const rami: THREE.BufferGeometry[] = []
  const foglie: THREE.BufferGeometry[] = []
  scena.updateMatrixWorld(true)
  const alberi = scena.children.filter((c) => c.name.startsWith('olivo')).sort((a, b) => a.name.localeCompare(b.name))
  for (const albero of alberi) {
    albero.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (m.name.startsWith('rami')) rami.push(geometriaPiana(m))
      if (m.name.startsWith('foglie')) {
        const g = geometriaPiana(m)
        {
          g.computeBoundingBox()
          const c = g.boundingBox!.getCenter(new THREE.Vector3())
          c.y -= (g.boundingBox!.max.y - g.boundingBox!.min.y) * 0.18
          const p = g.getAttribute('position')
          const arr = new Float32Array(p.count * 3)
          const v = new THREE.Vector3()
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).sub(c)
            v.y *= 1.4
            v.normalize()
            arr.set([v.x, v.y, v.z], i * 3)
          }
          g.setAttribute('aChioma', new THREE.BufferAttribute(arr, 3))
        }
        foglie.push(g)
      }
    })
  }
  return { rami, foglie }
}

function matrice(o: { x: number; y: number; z: number; scala: number; rot: number }) {
  return new THREE.Matrix4().compose(new THREE.Vector3(o.x, o.y, o.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rot), new THREE.Vector3(o.scala, o.scala, o.scala))
}

function Istanze({ geometria, materiale, alberi }: { geometria: THREE.BufferGeometry; materiale: THREE.Material; alberi: Olivo[] }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometria, materiale, Math.max(1, alberi.length))
    alberi.forEach((a, i) => m.setMatrixAt(i, matrice(a)))
    m.count = alberi.length
    m.frustumCulled = false
    m.instanceMatrix.needsUpdate = true
    return m
  }, [geometria, materiale, alberi])
  useEffect(() => () => {
    mesh.dispose()
  }, [mesh])
  if (alberi.length === 0) return null
  return <primitive object={mesh} />
}

/** Una specie di ulivo: rami + foglie, istanziati per ogni albero della sua variante. */
function Specie({ varianti, alberi, corteccia, foglie }: { varianti: Varianti; alberi: Olivo[]; corteccia: THREE.Material; foglie: THREE.Material }) {
  const perVariante = useMemo(() => varianti.rami.map((_, v) => alberi.filter((a) => a.variante === v)), [varianti, alberi])
  return (
    <>
      {varianti.rami.map((g, v) => (
        <group key={v}>
          <Istanze geometria={g} materiale={corteccia} alberi={perVariante[v]} />
          <Istanze geometria={varianti.foglie[v]} materiale={foglie} alberi={perVariante[v]} />
        </group>
      ))}
    </>
  )
}

/**
 * Ombra morbida sotto ogni albero vicino, spostata e allungata dalla parte
 * opposta al sole (di notte, alla luna): ancora gli alberi al terreno.
 */
function Ombre({ alberi, sole, notte }: { alberi: Olivo[]; sole: THREE.Vector3; notte: number }) {
  const materiale = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: '#000000', map: textureAlone(), transparent: true, depthWrite: false, fog: false })
    m.polygonOffset = true
    m.polygonOffsetFactor = -2
    m.polygonOffsetUnits = -2
    return m
  }, [])
  const mesh = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    g.rotateX(-Math.PI / 2)
    const m = new THREE.InstancedMesh(g, materiale, Math.max(1, alberi.length))
    m.count = alberi.length
    m.frustumCulled = false
    m.renderOrder = 1
    return m
  }, [alberi, materiale])
  useEffect(() => {
    const dir = notte > 0.5 ? LUNA : sole
    const alt = Math.max(0.12, dir.y)
    const orizz = new THREE.Vector2(-dir.x, -dir.z)
    if (orizz.lengthSq() < 1e-6) orizz.set(0, 1)
    orizz.normalize()
    const lungo = Math.min(2.2, (0.45 * Math.sqrt(1 - alt * alt)) / alt)
    const ang = Math.atan2(orizz.x, orizz.y)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang)
    alberi.forEach((a, i) => {
      const r = 5.2 * a.scala
      const spost = r * lungo * 0.45
      const p = new THREE.Vector3(a.x + orizz.x * spost, a.y + 0.14, a.z + orizz.y * spost)
      mesh.setMatrixAt(i, new THREE.Matrix4().compose(p, q, new THREE.Vector3(r, 1, r * (1 + lungo * 0.6))))
    })
    Object.assign(mesh.instanceMatrix, { needsUpdate: true })
    Object.assign(materiale, { opacity: THREE.MathUtils.lerp(0.55, 0.3, notte) * (0.6 + 0.4 * Math.min(1, alt * 3)) })
  }, [alberi, mesh, materiale, sole, notte])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      materiale.dispose()
    },
    [mesh, materiale],
  )
  return <primitive object={mesh} />
}

function Lontani({ alberi, atlante }: { alberi: Olivo[]; atlante: THREE.Texture }) {
  const materiale = useMemo(() => materialeImpostori(atlante), [atlante])
  const mesh = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    g.translate(0, 0.5, 0)
    g.setAttribute('aVariante', new THREE.InstancedBufferAttribute(new Float32Array(alberi.map((a) => a.variante % 3)), 1))
    const m = new THREE.InstancedMesh(g, materiale, Math.max(1, alberi.length))
    const q = new THREE.Quaternion()
    alberi.forEach((a, i) => m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(a.x, a.y, a.z), q, new THREE.Vector3(a.scala * 0.88, a.scala * 0.88, a.scala * 0.88))))
    m.count = alberi.length
    m.frustumCulled = false
    return m
  }, [alberi, materiale])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      materiale.dispose()
    },
    [mesh, materiale],
  )
  return <primitive object={mesh} />
}

function useMaterialiOlivo(completa: boolean) {
  const mappa = useTexture(`${BASE}corteccia.jpg`, prepara(true))
  const normali = useTexture(`${BASE}corteccia-n.jpg`, prepara(false))
  const foglieTex = useTexture(`${BASE}foglie.webp`, prepara(true, false, 4))
  return useMemo(() => {
    return { corteccia: materialeCorteccia(mappa, completa ? normali : null), foglie: materialeFoglie(foglieTex) }
  }, [mappa, normali, foglieTex, completa])
}

/**
 * L'uliveto: alberi vicini in pieno dettaglio, quelli a media distanza più
 * semplici, i lontani come immagini sempre rivolte verso chi guarda.
 */
export function Uliveto({ alberi, completa, sole, notte }: { alberi: Olivo[]; completa: boolean; sole: THREE.Vector3; notte: number }) {
  const medi = useGLTF(`${BASE}olivi-medi.glb`, false, true)
  const atlante = useTexture(`${BASE}olivi-lontani.webp`, prepara(true, false))
  const variantiMedie = useMemo(() => estrai(medi.scene), [medi])
  const materiali = useMaterialiOlivo(completa)
  useEffect(() => () => {
    materiali.corteccia.dispose()
    materiali.foglie.dispose()
  }, [materiali])

  const limiteVicini = completa ? 38 : 0
  const limiteMedi = completa ? 95 : 50
  const gruppi = useMemo(() => {
    const vicini = alberi.filter((a) => a.d < limiteVicini)
    const medi = alberi.filter((a) => a.d >= limiteVicini && a.d < limiteMedi)
    const lontani = alberi.filter((a) => a.d >= limiteMedi)
    const patriarchi: Olivo[] = PATRIARCHI.map((p) => {
      const z = FACCIATA_Z - p.d
      return { x: p.x, z, y: altezza(p.x, z) - 0.15, scala: p.scala, rot: p.rot, variante: p.variante, d: p.d }
    })
    const ombre = [...patriarchi, ...alberi.filter((a) => a.d < limiteMedi + 40)]
    return { vicini, medi, lontani, patriarchi, ombre }
  }, [alberi, limiteVicini, limiteMedi])

  return (
    <group>
      {completa ? (
        <Vicini alberi={[...gruppi.vicini, ...gruppi.patriarchi]} materiali={materiali} />
      ) : (
        <Specie
          varianti={variantiMedie}
          alberi={gruppi.patriarchi.map((p) => ({ ...p, variante: p.variante % 3, scala: p.scala * (p.variante === 3 ? 1.25 : 1) }))}
          corteccia={materiali.corteccia}
          foglie={materiali.foglie}
        />
      )}
      <Specie varianti={variantiMedie} alberi={gruppi.medi} corteccia={materiali.corteccia} foglie={materiali.foglie} />
      <Lontani alberi={gruppi.lontani} atlante={atlante} />
      <Ombre alberi={gruppi.ombre} sole={sole} notte={notte} />
    </group>
  )
}

function Vicini({ alberi, materiali }: { alberi: Olivo[]; materiali: { corteccia: THREE.Material; foglie: THREE.Material } }) {
  const vicini = useGLTF(`${BASE}olivi-vicini.glb`, false, true)
  const varianti = useMemo(() => estrai(vicini.scene), [vicini])
  return <Specie varianti={varianti} alberi={alberi} corteccia={materiali.corteccia} foglie={materiali.foglie} />
}
