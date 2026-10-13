import { useEffect, useRef } from 'react'
import { useProgress, useTexture } from '@react-three/drei'
import { Bloom, EffectComposer, LUT, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, KernelSize, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'

/**
 * Post-produzione "da videogioco":
 * - niente profondità di campo: anche da vicino tutto resta nitido;
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

export function Effetti({ qualita, notte }: { qualita: 'completa' | 'ridotta'; notte: boolean }) {
  const completa = qualita === 'completa'
  useSegnalePronto()
  const lut = useTexture(LUT_URL, preparaLut)
  const lutRef = useRef<ConOpacita | null>(null)
  useEffect(() => impostaOpacita(lutRef.current, notte ? 0.3 : 0.45))

  return (
    <EffectComposer multisampling={completa ? 4 : 2} enableNormalPass={false}>
      {completa ? <N8AO aoRadius={0.55} distanceFalloff={0.9} intensity={notte ? 2.2 : 2.6} quality="medium" halfRes color={notte ? '#0b0d18' : '#1a140c'} /> : <></>}
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
