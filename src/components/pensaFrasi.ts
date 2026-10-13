import type { AgentKey } from '../types'

/** Cosa dice ognuno mentre lavora: la prima frase subito, le altre a turno. */
export const FRASI_PENSA: Record<AgentKey, string[]> = {
  lettore: ['Sto leggendo le lezioni…', 'Cerco il concetto giusto nel corso…', 'Rileggo gli appunti…'],
  bibliotecario: ['Cerco negli articoli…', 'Sfoglio le schede di lettura…', 'Controllo le fonti…'],
  scrittore: ['Sto scrivendo…', 'Cerco le parole giuste…', 'Rileggo la frase…'],
  revisore: ['Sto controllando…', 'Rileggo la tesi…', 'Guardo che tutto torni…'],
}

/**
 * Sceglie il collega più adatto a una domanda libera, dalle parole che usa.
 * Serve alla chat, che parla a nome di tutto lo studio.
 */
export function collegaPerDomanda(testo: string): AgentKey {
  const t = testo.toLowerCase()
  if (/\b(lezion|corso|concett|teori|profess|appunt|glossari)/.test(t)) return 'lettore'
  if (/\b(fonti|fonte|articol|biblio|paper|letto|leggere|cerca|ricerca|doi|autor)/.test(t)) return 'bibliotecario'
  if (/\b(scriv|bozza|capitol|paragraf|sezion|riscriv|scalett|frase|introduz|conclusion)/.test(t)) return 'scrittore'
  return 'revisore'
}
