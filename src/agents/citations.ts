import type { Citazione, EsitoTestuale } from '../types'

/** Un riferimento citabile: una fonte della biblioteca o un passaggio del corso. */
export interface Riferimento {
  etichetta: string
  tipo: 'fonte' | 'corso'
  titolo: string
  collocazione: string
  testo: string
}

/**
 * Verifica deterministica delle citazioni: l'estratto che un agente attribuisce
 * a una fonte deve comparire davvero nel testo di quella fonte. Il controllo è
 * fatto in codice, non dal modello: la normalizzazione tollera solo differenze
 * di punteggiatura, maiuscole, accenti e spazi.
 */

export function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[^a-z0-9%€$.,'"-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parole(testo: string): string[] {
  return normalizza(testo)
    .replace(/[.,'"-]/g, ' ')
    .split(' ')
    .filter(Boolean)
}

/** Trigrammi di parole, calcolati una volta per testo sorgente. */
const cacheTrigrammi = new Map<string, Set<string>>()

function trigrammi(testo: string): Set<string> {
  const chiave = testo.length > 200 ? `${testo.length}:${testo.slice(0, 80)}:${testo.slice(-80)}` : testo
  const presente = cacheTrigrammi.get(chiave)
  if (presente) return presente

  const p = parole(testo)
  const insieme = new Set<string>()
  for (let i = 0; i + 2 < p.length; i++) insieme.add(`${p[i]} ${p[i + 1]} ${p[i + 2]}`)
  if (cacheTrigrammi.size > 200) cacheTrigrammi.clear()
  cacheTrigrammi.set(chiave, insieme)
  return insieme
}

/**
 * - "verificato": l'estratto compare alla lettera (a meno di punteggiatura e spazi);
 * - "approssimato": almeno l'80% dei suoi trigrammi di parole compare nella fonte;
 * - "non_trovato": altrimenti.
 */
export function verificaEstratto(estratto: string, testoFonte: string): EsitoTestuale {
  const e = normalizza(estratto)
  if (e.length < 12 || !testoFonte) return 'non_trovato'

  const fonte = normalizza(testoFonte)
  if (fonte.includes(e)) return 'verificato'

  // Tolleranza sulla sola punteggiatura interna.
  const eNuda = e.replace(/[.,'"-]/g, ' ').replace(/\s+/g, ' ')
  const fonteNuda = fonte.replace(/[.,'"-]/g, ' ').replace(/\s+/g, ' ')
  if (fonteNuda.includes(eNuda)) return 'verificato'

  const pe = parole(estratto)
  if (pe.length < 4) return 'non_trovato'
  const insieme = trigrammi(testoFonte)
  let trovati = 0
  let totali = 0
  for (let i = 0; i + 2 < pe.length; i++) {
    totali += 1
    if (insieme.has(`${pe[i]} ${pe[i + 1]} ${pe[i + 2]}`)) trovati += 1
  }
  return totali > 0 && trovati / totali >= 0.8 ? 'approssimato' : 'non_trovato'
}

/** Verifica ogni citazione di un paragrafo contro i riferimenti disponibili. */
export function verificaCitazioni(citazioni: Citazione[], riferimenti: Riferimento[]): Citazione[] {
  const perEtichetta = new Map(riferimenti.map((r) => [r.etichetta.toUpperCase(), r]))
  return citazioni.map((c) => {
    const rif = perEtichetta.get((c.rif ?? '').trim().toUpperCase())
    const testuale: EsitoTestuale = rif ? verificaEstratto(c.estratto ?? '', rif.testo) : 'rif_sconosciuto'
    return { ...c, testuale }
  })
}

const MARCATORE = /\[((?:F|C)\d+)\]/gi

/** Marcatori [F1] [C3] presenti nel testo del paragrafo. */
export function marcatori(testo: string): string[] {
  return [...testo.matchAll(MARCATORE)].map((m) => m[1].toUpperCase())
}

export interface EsameCitazioni {
  totali: number
  verificate: number
  approssimate: number
  nonTrovate: Citazione[]
  rifSconosciuti: Citazione[]
  /** Marcatori nel testo senza citazione corrispondente, o viceversa. */
  incoerenze: string[]
}

/** Confronta i marcatori del testo con le citazioni registrate e ne conta gli esiti. */
export function esaminaCitazioni(testo: string, citazioni: Citazione[]): EsameCitazioni {
  const esame: EsameCitazioni = {
    totali: 0,
    verificate: 0,
    approssimate: 0,
    nonTrovate: [],
    rifSconosciuti: [],
    incoerenze: [],
  }
  const nelTesto = new Set(marcatori(testo))
  const citati = new Set(citazioni.map((c) => (c.rif ?? '').toUpperCase()))
  for (const m of nelTesto) if (!citati.has(m)) esame.incoerenze.push(`il rimando [${m}] non ha una citazione`)
  for (const c of citati) if (!nelTesto.has(c)) esame.incoerenze.push(`la citazione ${c} non ha il suo rimando nel testo`)

  for (const c of citazioni) {
    esame.totali += 1
    switch (c.testuale) {
      case 'verificato':
        esame.verificate += 1
        break
      case 'approssimato':
        esame.approssimate += 1
        break
      case 'rif_sconosciuto':
        esame.rifSconosciuti.push(c)
        break
      default:
        esame.nonTrovate.push(c)
    }
  }
  return esame
}
