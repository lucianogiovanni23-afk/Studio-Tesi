import Anthropic from '@anthropic-ai/sdk'
import type { AgentKey } from '../types'
import { normalizzaUso, sommaUsi, type UsoNormalizzato } from './costs'
import type { JsonSchema } from './schemas'

/**
 * Unico punto di contatto con l'API Anthropic.
 *
 * Usa l'SDK ufficiale con `dangerouslyAllowBrowser`: è l'SDK a mettere gli
 * header richiesti (x-api-key, anthropic-version, content-type e
 * anthropic-dangerous-direct-browser-access), e in cambio si ottengono le
 * classi d'errore tipizzate invece di confrontare stringhe.
 */

/** Valori predefiniti, modificabili dal pannello impostazioni. */
export const MODELLI_PREDEFINITI = {
  lettore: 'claude-sonnet-5',
  ricercatore: 'claude-sonnet-5',
  // La selezione è un compito semplice: basta il modello più economico.
  selettore: 'claude-haiku-4-5',
  scrittore: 'claude-opus-5-5',
  controllore: 'claude-sonnet-5',
  chat: 'claude-sonnet-5',
} as const

export type ModelSlot = keyof typeof MODELLI_PREDEFINITI

export const MODELLI_DISPONIBILI: { id: string; nome: string; nota: string }[] = [
  { id: 'claude-opus-5-5', nome: 'Claude Opus 5.5', nota: 'La più alta qualità di scrittura' },
  { id: 'claude-opus-5', nome: 'Claude Opus 5', nota: 'Molto capace, più caro' },
  { id: 'claude-sonnet-5', nome: 'Claude Sonnet 5', nota: 'Equilibrato: veloce e conveniente' },
  { id: 'claude-haiku-4-5', nome: 'Claude Haiku 4.5', nota: 'Il più rapido ed economico' },
]

/** Haiku 4.5 non accetta il parametro effort: su quel modello va omesso. */
export function supportaEffort(modello: string): boolean {
  return !modello.startsWith('claude-haiku')
}

/**
 * Ricerca web e lettura delle pagine, alle versioni più recenti documentate.
 * Con `allowed_callers: ['direct']` si rinuncia al filtro dinamico: così ogni
 * risultato e ogni pagina letta tornano nella risposta, ed è su quei testi che
 * il codice verifica URL ed estratti citati.
 */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20260318',
  name: 'web_search',
  max_uses: 8,
  allowed_callers: ['direct'],
} as const

export const WEB_FETCH_TOOL = {
  type: 'web_fetch_20260318',
  name: 'web_fetch',
  max_uses: 6,
  // Limita il costo di pagine molto lunghe (non si applica ai PDF).
  max_content_tokens: 12_000,
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
    if ((testo.includes('web search') || testo.includes('web fetch')) && (testo.includes('not enabled') || testo.includes('disabled'))) {
      return new ApiError(
        'ricerca_web_disabilitata',
        "La ricerca o la lettura web è disattivata per la tua organizzazione. Un amministratore la riattiva dalla Console Anthropic, in Settings → Privacy. È attiva per impostazione predefinita: se vedi questo messaggio, qualcuno l'ha disattivata.",
        400,
        false,
      )
    }
    if (testo.includes('prompt is too long') || testo.includes('context') || testo.includes('exceed')) {
      return new ApiError(
        'contesto_troppo_lungo',
        'Il materiale supera la finestra di contesto del modello. Scegli la profondità di lettura "sintetica" o carica meno PDF scansionati: preferisco fermarmi piuttosto che tagliare il testo di nascosto.',
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
    throw new ApiError('chiave_mancante', 'Manca la chiave API Anthropic: incollala nel pannello impostazioni.')
  }
  return new Anthropic({
    apiKey: chiave,
    dangerouslyAllowBrowser: true,
    // I tentativi li governa il Controllore, che sa distinguere i casi.
    maxRetries: 0,
  })
}

// ---------------------------------------------------------------------------
// Registrazione dei consumi
// ---------------------------------------------------------------------------

export type Chi = AgentKey | 'chat'
type Registratore = (chi: Chi, modello: string, uso: UsoNormalizzato) => void
let registratore: Registratore | null = null

/** Lo store si registra qui, così questo modulo resta indipendente dall'interfaccia. */
export function impostaRegistratoreUso(fn: Registratore) {
  registratore = fn
}

function registra(chi: Chi | undefined, modello: string, uso: UsoNormalizzato) {
  if (chi && registratore) registratore(chi, modello, uso)
}

// ---------------------------------------------------------------------------
// Chiamate
// ---------------------------------------------------------------------------

export type Messaggio = Anthropic.MessageParam
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ChiamataBase {
  client: Anthropic
  model: string
  system: Anthropic.TextBlockParam[]
  messages: Messaggio[]
  maxTokens: number
  effort?: Effort
  signal?: AbortSignal
  /** A chi addebitare i token nel riepilogo dei costi. */
  chi?: Chi
}

function outputConfig(model: string, effort: Effort | undefined, schema?: JsonSchema) {
  const config: Anthropic.OutputConfig = {}
  if (effort && supportaEffort(model)) config.effort = effort
  if (schema) config.format = { type: 'json_schema', schema }
  return Object.keys(config).length > 0 ? { output_config: config } : {}
}

function testoDi(risposta: Anthropic.Message): string {
  return risposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

function leggiJson<T>(risposta: Anthropic.Message): T {
  if (risposta.stop_reason === 'max_tokens') {
    throw new ApiError(
      'richiesta_non_valida',
      'La risposta è stata troncata dal limite di token prima di completare il JSON. Riprovo chiedendo un testo più compatto.',
      null,
      true,
    )
  }
  if (risposta.stop_reason === 'refusal') {
    throw new ApiError('richiesta_non_valida', 'Il modello ha rifiutato la richiesta.', null, false)
  }
  const testo = testoDi(risposta)
  if (!testo) throw new ApiError('sconosciuto', "L'API ha risposto senza contenuto: nessun JSON da leggere.", null, true)
  try {
    return JSON.parse(testo) as T
  } catch {
    throw new ApiError('sconosciuto', 'La risposta non è JSON valido nonostante lo schema richiesto.', null, true)
  }
}

/** Output strutturato: la risposta è JSON conforme allo schema, senza parsing di etichette. */
export async function chiamataStrutturata<T>(opts: ChiamataBase & { schema: JsonSchema }): Promise<T> {
  const risposta = await opts.client.messages.create(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
      ...outputConfig(opts.model, opts.effort, opts.schema),
    },
    { signal: opts.signal },
  )
  registra(opts.chi, opts.model, normalizzaUso(risposta.usage))
  return leggiJson<T>(risposta)
}

/**
 * Come sopra ma in streaming: serve allo Scrittore, che produce testi lunghi e
 * senza streaming rischierebbe il timeout HTTP. `onAvvio` scatta quando il
 * modello ha iniziato a generare, cioè quando il prefisso è già in cache: è il
 * momento giusto per far partire le chiamate gemelle che lo rileggono.
 */
export async function chiamataStrutturataStream<T>(
  opts: ChiamataBase & { schema: JsonSchema; onAvvio?: () => void },
): Promise<T> {
  const stream = opts.client.messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
      ...outputConfig(opts.model, opts.effort, opts.schema),
    },
    { signal: opts.signal },
  )

  let avviato = false
  const avvia = () => {
    if (avviato) return
    avviato = true
    opts.onAvvio?.()
  }
  stream.on('streamEvent', (evento) => {
    if (evento.type === 'content_block_start') avvia()
  })

  try {
    const risposta = await stream.finalMessage()
    registra(opts.chi, opts.model, normalizzaUso(risposta.usage))
    return leggiJson<T>(risposta)
  } finally {
    // Anche in caso d'errore le chiamate in attesa non devono restare bloccate.
    avvia()
  }
}

export interface RisultatoStrumenti {
  /** Tutti i blocchi prodotti, comprese le continuazioni dopo pause_turn. */
  blocchi: Anthropic.ContentBlock[]
  /** Input del tool di consegna, se il modello lo ha chiamato. */
  consegna: unknown | null
  messaggi: Messaggio[]
}

const MAX_CONTINUAZIONI = 8

/**
 * Chiamata con strumenti server (ricerca e lettura web) più un tool di consegna.
 * Gestisce `stop_reason: "pause_turn"`: il messaggio dell'assistente va
 * rispedito invariato, compresi gli `encrypted_content` dei risultati.
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
  let uso = normalizzaUso(null)

  try {
    for (let giro = 0; giro < MAX_CONTINUAZIONI; giro++) {
      const risposta = await opts.client.messages.create(
        {
          model: opts.model,
          max_tokens: opts.maxTokens,
          system: opts.system,
          messages: messaggi,
          tools: opts.tools as Anthropic.ToolUnion[],
          ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
          ...outputConfig(opts.model, opts.effort),
        },
        { signal: opts.signal },
      )

      uso = sommaUsi(uso, normalizzaUso(risposta.usage))
      blocchi.push(...risposta.content)

      for (const blocco of risposta.content) {
        if (blocco.type === 'tool_use' && blocco.name === opts.nomeToolConsegna) consegna = blocco.input
      }

      messaggi.push({ role: 'assistant', content: risposta.content })
      if (risposta.stop_reason === 'pause_turn') continue
      return { blocchi, consegna, messaggi }
    }
  } finally {
    registra(opts.chi, opts.model, uso)
  }

  throw new ApiError(
    'sconosciuto',
    'La ricerca non si è conclusa dopo diverse continuazioni. Riprovo con una richiesta più mirata.',
    null,
    true,
  )
}

/** Chat in streaming: invoca `onTesto` a ogni frammento ricevuto. */
export async function chiamataChatStream(opts: ChiamataBase & { onTesto: (frammento: string) => void }): Promise<string> {
  const stream = opts.client.messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
      ...outputConfig(opts.model, opts.effort),
    },
    { signal: opts.signal },
  )

  stream.on('text', (frammento) => opts.onTesto(frammento))
  const risposta = await stream.finalMessage()
  registra(opts.chi, opts.model, normalizzaUso(risposta.usage))
  return testoDi(risposta)
}
