import type Anthropic from '@anthropic-ai/sdk'

/**
 * Verifica deterministica: fatta in codice, non affidata al modello.
 *
 * Raccoglie gli URL realmente restituiti dalla ricerca web, il testo delle
 * pagine effettivamente lette con web_fetch e i passi citati dalla ricerca.
 * Una fonte è verificata solo se il suo URL compare lì; un estratto è valido
 * solo se compare nel testo di quella pagina.
 */

export interface RisultatoReale {
  url: string
  titolo: string
}

export interface PaginaLetta {
  url: string
  /** Testo della pagina (HTML convertito in testo dall'API). */
  testo?: string
  /** PDF letti: arrivano in base64 e vanno estratti nel browser. */
  pdfBase64?: string
}

export interface RaccoltaRicerca {
  risultati: RisultatoReale[]
  query: string[]
  /** Pagine lette, per URL normalizzato. */
  pagine: Map<string, PaginaLetta>
  /** Passi citati dalla ricerca (cited_text), per URL normalizzato. */
  passiCitati: Map<string, string[]>
  errori: string[]
  /** true se la ricerca web è stata invocata almeno una volta. */
  usato: boolean
  /** true se una ricerca è andata a buon fine senza risultati. */
  vuota: boolean
}

function descriviErroreRicerca(codice: string): string {
  switch (codice) {
    case 'too_many_requests':
      return 'Troppe ricerche sul web in poco tempo. Aspetta qualche minuto.'
    case 'max_uses_exceeded':
      return 'Ho già fatto tutte le ricerche sul web che potevo per questa volta.'
    case 'query_too_long':
      return 'Una ricerca era troppo lunga: servono ricerche più corte.'
    case 'invalid_tool_input':
      return 'Una ricerca sul web era scritta male e non è partita.'
    case 'request_too_large':
      return 'La ricerca era troppo grande.'
    case 'unavailable':
      return 'In questo momento la ricerca sul web non funziona.'
    default:
      return `La ricerca sul web non ha funzionato (errore ${codice}).`
  }
}

function descriviErroreLettura(codice: string): string {
  switch (codice) {
    case 'url_not_accessible':
      return 'una pagina non si apriva'
    case 'url_not_allowed':
      return 'una pagina non si lascia leggere (il sito la blocca)'
    case 'url_not_in_prior_context':
      return "Claude ha provato ad aprire un link che non veniva dalla ricerca, e l'ho bloccato"
    case 'unsupported_content_type':
      return 'una pagina era in un formato che non so leggere'
    case 'too_many_requests':
      return 'troppe pagine aperte in poco tempo'
    case 'max_uses_exceeded':
      return 'ho già letto tutte le pagine che potevo'
    case 'url_too_long':
      return 'un link era troppo lungo'
    default:
      return `una pagina non si è aperta (errore ${codice})`
  }
}

/** Normalizza un URL per il confronto: senza schema, senza www, senza slash finale. */
export function normalizzaUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#]+$/, '')
}

interface BloccoGrezzo {
  type: string
  name?: string
  content?: unknown
  input?: { query?: string; url?: string }
  citations?: { url?: string; title?: string; cited_text?: string }[]
}

interface RisultatoLettura {
  type?: string
  error_code?: string
  url?: string
  content?: { type?: string; title?: string; source?: { type?: string; media_type?: string; data?: string } }
}

export function raccogliRicerca(blocchi: Anthropic.ContentBlock[]): RaccoltaRicerca {
  const perUrl = new Map<string, RisultatoReale>()
  const pagine = new Map<string, PaginaLetta>()
  const passiCitati = new Map<string, string[]>()
  const query: string[] = []
  const errori: string[] = []
  const erroriLettura = new Set<string>()
  let usato = false
  let ricercheRiuscite = 0
  let risultatiTotali = 0

  const aggiungiReale = (url: string, titolo?: string) => {
    const chiave = normalizzaUrl(url)
    if (!perUrl.has(chiave)) perUrl.set(chiave, { url, titolo: titolo ?? url })
  }

  for (const grezzo of blocchi as unknown as BloccoGrezzo[]) {
    if (grezzo.type === 'server_tool_use') {
      if (grezzo.name === 'web_search') {
        usato = true
        if (grezzo.input?.query) query.push(grezzo.input.query)
      }
      continue
    }

    if (grezzo.type === 'web_search_tool_result') {
      usato = true
      const contenuto = grezzo.content
      // In caso d'errore `content` è un oggetto singolo, non un elenco.
      if (!Array.isArray(contenuto)) {
        const codice = (contenuto as { error_code?: string } | undefined)?.error_code
        if (codice) {
          const messaggio = descriviErroreRicerca(codice)
          if (!errori.includes(messaggio)) errori.push(messaggio)
        }
        continue
      }
      ricercheRiuscite += 1
      for (const voce of contenuto as { url?: string; title?: string }[]) {
        if (typeof voce?.url !== 'string' || !voce.url) continue
        risultatiTotali += 1
        aggiungiReale(voce.url, voce.title)
      }
      continue
    }

    if (grezzo.type === 'web_fetch_tool_result') {
      const risultato = grezzo.content as RisultatoLettura | undefined
      if (!risultato || risultato.type === 'web_fetch_tool_result_error') {
        if (risultato?.error_code) erroriLettura.add(descriviErroreLettura(risultato.error_code))
        continue
      }
      if (typeof risultato.url !== 'string') continue
      // Una pagina scaricata davvero è, per definizione, un URL reale.
      aggiungiReale(risultato.url, risultato.content?.title)
      const sorgente = risultato.content?.source
      const pagina: PaginaLetta = { url: risultato.url }
      if (sorgente?.type === 'text' && typeof sorgente.data === 'string') pagina.testo = sorgente.data
      if (sorgente?.type === 'base64' && sorgente.media_type === 'application/pdf' && sorgente.data) {
        pagina.pdfBase64 = sorgente.data
      }
      pagine.set(normalizzaUrl(risultato.url), pagina)
      continue
    }

    if (grezzo.type === 'text') {
      for (const c of grezzo.citations ?? []) {
        if (typeof c?.url !== 'string' || !c.url) continue
        aggiungiReale(c.url, c.title)
        if (c.cited_text) {
          const chiave = normalizzaUrl(c.url)
          passiCitati.set(chiave, [...(passiCitati.get(chiave) ?? []), c.cited_text])
        }
      }
    }
  }

  for (const e of erroriLettura) errori.push(`Pagine web: ${e}.`)

  return {
    risultati: [...perUrl.values()],
    query,
    pagine,
    passiCitati,
    errori,
    usato,
    vuota: ricercheRiuscite > 0 && risultatiTotali === 0,
  }
}

export interface EsitoVerifica<T> {
  verificate: T[]
  respinte: T[]
}

/** Tiene solo le voci il cui URL compare fra i risultati reali. */
export function verificaFonti<T extends { url: string }>(fonti: T[], reali: RisultatoReale[]): EsitoVerifica<T> {
  const perUrl = new Map(reali.map((r) => [normalizzaUrl(r.url), r]))
  const verificate: T[] = []
  const respinte: T[] = []
  const viste = new Set<string>()

  for (const fonte of fonti) {
    if (typeof fonte?.url !== 'string' || !/^https?:\/\//i.test(fonte.url)) {
      respinte.push(fonte)
      continue
    }
    const chiave = normalizzaUrl(fonte.url)
    if (viste.has(chiave)) continue
    viste.add(chiave)
    const reale = perUrl.get(chiave)
    if (reale) verificate.push({ ...fonte, url: reale.url })
    else respinte.push(fonte)
  }

  return { verificate, respinte }
}
