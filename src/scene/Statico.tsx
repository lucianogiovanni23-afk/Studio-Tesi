import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Unisce i pezzi fermi della sala (scrivanie, PC, monitor, sedie, divano,
 * libreria, listelli, piante…) in poche "mesh" grandi, una per materiale:
 * da quasi mille chiamate di disegno a qualche decina. I pezzi originali
 * restano nella scena su un livello che la telecamera non disegna ma che il
 * puntatore vede ancora (si possono toccare come prima).
 *
 * Restano fuori: quello che si muove o cambia colore (segnato con
 * `userData.vivo` sull'oggetto, su un suo antenato o sul materiale), le
 * persone (mesh con scheletro), le istanze, i materiali trasparenti e gli
 * shader personalizzati. L'unione si rifà quando cambia `chiave` o quando
 * compaiono/spariscono pezzi (controllo leggero ogni mezzo secondo).
 */

/** Livello su cui finiscono i pezzi originali uniti: non disegnati, ma cliccabili. */
export const LIVELLO_ORIGINALI = 30

/* --- ombre "cotte": si ricalcolano solo quando l'arredo cambia --- */
const cottura = { sporche: true, versione: 0 }
const ascoltatori = new Set<() => void>()
function iscrivi(f: () => void) {
  ascoltatori.add(f)
  return () => ascoltatori.delete(f)
}
export function arredoCambiato() {
  cottura.sporche = true
  cottura.versione++
  ascoltatori.forEach((f) => f())
}

/** Chiamala per chiedere di ricalcolare le ombre; `.sporche()` dice (una volta) se servono; `.versione` cambia a ogni nuova unione. */
export function useCotturaOmbre() {
  const versione = useSyncExternalStore(iscrivi, () => cottura.versione)
  return useMemo(
    () =>
      Object.assign(
        () => {
          cottura.sporche = true
        },
        {
          versione,
          sporche: () => {
            const x = cottura.sporche
            cottura.sporche = false
            return x
          },
        },
      ),
    [versione],
  )
}

function vivo(o: THREE.Object3D, radice: THREE.Object3D): boolean {
  for (let x: THREE.Object3D | null = o; x && x !== radice; x = x.parent) {
    if (x.userData.vivo || !x.visible) return true
  }
  return false
}

const PROPRIETA = [
  'type', 'color', 'emissive', 'emissiveIntensity', 'roughness', 'metalness', 'map', 'normalMap', 'normalScale', 'roughnessMap',
  'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'lightMap', 'envMap', 'envMapIntensity', 'side', 'flatShading', 'toneMapped',
  'vertexColors', 'fog', 'wireframe', 'depthWrite', 'depthTest', 'opacity', 'alphaTest', 'blending', 'polygonOffset',
  'polygonOffsetFactor', 'polygonOffsetUnits', 'sheen', 'sheenColor', 'sheenRoughness', 'sheenColorMap', 'clearcoat',
  'clearcoatRoughness', 'ior', 'transmission', 'thickness', 'specularIntensity', 'specularColor', 'reflectivity',
  'iridescence', 'dithering', 'colorWrite', 'visible',
] as const

/** Firma del materiale: due materiali con la stessa firma si disegnano uguali. null = da non unire. */
function firmaMateriale(m: THREE.Material): string | null {
  if (m.userData.vivo || m.transparent || m.onBeforeCompile.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) return null
  if ((m as THREE.ShaderMaterial).isShaderMaterial) return null
  if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial && !(m as THREE.MeshLambertMaterial).isMeshLambertMaterial) return null
  const r = m as unknown as Record<string, unknown>
  const parti: string[] = []
  for (const p of PROPRIETA) {
    const v = r[p]
    if (v === undefined) continue
    if (v === null) parti.push(`${p}:-`)
    else if (v instanceof THREE.Color) parti.push(`${p}:${v.getHexString()}`)
    else if (v instanceof THREE.Texture) parti.push(`${p}:${v.uuid}`)
    else if (v instanceof THREE.Vector2) parti.push(`${p}:${v.x},${v.y}`)
    else parti.push(`${p}:${String(v)}`)
  }
  if (m.defines && Object.keys(m.defines).length) parti.push(JSON.stringify(m.defines))
  return parti.join('|')
}

interface Unione {
  mesh: THREE.Mesh[]
  originali: { o: THREE.Mesh; maschera: number }[]
}

const ATTRIBUTI = ['position', 'normal', 'uv'] as const

function prepara(geo: THREE.BufferGeometry, matrice: THREE.Matrix4, senzaIndici: boolean): THREE.BufferGeometry {
  let g = geo.clone()
  for (const nome of Object.keys(g.attributes)) if (!(ATTRIBUTI as readonly string[]).includes(nome)) g.deleteAttribute(nome)
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
  // attributi compressi/interleaved → float semplici
  for (const nome of ATTRIBUTI) {
    const a = g.getAttribute(nome) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute
    if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array)) {
      const arr = new Float32Array(a.count * a.itemSize)
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k)
      g.setAttribute(nome, new THREE.BufferAttribute(arr, a.itemSize))
    }
  }
  g.morphAttributes = {}
  g.clearGroups()
  if (senzaIndici && g.index) {
    const vecchia = g
    g = g.toNonIndexed()
    vecchia.dispose()
  }
  g.applyMatrix4(matrice)
  return g
}

function unisci(radice: THREE.Object3D): Unione {
  radice.updateMatrixWorld(true)
  const inversa = new THREE.Matrix4().copy(radice.matrixWorld).invert()
  const gruppi = new Map<string, { materiale: THREE.Material; pezzi: THREE.Mesh[] }>()
  radice.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.unione) return
    if (Array.isArray(m.material) || !m.geometry?.getAttribute('position') || m.morphTargetInfluences?.length) return
    if (m.layers.mask !== 1 || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return
    if (vivo(m, radice)) return
    const fm = firmaMateriale(m.material)
    if (!fm) return
    const chiave = `${fm}#${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}${m.renderOrder}${m.frustumCulled ? 1 : 0}`
    let gr = gruppi.get(chiave)
    if (!gr) gruppi.set(chiave, (gr = { materiale: m.material, pezzi: [] }))
    gr.pezzi.push(m)
  })
  const risultato: Unione = { mesh: [], originali: [] }
  const matrice = new THREE.Matrix4()
  for (const { materiale, pezzi } of gruppi.values()) {
    if (pezzi.length < 2) continue
    const senzaIndici = pezzi.some((p) => !p.geometry.index)
    const geometrie = pezzi.map((p) => prepara(p.geometry, matrice.multiplyMatrices(inversa, p.matrixWorld), senzaIndici))
    const unita = mergeGeometries(geometrie, false)
    geometrie.forEach((x) => x.dispose())
    if (!unita) continue
    unita.computeBoundingSphere()
    const mesh = new THREE.Mesh(unita, materiale)
    mesh.castShadow = pezzi[0].castShadow
    mesh.receiveShadow = pezzi[0].receiveShadow
    mesh.renderOrder = pezzi[0].renderOrder
    mesh.userData.unione = true
    mesh.matrixAutoUpdate = false
    // l'unione non si tocca: i clic vanno sui pezzi originali
    mesh.raycast = () => {}
    risultato.mesh.push(mesh)
    for (const p of pezzi) {
      risultato.originali.push({ o: p, maschera: p.layers.mask })
      p.layers.set(LIVELLO_ORIGINALI)
    }
  }
  return risultato
}

function sciogli(radice: THREE.Object3D, u: Unione | null) {
  if (!u) return
  for (const { o, maschera } of u.originali) o.layers.mask = maschera
  for (const m of u.mesh) {
    radice.remove(m)
    m.geometry.dispose()
  }
}

/** Impronta leggera del sottoalbero: cambia quando compaiono, spariscono o si accendono pezzi. */
function impronta(radice: THREE.Object3D): string {
  let n = 0
  let visibili = 0
  let materiali = 0
  radice.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !m.userData.unione) {
      n++
      // un materiale sostituito (per esempio le texture grandi arrivate dopo) rifà l'unione
      if (!Array.isArray(m.material)) materiali = (materiali * 31 + m.material.id) % 1000000007
    }
  })
  radice.traverseVisible((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.unione) visibili++
  })
  return `${n}/${visibili}/${materiali}`
}

export function Statico({ chiave, children }: { chiave: string; children: ReactNode }) {
  const gruppo = useRef<THREE.Group>(null)
  const unione = useRef<Unione | null>(null)
  const firma = useRef('')
  const controllo = useRef(0)

  const rifai = () => {
    const g = gruppo.current
    if (!g) return
    sciogli(g, unione.current)
    unione.current = unisci(g)
    for (const m of unione.current.mesh) g.add(m)
    firma.current = impronta(g)
    arredoCambiato()
  }

  useLayoutEffect(() => {
    rifai()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave])

  useLayoutEffect(
    () => () => {
      const g = gruppo.current
      if (g) sciogli(g, unione.current)
      unione.current = null
    },
    [],
  )

  // pezzi arrivati dopo (modelli scaricati più tardi) o accesi/spenti: si rifà l'unione
  useFrame(() => {
    const ora = performance.now()
    if (ora - controllo.current < 500) return
    controllo.current = ora
    const g = gruppo.current
    if (g && impronta(g) !== firma.current) rifai()
  })

  return <group ref={gruppo}>{children}</group>
}
