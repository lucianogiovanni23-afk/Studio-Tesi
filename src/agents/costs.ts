import type Anthropic from '@anthropic-ai/sdk'
import type { Profondita } from '../types'
import { BUDGET } from './corpus'

/**
 * Listino in dollari per milione di token (API Anthropic, prezzi di listino).
 * La scrittura in cache costa 1,25 volte l'input (2 volte con ttl di un'ora);
 * la lettura dalla cache costa un decimo. La ricerca web costa 10 $ ogni
 * 1000 ricerche; la lettura delle pagine (web_fetch) non ha costi aggiuntivi
 * oltre ai token del contenuto.
 */
export const LISTINO: Record<string, { input: number; output: number; letturaCache: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, letturaCache: 0.2 },
  'claude-opus-5': { input: 5, output: 25, letturaCache: 0.5 },
  'claude-sonnet-5': { input: 2, output: 10, letturaCache: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, letturaCache: 0.1 },
}

const COSTO_RICERCA = 0.01

function prezzi(modello: string) {
  return LISTINO[modello] ?? LISTINO['claude-sonnet-5']
}

export interface UsoNormalizzato {
  input: number
  output: number
  scritturaCache5m: number
  scritturaCache1h: number
  letturaCache: number
  ricerche: number
  letture: number
}

export function normalizzaUso(usage: Anthropic.Usage | null | undefined): UsoNormalizzato {
  const u = (usage ?? {}) as Anthropic.Usage & {
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null
    server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number } | null
  }
  const scrittura = u.cache_creation_input_tokens ?? 0
  const scrittura1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    scritturaCache1h: scrittura1h,
    scritturaCache5m: Math.max(0, scrittura - scrittura1h),
    letturaCache: u.cache_read_input_tokens ?? 0,
    ricerche: u.server_tool_use?.web_search_requests ?? 0,
    letture: u.server_tool_use?.web_fetch_requests ?? 0,
  }
}

export function sommaUsi(a: UsoNormalizzato, b: UsoNormalizzato): UsoNormalizzato {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    scritturaCache5m: a.scritturaCache5m + b.scritturaCache5m,
    scritturaCache1h: a.scritturaCache1h + b.scritturaCache1h,
    letturaCache: a.letturaCache + b.letturaCache,
    ricerche: a.ricerche + b.ricerche,
    letture: a.letture + b.letture,
  }
}

export function costoUso(modello: string, u: UsoNormalizzato): number {
  const p = prezzi(modello)
  const milione = 1_000_000
  return (
    (u.input * p.input +
      u.output * p.output +
      u.scritturaCache5m * p.input * 1.25 +
      u.scritturaCache1h * p.input * 2 +
      u.letturaCache * p.letturaCache) /
      milione +
    u.ricerche * COSTO_RICERCA
  )
}

/** Token stimati da un numero di caratteri di testo italiano. */
function token(caratteri: number): number {
  return Math.round(caratteri / 3.8)
}

export interface VoceStima {
  voce: string
  costo: number
}

export interface Stima {
  minimo: number
  massimo: number
  dettaglio: VoceStima[]
}

/**
 * Stima indicativa di un'esecuzione completa, prima di avviarla. Le ipotesi
 * sono volutamente prudenti; il consuntivo reale si legge dai campi usage.
 */
export function stimaEsecuzione(opzioni: {
  modelli: Record<'lettore' | 'ricercatore' | 'selettore' | 'scrittore' | 'controllore', string>
  caratteriCorso: number
  profondita: Profondita
}): Stima {
  const budget = BUDGET[opzioni.profondita]
  const corsoLettore = token(Math.min(opzioni.caratteriCorso, budget.lettore))
  const corsoScrittore = token(Math.min(opzioni.caratteriCorso, budget.scrittore))
  const prefissoScrittore = corsoScrittore + 9000

  const costo = (modello: string, u: Partial<UsoNormalizzato>) =>
    costoUso(modello, {
      input: 0,
      output: 0,
      scritturaCache5m: 0,
      scritturaCache1h: 0,
      letturaCache: 0,
      ricerche: 0,
      letture: 0,
      ...u,
    })

  const dettaglio: VoceStima[] = [
    { voce: 'Lettore — dossier del corso', costo: costo(opzioni.modelli.lettore, { input: corsoLettore + 3000, output: 4500 }) },
    {
      voce: 'Ricercatore — ricerche e lettura delle pagine',
      costo: costo(opzioni.modelli.ricercatore, { input: 60_000, output: 7000, ricerche: 8 }),
    },
    { voce: 'Selettore', costo: costo(opzioni.modelli.selettore, { input: 10_000, output: 2500 }) },
    {
      voce: 'Scrittore — scaletta',
      costo: costo(opzioni.modelli.scrittore, { scritturaCache5m: prefissoScrittore, input: 1500, output: 4000 }),
    },
    {
      voce: 'Scrittore — tre opzioni',
      costo: costo(opzioni.modelli.scrittore, {
        scritturaCache5m: prefissoScrittore,
        letturaCache: prefissoScrittore * 2,
        input: 6000,
        output: 36_000,
      }),
    },
    {
      voce: 'Controllore — verifica di citazioni e opzioni',
      costo: costo(opzioni.modelli.controllore, { input: 30_000, output: 7000 }),
    },
  ]

  const totale = dettaglio.reduce((s, v) => s + v.costo, 0)
  return { minimo: totale * 0.7, massimo: totale * 1.5, dettaglio }
}

export function formattaDollari(valore: number): string {
  if (valore < 0.01) return `${(valore * 100).toFixed(2)} ¢`
  return `${valore.toFixed(2)} $`
}
