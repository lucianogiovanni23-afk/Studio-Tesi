import { get, getMany, set } from 'idb-keyval'
import {
  CHIAVE_CORPUS,
  CHIAVE_FIRME,
  CHIAVE_INDICE,
  classifica,
  costruisciIndice,
  FORMATO_INDICE,
  improntaCorpus,
  indiceValido,
  type IndiceCompatto,
} from './indiceCorso'
import {
  controlla,
  Fermato,
  type EsitoControllo,
  type EsitoParagrafo,
  type Memoria,
  type ParagrafoDaControllare,
  type SorgenteTesto,
} from '../revisione/motoreSomiglianze'
import type { Passaggio } from '../types'

/**
 * I lavori pesanti sul materiale del corso e sulla tesi: indice di ricerca,
 * ricerca e controllo delle frasi simili. Girano nel lavoratore in sottofondo
 * (sottofondo.worker.ts) così la pagina resta fluida; se il lavoratore non
 * parte, la pagina esegue esattamente queste stesse funzioni.
 *
 * Il testo del corso si legge da IndexedDB, insieme all'impronta salvata nello
 * stesso momento: se non corrisponde a quella chiesta, la pagina ha dati più
 * nuovi e il lavoro torna indietro con "firma" (la pagina lo rifà da sé).
 */

export type Richiesta =
  | { tipo: 'indice'; firma: string }
  | { tipo: 'cerca'; firma: string; domande: string[] }
  | { tipo: 'somiglianze'; firmaCorpus: string; fonti: SorgenteTesto[]; paragrafi: ParagrafoDaControllare[]; tutto: boolean }

export interface EsitoIndice {
  costruito: boolean
  tokenizzati: number
  riusati: number
  ms: number
}

export class FirmaDiversa extends Error {
  constructor() {
    super('firma')
    this.name = 'FirmaDiversa'
  }
}

const CHIAVE_MEMORIA_SIMILI = 'studio-tesi-somiglianze'
const FORMATO_MEMORIA_SIMILI = 1

let indice: IndiceCompatto | null = null
/** Un lavoro alla volta: due costruzioni dell'indice insieme sarebbero sprecate. */
let coda: Promise<unknown> = Promise.resolve()

function inFila<T>(f: () => Promise<T>): Promise<T> {
  const p = coda.then(f, f)
  coda = p.catch(() => {})
  return p
}

async function leggiCorpus(firma: string): Promise<{ corpus: Record<string, Passaggio[]>; ordine: [string, string][] }> {
  const [corpus, firme] = await getMany<unknown>([CHIAVE_CORPUS, CHIAVE_FIRME])
  const ordine = Array.isArray(firme) ? (firme as [string, string][]) : null
  if (!ordine || improntaCorpus(ordine) !== firma) throw new FirmaDiversa()
  return { corpus: (corpus ?? {}) as Record<string, Passaggio[]>, ordine }
}

/** L'indice per questa impronta: dalla memoria, da IndexedDB o costruito (e salvato). */
export async function indicePer(
  firma: string,
  sorgente?: { ordine: [string, string][]; passaggiDi: (id: string) => Passaggio[] | undefined },
): Promise<{ indice: IndiceCompatto; esito: EsitoIndice }> {
  const t0 = performance.now()
  if (indice?.firma === firma) return { indice, esito: { costruito: false, tokenizzati: 0, riusati: 0, ms: 0 } }
  const salvato = await get<unknown>(CHIAVE_INDICE).catch(() => undefined)
  if (indiceValido(salvato, firma)) {
    indice = salvato
    return { indice, esito: { costruito: false, tokenizzati: 0, riusati: 0, ms: performance.now() - t0 } }
  }
  let ordine: [string, string][]
  let passaggiDi: (id: string) => Passaggio[] | undefined
  if (sorgente) {
    ordine = sorgente.ordine
    passaggiDi = sorgente.passaggiDi
  } else {
    const letto = await leggiCorpus(firma)
    ordine = letto.ordine
    passaggiDi = (id) => letto.corpus[id]
  }
  // Un indice vecchio serve ancora: i file che non sono cambiati non si rileggono.
  const vecchio =
    indice ??
    (salvato && (salvato as IndiceCompatto).formato === FORMATO_INDICE && indiceValido(salvato, (salvato as IndiceCompatto).firma) ? salvato : null)
  const fatto = costruisciIndice(ordine, passaggiDi, vecchio)
  indice = fatto.indice
  await set(CHIAVE_INDICE, fatto.indice).catch(() => {})
  return { indice, esito: { costruito: true, tokenizzati: fatto.tokenizzati, riusati: fatto.riusati, ms: performance.now() - t0 } }
}

let memoria: Memoria | null = null

async function memoriaSimili(): Promise<Memoria> {
  if (memoria) return memoria
  const salvata = await get<{ formato: number; voci: [string, EsitoParagrafo][] }>(CHIAVE_MEMORIA_SIMILI).catch(() => undefined)
  memoria = { indice: null, esiti: new Map(salvata?.formato === FORMATO_MEMORIA_SIMILI && Array.isArray(salvata.voci) ? salvata.voci : []) }
  return memoria
}

function sorgentiCorso(corpus: Record<string, Passaggio[]>): SorgenteTesto[] {
  const elenco: SorgenteTesto[] = []
  for (const passaggi of Object.values(corpus)) {
    for (const p of passaggi) {
      const pagine = p.pagine[0] === p.pagine[1] ? `p. ${p.pagine[0]}` : `pp. ${p.pagine[0]}-${p.pagine[1]}`
      elenco.push({ etichetta: `Corso: ${p.file}, ${pagine}`, tipo: 'corso', testo: p.testo, rif: 'C' })
    }
  }
  return elenco
}

const fermati = new Set<number>()
const DURATA_INDICE_FONTI = 3 * 60_000
let scadenza: ReturnType<typeof setTimeout> | undefined

export function ferma(id: number) {
  fermati.add(id)
}

/** Esegue una richiesta. `avanzamento` riceve quota e fase dei lavori lunghi. */
export function esegui(id: number, r: Richiesta, avanzamento: (quota: number, fase: string) => void, cede: () => Promise<void>): Promise<unknown> {
  if (r.tipo === 'indice') return inFila(async () => (await indicePer(r.firma)).esito)
  if (r.tipo === 'cerca') {
    return inFila(async () => {
      const { indice: ind } = await indicePer(r.firma)
      return r.domande.map((d) => classifica(ind, d))
    })
  }
  return inFila(async (): Promise<EsitoControllo & { fonti: number }> => {
    try {
      const { corpus } = await leggiCorpus(r.firmaCorpus)
      const sorgenti = [...sorgentiCorso(corpus), ...r.fonti]
      const mem = await memoriaSimili()
      const esito = await controlla(sorgenti, r.paragrafi, mem, r.tutto, { avanzamento, cede, fermato: () => fermati.has(id) })
      await set(CHIAVE_MEMORIA_SIMILI, { formato: FORMATO_MEMORIA_SIMILI, voci: [...mem.esiti] }).catch(() => {})
      return { ...esito, fonti: sorgenti.length }
    } finally {
      fermati.delete(id)
      // L'indice delle fonti occupa molta memoria: si tiene solo per qualche minuto.
      clearTimeout(scadenza)
      scadenza = setTimeout(() => {
        if (memoria) memoria.indice = null
      }, DURATA_INDICE_FONTI)
    }
  })
}

export { Fermato }
