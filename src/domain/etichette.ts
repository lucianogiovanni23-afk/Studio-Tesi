import type { StatoCapitolo } from '../types'

export const ETICHETTA_STATO: Record<StatoCapitolo, string> = {
  da_fare: 'da fare',
  bozza: 'bozza',
  rivisto: 'rivisto',
  approvato: 'approvato dal relatore',
}
