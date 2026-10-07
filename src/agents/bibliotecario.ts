import { create } from 'zustand'
import { DOMINI_ISTITUZIONALI } from '../domain/dominio'
import { adesso, nuovoId } from '../domain/progettoIniziale'
import { giàInBiblioteca, useStudio } from '../store'
import type {
  Candidato,
  Consegna,
  EstrattoVerificato,
  Fonte,
  FonteEsclusa,
  RegistroRicerca,
  TemaFonte,
} from '../types'
import {
  ApiError,
  WEB_FETCH_TOOL,
  WEB_SEARCH_TOOL,
  chiamataConStrumenti,
  chiamataStrutturata,
  creaClient,
  type Messaggio,
} from './api'
import { CATALOGHI, CERCA, unisci, type Catalogo, type RisultatoCatalogo } from './cataloghi'
import { verificaEstratto } from './citations'
import { testoDaPdfBase64 } from './corpus'
import { stimaChiamata, type Stima } from './costs'
import { SYSTEM_BIBLIOTECARIO, intestazioneProgetto, quadroTestuale } from './prompts'
import { SCHEMA_PIANO, SCHEMA_SELEZIONE, TOOL_CONSEGNA_FONTI } from './schemas'
import { logAvviso, logInfo, logOk, sorveglia } from './supervisor'
import { normalizzaUrl, raccogliRicerca, verificaFonti } from './verifyUrls'

// ---------------------------------------------------------------------------
// Avanzamento (non persistito)
// ---------------------------------------------------------------------------

export type StatoPasso = 'attesa' | 'corso' | 'ok' | 'avviso' | 'errore' | 'saltato'

export interface Passo {
  id: 'piano' | 'cataloghi' | 'istituzionali' | 'web' | 'selezione'
  titolo: string
  stato: StatoPasso
  dettaglio: string
}

interface StatoRicerca {
  passi: Passo[]
  inCorso: boolean
  errore: string | null
}

export const useRicerca = create<StatoRicerca>(() => ({ passi: [], inCorso: false, errore: null }))

function passo(id: Passo['id'], stato: StatoPasso, dettaglio = '') {
  useRicerca.setState((s) => ({ passi: s.passi.map((p) => (p.id === id ? { ...p, stato, dettaglio } : p)) }))
}

// ---------------------------------------------------------------------------
// Opzioni e stima
// ---------------------------------------------------------------------------

export interface OpzioniRicerca {
  cataloghi: boolean
  istituzionali: boolean
  web: boolean
}

const MAX_RICERCHE_WEB = 4
const MAX_PAGINE_WEB = 4
const MAX_CANDIDATI_CATALOGO = 36
const MAX_TESTO_PAGINA = 120_000

/** Stima prudente di una ricerca completa, prima di avviarla. */
export function stimaRicerca(opzioni: OpzioniRicerca): Stima {
  const { modelli } = useStudio.getState().preferenze
  const parti: Stima[] = [stimaChiamata(modelli.bibliotecario, { input: 6000, output: 900 })]
  const chiamateWeb = Number(opzioni.istituzionali) + Number(opzioni.web)
  for (let i = 0; i < chiamateWeb; i++) {
    parti.push(stimaChiamata(modelli.bibliotecario, { input: 70_000, output: 4500, ricerche: MAX_RICERCHE_WEB }))
  }
  parti.push(stimaChiamata(modelli.selezione, { input: 14_000, output: 3500 }))
  return parti.reduce((a, b) => ({ minimo: a.minimo + b.minimo, massimo: a.massimo + b.massimo }), { minimo: 0, massimo: 0 })
}

// ---------------------------------------------------------------------------
// Passi
// ---------------------------------------------------------------------------

interface Piano {
  query_cataloghi: string[]
  query_web: string[]
}

function contesto(): string {
  const p = useStudio.getState().progetto
  return `${intestazioneProgetto(p)}\n\nQUADRO TEORICO DEL CORSO:\n${quadroTestuale(p.quadro)}`
}

async function pianifica(domanda: string, signal: AbortSignal): Promise<Consegna<Piano>> {
  const s = useStudio.getState()
  const client = creaClient(s.apiKey)
  return sorveglia<Consegna<Piano>>({
    agente: 'bibliotecario',
    passo: 'Piano di ricerca',
    signal,
    esegui: (_t, suggerimento) =>
      chiamataStrutturata<Consegna<Piano>>({
        client,
        model: s.preferenze.modelli.bibliotecario,
        maxTokens: 2500,
        effort: 'low',
        signal,
        chi: 'bibliotecario',
        azione: 'ricerca: piano',
        system: [{ type: 'text', text: suggerimento ? `${SYSTEM_BIBLIOTECARIO}\n\n${suggerimento}` : SYSTEM_BIBLIOTECARIO }],
        messages: [
          {
            role: 'user',
            content: `${contesto()}\n\nDOMANDA DI RICERCA DELLO STUDENTE:\n"""\n${domanda}\n"""\n\nCOMPITO: prepara le query per i cataloghi accademici (in inglese, italiano e spagnolo) e per la ricerca web. Le query devono restare sul piano finanziario (ricavi, costi, prezzi, liquidità, rischio, copertura).`,
          },
        ],
        schema: SCHEMA_PIANO,
      }),
    valida: (d) =>
      Array.isArray(d?.risultato?.query_cataloghi) && d.risultato.query_cataloghi.length >= 2
        ? { ok: true }
        : { ok: false, suggerimento: 'Servono almeno 2 query per i cataloghi.' },
  })
}

function fonteDaCatalogo(r: RisultatoCatalogo): Fonte {
  return {
    id: nuovoId('fonte'),
    numero: 0, // assegnato quando entra in biblioteca
    tipo: 'catalogo',
    origine: r.origine,
    titolo: r.titolo,
    autori: r.autori,
    anno: r.anno,
    rivista: r.rivista,
    doi: r.doi,
    url: r.url,
    lingua: r.lingua,
    abstract: r.abstract,
    estratti: [],
    temi: [],
    stato: 'da_leggere',
    usataIn: [],
    scheda: null,
    // Per i paper dei cataloghi il testo disponibile è l'abstract, finché non carichi il PDF.
    testo: r.abstract,
    testoCompleto: false,
    aggiuntaIl: adesso(),
  }
}

async function cercaNeiCataloghi(query: string[], signal: AbortSignal) {
  const perCatalogo: Record<string, number | string> = {}
  const tutti: RisultatoCatalogo[] = []

  await Promise.all(
    CATALOGHI.map(async ({ key, nome }) => {
      let trovati = 0
      let ultimoErrore = ''
      for (const q of query.slice(0, 6)) {
        try {
          const r = await CERCA[key as Catalogo](q, 6, signal)
          trovati += r.length
          tutti.push(...r)
        } catch (err) {
          if (signal.aborted) throw err
          ultimoErrore = err instanceof Error ? err.message : 'errore'
          // Un catalogo che non risponde non blocca gli altri; dopo un 429 si smette.
          if (ultimoErrore.includes('429') || ultimoErrore.includes('non raggiungibile')) break
        }
        // Semantic Scholar senza chiave accetta circa una richiesta al secondo.
        if (key === 'semanticscholar') await new Promise((r) => setTimeout(r, 1100))
      }
      perCatalogo[nome] = trovati > 0 || !ultimoErrore ? trovati : ultimoErrore
    }),
  )

  const fonti = useStudio.getState().progetto.fonti
  const uniti = unisci(tutti)
    .filter((r) => !giàInBiblioteca(fonti, r))
    .sort((a, b) => Number(Boolean(b.abstract)) - Number(Boolean(a.abstract)))
    .slice(0, MAX_CANDIDATI_CATALOGO)
  return { uniti, perCatalogo }
}

interface FonteDichiarata {
  titolo: string
  url: string
  ente_o_autori: string
  anno: string
  descrizione: string
  perche_rilevante: string
  estratti: string[]
}

interface ConsegnaFonti {
  passaggi: string[]
  fonti: FonteDichiarata[]
  fonti_scartate: { titolo: string; url: string; motivo: string }[]
}

function normalizzaConsegna(grezza: unknown): ConsegnaFonti {
  const d = (grezza ?? {}) as Partial<ConsegnaFonti>
  return {
    passaggi: Array.isArray(d.passaggi) ? d.passaggi.filter((x) => typeof x === 'string') : [],
    fonti: (Array.isArray(d.fonti) ? d.fonti : []).filter((f) => f && typeof f.url === 'string').map((f) => ({
      ...f,
      estratti: Array.isArray(f.estratti) ? f.estratti.filter((e) => typeof e === 'string') : [],
    })),
    fonti_scartate: Array.isArray(d.fonti_scartate) ? d.fonti_scartate : [],
  }
}

/**
 * Ricerca web (istituzionale o generica): il modello cerca, legge le pagine e
 * consegna con il tool. In codice: ogni URL deve stare fra i risultati reali o
 * le pagine lette; ogni estratto deve comparire nel testo scaricato.
 */
async function cercaSulWeb(
  tipo: 'istituzionale' | 'web',
  domanda: string,
  queryWeb: string[],
  signal: AbortSignal,
): Promise<{ fonti: Fonte[]; esclusi: FonteEsclusa[]; passaggi: string[]; avvisi: string[] }> {
  const s = useStudio.getState()
  const client = creaClient(s.apiKey)
  const domini = tipo === 'istituzionale' ? { allowed_domains: DOMINI_ISTITUZIONALI } : {}
  const tools = [
    { ...WEB_SEARCH_TOOL, max_uses: MAX_RICERCHE_WEB, ...domini },
    { ...WEB_FETCH_TOOL, max_uses: MAX_PAGINE_WEB, max_content_tokens: 10_000, ...domini },
    TOOL_CONSEGNA_FONTI,
  ]
  const compito =
    tipo === 'istituzionale'
      ? `Cerca SOLO nei siti istituzionali consentiti (ISMEA, ISTAT, CREA-RICA, ARPACAL, Copernicus, Commissione europea e simili): dati su prezzi, costi, produzione per provincia, campagne olearie, serie meteo della Calabria, strumenti di gestione del rischio. Leggi con web_fetch le pagine più utili (al massimo ${MAX_PAGINE_WEB}).`
      : `Cerca sul web generico studi e rapporti (anche in spagnolo e inglese) su clima, meteo e conti economici delle imprese olivicole e dei frantoi. Escludi siti commerciali e pagine promozionali. Leggi con web_fetch le pagine più utili (al massimo ${MAX_PAGINE_WEB}).`

  const messaggi: Messaggio[] = [
    {
      role: 'user',
      content: `${contesto()}\n\nDOMANDA DI RICERCA:\n"""\n${domanda}\n"""\n\nQUERY SUGGERITE: ${queryWeb.join(' | ')}\n\nCOMPITO: ${compito}\nPer ogni fonte riporta da 2 a 4 frasi copiate alla lettera dalla pagina letta. Scarta le fonti prevalentemente contabili, giuridiche o agronomiche e dichiarale fra le scartate con il motivo. Alla fine chiama consegna_fonti: è l'unico modo di consegnare.`,
    },
  ]

  const base = {
    client,
    model: s.preferenze.modelli.bibliotecario,
    maxTokens: 12_000,
    effort: 'medium' as const,
    signal,
    chi: 'bibliotecario' as const,
    azione: tipo === 'istituzionale' ? 'ricerca: siti istituzionali' : 'ricerca: web',
    system: [{ type: 'text' as const, text: SYSTEM_BIBLIOTECARIO }],
    tools,
    nomeToolConsegna: TOOL_CONSEGNA_FONTI.name,
  }

  const primo = await chiamataConStrumenti({ ...base, messages: messaggi })
  let blocchi = primo.blocchi
  let grezza = primo.consegna
  if (!grezza) {
    // Niente tool_choice forzato (400 sui modelli recenti): si chiede esplicitamente la consegna.
    const secondo = await chiamataConStrumenti({
      ...base,
      messages: [
        ...primo.messaggi,
        {
          role: 'user',
          content:
            'Ora consegna il risultato chiamando consegna_fonti, senza fare altre ricerche: solo fonti trovate, URL esatti, estratti copiati alla lettera dalle pagine lette.',
        },
      ],
    })
    blocchi = [...blocchi, ...secondo.blocchi]
    grezza = secondo.consegna
  }
  if (!grezza) throw new ApiError('sconosciuto', 'Il Bibliotecario non ha consegnato le fonti nemmeno su richiesta esplicita.', null, true)

  const consegna = normalizzaConsegna(grezza)
  const raccolta = raccogliRicerca(blocchi)
  const { verificate, respinte } = verificaFonti(consegna.fonti, raccolta.risultati)

  const esclusi: FonteEsclusa[] = [
    ...respinte.map((f) => ({
      titolo: f.titolo || '(senza titolo)',
      url: f.url,
      motivo: 'URL non presente fra i risultati della ricerca né fra le pagine lette: escluso perché inventato o modificato.',
    })),
    ...consegna.fonti_scartate.map((f) => ({ titolo: f.titolo, url: f.url, motivo: `Scartata dal Bibliotecario: ${f.motivo}` })),
  ]

  const fonti: Fonte[] = []
  for (const f of verificate) {
    const pagina = raccolta.pagine.get(normalizzaUrl(f.url))
    let testo = pagina?.testo ?? ''
    if (!testo && pagina?.pdfBase64) {
      try {
        testo = await testoDaPdfBase64(pagina.pdfBase64)
      } catch {
        testo = ''
      }
    }
    // Estratti confrontati in codice con il testo scaricato: quelli non ritrovati si scartano.
    const estratti: EstrattoVerificato[] = []
    let scartati = 0
    for (const e of f.estratti) {
      const esito = testo ? verificaEstratto(e, testo) : 'non_trovato'
      if (esito === 'verificato' || esito === 'approssimato') estratti.push({ testo: e, esito })
      else scartati += 1
    }
    const anno = Number.parseInt(f.anno, 10)
    fonti.push({
      id: nuovoId('fonte'),
      numero: 0, // assegnato quando entra in biblioteca
      tipo,
      origine: tipo,
      titolo: f.titolo,
      autori: f.ente_o_autori ? f.ente_o_autori.split(/\s*[,;]\s*/).filter(Boolean) : [],
      anno: Number.isFinite(anno) && anno > 1900 ? anno : null,
      rivista: '',
      doi: '',
      url: f.url,
      lingua: '',
      abstract: `${f.descrizione}${f.perche_rilevante ? `\n\nRilevanza: ${f.perche_rilevante}` : ''}`,
      estratti,
      temi: [],
      stato: 'da_leggere',
      usataIn: [],
      scheda: null,
      testo: testo.slice(0, MAX_TESTO_PAGINA),
      testoCompleto: Boolean(testo),
      aggiuntaIl: adesso(),
    })
    if (scartati > 0) {
      esclusi.push({
        titolo: f.titolo,
        url: f.url,
        motivo: `${scartati} estratt${scartati === 1 ? 'o' : 'i'} non ritrovat${scartati === 1 ? 'o' : 'i'} nel testo della pagina: scartat${scartati === 1 ? 'o' : 'i'} (la fonte resta).`,
      })
    }
  }

  return { fonti, esclusi, passaggi: consegna.passaggi, avvisi: raccolta.errori }
}

interface Selezione {
  valutazioni: { id: string; decisione: 'tenere' | 'scartare'; pertinenza: 'alta' | 'media' | 'bassa'; temi: TemaFonte[]; motivo: string }[]
}

async function seleziona(domanda: string, candidati: Candidato[], signal: AbortSignal): Promise<Consegna<Selezione>> {
  const s = useStudio.getState()
  const client = creaClient(s.apiKey)
  const elenco = candidati
    .map((c, i) => {
      const f = c.fonte
      const testo = f.estratti.length ? f.estratti.map((e) => `"${e.testo}"`).join(' ') : f.abstract
      return [
        `[R${i + 1}] (${f.origine}) ${f.titolo}`,
        `   ${f.autori.slice(0, 4).join(', ') || 'autore n.d.'} · ${f.anno ?? 's.d.'}${f.rivista ? ` · ${f.rivista}` : ''}`,
        `   ${(testo || '(nessun abstract)').slice(0, 700)}`,
      ].join('\n')
    })
    .join('\n\n')

  return sorveglia<Consegna<Selezione>>({
    agente: 'bibliotecario',
    passo: 'Selezione dei risultati',
    signal,
    esegui: (_t, suggerimento) =>
      chiamataStrutturata<Consegna<Selezione>>({
        client,
        model: s.preferenze.modelli.selezione,
        maxTokens: 8000,
        effort: 'low',
        signal,
        chi: 'selezione',
        azione: 'ricerca: selezione',
        system: [{ type: 'text', text: suggerimento ? `${SYSTEM_BIBLIOTECARIO}\n\n${suggerimento}` : SYSTEM_BIBLIOTECARIO }],
        messages: [
          {
            role: 'user',
            content: `${contesto()}\n\nDOMANDA DI RICERCA:\n"""\n${domanda}\n"""\n\nRISULTATI DA VALUTARE (metadati reali dai cataloghi o pagine verificate):\n"""\n${elenco}\n"""\n\nCOMPITO: valuta OGNI risultato con il suo id. Tieni quelli utili a un'analisi finanziaria su più campagne; scarta quelli fuori tema o prevalentemente contabili, giuridici o agronomici, dicendo perché. Assegna i temi pertinenti.`,
          },
        ],
        schema: SCHEMA_SELEZIONE,
      }),
    valida: (d) =>
      Array.isArray(d?.risultato?.valutazioni) ? { ok: true } : { ok: false, suggerimento: 'Manca "valutazioni".' },
  })
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------

let controller: AbortController | null = null

export function annullaRicerca() {
  controller?.abort()
}

export async function avviaRicerca(domanda: string, opzioni: OpzioniRicerca): Promise<void> {
  if (useRicerca.getState().inCorso) return
  controller = new AbortController()
  const signal = controller.signal
  const st = useStudio.getState
  const ricercaId = nuovoId('ric')

  useRicerca.setState({
    inCorso: true,
    errore: null,
    passi: [
      { id: 'piano', titolo: 'Piano di ricerca', stato: 'attesa', dettaglio: '' },
      { id: 'cataloghi', titolo: 'Cataloghi accademici', stato: opzioni.cataloghi ? 'attesa' : 'saltato', dettaglio: '' },
      { id: 'istituzionali', titolo: 'Siti istituzionali', stato: opzioni.istituzionali ? 'attesa' : 'saltato', dettaglio: '' },
      { id: 'web', titolo: 'Web generico', stato: opzioni.web ? 'attesa' : 'saltato', dettaglio: '' },
      { id: 'selezione', titolo: 'Selezione', stato: 'attesa', dettaglio: '' },
    ],
  })
  st().patchAgente('bibliotecario', { status: 'lavoro', etichetta: 'preparo le query…', errore: null })

  const esclusi: FonteEsclusa[] = []
  const passaggi: string[] = []
  let candidati: Candidato[] = []
  let perCatalogo: Record<string, number | string> = {}
  let query: string[] = []

  try {
    passo('piano', 'corso')
    const piano = await pianifica(domanda, signal)
    query = piano.risultato.query_cataloghi
    passaggi.push(...piano.passaggi)
    passo('piano', 'ok', [...piano.risultato.query_cataloghi, ...piano.risultato.query_web].join(' · '))

    if (opzioni.cataloghi) {
      passo('cataloghi', 'corso')
      st().patchAgente('bibliotecario', { etichetta: 'consulto i cataloghi…' })
      const esito = await cercaNeiCataloghi(piano.risultato.query_cataloghi, signal)
      perCatalogo = esito.perCatalogo
      candidati.push(
        ...esito.uniti.map((r) => ({ id: nuovoId('cand'), ricercaId, fonte: fonteDaCatalogo(r), verifica: 'catalogo' as const, estrattiScartati: 0, consiglio: null })),
      )
      const errori = Object.entries(perCatalogo).filter(([, v]) => typeof v === 'string')
      passo(
        'cataloghi',
        esito.uniti.length === 0 ? 'avviso' : errori.length ? 'avviso' : 'ok',
        `${Object.entries(perCatalogo).map(([k, v]) => `${k}: ${typeof v === 'number' ? `${v} risultati` : v}`).join(' · ')} → ${esito.uniti.length} nuovi senza doppioni`,
      )
    }

    for (const tipo of ['istituzionali', 'web'] as const) {
      if (!opzioni[tipo]) continue
      passo(tipo, 'corso')
      st().patchAgente('bibliotecario', { etichetta: tipo === 'istituzionali' ? 'cerco nei siti istituzionali…' : 'cerco sul web…' })
      try {
        const r = await cercaSulWeb(tipo === 'istituzionali' ? 'istituzionale' : 'web', domanda, piano.risultato.query_web, signal)
        const nuove = r.fonti.filter((f) => !giàInBiblioteca(st().progetto.fonti, f) && !giàInBiblioteca(candidati.map((c) => c.fonte), f))
        candidati.push(
          ...nuove.map((f) => ({ id: nuovoId('cand'), ricercaId, fonte: f, verifica: 'url_verificato' as const, estrattiScartati: 0, consiglio: null })),
        )
        esclusi.push(...r.esclusi)
        passaggi.push(...r.passaggi)
        const inventati = r.esclusi.filter((e) => e.motivo.startsWith('URL non presente')).length
        passo(
          tipo,
          r.avvisi.length || inventati ? 'avviso' : 'ok',
          [`${nuove.length} fonti con URL verificato`, inventati ? `${inventati} escluse per URL inventato` : '', ...r.avvisi].filter(Boolean).join(' · '),
        )
      } catch (err) {
        if (signal.aborted) throw err
        const msg = err instanceof Error ? err.message : 'errore'
        passo(tipo, 'errore', msg)
        logAvviso('bibliotecario', `${tipo}: ${msg}`)
        // Un errore non ritentabile (chiave, richiesta) ferma tutta la ricerca.
        if (err instanceof ApiError && !err.ritentabile && err.kind !== 'sconosciuto') throw err
      }
    }

    if (candidati.length > 0) {
      passo('selezione', 'corso')
      st().patchAgente('bibliotecario', { etichetta: 'seleziono i risultati…' })
      try {
        const sel = await seleziona(domanda, candidati, signal)
        passaggi.push(...sel.passaggi)
        const perId = new Map(sel.risultato.valutazioni.map((v) => [v.id.trim().toUpperCase(), v]))
        candidati = candidati.map((c, i) => {
          const v = perId.get(`R${i + 1}`)
          if (!v) return c
          return {
            ...c,
            consiglio: { decisione: v.decisione, pertinenza: v.pertinenza, motivo: v.motivo },
            fonte: { ...c.fonte, temi: [...new Set(v.temi)] },
          }
        })
        const tenuti = candidati.filter((c) => c.consiglio?.decisione === 'tenere').length
        passo('selezione', 'ok', `${tenuti} consigliati su ${candidati.length}`)
      } catch (err) {
        if (signal.aborted) throw err
        passo('selezione', 'errore', `${err instanceof Error ? err.message : 'errore'} — i risultati restano da valutare a mano.`)
      }
    } else {
      passo('selezione', 'saltato', 'nessun risultato da selezionare')
    }

    // Prima i consigliati e i più pertinenti.
    const ordine = { alta: 0, media: 1, bassa: 2 }
    candidati.sort(
      (a, b) =>
        Number(b.consiglio?.decisione === 'tenere') - Number(a.consiglio?.decisione === 'tenere') ||
        ordine[a.consiglio?.pertinenza ?? 'bassa'] - ordine[b.consiglio?.pertinenza ?? 'bassa'],
    )

    const registro: RegistroRicerca = {
      id: ricercaId,
      domanda,
      data: adesso(),
      query,
      perCatalogo,
      trovati: candidati.length,
      esclusi,
      passaggi,
    }
    st().registraRicerca(registro, candidati)
    st().patchAgente('bibliotecario', {
      status: candidati.length ? 'attesa' : 'fatto',
      etichetta: candidati.length ? `${candidati.length} risultati da approvare` : 'nessun risultato nuovo',
      passaggi: passaggi.slice(0, 8),
      errore: null,
    })
    logOk('bibliotecario', `Ricerca conclusa: ${candidati.length} risultati da approvare, ${esclusi.length} segnalazioni.`)
  } catch (err) {
    const annullata = signal.aborted
    const msg = annullata ? 'Ricerca fermata.' : err instanceof Error ? err.message : 'Errore sconosciuto.'
    useRicerca.setState((s) => ({
      errore: annullata ? null : msg,
      passi: s.passi.map((p) => (p.stato === 'corso' || p.stato === 'attesa' ? { ...p, stato: 'saltato' as const } : p)),
    }))
    st().patchAgente('bibliotecario', {
      status: annullata ? 'riposo' : 'errore',
      etichetta: annullata ? 'fermato' : 'errore',
      errore: annullata ? null : msg,
    })
    if (!annullata) logInfo('bibliotecario', msg)
  } finally {
    useRicerca.setState({ inCorso: false })
    controller = null
  }
}
