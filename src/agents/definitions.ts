import type { AgentKey } from '../types'

export interface AgentDefinition {
  key: AgentKey
  /** Nome sulla targhetta e nelle card. */
  name: string
  /** Nome corto per la micro-etichetta 3D. */
  shortName: string
  /** Ruolo, stampato sulla targhetta della scrivania. */
  role: string
  /** Colore distintivo: monitor, luce di postazione, bordo della card. */
  color: string
  /** Dettaglio caratterizzante del personaggio. */
  trait: 'occhiali' | 'cravatta' | 'cuffie' | 'cartellino' | 'sciarpa'
}

export const AGENTS: AgentDefinition[] = [
  {
    key: 'lettore',
    name: 'Lettore',
    shortName: 'Lettore',
    role: 'Studia il materiale del corso',
    color: '#2dd4bf',
    trait: 'occhiali',
  },
  {
    key: 'ricercatore',
    name: 'Ricercatore',
    shortName: 'Ricerca',
    role: 'Cerca fonti reali online',
    color: '#f2b134',
    trait: 'cuffie',
  },
  {
    key: 'selettore',
    name: 'Selettore',
    shortName: 'Selezione',
    role: 'Sceglie le fonti pertinenti',
    color: '#d98a9d',
    trait: 'sciarpa',
  },
  {
    key: 'scrittore',
    name: 'Scrittore',
    shortName: 'Scrittura',
    role: 'Redige tre bozze del capitolo',
    color: '#a855f7',
    trait: 'cravatta',
  },
  {
    key: 'controllore',
    name: 'Controllore',
    shortName: 'Controllo',
    role: 'Sorveglia qualità ed errori',
    color: '#6366f1',
    trait: 'cartellino',
  },
]

export const AGENT_ORDER: AgentKey[] = AGENTS.map((a) => a.key)

/** Agenti della pipeline vera e propria: il Controllore è attivo in parallelo. */
export const PIPELINE_ORDER: AgentKey[] = ['lettore', 'ricercatore', 'selettore', 'scrittore']

export const AGENT_BY_KEY: Record<AgentKey, AgentDefinition> = AGENTS.reduce(
  (acc, a) => {
    acc[a.key] = a
    return acc
  },
  {} as Record<AgentKey, AgentDefinition>,
)
