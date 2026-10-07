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

/** "Paolo Rossi" → "Rossi, P."; gli enti restano interi. */
function autoreInverso(autore: string): string {
  const c = cognome(autore)
  if (c === autore.trim()) return c
  if (autore.includes(',')) {
    const [cogn, nomi] = autore.split(',').map((x) => x.trim())
    return `${cogn}, ${iniziali(nomi)}`
  }
  const nomi = autore.trim().slice(0, autore.trim().length - c.length).trim()
  return `${c}, ${iniziali(nomi)}`
}

/** "Paolo Rossi" → "P. Rossi". */
function autoreDiretto(autore: string): string {
  const c = cognome(autore)
  if (c === autore.trim()) return c
  if (autore.includes(',')) {
    const [cogn, nomi] = autore.split(',').map((x) => x.trim())
    return `${iniziali(nomi)} ${cogn}`
  }
  const nomi = autore.trim().slice(0, autore.trim().length - c.length).trim()
  return `${iniziali(nomi)} ${c}`
}

function iniziali(nomi: string): string {
  return nomi
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((n) => `${n[0].toUpperCase()}.`)
    .join(' ')
}

function collegamento(f: Fonte): string {
  return f.doi ? `https://doi.org/${f.doi}` : f.url
}

/** Una voce di bibliografia dai metadati veri, nello stile scelto. */
export function voceBibliografia(f: Fonte, stile: 'autore-anno' | 'note'): string {
  const anno = f.anno ?? 's.d.'
  const link = collegamento(f)
  if (stile === 'note') {
    const autori = f.autori.length ? f.autori.map(autoreDiretto).join(', ') : 'Autore n.d.'
    return [`${autori}, ${f.titolo}`, f.rivista ? `in «${f.rivista}»` : '', String(anno), link].filter(Boolean).join(', ') + '.'
  }
  const autori = f.autori.length
    ? f.autori.length === 1
      ? autoreInverso(f.autori[0])
      : `${f.autori.slice(0, -1).map(autoreInverso).join(', ')} e ${autoreInverso(f.autori[f.autori.length - 1])}`
    : 'Autore n.d.'
  return [`${autori} (${anno}). ${f.titolo}.`, f.rivista ? `${f.rivista}.` : '', link].filter(Boolean).join(' ')
}

export interface Bibliografia {
  voci: { fonte: Fonte; testo: string }[]
  /** File del materiale del corso citati nel testo. */
  corso: string[]
  /** Fonti in biblioteca mai citate nel testo. */
  nonCitate: Fonte[]
  /** Marcatori [F..] che non corrispondono a nessuna fonte in biblioteca. */
  mancanti: string[]
}

/** Bibliografia delle fonti effettivamente citate nella tesi, in ordine alfabetico. */
export function bibliografia(
  capitoli: { sezioni: { testo: string; citazioni: { rif: string; passaggio?: { file: string } }[] }[] }[],
  fonti: Fonte[],
  stile: 'autore-anno' | 'note',
): Bibliografia {
  const numeri = new Set<number>()
  const corso = new Set<string>()
  for (const c of capitoli) {
    for (const s of c.sezioni) {
      for (const m of s.testo.matchAll(/\[F(\d+)\]/g)) numeri.add(Number(m[1]))
      const presenti = new Set([...s.testo.matchAll(/\[(C\d+)\]/g)].map((m) => m[1]))
      for (const ci of s.citazioni) if (ci.passaggio && presenti.has(ci.rif)) corso.add(ci.passaggio.file)
    }
  }
  const citate = fonti.filter((f) => numeri.has(f.numero))
  const ordinate = [...citate].sort(
    (a, b) =>
      (a.autori[0] ? cognome(a.autori[0]) : a.titolo).localeCompare(b.autori[0] ? cognome(b.autori[0]) : b.titolo, 'it') ||
      (a.anno ?? 0) - (b.anno ?? 0),
  )
  return {
    voci: ordinate.map((f) => ({ fonte: f, testo: voceBibliografia(f, stile) })),
    corso: [...corso].sort((a, b) => a.localeCompare(b, 'it')),
    nonCitate: fonti.filter((f) => !numeri.has(f.numero)),
    mancanti: [...numeri].filter((n) => !fonti.some((f) => f.numero === n)).map((n) => `F${n}`),
  }
}
