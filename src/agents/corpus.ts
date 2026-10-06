import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import urlWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { del, get, set as idbSet } from 'idb-keyval'
import type { Passaggio } from '../types'

/**
 * Corpus del materiale del corso.
 *
 * Con molti PDF non è possibile (né conveniente) mandare tutto a ogni chiamata:
 * il testo viene estratto una volta nel browser, diviso in passaggi con file e
 * pagine, salvato in IndexedDB e, a ogni chiamata, si inviano solo i passaggi
 * più pertinenti entro un budget. La build "legacy" di pdf.js è la più
 * compatibile con i Safari di iPad meno recenti.
 */

pdfjs.GlobalWorkerOptions.workerSrc = urlWorker

/**
 * Un solo worker per tutta la sessione: se ogni documento ne creasse e
 * distruggesse uno, con molti PDF in fila l'estrazione può bloccarsi.
 */
let workerCondiviso: pdfjs.PDFWorker | null = null
function worker(): pdfjs.PDFWorker {
  if (!workerCondiviso || workerCondiviso.destroyed) workerCondiviso = new pdfjs.PDFWorker()
  return workerCondiviso
}

const CHIAVE_IDB = 'studio-tesi-corpus'
const LUNGHEZZA_PASSAGGIO = 1600
const SOVRAPPOSIZIONE = 200
/** Sotto questa media di caratteri per pagina il PDF è considerato scansionato. */
const SOGLIA_SCANSIONE = 80

/** Caratteri di materiale del corso inviati al Lettore per il quadro teorico. */
export const BUDGET_LETTORE = 200_000

// ---------------------------------------------------------------------------
// Estrazione
// ---------------------------------------------------------------------------

export interface EsitoEstrazione {
  pagine: string[]
  scansionato: boolean
}

/** Estrae il testo pagina per pagina, segnalando l'avanzamento. */
export async function estraiPdf(
  dati: ArrayBuffer,
  suPagina?: (corrente: number, totale: number) => void,
  maxPagine = Infinity,
): Promise<EsitoEstrazione> {
  // pdf.js trasferisce il buffer al worker: si passa una copia.
  const caricamento = pdfjs.getDocument({ data: new Uint8Array(dati.slice(0)), worker: worker() })
  const documento = await caricamento.promise
  const totale = Math.min(documento.numPages, maxPagine)
  const pagine: string[] = []

  try {
    for (let n = 1; n <= totale; n++) {
      const pagina = await documento.getPage(n)
      const contenuto = await pagina.getTextContent()
      let testo = ''
      for (const voce of contenuto.items) {
        if (!('str' in voce)) continue
        testo += voce.str
        testo += voce.hasEOL ? '\n' : ' '
      }
      pagine.push(testo.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())
      pagina.cleanup()
      suPagina?.(n, totale)
    }
  } finally {
    await caricamento.destroy()
  }

  const caratteri = pagine.reduce((s, p) => s + p.length, 0)
  return { pagine, scansionato: pagine.length > 0 && caratteri / pagine.length < SOGLIA_SCANSIONE }
}

/** Testo di un PDF arrivato in base64 (per esempio da web_fetch). */
export async function testoDaPdfBase64(base64: string, maxPagine = 40): Promise<string> {
  const binario = atob(base64)
  const byte = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i)
  const { pagine } = await estraiPdf(byte.buffer, undefined, maxPagine)
  return pagine.join('\n')
}

/** I file di testo vengono trattati come pagine da circa 3000 caratteri. */
export function pagineDaTesto(testo: string): string[] {
  const pulito = testo.replace(/\r/g, '').trim()
  const pagine: string[] = []
  for (let i = 0; i < pulito.length; i += 3000) pagine.push(pulito.slice(i, i + 3000))
  return pagine
}

export function arrayBufferInBase64(buffer: ArrayBuffer): string {
  const byte = new Uint8Array(buffer)
  let binario = ''
  const blocco = 0x8000
  for (let i = 0; i < byte.length; i += blocco) {
    binario += String.fromCharCode(...byte.subarray(i, i + blocco))
  }
  return btoa(binario)
}

/** Divide le pagine in passaggi sovrapposti, ricordando le pagine di ciascuno. */
export function suddividi(fileId: string, nomeFile: string, pagine: string[]): Passaggio[] {
  const passaggi: Passaggio[] = []
  let buffer = ''
  let primaPagina = 1
  let ultimaPagina = 1

  const chiudi = () => {
    const testo = buffer.trim()
    if (testo.length < 40) return
    passaggi.push({
      id: `${fileId}#${passaggi.length}`,
      fileId,
      file: nomeFile,
      pagine: [primaPagina, ultimaPagina],
      testo,
    })
  }

  pagine.forEach((testoPagina, indice) => {
    const numero = indice + 1
    if (!testoPagina.trim()) return
    if (!buffer) primaPagina = numero
    buffer += (buffer ? '\n' : '') + testoPagina
    ultimaPagina = numero

    while (buffer.length >= LUNGHEZZA_PASSAGGIO) {
      // Taglio preferibilmente a fine frase, per non spezzare le definizioni.
      let taglio = buffer.lastIndexOf('. ', LUNGHEZZA_PASSAGGIO)
      if (taglio < LUNGHEZZA_PASSAGGIO * 0.6) taglio = LUNGHEZZA_PASSAGGIO
      const resto = buffer.slice(Math.max(0, taglio - SOVRAPPOSIZIONE))
      buffer = buffer.slice(0, taglio + 1)
      chiudi()
      buffer = resto
      primaPagina = numero
    }
  })

  chiudi()
  return passaggi
}

// ---------------------------------------------------------------------------
// Memoria e persistenza
// ---------------------------------------------------------------------------

const corpus = new Map<string, Passaggio[]>()
let indice: IndiceBm25 | null = null

async function salvaSuDisco() {
  const oggetto: Record<string, Passaggio[]> = {}
  for (const [id, passaggi] of corpus) oggetto[id] = passaggi
  await idbSet(CHIAVE_IDB, oggetto)
}

/** Carica il corpus salvato e restituisce gli id dei file presenti. */
export async function caricaCorpus(): Promise<Set<string>> {
  const salvato = (await get<Record<string, Passaggio[]>>(CHIAVE_IDB)) ?? {}
  corpus.clear()
  for (const [id, passaggi] of Object.entries(salvato)) corpus.set(id, passaggi)
  indice = null
  return new Set(corpus.keys())
}

export async function aggiungiAlCorpus(fileId: string, passaggi: Passaggio[]) {
  corpus.set(fileId, passaggi)
  indice = null
  await salvaSuDisco()
}

export async function rimuoviDalCorpus(fileId: string) {
  if (!corpus.delete(fileId)) return
  indice = null
  await salvaSuDisco()
}

export async function svuotaCorpus() {
  corpus.clear()
  indice = null
  await del(CHIAVE_IDB)
}

/** Tutto il corpus, per il file di progetto. */
export function esportaCorpus(): Record<string, Passaggio[]> {
  return Object.fromEntries(corpus)
}

/** Sostituisce il corpus con quello di un file di progetto. */
export async function importaCorpus(dati: Record<string, Passaggio[]>) {
  corpus.clear()
  for (const [id, passaggi] of Object.entries(dati)) corpus.set(id, passaggi)
  indice = null
  await salvaSuDisco()
}

/** Passaggi di un file, per l'anteprima e le citazioni dal corso. */
export function passaggiDi(fileId: string): Passaggio[] {
  return corpus.get(fileId) ?? []
}

export function haFile(fileId: string): boolean {
  return corpus.has(fileId)
}

export function statisticheCorpus(): { file: number; passaggi: number; caratteri: number } {
  let passaggi = 0
  let caratteri = 0
  for (const elenco of corpus.values()) {
    passaggi += elenco.length
    for (const p of elenco) caratteri += p.testo.length
  }
  return { file: corpus.size, passaggi, caratteri }
}

// ---------------------------------------------------------------------------
// Recupero dei passaggi pertinenti (BM25)
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

interface IndiceBm25 {
  passaggi: Passaggio[]
  frequenze: Map<string, number>[]
  lunghezze: number[]
  documentiPerTermine: Map<string, number>
  lunghezzaMedia: number
}

function costruisciIndice(): IndiceBm25 {
  const passaggi = [...corpus.values()].flat()
  const frequenze: Map<string, number>[] = []
  const lunghezze: number[] = []
  const documentiPerTermine = new Map<string, number>()

  for (const p of passaggi) {
    const conteggi = new Map<string, number>()
    const token = tokenizza(p.testo)
    for (const t of token) conteggi.set(t, (conteggi.get(t) ?? 0) + 1)
    for (const t of conteggi.keys()) documentiPerTermine.set(t, (documentiPerTermine.get(t) ?? 0) + 1)
    frequenze.push(conteggi)
    lunghezze.push(token.length)
  }

  const lunghezzaMedia = lunghezze.reduce((s, l) => s + l, 0) / Math.max(1, lunghezze.length)
  return { passaggi, frequenze, lunghezze, documentiPerTermine, lunghezzaMedia }
}

function punteggi(domanda: string): { passaggio: Passaggio; punteggio: number }[] {
  if (!indice) indice = costruisciIndice()
  const { passaggi, frequenze, lunghezze, documentiPerTermine, lunghezzaMedia } = indice
  const termini = [...new Set(tokenizza(domanda))]
  const n = passaggi.length
  const k1 = 1.4
  const b = 0.75

  return passaggi.map((passaggio, i) => {
    let punteggio = 0
    for (const t of termini) {
      const f = frequenze[i].get(t)
      if (!f) continue
      const df = documentiPerTermine.get(t) ?? 0
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
      punteggio += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * lunghezze[i]) / lunghezzaMedia))
    }
    return { passaggio, punteggio }
  })
}

/**
 * Seleziona i passaggi più pertinenti a una o più domande entro un budget di
 * caratteri. Con più domande (per esempio una per sezione della scaletta) i
 * risultati si alternano, così ogni sezione ha il suo materiale. Se tutto il
 * corpus sta nel budget, si manda tutto.
 */
export function recuperaPassaggi(domande: string[], budget: number): Passaggio[] {
  const tutti = [...corpus.values()].flat()
  const totale = tutti.reduce((s, p) => s + p.testo.length, 0)
  if (totale <= budget) return ordina(tutti)

  const classifiche = domande
    .filter((d) => d.trim())
    .map((d) =>
      punteggi(d)
        .filter((x) => x.punteggio > 0)
        .sort((a, b) => b.punteggio - a.punteggio)
        .map((x) => x.passaggio),
    )

  const scelti = new Map<string, Passaggio>()
  let usati = 0
  let giro = 0
  let aggiunto = true

  while (aggiunto && usati < budget) {
    aggiunto = false
    for (const classifica of classifiche) {
      const candidato = classifica[giro]
      if (!candidato || scelti.has(candidato.id)) continue
      if (usati + candidato.testo.length > budget) continue
      scelti.set(candidato.id, candidato)
      usati += candidato.testo.length
      aggiunto = true
    }
    giro += 1
    if (classifiche.every((c) => giro >= c.length)) break
  }

  return ordina([...scelti.values()])
}

/** I passaggi più pertinenti a una domanda, in ordine di pertinenza. */
export function cercaPassaggi(domanda: string, quanti = 6): Passaggio[] {
  if (corpus.size === 0 || !domanda.trim()) return []
  return punteggi(domanda)
    .filter((x) => x.punteggio > 0)
    .sort((a, b) => b.punteggio - a.punteggio)
    .slice(0, quanti)
    .map((x) => x.passaggio)
}

/** Ordine di lettura naturale: per file, poi per pagina. */
function ordina(passaggi: Passaggio[]): Passaggio[] {
  return [...passaggi].sort((a, b) =>
    a.file === b.file ? a.pagine[0] - b.pagine[0] : a.file.localeCompare(b.file),
  )
}

export function collocazione(p: Passaggio): string {
  const [da, a] = p.pagine
  return `${p.file}, ${da === a ? `p. ${da}` : `pp. ${da}–${a}`}`
}
