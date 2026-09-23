import type { AgentKey } from '../types'

/**
 * Nome di fantasia della società: l'ambientazione evoca l'epoca senza usare
 * marchi, titoli o nomi reali o di finzione legati a film.
 */
export const NOME_SOCIETA = 'Harrow & Vance Securities'
export const SOTTOTITOLO_SOCIETA = 'Investment Research · Est. 1987'

export type Dettaglio = 'occhiali' | 'fazzoletto' | 'orologio' | 'auricolare' | 'cartellino'

export interface AgentDefinition {
  key: AgentKey
  nome: string
  /** Nome corto per la micro-etichetta 3D. */
  nomeCorto: string
  ruolo: string
  /** Colore distintivo: monitor, luce di postazione, accento sulla cravatta. */
  colore: string
  dettaglio: Dettaglio
  /** Colore dell'abito, per variare i broker fra loro. */
  abito: string
}

export const AGENTI: AgentDefinition[] = [
  {
    key: 'lettore',
    nome: 'Lettore',
    nomeCorto: 'Lettore',
    ruolo: 'Dossier del corso',
    colore: '#2dd4bf',
    dettaglio: 'occhiali',
    abito: '#232a3a',
  },
  {
    key: 'ricercatore',
    nome: 'Ricercatore',
    nomeCorto: 'Ricerca',
    ruolo: 'Fonti dal mercato',
    colore: '#f2b134',
    dettaglio: 'auricolare',
    abito: '#2a2f42',
  },
  {
    key: 'selettore',
    nome: 'Selettore',
    nomeCorto: 'Selezione',
    ruolo: 'Vaglio delle fonti',
    colore: '#d98a9d',
    dettaglio: 'fazzoletto',
    abito: '#262b3c',
  },
  {
    key: 'scrittore',
    nome: 'Scrittore',
    nomeCorto: 'Scrittura',
    ruolo: 'Stesura del capitolo',
    colore: '#a855f7',
    dettaglio: 'orologio',
    abito: '#1f2536',
  },
  {
    key: 'controllore',
    nome: 'Controllore',
    nomeCorto: 'Controllo',
    ruolo: 'Compliance interna',
    colore: '#6366f1',
    dettaglio: 'cartellino',
    abito: '#2b3145',
  },
]

export const AGENTE: Record<AgentKey, AgentDefinition> = AGENTI.reduce(
  (acc, a) => {
    acc[a.key] = a
    return acc
  },
  {} as Record<AgentKey, AgentDefinition>,
)
