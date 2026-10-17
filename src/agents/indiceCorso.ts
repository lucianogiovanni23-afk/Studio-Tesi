import type { Passaggio } from '../types'

/**
 * Indice di ricerca (BM25) del materiale del corso, in una forma compatta che
 * si salva in IndexedDB e si ricarica in un attimo: con 50 PDF non serve più
 * rileggere tutto il testo a ogni avvio. Funzioni pure, senza DOM né store:
 * le usano sia il lavoratore in sottofondo sia la pagina (se il lavoratore non
 * parte). I risultati sono identici a quelli dell'indice ricostruito ogni volta.
 */

/** Cambia se cambia la forma dell'indice o la tokenizzazione: l'indice salvato si rifà. */
export const FORMATO_INDICE = 1
export const CHIAVE_INDICE = 'studio-tesi-indice-corso'
export const CHIAVE_CORPUS = 'studio-tesi-corpus'
/** Impronte dei file del corso, nell'ordine del corpus: [id, impronta][]. */
export const CHIAVE_FIRME = 'studio-tesi-corpus-firme'

// ---------------------------------------------------------------------------
// Impronte
// ---------------------------------------------------------------------------

/** Impronta a 53 bit (cyrb53) calcolata a pezzi, senza unire stringhe enormi. */
export class Impronta {
  private h1 = 0xdeadbeef
  private h2 = 0x41c6ce57
  private lunghezza = 0

  aggiungi(testo: string): this {
    let h1 = this.h1
    let h2 = this.h2
    for (let i = 0; i < testo.length; i++) {
      const c = testo.charCodeAt(i)
      h1 = Math.imul(h1 ^ c, 2654435761)
      h2 = Math.imul(h2 ^ c, 1597334677)
    }
    // Un separatore, così "ab"+"c" e "a"+"bc" danno impronte diverse.
    h1 = Math.imul(h1 ^ 0x1f, 2654435761)
    h2 = Math.imul(h2 ^ 0x1f, 1597334677)
    this.h1 = h1
    this.h2 = h2
    this.lunghezza += testo.length + 1
    return this
  }

  valore(): string {
    let h1 = this.h1
    let h2 = this.h2
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return `${this.lunghezza.toString(36)}-${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`
  }
}

/** Impronta dei passaggi di un file: cambia se cambia qualsiasi testo, pagina o nome. */
export function improntaFile(passaggi: Passaggio[]): string {
  const h = new Impronta()
  for (const p of passaggi) h.aggiungi(p.id).aggiungi(p.file).aggiungi(`${p.pagine[0]}-${p.pagine[1]}`).aggiungi(p.testo).aggiungi(p.ocr ? 'o' : '')
  return h.valore()
}

/** Impronta di tutto il corpus, dall'elenco ordinato delle impronte dei file. */
export function improntaCorpus(firme: [string, string][]): string {
  const h = new Impronta()
  for (const [id, f] of firme) h.aggiungi(id).aggiungi(f)
  return `c${FORMATO_INDICE}-${h.valore()}`
}

// ---------------------------------------------------------------------------
// Tokenizzazione (identica a quella di sempre)
// ---------------------------------------------------------------------------

const STOPWORD = new Set(
  (
    'il lo la i gli le un uno una di a da in con su per tra fra e ed o od ma se che chi cui non ne ci vi si ' +
    'del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei ' +
    'negli nelle col coi sul sullo sulla sui sugli sulle come anche quando dove quale quali questo questa questi ' +
    'queste quello quella quelli quelle essere e stato stata sono era erano sia siano ha hanno avere aveva più meno ' +
    'molto poco tutto tutti ogni altro altri altra altre suo sua suoi sue loro nostro nostra cosa tale tali quindi ' +
    'perché poiché infatti inoltre dunque però mentre già ancora sempre solo così the of and to in is for on with ' +
    'as by an be are this that from or at it its which'
  ).split(/\s+/),
)

const SUFFISSI = ['amento', 'amenti', 'azione', 'azioni', 'mente', 'ità', 'ivo', 'iva', 'ivi', 'ive', 'ale', 'ali', 'are', 'ere', 'ire', 'ato', 'ata', 'ati', 'ate', 'ing', 'ies', 'es', 's']

/** Tokenizzazione con radice approssimata: "stagionale" e "stagionalità" si incontrano. */
export function tokenizza(testo: string): string[] {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORD.has(t))
    .map((t) => {
      for (const s of SUFFISSI) {
        if (t.length > s.length + 3 && t.endsWith(s)) return t.slice(0, -s.length)
      }
      return t.length > 5 ? t.slice(0, -1) : t
    })
}

// ---------------------------------------------------------------------------
// Indice compatto (liste invertite)
// ---------------------------------------------------------------------------

export interface IndiceCompatto {
  formato: number
  /** Impronta del corpus da cui è fatto. */
  firma: string
  /** File nell'ordine del corpus, con l'impronta e quanti passaggi hanno. */
  file: { id: string; firma: string; passaggi: number }[]
  /** Numero di passaggi. */
  n: number
  termini: string[]
  /** Per ogni termine, dove iniziano le sue voci in `documenti` / `frequenze` (lunghezza termini+1). */
  inizio: Uint32Array
  documenti: Uint32Array
  frequenze: Uint32Array
  /** Parole (token) di ogni passaggio. */
  lunghezze: Uint32Array
  lunghezzaMedia: number
}

/** Conteggi dei termini di un passaggio. */
type Conteggi = Map<string, number>

function conteggiDi(testo: string): { conteggi: Conteggi; lunghezza: number } {
  const conteggi: Conteggi = new Map()
  const token = tokenizza(testo)
  for (const t of token) conteggi.set(t, (conteggi.get(t) ?? 0) + 1)
  return { conteggi, lunghezza: token.length }
}

/** I conteggi di ogni passaggio di un indice esistente, per riusarli senza ritokenizzare. */
function conteggiDaIndice(ind: IndiceCompatto): Conteggi[] {
  const per: Conteggi[] = Array.from({ length: ind.n }, () => new Map())
  for (let t = 0; t < ind.termini.length; t++) {
    const termine = ind.termini[t]
    for (let k = ind.inizio[t]; k < ind.inizio[t + 1]; k++) per[ind.documenti[k]].set(termine, ind.frequenze[k])
  }
  return per
}

export interface EsitoCostruzione {
  indice: IndiceCompatto
  /** File letti di nuovo (gli altri sono stati ripresi dall'indice precedente). */
  tokenizzati: number
  riusati: number
}

/**
 * Costruisce l'indice del corpus. Se c'è un indice precedente, i file con la
 * stessa impronta non si rileggono: si riprendono i loro conteggi.
 */
export function costruisciIndice(
  ordine: [string, string][],
  passaggiDi: (id: string) => Passaggio[] | undefined,
  precedente?: IndiceCompatto | null,
): EsitoCostruzione {
  const firma = improntaCorpus(ordine)
  const vecchi = new Map<string, { da: number; quanti: number }>()
  let conteggiVecchi: Conteggi[] | null = null
  if (precedente && precedente.formato === FORMATO_INDICE) {
    let da = 0
    for (const f of precedente.file) {
      vecchi.set(`${f.id}\u0000${f.firma}`, { da, quanti: f.passaggi })
      da += f.passaggi
    }
  }

  const perPassaggio: Conteggi[] = []
  const lunghezze: number[] = []
  const file: IndiceCompatto['file'] = []
  let tokenizzati = 0
  let riusati = 0
  for (const [id, f] of ordine) {
    const passaggi = passaggiDi(id) ?? []
    const vecchio = vecchi.get(`${id}\u0000${f}`)
    if (vecchio && vecchio.quanti === passaggi.length && precedente) {
      conteggiVecchi ??= conteggiDaIndice(precedente)
      for (let i = 0; i < vecchio.quanti; i++) {
        perPassaggio.push(conteggiVecchi[vecchio.da + i])
        lunghezze.push(precedente.lunghezze[vecchio.da + i])
      }
      riusati += 1
    } else {
      for (const p of passaggi) {
        const { conteggi, lunghezza } = conteggiDi(p.testo)
        perPassaggio.push(conteggi)
        lunghezze.push(lunghezza)
      }
      tokenizzati += 1
    }
    file.push({ id, firma: f, passaggi: passaggi.length })
  }
  return { indice: compatta(firma, file, perPassaggio, lunghezze), tokenizzati, riusati }
}

function compatta(firma: string, file: IndiceCompatto['file'], perPassaggio: Conteggi[], lunghezze: number[]): IndiceCompatto {
  const posizione = new Map<string, number>()
  const termini: string[] = []
  const quanti: number[] = []
  for (const c of perPassaggio) {
    for (const t of c.keys()) {
      let id = posizione.get(t)
      if (id === undefined) {
        id = termini.length
        posizione.set(t, id)
        termini.push(t)
        quanti.push(0)
      }
      quanti[id] += 1
    }
  }
  const inizio = new Uint32Array(termini.length + 1)
  for (let t = 0; t < termini.length; t++) inizio[t + 1] = inizio[t] + quanti[t]
  const totale = inizio[termini.length]
  const documenti = new Uint32Array(totale)
  const frequenze = new Uint32Array(totale)
  const cursore = inizio.slice(0, termini.length)
  // I passaggi si visitano in ordine: ogni lista resta ordinata per passaggio.
  perPassaggio.forEach((c, i) => {
    for (const [t, f] of c) {
      const id = posizione.get(t)!
      const k = cursore[id]++
      documenti[k] = i
      frequenze[k] = f
    }
  })
  const lung = Uint32Array.from(lunghezze)
  const lunghezzaMedia = lunghezze.reduce((s, l) => s + l, 0) / Math.max(1, lunghezze.length)
  return { formato: FORMATO_INDICE, firma, file, n: perPassaggio.length, termini, inizio, documenti, frequenze, lunghezze: lung, lunghezzaMedia }
}

/** Un indice letto da IndexedDB è utilizzabile? */
export function indiceValido(x: unknown, firma: string): x is IndiceCompatto {
  const i = x as IndiceCompatto | null | undefined
  return Boolean(
    i &&
      i.formato === FORMATO_INDICE &&
      i.firma === firma &&
      Array.isArray(i.termini) &&
      i.inizio instanceof Uint32Array &&
      i.documenti instanceof Uint32Array &&
      i.frequenze instanceof Uint32Array &&
      i.lunghezze instanceof Uint32Array &&
      i.inizio.length === i.termini.length + 1 &&
      i.lunghezze.length === i.n,
  )
}

// ---------------------------------------------------------------------------
// Ricerca
// ---------------------------------------------------------------------------

/** Mappa termine → posizione, costruita una volta per indice. */
const posizioni = new WeakMap<IndiceCompatto, Map<string, number>>()

function posizioneDi(ind: IndiceCompatto): Map<string, number> {
  let m = posizioni.get(ind)
  if (!m) {
    m = new Map(ind.termini.map((t, i) => [t, i]))
    posizioni.set(ind, m)
  }
  return m
}

/**
 * I passaggi con punteggio positivo, dal più pertinente; a pari punteggio
 * nell'ordine del corpus. Stessa formula e stesso ordine delle somme
 * dell'indice ricostruito ogni volta, quindi stessi numeri.
 */
export function classifica(ind: IndiceCompatto, domanda: string): Uint32Array {
  const termini = [...new Set(tokenizza(domanda))]
  const n = ind.n
  const k1 = 1.4
  const b = 0.75
  const punteggio = new Float64Array(n)
  const mappa = posizioneDi(ind)
  for (const t of termini) {
    const id = mappa.get(t)
    if (id === undefined) continue
    const da = ind.inizio[id]
    const a = ind.inizio[id + 1]
    const df = a - da
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
    for (let k = da; k < a; k++) {
      const i = ind.documenti[k]
      const f = ind.frequenze[k]
      punteggio[i] += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * ind.lunghezze[i]) / ind.lunghezzaMedia))
    }
  }
  const scelti: number[] = []
  for (let i = 0; i < n; i++) if (punteggio[i] > 0) scelti.push(i)
  // sort è stabile: a parità resta l'ordine del corpus.
  scelti.sort((x, y) => punteggio[y] - punteggio[x])
  return Uint32Array.from(scelti)
}
