export const MODEL = 'claude-sonnet-4-6'
export const MAX_TOKENS = 2000
/** Lo Scrittore deve produrre tre bozze complete: gli serve molto più spazio. */
export const WRITER_MAX_TOKENS = 8000
const ENDPOINT = 'https://api.anthropic.com/v1/messages'

export interface Citation {
  type: string
  url?: string
  title?: string
  cited_text?: string
}

export interface TextBlock {
  type: 'text'
  text: string
  citations?: Citation[]
}

export interface ServerToolUseBlock {
  type: 'server_tool_use'
  name: string
  input?: { query?: string }
}

export interface WebSearchResultItem {
  type: 'web_search_result'
  url: string
  title: string
  page_age?: string | null
}

export interface WebSearchToolResultError {
  type: 'web_search_tool_result_error'
  error_code: string
}

export interface WebSearchToolResultBlock {
  type: 'web_search_tool_result'
  content: WebSearchResultItem[] | WebSearchToolResultError
}

export type ContentBlock =
  | TextBlock
  | ServerToolUseBlock
  | WebSearchToolResultBlock
  | { type: string }

export type UserContent =
  | { type: 'text'; text: string }
  | {
      type: 'document'
      source: { type: 'base64'; media_type: 'application/pdf'; data: string }
    }

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | UserContent[]
}

export interface WebSearchTool {
  type: 'web_search_20250305'
  name: 'web_search'
  max_uses?: number
}

export interface AnthropicResponse {
  text: string
  blocks: ContentBlock[]
  stopReason: string | null
}

/** Errore già tradotto in un messaggio leggibile, con l'informazione se ha senso ritentare. */
export class AnthropicError extends Error {
  readonly status: number | null
  readonly retryable: boolean

  constructor(message: string, status: number | null = null, retryable = false) {
    super(message)
    this.name = 'AnthropicError'
    this.status = status
    this.retryable = retryable
  }
}

interface ApiErrorBody {
  error?: { type?: string; message?: string }
}

interface ApiSuccessBody {
  content?: ContentBlock[]
  stop_reason?: string | null
}

/** Numero di richieste realmente in volo: serve al Controllore per capire se l'app è bloccata. */
let inFlight = 0
export function requestsInFlight(): number {
  return inFlight
}

function describeHttpError(status: number, body: ApiErrorBody | null): string {
  const detail = body?.error?.message?.trim()
  const suffix = detail ? ` Dettaglio dall'API: ${detail}` : ''

  switch (status) {
    case 400:
      return `Richiesta rifiutata dall'API (400). Controlla il materiale inviato e il nome del modello.${suffix}`
    case 401:
      return `Chiave API non valida o non autorizzata (401). Controlla di aver incollato la chiave giusta.${suffix}`
    case 403:
      return `Accesso negato (403). La chiave non ha i permessi per usare questo modello o il tool di ricerca web.${suffix}`
    case 404:
      return `Modello o endpoint non trovato (404). Il modello "${MODEL}" potrebbe non essere disponibile per questa chiave.${suffix}`
    case 413:
      return `Richiesta troppo grande (413). Il materiale del corso supera i limiti: carica meno pagine o file più leggeri.${suffix}`
    case 429:
      return `Limite di richieste raggiunto (429). Attendo e ritento.${suffix}`
    case 529:
      return `API temporaneamente sovraccarica (529). Attendo e ritento.${suffix}`
    default:
      if (status >= 500) return `Errore del server Anthropic (${status}). Attendo e ritento.${suffix}`
      return `Errore imprevisto dall'API (${status}).${suffix}`
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 529 || status >= 500
}

export interface CallOptions {
  apiKey: string
  system: string
  messages: ApiMessage[]
  maxTokens?: number
  tools?: WebSearchTool[]
  signal?: AbortSignal
}

/**
 * Chiama l'API Messages di Anthropic direttamente dal browser.
 * L'header anthropic-dangerous-direct-browser-access è obbligatorio: senza,
 * l'API rifiuta le richieste che arrivano da un contesto browser.
 */
export async function callAnthropic({
  apiKey,
  system,
  messages,
  maxTokens = MAX_TOKENS,
  tools,
  signal,
}: CallOptions): Promise<AnthropicResponse> {
  const key = apiKey.trim()
  if (!key) {
    throw new AnthropicError('Manca la chiave API Anthropic: incollala nel pannello dedicato.')
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  }
  if (tools && tools.length > 0) body.tools = tools

  inFlight += 1
  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal,
      body: JSON.stringify(body),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new AnthropicError(
      "Impossibile raggiungere api.anthropic.com. Controlla la connessione, un eventuale proxy/firewall o un'estensione del browser che blocca la richiesta.",
      null,
      true,
    )
  } finally {
    inFlight -= 1
  }

  if (!response.ok) {
    let errorBody: ApiErrorBody | null = null
    try {
      errorBody = (await response.json()) as ApiErrorBody
    } catch {
      errorBody = null
    }
    throw new AnthropicError(
      describeHttpError(response.status, errorBody),
      response.status,
      isRetryableStatus(response.status),
    )
  }

  let data: ApiSuccessBody
  try {
    data = (await response.json()) as ApiSuccessBody
  } catch {
    throw new AnthropicError("La risposta dell'API non è un JSON valido.", null, true)
  }

  const blocks = data.content ?? []
  const text = blocks
    .filter((b): b is TextBlock => b.type === 'text' && typeof (b as TextBlock).text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()

  return { text, blocks, stopReason: data.stop_reason ?? null }
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

  if (!resultMatch) return { reasoning: '', result: text }

  const result = text.slice(resultMatch.index + resultMatch[0].length).trim()
  const reasoning =
    reasoningMatch && reasoningMatch.index < resultMatch.index
      ? text.slice(reasoningMatch.index + reasoningMatch[0].length, resultMatch.index).trim()
      : text.slice(0, resultMatch.index).trim()

  return { reasoning, result }
}

/** Spezza il ragionamento in passaggi discreti per la nuvoletta 3D. */
export function splitSteps(reasoning: string): string[] {
  const text = reasoning.trim()
  if (!text) return []

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const bullets = lines.filter((l) => /^([-*•–]|\d+[.)])\s+/.test(l))
  if (bullets.length >= 2) {
    return bullets.map((l) => l.replace(/^([-*•–]|\d+[.)])\s+/, '').trim()).slice(0, 9)
  }
  if (lines.length >= 2) return lines.slice(0, 9)

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return (sentences.length > 0 ? sentences : [text]).slice(0, 9)
}
