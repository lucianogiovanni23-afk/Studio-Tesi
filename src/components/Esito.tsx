import type { EsitoTestuale } from '../types'

const TESTO: Record<EsitoTestuale, string> = {
  verificato: 'verificato alla lettera',
  approssimato: 'quasi letterale',
  non_trovato: 'non ritrovato nel testo',
  rif_sconosciuto: 'riferimento inesistente',
}

const COLORE: Record<EsitoTestuale, 'verde' | 'ambra' | 'rosso'> = {
  verificato: 'verde',
  approssimato: 'ambra',
  non_trovato: 'rosso',
  rif_sconosciuto: 'rosso',
}

/** Bollino verde / ambra / rosso dell'esito del controllo in codice. */
export function Esito({ esito }: { esito: EsitoTestuale }) {
  return <span className={`esito esito-${COLORE[esito]}`}>{TESTO[esito]}</span>
}
