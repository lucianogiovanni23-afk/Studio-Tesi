import type { AgentKey } from '../types'

/**
 * Un'unica sala open space, in metri. All'avvio la telecamera la mostra
 * tutta, da lontano; quando lavori con una persona si avvicina a lei.
 */
/** Altezza del soffitto: doppia altezza, così girando la visuale non si esce dalla sala. */
export const ALTEZZA_SALA = 6.6

export const CAMERA_CASA: [number, number, number] = [0, 2.8, 10.6]
export const CAMERA_BERSAGLIO: [number, number, number] = [0, 1.75, -2.4]

/** Parete di fondo con la porta d'ingresso, alle spalle della vista d'insieme. */
export const PARETE_FONDO_Z = 12
export const PORTA = { larghezza: 2.4, altezza: 3.1 }
/** Intro della prima visita: fuori dalla porta, poi la telecamera entra. */
export const CAMERA_INGRESSO: [number, number, number] = [0, 1.65, 17.5]
export const INGRESSO_BERSAGLIO: [number, number, number] = [0, 1.55, 4]

export interface Postazione {
  /** Centro della scrivania. */
  scrivania: [number, number]
  /** Rotazione della scrivania verso il centro della sala. */
  rotazione: number
}

export const POSTAZIONI: Record<AgentKey, Postazione> = {
  lettore: { scrivania: [-4.5, -1.3], rotazione: 0.3 },
  bibliotecario: { scrivania: [-1.5, -2.1], rotazione: 0.09 },
  scrittore: { scrivania: [1.5, -2.1], rotazione: -0.09 },
  revisore: { scrivania: [4.5, -1.3], rotazione: -0.3 },
}

/** Dove sta la persona rispetto alla sua scrivania (dietro, rivolta alla sala). */
export const DIETRO_SCRIVANIA = -0.72

export const COLORI = {
  pavimento: '#d9d4cc',
  parete: '#f3f2ee',
  piano: '#f5f4f1',
  rovere: '#c9a57a',
  nero: '#1d1f22',
  oliva: '#5f7128',
  olivaScuro: '#3f4d1b',
  tessuto: '#8d918b',
}

export const COLORE_STATO = {
  da_fare: '#cfcac0',
  bozza: '#d8b24a',
  rivisto: '#6fa8d6',
  approvato: '#7d9a37',
} as const
