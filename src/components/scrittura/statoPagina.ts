import { create } from 'zustand'

/** Comandi del menu "Chiedi allo scrittore" che chiedono una conferma prima di partire. */
export type VoceScrittore = 'bozza' | 'riscrivi' | 'alternative' | 'corso' | 'revisore'

/** Stato della sola pagina Scrittura (non va salvato nel progetto). */
interface StatoPagina {
  /** Voce scelta dal menu, in attesa di "Procedi". */
  scelta: VoceScrittore | null
  /** Cassetto "Fonti e appunti" aperto. */
  strumenti: boolean
}

export const usePaginaScrittura = create<StatoPagina>(() => ({ scelta: null, strumenti: false }))

export const scegliVoce = (scelta: VoceScrittore | null) => usePaginaScrittura.setState({ scelta })
export const apriStrumenti = (strumenti: boolean) => usePaginaScrittura.setState({ strumenti })
