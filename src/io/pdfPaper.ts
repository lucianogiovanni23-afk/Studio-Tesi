import { metadatiDaDoi } from '../agents/cataloghi'
import { estraiPdf } from '../agents/corpus'
import { unisciPagine } from '../domain/pagine'
import { adesso, nuovoId } from '../domain/progettoIniziale'
import type { Fonte } from '../types'

const DOI = /\b10\.\d{4,9}\/[^\s"<>,;]+/i
const MAX_TESTO = 400_000

export interface TestoConPagine {
  testo: string
  /** Dove inizia ogni pagina nel testo. */
  pagine: number[]
}

/** Unisce le pagine di un PDF tenendo traccia di dove inizia ciascuna, entro il limite di lunghezza. */
export function daPagine(pagine: string[]): TestoConPagine {
  const { testo, inizi } = unisciPagine(pagine)
  return { testo: testo.slice(0, MAX_TESTO), pagine: inizi.filter((i) => i < MAX_TESTO) }
}

/** Testo di un PDF (file o byte scaricati), con la segnalazione dei PDF scansionati. */
export async function testoDaBuffer(buffer: ArrayBuffer, suPagina?: (n: number, tot: number) => void): Promise<TestoConPagine> {
  const esito = await estraiPdf(buffer, suPagina)
  if (esito.scansionato) {
    throw new Error('Questo PDF è una scansione, quindi non riesco a leggere il testo. Passalo in un\'app che riconosce il testo (OCR) e caricalo di nuovo.')
  }
  return daPagine(esito.pagine)
}

export async function testoDaPdf(file: File, suPagina?: (n: number, tot: number) => void): Promise<TestoConPagine> {
  return testoDaBuffer(await file.arrayBuffer(), suPagina)
}

/**
 * Crea una fonte da un PDF caricato. Se nelle prime pagine c'è un DOI, i
 * metadati (autori, anno, rivista) si prendono da Crossref; altrimenti il
 * titolo viene dal nome del file e i metadati si completano a mano.
 */
export async function fonteDaPdf(file: File, suPagina?: (n: number, tot: number) => void): Promise<{ fonte: Fonte; nota: string }> {
  const { testo, pagine } = await testoDaPdf(file, suPagina)
  const doi = (testo.slice(0, 12_000).match(DOI)?.[0] ?? '').replace(/[.)\]]+$/, '').toLowerCase()
  let nota = doi ? '' : 'Nel PDF non ho trovato il codice DOI: scrivi tu autori e anno.'
  let meta = null
  if (doi) {
    try {
      meta = await metadatiDaDoi(doi)
    } catch {
      nota = `Ho trovato il DOI ${doi}, ma Crossref non risponde: scrivi tu autori e anno.`
    }
  }
  const fonte: Fonte = {
    id: nuovoId('fonte'),
    numero: 0, // assegnato quando entra in biblioteca
    tipo: 'pdf',
    origine: 'pdf',
    titolo: meta?.titolo || file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '),
    autori: meta?.autori ?? [],
    anno: meta?.anno ?? null,
    rivista: meta?.rivista ?? '',
    doi: meta?.doi ?? doi,
    url: meta?.url ?? (doi ? `https://doi.org/${doi}` : ''),
    lingua: meta?.lingua ?? '',
    abstract: meta?.abstract ?? '',
    estratti: [],
    temi: [],
    stato: 'da_leggere',
    usataIn: [],
    scheda: null,
    testo,
    pagine,
    paginaIniziale: meta?.primaPagina ?? 1,
    testoCompleto: true,
    aggiuntaIl: adesso(),
  }
  return { fonte, nota }
}
