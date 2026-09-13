export type AgentId = 'estrattore' | 'riassuntore' | 'tono' | 'sintetizzatore'

export interface AgentDefinition {
  id: AgentId
  /** Nome mostrato nell'interfaccia e sull'etichetta 3D. */
  name: string
  /** Nome corto usato sull'etichetta 3D sopra la testa. */
  shortName: string
  /** Sottotitolo breve con il compito dell'agente. */
  role: string
  /** Colore distintivo: personaggio, schermo della scrivania, luce puntiforme, card. */
  color: string
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'estrattore',
    name: 'Estrattore',
    shortName: 'Estrattore',
    role: 'Isola entità, numeri, date e fatti chiave',
    color: '#2dd4bf', // verde acqua
  },
  {
    id: 'riassuntore',
    name: 'Riassuntore',
    shortName: 'Riassuntore',
    role: 'Scrive un riassunto di massimo 4 frasi',
    color: '#f2b134', // ambra / oro
  },
  {
    id: 'tono',
    name: 'Analizzatore del tono',
    shortName: 'Tono',
    role: 'Valuta sentiment, registro ed emozioni dominanti',
    color: '#d98a9d', // rosa antico
  },
  {
    id: 'sintetizzatore',
    name: 'Sintetizzatore finale',
    shortName: 'Sintesi',
    role: 'Unisce tutto in un report finale strutturato',
    color: '#6366f1', // indaco
  },
]

export const AGENT_ORDER: AgentId[] = AGENTS.map((a) => a.id)

export const AGENT_BY_ID: Record<AgentId, AgentDefinition> = AGENTS.reduce(
  (acc, a) => {
    acc[a.id] = a
    return acc
  },
  {} as Record<AgentId, AgentDefinition>,
)

const FORMATO = `Rispondi sempre in italiano e usa ESATTAMENTE questo formato, senza premesse e senza altre sezioni:

RAGIONAMENTO:
<qui spieghi in modo sintetico come stai ragionando, max 5 righe>

RISULTATO:
<qui metti solo l'output finale del tuo compito>`

const SYSTEM_PROMPTS: Record<AgentId, string> = {
  estrattore: `Sei l'agente "Estrattore" di una pipeline di analisi testuale.
Il tuo unico compito è isolare dal testo fornito: entità (persone, organizzazioni, luoghi, prodotti), numeri e quantità, date e riferimenti temporali, fatti chiave.
Non riassumere, non interpretare, non aggiungere informazioni che non sono nel testo.

${FORMATO}

Nella sezione RISULTATO usa un elenco puntato raggruppato per categoria (Entità, Numeri, Date, Fatti chiave). Se una categoria è vuota scrivi "nessuno".`,

  riassuntore: `Sei l'agente "Riassuntore" di una pipeline di analisi testuale.
Ricevi il testo originale e i dati già estratti dall'agente precedente. Il tuo compito è scrivere un riassunto di MASSIMO 4 frasi, sfruttando i dati estratti per non perdere numeri, date ed entità importanti.
Non inventare nulla che non sia nel testo.

${FORMATO}

Nella sezione RISULTATO scrivi solo il riassunto in prosa, massimo 4 frasi.`,

  tono: `Sei l'agente "Analizzatore del tono" di una pipeline di analisi testuale.
Ricevi il testo originale e il riassunto prodotto dall'agente precedente. Il tuo compito è valutare: il sentiment complessivo (positivo / neutro / negativo, con intensità), il registro (formale, informale, tecnico, giornalistico, promozionale...) e le emozioni dominanti.
Motiva ogni valutazione con un breve riferimento al testo.

${FORMATO}

Nella sezione RISULTATO usa tre voci etichettate: "Sentiment:", "Registro:", "Emozioni dominanti:".`,

  sintetizzatore: `Sei l'agente "Sintetizzatore finale" di una pipeline di analisi testuale.
Ricevi gli output dei tre agenti precedenti (dati estratti, riassunto, analisi del tono) e devi unirli in un unico report finale coerente, senza ripetizioni e senza contraddizioni.

${FORMATO}

Nella sezione RISULTATO usa esattamente queste tre sezioni, in quest'ordine e con queste etichette:

Panoramica
<2-3 frasi che inquadrano il testo>

Punti chiave
<elenco puntato con i fatti, i numeri e le date più rilevanti>

Tono
<2-3 frasi che sintetizzano sentiment, registro ed emozioni>`,
}

export interface PromptContext {
  /** Testo incollato dall'utente. */
  sourceText: string
  /** Sezione RISULTATO degli agenti già completati. */
  previousResults: Partial<Record<AgentId, string>>
}

/** Costruisce system prompt e messaggio utente per un agente, usando gli output precedenti. */
export function buildPrompt(
  id: AgentId,
  { sourceText, previousResults }: PromptContext,
): { system: string; user: string } {
  const testo = `TESTO ORIGINALE:\n"""\n${sourceText.trim()}\n"""`

  let user: string
  switch (id) {
    case 'estrattore':
      user = `${testo}\n\nEstrai entità, numeri, date e fatti chiave da questo testo.`
      break
    case 'riassuntore':
      user = `${testo}\n\nDATI ESTRATTI DALL'AGENTE 1 (Estrattore):\n"""\n${previousResults.estrattore ?? '(non disponibili)'}\n"""\n\nScrivi un riassunto di massimo 4 frasi usando anche i dati estratti.`
      break
    case 'tono':
      user = `${testo}\n\nRIASSUNTO DELL'AGENTE 2 (Riassuntore):\n"""\n${previousResults.riassuntore ?? '(non disponibile)'}\n"""\n\nAnalizza sentiment, registro ed emozioni dominanti del testo originale.`
      break
    case 'sintetizzatore':
      user = `${testo}\n\nOUTPUT AGENTE 1 — Estrattore (entità, numeri, date, fatti):\n"""\n${previousResults.estrattore ?? '(non disponibile)'}\n"""\n\nOUTPUT AGENTE 2 — Riassuntore:\n"""\n${previousResults.riassuntore ?? '(non disponibile)'}\n"""\n\nOUTPUT AGENTE 3 — Analizzatore del tono:\n"""\n${previousResults.tono ?? '(non disponibile)'}\n"""\n\nUnisci questi output in un report finale con le sezioni Panoramica / Punti chiave / Tono.`
      break
  }

  return { system: SYSTEM_PROMPTS[id], user }
}
