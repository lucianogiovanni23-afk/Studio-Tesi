import type { AgentKey, Chi, ModelSlot } from '../types'

export interface DefinizioneAgente {
  key: AgentKey
  nome: string
  ruolo: string
  /** Colore dell'agente nella scena e nell'interfaccia. */
  colore: string
  /** Fase in cui l'agente diventa operativo. */
  fase: number
}

export const AGENTI: DefinizioneAgente[] = [
  {
    key: 'bibliotecario',
    nome: 'Bibliotecario',
    ruolo: 'Cerca nei cataloghi accademici, nei siti istituzionali e sul web; seleziona le fonti e prepara le schede di lettura.',
    colore: '#4f8fbf',
    fase: 2,
  },
  {
    key: 'lettore',
    nome: 'Lettore del corso',
    ruolo: 'Ricava il quadro teorico dal materiale del corso e lo aggiorna quando aggiungi file.',
    colore: '#6b7d2e',
    fase: 1,
  },
  {
    key: 'scrittore',
    nome: 'Scrittore',
    ruolo: 'Propone bozze e riscritture di una sezione alla volta, con citazioni verificate.',
    colore: '#c19a2e',
    fase: 3,
  },
  {
    key: 'revisore',
    nome: 'Revisore',
    ruolo: 'Controlla citazioni, coerenza fra capitoli, vincolo di materia e osservazioni del relatore.',
    colore: '#a4553a',
    fase: 4,
  },
]

export const AGENTE: Record<AgentKey, DefinizioneAgente> = Object.fromEntries(
  AGENTI.map((a) => [a.key, a]),
) as Record<AgentKey, DefinizioneAgente>

export const AGENT_KEYS: AgentKey[] = AGENTI.map((a) => a.key)

export function nomeChi(chi: Chi): string {
  if (chi === 'chat') return 'Chat'
  if (chi === 'diagnostica') return 'Diagnostica'
  if (chi === 'selezione') return 'Bibliotecario (selezione)'
  return AGENTE[chi].nome
}

export const ETICHETTE_SLOT: Record<ModelSlot, string> = {
  bibliotecario: 'Bibliotecario — ricerca e schede',
  selezione: 'Bibliotecario — selezione dei risultati',
  lettore: 'Lettore del corso',
  scrittore: 'Scrittore',
  revisore: 'Revisore',
  chat: 'Chat',
}
