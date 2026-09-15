import type {
  ContentBlock,
  TextBlock,
  WebSearchResultItem,
  WebSearchToolResultBlock,
  WebSearchToolResultError,
} from './api'
import type { Source } from '../types'

export const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 6,
} as const

export interface RealResult {
  url: string
  title: string
}

export interface SearchHarvest {
  /** Risultati realmente restituiti dal motore di ricerca. */
  results: RealResult[]
  /** Query effettivamente eseguite dal modello. */
  queries: string[]
  /** Messaggi d'errore del tool, già tradotti. */
  errors: string[]
  /** true se il tool di ricerca è stato invocato almeno una volta. */
  used: boolean
}

function describeSearchError(code: string): string {
  switch (code) {
    case 'too_many_requests':
      return 'Il tool di ricerca web ha superato il limite di richieste (rate limit). Attendi qualche minuto e riprova.'
    case 'max_uses_exceeded':
      return 'Il tool di ricerca web ha esaurito il numero massimo di ricerche consentite per questa chiamata.'
    case 'query_too_long':
      return 'La query di ricerca era troppo lunga: il Ricercatore deve usare query più brevi.'
    case 'invalid_input':
      return 'La query inviata al tool di ricerca web non era valida.'
    case 'unavailable':
      return 'Il tool di ricerca web è temporaneamente non disponibile.'
    default:
      return `Il tool di ricerca web ha restituito un errore (${code}).`
  }
}

function isError(
  content: WebSearchResultItem[] | WebSearchToolResultError,
): content is WebSearchToolResultError {
  return !Array.isArray(content) && content?.type === 'web_search_tool_result_error'
}

/** Normalizza un URL per confrontarlo: senza protocollo, senza www, senza slash finale. */
export function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#]+$/, '')
}

/**
 * Raccoglie dai blocchi della risposta gli URL realmente restituiti dal motore di ricerca
 * (risultati del tool e citazioni), più le query eseguite e gli eventuali errori.
 */
export function harvestSearch(blocks: ContentBlock[]): SearchHarvest {
  const byUrl = new Map<string, RealResult>()
  const queries: string[] = []
  const errors: string[] = []
  let used = false

  for (const block of blocks) {
    if (block.type === 'server_tool_use') {
      used = true
      const query = (block as { input?: { query?: string } }).input?.query
      if (query) queries.push(query)
      continue
    }

    if (block.type === 'web_search_tool_result') {
      used = true
      const content = (block as WebSearchToolResultBlock).content
      if (isError(content)) {
        const message = describeSearchError(content.error_code)
        if (!errors.includes(message)) errors.push(message)
        continue
      }
      for (const item of content ?? []) {
        if (typeof item?.url !== 'string' || !item.url) continue
        const key = normalizeUrl(item.url)
        if (!byUrl.has(key)) byUrl.set(key, { url: item.url, title: item.title ?? item.url })
      }
      continue
    }

    if (block.type === 'text') {
      for (const citation of (block as TextBlock).citations ?? []) {
        if (typeof citation.url !== 'string' || !citation.url) continue
        const key = normalizeUrl(citation.url)
        if (!byUrl.has(key)) {
          byUrl.set(key, { url: citation.url, title: citation.title ?? citation.url })
        }
      }
    }
  }

  return { results: [...byUrl.values()], queries, errors, used }
}

const SOURCE_BLOCK = /\[\s*FONTE\s*\]/gi

function fieldOf(block: string, label: string): string {
  const re = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, 'im')
  const match = re.exec(block)
  return match ? match[1].trim() : ''
}

/**
 * Estrae le fonti dal RISULTATO del Ricercatore e le confronta con gli URL reali:
 * una fonte è `verified` solo se il suo URL compare davvero nei risultati della ricerca.
 */
export function parseSources(result: string, real: RealResult[]): Source[] {
  const realByUrl = new Map(real.map((r) => [normalizeUrl(r.url), r]))
  const chunks = result.split(SOURCE_BLOCK).slice(1)
  const sources: Source[] = []
  const seen = new Set<string>()

  for (const chunk of chunks) {
    const url = fieldOf(chunk, 'URL')
    if (!url || !/^https?:\/\//i.test(url)) continue
    const key = normalizeUrl(url)
    if (seen.has(key)) continue
    seen.add(key)

    const match = realByUrl.get(key)
    sources.push({
      title: fieldOf(chunk, 'TITOLO') || match?.title || url,
      url: match?.url ?? url,
      summary: fieldOf(chunk, 'CONTENUTO'),
      relevance: fieldOf(chunk, 'RILEVANZA'),
      verified: Boolean(match),
    })
  }

  return sources
}

/** Blocchi [TENUTA] / [SCARTATA] prodotti dal Selettore. */
export function parseSelection(
  result: string,
  found: Source[],
): { kept: Source[]; discarded: { title: string; url: string; reason: string }[] } {
  const foundByUrl = new Map(found.map((s) => [normalizeUrl(s.url), s]))
  const kept: Source[] = []
  const discarded: { title: string; url: string; reason: string }[] = []
  const keptSeen = new Set<string>()

  const tokens = result.split(/\[\s*(TENUTA|SCARTATA)\s*\]/gi)
  for (let i = 1; i < tokens.length; i += 2) {
    const kind = tokens[i].toUpperCase()
    const chunk = tokens[i + 1] ?? ''
    const url = fieldOf(chunk, 'URL')
    if (!url) continue
    const key = normalizeUrl(url)
    const original = foundByUrl.get(key)

    if (kind === 'TENUTA') {
      if (keptSeen.has(key)) continue
      keptSeen.add(key)
      kept.push(
        original ?? {
          title: fieldOf(chunk, 'TITOLO') || url,
          url,
          summary: fieldOf(chunk, 'CONTENUTO'),
          relevance: fieldOf(chunk, 'MOTIVO'),
          verified: false,
        },
      )
    } else {
      discarded.push({
        title: original?.title ?? fieldOf(chunk, 'TITOLO') ?? url,
        url,
        reason: fieldOf(chunk, 'MOTIVO'),
      })
    }
  }

  return { kept, discarded }
}

/** Il Selettore può chiedere un nuovo giro di ricerca se le fonti non bastano. */
export function wantsNewSearch(result: string): boolean {
  return /\[\s*NUOVA\s*RICERCA\s*\]/i.test(result)
}
