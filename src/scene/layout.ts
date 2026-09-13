import { AGENT_ORDER, type AgentId } from '../agents'

/** Dimensioni della stanza low-poly (in unità di scena). */
export const ROOM = {
  halfWidth: 8,
  halfDepth: 7,
  wallHeight: 7,
}

/** Posizione x delle 4 scrivanie, disposte in fila. */
export const DESK_X = [-4.5, -1.5, 1.5, 4.5]
/** Le scrivanie stanno davanti alla parete di fondo. */
export const DESK_Z = -3.6
/** Il personaggio lavora dietro la scrivania, rivolto verso la camera. */
export const WORK_Z = -4.7
/** Posizione di riposo: fila aperta davanti alle scrivanie. */
export const REST_Z = 0.7
/** Velocità di camminata, in unità di scena al secondo. */
export const WALK_SPEED = 3.2

export interface AgentLayout {
  index: number
  deskPosition: [number, number, number]
  /** Percorso a tappe dal punto di riposo alla scrivania, aggirando le scrivanie. */
  path: [number, number][]
}

function buildLayout(index: number): AgentLayout {
  const x = DESK_X[index]
  // Corridoio di passaggio: lo spazio libero a sinistra di ogni scrivania.
  const aisleX = x - 1.5
  return {
    index,
    deskPosition: [x, 0, DESK_Z],
    path: [
      [x, REST_Z],
      [aisleX, REST_Z],
      [aisleX, WORK_Z],
      [x, WORK_Z],
    ],
  }
}

export const LAYOUT: Record<AgentId, AgentLayout> = AGENT_ORDER.reduce(
  (acc, id, index) => {
    acc[id] = buildLayout(index)
    return acc
  },
  {} as Record<AgentId, AgentLayout>,
)
