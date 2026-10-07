import { verificaEstratto } from '../agents/citations'
import type { Fonte } from '../types'

/**
 * Testi presi da un PDF con il loro numero di pagina: si conserva dove inizia
 * ogni pagina, così un estratto citato si può ricondurre alla sua pagina e la
 * citazione diventa "(Rossi, 2021, p. 12)".
 */

const SEPARATORE = '\n\n'

/** Unisce le pagine e ricorda dove comincia ciascuna. */
export function unisciPagine(pagine: string[]): { testo: string; inizi: number[] } {
  const inizi: number[] = []
  let testo = ''
  for (const p of pagine) {
    if (testo) testo += SEPARATORE
    inizi.push(testo.length)
    testo += p
  }
  return { testo, inizi }
}

/** Testo di una pagina (da 0), con l'inizio della successiva per gli estratti a cavallo. */
function testoPagina(f: Fonte, i: number, conSeguito: boolean): string {
  const inizi = f.pagine ?? []
  const fine = i + 1 < inizi.length ? inizi[i + 1] : f.testo.length
  const seguito = conSeguito && i + 1 < inizi.length ? Math.min(f.testo.length, fine + 600) : fine
  return f.testo.slice(inizi[i], seguito)
}

/** Numero stampato della pagina in cui si trova l'estratto, oppure null se la fonte non ha pagine o l'estratto non si ritrova. */
export function paginaEstratto(f: Fonte | undefined, estratto: string): number | null {
  if (!f?.pagine?.length || !estratto.trim()) return null
  const scarto = (f.paginaIniziale ?? 1) - 1
  // Prima la corrispondenza alla lettera dentro una pagina, poi quella a cavallo con la successiva, poi quella quasi letterale.
  for (const modo of ['dentro', 'cavallo', 'quasi'] as const) {
    for (let i = 0; i < f.pagine.length; i++) {
      const esito = verificaEstratto(estratto, testoPagina(f, i, modo !== 'dentro'))
      if (esito === 'verificato' || (modo === 'quasi' && esito === 'approssimato')) return i + 1 + scarto
    }
  }
  return null
}

/** Pagine iniziali da metadati come "245-267" o "e0123". */
export function primaPaginaDa(pagine: string | null | undefined): number | undefined {
  const n = Number.parseInt(String(pagine ?? '').match(/\d+/)?.[0] ?? '', 10)
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : undefined
}
