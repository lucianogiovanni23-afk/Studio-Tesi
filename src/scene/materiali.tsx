import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { useQualita } from './qualita'

/**
 * Materiali PBR dell'ufficio: rovere vero (venatura, ruvidezza, rilievo),
 * resina lucida per il pavimento, pelle e tessuto con grana, metallo
 * spazzolato e vetro. Le texture stanno in public/assets/materiali e si
 * scaricano solo quando si apre la scena 3D; nella qualità ridotta si usano
 * versioni più piccole e niente rilievi.
 */

const CARTELLA = `${import.meta.env.BASE_URL}assets/materiali/`

const FILE_COMPLETI = {
  rovere: 'rovere_colore.jpg',
  rovereRuvidezza: 'rovere_ruvidezza.jpg',
  rovereNormale: 'rovere_normale.jpg',
  resina: 'resina_colore.jpg',
  resinaRuvidezza: 'resina_ruvidezza.jpg',
  pelleNormale: 'pelle_normale.jpg',
  pelleRuvidezza: 'pelle_ruvidezza.jpg',
  tessuto: 'tessuto_dettaglio.jpg',
  tessutoNormale: 'tessuto_normale.jpg',
  metalloRuvidezza: 'metallo_ruvidezza.jpg',
  metalloNormale: 'metallo_normale.jpg',
}

const FILE_RIDOTTI = {
  rovere: 'rovere_colore_512.jpg',
  resina: 'resina_colore_512.jpg',
  tessuto: 'tessuto_dettaglio.jpg',
}

type Texture = Partial<Record<keyof typeof FILE_COMPLETI, THREE.Texture>>

const COLORE = new Set(['rovere', 'resina', 'tessuto'])

function percorsi<T extends Record<string, string>>(file: T): Record<keyof T, string> {
  return Object.fromEntries(Object.entries(file).map(([k, v]) => [k, CARTELLA + v])) as Record<keyof T, string>
}

const URL_COMPLETI = percorsi(FILE_COMPLETI)
const URL_RIDOTTI = percorsi(FILE_RIDOTTI)

export interface Materiali {
  /** Rovere naturale (lamelle, bordi). */
  rovere: THREE.MeshStandardMaterial
  /** Pavimento in resina, versione senza riflessi. */
  resina: THREE.MeshStandardMaterial
  /** Texture del pavimento, per il materiale riflettente. */
  resinaMappe: { map?: THREE.Texture; roughnessMap?: THREE.Texture }
  metallo: (colore: string) => THREE.MeshStandardMaterial
  pelle: (colore: string) => THREE.MeshPhysicalMaterial
  tessuto: (colore: string) => THREE.MeshPhysicalMaterial
  vetro: THREE.MeshPhysicalMaterial
}

const cache = new Map<string, { chiave: THREE.Texture | undefined; materiali: Materiali }>()

function prepara(t: Texture, completa: boolean) {
  for (const [k, tex] of Object.entries(t)) {
    if (!tex || tex.userData.pronta) continue
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = COLORE.has(k) ? THREE.SRGBColorSpace : THREE.NoColorSpace
    tex.anisotropy = completa ? 8 : 2
    tex.userData.pronta = true
    tex.needsUpdate = true
  }
}

/** Toglie le chiavi undefined: three avvisa se riceve una mappa "undefined". */
function pulito<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

function crea(t: Texture, completa: boolean): Materiali {
  const perColore = <M,>(fn: (c: string) => M) => {
    const m = new Map<string, M>()
    return (c: string) => {
      let x = m.get(c)
      if (!x) {
        x = fn(c)
        m.set(c, x)
      }
      return x
    }
  }
  const rilievo = (n?: THREE.Texture, forza = 1) => (completa && n ? { normalMap: n, normalScale: new THREE.Vector2(forza, forza) } : {})
  return {
    rovere: new THREE.MeshStandardMaterial(pulito({
      map: t.rovere,
      color: '#d9b48a',
      roughnessMap: t.rovereRuvidezza,
      roughness: t.rovereRuvidezza ? 0.95 : 0.62,
      ...rilievo(t.rovereNormale, 0.55),
    })),
    resina: new THREE.MeshStandardMaterial(pulito({
      map: t.resina,
      color: '#bdb5a8',
      roughnessMap: t.resinaRuvidezza,
      roughness: t.resinaRuvidezza ? 1 : 0.4,
      metalness: 0.02,
    })),
    resinaMappe: { map: t.resina, roughnessMap: t.resinaRuvidezza },
    metallo: perColore(
      (c) =>
        new THREE.MeshStandardMaterial(pulito({
          color: c,
          metalness: 0.92,
          roughness: t.metalloRuvidezza ? 1 : 0.28,
          roughnessMap: t.metalloRuvidezza,
          ...rilievo(t.metalloNormale, 0.25),
        })),
    ),
    pelle: perColore(
      (c) =>
        new THREE.MeshPhysicalMaterial(pulito({
          color: c,
          roughness: t.pelleRuvidezza ? 1 : 0.5,
          roughnessMap: t.pelleRuvidezza,
          clearcoat: completa ? 0.25 : 0,
          clearcoatRoughness: 0.45,
          sheen: completa ? 0.25 : 0,
          sheenRoughness: 0.6,
          sheenColor: new THREE.Color('#ffffff').multiplyScalar(0.35),
          ...rilievo(t.pelleNormale, 0.45),
        })),
    ),
    tessuto: perColore(
      (c) =>
        new THREE.MeshPhysicalMaterial(pulito({
          color: c,
          map: t.tessuto,
          roughness: 0.92,
          sheen: 1,
          sheenRoughness: 0.75,
          sheenColor: new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.45),
          ...rilievo(t.tessutoNormale, 0.7),
        })),
    ),
    vetro: new THREE.MeshPhysicalMaterial(pulito({
      color: '#c6d4e2',
      transparent: true,
      opacity: 0.2,
      roughness: 0.03,
      metalness: 0,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.2,
      depthWrite: false,
    })),
  }
}

/** I materiali condivisi da tutta la sala (le texture si caricano una volta sola). */
export function useMateriali(): Materiali {
  const completa = useQualita() === 'completa'
  const t = useTexture(completa ? URL_COMPLETI : URL_RIDOTTI) as Texture
  return useMemo(() => {
    const chiave = completa ? 'completa' : 'ridotta'
    const c = cache.get(chiave)
    if (c && c.chiave === t.rovere) return c.materiali
    prepara(t, completa)
    const materiali = crea(t, completa)
    cache.set(chiave, { chiave: t.rovere, materiali })
    return materiali
  }, [t, completa])
}

/**
 * Coordinate UV "in metri" a proiezione su scatola: la venatura del legno e
 * la grana della pelle hanno la stessa scala su ogni pezzo, qualunque sia la
 * sua misura. La venatura (asse u) corre lungo il lato più lungo della faccia.
 */
export function applicaUvMetriche(geo: THREE.BufferGeometry, metri: number) {
  if (geo.userData.uvMetri === metri) return
  const pos = geo.getAttribute('position')
  let nor = geo.getAttribute('normal')
  if (!pos) return
  if (!nor) {
    geo.computeVertexNormals()
    nor = geo.getAttribute('normal')
  }
  geo.computeBoundingBox()
  const b = geo.boundingBox
  const ext = b ? [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z] : [1, 1, 1]
  const uv = new Float32Array(pos.count * 2)
  const v = [0, 0, 0]
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i))
    const ny = Math.abs(nor.getY(i))
    const nz = Math.abs(nor.getZ(i))
    const asse = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2
    const [a, c] = asse === 0 ? [1, 2] : asse === 1 ? [0, 2] : [0, 1]
    const [u, w] = ext[a] >= ext[c] ? [a, c] : [c, a]
    v[0] = pos.getX(i)
    v[1] = pos.getY(i)
    v[2] = pos.getZ(i)
    uv[i * 2] = v[u] / metri
    uv[i * 2 + 1] = v[w] / metri + asse * 0.37
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.userData.uvMetri = metri
}

/** Ref per una mesh: applica le UV metriche alla sua geometria. */
export function uvMetriche(metri: number) {
  return (m: THREE.Mesh | THREE.InstancedMesh | null) => {
    if (m?.geometry) applicaUvMetriche(m.geometry, metri)
  }
}

/**
 * Luci RGB "vere": come useRgb ma con un'intensità sopra 1, così il bloom
 * le fa brillare mentre schermi e superfici chiare restano nitidi.
 */
export function useRgbLuce(sfasamento = 0, velocita = 0.06, luminosita = 0.55, intensita = 1) {
  const materiali = useRef<(THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.SpriteMaterial | null)[]>([])
  const fermo = useMovimentoRidotto()
  const colore = useRef(new THREE.Color())
  useFrame((stato) => {
    const t = fermo ? 0 : stato.clock.elapsedTime
    materiali.current.forEach((m, i) => {
      if (!m) return
      colore.current.setHSL((t * velocita + sfasamento + i * 0.08) % 1, 0.9, luminosita)
      if ('emissive' in m) m.emissive.copy(colore.current)
      m.color.copy(colore.current)
      // gli aloni additivi restano a intensità normale, le strisce LED "bruciano"
      if (!(m.blending === THREE.AdditiveBlending)) m.color.multiplyScalar(intensita)
    })
  })
  return (i: number) => (m: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.SpriteMaterial | null) => {
    materiali.current[i] = m
  }
}
