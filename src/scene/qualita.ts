import { createContext, useContext } from 'react'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { dispositivoTattile, useModoUso } from '../hooks/useModoUso'
import { useStudio } from '../store'

/** Qualità effettiva della scena, dopo aver risolto la modalità "auto". */
export type QualitaScena = 'completa' | 'ridotta' | 'spenta'

export const ContestoQualita = createContext<'completa' | 'ridotta'>('completa')

/** Dentro il Canvas: i componenti che accendono ombre o dettagli la consultano. */
export function useQualita() {
  return useContext(ContestoQualita)
}

function dispositivoModesto(): boolean {
  if (typeof navigator === 'undefined') return false
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const nuclei = navigator.hardwareConcurrency
  return (memoria !== undefined && memoria <= 4) || (nuclei !== undefined && nuclei <= 4) || dispositivoTattile()
}

/**
 * "automatica" sceglie la ridotta su iPad, sui dispositivi meno potenti e
 * quando il sistema chiede meno animazioni; altrimenti la completa.
 */
export function useQualitaScena(): QualitaScena {
  const modalita = useStudio((s) => s.preferenze.modalitaScena)
  const modo = useModoUso()
  const ridotto = useMovimentoRidotto()
  if (modalita !== 'auto') return modalita
  return modo === 'ipad' || ridotto || dispositivoModesto() ? 'ridotta' : 'completa'
}

/** Di notte la sala cambia luci, cielo e bagliori. */
export const ContestoNotte = createContext(false)

export function useNotte() {
  return useContext(ContestoNotte)
}

/**
 * Larghezza in pixel coperta dal pannello della conversazione sul lato
 * destro del canvas, e se le etichette vanno nascoste (intro in corso).
 */
export const ContestoEtichette = createContext<{ spazioDestra: number; nascoste: boolean }>({ spazioDestra: 0, nascoste: false })

export function useContestoEtichette() {
  return useContext(ContestoEtichette)
}
