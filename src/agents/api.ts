import Anthropic from '@anthropic-ai/sdk'
import type { Chi } from '../types'
import { formattaDollari, normalizzaUso, sommaUsi, type Stima, type UsoNormalizzato } from './costs'
import { chiediAClaudeAi } from './ponte'
import type { JsonSchema } from './schemas'

/**
 * Unico punto di contatto con l'API Anthropic.
 *
 * Usa l'SDK ufficiale con `dangerouslyAllowBrowser`: è l'SDK a mettere gli
 * header richiesti (x-api-key, anthropic-version, content-type e
 * anthropic-dangerous-direct-browser-access), e in cambio si ottengono le
 * classi d'errore tipizzate invece di confrontare stringhe.
 */

export const MODELLI_DISPONIBILI: { id: string; nome: string; nota: string }[] = [
  { id: 'claude-opus-5-5', nome: 'Claude Opus 5.5', nota: 'Scrive meglio di tutti' },
  { id: 'claude-opus-5', nome: 'Claude Opus 5', nota: 'Molto bravo, ma costa di più' },
  { id: 'claude-sonnet-5-5', nome: 'Claude Sonnet 5.5', nota: 'Il Sonnet più nuovo: veloce e costa poco' },
  { id: 'claude-sonnet-5', nome: 'Claude Sonnet 5', nota: 'La versione di prima, stesso prezzo' },
  { id: 'claude-haiku-4-5', nome: 'Claude Haiku 4.5', nota: 'Il più veloce e il più economico' },
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
  | 'budget_superato'
  | 'solo_api'
  | 'credito_esaurito'
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
      'La chiave API non funziona: forse è sbagliata o è stata cancellata. Controlla di aver incollato quella giusta nelle impostazioni.',
      401,
      false,
    )
  }

  if (err instanceof Anthropic.BadRequestError) {
    const testo = (err.message ?? '').toLowerCase()
    if (testo.includes('credit balance')) {
      return new ApiError(
        'credito_esaurito',
        "La chiave va, ma il credito su Anthropic è finito. Puoi ricaricarlo dalla console di Anthropic, oppure togliere la chiave nelle impostazioni: così l'app torna gratis con Claude.ai.",
        400,
        false,
      )
    }
    if ((testo.includes('web search') || testo.includes('web fetch')) && (testo.includes('not enabled') || testo.includes('disabled'))) {
      return new ApiError(
        'ricerca_web_disabilitata',
        "La ricerca sul web è spenta per il tuo account. Chi gestisce l'account può riaccenderla dalla Console Anthropic, in Settings → Privacy. Di solito è accesa: se vedi questo messaggio, qualcuno l'ha spenta.",
        400,
        false,
      )
    }
    if (testo.includes('prompt is too long') || testo.includes('context') || testo.includes('exceed')) {
      return new ApiError(
        'contesto_troppo_lungo',
        'C\'è troppo materiale da leggere in una volta sola. Scegli la lettura "sintetica" o carica meno PDF scansionati: preferisco fermarmi piuttosto che tagliare il testo senza dirtelo.',
        400,
        false,
      )
    }
    if (testo.includes('model')) {
      return new ApiError(
        'modello_non_trovato',
        `Con la tua chiave questo modello non si può usare. Scegline un altro nelle impostazioni. Dettaglio: ${err.message}`,
        400,
        false,
      )
    }
    return new ApiError('richiesta_non_valida', `Anthropic ha rifiutato la richiesta. ${err.message}`, 400, false)
  }

  if (err instanceof Anthropic.NotFoundError) {
    return new ApiError(
      'modello_non_trovato',
      `Non trovo il modello scelto. Controllalo nelle impostazioni. Dettaglio: ${err.message}`,
      404,
      false,
    )
  }

  if (err instanceof Anthropic.RateLimitError) {
    return new ApiError(
      'limite_richieste',
      'Troppe richieste in poco tempo. Aspetto un attimo e riprovo.',
      429,
      true,
      leggiRetryAfter(err),
    )
  }

  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? null
    if (status === 529) {
      return new ApiError('sovraccarico', 'Anthropic in questo momento è sovraccarico. Riprovo fra poco.', 529, true)
    }
    if (status !== null && status >= 500) {
      return new ApiError('errore_server', `Anthropic ha un problema sui suoi server (errore ${status}). Riprovo fra poco.`, status, true)
    }
    if (status === null) {
      return new ApiError(
        'rete',
        'Non riesco a collegarmi ad Anthropic. Controlla internet, oppure se il browser o la rete lo stanno bloccando.',
        null,
        true,
      )
    }
    return new ApiError('sconosciuto', `Qualcosa è andato storto (errore ${status}). ${err.message}`, status, false)
  }

  if (err instanceof Error) {
    if (err.name === 'AbortError') throw err
    return new ApiError('sconosciuto', `Qualcosa è andato storto: ${err.message}`)
  }
  return new ApiError('sconosciuto', 'Qualcosa è andato storto mentre parlavo con Claude.')
}

// ---------------------------------------------------------------------------
// Modalità gratuita
// ---------------------------------------------------------------------------

let gratuita: () => boolean = () => false

/** Lo store indica qui se si lavora senza chiave, cioè tramite Claude.ai. */
export function impostaModalitaGratuita(fn: () => boolean) {
  gratuita = fn
}

export function modalitaGratuita(): boolean {
  return gratuita()
}

/** Il costo da mostrare prima di un comando: in modalità gratuita non c'è. */
export function costoStimato(stima: Pick<Stima, 'minimo' | 'massimo'>, volte = 1): string {
  if (gratuita()) return 'Gratis con Claude.ai (copia e incolla)'
  return `Costa circa ${formattaDollari(stima.minimo * volte)} – ${formattaDollari(stima.massimo * volte)}`
}

export function creaClient(apiKey: string): Anthropic {
  // Senza chiave le chiamate passano da Claude.ai: il client non serve.
  if (gratuita()) return {} as Anthropic
  const chiave = apiKey.trim()
  if (!chiave) {
    throw new ApiError('chiave_mancante', 'Manca la chiave API: incollala nelle impostazioni.')
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

type Registratore = (chi: Chi, azione: string, modello: string, uso: UsoNormalizzato) => void
let registratore: Registratore | null = null

/** Lo store si registra qui, così questo modulo resta indipendente dall'interfaccia. */
export function impostaRegistratoreUso(fn: Registratore) {
  registratore = fn
}

function registra(chi: Chi | undefined, azione: string | undefined, modello: string, uso: UsoNormalizzato) {
  if (chi && registratore) registratore(chi, azione ?? '', modello, uso)
}

// ---------------------------------------------------------------------------
// Budget mensile
// ---------------------------------------------------------------------------

type ControlloBudget = () => string | null
let controlloBudget: ControlloBudget | null = null

/** Lo store indica qui se il budget del mese è esaurito (restituisce il messaggio da mostrare). */
export function impostaControlloBudget(fn: ControlloBudget) {
  controlloBudget = fn
}

/** Ogni chiamata passa da qui prima di partire: nessun comando può aggirare il budget. */
function verificaBudget() {
  if (gratuita()) return
  const messaggio = controlloBudget?.()
  if (messaggio) throw new ApiError('budget_superato', messaggio, null, false)
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
  /** Azione da registrare nel consuntivo, per esempio "quadro teorico". */
  azione?: string
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
      'La risposta era troppo lunga e si è interrotta a metà. Riprovo chiedendo un testo più corto.',
      null,
      true,
    )
  }
  if (risposta.stop_reason === 'refusal') {
    throw new ApiError(
      'richiesta_non_valida',
      'Claude non ha voluto fare questo lavoro. Prova a chiederlo in un altro modo o scegli un altro modello nelle impostazioni.',
      null,
      false,
    )
  }
  const testo = testoDi(risposta)
  if (!testo) throw new ApiError('sconosciuto', 'Claude ha mandato una risposta vuota.', null, true)
  try {
    return JSON.parse(testo) as T
  } catch {
    throw new ApiError('sconosciuto', 'La risposta di Claude non è nel formato giusto.', null, true)
  }
}

/** Output strutturato: la risposta è JSON conforme allo schema, senza parsing di etichette. */
/** In modalità gratuita la risposta arriva da Claude.ai, già controllata dalla finestra del ponte. */
async function viaClaudeAi<T>(opts: ChiamataBase & { schema: JsonSchema }): Promise<T> {
  const testo = await chiediAClaudeAi({ chi: opts.chi, azione: opts.azione, system: opts.system, messages: opts.messages, schema: opts.schema as Record<string, unknown>, signal: opts.signal })
  return JSON.parse(testo) as T
}

export async function chiamataStrutturata<T>(opts: ChiamataBase & { schema: JsonSchema }): Promise<T> {
  if (gratuita()) return viaClaudeAi<T>(opts)
  verificaBudget()
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
  registra(opts.chi, opts.azione, opts.model, normalizzaUso(risposta.usage))
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
  if (gratuita()) {
    // Le chiamate gemelle non hanno una cache da sfruttare: partono subito, una dopo l'altra.
    opts.onAvvio?.()
    return viaClaudeAi<T>(opts)
  }
  verificaBudget()
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
    registra(opts.chi, opts.azione, opts.model, normalizzaUso(risposta.usage))
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
  if (gratuita()) {
    throw new ApiError(
      'solo_api',
      "Questa funzione cerca e legge pagine sul web, e con Claude.ai l'app non può controllare cosa trova. Per questo nella modalità gratis non c'è: serve la chiave API.",
    )
  }
  const messaggi: Messaggio[] = [...opts.messages]
  const blocchi: Anthropic.ContentBlock[] = []
  let consegna: unknown | null = null
  let uso = normalizzaUso(null)

  try {
    for (let giro = 0; giro < MAX_CONTINUAZIONI; giro++) {
      verificaBudget()
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
    registra(opts.chi, opts.azione, opts.model, uso)
  }

  throw new ApiError(
    'sconosciuto',
    'La ricerca andava avanti senza finire mai. Riprovo con una richiesta più precisa.',
    null,
    true,
  )
}

/** Chat in streaming: invoca `onTesto` a ogni frammento ricevuto. */
export async function chiamataChatStream(opts: ChiamataBase & { onTesto: (frammento: string) => void }): Promise<string> {
  if (gratuita()) {
    const testo = (await chiediAClaudeAi({ chi: opts.chi, azione: opts.azione, system: opts.system, messages: opts.messages, signal: opts.signal })).trim()
    opts.onTesto(testo)
    return testo
  }
  verificaBudget()
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
  registra(opts.chi, opts.azione, opts.model, normalizzaUso(risposta.usage))
  return testoDi(risposta)
}
