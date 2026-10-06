import type Anthropic from '@anthropic-ai/sdk'

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
  'claude-sonnet-5-5': { input: 2, output: 10, letturaCache: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, letturaCache: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, letturaCache: 0.1 },
}

const COSTO_RICERCA = 0.01

export function prezzi(modello: string) {
  return LISTINO[modello] ?? LISTINO['claude-sonnet-5-5']
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
export function tokenDaCaratteri(caratteri: number): number {
  return Math.round(caratteri / 3.8)
}

/** Quanto si è risparmiato leggendo dalla cache invece di pagare l'input pieno. */
export function risparmioCache(modello: string, u: UsoNormalizzato): number {
  const p = prezzi(modello)
  return (u.letturaCache * (p.input - p.letturaCache)) / 1_000_000
}

export interface Stima {
  minimo: number
  massimo: number
}

/**
 * Stima indicativa di una chiamata prima di eseguirla. Le ipotesi sono
 * volutamente prudenti; il consuntivo reale si legge poi dai campi usage.
 */
export function stimaChiamata(modello: string, u: Partial<UsoNormalizzato>): Stima {
  const costo = costoUso(modello, {
    input: 0,
    output: 0,
    scritturaCache5m: 0,
    scritturaCache1h: 0,
    letturaCache: 0,
    ricerche: 0,
    letture: 0,
    ...u,
  })
  return { minimo: costo * 0.7, massimo: costo * 1.5 }
}

export function formattaDollari(valore: number): string {
  if (valore > 0 && valore < 0.01) return 'meno di 0,01 $'
  return `${valore.toFixed(2).replace('.', ',')} $`
}
