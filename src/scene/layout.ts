import type { AgentKey } from '../types'

/** Dimensioni della sala, in unità di scena. */
export const SALA = {
  semiLarghezza: 10,
  semiProfondita: 9,
  altezza: 7.6,
}

/** Distanza fra il centro della scrivania e la sedia. */
export const SEDIA_Z = 0.95
/** Zona d'ingresso, dove i broker attendono il turno. */
export const INGRESSO_Z = 3.6
export const VELOCITA_PASSO = 2.9

export interface Postazione {
  indice: number
  scrivania: [number, number]
  sedia: [number, number]
  attesa: [number, number]
  percorso: [number, number][]
}

function crea(indice: number, x: number, z: number): Postazione {
  const sediaZ = z + SEDIA_Z
  return {
    indice,
    scrivania: [x, z],
    sedia: [x, sediaZ],
    attesa: [x, INGRESSO_Z],
    percorso: [
      [x, INGRESSO_Z],
      [x, sediaZ],
    ],
  }
}

/**
 * Due file sfalsate: tre postazioni contro la parete di fondo e due davanti,
 * così il tabellone e la lavagna restano visibili.
 */
export const POSTAZIONI: Record<AgentKey, Postazione> = {
  lettore: crea(0, -5.6, -5.4),
  ricercatore: crea(1, 0, -5.4),
  selettore: crea(2, 5.6, -5.4),
  scrittore: crea(3, -2.8, -1.0),
  controllore: crea(4, 2.8, -1.0),
}

export const CAMERA_CASA: [number, number, number] = [0, 7.4, 15.2]
export const CAMERA_BERSAGLIO: [number, number, number] = [0, 2.1, -2.8]

/** Posizione della campanella di contrattazione, vicino all'ingresso. */
export const CAMPANELLA: [number, number, number] = [-8.6, 0, 2.2]
