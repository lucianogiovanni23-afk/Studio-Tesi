/** Tipi condivisi fra store, pipeline, pannelli e scena 3D. */

export type AgentKey = 'lettore' | 'ricercatore' | 'selettore' | 'scrittore' | 'controllore'

export type AgentStatus = 'idle' | 'walking' | 'working' | 'waiting' | 'done' | 'error'

// ---------------------------------------------------------------------------
// Materiale del corso: passaggi estratti dai PDF
// ---------------------------------------------------------------------------

/** Porzione di testo del corso, con file e pagine di provenienza. */
export interface Passaggio {
  id: string
  fileId: string
  file: string
  /** Prima e ultima pagina coperte dal passaggio. */
  pagine: [number, number]
  testo: string
}

/** Quanto materiale del corso leggono gli agenti a ogni chiamata. */
export type Profondita = 'sintetica' | 'standard' | 'estesa'

// ---------------------------------------------------------------------------
// Risultati strutturati degli agenti
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
  /** Impostata in codice: l'URL compare fra i risultati reali della ricerca. */
  verificata: boolean
  /** Citazioni letterali confermate in codice sul testo scaricato della pagina. */
  estratti: string[]
  /** true se la pagina è stata effettivamente scaricata e letta. */
  letta: boolean
}

export interface FonteScartata {
  titolo: string
  url: string
  motivo: string
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

export interface SezioneScaletta {
  titoletto: string
  obiettivo: string
  punti: string[]
  /** Riferimenti previsti: F1, F2… per le fonti, C1, C2… per il corso. */
  riferimenti: string[]
}

export interface Scaletta {
  titolo_capitolo: string
  sezioni: SezioneScaletta[]
  nota_metodo: string
}

export type EsitoTestuale = 'verificato' | 'approssimato' | 'non_trovato' | 'rif_sconosciuto'
export type Giudizio = 'supportata' | 'parziale' | 'non_supportata'

export interface VerificaCitazione {
  /** Controllo deterministico in codice: l'estratto compare alla lettera nella fonte? */
  testuale: EsitoTestuale
  /** Giudizio del Controllore: l'estratto sostiene davvero l'affermazione? */
  giudizio?: Giudizio
  nota?: string
}

export interface Citazione {
  /** F1, F2… per le fonti web, C1, C2… per i passaggi del corso. */
  rif: string
  affermazione: string
  estratto: string
  verifica?: VerificaCitazione
}

export interface Paragrafo {
  titoletto: string
  testo: string
  citazioni: Citazione[]
}

export interface RisultatoScrittore {
  titolo: string
  paragrafi: Paragrafo[]
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
  parole: number
  stato: 'in_corso' | 'ok' | 'errore'
  errore: string | null
  valutazione: ValutazioneOpzione | null
  /** Versioni precedenti di ogni paragrafo, per annullare una rifinitura. */
  storico: Record<number, Paragrafo[]>
  /** Indice del paragrafo in rifinitura, se ce n'è uno. */
  rifinisce: number | null
}

export type EsitoVoce = 'ok' | 'problema' | 'non_applicabile'

export interface VoceChecklist {
  id: string
  voce: string
  esito: EsitoVoce
  dettaglio: string
  agente: AgentKey | null
}

export interface GiudizioCitazione {
  /** Formato "A.2.1": opzione, paragrafo, citazione. */
  id: string
  giudizio: Giudizio
  nota: string
}

export interface RisultatoControllore {
  checklist: VoceChecklist[]
  valutazioni: { opzione: ImpiantoKey; punti_di_forza: string[]; criticita: string[] }[]
  giudizi: GiudizioCitazione[]
}

/** Involucro comune: ogni agente consegna i passaggi del ragionamento più il risultato. */
export interface Consegna<T> {
  passaggi: string[]
  risultato: T
}

/** Testo di riferimento citabile dallo Scrittore, con la sua etichetta. */
export interface Riferimento {
  etichetta: string
  tipo: 'fonte' | 'corso'
  titolo: string
  /** URL per le fonti, "file, p. x–y" per il corso. */
  collocazione: string
  testo: string
}

/** Prefisso comune a tutte le chiamate dello Scrittore: identico byte per byte, per il caching. */
export interface PrefissoScrittore {
  testo: string
  riferimenti: Riferimento[]
}

// ---------------------------------------------------------------------------
// Stato runtime di un agente
// ---------------------------------------------------------------------------

export interface AgentRuntime {
  status: AgentStatus
  microLabel: string
  passaggi: string[]
  errore: string | null
  arrived: boolean
  tentativi: number
}

// ---------------------------------------------------------------------------
// File caricati
// ---------------------------------------------------------------------------

export type UploadStatus = 'lettura' | 'estrazione' | 'pronto' | 'errore'

export interface CourseFile {
  id: string
  name: string
  size: number
  kind: 'pdf' | 'testo'
  /** 0-100, calcolata sui byte letti da FileReader.onprogress. */
  progress: number
  status: UploadStatus
  pagine?: number
  paginaCorrente?: number
  /** Numero di passaggi estratti e salvati nel corpus. */
  passaggi?: number
  /** PDF senza testo selezionabile: si invia com'è, e il modello lo legge dalle immagini. */
  scansionato?: boolean
  /** Solo per i PDF scansionati, in memoria: non viene salvato su disco. */
  base64?: string
  errore?: string
}

export interface CaseTable {
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
  riepilogo: string
  errore?: string
}

// ---------------------------------------------------------------------------
// Costi
// ---------------------------------------------------------------------------

export interface VoceUso {
  at: number
  esecuzione: number
  /** Agente o "chat". */
  chi: AgentKey | 'chat'
  modello: string
  input: number
  output: number
  scritturaCache: number
  letturaCache: number
  ricerche: number
  letture: number
  costo: number
}

// ---------------------------------------------------------------------------
// Console e interfaccia
// ---------------------------------------------------------------------------

export type LogKind = 'ok' | 'avviso' | 'riparazione' | 'fallimento' | 'info'

export interface LogEntry {
  id: number
  at: number
  kind: LogKind
  agente: AgentKey | null
  messaggio: string
}

export type ApprovalStatus = 'inattiva' | 'in_attesa' | 'approvata' | 'rifiutata'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TickerItem {
  id: number
  testo: string
  segno: '▲' | '▼' | '●'
}

export type Passo = 'materiale' | 'ricerca' | 'fonti' | 'scaletta' | 'capitolo'
export type Vista = 'lavoro' | 'console' | 'chat' | 'costi'
export type ModalitaScena = 'auto' | 'completa' | 'ridotta' | 'spenta'
