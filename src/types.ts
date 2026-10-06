/**
 * Modello dei dati del progetto di tesi.
 *
 * Tutto ciò che sta in `Progetto` viene salvato in IndexedDB e finisce nel
 * file "Salva progetto". La chiave API non ne fa mai parte.
 */

// ---------------------------------------------------------------------------
// Agenti
// ---------------------------------------------------------------------------

export type AgentKey = 'bibliotecario' | 'lettore' | 'scrittore' | 'revisore'

export type AgentStatus = 'riposo' | 'lavoro' | 'attesa' | 'fatto' | 'errore'

export interface AgentRuntime {
  status: AgentStatus
  /** Cosa sta facendo, in poche parole. */
  etichetta: string
  /** Ragionamento dell'ultimo lavoro, in passaggi brevi: si apre una nuvoletta alla volta. */
  passaggi: string[]
  errore: string | null
  tentativi: number
}

/** Chi ha consumato token: un agente, la sua fase di selezione o la chat. */
export type Chi = AgentKey | 'selezione' | 'chat'

// ---------------------------------------------------------------------------
// Indice, capitoli, sezioni, versioni
// ---------------------------------------------------------------------------

export type StatoCapitolo = 'da_fare' | 'bozza' | 'rivisto' | 'approvato'

export type Autore = 'studente' | AgentKey | 'sistema'

export interface Versione {
  id: string
  data: string
  testo: string
  nota: string
  autore: Autore
}

/** Esito del controllo in codice: l'estratto compare nel testo della fonte? */
export type EsitoTestuale = 'verificato' | 'approssimato' | 'non_trovato' | 'rif_sconosciuto'

/** Giudizio di merito del Revisore su una citazione. */
export type GiudizioCitazione = 'supportata' | 'parziale' | 'non_supportata'

export interface Citazione {
  /** Marcatore nel testo, per esempio "F3" o "C12". */
  rif: string
  affermazione: string
  estratto: string
  testuale?: EsitoTestuale
  giudizio?: GiudizioCitazione
  motivo?: string
}

export interface Sezione {
  id: string
  titolo: string
  /** Che cosa deve dimostrare la sezione: guida lo Scrittore e il Revisore. */
  obiettivo: string
  /** Testo corrente, modificabile direttamente dallo studente. */
  testo: string
  versioni: Versione[]
  citazioni: Citazione[]
  /** Scaletta della sezione (fase 3): deve essere approvata prima della stesura. */
  scaletta: string[]
  scalettaApprovata: boolean
  /** Id delle fonti della biblioteca approvate per questa sezione (fase 3). */
  fontiApprovate: string[]
  aggiornataIl: string
}

export interface Capitolo {
  id: string
  titolo: string
  stato: StatoCapitolo
  sezioni: Sezione[]
}

// ---------------------------------------------------------------------------
// Glossario
// ---------------------------------------------------------------------------

export interface VoceGlossario {
  id: string
  termine: string
  definizione: string
  /** Forme alternative da evitare o da uniformare (servono al controllo di coerenza). */
  varianti: string[]
  nota: string
}

// ---------------------------------------------------------------------------
// Biblioteca (fase 2) e osservazioni del relatore (fase 4)
// ---------------------------------------------------------------------------

export type TemaFonte = 'raccolta' | 'frantoio' | 'prezzi' | 'eventi_meteo' | 'strumenti_copertura'

export type StatoFonte = 'da_leggere' | 'letta' | 'usata'

export interface SchedaLettura {
  domanda: string
  metodo: string
  risultati: string
  rilevanza: string
  /** Frasi copiate dalla fonte, con l'esito del confronto in codice. */
  frasiChiave: EstrattoVerificato[]
  /** true quando lo studente l'ha rivista e corretta. */
  corretta: boolean
  /** Preparata sul testo completo o solo sull'abstract. */
  base: 'testo' | 'abstract'
  preparataIl: string
}

export type OrigineFonte = 'openalex' | 'crossref' | 'semanticscholar' | 'istituzionale' | 'web' | 'pdf'

/** Estratto letterale di una pagina letta, con l'esito del confronto in codice. */
export interface EstrattoVerificato {
  testo: string
  esito: EsitoTestuale
}

export interface Fonte {
  id: string
  tipo: 'pdf' | 'web' | 'catalogo' | 'istituzionale'
  origine: OrigineFonte
  titolo: string
  autori: string[]
  anno: number | null
  rivista: string
  doi: string
  url: string
  lingua: string
  abstract: string
  /** Estratti letterali verificati sul testo della pagina letta (fonti web e istituzionali). */
  estratti: EstrattoVerificato[]
  temi: TemaFonte[]
  stato: StatoFonte
  /** Id dei capitoli in cui è usata. */
  usataIn: string[]
  scheda: SchedaLettura | null
  /** Testo estratto (PDF caricati o pagine lette), usato per verificare schede e citazioni. */
  testo: string
  /** Da quale testo è stata preparata la scheda. */
  testoCompleto: boolean
  aggiuntaIl: string
}

export interface ConsiglioSelezione {
  decisione: 'tenere' | 'scartare'
  pertinenza: 'alta' | 'media' | 'bassa'
  motivo: string
}

/** Un risultato di ricerca in attesa della tua approvazione. */
export interface Candidato {
  id: string
  ricercaId: string
  fonte: Fonte
  /** Come è stato verificato: dal catalogo (metadati reali) o fra i risultati e le pagine lette. */
  verifica: 'catalogo' | 'url_verificato'
  estrattiScartati: number
  consiglio: ConsiglioSelezione | null
}

export interface FonteEsclusa {
  titolo: string
  url: string
  motivo: string
}

export interface RegistroRicerca {
  id: string
  domanda: string
  data: string
  query: string[]
  perCatalogo: Record<string, number | string>
  trovati: number
  esclusi: FonteEsclusa[]
  passaggi: string[]
}

export interface Osservazione {
  id: string
  testo: string
  capitoloId: string | null
  data: string
  stato: 'aperta' | 'risolta'
}

// ---------------------------------------------------------------------------
// Materiale del corso
// ---------------------------------------------------------------------------

/** Un passaggio di testo del materiale del corso, con la sua collocazione. */
export interface Passaggio {
  id: string
  fileId: string
  file: string
  /** Pagina iniziale e finale. */
  pagine: [number, number]
  testo: string
}

export type CourseFileStatus = 'lettura' | 'estrazione' | 'pronto' | 'errore'

export interface CourseFile {
  id: string
  name: string
  size: number
  kind: 'pdf' | 'testo'
  progress: number
  status: CourseFileStatus
  pagine?: number
  paginaCorrente?: number
  passaggi?: number
  errore?: string
}

export interface ConcettoCorso {
  termine: string
  definizione: string
  /** Come si applica all'olio in Calabria (raccolta o frantoio). */
  applicazione: string
  rif: string
  estratto: string
  /** Collocazione nel materiale: file e pagine. */
  collocazione: string
  esito: EsitoTestuale
}

export interface QuadroTeorico {
  concetti: ConcettoCorso[]
  collegamenti: { capitolo: string; collegamento: string }[]
  /** Temi utili alla tesi che il materiale del corso non tratta: non vanno sviluppati. */
  lacune: string[]
  generatoIl: string
  /** Firma dei file del corso usati: se cambia, il quadro va aggiornato. */
  firmaCorso: string
}

// ---------------------------------------------------------------------------
// Costi
// ---------------------------------------------------------------------------

export interface VoceUso {
  id: string
  data: string
  chi: Chi
  azione: string
  modello: string
  input: number
  output: number
  scritturaCache: number
  letturaCache: number
  ricerche: number
  letture: number
  costo: number
  /** Quanto si è risparmiato leggendo dalla cache invece che come input pieno. */
  risparmio: number
}

// ---------------------------------------------------------------------------
// Progetto
// ---------------------------------------------------------------------------

export type StileCitazione = 'autore-anno' | 'note'

export interface Progetto {
  titolo: string
  domanda: string
  /** La tesi studia il settore; il caso aziendale si potrà aggiungere più avanti. */
  casoAziendale: { attivo: boolean; descrizione: string }
  stileCitazione: StileCitazione
  capitoli: Capitolo[]
  indiceApprovato: boolean
  indiceApprovatoIl: string | null
  glossario: VoceGlossario[]
  fonti: Fonte[]
  /** Risultati delle ricerche che aspettano la tua approvazione. */
  inAttesa: Candidato[]
  ricerche: RegistroRicerca[]
  osservazioni: Osservazione[]
  courseFiles: CourseFile[]
  quadro: QuadroTeorico | null
  usi: VoceUso[]
  creatoIl: string
  salvatoSuFileIl: string | null
}

// ---------------------------------------------------------------------------
// Preferenze del dispositivo (non entrano nel file di progetto)
// ---------------------------------------------------------------------------

export type ModalitaScena = 'auto' | 'completa' | 'ridotta' | 'spenta'
export type ModoUso = 'auto' | 'computer' | 'ipad'

export type ModelSlot = 'bibliotecario' | 'selezione' | 'lettore' | 'scrittore' | 'revisore' | 'chat'

export interface Preferenze {
  modelli: Record<ModelSlot, string>
  modalitaScena: ModalitaScena
  modoUso: ModoUso
}

export type Schermata =
  | 'cruscotto'
  | 'biblioteca'
  | 'ricerca'
  | 'corso'
  | 'scrittura'
  | 'revisione'
  | 'glossario'
  | 'chat'
  | 'impostazioni'

/** Consegna strutturata di un agente: il ragionamento in passaggi e il risultato. */
export interface Consegna<T> {
  passaggi: string[]
  risultato: T
}
