import { create } from 'zustand'
import { esportaCorpus } from '../agents/corpus'
import { autoreAnno } from '../domain/bibliografia'
import { paragrafi } from '../domain/citazioniTesto'
import { useStudio } from '../store'
import type { Fonte } from '../types'

/**
 * Controllo delle frasi troppo simili alle fonti, tutto nel browser: gratis,
 * senza IA e senza internet. Si confrontano "pezzi" di 8 parole consecutive
 * (shingle) della tesi con quelli del materiale del corso e delle fonti della
 * biblioteca. Il lavoro è diviso in pezzetti da pochi millisecondi, così la
 * pagina non si blocca. Non sostituisce il software antiplagio dell'università.
 */

/** Parole per pezzo: 8 è abbastanza lungo da non scattare su frasi fatte. */
export const PAROLE_PEZZO = 8
/** Sotto questa quota di parole in comune la frase non si segnala. */
const SOGLIA = 0.2
const TEMPO_PER_PEZZETTO = 12

export type Livello = 'alta' | 'media' | 'bassa'

export interface FraseSimile {
  id: string
  capitoloId: string
  sezioneId: string
  sezione: string
  frase: string
  /** Pezzi della frase uguali alla fonte: [inizio, fine) in caratteri. */
  uguali: [number, number][]
  /** Quota di parole della frase che compaiono nella fonte (0-1). */
  punteggio: number
  livello: Livello
  fonte: string
  tipoFonte: 'corso' | 'biblioteca'
  /** Il passaggio della fonte con le parti uguali. */
  passo: string
  passoUguali: [number, number][]
  /** È già tra virgolette e con il rimando alla fonte: va bene così. */
  citata: boolean
}

export interface EsitoSomiglianze {
  data: string
  frasi: number
  fonti: number
  parole: number
  simili: FraseSimile[]
}

interface StatoSomiglianze {
  inCorso: boolean
  /** 0-1 */
  avanzamento: number
  fase: string
  esito: EsitoSomiglianze | null
  errore: string | null
}

export const useSomiglianze = create<StatoSomiglianze>(() => ({ inCorso: false, avanzamento: 0, fase: '', esito: null, errore: null }))

let controller: AbortController | null = null

export function fermaSomiglianze() {
  controller?.abort()
}

// ---------------------------------------------------------------------------
// Parole e pezzi
// ---------------------------------------------------------------------------

interface Parole {
  /** Id numerico di ogni parola (dal dizionario comune). */
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

// ---------------------------------------------------------------------------
// Materiale da confrontare
// ---------------------------------------------------------------------------

interface Sorgente {
  etichetta: string
  tipo: 'corso' | 'biblioteca'
  testo: string
  /** Rimando che renderebbe corretta una citazione tra virgolette: "F12", oppure "C" per il corso. */
  rif: string
  parole?: Parole
  base: number
}

function testoFonte(f: Fonte): string {
  if (f.testo.trim()) return f.testo
  return [f.abstract, ...f.estratti.map((e) => e.testo), ...(f.scheda?.frasiChiave.map((e) => e.testo) ?? [])].filter(Boolean).join('\n\n')
}

function sorgenti(fonti: Fonte[]): Sorgente[] {
  const elenco: Sorgente[] = []
  for (const passaggi of Object.values(esportaCorpus())) {
    for (const p of passaggi) {
      const pagine = p.pagine[0] === p.pagine[1] ? `p. ${p.pagine[0]}` : `pp. ${p.pagine[0]}-${p.pagine[1]}`
      elenco.push({ etichetta: `Corso: ${p.file}, ${pagine}`, tipo: 'corso', testo: p.testo, rif: 'C', base: 0 })
    }
  }
  for (const f of fonti) {
    const testo = testoFonte(f)
    if (testo.trim()) elenco.push({ etichetta: `[F${f.numero}] ${autoreAnno(f, false)} · ${f.titolo}`, tipo: 'biblioteca', testo, rif: `F${f.numero}`, base: 0 })
  }
  return elenco
}

// ---------------------------------------------------------------------------
// Frasi della tesi
// ---------------------------------------------------------------------------

interface FraseTesi {
  capitoloId: string
  sezioneId: string
  sezione: string
  testo: string
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

function frasiTesi(): FraseTesi[] {
  const { capitoli } = useStudio.getState().progetto
  return capitoli.flatMap((c, i) =>
    c.sezioni.flatMap((s, j) =>
      paragrafi(s.testo).flatMap((par) => frasiDi(par).map((testo) => ({ capitoloId: c.id, sezioneId: s.id, sezione: `${i + 1}.${j + 1} ${s.titolo}`, testo }))),
    ),
  )
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

// ---------------------------------------------------------------------------
// Controllo
// ---------------------------------------------------------------------------

function cede(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => (signal.aborted ? reject(new DOMException('Aborted', 'AbortError')) : resolve()), 0)
  })
}

export async function controllaSomiglianze(): Promise<void> {
  if (useSomiglianze.getState().inCorso) return
  controller = new AbortController()
  const signal = controller.signal
  useSomiglianze.setState({ inCorso: true, avanzamento: 0, fase: 'Preparo le fonti…', errore: null })
  try {
    const { fonti } = useStudio.getState().progetto
    const elenco = sorgenti(fonti)
    const frasi = frasiTesi()
    if (!frasi.length) throw new Error('Nella tesi non c\'è ancora niente di scritto da controllare.')
    if (!elenco.length) throw new Error('Non ho fonti con cui confrontare: carica il materiale del corso o qualche PDF in biblioteca.')

    const dizionario = new Map<string, number>()
    const indice = new Map<number, number>()
    const basi: number[] = []
    let totale = 0
    let ultimaPausa = performance.now()

    // 1. Indice dei pezzi di tutte le fonti (60% dell'avanzamento).
    for (let s = 0; s < elenco.length; s++) {
      const src = elenco[s]
      src.parole = parole(src.testo, dizionario)
      src.base = totale
      basi.push(totale)
      const pw = src.parole
      for (let i = 0; i + PAROLE_PEZZO <= pw.n; i++) {
        const k = impronta(pw.id, i)
        if (!indice.has(k)) indice.set(k, totale + i)
      }
      totale += pw.n
      if (performance.now() - ultimaPausa > TEMPO_PER_PEZZETTO) {
        useSomiglianze.setState({ avanzamento: (0.6 * (s + 1)) / elenco.length, fase: `Leggo le fonti: ${s + 1} di ${elenco.length}` })
        await cede(signal)
        ultimaPausa = performance.now()
      }
    }

    const sorgenteDi = (pos: number): number => {
      let lo = 0
      let hi = basi.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (basi[mid] <= pos) lo = mid
        else hi = mid - 1
      }
      return lo
    }

    // 2. Frase per frase, i pezzi uguali (40% dell'avanzamento).
    const simili: FraseSimile[] = []
    let paroleTesi = 0
    for (let f = 0; f < frasi.length; f++) {
      const fr = frasi[f]
      const pw = parole(fr.testo, dizionario, true)
      paroleTesi += pw.n
      if (pw.n >= PAROLE_PEZZO) {
        const coperte = new Uint8Array(pw.n)
        // Per ogni fonte: quanti pezzi in comune e dove.
        const perFonte = new Map<number, { pezzi: number; posizioni: number[]; inFrase: number[] }>()
        for (let i = 0; i + PAROLE_PEZZO <= pw.n; i++) {
          const pos = indice.get(impronta(pw.id, i))
          if (pos === undefined) continue
          coperte.fill(1, i, i + PAROLE_PEZZO)
          const s = sorgenteDi(pos)
          const voce = perFonte.get(s) ?? { pezzi: 0, posizioni: [], inFrase: [] }
          voce.pezzi += 1
          voce.posizioni.push(pos - basi[s])
          voce.inFrase.push(i)
          perFonte.set(s, voce)
        }
        const quota = coperte.reduce((n, x) => n + x, 0) / pw.n
        if (quota >= SOGLIA && perFonte.size) {
          const [s, voce] = [...perFonte.entries()].sort((a, b) => b[1].pezzi - a[1].pezzi)[0]
          const src = elenco[s]
          const sp = src.parole!
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
          const virgolette = /[«"“”]/.test(fr.testo)
          const rimando = src.rif === 'C' ? /\[C\d+\]/.test(fr.testo) : fr.testo.includes(`[${src.rif}]`)
          simili.push({
            id: `sim-${f}`,
            capitoloId: fr.capitoloId,
            sezioneId: fr.sezioneId,
            sezione: fr.sezione,
            frase: fr.testo,
            uguali,
            punteggio: quota,
            livello: quota >= 0.6 ? 'alta' : quota >= 0.35 ? 'media' : 'bassa',
            fonte: src.etichetta,
            tipoFonte: src.tipo,
            passo: `${daParola > 0 ? '…' : ''}${passo}${aParola < sp.n - 1 ? '…' : ''}`,
            passoUguali: daParola > 0 ? passoUguali.map(([x, y]) => [x + 1, y + 1]) : passoUguali,
            citata: virgolette && rimando,
          })
        }
      }
      if (performance.now() - ultimaPausa > TEMPO_PER_PEZZETTO) {
        useSomiglianze.setState({ avanzamento: 0.6 + (0.4 * (f + 1)) / frasi.length, fase: `Confronto le frasi: ${f + 1} di ${frasi.length}` })
        await cede(signal)
        ultimaPausa = performance.now()
      }
    }

    // Prima le più simili e non ancora citate.
    simili.sort((a, b) => Number(a.citata) - Number(b.citata) || b.punteggio - a.punteggio)
    useSomiglianze.setState({
      esito: { data: new Date().toISOString(), frasi: frasi.length, fonti: elenco.length, parole: paroleTesi, simili },
      avanzamento: 1,
      fase: '',
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') useSomiglianze.setState({ fase: '' })
    else useSomiglianze.setState({ errore: err instanceof Error ? err.message : 'Il controllo si è fermato per un errore.' })
  } finally {
    useSomiglianze.setState({ inCorso: false })
    controller = null
  }
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
