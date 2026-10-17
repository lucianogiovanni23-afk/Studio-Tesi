import { createContext, useContext } from 'react'
import { useStudio } from '../store'
import { PRESET, extraPredefinite, type ExtraGrafica, type ValoriGrafica } from '../grafica/grafica'

/** La sala 3D è accesa o spenta (interruttore "Ufficio 3D" del menu Grafica). */
export type QualitaScena = 'attiva' | 'spenta'

export function useQualitaScena(): QualitaScena {
  return useStudio((s) => s.preferenze.modalitaScena) === 'spenta' ? 'spenta' : 'attiva'
}

/**
 * Le impostazioni grafiche effettive, dentro il Canvas: ogni componente
 * accende ombre, dettagli ed effetti in base a queste (vedi grafica/grafica.ts).
 */
export interface Grafica extends ValoriGrafica {
  extra: ExtraGrafica
  /** Animazioni d'ambiente ferme (respiro, ventole, luci RGB, vento, uccelli). */
  fermo: boolean
}

export const ContestoGrafica = createContext<Grafica>({ ...PRESET.alta, extra: extraPredefinite(), fermo: false })

export function useGrafica(): Grafica {
  return useContext(ContestoGrafica)
}

/** Le animazioni d'ambiente sono ferme (menu Grafica › Animazioni, o "riduci movimento" del sistema). */
export function useFermo(): boolean {
  return useContext(ContestoGrafica).fermo
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
