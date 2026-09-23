/** Tipi condivisi fra store, pipeline, pannelli e scena 3D. */

export type AgentKey = 'lettore' | 'ricercatore' | 'selettore' | 'scrittore' | 'controllore'

export type AgentStatus = 'idle' | 'walking' | 'working' | 'waiting' | 'done' | 'error'

// ---------------------------------------------------------------------------
// Risultati strutturati dei cinque agenti (tool use / output strutturato)
// ---------------------------------------------------------------------------

export interface ConcettoChiave {
  termine: string
  definizione: string
  lezione_di_riferimento: string
}

export interface RisultatoLettore {
  concetti_chiave: ConcettoChiave[]
  collegamenti_argomento: string[]
  metriche_applicabili: string[]
  sintesi_dati_caso: string
}

export type TipoFonte = 'paper' | 'dataset' | 'articolo' | 'report'

export interface Fonte {
  titolo: string
  url: string
  tipo: TipoFonte
  descrizione: string
  perche_rilevante: string
  /** Impostata in codice: l'URL compare nei blocchi web_search_tool_result. */
  verificata: boolean
}

export interface FonteScartata {
  titolo: string
  url: string
  motivo: string
}

export interface RisultatoRicercatore {
  fonti: Fonte[]
  fonti_scartate: FonteScartata[]
}

export interface SceltaFonte {
  url: string
  motivo: string
}

export interface RisultatoSelettore {
  selezionate: SceltaFonte[]
  scartate: SceltaFonte[]
  copertura_sufficiente: boolean
}

export interface Paragrafo {
  titoletto: string
  testo: string
}

export interface RisultatoScrittore {
  titolo: string
  paragrafi: Paragrafo[]
  fonti_citate: string[]
  parole: number
}

export type ImpiantoKey = 'A' | 'B' | 'C'

export interface ValutazioneOpzione {
  punti_di_forza: string[]
  criticita: string[]
}

export interface Opzione {
  impianto: ImpiantoKey
  etichetta: string
  passaggi: string[]
  risultato: RisultatoScrittore | null
  stato: 'in_corso' | 'ok' | 'errore'
  errore: string | null
  valutazione: ValutazioneOpzione | null
}

export type EsitoVoce = 'ok' | 'problema' | 'non_applicabile'

export interface VoceChecklist {
  id: string
  voce: string
  esito: EsitoVoce
  dettaglio: string
  /** Agente a cui attribuire il problema, per il bottone "rigenera". */
  agente: AgentKey | null
}

export interface RisultatoControllore {
  checklist: VoceChecklist[]
  valutazioni: { opzione: ImpiantoKey; punti_di_forza: string[]; criticita: string[] }[]
}

/** Involucro comune: ogni agente consegna i passaggi del ragionamento più il risultato. */
export interface Consegna<T> {
  passaggi: string[]
  risultato: T
}

// ---------------------------------------------------------------------------
// Stato runtime di un agente
// ---------------------------------------------------------------------------

export interface AgentRuntime {
  status: AgentStatus
  /** Micro-etichetta sempre visibile sopra la testa. */
  microLabel: string
  /** Ragionamento già diviso in passaggi, per le nuvolette. */
  passaggi: string[]
  errore: string | null
  arrived: boolean
  tentativi: number
}

// ---------------------------------------------------------------------------
// File caricati
// ---------------------------------------------------------------------------

export type UploadStatus = 'lettura' | 'pronto' | 'errore'

export interface CourseFile {
  id: string
  name: string
  size: number
  kind: 'pdf' | 'testo'
  /** 0-100, calcolata sui byte letti da FileReader.onprogress. */
  progress: number
  status: UploadStatus
  base64?: string
  text?: string
  errore?: string
}

export interface CaseTable {
  /** Nome del foglio (Excel) o del file (CSV). */
  foglio: string
  colonne: string[]
  righe: Record<string, string>[]
  totaleRighe: number
}

export interface CaseFile {
  id: string
  name: string
  size: number
  kind: 'csv' | 'excel'
  progress: number
  status: UploadStatus
  tabelle: CaseTable[]
  /** Riepilogo testuale inviato agli agenti. */
  riepilogo: string
  errore?: string
}

// ---------------------------------------------------------------------------
// Console di diagnostica
// ---------------------------------------------------------------------------

export type LogKind = 'ok' | 'avviso' | 'riparazione' | 'fallimento' | 'info'

export interface LogEntry {
  id: number
  at: number
  kind: LogKind
  agente: AgentKey | null
  messaggio: string
}

// ---------------------------------------------------------------------------
// Approvazione e chat
// ---------------------------------------------------------------------------

export type ApprovalStatus = 'inattiva' | 'in_attesa' | 'approvata' | 'rifiutata'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Voce della banda ticker in cima alla pagina. */
export interface TickerItem {
  id: number
  testo: string
  segno: '▲' | '▼' | '●'
}
