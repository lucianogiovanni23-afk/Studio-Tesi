import { primaPaginaDa } from '../domain/pagine'
import type { OrigineFonte } from '../types'

/**
 * Cataloghi accademici gratuiti interrogati direttamente dal browser.
 * I metadati (autori, anno, rivista, DOI, abstract) arrivano dai cataloghi:
 * nessun modello li scrive, quindi non possono essere inventati.
 */

export type Catalogo = 'openalex' | 'crossref' | 'semanticscholar'

export const CATALOGHI: { key: Catalogo; nome: string }[] = [
  { key: 'openalex', nome: 'OpenAlex' },
  { key: 'crossref', nome: 'Crossref' },
  { key: 'semanticscholar', nome: 'Semantic Scholar' },
]

export interface RisultatoCatalogo {
  origine: Extract<OrigineFonte, Catalogo>
  titolo: string
  autori: string[]
  anno: number | null
  rivista: string
  doi: string
  url: string
  abstract: string
  lingua: string
  citazioni: number
  /** Versione gratuita (PDF o pagina), se il catalogo la conosce. */
  oaUrl?: string
  /** Prima pagina stampata dell'articolo. */
  primaPagina?: number
}

const TIMEOUT_MS = 20_000

export class ErroreCatalogo extends Error {
  readonly catalogo: Catalogo
  constructor(catalogo: Catalogo, messaggio: string) {
    super(messaggio)
    this.catalogo = catalogo
  }
}

/** Timeout più annullamento dell'utente, senza AbortSignal.any (assente nei Safari di iPad meno recenti). */
function segnale(esterno?: AbortSignal): AbortSignal {
  const c = new AbortController()
  setTimeout(() => c.abort(new DOMException('Tempo scaduto', 'TimeoutError')), TIMEOUT_MS)
  if (esterno) {
    if (esterno.aborted) c.abort(esterno.reason)
    else esterno.addEventListener('abort', () => c.abort(esterno.reason), { once: true })
  }
  return c.signal
}

async function leggiJson(catalogo: Catalogo, url: string, signal?: AbortSignal): Promise<unknown> {
  let risposta: Response
  try {
    risposta = await fetch(url, { signal: segnale(signal), headers: { Accept: 'application/json' } })
  } catch (err) {
    if (signal?.aborted) throw err
    const scaduto = err instanceof DOMException && err.name === 'TimeoutError'
    throw new ErroreCatalogo(
      catalogo,
      scaduto
        ? 'non ha risposto entro 20 secondi'
        : catalogo === 'semanticscholar'
          ? 'non risponde dal browser (spesso limita le richieste senza chiave): gli altri cataloghi bastano'
          : 'non raggiungibile dal browser (rete, blocco CORS o estensione del browser)',
    )
  }
  if (risposta.status === 429) throw new ErroreCatalogo(catalogo, 'troppe richieste (429): riprova fra qualche minuto')
  if (!risposta.ok) throw new ErroreCatalogo(catalogo, `errore ${risposta.status}`)
  try {
    return await risposta.json()
  } catch {
    throw new ErroreCatalogo(catalogo, 'risposta non leggibile')
  }
}

export function normalizzaDoi(doi: string | null | undefined): string {
  return (doi ?? '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase()
}

function pulisciTesto(testo: string | null | undefined): string {
  return (testo ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// OpenAlex
// ---------------------------------------------------------------------------

interface OpenAlexWork {
  doi?: string | null
  title?: string | null
  display_name?: string | null
  publication_year?: number | null
  language?: string | null
  cited_by_count?: number
  authorships?: { author?: { display_name?: string } }[]
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null
  abstract_inverted_index?: Record<string, number[]> | null
  open_access?: { is_oa?: boolean; oa_url?: string | null } | null
  best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null } | null
  biblio?: { first_page?: string | null } | null
}

/** OpenAlex fornisce l'abstract come indice invertito: si ricompone in ordine. */
export function ricomponiAbstract(indice: Record<string, number[]> | null | undefined): string {
  if (!indice) return ''
  const parole: string[] = []
  for (const [parola, posizioni] of Object.entries(indice)) for (const p of posizioni) parole[p] = parola
  return parole.filter(Boolean).join(' ')
}

export async function cercaOpenAlex(q: string, quanti: number, signal?: AbortSignal): Promise<RisultatoCatalogo[]> {
  const campi =
    'doi,title,display_name,publication_year,language,cited_by_count,authorships,primary_location,abstract_inverted_index,open_access,best_oa_location,biblio'
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${quanti}&select=${campi}`
  const dati = (await leggiJson('openalex', url, signal)) as { results?: OpenAlexWork[] }
  return (dati.results ?? []).map(daOpenAlex)
}

function daOpenAlex(w: OpenAlexWork): RisultatoCatalogo {
    const doi = normalizzaDoi(w.doi)
    return {
      origine: 'openalex' as const,
      oaUrl: w.best_oa_location?.pdf_url || w.open_access?.oa_url || w.best_oa_location?.landing_page_url || undefined,
      primaPagina: primaPaginaDa(w.biblio?.first_page),
      titolo: pulisciTesto(w.title ?? w.display_name),
      autori: (w.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
      anno: w.publication_year ?? null,
      rivista: w.primary_location?.source?.display_name ?? '',
      doi,
      url: doi ? `https://doi.org/${doi}` : (w.primary_location?.landing_page_url ?? ''),
      abstract: ricomponiAbstract(w.abstract_inverted_index),
      lingua: w.language ?? '',
      citazioni: w.cited_by_count ?? 0,
    }
}

// ---------------------------------------------------------------------------
// Crossref
// ---------------------------------------------------------------------------

interface CrossrefItem {
  DOI?: string
  title?: string[]
  author?: { given?: string; family?: string; name?: string }[]
  issued?: { 'date-parts'?: (number | null)[][] }
  'container-title'?: string[]
  abstract?: string
  language?: string
  URL?: string
  'is-referenced-by-count'?: number
  page?: string
  link?: { URL?: string; 'content-type'?: string }[]
}

function daCrossref(it: CrossrefItem): RisultatoCatalogo {
  const doi = normalizzaDoi(it.DOI)
  return {
    origine: 'crossref',
    titolo: pulisciTesto(it.title?.[0]),
    autori: (it.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean),
    anno: it.issued?.['date-parts']?.[0]?.[0] ?? null,
    rivista: pulisciTesto(it['container-title']?.[0]),
    doi,
    url: doi ? `https://doi.org/${doi}` : (it.URL ?? ''),
    abstract: pulisciTesto(it.abstract),
    lingua: it.language ?? '',
    citazioni: it['is-referenced-by-count'] ?? 0,
    primaPagina: primaPaginaDa(it.page),
  }
}

/** Diventa vero se Crossref ha rifiutato una volta l'elenco dei campi: da lì si chiede il record completo. */
let crossrefSenzaCampi = false

export async function cercaCrossref(q: string, quanti: number, signal?: AbortSignal): Promise<RisultatoCatalogo[]> {
  const campi = 'DOI,title,author,issued,container-title,abstract,language,URL,is-referenced-by-count,page'
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${quanti}&select=${campi}`
  let dati: { message?: { items?: CrossrefItem[] } }
  try {
    dati = (await leggiJson('crossref', crossrefSenzaCampi ? url.replace(/&select=[^&]*/, '') : url, signal)) as typeof dati
  } catch (err) {
    // Se Crossref rifiuta l'elenco dei campi (400), si chiede il record completo: pesa di più ma funziona.
    if (crossrefSenzaCampi || !(err instanceof ErroreCatalogo) || !err.message.includes('400')) throw err
    crossrefSenzaCampi = true
    dati = (await leggiJson('crossref', url.replace(/&select=[^&]*/, ''), signal)) as typeof dati
  }
  return (dati.message?.items ?? []).map(daCrossref)
}

/** Metadati veri di un DOI (per i PDF caricati dallo studente). */
export async function metadatiDaDoi(doi: string, signal?: AbortSignal): Promise<RisultatoCatalogo | null> {
  const d = normalizzaDoi(doi)
  if (!d) return null
  const dati = (await leggiJson('crossref', `https://api.crossref.org/works/${encodeURIComponent(d)}`, signal)) as {
    message?: CrossrefItem
  }
  return dati.message ? daCrossref(dati.message) : null
}

// ---------------------------------------------------------------------------
// Semantic Scholar
// ---------------------------------------------------------------------------

interface S2Paper {
  title?: string
  year?: number | null
  venue?: string
  authors?: { name?: string }[]
  externalIds?: { DOI?: string } | null
  abstract?: string | null
  url?: string
  citationCount?: number
  openAccessPdf?: { url?: string | null } | null
}

export async function cercaSemanticScholar(q: string, quanti: number, signal?: AbortSignal): Promise<RisultatoCatalogo[]> {
  const campi = 'title,year,venue,authors,externalIds,abstract,url,citationCount,openAccessPdf'
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${quanti}&fields=${campi}`
  const dati = (await leggiJson('semanticscholar', url, signal)) as { data?: S2Paper[] }
  return (dati.data ?? []).map((p) => {
    const doi = normalizzaDoi(p.externalIds?.DOI)
    return {
      origine: 'semanticscholar' as const,
      titolo: pulisciTesto(p.title),
      autori: (p.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
      anno: p.year ?? null,
      rivista: p.venue ?? '',
      doi,
      url: doi ? `https://doi.org/${doi}` : (p.url ?? ''),
      abstract: pulisciTesto(p.abstract),
      lingua: '',
      citazioni: p.citationCount ?? 0,
      oaUrl: p.openAccessPdf?.url || undefined,
    }
  })
}

export const CERCA: Record<Catalogo, (q: string, n: number, s?: AbortSignal) => Promise<RisultatoCatalogo[]>> = {
  openalex: cercaOpenAlex,
  crossref: cercaCrossref,
  semanticscholar: cercaSemanticScholar,
}

// ---------------------------------------------------------------------------
// Unione e prova di raggiungibilità
// ---------------------------------------------------------------------------

export function chiaveTitolo(titolo: string): string {
  return titolo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Unisce i risultati dei cataloghi togliendo i doppioni (stesso DOI o stesso
 * titolo). Fra due doppioni tiene quello con più metadati, completando l'abstract.
 */
export function unisci(risultati: RisultatoCatalogo[]): RisultatoCatalogo[] {
  const perChiave = new Map<string, RisultatoCatalogo>()
  for (const r of risultati) {
    if (!r.titolo) continue
    const chiave = r.doi ? `doi:${r.doi}` : `t:${chiaveTitolo(r.titolo)}`
    const chiaveT = `t:${chiaveTitolo(r.titolo)}`
    const esistente = perChiave.get(chiave) ?? perChiave.get(chiaveT)
    if (!esistente) {
      perChiave.set(chiave, r)
      perChiave.set(chiaveT, r)
      continue
    }
    if (!esistente.abstract && r.abstract) esistente.abstract = r.abstract
    if (!esistente.doi && r.doi) {
      esistente.doi = r.doi
      esistente.url = `https://doi.org/${r.doi}`
    }
    if (!esistente.rivista && r.rivista) esistente.rivista = r.rivista
    esistente.citazioni = Math.max(esistente.citazioni, r.citazioni)
    if (!esistente.oaUrl && r.oaUrl) esistente.oaUrl = r.oaUrl
    if (!esistente.primaPagina && r.primaPagina) esistente.primaPagina = r.primaPagina
  }
  return [...new Set(perChiave.values())]
}

export interface EsitoProva {
  catalogo: Catalogo
  ok: boolean
  messaggio: string
}

/** Verifica dal browser dello studente che ogni catalogo risponda. */
export async function provaCataloghi(): Promise<EsitoProva[]> {
  return Promise.all(
    CATALOGHI.map(async ({ key }) => {
      try {
        const r = await CERCA[key]('olive oil drought', 1)
        return { catalogo: key, ok: true, messaggio: r.length ? 'risponde dal browser' : 'risponde, ma senza risultati' }
      } catch (err) {
        return { catalogo: key, ok: false, messaggio: err instanceof Error ? err.message : 'errore' }
      }
    }),
  )
}

/**
 * Dove si trova la versione gratuita di un articolo già in biblioteca:
 * OpenAlex per DOI (PDF o pagina open access). Restituisce gli indirizzi da
 * provare, il PDF per primo, e la prima pagina stampata se nota.
 */
export async function cercaOpenAccess(doi: string, signal?: AbortSignal): Promise<{ indirizzi: string[]; primaPagina?: number }> {
  const d = normalizzaDoi(doi)
  if (!d) return { indirizzi: [] }
  const campi = 'open_access,best_oa_location,locations,biblio'
  const w = (await leggiJson('openalex', `https://api.openalex.org/works/doi:${encodeURIComponent(d)}?select=${campi}`, signal)) as OpenAlexWork & {
    locations?: { pdf_url?: string | null; landing_page_url?: string | null; is_oa?: boolean }[]
  }
  const indirizzi = [
    w.best_oa_location?.pdf_url,
    ...(w.locations ?? []).filter((l) => l.is_oa).map((l) => l.pdf_url),
    w.open_access?.oa_url,
    w.best_oa_location?.landing_page_url,
  ].filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
  return { indirizzi: [...new Set(indirizzi)], primaPagina: primaPaginaDa(w.biblio?.first_page) }
}
