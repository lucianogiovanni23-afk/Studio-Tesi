import { contaParoleTesto, quadroObsoleto } from '../store'
import type { Progetto, Schermata } from '../types'

export interface AvanzamentoCapitolo {
  id: string
  numero: number
  titolo: string
  parole: number
  pagine: number
  /** Pagine attese per questo capitolo, in proporzione alle sue sezioni. */
  obiettivoMin: number
  obiettivoMax: number
}

export interface Avanzamento {
  parole: number
  pagine: number
  pagineMin: number
  pagineMax: number
  /** Da 0 a 1 rispetto al minimo di pagine. */
  quota: number
  mancano: number
  capitoli: AvanzamentoCapitolo[]
}

const unDecimale = (n: number) => Math.round(n * 10) / 10

/** Pagine scritte rispetto all'obiettivo, per tutta la tesi e capitolo per capitolo. */
export function avanzamento(p: Progetto): Avanzamento {
  const { pagineMin, pagineMax, parolePerPagina } = p.obiettivo
  const sezioniTotali = Math.max(1, p.capitoli.reduce((n, c) => n + c.sezioni.length, 0))
  const capitoli = p.capitoli.map((c, i) => {
    const parole = c.sezioni.reduce((n, s) => n + contaParoleTesto(s.testo), 0)
    const peso = c.sezioni.length / sezioniTotali
    return {
      id: c.id,
      numero: i + 1,
      titolo: c.titolo,
      parole,
      pagine: unDecimale(parole / parolePerPagina),
      obiettivoMin: Math.max(1, Math.round(pagineMin * peso)),
      obiettivoMax: Math.max(1, Math.round(pagineMax * peso)),
    }
  })
  const parole = capitoli.reduce((n, c) => n + c.parole, 0)
  const pagine = unDecimale(parole / parolePerPagina)
  return {
    parole,
    pagine,
    pagineMin,
    pagineMax,
    quota: Math.min(1, pagine / pagineMin),
    mancano: Math.max(0, Math.ceil(pagineMin - pagine)),
    capitoli,
  }
}

export type StatoPasso = 'da_iniziare' | 'in_corso' | 'fatto'

export interface PassoPercorso {
  id: 'corso' | 'fonti' | 'scrittura' | 'revisione'
  numero: number
  titolo: string
  cosa: string
  stato: StatoPasso
  riassunto: string
  vai: Schermata
  azione: string
}

/** I quattro passi del lavoro, con lo stato di ciascuno. */
export function percorso(p: Progetto): PassoPercorso[] {
  const pronti = p.courseFiles.filter((f) => f.status === 'pronto').length
  const conScheda = p.fonti.filter((f) => f.scheda).length
  const sezioni = p.capitoli.flatMap((c) => c.sezioni)
  const scritte = sezioni.filter((s) => s.testo.trim()).length
  const conFonti = sezioni.filter((s) => s.fontiConfermate).length
  const aperte = p.osservazioni.filter((o) => o.stato === 'aperta').length
  const approvati = p.capitoli.filter((c) => c.stato === 'approvato').length

  return [
    {
      id: 'corso',
      numero: 1,
      titolo: 'Corso',
      cosa: "Carica le lezioni: l'app impara la terminologia e i confini della materia.",
      stato: pronti === 0 ? 'da_iniziare' : p.quadro && !quadroObsoleto(p) ? 'fatto' : 'in_corso',
      riassunto: `${pronti} file · quadro teorico ${p.quadro ? (quadroObsoleto(p) ? 'da aggiornare' : 'pronto') : 'da generare'}`,
      vai: 'corso',
      azione: pronti === 0 ? 'Carica le lezioni' : p.quadro ? 'Apri' : 'Genera il quadro',
    },
    {
      id: 'fonti',
      numero: 2,
      titolo: 'Fonti',
      cosa: 'Cerca articoli e dati, leggili con le schede e scegli quelli per ogni sezione.',
      stato: p.fonti.length === 0 ? 'da_iniziare' : sezioni.length > 0 && conFonti === sezioni.length ? 'fatto' : 'in_corso',
      riassunto: `${p.fonti.length} fonti · ${conScheda} con scheda · ${conFonti}/${sezioni.length} sezioni con fonti scelte`,
      vai: p.fonti.length === 0 ? 'ricerca' : 'biblioteca',
      azione: p.fonti.length === 0 ? 'Cerca le prime fonti' : 'Apri',
    },
    {
      id: 'scrittura',
      numero: 3,
      titolo: 'Scrittura',
      cosa: 'Per ogni sezione: fonti, scaletta, bozza. Ogni citazione viene verificata.',
      stato: scritte === 0 ? 'da_iniziare' : scritte === sezioni.length ? 'fatto' : 'in_corso',
      riassunto: `${scritte}/${sezioni.length} sezioni scritte`,
      vai: 'scrittura',
      azione: scritte === 0 ? 'Inizia a scrivere' : 'Continua',
    },
    {
      id: 'revisione',
      numero: 4,
      titolo: 'Revisione',
      cosa: 'Osservazioni del relatore, controllo di tutta la tesi, bibliografia e Word.',
      stato: approvati === p.capitoli.length && p.capitoli.length > 0 ? 'fatto' : aperte > 0 || p.controllo || approvati > 0 ? 'in_corso' : 'da_iniziare',
      riassunto: `${aperte} osservazioni aperte · ${approvati}/${p.capitoli.length} capitoli approvati`,
      vai: 'revisione',
      azione: 'Apri',
    },
  ]
}
