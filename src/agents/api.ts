import Anthropic from '@anthropic-ai/sdk'
import type { JsonSchema } from './schemas'

/**
 * Unico punto di contatto con l'API Anthropic.
 *
 * Usa l'SDK ufficiale con `dangerouslyAllowBrowser`: è l'SDK stesso a mettere
 * gli header richiesti (x-api-key, anthropic-version, content-type e
 * anthropic-dangerous-direct-browser-access), e in cambio otteniamo le classi
 * d'errore tipizzate invece di confrontare stringhe.
 */

export type ModelId = string

/** Valori predefiniti, modificabili dal pannello impostazioni. */
export const MODELLI_PREDEFINITI = {
  lettore: 'claude-sonnet-5',
  ricercatore: 'claude-sonnet-5',
  selettore: 'claude-sonnet-5',
  scrittore: 'claude-opus-5-5',
  controllore: 'claude-sonnet-5',
  chat: 'claude-sonnet-5',
} as const

export type ModelSlot = keyof typeof MODELLI_PREDEFINITI

export const MODELLI_DISPONIBILI: { id: string; nome: string; nota: string }[] = [
  { id: 'claude-opus-5-5', nome: 'Claude Opus 5.5', nota: 'La più alta qualità di scrittura' },
  { id: 'claude-opus-5', nome: 'Claude Opus 5', nota: 'Molto capace, leggermente più caro' },
  { id: 'claude-sonnet-5', nome: 'Claude Sonnet 5', nota: 'Equilibrato: veloce e conveniente' },
  { id: 'claude-haiku-4-5', nome: 'Claude Haiku 4.5', nota: 'Il più rapido ed economico' },
]

/**
 * Versione del tool di ricerca web.
 * La documentazione elenca tre varianti: web_search_20250305 (base),
 * web_search_20260209 (filtro dinamico) e web_search_20260318 (controllo
 * dell'inclusione in risposta). Usiamo la più recente con
 * `allowed_callers: ['direct']`: senza filtro dinamico ogni risultato arriva
 * come blocco web_search_tool_result, che è esattamente ciò su cui si basa la
 * verifica deterministica degli URL.
 */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20260318',
  name: 'web_search',
  max_uses: 8,
  allowed_callers: ['direct'],
} as const

export type ErrorKind =
  | 'chiave_mancante'
  | 'chiave_non_valida'
  | 'richiesta_non_valida'
  | 'modello_non_trovato'
  | 'ricerca_web_disabilitata'
  | 'contesto_troppo_lungo'
  | 'limite_richieste'
  | 'sovraccarico'
  | 'errore_server'
  | 'rete'
  | 'sconosciuto'

export class ApiError extends Error {
  readonly kind: ErrorKind
  readonly status: number | null
  readonly ritentabile: boolean
  /** Millisecondi suggeriti dall'header retry-after, quando presente. */
  readonly attesaMs: number | null

  constructor(
    kind: ErrorKind,
    message: string,
    status: number | null = null,
    ritentabile = false,
    attesaMs: number | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.ritentabile = ritentabile
    this.attesaMs = attesaMs
  }
}

function leggiRetryAfter(err: unknown): number | null {
  const headers = (err as { headers?: Headers | Record<string, string> }).headers
  if (!headers) return null
  const valore =
    typeof (headers as Headers).get === 'function'
      ? (headers as Headers).get('retry-after')
      : (headers as Record<string, string>)['retry-after']
  if (!valore) return null
  const secondi = Number(valore)
  return Number.isFinite(secondi) ? Math.min(secondi * 1000, 60_000) : null
}

/** Traduce l'errore dell'SDK in un messaggio italiano e in una decisione su "ritentare o no". */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err

  if (err instanceof Anthropic.AuthenticationError) {
    return new ApiError(
      'chiave_non_valida',
      'Chiave API non valida o revocata (401). Controlla di aver incollato la chiave giusta nel pannello impostazioni.',
      401,
      false,
    )
  }

  if (err instanceof Anthropic.BadRequestError) {
    const testo = (err.message ?? '').toLowerCase()
    if (testo.includes('web search') && (testo.includes('not enabled') || testo.includes('disabled'))) {
      return new ApiError(
        'ricerca_web_disabilitata',
        "La ricerca web è disattivata per la tua organizzazione. Un amministratore la riattiva dalla Console Anthropic, in Settings → Privacy. È attiva per impostazione predefinita: se vedi questo messaggio, qualcuno l'ha disattivata.",
        400,
        false,
      )
    }
    if (testo.includes('prompt is too long') || testo.includes('context') || testo.includes('exceed')) {
      return new ApiError(
        'contesto_troppo_lungo',
        'Il materiale supera la finestra di contesto del modello. Riduci i PDF caricati (meno pagine o meno file) e riavvia: preferisco fermarmi piuttosto che tagliare il testo di nascosto.',
        400,
        false,
      )
    }
    if (testo.includes('model')) {
      return new ApiError(
        'modello_non_trovato',
        `Il modello richiesto non è disponibile per questa chiave. Scegline un altro nel pannello impostazioni. Dettaglio: ${err.message}`,
        400,
        false,
      )
    }
    return new ApiError('richiesta_non_valida', `Richiesta rifiutata dall'API (400). ${err.message}`, 400, false)
  }

  if (err instanceof Anthropic.NotFoundError) {
    return new ApiError(
      'modello_non_trovato',
      `Modello o endpoint non trovato (404). Controlla l'ID del modello nel pannello impostazioni. Dettaglio: ${err.message}`,
      404,
      false,
    )
  }

  if (err instanceof Anthropic.RateLimitError) {
    return new ApiError(
      'limite_richieste',
      'Limite di richieste raggiunto (429). Attendo il tempo indicato dal server e riprovo.',
      429,
      true,
      leggiRetryAfter(err),
    )
  }

  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? null
    if (status === 529) {
      return new ApiError('sovraccarico', "L'API è temporaneamente sovraccarica (529). Riprovo fra poco.", 529, true)
    }
    if (status !== null && status >= 500) {
      return new ApiError('errore_server', `Errore del server Anthropic (${status}). Riprovo fra poco.`, status, true)
    }
    if (status === null) {
      return new ApiError(
        'rete',
        'Impossibile raggiungere api.anthropic.com. Controlla la connessione, un proxy o un blocco del browser.',
        null,
        true,
      )
    }
    return new ApiError('sconosciuto', `Errore imprevisto dall'API (${status}). ${err.message}`, status, false)
  }

  if (err instanceof Error) {
    if (err.name === 'AbortError') throw err
    return new ApiError('sconosciuto', `Errore inatteso: ${err.message}`)
  }
  return new ApiError('sconosciuto', 'Errore inatteso durante la chiamata API.')
}

export function creaClient(apiKey: string): Anthropic {
  const chiave = apiKey.trim()
  if (!chiave) {
    throw new ApiError(
      'chiave_mancante',
      'Manca la chiave API Anthropic: incollala nel pannello impostazioni.',
    )
  }
  return new Anthropic({
    apiKey: chiave,
    dangerouslyAllowBrowser: true,
    // I tentativi li governa il Controllore, che sa distinguere i casi.
    maxRetries: 0,
  })
}

export type Contenuto = Anthropic.ContentBlockParam
export type Messaggio = Anthropic.MessageParam

export interface ChiamataBase {
  client: Anthropic
  model: ModelId
  system: Anthropic.TextBlockParam[]
  messages: Messaggio[]
  maxTokens: number
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  signal?: AbortSignal
}

/**
 * Chiamata con output strutturato: la risposta è JSON valido e conforme allo
 * schema, dentro un blocco di testo. Niente parsing di etichette testuali.
 */
export async function chiamataStrutturata<T>(
  opts: ChiamataBase & { schema: JsonSchema },
): Promise<{ dati: T; usage: Anthropic.Usage }> {
  const risposta = await opts.client.messages.create(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
      output_config: {
        ...(opts.effort ? { effort: opts.effort } : {}),
        format: { type: 'json_schema', schema: opts.schema },
      },
    },
    { signal: opts.signal },
  )

  if (risposta.stop_reason === 'max_tokens') {
    throw new ApiError(
      'richiesta_non_valida',
      'La risposta è stata troncata dal limite di token prima di completare il JSON. Riprovo con istruzioni più sintetiche.',
      null,
      true,
    )
  }

  const testo = risposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  if (!testo) {
    throw new ApiError('sconosciuto', "L'API ha risposto senza contenuto: nessun JSON da leggere.", null, true)
  }

  try {
    return { dati: JSON.parse(testo) as T, usage: risposta.usage }
  } catch {
    throw new ApiError('sconosciuto', 'La risposta non è JSON valido nonostante lo schema richiesto.', null, true)
  }
}

/**
 * Come sopra ma in streaming: serve allo Scrittore, che produce capitoli lunghi
 * e senza streaming rischierebbe il timeout HTTP.
 */
export async function chiamataStrutturataStream<T>(
  opts: ChiamataBase & { schema: JsonSchema },
): Promise<{ dati: T; usage: Anthropic.Usage }> {
  const stream = opts.client.messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
      output_config: {
        ...(opts.effort ? { effort: opts.effort } : {}),
        format: { type: 'json_schema', schema: opts.schema },
      },
    },
    { signal: opts.signal },
  )

  const risposta = await stream.finalMessage()
  const testo = risposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  if (risposta.stop_reason === 'max_tokens') {
    throw new ApiError(
      'richiesta_non_valida',
      'Il capitolo è stato troncato dal limite di token. Riprovo chiedendo un testo più compatto.',
      null,
      true,
    )
  }
  if (!testo) {
    throw new ApiError('sconosciuto', "L'API ha risposto senza contenuto.", null, true)
  }

  try {
    return { dati: JSON.parse(testo) as T, usage: risposta.usage }
  } catch {
    throw new ApiError('sconosciuto', 'La risposta non è JSON valido nonostante lo schema richiesto.', null, true)
  }
}

export interface RisultatoStrumenti {
  /** Tutti i blocchi prodotti, comprese le continuazioni dopo pause_turn. */
  blocchi: Anthropic.ContentBlock[]
  /** Input del tool di consegna, se il modello lo ha chiamato. */
  consegna: unknown | null
  messaggi: Messaggio[]
  usage: Anthropic.Usage
}

const MAX_CONTINUAZIONI = 6

/**
 * Chiamata con strumenti server (ricerca web) più un tool di consegna.
 *
 * Gestisce `stop_reason: "pause_turn"`, che l'API restituisce quando un turno di
 * ricerca è lungo: in quel caso il messaggio dell'assistente va rispedito
 * invariato — compresi gli `encrypted_content` dei risultati, che l'API
 * decifra per ricostruire il contesto.
 */
export async function chiamataConStrumenti(
  opts: ChiamataBase & {
    tools: unknown[]
    toolChoice?: Anthropic.ToolChoice
    nomeToolConsegna: string
  },
): Promise<RisultatoStrumenti> {
  const messaggi: Messaggio[] = [...opts.messages]
  const blocchi: Anthropic.ContentBlock[] = []
  let consegna: unknown | null = null
  let usage: Anthropic.Usage | null = null

  for (let giro = 0; giro < MAX_CONTINUAZIONI; giro++) {
    const risposta = await opts.client.messages.create(
      {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: messaggi,
        tools: opts.tools as Anthropic.ToolUnion[],
        ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
        ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
      },
      { signal: opts.signal },
    )

    blocchi.push(...risposta.content)
    usage = risposta.usage

    for (const blocco of risposta.content) {
      if (blocco.type === 'tool_use' && blocco.name === opts.nomeToolConsegna) {
        consegna = blocco.input
      }
    }

    if (risposta.stop_reason === 'pause_turn') {
      // Turno lungo messo in pausa: si prosegue rimandando il messaggio così com'è.
      messaggi.push({ role: 'assistant', content: risposta.content })
      continue
    }

    messaggi.push({ role: 'assistant', content: risposta.content })
    return { blocchi, consegna, messaggi, usage }
  }

  throw new ApiError(
    'sconosciuto',
    'La ricerca web non si è conclusa dopo diverse continuazioni. Riprovo con una richiesta più mirata.',
    null,
    true,
  )
}

/** Chat in streaming: invoca `onTesto` a ogni frammento ricevuto. */
export async function chiamataChatStream(
  opts: ChiamataBase & { onTesto: (frammento: string) => void },
): Promise<string> {
  const stream = opts.client.messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
    },
    { signal: opts.signal },
  )

  stream.on('text', (frammento) => opts.onTesto(frammento))
  const risposta = await stream.finalMessage()

  return risposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}
