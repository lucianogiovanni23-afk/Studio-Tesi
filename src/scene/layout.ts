import type { AgentKey } from '../types'

/** Posizioni nella scena, in metri. La telecamera guarda lo studio dal davanti. */
export const CAMERA_CASA: [number, number, number] = [0, 5.4, 13]
export const CAMERA_BERSAGLIO: [number, number, number] = [0, 1.6, -2]

export interface Postazione {
  /** Centro della scrivania. */
  scrivania: [number, number]
}

export const POSTAZIONI: Record<AgentKey, Postazione> = {
  bibliotecario: { scrivania: [-5.5, -1.0] },
  lettore: { scrivania: [-2.2, -2.3] },
  scrittore: { scrivania: [2.2, -2.3] },
  revisore: { scrivania: [6.2, -1.2] },
}

export const SCAFFALE: [number, number] = [-7.9, -4.3]
export const TAVOLO_CAPITOLI: [number, number] = [0, 2.1]

export const COLORI = {
  rovere: '#dcc6a1',
  rovereScuro: '#b99a6c',
  crema: '#f6f0e1',
  bianco: '#fbfaf6',
  oliva: '#6b7d2e',
  olivaChiaro: '#93a35a',
  oro: '#c9a43a',
  cielo: '#8fc3e6',
  terra: '#a9ad74',
  tronco: '#76664f',
}

export const COLORE_STATO = {
  da_fare: '#d8d2c2',
  bozza: '#d8b24a',
  rivisto: '#6fa8d6',
  approvato: '#6b8a2e',
} as const
