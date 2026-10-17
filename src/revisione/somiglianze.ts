import { create } from 'zustand'
import { firmaCorpus, statisticheCorpus } from '../agents/corpus'
import type { EsitoControllo } from './motoreSomiglianze'
import { chiedi, fermaLavoro } from '../agents/sottofondo'
import { autoreAnno } from '../domain/bibliografia'
import { paragrafi } from '../domain/citazioniTesto'
import { useStudio } from '../store'
import type { Fonte } from '../types'
import { chiaveParagrafo, PAROLE_PEZZO, type Livello, type SorgenteTesto } from './motoreSomiglianze'

/**
 * Controllo delle frasi troppo simili alle fonti, tutto nel browser: gratis,
 * senza IA e senza internet. Si confrontano "pezzi" di 8 parole consecutive
 * (shingle) della tesi con quelli del materiale del corso e delle fonti della
 * biblioteca. Il calcolo gira nel lavoratore in sottofondo (motoreSomiglianze.ts)
 * e ricorda i paragrafi già controllati: la volta dopo si rifanno solo quelli
 * cambiati, a meno che si chieda "Ricontrolla tutto". Non sostituisce il
 * software antiplagio dell'università.
 */

export { PAROLE_PEZZO }
export type { Livello }

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
  /** Paragrafi controllati adesso e paragrafi in tutto (gli altri erano già controllati e non sono cambiati). */
  ricontrollati: number
  paragrafi: number
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

let lavoro: number | null = null

export function fermaSomiglianze() {
  if (lavoro !== null) void fermaLavoro(lavoro)
}

function testoFonte(f: Fonte): string {
  if (f.testo.trim()) return f.testo
  return [f.abstract, ...f.estratti.map((e) => e.testo), ...(f.scheda?.frasiChiave.map((e) => e.testo) ?? [])].filter(Boolean).join('\n\n')
}

function sorgentiBiblioteca(fonti: Fonte[]): SorgenteTesto[] {
  const elenco: SorgenteTesto[] = []
  for (const f of fonti) {
    const testo = testoFonte(f)
    if (testo.trim()) elenco.push({ etichetta: `[F${f.numero}] ${autoreAnno(f, false)} · ${f.titolo}`, tipo: 'biblioteca', testo, rif: `F${f.numero}` })
  }
  return elenco
}

interface ParagrafoTesi {
  capitoloId: string
  sezioneId: string
  sezione: string
  testo: string
  chiave: string
}

/** Le impronte dei paragrafi non cambiati si riusano: con 60 pagine non si rifanno a ogni controllo. */
const chiavi = new Map<string, string>()

function paragrafiTesi(): ParagrafoTesi[] {
  const { capitoli } = useStudio.getState().progetto
  const usate = new Map<string, string>()
  const elenco = capitoli.flatMap((c, i) =>
    c.sezioni.flatMap((s, j) =>
      paragrafi(s.testo).map((testo) => {
        const chiave = chiavi.get(testo) ?? chiaveParagrafo(testo)
        usate.set(testo, chiave)
        return { capitoloId: c.id, sezioneId: s.id, sezione: `${i + 1}.${j + 1} ${s.titolo}`, testo, chiave }
      }),
    ),
  )
  chiavi.clear()
  for (const [t, k] of usate) chiavi.set(t, k)
  return elenco
}

/** Controlla le frasi. Con `tutto` dimentica i controlli precedenti e rifà ogni paragrafo. */
export async function controllaSomiglianze(tutto = false): Promise<void> {
  if (useSomiglianze.getState().inCorso) return
  useSomiglianze.setState({ inCorso: true, avanzamento: 0, fase: 'Preparo le fonti…', errore: null })
  try {
    const { fonti } = useStudio.getState().progetto
    const biblioteca = sorgentiBiblioteca(fonti)
    const pars = paragrafiTesi()
    if (!pars.length) throw new Error('Nella tesi non c\'è ancora niente di scritto da controllare.')
    if (!biblioteca.length && statisticheCorpus().passaggi === 0) {
      throw new Error('Non ho fonti con cui confrontare: carica il materiale del corso o qualche PDF in biblioteca.')
    }

    const richiesta = chiedi<EsitoControllo & { fonti: number }>(
      { tipo: 'somiglianze', firmaCorpus: firmaCorpus(), fonti: biblioteca, paragrafi: pars.map((p) => ({ chiave: p.chiave, testo: p.testo })), tutto },
      (avanzamento, fase) => useSomiglianze.setState({ avanzamento, fase }),
    )
    lavoro = richiesta.id
    const esito = await richiesta.esito

    // Le frasi si numerano su tutta la tesi, come sempre.
    const simili: FraseSimile[] = []
    let frasi = 0
    let parole = 0
    esito.paragrafi.forEach((e, i) => {
      const p = pars[i]
      for (const s of e.simili) {
        simili.push({
          id: `sim-${frasi + s.frase}`,
          capitoloId: p.capitoloId,
          sezioneId: p.sezioneId,
          sezione: p.sezione,
          frase: s.testo,
          uguali: s.uguali,
          punteggio: s.punteggio,
          livello: s.livello,
          fonte: s.fonte,
          tipoFonte: s.tipoFonte,
          passo: s.passo,
          passoUguali: s.passoUguali,
          citata: s.citata,
        })
      }
      frasi += e.frasi
      parole += e.parole
    })
    // Prima le più simili e non ancora citate.
    simili.sort((a, b) => Number(a.citata) - Number(b.citata) || b.punteggio - a.punteggio)
    useSomiglianze.setState({
      esito: { data: new Date().toISOString(), frasi, fonti: esito.fonti, parole, simili, ricontrollati: esito.ricontrollati, paragrafi: pars.length },
      avanzamento: 1,
      fase: '',
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') useSomiglianze.setState({ fase: '' })
    else if (err instanceof Error && err.name === 'FirmaDiversa') {
      useSomiglianze.setState({ errore: 'Sto ancora salvando i file del corso: riprova fra un attimo.' })
    } else useSomiglianze.setState({ errore: err instanceof Error ? err.message : 'Il controllo si è fermato per un errore.' })
  } finally {
    useSomiglianze.setState({ inCorso: false })
    lavoro = null
  }
}
