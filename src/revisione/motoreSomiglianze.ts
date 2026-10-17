import { Impronta } from '../agents/indiceCorso'

/**
 * Il calcolo del controllo "frasi troppo simili alle fonti", senza DOM né
 * store: gira nel lavoratore in sottofondo (o nella pagina, se il lavoratore
 * non parte). Si confrontano "pezzi" di 8 parole consecutive (shingle) della
 * tesi con quelli del materiale del corso e delle fonti della biblioteca.
 *
 * Il risultato di ogni paragrafo dipende solo dal suo testo e dalle fonti:
 * si conserva con la chiave (impronta del paragrafo + versione delle fonti) e
 * al controllo successivo si rifanno solo i paragrafi cambiati.
 */

/** Parole per pezzo: 8 è abbastanza lungo da non scattare su frasi fatte. */
export const PAROLE_PEZZO = 8
/** Sotto questa quota di parole in comune la frase non si segnala. */
const SOGLIA = 0.2
const TEMPO_PER_PEZZETTO = 12

export type Livello = 'alta' | 'media' | 'bassa'

export interface SorgenteTesto {
  etichetta: string
  tipo: 'corso' | 'biblioteca'
  testo: string
  /** Rimando che renderebbe corretta una citazione tra virgolette: "F12", oppure "C" per il corso. */
  rif: string
}

/** Una frase simile, con le posizioni relative al paragrafo. */
export interface SimileParagrafo {
  /** Posizione della frase nel paragrafo. */
  frase: number
  testo: string
  uguali: [number, number][]
  punteggio: number
  livello: Livello
  fonte: string
  tipoFonte: 'corso' | 'biblioteca'
  passo: string
  passoUguali: [number, number][]
  citata: boolean
}

export interface EsitoParagrafo {
  frasi: number
  parole: number
  simili: SimileParagrafo[]
}

export interface ParagrafoDaControllare {
  /** Impronta del testo del paragrafo. */
  chiave: string
  testo: string
}

// ---------------------------------------------------------------------------
// Parole e pezzi
// ---------------------------------------------------------------------------

interface Parole {
  id: Int32Array
  inizio: Int32Array
  fine: Int32Array
  n: number
}

const RE_PAROLA = /[\p{L}\p{N}]+/gu

/** Minuscole, senza accenti: "Perché" e "perche" sono la stessa parola. L'apostrofo separa ("dell'olio" → dell olio). */
function forma(parola: string): string {
  return parola.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function parole(testo: string, dizionario: Map<string, number>, saltaMarcatori = false): Parole {
  const id: number[] = []
  const inizio: number[] = []
  const fine: number[] = []
  for (const m of testo.matchAll(RE_PAROLA)) {
    const f = forma(m[0])
    // I marcatori di citazione [F12] e [C3] non sono parole della frase.
    if (saltaMarcatori && /^[fc]\d+$/.test(f) && testo[m.index - 1] === '[') continue
    let n = dizionario.get(f)
    if (n === undefined) {
      n = dizionario.size + 1
      dizionario.set(f, n)
    }
    id.push(n)
    inizio.push(m.index)
    fine.push(m.index + m[0].length)
  }
  return { id: Int32Array.from(id), inizio: Int32Array.from(inizio), fine: Int32Array.from(fine), n: id.length }
}

/** Impronta numerica di un pezzo di 8 parole (due hash da 32 bit uniti in un numero sicuro). */
function impronta(id: Int32Array, da: number): number {
  let a = 0x811c9dc5
  let b = 0x2545f491
  for (let i = da; i < da + PAROLE_PEZZO; i++) {
    a = Math.imul(a ^ id[i], 0x01000193)
    b = Math.imul(b ^ id[i], 0x5bd1e995) ^ (b >>> 15)
  }
  return (a >>> 0) * 0x200000 + ((b >>> 0) & 0x1fffff)
}

/** Divide un paragrafo in frasi, senza spezzare "p. 12" o "es." più comuni. */
export function frasiDi(paragrafo: string): string[] {
  const frasi: string[] = []
  let inizio = 0
  const re = /[.!?…]+["»”)\]]*\s+(?=[«"“(]?[A-ZÀ-Ý0-9])/g
  for (const m of paragrafo.matchAll(re)) {
    const prima = paragrafo.slice(Math.max(0, m.index - 4), m.index + 1).toLowerCase()
    if (/\b(p|pp|es|cfr|ecc|vol|n|art|cap|fig|tab|ed|eds)\.$/.test(prima)) continue
    const fine = m.index + m[0].length
    frasi.push(paragrafo.slice(inizio, fine).trim())
    inizio = fine
  }
  const resto = paragrafo.slice(inizio).trim()
  if (resto) frasi.push(resto)
  return frasi
}

/** Unisce intervalli sovrapposti o attaccati. */
function unisci(intervalli: [number, number][]): [number, number][] {
  const ordinati = [...intervalli].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const x of ordinati) {
    const ultimo = out[out.length - 1]
    if (ultimo && x[0] <= ultimo[1] + 1) ultimo[1] = Math.max(ultimo[1], x[1])
    else out.push([x[0], x[1]])
  }
  return out
}

/** Per ogni carattere del testo originale, la posizione nel testo con gli spazi compattati. */
function compattaPosizioni(testo: string): Int32Array {
  const mappa = new Int32Array(testo.length + 1)
  let j = 0
  let spazio = false
  for (let i = 0; i < testo.length; i++) {
    mappa[i] = j
    const s = /\s/.test(testo[i])
    if (!s || !spazio) j += 1
    spazio = s
  }
  mappa[testo.length] = j
  return mappa
}

/** Impronta del testo di un paragrafo (chiave della memoria). */
export function chiaveParagrafo(testo: string): string {
  return new Impronta().aggiungi(testo).valore()
}

/** Versione delle fonti: cambia se cambia un testo, un'etichetta o un rimando. */
export function versioneFonti(sorgenti: SorgenteTesto[]): string {
  const h = new Impronta()
  for (const s of sorgenti) h.aggiungi(s.etichetta).aggiungi(s.tipo).aggiungi(s.rif).aggiungi(s.testo)
  return `${sorgenti.length}-${h.valore()}`
}

// ---------------------------------------------------------------------------
// Indice delle fonti
// ---------------------------------------------------------------------------

export interface IndiceFonti {
  versione: string
  sorgenti: (SorgenteTesto & { parole: Parole })[]
  dizionario: Map<string, number>
  indice: Map<number, number>
  basi: number[]
}

export class Fermato extends Error {
  constructor() {
    super('Fermato')
    this.name = 'AbortError'
  }
}

export interface Controllo {
  /** 0-1 e una frase su cosa si sta facendo. */
  avanzamento: (quota: number, fase: string) => void
  fermato: () => boolean
  /** Lascia respirare: nel lavoratore fa arrivare il "Ferma", nella pagina tiene fluida l'interfaccia. */
  cede: () => Promise<void>
}

async function pausa(c: Controllo, ultima: { t: number }) {
  if (performance.now() - ultima.t <= TEMPO_PER_PEZZETTO) return false
  await c.cede()
  if (c.fermato()) throw new Fermato()
  ultima.t = performance.now()
  return true
}

export async function costruisciIndiceFonti(sorgenti: SorgenteTesto[], versione: string, c: Controllo, quota: number): Promise<IndiceFonti> {
  const dizionario = new Map<string, number>()
  const indice = new Map<number, number>()
  const basi: number[] = []
  const elenco: IndiceFonti['sorgenti'] = []
  let totale = 0
  const ultima = { t: performance.now() }
  for (let s = 0; s < sorgenti.length; s++) {
    const src = sorgenti[s]
    const pw = parole(src.testo, dizionario)
    elenco.push({ ...src, parole: pw })
    basi.push(totale)
    for (let i = 0; i + PAROLE_PEZZO <= pw.n; i++) {
      const k = impronta(pw.id, i)
      if (!indice.has(k)) indice.set(k, totale + i)
    }
    totale += pw.n
    if (await pausa(c, ultima)) c.avanzamento((quota * (s + 1)) / sorgenti.length, `Leggo le fonti: ${s + 1} di ${sorgenti.length}`)
  }
  return { versione, sorgenti: elenco, dizionario, indice, basi }
}

function sorgenteDi(basi: number[], pos: number): number {
  let lo = 0
  let hi = basi.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (basi[mid] <= pos) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Le frasi simili di una frase della tesi (stesso calcolo di sempre). */
function confrontaFrase(ind: IndiceFonti, testo: string, posizione: number): { parole: number; simile: SimileParagrafo | null } {
  const pw = parole(testo, ind.dizionario, true)
  if (pw.n < PAROLE_PEZZO) return { parole: pw.n, simile: null }
  const coperte = new Uint8Array(pw.n)
  const perFonte = new Map<number, { pezzi: number; posizioni: number[]; inFrase: number[] }>()
  for (let i = 0; i + PAROLE_PEZZO <= pw.n; i++) {
    const pos = ind.indice.get(impronta(pw.id, i))
    if (pos === undefined) continue
    coperte.fill(1, i, i + PAROLE_PEZZO)
    const s = sorgenteDi(ind.basi, pos)
    const voce = perFonte.get(s) ?? { pezzi: 0, posizioni: [], inFrase: [] }
    voce.pezzi += 1
    voce.posizioni.push(pos - ind.basi[s])
    voce.inFrase.push(i)
    perFonte.set(s, voce)
  }
  const quota = coperte.reduce((n, x) => n + x, 0) / pw.n
  if (quota < SOGLIA || !perFonte.size) return { parole: pw.n, simile: null }
  const [s, voce] = [...perFonte.entries()].sort((a, b) => b[1].pezzi - a[1].pezzi)[0]
  const src = ind.sorgenti[s]
  const sp = src.parole
  const primo = Math.min(...voce.posizioni)
  const ultimo = Math.min(Math.max(...voce.posizioni) + PAROLE_PEZZO - 1, primo + 90)
  const daParola = Math.max(0, primo - 8)
  const aParola = Math.min(sp.n - 1, ultimo + 8)
  const da = sp.inizio[daParola]
  const a = sp.fine[aParola]
  const passo = src.testo.slice(da, a).replace(/\s+/g, ' ')
  // Le posizioni nel passo vanno ricalcolate dopo aver compattato gli spazi: si rifanno sul testo compattato.
  const grezzo = src.testo.slice(da, a)
  const mappa = compattaPosizioni(grezzo)
  const passoUguali = unisci(
    voce.posizioni
      .filter((p) => p >= daParola && p + PAROLE_PEZZO - 1 <= aParola)
      .map((p): [number, number] => [mappa[sp.inizio[p] - da], mappa[sp.fine[p + PAROLE_PEZZO - 1] - da]]),
  )
  const uguali = unisci(Array.from({ length: pw.n }, (_, i) => i).filter((i) => coperte[i]).map((i): [number, number] => [pw.inizio[i], pw.fine[i]]))
  const virgolette = /[«"“”]/.test(testo)
  const rimando = src.rif === 'C' ? /\[C\d+\]/.test(testo) : testo.includes(`[${src.rif}]`)
  return {
    parole: pw.n,
    simile: {
      frase: posizione,
      testo,
      uguali,
      punteggio: quota,
      livello: quota >= 0.6 ? 'alta' : quota >= 0.35 ? 'media' : 'bassa',
      fonte: src.etichetta,
      tipoFonte: src.tipo,
      passo: `${daParola > 0 ? '…' : ''}${passo}${aParola < sp.n - 1 ? '…' : ''}`,
      passoUguali: daParola > 0 ? passoUguali.map(([x, y]) => [x + 1, y + 1]) : passoUguali,
      citata: virgolette && rimando,
    },
  }
}

export function controllaParagrafo(ind: IndiceFonti, testo: string): EsitoParagrafo {
  const frasi = frasiDi(testo)
  const simili: SimileParagrafo[] = []
  let paroleTot = 0
  frasi.forEach((f, i) => {
    const r = confrontaFrase(ind, f, i)
    paroleTot += r.parole
    if (r.simile) simili.push(r.simile)
  })
  return { frasi: frasi.length, parole: paroleTot, simili }
}

// ---------------------------------------------------------------------------
// Controllo con la memoria dei paragrafi
// ---------------------------------------------------------------------------

export interface EsitoControllo {
  /** Un esito per paragrafo, nello stesso ordine. */
  paragrafi: EsitoParagrafo[]
  /** Paragrafi controllati adesso (gli altri venivano dalla memoria). */
  ricontrollati: number
  versione: string
}

export interface Memoria {
  /** Indice delle fonti già costruito (per la stessa versione si riusa). */
  indice: IndiceFonti | null
  /** chiave paragrafo + versione fonti → esito. */
  esiti: Map<string, EsitoParagrafo>
}

export async function controlla(
  sorgenti: SorgenteTesto[],
  paragrafi: ParagrafoDaControllare[],
  memoria: Memoria,
  tutto: boolean,
  c: Controllo,
): Promise<EsitoControllo> {
  const versione = versioneFonti(sorgenti)
  if (tutto) {
    memoria.esiti.clear()
    memoria.indice = null
  }
  const chiave = (p: ParagrafoDaControllare) => `${versione}|${p.chiave}`
  const daFare = paragrafi.filter((p) => !memoria.esiti.has(chiave(p)))
  if (daFare.length && memoria.indice?.versione !== versione) {
    memoria.indice = null
    memoria.indice = await costruisciIndiceFonti(sorgenti, versione, c, 0.6)
  }
  const base = memoria.indice?.versione === versione ? 0.6 : 0
  const ultima = { t: performance.now() }
  const esiti: EsitoParagrafo[] = []
  /** Chiavi calcolate in questo controllo (due paragrafi uguali contano entrambi come ricontrollati). */
  const adesso = new Set<string>()
  let fatti = 0
  let ricontrollati = 0
  for (const p of paragrafi) {
    const k = chiave(p)
    let e = memoria.esiti.get(k)
    if (!e) {
      e = controllaParagrafo(memoria.indice!, p.testo)
      memoria.esiti.set(k, e)
      adesso.add(k)
      fatti += 1
      if (await pausa(c, ultima)) c.avanzamento(base + ((1 - base) * fatti) / daFare.length, `Confronto le frasi: paragrafo ${fatti} di ${daFare.length}`)
    }
    if (adesso.has(k)) ricontrollati += 1
    esiti.push(e)
  }
  // La memoria tiene solo i paragrafi di adesso.
  const usate = new Set(paragrafi.map(chiave))
  for (const k of [...memoria.esiti.keys()]) if (!usate.has(k)) memoria.esiti.delete(k)
  return { paragrafi: esiti, ricontrollati, versione }
}
