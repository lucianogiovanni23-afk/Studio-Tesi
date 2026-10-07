import type { Capitolo, Preferenze, Progetto, Sezione, VoceGlossario } from '../types'
import { DOMANDA_PREDEFINITA, GLOSSARIO_INIZIALE, INDICE_INIZIALE, TITOLO_PREDEFINITO } from './dominio'

export function nuovoId(prefisso: string): string {
  return `${prefisso}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function adesso(): string {
  return new Date().toISOString()
}

export function nuovaSezione(titolo: string, obiettivo = ''): Sezione {
  return {
    id: nuovoId('sez'),
    titolo,
    obiettivo,
    testo: '',
    versioni: [],
    citazioni: [],
    scaletta: [],
    scalettaApprovata: false,
    fontiApprovate: [],
    fontiConfermate: false,
    aggiornataIl: adesso(),
  }
}

export function nuovoCapitolo(titolo: string): Capitolo {
  return { id: nuovoId('cap'), titolo, stato: 'da_fare', sezioni: [] }
}

export function glossarioIniziale(): VoceGlossario[] {
  return GLOSSARIO_INIZIALE.map((v) => ({ id: nuovoId('gl'), ...v, nota: '', origine: 'iniziale' as const }))
}

export function progettoIniziale(): Progetto {
  return {
    titolo: TITOLO_PREDEFINITO,
    domanda: DOMANDA_PREDEFINITA,
    casoAziendale: { attivo: false, descrizione: '' },
    stileCitazione: 'autore-anno',
    capitoli: INDICE_INIZIALE.map((c) => ({
      ...nuovoCapitolo(c.titolo),
      sezioni: c.sezioni.map((s) => nuovaSezione(s.titolo, s.obiettivo)),
    })),
    indiceApprovato: false,
    indiceApprovatoIl: null,
    glossario: glossarioIniziale(),
    fonti: [],
    inAttesa: [],
    ricerche: [],
    osservazioni: [],
    controllo: null,
    chat: [],
    courseFiles: [],
    quadro: null,
    usi: [],
    budgetMensile: null,
    creatoIl: adesso(),
    salvatoSuFileIl: null,
  }
}

export const MODELLI_PREDEFINITI: Preferenze['modelli'] = {
  bibliotecario: 'claude-sonnet-5-5',
  // La selezione dei risultati è un compito semplice: basta il modello più economico.
  selezione: 'claude-haiku-4-5',
  lettore: 'claude-sonnet-5-5',
  scrittore: 'claude-opus-5-5',
  revisore: 'claude-sonnet-5-5',
  chat: 'claude-sonnet-5-5',
}

export function preferenzeIniziali(): Preferenze {
  return { modelli: { ...MODELLI_PREDEFINITI }, modalitaScena: 'auto', modoUso: 'auto' }
}

/** Firma dei file del corso pronti: cambia quando se ne aggiunge o toglie uno. */
export function firmaCorso(p: Pick<Progetto, 'courseFiles'>): string {
  return p.courseFiles
    .filter((f) => f.status === 'pronto')
    .map((f) => f.id)
    .sort()
    .join('|')
}

/**
 * Completa un progetto salvato con una versione precedente dell'app: campi
 * nuovi con il valore iniziale e un numero stabile per ogni fonte.
 */
export function normalizzaProgetto(p: Progetto): Progetto {
  let prossimo = Math.max(0, ...p.fonti.map((f) => f.numero ?? 0)) + 1
  return {
    ...p,
    fonti: p.fonti.map((f) => (f.numero ? f : { ...f, numero: prossimo++ })),
    osservazioni: (p.osservazioni ?? []).map((o) => ({ ...o, proposte: o.proposte ?? [], lettura: o.lettura ?? '' })),
    controllo: p.controllo ?? null,
    chat: p.chat ?? [],
    budgetMensile: p.budgetMensile ?? null,
    capitoli: p.capitoli.map((c) => ({
      ...c,
      sezioni: c.sezioni.map((s) => ({ ...nuovaSezione(s.titolo), ...s, fontiConfermate: s.fontiConfermate ?? false })),
    })),
  }
}

/** Numero da dare alla prossima fonte. */
export function prossimoNumero(fonti: { numero: number }[]): number {
  return Math.max(0, ...fonti.map((f) => f.numero ?? 0)) + 1
}
