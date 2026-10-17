import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs'
import './flussoIterabile'
import { delMany, get as getIdb, getMany, set as idbSet, setMany } from 'idb-keyval'
import {
  CHIAVE_CORPUS,
  CHIAVE_FIRME,
  CHIAVE_INDICE,
  classifica,
  costruisciIndice,
  improntaCorpus,
  improntaFile,
  indiceValido,
  tokenizza,
  type IndiceCompatto,
} from './indiceCorso'
import type { EsitoIndice } from './lavori'
import { chiedi } from './sottofondo'
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

/**
 * pdf.js pesa: si scarica solo quando serve leggere un PDF, non all'avvio
 * dell'app (conta soprattutto su iPad).
 */
let modulo: Promise<typeof PdfJs> | null = null
function pdfjs(): Promise<typeof PdfJs> {
  if (!modulo) {
    modulo = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('./pdfWorker?worker&url'),
    ]).then(([m, w]) => {
      m.GlobalWorkerOptions.workerSrc = w.default
      return m
    })
  }
  return modulo
}

/**
 * Un solo worker per tutta la sessione: se ogni documento ne creasse e
 * distruggesse uno, con molti PDF in fila l'estrazione può bloccarsi.
 */
let workerCondiviso: PdfJs.PDFWorker | null = null
function worker(m: typeof PdfJs): PdfJs.PDFWorker {
  if (!workerCondiviso || workerCondiviso.destroyed) workerCondiviso = new m.PDFWorker()
  return workerCondiviso
}

const CHIAVE_IDB = CHIAVE_CORPUS
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
  const m = await pdfjs()
  const caricamento = m.getDocument({ data: new Uint8Array(dati.slice(0)), worker: worker(m) })
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

/**
 * Apre un PDF con pdf.js (stesso worker condiviso dell'estrazione), per chi deve
 * disegnarne le pagine: la lettura delle immagini (OCR) dei PDF scansionati.
 */
export async function apriDocumentoPdf(dati: ArrayBuffer): Promise<{ documento: PdfJs.PDFDocumentProxy; chiudi: () => Promise<void> }> {
  const m = await pdfjs()
  const caricamento = m.getDocument({ data: new Uint8Array(dati.slice(0)), worker: worker(m) })
  const documento = await caricamento.promise
  return { documento, chiudi: () => caricamento.destroy() }
}

/** Testo di un PDF arrivato in base64 (per esempio da web_fetch). */
/** Pagine di un PDF arrivato in base64, una stringa per pagina. */
export async function pagineDaPdfBase64(base64: string, maxPagine = 150): Promise<string[]> {
  const binario = atob(base64)
  const byte = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i)
  return (await estraiPdf(byte.buffer, undefined, maxPagine)).pagine
}

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
/** Impronta del testo di ogni file: dice all'indice salvato se è ancora buono. */
const firme = new Map<string, string>()
/** Copia dell'indice nella pagina, per le richieste che non possono aspettare (lo Scrittore). */
let indice: IndiceCompatto | null = null
let piatti: Passaggio[] | null = null

function ordineFirme(): [string, string][] {
  return [...corpus.keys()].map((id) => {
    let f = firme.get(id)
    if (!f) {
      f = improntaFile(corpus.get(id) ?? [])
      firme.set(id, f)
    }
    return [id, f]
  })
}

/** Impronta di tutto il corpus di adesso. */
export function firmaCorpus(): string {
  return improntaCorpus(ordineFirme())
}

function tuttiIPassaggi(): Passaggio[] {
  piatti ??= [...corpus.values()].flat()
  return piatti
}

function cambiato(ritardo = 1500) {
  piatti = null
  for (const id of [...firme.keys()]) if (!corpus.has(id)) firme.delete(id)
  programmaIndice(ritardo)
}

async function salvaSuDisco() {
  const oggetto: Record<string, Passaggio[]> = {}
  for (const [id, passaggi] of corpus) oggetto[id] = passaggi
  // Testo e impronte nello stesso momento: chi li legge insieme li trova sempre d'accordo.
  await setMany([
    [CHIAVE_IDB, oggetto],
    [CHIAVE_FIRME, ordineFirme()],
  ])
}

/** Carica il corpus salvato e restituisce gli id dei file presenti. */
export async function caricaCorpus(): Promise<Set<string>> {
  const [salvato, salvate] = await getMany<unknown>([CHIAVE_IDB, CHIAVE_FIRME])
  corpus.clear()
  firme.clear()
  for (const [id, passaggi] of Object.entries((salvato ?? {}) as Record<string, Passaggio[]>)) corpus.set(id, passaggi)
  const lette = new Map(Array.isArray(salvate) ? (salvate as [string, string][]) : [])
  for (const id of corpus.keys()) {
    const f = lette.get(id)
    if (f) firme.set(id, f)
  }
  // Corpus salvato da una versione precedente: le impronte si calcolano una volta e si salvano.
  const ordine = ordineFirme()
  if (corpus.size && (lette.size !== corpus.size || ordine.some(([id, f]) => lette.get(id) !== f))) await idbSet(CHIAVE_FIRME, ordine)
  indice = null
  // All'avvio il lavoratore riprende subito l'indice salvato: la prima ricerca è già pronta.
  cambiato(300)
  return new Set(corpus.keys())
}

export async function aggiungiAlCorpus(fileId: string, passaggi: Passaggio[]) {
  corpus.set(fileId, passaggi)
  firme.set(fileId, improntaFile(passaggi))
  await salvaSuDisco()
  cambiato()
}

export async function rimuoviDalCorpus(fileId: string) {
  if (!corpus.delete(fileId)) return
  await salvaSuDisco()
  cambiato()
}

export async function svuotaCorpus() {
  corpus.clear()
  await delMany([CHIAVE_IDB, CHIAVE_FIRME, CHIAVE_INDICE])
  indice = null
  cambiato()
}

/** Toglie dal corpus tutto tranne i file indicati (usato dal ripristino). */
export async function tieniSoloNelCorpus(ids: Set<string>) {
  for (const id of [...corpus.keys()]) if (!ids.has(id)) corpus.delete(id)
  await salvaSuDisco()
  cambiato()
}

/** Tutto il corpus, per il file di progetto. */
export function esportaCorpus(): Record<string, Passaggio[]> {
  return Object.fromEntries(corpus)
}

/** Sostituisce il corpus con quello di un file di progetto. */
export async function importaCorpus(dati: Record<string, Passaggio[]>) {
  const prima = new Map(corpus)
  corpus.clear()
  for (const [id, passaggi] of Object.entries(dati)) {
    corpus.set(id, passaggi)
    // Se il file è lo stesso di prima (stesso oggetto) l'impronta non si rifà.
    if (prima.get(id) !== passaggi) firme.delete(id)
  }
  await salvaSuDisco()
  cambiato()
}

/** Passaggi di un file, per l'anteprima e le citazioni dal corso. */
export function passaggiDi(fileId: string): Passaggio[] {
  return corpus.get(fileId) ?? []
}

/** Testo normalizzato di tutto il corpus, per contare le occorrenze dei termini. */
export function testoCorpusNormalizzato(normalizza: (t: string) => string): string {
  return [...corpus.values()]
    .flat()
    .map((p) => normalizza(p.testo))
    .join(' \n ')
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

export { tokenizza }

/**
 * Dopo un cambiamento l'indice si prepara in sottofondo, con calma: se arrivano
 * tanti file uno dopo l'altro, si rifà una volta sola alla fine.
 */
let timerIndice: ReturnType<typeof setTimeout> | undefined
function programmaIndice(ritardo: number) {
  clearTimeout(timerIndice)
  if (corpus.size === 0) return
  // Poi una copia anche qui, per lo Scrittore che cerca nel corso senza aspettare (prompt e stime).
  timerIndice = setTimeout(() => void preparaIndice().then(() => precaricaIndice()).catch(() => {}), ritardo)
}

/** Prepara (o ritrova già salvato) l'indice nel lavoratore in sottofondo. */
export async function preparaIndice(): Promise<EsitoIndice | null> {
  if (corpus.size === 0) return null
  const firma = firmaCorpus()
  try {
    return await chiedi<EsitoIndice>({ tipo: 'indice', firma }).esito
  } catch (err) {
    // Il lavoratore ha letto un corpus diverso (salvataggio in corso): lo fa la pagina.
    if (err instanceof Error && err.name === 'FirmaDiversa') {
      indiceSincrono()
      return null
    }
    throw err
  }
}

/**
 * Indice nella pagina per le richieste sincrone. Prima prova la copia già
 * caricata, poi la costruisce dal testo in memoria (riusando i file già
 * indicizzati) e la salva per la volta dopo.
 */
function indiceSincrono(): IndiceCompatto {
  const ordine = ordineFirme()
  const firma = improntaCorpus(ordine)
  if (indice?.firma === firma) return indice
  const fatto = costruisciIndice(ordine, (id) => corpus.get(id), indice)
  indice = fatto.indice
  void idbSet(CHIAVE_INDICE, fatto.indice).catch(() => {})
  return indice
}

/**
 * Carica nella pagina l'indice salvato (per lo Scrittore, che lo usa senza
 * aspettare). Se non c'è, lo prepara il lavoratore e poi si legge.
 */
export async function precaricaIndice(): Promise<void> {
  if (corpus.size === 0) return
  const firma = firmaCorpus()
  if (indice?.firma === firma) return
  let salvato = await getIdb<unknown>(CHIAVE_INDICE).catch(() => undefined)
  if (!indiceValido(salvato, firma)) {
    await preparaIndice().catch(() => null)
    salvato = await getIdb<unknown>(CHIAVE_INDICE).catch(() => undefined)
  }
  if (indiceValido(salvato, firma) && firmaCorpus() === firma) indice = salvato
}

/** Classifiche (passaggi dal più pertinente) di più domande, calcolate nel lavoratore. */
async function classificheAsync(domande: string[]): Promise<Passaggio[][]> {
  const firma = firmaCorpus()
  const tutti = tuttiIPassaggi()
  try {
    const classifiche = await chiedi<Uint32Array[]>({ tipo: 'cerca', firma, domande }).esito
    // Se intanto il corpus è cambiato, gli indici non valgono più: si rifà qui.
    if (firmaCorpus() === firma) return classifiche.map((c) => Array.from(c, (i) => tutti[i]))
  } catch (err) {
    if (!(err instanceof Error && err.name === 'FirmaDiversa')) throw err
  }
  return classificheSincrone(domande)
}

function classificheSincrone(domande: string[]): Passaggio[][] {
  const ind = indiceSincrono()
  const tutti = tuttiIPassaggi()
  return domande.map((d) => Array.from(classifica(ind, d), (i) => tutti[i]))
}

/**
 * Seleziona i passaggi più pertinenti a una o più domande entro un budget di
 * caratteri. Con più domande (per esempio una per sezione della scaletta) i
 * risultati si alternano, così ogni sezione ha il suo materiale. Se tutto il
 * corpus sta nel budget, si manda tutto.
 */
function scegliEntroBudget(classifiche: Passaggio[][], budget: number): Passaggio[] {
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

function tuttoNelBudget(budget: number): Passaggio[] | null {
  const tutti = tuttiIPassaggi()
  const totale = tutti.reduce((s, p) => s + p.testo.length, 0)
  return totale <= budget ? ordina(tutti) : null
}

export function recuperaPassaggi(domande: string[], budget: number): Passaggio[] {
  const tutto = tuttoNelBudget(budget)
  if (tutto) return tutto
  return scegliEntroBudget(classificheSincrone(domande.filter((d) => d.trim())), budget)
}

/** Come recuperaPassaggi, ma il lavoro pesante lo fa il lavoratore in sottofondo. */
export async function recuperaPassaggiAsync(domande: string[], budget: number): Promise<Passaggio[]> {
  const tutto = tuttoNelBudget(budget)
  if (tutto) return tutto
  return scegliEntroBudget(await classificheAsync(domande.filter((d) => d.trim())), budget)
}

/** I passaggi più pertinenti a una domanda, in ordine di pertinenza. */
export function cercaPassaggi(domanda: string, quanti = 6): Passaggio[] {
  if (corpus.size === 0 || !domanda.trim()) return []
  return classificheSincrone([domanda])[0].slice(0, quanti)
}

/** Come cercaPassaggi, nel lavoratore in sottofondo. */
export async function cercaPassaggiAsync(domanda: string, quanti = 6): Promise<Passaggio[]> {
  if (corpus.size === 0 || !domanda.trim()) return []
  return (await classificheAsync([domanda]))[0].slice(0, quanti)
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
