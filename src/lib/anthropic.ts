export const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
export const ANTHROPIC_MAX_TOKENS = 1000
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

/** Errore già tradotto in un messaggio leggibile per l'utente. */
export class AnthropicError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'AnthropicError'
    this.status = status
  }
}

interface ApiErrorBody {
  error?: { type?: string; message?: string }
}

interface ApiSuccessBody {
  content?: Array<{ type: string; text?: string }>
}

function describeHttpError(status: number, body: ApiErrorBody | null): string {
  const detail = body?.error?.message?.trim()
  const suffix = detail ? ` Dettaglio dall'API: ${detail}` : ''

  switch (status) {
    case 400:
      return `Richiesta rifiutata dall'API (400). Controlla il testo inviato e il nome del modello.${suffix}`
    case 401:
      return `Chiave API non valida o non autorizzata (401). Controlla di aver incollato la chiave giusta e che sia ancora attiva.${suffix}`
    case 403:
      return `Accesso negato (403). La chiave non ha i permessi per usare questo modello.${suffix}`
    case 404:
      return `Modello o endpoint non trovato (404). Il modello "${ANTHROPIC_MODEL}" potrebbe non essere disponibile per questa chiave.${suffix}`
    case 413:
      return `Richiesta troppo grande (413). Prova con un testo più corto.${suffix}`
    case 429:
      return `Limite di richieste raggiunto (429). Attendi qualche secondo e ritenta.${suffix}`
    case 529:
      return `L'API è temporaneamente sovraccarica (529). Riprova tra poco.${suffix}`
    default:
      if (status >= 500) {
        return `Errore del server Anthropic (${status}). Riprova tra poco.${suffix}`
      }
      return `Errore imprevisto dall'API (${status}).${suffix}`
  }
}

export interface CallOptions {
  apiKey: string
  system: string
  user: string
  signal?: AbortSignal
}

/**
 * Chiama l'API Messages di Anthropic direttamente dal browser.
 * Richiede l'header anthropic-dangerous-direct-browser-access, altrimenti l'API rifiuta
 * le richieste che arrivano da un contesto browser.
 */
export async function callAnthropic({ apiKey, system, user, signal }: CallOptions): Promise<string> {
  const key = apiKey.trim()
  if (!key) {
    throw new AnthropicError('Manca la chiave API: incollala nel campo qui sopra per avviare la pipeline.')
  }

  let response: Response
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal,
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new AnthropicError(
      "Impossibile raggiungere api.anthropic.com. Controlla la connessione di rete, un eventuale proxy/firewall o un'estensione del browser che blocca la richiesta.",
    )
  }

  if (!response.ok) {
    let body: ApiErrorBody | null = null
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      body = null
    }
    throw new AnthropicError(describeHttpError(response.status, body), response.status)
  }

  let data: ApiSuccessBody
  try {
    data = (await response.json()) as ApiSuccessBody
  } catch {
    throw new AnthropicError("La risposta dell'API non è un JSON valido.")
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n')
    .trim()

  if (!text) {
    throw new AnthropicError("L'API ha risposto senza contenuto testuale. Riprova.")
  }

  return text
}

export interface ParsedSections {
  reasoning: string
  result: string
}

/** Separa le sezioni "RAGIONAMENTO:" e "RISULTATO:" della risposta di un agente. */
export function parseSections(raw: string): ParsedSections {
  const text = raw.replace(/\r/g, '').trim()
  const reasoningMatch = /(^|\n)\s*#*\s*\**\s*RAGIONAMENTO\s*\**\s*:/i.exec(text)
  const resultMatch = /(^|\n)\s*#*\s*\**\s*RISULTATO\s*\**\s*:/i.exec(text)

  // Senza etichetta RISULTATO consideriamo tutta la risposta come risultato,
  // così l'interfaccia mostra comunque qualcosa di utile.
  if (!resultMatch) {
    return { reasoning: '', result: text }
  }

  const resultStart = resultMatch.index + resultMatch[0].length
  const result = text.slice(resultStart).trim()

  let reasoning = ''
  if (reasoningMatch && reasoningMatch.index < resultMatch.index) {
    const reasoningStart = reasoningMatch.index + reasoningMatch[0].length
    reasoning = text.slice(reasoningStart, resultMatch.index).trim()
  } else {
    reasoning = text.slice(0, resultMatch.index).trim()
  }

  return { reasoning, result }
}
