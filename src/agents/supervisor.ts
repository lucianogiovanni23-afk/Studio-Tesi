import { useStudioStore } from '../store'
import { AGENT_BY_KEY } from './definitions'
import {
  AnthropicError,
  callAnthropic,
  parseSections,
  requestsInFlight,
  splitSteps,
  type AnthropicResponse,
  type ApiMessage,
  type WebSearchTool,
} from './api'
import type { AgentKey, Draft, DraftReview } from '../types'

const MAX_ATTEMPTS = 3
const BACKOFF_MS = [2000, 4000, 8000]

export function logOk(agent: AgentKey | null, message: string) {
  useStudioStore.getState().addLog('ok', agent, message)
}
export function logWarn(agent: AgentKey | null, message: string) {
  useStudioStore.getState().addLog('warn', agent, message)
}
export function logRepair(agent: AgentKey | null, message: string) {
  useStudioStore.getState().addLog('repair', agent, message)
}
export function logFail(agent: AgentKey | null, message: string) {
  useStudioStore.getState().addLog('fail', agent, message)
}
export function logInfo(agent: AgentKey | null, message: string) {
  useStudioStore.getState().addLog('info', agent, message)
}

// ---------------------------------------------------------------------------
// Intercettazione di console ed errori di runtime
// ---------------------------------------------------------------------------

let hooksInstalled = false

function describeArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.name}: ${a.message}`
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
    .slice(0, 500)
}

/**
 * Il Controllore è attivo dall'inizio: registra console.error/warn e gli errori
 * di runtime della pagina, e riabilita i controlli se l'interfaccia resta bloccata.
 */
export function installSupervisorHooks(): () => void {
  if (hooksInstalled) return () => {}
  hooksInstalled = true

  const originalError = console.error
  const originalWarn = console.warn

  console.error = (...args: unknown[]) => {
    originalError.apply(console, args as never[])
    logFail('controllore', `console.error — ${describeArgs(args)}`)
    recoverIfStuck()
  }
  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args as never[])
    logWarn('controllore', `console.warn — ${describeArgs(args)}`)
  }

  const onError = (event: ErrorEvent) => {
    logFail('controllore', `Errore di runtime — ${event.message} (${event.filename ?? '?'}:${event.lineno ?? 0})`)
    recoverIfStuck()
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
    logFail('controllore', `Promise non gestita — ${message}`)
    recoverIfStuck()
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  return () => {
    console.error = originalError
    console.warn = originalWarn
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    hooksInstalled = false
  }
}

/**
 * Dopo un errore di runtime: se l'interfaccia risulta occupata ma non c'è nessuna
 * richiesta in volo, i controlli vengono riabilitati invece di restare bloccati.
 */
function recoverIfStuck() {
  const state = useStudioStore.getState()
  if (!state.running && !state.chatBusy) return
  if (requestsInFlight() > 0) return
  if (state.approvalStatus === 'pending') return

  logRepair('controllore', 'Interfaccia bloccata dopo un errore: controlli riabilitati.')
  state.unlockUi()
}

// ---------------------------------------------------------------------------
// Chiamata sorvegliata: validazione del formato + backoff sugli errori
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean
  /** Istruzione aggiuntiva, più rigida, da usare al tentativo successivo. */
  hint?: string
}

export interface GuardedCall {
  agent: AgentKey
  /** Etichetta leggibile del passo, usata nei log. */
  step: string
  apiKey: string
  system: string
  messages: ApiMessage[]
  maxTokens?: number
  tools?: WebSearchTool[]
  signal?: AbortSignal
  validate: (response: AnthropicResponse, sections: { reasoning: string; result: string }) => ValidationResult
}

export interface GuardedResult {
  response: AnthropicResponse
  reasoning: string
  result: string
  attempts: number
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * Esegue una chiamata sotto la sorveglianza del Controllore:
 * - valida il formato della risposta e ripete con istruzioni più rigide (max 3 tentativi)
 * - su errore di rete o API ritentabile attende con backoff progressivo e riprova
 */
export async function guardedCall(call: GuardedCall): Promise<GuardedResult> {
  const name = AGENT_BY_KEY[call.agent].name
  let lastError: Error | null = null
  let hint = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    useStudioStore.getState().patchAgent(call.agent, { attempts: attempt })

    const messages: ApiMessage[] = hint
      ? [
          ...call.messages,
          {
            role: 'assistant',
            content: 'Ho prodotto una risposta nel formato sbagliato.',
          },
          { role: 'user', content: hint },
        ]
      : call.messages

    try {
      if (attempt > 1) logRepair(call.agent, `${call.step}: tentativo ${attempt} di ${MAX_ATTEMPTS}.`)

      const response = await callAnthropic({
        apiKey: call.apiKey,
        system: call.system,
        messages,
        maxTokens: call.maxTokens,
        tools: call.tools,
        signal: call.signal,
      })

      if (response.stopReason === 'max_tokens') {
        logWarn(call.agent, `${call.step}: risposta troncata dal limite di token.`)
      }

      const sections = parseSections(response.text)
      const verdict = call.validate(response, sections)

      if (verdict.ok) {
        logOk(call.agent, `${call.step}: risposta valida${attempt > 1 ? ` al tentativo ${attempt}` : ''}.`)
        return { response, reasoning: sections.reasoning, result: sections.result, attempts: attempt }
      }

      lastError = new Error(verdict.hint ?? 'Formato della risposta non valido.')
      logWarn(call.agent, `${call.step}: formato non valido — ${lastError.message}`)
      hint = `La tua risposta precedente non è utilizzabile. ${verdict.hint ?? ''}\nRiscrivi TUTTA la risposta da capo rispettando alla lettera il formato richiesto (sezione RAGIONAMENTO: e sezione RISULTATO:) e lo schema a blocchi indicato nelle istruzioni di sistema. Non aggiungere commenti fuori dalle sezioni.`
    } catch (err) {
      if (isAbort(err)) throw err

      const anthropicError = err instanceof AnthropicError ? err : null
      lastError = err instanceof Error ? err : new Error(String(err))

      const retryable = anthropicError?.retryable ?? false
      if (!retryable || attempt === MAX_ATTEMPTS) {
        logFail(call.agent, `${call.step}: ${lastError.message}`)
        throw lastError
      }

      const wait = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]
      logRepair(
        call.agent,
        `${call.step}: ${lastError.message} Nuovo tentativo fra ${Math.round(wait / 1000)}s.`,
      )
      await sleep(wait, call.signal)
    }
  }

  const message = `${name}: nessuna risposta valida dopo ${MAX_ATTEMPTS} tentativi. ${lastError?.message ?? ''}`.trim()
  logFail(call.agent, message)
  throw new Error(message)
}

/** Aggiorna un agente con il ragionamento suddiviso in passaggi. */
export function applyAgentOutput(agent: AgentKey, reasoning: string, result: string) {
  useStudioStore.getState().patchAgent(agent, {
    reasoning,
    steps: splitSteps(reasoning),
    result,
    error: null,
  })
}

// ---------------------------------------------------------------------------
// Validatori di formato
// ---------------------------------------------------------------------------

export function requireSections(minResultChars: number) {
  return (_response: AnthropicResponse, sections: { reasoning: string; result: string }): ValidationResult => {
    if (!sections.result || sections.result.length < minResultChars) {
      return {
        ok: false,
        hint: `La sezione RISULTATO manca o è troppo breve (servono almeno ${minResultChars} caratteri di contenuto utile).`,
      }
    }
    if (!sections.reasoning) {
      return { ok: false, hint: 'Manca la sezione RAGIONAMENTO con i passaggi numerati.' }
    }
    return { ok: true }
  }
}

export function requireBlocks(marker: RegExp, minCount: number, hint: string) {
  return (_response: AnthropicResponse, sections: { reasoning: string; result: string }): ValidationResult => {
    const base = requireSections(40)(_response, sections)
    if (!base.ok) return base
    const matches = sections.result.match(marker)
    if (!matches || matches.length < minCount) {
      return { ok: false, hint }
    }
    return { ok: true }
  }
}

/** Il referto del Controllore deve chiudersi con la riga STATO. */
export function requireStatusLine(): (
  response: AnthropicResponse,
  sections: { reasoning: string; result: string },
) => ValidationResult {
  return (response, sections) => {
    const base = requireSections(30)(response, sections)
    if (!base.ok) return base
    if (!/STATO\s*:\s*(OK|PROBLEMA)/i.test(response.text)) {
      return { ok: false, hint: 'Manca la riga finale "STATO: OK" oppure "STATO: PROBLEMA".' }
    }
    return { ok: true }
  }
}

export function readStatus(text: string): 'OK' | 'PROBLEMA' | null {
  const match = /STATO\s*:\s*(OK|PROBLEMA)/i.exec(text)
  if (!match) return null
  return match[1].toUpperCase() === 'OK' ? 'OK' : 'PROBLEMA'
}

// ---------------------------------------------------------------------------
// Parsing delle bozze e delle valutazioni
// ---------------------------------------------------------------------------

export function parseDrafts(result: string): Draft[] {
  const parts = result.split(/\[\s*OPZIONE\s*(\d)\s*\]/gi)
  const drafts: Draft[] = []

  for (let i = 1; i < parts.length; i += 2) {
    const number = parts[i]
    const chunk = parts[i + 1] ?? ''
    const approachMatch = /^\s*APPROCCIO\s*:\s*(.*)$/im.exec(chunk)
    const textMatch = /^\s*TESTO\s*:\s*$/im.exec(chunk)

    let text: string
    if (textMatch) {
      text = chunk.slice(textMatch.index + textMatch[0].length).trim()
    } else {
      const inline = /TESTO\s*:/i.exec(chunk)
      text = inline ? chunk.slice(inline.index + inline[0].length).trim() : chunk.trim()
    }

    drafts.push({
      label: `Opzione ${number}`,
      approach: approachMatch ? approachMatch[1].trim() : 'Approccio non dichiarato',
      text,
      review: null,
    })
  }

  return drafts
}

export function parseDraftReviews(result: string): Map<number, DraftReview> {
  const reviews = new Map<number, DraftReview>()
  const parts = result.split(/\[\s*VALUTAZIONE\s+OPZIONE\s*(\d)\s*\]/gi)

  for (let i = 1; i < parts.length; i += 2) {
    const index = Number(parts[i]) - 1
    const chunk = parts[i + 1] ?? ''
    const esito = /^\s*ESITO\s*:\s*(OK|PROBLEMA)/im.exec(chunk)
    const note = /^\s*NOTE\s*:\s*([\s\S]*?)(?:\n\s*\[|\n\s*STATO\s*:|$)/im.exec(chunk)
    if (index < 0) continue
    reviews.set(index, {
      ok: esito ? esito[1].toUpperCase() === 'OK' : true,
      note: note ? note[1].trim() : '',
    })
  }

  return reviews
}
