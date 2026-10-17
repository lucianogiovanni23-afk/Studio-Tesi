import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { useProgress, useTexture } from '@react-three/drei'
import { Bloom, EffectComposer, FXAA, LUT, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, KernelSize, ToneMappingMode, type EffectComposer as EffectComposerImpl } from 'postprocessing'
import * as THREE from 'three'
import type { Grafica } from './qualita'

/**
 * Post-produzione "da videogioco":
 * - niente profondità di campo: anche da vicino tutto resta nitido;
 * - bloom selettivo: brillano solo le luci più forti della scena (LED RGB,
 *   lampade, tagli di luce del soffitto), non gli schermi o le pareti chiare;
 * - occlusione ambientale (N8AO) per le ombre di contatto;
 * - tone mapping ACES, vignettatura leggera e una LUT di contrasto morbida,
 *   uguali di giorno e di notte.
 * Ogni effetto si accende o spegne dal menu Grafica: occlusione ambientale,
 * bagliore (pieno con le luci realistiche, leggero senza), effetti cinema
 * (LUT e vignettatura) e antialiasing (MSAA nel composer, oppure SMAA/FXAA
 * in fondo alla catena).
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

export function Effetti({ g, notte }: { g: Grafica; notte: boolean }) {
  const pieno = g.luci
  useSegnalePronto()
  const lut = useTexture(LUT_URL, preparaLut)
  const lutRef = useRef<ConOpacita | null>(null)
  useEffect(() => impostaOpacita(lutRef.current, notte ? 0.3 : 0.45))
  const campioni = g.aa === 'msaa4' ? 4 : g.aa === 'msaa2' ? 2 : 0
  const composer = useRef<EffectComposerImpl | null>(null)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  // Cambiando la densità di pixel (scala, risoluzione dinamica) i buffer del composer vanno ridimensionati.
  useEffect(() => {
    composer.current?.setSize(size.width, size.height)
  }, [dpr, size.width, size.height])

  // Con un antialiasing MSAA diverso il composer si ricrea: quello vecchio libera la memoria.
  useEffect(() => {
    const c = composer.current
    return () => c?.dispose()
  }, [campioni])

  return (
    <EffectComposer key={campioni} ref={composer} multisampling={campioni} enableNormalPass={false}>
      {g.ao > 0 ? (
        <N8AO
          aoRadius={0.55}
          distanceFalloff={0.9}
          intensity={notte ? 2.2 : 2.6}
          quality={g.ao === 2 ? 'high' : 'medium'}
          halfRes={g.ao === 1}
          color={notte ? '#0b0d18' : '#1a140c'}
        />
      ) : (
        <></>
      )}
      {g.bagliore ? (
        <Bloom
          mipmapBlur={pieno}
          kernelSize={pieno ? KernelSize.LARGE : KernelSize.SMALL}
          luminanceThreshold={pieno ? 1.0 : 1.15}
          luminanceSmoothing={0.25}
          intensity={pieno ? (notte ? 0.95 : 0.55) : notte ? 0.6 : 0.3}
          radius={0.72}
          resolutionScale={pieno ? 0.5 : 0.25}
        />
      ) : (
        <></>
      )}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {g.cinema ? <LUT ref={lutRef as never} lut={lut} blendFunction={BlendFunction.NORMAL} /> : <></>}
      {g.cinema ? <Vignette offset={0.3} darkness={notte ? 0.6 : 0.5} blendFunction={BlendFunction.NORMAL} /> : <></>}
      {g.aa === 'smaa' ? <SMAA /> : <></>}
      {g.aa === 'fxaa' ? <FXAA /> : <></>}
    </EffectComposer>
  )
}
