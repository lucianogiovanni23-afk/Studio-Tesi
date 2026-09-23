import type Anthropic from '@anthropic-ai/sdk'

/**
 * Verifica deterministica degli URL: fatta in codice, non affidata al modello.
 *
 * Raccoglie ogni URL realmente presente nei blocchi `web_search_tool_result`
 * della risposta (e nelle citazioni, che la ricerca web produce sempre) e
 * confronta con quanto il Ricercatore dichiara. Una fonte il cui URL non
 * compare in quell'elenco non è verificata e viene esclusa.
 */

export interface RisultatoReale {
  url: string
  titolo: string
}

export interface RaccoltaRicerca {
  risultati: RisultatoReale[]
  query: string[]
  /** Errori del tool, già tradotti. */
  errori: string[]
  /** true se il tool di ricerca è stato invocato almeno una volta. */
  usato: boolean
  /** true se una ricerca è andata a buon fine senza restituire risultati. */
  vuota: boolean
}

/** Codici d'errore documentati per il tool di ricerca web. */
function descriviErrore(codice: string): string {
  switch (codice) {
    case 'too_many_requests':
      return 'La ricerca web ha superato il limite di richieste (rate limit). Attendi qualche minuto.'
    case 'max_uses_exceeded':
      return 'La ricerca web ha esaurito il numero massimo di ricerche consentite per questa chiamata.'
    case 'query_too_long':
      return 'Una query di ricerca era troppo lunga: servono query più brevi.'
    case 'invalid_tool_input':
      return 'Una query inviata alla ricerca web non era valida.'
    case 'request_too_large':
      return 'La richiesta di ricerca era troppo grande, di solito per una lista di domini troppo lunga.'
    case 'unavailable':
      return 'La ricerca web è temporaneamente non disponibile.'
    default:
      return `La ricerca web ha restituito un errore (${codice}).`
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

interface BloccoRisultato {
  type: string
  content?: unknown
  input?: { query?: string }
  citations?: { url?: string; title?: string }[]
}

/**
 * Estrae dai blocchi della risposta gli URL realmente restituiti dal motore di
 * ricerca, le query eseguite e gli eventuali errori del tool.
 */
export function raccogliRicerca(blocchi: Anthropic.ContentBlock[]): RaccoltaRicerca {
  const perUrl = new Map<string, RisultatoReale>()
  const query: string[] = []
  const errori: string[] = []
  let usato = false
  let ricercheRiuscite = 0
  let risultatiTotali = 0

  for (const grezzo of blocchi as unknown as BloccoRisultato[]) {
    if (grezzo.type === 'server_tool_use') {
      usato = true
      const q = grezzo.input?.query
      if (typeof q === 'string' && q) query.push(q)
      continue
    }

    if (grezzo.type === 'web_search_tool_result') {
      usato = true
      const contenuto = grezzo.content

      // In caso d'errore `content` è un oggetto singolo, non un elenco.
      if (!Array.isArray(contenuto)) {
        const codice = (contenuto as { error_code?: string } | undefined)?.error_code
        if (codice) {
          const messaggio = descriviErrore(codice)
          if (!errori.includes(messaggio)) errori.push(messaggio)
        }
        continue
      }

      ricercheRiuscite += 1
      for (const voce of contenuto as { url?: string; title?: string }[]) {
        if (typeof voce?.url !== 'string' || !voce.url) continue
        risultatiTotali += 1
        const chiave = normalizzaUrl(voce.url)
        if (!perUrl.has(chiave)) perUrl.set(chiave, { url: voce.url, titolo: voce.title ?? voce.url })
      }
      continue
    }

    if (grezzo.type === 'text') {
      // La ricerca web produce sempre citazioni: anche quelle sono URL reali.
      for (const citazione of grezzo.citations ?? []) {
        if (typeof citazione?.url !== 'string' || !citazione.url) continue
        const chiave = normalizzaUrl(citazione.url)
        if (!perUrl.has(chiave)) {
          perUrl.set(chiave, { url: citazione.url, titolo: citazione.title ?? citazione.url })
        }
      }
    }
  }

  return {
    risultati: [...perUrl.values()],
    query,
    errori,
    usato,
    vuota: ricercheRiuscite > 0 && risultatiTotali === 0,
  }
}

export interface EsitoVerifica<T> {
  /** Fonti il cui URL compare davvero nei risultati della ricerca. */
  verificate: T[]
  /** Fonti scartate perché l'URL non risulta: potrebbero essere inventate. */
  respinte: T[]
}

/**
 * Tiene solo le voci il cui URL compare fra i risultati reali e, quando
 * possibile, sostituisce l'URL con quello esatto restituito dal motore.
 */
export function verificaFonti<T extends { url: string }>(
  fonti: T[],
  reali: RisultatoReale[],
): EsitoVerifica<T> {
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
