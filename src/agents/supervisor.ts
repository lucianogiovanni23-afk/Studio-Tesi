import { useStudio, type LogKind } from '../store'
import { ApiError, toApiError } from './api'
import type { AgentKey } from '../types'

const MAX_TENTATIVI = 3
const BACKOFF_MS = [2000, 4000, 8000]

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------

function log(kind: LogKind, agente: AgentKey | null, messaggio: string) {
  useStudio.getState().aggiungiLog(kind, agente, messaggio)
}

export const logOk = (a: AgentKey | null, m: string) => log('ok', a, m)
export const logAvviso = (a: AgentKey | null, m: string) => log('avviso', a, m)
export const logRiparazione = (a: AgentKey | null, m: string) => log('riparazione', a, m)
export const logFallimento = (a: AgentKey | null, m: string) => log('fallimento', a, m)
export const logInfo = (a: AgentKey | null, m: string) => log('info', a, m)

// ---------------------------------------------------------------------------
// Intercettazione di console ed errori di runtime
// ---------------------------------------------------------------------------

let hookInstallati = false
/** Richieste realmente in volo: serve a capire se l'interfaccia è bloccata. */
let inVolo = 0

export function segnalaInizioChiamata() {
  inVolo += 1
}
export function segnalaFineChiamata() {
  inVolo = Math.max(0, inVolo - 1)
}

function descriviArgomenti(args: unknown[]): string {
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
    .slice(0, 600)
}

/**
 * Il supervisore è attivo dall'inizio: registra console.error/warn e gli errori
 * di runtime della pagina, e riabilita i controlli se restano bloccati.
 */
export function installaHookControllore(): () => void {
  if (hookInstallati) return () => {}
  hookInstallati = true

  const erroreOriginale = console.error
  const avvisoOriginale = console.warn

  console.error = (...args: unknown[]) => {
    erroreOriginale.apply(console, args as never[])
    logFallimento(null, `console.error — ${descriviArgomenti(args)}`)
    ripristinaSeBloccata()
  }
  console.warn = (...args: unknown[]) => {
    avvisoOriginale.apply(console, args as never[])
    logAvviso(null, `console.warn — ${descriviArgomenti(args)}`)
  }

  const suErrore = (e: ErrorEvent) => {
    logFallimento(
      null,
      `Errore di runtime — ${e.message} (${e.filename ?? '?'}:${e.lineno ?? 0}:${e.colno ?? 0})`,
    )
    ripristinaSeBloccata()
  }
  const suRifiuto = (e: PromiseRejectionEvent) => {
    const r = e.reason
    logFallimento(
      null,
      `Promise non gestita — ${r instanceof Error ? `${r.name}: ${r.message}` : String(r)}`,
    )
    ripristinaSeBloccata()
  }

  window.addEventListener('error', suErrore)
  window.addEventListener('unhandledrejection', suRifiuto)

  return () => {
    console.error = erroreOriginale
    console.warn = avvisoOriginale
    window.removeEventListener('error', suErrore)
    window.removeEventListener('unhandledrejection', suRifiuto)
    hookInstallati = false
  }
}

/** Se un agente risulta al lavoro ma non c'è nessuna richiesta in volo, si sblocca. */
function ripristinaSeBloccata() {
  const s = useStudio.getState()
  const alLavoro = Object.values(s.agenti).some((a) => a.status === 'lavoro')
  if (!alLavoro || inVolo > 0) return
  logRiparazione(null, 'Interfaccia bloccata dopo un errore: controlli riabilitati.')
  s.sbloccaInterfaccia()
}

// ---------------------------------------------------------------------------
// Chiamata sorvegliata
// ---------------------------------------------------------------------------

export interface EsitoValidazione {
  ok: boolean
  /** Istruzione più rigida da aggiungere al tentativo successivo. */
  suggerimento?: string
}

export interface ChiamataSorvegliata<T> {
  agente: AgentKey
  /** Etichetta leggibile del passo, usata nei log. */
  passo: string
  esegui: (tentativo: number, suggerimento: string) => Promise<T>
  valida: (esito: T) => EsitoValidazione
  signal?: AbortSignal
}

function attendi(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', suAbort)
      resolve()
    }, ms)
    function suAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', suAbort, { once: true })
  })
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * Esegue un passo sotto la sorveglianza del Controllore:
 * - output non valido → ripete con istruzioni più rigide (massimo 3 tentativi)
 * - rete, 5xx, 529 → backoff esponenziale
 * - 429 → rispetta l'header retry-after quando c'è
 * - 401 e 400 → non ritenta, l'errore è definitivo
 */
export async function sorveglia<T>(call: ChiamataSorvegliata<T>): Promise<T> {
  let suggerimento = ''
  let ultimoErrore: Error | null = null

  for (let tentativo = 1; tentativo <= MAX_TENTATIVI; tentativo++) {
    useStudio.getState().patchAgente(call.agente, { tentativi: tentativo })

    try {
      if (tentativo > 1) {
        logRiparazione(call.agente, `${call.passo}: tentativo ${tentativo} di ${MAX_TENTATIVI}.`)
      }

      segnalaInizioChiamata()
      let esito: T
      try {
        esito = await call.esegui(tentativo, suggerimento)
      } finally {
        segnalaFineChiamata()
      }

      const verdetto = call.valida(esito)
      if (verdetto.ok) {
        logOk(call.agente, `${call.passo}: risposta valida${tentativo > 1 ? ` al tentativo ${tentativo}` : ''}.`)
        return esito
      }

      ultimoErrore = new Error(verdetto.suggerimento ?? 'Output non valido.')
      logAvviso(call.agente, `${call.passo}: output non valido — ${ultimoErrore.message}`)
      suggerimento = `ATTENZIONE: la tua risposta precedente non è utilizzabile. ${verdetto.suggerimento ?? ''} Rifalla da capo rispettando alla lettera lo schema richiesto e i vincoli di materia.`
    } catch (err) {
      if (isAbort(err)) throw err

      const errore = toApiError(err)
      ultimoErrore = errore

      if (!errore.ritentabile) {
        logFallimento(call.agente, `${call.passo}: ${errore.message}`)
        throw errore
      }

      if (tentativo === MAX_TENTATIVI) {
        logFallimento(call.agente, `${call.passo}: ${errore.message}`)
        throw errore
      }

      const attesa = errore.attesaMs ?? BACKOFF_MS[Math.min(tentativo - 1, BACKOFF_MS.length - 1)]
      logRiparazione(
        call.agente,
        `${call.passo}: ${errore.message} Nuovo tentativo fra ${Math.round(attesa / 1000)}s.`,
      )
      await attendi(attesa, call.signal)
    }
  }

  const messaggio = `${call.passo}: nessuna risposta valida dopo ${MAX_TENTATIVI} tentativi. ${ultimoErrore?.message ?? ''}`.trim()
  logFallimento(call.agente, messaggio)
  throw new ApiError('sconosciuto', messaggio)
}

// ---------------------------------------------------------------------------
// Validatori riutilizzabili
// ---------------------------------------------------------------------------

export function passaggiValidi(passaggi: unknown): boolean {
  return (
    Array.isArray(passaggi) &&
    passaggi.length >= 2 &&
    passaggi.every((p) => typeof p === 'string' && p.trim().length > 10)
  )
}

export function testoSostanzioso(valore: unknown, minimo: number): boolean {
  return typeof valore === 'string' && valore.trim().length >= minimo
}

export function elencoNonVuoto(valore: unknown, minimo = 1): boolean {
  return Array.isArray(valore) && valore.length >= minimo
}

/** Termini che segnalano uno sconfinamento fuori dalla Finanza Aziendale. */
const TERMINI_FUORI_PERIMETRO = [
  'principi contabili',
  'oic ',
  'ias/ifrs',
  'partita doppia',
  'scritture contabili',
  'codice civile',
  'normativa pac',
  'regolamento (ue)',
  'decreto legislativo',
  'tecniche di potatura',
  'concimazione',
  'ciclo biologico della mosca',
  'bactrocera oleae',
]

/**
 * Controllo lessicale di supporto: non sostituisce il giudizio del Revisore,
 * ma segnala i punti da guardare.
 */
export function segnalaSconfinamenti(testo: string): string[] {
  const minuscolo = testo.toLowerCase()
  return TERMINI_FUORI_PERIMETRO.filter((t) => minuscolo.includes(t))
}
