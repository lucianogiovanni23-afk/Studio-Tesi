import type Anthropic from '@anthropic-ai/sdk'
import { create } from 'zustand'
import type { Chi } from '../types'

/**
 * Modalità gratuita: senza chiave API gli agenti lavorano tramite Claude.ai.
 * L'app prepara la richiesta completa (istruzioni, materiale, formato della
 * risposta), lo studente la incolla in una chat di claude.ai e riporta qui la
 * risposta. Da quel punto tutto procede come con l'API: stessi controlli in
 * codice su JSON, citazioni ed estratti.
 */

export interface RichiestaPonte {
  id: number
  chi: Chi | undefined
  azione: string
  testo: string
  /** Con uno schema la risposta deve essere JSON. */
  schema: Record<string, unknown> | null
  /**
   * Codice breve che Claude deve ripetere sulla prima riga della risposta:
   * così, quando lo studente torna nell'app, si riconosce negli appunti la
   * risposta giusta (e non quella di una richiesta vecchia).
   */
  codice: string
  /** Se è un nuovo tentativo: perché la risposta precedente è stata scartata. */
  avviso: string | null
  risolvi: (risposta: string) => void
  annulla: () => void
}

export const usePonte = create<{ coda: RichiestaPonte[] }>(() => ({ coda: [] }))

let prossimoId = 1

function testoDiContenuto(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content
  return content
    .map((b) => {
      if (b.type === 'text') return b.text
      if (b.type === 'document') return '[documento allegato: non disponibile in questa modalità]'
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

/** Codice della richiesta: "ST-" più 4 caratteri facili da leggere (niente 0/O, 1/I). */
export function nuovoCodice(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let c = ''
  for (let i = 0; i < 4; i++) c += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  return `ST-${c}`
}

const RE_CODICE = /\bST-[A-Z2-9]{4}\b/g

/** Tutta la richiesta in un unico testo da incollare in una chat nuova. */
export function componiRichiesta(
  system: Anthropic.TextBlockParam[],
  messages: Anthropic.MessageParam[],
  schema: Record<string, unknown> | null,
  codice?: string,
): string {
  const parti = ['=== ISTRUZIONI (seguile alla lettera) ===', system.map((b) => b.text).join('\n\n')]
  for (const m of messages) {
    parti.push(m.role === 'user' ? '=== RICHIESTA ===' : '=== TUA RISPOSTA PRECEDENTE ===')
    parti.push(testoDiContenuto(m.content))
  }
  if (schema) {
    parti.push(
      '=== FORMATO DELLA RISPOSTA ===',
      [
        codice
          ? `Sulla prima riga scrivi solo il codice ${codice}. Dalla riga dopo, UN SOLO oggetto JSON valido e conforme allo schema qui sotto.`
          : 'Rispondi con UN SOLO oggetto JSON valido e conforme allo schema qui sotto.',
        'Niente altro testo prima o dopo, niente commenti, niente artifact o file: scrivi il JSON direttamente nel messaggio.',
        'Tutti i testi in italiano, tranne gli estratti copiati alla lettera dalle fonti, che restano nella lingua originale.',
        'Se la risposta si interrompe e ti scrivo "continua", riprendi esattamente dal carattere in cui ti eri fermato.',
        '',
        JSON.stringify(schema),
      ].join('\n'),
    )
  } else {
    parti.push(
      '=== FORMATO DELLA RISPOSTA ===',
      codice
        ? `Sulla prima riga scrivi solo il codice ${codice}. Poi rispondi in italiano, in testo semplice.`
        : 'Rispondi in italiano, in testo semplice.',
    )
  }
  return parti.join('\n\n')
}

/**
 * Ricava il JSON da quello che lo studente incolla: toglie i blocchi di codice
 * e il testo intorno, e accetta anche più pezzi incollati di seguito
 * (risposta interrotta e poi "continua").
 */
export function estraiJson(incollato: string): unknown {
  const t = incollato.replace(/```(?:json)?/gi, '').trim()
  const inizio = t.indexOf('{')
  const fine = t.lastIndexOf('}')
  if (inizio < 0 || fine <= inizio) throw new Error('In quello che hai incollato non trovo la risposta: copia tutta la risposta di Claude e incollala qui.')
  const corpo = t.slice(inizio, fine + 1)
  try {
    return JSON.parse(corpo)
  } catch {
    // Due pezzi incollati di seguito hanno un a capo nel punto di giunzione, magari dentro
    // una stringa. Nel JSON gli a capo veri stanno solo fuori dalle stringhe, dove sono
    // spazi superflui: togliendoli tutti la giunzione torna esatta.
    try {
      return JSON.parse(corpo.replace(/\r?\n/g, ''))
    } catch {
      throw new Error(
        'La risposta incollata è a metà o rovinata. Se Claude si è fermato, scrivigli "continua" e incolla anche il resto sotto il primo pezzo.',
      )
    }
  }
}

/** Controllo minimo: le proprietà obbligatorie del primo livello devono esserci. */
export function controllaSchema(dati: unknown, schema: Record<string, unknown>): string | null {
  if (typeof dati !== 'object' || dati === null || Array.isArray(dati)) return 'La risposta non è nel formato giusto.'
  const richieste = (schema.required as string[] | undefined) ?? []
  const mancanti = richieste.filter((k) => !(k in (dati as Record<string, unknown>)))
  return mancanti.length ? `Nella risposta mancano dei pezzi (${mancanti.join(', ')}). Copia tutta la risposta, oppure chiedi a Claude di seguire il formato.` : null
}

/** Toglie dalla risposta la riga con il codice della richiesta (serve solo a riconoscerla). */
export function togliCodice(testo: string): string {
  return testo
    .replace(/^\s*\**\s*ST-[A-Z2-9]{4}\s*\**\s*\n?/m, '')
    .replace(RE_CODICE, '')
    .trim()
}

export type Riconoscimento =
  /** Ha il codice di questa richiesta. */
  | 'codice'
  /** Niente codice, ma è JSON completo e conforme allo schema. */
  | 'json'
  /** Negli appunti c'è ancora la richiesta, non la risposta. */
  | 'richiesta'
  /** Ha il codice di un'altra richiesta: è una risposta vecchia. */
  | 'altra'
  | null

/** Guarda se un testo (di solito gli appunti) sembra la risposta di Claude a questa richiesta. */
export function riconosciRisposta(testo: string, r: Pick<RichiestaPonte, 'codice' | 'schema' | 'testo'>): Riconoscimento {
  const t = testo.trim()
  if (t.length < 2) return null
  if (t.includes('=== ISTRUZIONI (seguile alla lettera) ===') || t === r.testo.trim()) return 'richiesta'
  const codici: string[] = t.match(RE_CODICE) ?? []
  if (codici.includes(r.codice)) {
    if (!r.schema) return 'codice'
    // Con lo schema serve anche il JSON: il codice da solo vuol dire che manca la risposta.
    try {
      estraiJson(t)
      return 'codice'
    } catch {
      return null
    }
  }
  if (codici.length) return 'altra'
  if (r.schema) {
    try {
      const dati = estraiJson(t)
      return controllaSchema(dati, r.schema) ? null : 'json'
    } catch {
      return null
    }
  }
  return null
}

/** Il Controllore aggiunge alle istruzioni il motivo dello scarto quando ripete un passo. */
function avvisoTentativo(testo: string): string | null {
  const m = testo.match(/ATTENZIONE: la tua risposta precedente non è utilizzabile\. ([^\n]*?) Rifalla da capo/)
  return m ? m[1].trim() || 'non era nel formato giusto.' : null
}

/** Mette in coda una richiesta e aspetta che lo studente incolli la risposta. */
export function chiediAClaudeAi(opts: {
  chi?: Chi
  azione?: string
  system: Anthropic.TextBlockParam[]
  messages: Anthropic.MessageParam[]
  schema?: Record<string, unknown> | null
  signal?: AbortSignal
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const id = prossimoId++
    const togli = () => usePonte.setState((s) => ({ coda: s.coda.filter((r) => r.id !== id) }))
    const abortito = () => {
      togli()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (opts.signal?.aborted) return abortito()
    opts.signal?.addEventListener('abort', abortito, { once: true })
    const codice = nuovoCodice()
    const testo = componiRichiesta(opts.system, opts.messages, opts.schema ?? null, codice)
    const richiesta: RichiestaPonte = {
      id,
      chi: opts.chi,
      azione: opts.azione ?? 'richiesta',
      testo,
      schema: opts.schema ?? null,
      codice,
      avviso: avvisoTentativo(testo),
      risolvi: (risposta) => {
        opts.signal?.removeEventListener('abort', abortito)
        togli()
        resolve(opts.schema ? risposta : togliCodice(risposta))
      },
      annulla: () => {
        opts.signal?.removeEventListener('abort', abortito)
        abortito()
      },
    }
    usePonte.setState((s) => ({ coda: [...s.coda, richiesta] }))
  })
}
