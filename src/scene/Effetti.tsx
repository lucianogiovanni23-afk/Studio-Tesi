import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useProgress, useTexture } from '@react-three/drei'
import { Bloom, EffectComposer, LUT, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, DepthOfFieldEffect, KernelSize, MaskFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import type { AgentKey } from '../types'
import { EVENTO_VOLO, puntoSchermo, puntoViso } from './punti'

/**
 * Post-produzione "da videogioco":
 * - profondità di campo quando la telecamera inquadra una persona (nella
 *   vista d'insieme è tutto a fuoco), con passaggio morbido;
 * - bloom selettivo: brillano solo le luci più forti della scena (LED RGB,
 *   lampade, tagli di luce del soffitto), non gli schermi o le pareti chiare;
 * - occlusione ambientale (N8AO) per le ombre di contatto;
 * - tone mapping ACES, vignettatura leggera e una LUT di contrasto morbida,
 *   uguali di giorno e di notte.
 * Nella qualità ridotta restano solo tone mapping, vignettatura e un bloom
 * leggero a mezza risoluzione.
 */

const LUT_URL = `${import.meta.env.BASE_URL}assets/materiali/lut_contrasto_caldo.png`

/** Avanzamento dei download della scena (0–100), per la barra della schermata di caricamento. */
export const EVENTO_PROGRESSO = 'studio-tesi-ufficio-progresso'

// L'ufficio sta fuori dal Canvas (e fuori da questo pacchetto): gli arriva tutto per evento.
if (typeof window !== 'undefined') {
  useProgress.subscribe((s) => window.dispatchEvent(new CustomEvent(EVENTO_PROGRESSO, { detail: s.progress })))
}

/** Segnala all'ufficio (fuori dal Canvas) che la scena è pronta: la schermata di caricamento sparisce. */
export const EVENTO_PRONTO = 'studio-tesi-ufficio-pronto'

function useSegnalePronto() {
  useEffect(() => {
    let f2 = 0
    // due fotogrammi: il primo compila gli shader, il secondo è quello vero
    const f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => {
        document.documentElement.dataset.ufficioPronto = '1'
        window.dispatchEvent(new Event(EVENTO_PRONTO))
      })
    })
    return () => {
      cancelAnimationFrame(f1)
      cancelAnimationFrame(f2)
      delete document.documentElement.dataset.ufficioPronto
    }
  }, [])
}

/**
 * Regia della profondità di campo: il fuoco va sul viso della persona
 * inquadrata (o sullo schermo, in volo) e la sfocatura entra e esce piano.
 */
class FuocoMorbido {
  readonly effetto: DepthOfFieldEffect
  private forza = 0
  private obiettivo = 0
  private volo = false

  constructor(camera: THREE.Camera) {
    this.effetto = new DepthOfFieldEffect(camera, { focusDistance: 3, focusRange: 1.6, bokehScale: 0, resolutionScale: 0.5 })
    this.effetto.target = new THREE.Vector3(...puntoViso('lettore'))
    ;(this.effetto as unknown as { maskPass: { maskFunction: MaskFunction } }).maskPass.maskFunction = MaskFunction.MULTIPLY_RGB_SET_ALPHA
    this.applica()
  }

  mira(fuoco: AgentKey | null, subito: boolean) {
    this.volo = false
    this.obiettivo = fuoco ? 1 : 0
    if (fuoco) this.effetto.target?.set(...puntoViso(fuoco))
    if (subito) this.forza = this.obiettivo
    this.applica()
  }

  vola(k: AgentKey) {
    this.effetto.target?.copy(puntoSchermo(k).centro)
    this.volo = true
    this.obiettivo = 1
  }

  /** Avanza la transizione; true se serve un altro fotogramma. */
  passo(delta: number): boolean {
    if (Math.abs(this.forza - this.obiettivo) <= 0.001) return false
    // ~1.2 s per entrare a fuoco: accompagna il volo della telecamera
    this.forza += (this.obiettivo - this.forza) * Math.min(1, delta * 3.2)
    if (Math.abs(this.forza - this.obiettivo) <= 0.001) this.forza = this.obiettivo
    this.applica()
    return true
  }

  private applica() {
    this.effetto.blendMode.opacity.value = this.forza
    this.effetto.bokehScale = this.forza * (this.volo ? 4.5 : 3.2)
    this.effetto.cocMaterial.focusRange = this.volo ? 0.6 : 1.4
  }
}

/** Profondità di campo che segue la persona inquadrata. */
function useProfondita(fuoco: AgentKey | null, attiva: boolean) {
  const camera = useThree((s) => s.camera)
  const invalida = useThree((s) => s.invalidate)
  const fermo = useMovimentoRidotto()
  const regia = useMemo(() => (attiva ? new FuocoMorbido(camera) : null), [camera, attiva])
  useEffect(() => () => regia?.effetto.dispose(), [regia])

  useEffect(() => {
    regia?.mira(fuoco, fermo)
    invalida()
  }, [regia, fuoco, fermo, invalida])

  // In volo verso lo schermo il fuoco passa al monitor e lo sfondo si sfoca di più.
  useEffect(() => {
    if (!regia) return
    const vola = (e: Event) => regia.vola((e as CustomEvent<AgentKey>).detail)
    window.addEventListener(EVENTO_VOLO, vola)
    return () => window.removeEventListener(EVENTO_VOLO, vola)
  }, [regia])

  useFrame((_, delta) => {
    if (regia?.passo(delta)) invalida()
  })
  return regia?.effetto ?? null
}

function preparaLut(t: THREE.Texture | THREE.Texture[]) {
  for (const x of Array.isArray(t) ? t : [t]) {
    x.flipY = false
    x.colorSpace = THREE.NoColorSpace
    x.generateMipmaps = false
    x.minFilter = x.magFilter = THREE.LinearFilter
    x.needsUpdate = true
  }
}

type ConOpacita = { blendMode: { opacity: { value: number } } }

function impostaOpacita(e: ConOpacita | null, valore: number) {
  if (e) e.blendMode.opacity.value = valore
}

export function Effetti({ qualita, notte, fuoco }: { qualita: 'completa' | 'ridotta'; notte: boolean; fuoco: AgentKey | null }) {
  const completa = qualita === 'completa'
  useSegnalePronto()
  const dof = useProfondita(fuoco, completa)
  const lut = useTexture(LUT_URL, preparaLut)
  const lutRef = useRef<ConOpacita | null>(null)
  useEffect(() => impostaOpacita(lutRef.current, notte ? 0.3 : 0.45))

  return (
    <EffectComposer multisampling={completa ? 4 : 2} enableNormalPass={false}>
      {completa ? <N8AO aoRadius={0.55} distanceFalloff={0.9} intensity={notte ? 2.2 : 2.6} quality="medium" halfRes color={notte ? '#0b0d18' : '#1a140c'} /> : <></>}
      {dof ? <primitive object={dof} /> : <></>}
      <Bloom
        mipmapBlur={completa}
        kernelSize={completa ? KernelSize.LARGE : KernelSize.SMALL}
        luminanceThreshold={completa ? 1.0 : 1.15}
        luminanceSmoothing={0.25}
        intensity={completa ? (notte ? 0.95 : 0.55) : notte ? 0.6 : 0.3}
        radius={0.72}
        resolutionScale={completa ? 0.5 : 0.25}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <LUT ref={lutRef as never} lut={lut} blendFunction={BlendFunction.NORMAL} />
      <Vignette offset={0.3} darkness={notte ? 0.6 : 0.5} blendFunction={BlendFunction.NORMAL} />
    </EffectComposer>
  )
}
