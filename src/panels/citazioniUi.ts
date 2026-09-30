import type { Citazione, Opzione, Riferimento } from '../types'

export type Semaforo = 'ok' | 'avviso' | 'errore'

/** Esito complessivo di una citazione: controllo testuale più giudizio del Controllore. */
export function semaforo(c: Citazione): Semaforo {
  const t = c.verifica?.testuale
  const g = c.verifica?.giudizio
  if (t === 'non_trovato' || t === 'rif_sconosciuto' || g === 'non_supportata') return 'errore'
  if (t === 'approssimato' || g === 'parziale') return 'avviso'
  return 'ok'
}

export const PEGGIORE: Record<Semaforo, number> = { ok: 0, avviso: 1, errore: 2 }

/** Testo semplice per la copia: marcatori mantenuti, riferimenti in fondo. */
export function testoPerCopia(o: Opzione, riferimenti: Riferimento[]): string {
  if (!o.risultato) return ''
  const usati = new Set(o.risultato.paragrafi.flatMap((p) => p.citazioni.map((c) => c.rif)))
  const elenco = riferimenti
    .filter((r) => usati.has(r.etichetta))
    .map((r) => `[${r.etichetta}] ${r.titolo} — ${r.collocazione}`)
  return [
    o.risultato.titolo,
    '',
    ...o.risultato.paragrafi.flatMap((p) => [p.titoletto, p.testo, '']),
    ...(elenco.length > 0 ? ['Riferimenti', ...elenco] : []),
  ].join('\n')
}

