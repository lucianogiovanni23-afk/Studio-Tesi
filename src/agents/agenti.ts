import type { AgentKey, Chi, ModelSlot } from '../types'

export interface DefinizioneAgente {
  key: AgentKey
  nome: string
  ruolo: string
  /** Colore dell'agente nella scena e nell'interfaccia. */
  colore: string
  /** Fase in cui l'agente diventa operativo. */
  fase: number
  /** La persona che lo interpreta nell'ufficio. */
  persona: Persona
}

export interface Persona {
  /** Il nome è la funzione che svolge. */
  nome: string
  /** Nome corto per le linguette e i pulsanti. */
  breve: string
  /** Cosa fa, in poche parole. */
  titolo: string
  femminile: boolean
  /** Come si presenta nella conversazione. */
  saluto: string
  aspetto: {
    pelle: string
    capelli: string
    taglio: 'corti' | 'caschetto' | 'raccolti' | 'ricci'
    abito: string
    cravatta: string
    occhiali: boolean
    barba: boolean
  }
}

export const AGENTI: DefinizioneAgente[] = [
  {
    key: 'lettore',
    nome: 'Lettrice del corso',
    ruolo: 'Ricava il quadro teorico dal materiale del corso e lo aggiorna quando aggiungi file.',
    colore: '#6b7d2e',
    fase: 1,
    persona: {
      nome: 'Lettrice del corso',
      breve: 'Lettrice',
      titolo: 'Studia le tue lezioni',
      femminile: true,
      saluto: 'Sono la lettrice del corso. Mi leggo le tue lezioni e ti tiro fuori i concetti e le parole giuste da usare nella tesi.',
      aspetto: { pelle: '#f0cba6', capelli: '#7a5230', taglio: 'caschetto', abito: '#33363b', cravatta: '#6b7d2e', occhiali: false, barba: false },
    },
  },
  {
    key: 'bibliotecario',
    nome: 'Bibliotecario',
    ruolo: 'Cerca nei cataloghi accademici, nei siti istituzionali e sul web; seleziona le fonti e prepara le schede di lettura.',
    colore: '#4f8fbf',
    fase: 2,
    persona: {
      nome: 'Bibliotecario',
      breve: 'Bibliotecario',
      titolo: 'Ti trova gli articoli',
      femminile: false,
      saluto: 'Sono il bibliotecario. Ti trovo gli articoli giusti, me li leggo e ti preparo un riassunto di ognuno.',
      aspetto: { pelle: '#e3b98f', capelli: '#3a2a1e', taglio: 'corti', abito: '#1f2a44', cravatta: '#4f8fbf', occhiali: false, barba: false },
    },
  },
  {
    key: 'scrittore',
    nome: 'Scrittore',
    ruolo: 'Propone bozze e riscritture di una sezione alla volta, con citazioni verificate.',
    colore: '#c19a2e',
    fase: 3,
    persona: {
      nome: 'Scrittore',
      breve: 'Scrittore',
      titolo: 'Scrive la tesi con te',
      femminile: false,
      saluto: 'Sono lo scrittore. Scriviamo insieme un pezzo alla volta: prima scegliamo le fonti, poi facciamo la scaletta, poi scrivo la bozza.',
      aspetto: { pelle: '#c99470', capelli: '#17130f', taglio: 'ricci', abito: '#4b505a', cravatta: '#c19a2e', occhiali: false, barba: true },
    },
  },
  {
    key: 'revisore',
    nome: 'Revisore',
    ruolo: 'Controlla citazioni, coerenza fra capitoli, vincolo di materia e osservazioni del relatore.',
    colore: '#a4553a',
    fase: 4,
    persona: {
      nome: 'Revisore',
      breve: 'Revisore',
      titolo: 'Controlla che sia tutto giusto',
      femminile: false,
      saluto: 'Sono il revisore. Controllo che le citazioni siano giuste, che i capitoli filino e sistemo quello che ti dice il relatore. Alla fine ti preparo il file Word.',
      aspetto: { pelle: '#f2d2b3', capelli: '#2b1d16', taglio: 'raccolti', abito: '#1c1c20', cravatta: '#8e3b2b', occhiali: true, barba: false },
    },
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
  lettore: 'Lettrice del corso',
  scrittore: 'Scrittore',
  revisore: 'Revisore',
  chat: 'Chat',
}
