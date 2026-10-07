import { useStudio } from '../store'
import type { Fonte } from '../types'
import { daPagine, testoDaBuffer, type TestoConPagine } from '../io/pdfPaper'
import { ApiError, chiamataConStrumenti, creaClient } from './api'
import { cercaOpenAccess } from './cataloghi'
import { normalizza } from './citations'
import { pagineDaPdfBase64 } from './corpus'
import { stimaChiamata, type Stima } from './costs'
import { logOk } from './supervisor'
import { raccogliRicerca } from './verifyUrls'

/**
 * Testo completo dei paper open access.
 * 1. Prima il browser prova a scaricare gratis la versione libera (PDF).
 * 2. Se il sito dell'editore lo blocca, si può usare l'API (web_fetch nella
 *    versione base, sul modello della selezione, il più economico): lo
 *    studente lo decide vedendo la stima.
 * In entrambi i casi il codice controlla che il documento sia quel paper.
 */

const MIN_CARATTERI = 3000
const TIMEOUT_MS = 30_000

/** Una fonte per cui ha senso cercare il testo completo. */
export function puòAvereTestoCompleto(f: Fonte): boolean {
  return !f.testoCompleto && Boolean(f.oaUrl || f.doi)
}

/** Il documento scaricato è davvero questo paper? Le parole del titolo devono comparire all'inizio. */
export function èLoStessoPaper(f: Fonte, testo: string): boolean {
  const parole = normalizza(f.titolo)
    .replace(/[.,'"-]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3)
  if (parole.length === 0) return true
  const inizio = normalizza(testo.slice(0, 8000))
  const trovate = parole.filter((w) => inizio.includes(w)).length
  return trovate / parole.length >= 0.6
}

async function indirizzi(f: Fonte): Promise<{ elenco: string[]; primaPagina?: number }> {
  const elenco = f.oaUrl ? [f.oaUrl] : []
  let primaPagina: number | undefined
  if (f.doi) {
    try {
      const oa = await cercaOpenAccess(f.doi)
      elenco.push(...oa.indirizzi)
      primaPagina = oa.primaPagina
    } catch {
      // OpenAlex non raggiungibile: si prova con quello che si ha.
    }
  }
  // I PDF prima delle pagine web.
  const unici = [...new Set(elenco)]
  return { elenco: [...unici.filter((u) => /\.pdf($|\?)|\/pdf\b/i.test(u)), ...unici.filter((u) => !/\.pdf($|\?)|\/pdf\b/i.test(u))], primaPagina }
}

async function scaricaNelBrowser(url: string): Promise<TestoConPagine | null> {
  const c = new AbortController()
  const timer = setTimeout(() => c.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, { signal: c.signal, redirect: 'follow' })
    if (!r.ok) return null
    const tipo = r.headers.get('content-type') ?? ''
    const buffer = await r.arrayBuffer()
    const firma = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 5)))
    if (tipo.includes('pdf') || firma === '%PDF-') return await testoDaBuffer(buffer)
    if (tipo.includes('html') || tipo.includes('text')) {
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(buffer), 'text/html')
      doc.querySelectorAll('script, style, nav, header, footer').forEach((n) => n.remove())
      const testo = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
      return { testo, pagine: [] }
    }
    return null
  } catch {
    // Rete, CORS o tempo scaduto: il browser non può scaricarlo.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Stima di una lettura via API: un PDF di 15-40 pagine. */
export function stimaTestoCompleto(): Stima {
  const modello = useStudio.getState().preferenze.modelli.selezione
  const basso = stimaChiamata(modello, { input: 25_000, output: 30 })
  const alto = stimaChiamata(modello, { input: 100_000, output: 30 })
  return { minimo: basso.minimo, massimo: alto.massimo }
}

async function scaricaConApi(url: string): Promise<TestoConPagine | null> {
  const s = useStudio.getState()
  const client = creaClient(s.apiKey)
  const r = await chiamataConStrumenti({
    client,
    model: s.preferenze.modelli.selezione,
    maxTokens: 300,
    chi: 'bibliotecario',
    azione: 'testo completo open access',
    system: [{ type: 'text', text: 'Leggi l\'indirizzo indicato con web_fetch e poi rispondi solo "fatto".' }],
    messages: [{ role: 'user', content: `Leggi con web_fetch questo documento: ${url}` }],
    // Versione base del tool: funziona su tutti i modelli, anche su Haiku 4.5.
    tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 1 }],
    nomeToolConsegna: '',
  })
  const raccolta = raccogliRicerca(r.blocchi)
  if (raccolta.errori.length) throw new ApiError('sconosciuto', raccolta.errori.join(' '))
  const pagina = [...raccolta.pagine.values()][0]
  if (!pagina) return null
  if (pagina.pdfBase64) return daPagine(await pagineDaPdfBase64(pagina.pdfBase64))
  return pagina.testo ? { testo: pagina.testo, pagine: [] } : null
}

export type EsitoTestoCompleto =
  | { ok: true; via: 'browser' | 'api'; pagine: number; url: string }
  | { ok: false; motivo: 'nessun_indirizzo' | 'bloccato' | 'non_corrisponde'; indirizzi: string[] }

/**
 * Cerca il testo completo di una fonte. Senza `conApi` prova solo nel browser
 * (gratis); con `conApi` usa l'API sugli indirizzi che il browser non ha potuto leggere.
 */
export async function recuperaTestoCompleto(fonteId: string, conApi = false): Promise<EsitoTestoCompleto> {
  const f = useStudio.getState().progetto.fonti.find((x) => x.id === fonteId)
  if (!f) throw new ApiError('sconosciuto', 'Fonte non trovata.')
  const { elenco, primaPagina } = await indirizzi(f)
  if (elenco.length === 0) return { ok: false, motivo: 'nessun_indirizzo', indirizzi: [] }

  let scartatoPerTitolo = false
  for (const url of elenco.slice(0, conApi ? 2 : 4)) {
    const letto = conApi ? await scaricaConApi(url) : await scaricaNelBrowser(url)
    if (!letto || letto.testo.length < MIN_CARATTERI) continue
    if (!èLoStessoPaper(f, letto.testo)) {
      scartatoPerTitolo = true
      continue
    }
    useStudio.getState().aggiornaFonte(fonteId, {
      testo: letto.testo,
      pagine: letto.pagine.length ? letto.pagine : undefined,
      testoCompleto: true,
      oaUrl: url,
      paginaIniziale: f.paginaIniziale ?? primaPagina ?? 1,
    })
    logOk('bibliotecario', `Testo completo di "${f.titolo}" ${conApi ? 'letto tramite l\'API' : 'scaricato dal browser'}: ${letto.pagine.length || 'senza'} pagine.`)
    return { ok: true, via: conApi ? 'api' : 'browser', pagine: letto.pagine.length, url }
  }
  return { ok: false, motivo: scartatoPerTitolo ? 'non_corrisponde' : 'bloccato', indirizzi: elenco }
}

/** Prova nel browser, gratis, per tutte le fonti che potrebbero avere il testo completo. */
export async function recuperaTuttiNelBrowser(suAvanzamento: (fatte: number, totale: number) => void): Promise<{ riusciti: number; daApi: string[] }> {
  const candidate = useStudio.getState().progetto.fonti.filter(puòAvereTestoCompleto)
  let riusciti = 0
  const daApi: string[] = []
  for (const [i, f] of candidate.entries()) {
    suAvanzamento(i, candidate.length)
    const esito = await recuperaTestoCompleto(f.id)
    if (esito.ok) riusciti += 1
    else if (esito.motivo === 'bloccato') daApi.push(f.id)
  }
  suAvanzamento(candidate.length, candidate.length)
  return { riusciti, daApi }
}
