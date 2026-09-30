import { createContext, useContext, useEffect, useState } from 'react'
import { useStudioStore } from '../store'

/** Qualità effettiva della scena, dopo aver risolto la modalità "auto". */
export type QualitaScena = 'completa' | 'ridotta' | 'spenta'

export const ContestoQualita = createContext<'completa' | 'ridotta'>('completa')

/** Dentro il Canvas: i componenti che accendono luci o ombre la consultano. */
export function useQualita() {
  return useContext(ContestoQualita)
}

function dispositivoModesto(): boolean {
  if (typeof window === 'undefined') return false
  const movimentoRidotto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const tocco = window.matchMedia?.('(pointer: coarse)').matches === true
  return movimentoRidotto || (memoria !== undefined && memoria <= 4) || tocco
}

/**
 * "auto" sceglie la versione ridotta su tablet, dispositivi con poca memoria o
 * quando il sistema chiede meno animazioni; altrimenti la versione completa.
 */
export function useQualitaScena(): QualitaScena {
  const modalita = useStudioStore((s) => s.modalitaScena)
  const [modesto, setModesto] = useState(dispositivoModesto)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const aggiorna = () => setModesto(dispositivoModesto())
    query?.addEventListener('change', aggiorna)
    return () => query?.removeEventListener('change', aggiorna)
  }, [])

  if (modalita === 'auto') return modesto ? 'ridotta' : 'completa'
  return modalita
}
