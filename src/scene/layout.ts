import type { AgentKey } from '../types'

/** Dimensioni dell'ufficio, in unità di scena. */
export const ROOM = {
  halfWidth: 9.5,
  halfDepth: 8.5,
  wallHeight: 6.4,
}

/** Distanza fra il centro della scrivania e la sedia. */
export const SEAT_OFFSET = 0.95
/** Zona di attesa, davanti alle postazioni. */
export const REST_Z = 3.4
export const WALK_SPEED = 2.9

export interface Workstation {
  index: number
  /** Centro della scrivania. */
  desk: [number, number]
  /** Posizione della sedia: il lavoratore siede dal lato della telecamera. */
  seat: [number, number]
  /** Punto di attesa da cui parte la camminata. */
  rest: [number, number]
  /** Percorso a tappe dalla zona di attesa alla sedia. */
  path: [number, number][]
}

function build(index: number, deskX: number, deskZ: number): Workstation {
  const seatZ = deskZ + SEAT_OFFSET
  return {
    index,
    desk: [deskX, deskZ],
    seat: [deskX, seatZ],
    rest: [deskX, REST_Z],
    path: [
      [deskX, REST_Z],
      [deskX, seatZ],
    ],
  }
}

/**
 * Due file sfalsate: tre postazioni contro la parete di fondo e due davanti,
 * così la lavagna resta visibile e nessuno copre il collega.
 */
export const WORKSTATIONS: Record<AgentKey, Workstation> = {
  lettore: build(0, -5.4, -5.1),
  ricercatore: build(1, 0, -5.1),
  selettore: build(2, 5.4, -5.1),
  scrittore: build(3, -2.7, -0.7),
  controllore: build(4, 2.7, -0.7),
}

export const CAMERA_HOME: [number, number, number] = [0, 8.4, 15.2]
export const CAMERA_TARGET: [number, number, number] = [0, 1.6, -2.6]
