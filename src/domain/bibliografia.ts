import type { Fonte } from '../types'

/** Cognome di un autore scritto come "Nome Cognome" o "Cognome, Nome". */
export function cognome(autore: string): string {
  const a = autore.trim()
  if (a.includes(',')) return a.split(',')[0].trim()
  const parti = a.split(/\s+/)
  // Un'ultima parola minuscola indica un ente ("Revista ejemplo"), non un cognome.
  if (parti.length > 1 && /^[a-zà-ÿ]/.test(parti[parti.length - 1])) return a
  // Enti e sigle (ISMEA, Commissione europea) restano interi.
  if (parti.length === 1 || a === a.toUpperCase() || /^(istituto|commissione|agenzia|centro|consiglio|regione|ministero)/i.test(a)) return a
  return parti[parti.length - 1]
}

/** Rimando nel testo in stile autore-anno: (Rossi, 2021), (Rossi e Bianchi, 2021), (Rossi et al., 2021). */
export function autoreAnno(f: Pick<Fonte, 'autori' | 'anno' | 'titolo'>, parentesi = true): string {
  const nomi = f.autori.map(cognome).filter(Boolean)
  const chi =
    nomi.length === 0
      ? f.titolo.split(/\s+/).slice(0, 3).join(' ')
      : nomi.length === 1
        ? nomi[0]
        : nomi.length === 2
          ? `${nomi[0]} e ${nomi[1]}`
          : `${nomi[0]} et al.`
  const testo = `${chi}, ${f.anno ?? 's.d.'}`
  return parentesi ? `(${testo})` : testo
}

export const ETICHETTA_ORIGINE: Record<Fonte['origine'], string> = {
  openalex: 'OpenAlex',
  crossref: 'Crossref',
  semanticscholar: 'Semantic Scholar',
  istituzionale: 'sito istituzionale',
  web: 'web',
  pdf: 'PDF caricato',
}

export const ETICHETTA_STATO_FONTE = {
  da_leggere: 'da leggere',
  letta: 'letta',
  usata: 'usata',
} as const
