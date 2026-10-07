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
export type Chi = AgentKey | 'selezione' | 'chat' | 'diagnostica'

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
  /** Fonte della biblioteca citata (marcatori F). */
  fonteId?: string
  /** Pagina in cui si trova l'estratto, calcolata in codice sul PDF della fonte. */
  pagina?: number
  /** Passaggio del corso citato (marcatori C), conservato con la sua collocazione. */
  passaggio?: { file: string; pagine: [number, number]; testo: string }
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
  /** Id delle fonti della biblioteca scelte per questa sezione. */
  fontiApprovate: string[]
  /** true quando lo studente ha approvato le fonti della sezione (anche nessuna, solo il corso). */
  fontiConfermate: boolean
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
  /** Da dove viene: glossario iniziale, lessico ricavato dal corso o aggiunto dallo studente. */
  origine?: 'iniziale' | 'corso' | 'studente'
  /** Quante volte il termine compare nel materiale del corso (calcolato in codice). */
  occorrenze?: number
  /** File e pagine del corso in cui il termine è definito. */
  collocazione?: string
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
  /** Pagina (numerazione della rivista) in cui si trova, quando la fonte ha le pagine. */
  pagina?: number
}

export interface Fonte {
  id: string
  /** Numero stabile della fonte: dà il marcatore [F12] nel testo. */
  numero: number
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
  /** Indirizzo della versione open access (gratuita), se il catalogo la conosce. */
  oaUrl?: string
  /** Per i testi presi da un PDF: posizione in `testo` dove inizia ogni pagina. */
  pagine?: number[]
  /** Numero stampato della prima pagina del PDF (per esempio 245 in una rivista); 1 se non noto. */
  paginaIniziale?: number
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

/** Una modifica proposta dal Revisore, da accettare o rifiutare una per una. */
export interface PropostaRevisione {
  id: string
  capitoloId: string
  sezioneId: string
  /** "modifica" sostituisce un paragrafo; "commento" è un consiglio senza testo da sostituire. */
  tipo: 'modifica' | 'commento'
  /** Il paragrafo attuale, così com'è nel testo (verificato in codice). */
  originale: string
  proposta: string
  motivo: string
  stato: 'in_attesa' | 'accettata' | 'rifiutata'
  avviso?: string
}

export interface Osservazione {
  id: string
  testo: string
  /** Capitolo a cui si riferisce, oppure null per tutta la tesi. */
  capitoloId: string | null
  data: string
  stato: 'aperta' | 'risolta'
  proposte: PropostaRevisione[]
  /** Come il Revisore ha letto l'osservazione. */
  lettura: string
}

export type TipoRilievo = 'terminologia' | 'ripetizione' | 'materia' | 'coerenza' | 'citazioni' | 'stile_ia'

export interface RilievoTesi {
  id: string
  tipo: TipoRilievo
  origine: 'codice' | 'revisore'
  capitoloId: string | null
  sezioneId: string | null
  /** Il passo del testo interessato, copiato dalla tesi. */
  passo: string
  problema: string
  suggerimento: string
}

export interface ControlloTesi {
  data: string
  rilievi: RilievoTesi[]
  /** true se c'è anche il giudizio del Revisore oltre al controllo in codice. */
  conRevisore: boolean
  /** Rilievi del Revisore scartati perché il passo citato non compare nella tesi. */
  scartati: number
}

export interface MessaggioChat {
  id: string
  ruolo: 'studente' | 'assistente'
  testo: string
  data: string
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
  controllo: ControlloTesi | null
  chat: MessaggioChat[]
  courseFiles: CourseFile[]
  quadro: QuadroTeorico | null
  usi: VoceUso[]
  /** Tetto di spesa mensile in dollari; null = nessun tetto. */
  budgetMensile: number | null
  /** Lunghezza attesa della tesi, in pagine Word (Times 12, interlinea 1,5). */
  obiettivo: ObiettivoPagine
  creatoIl: string
  salvatoSuFileIl: string | null
}

// ---------------------------------------------------------------------------
// Preferenze del dispositivo (non entrano nel file di progetto)
// ---------------------------------------------------------------------------

export type ModalitaScena = 'auto' | 'completa' | 'ridotta' | 'spenta'
export type ModoUso = 'auto' | 'computer' | 'ipad'

export type ModelSlot = 'bibliotecario' | 'selezione' | 'lettore' | 'scrittore' | 'revisore' | 'chat'

export interface ObiettivoPagine {
  pagineMin: number
  pagineMax: number
  parolePerPagina: number
}

export interface Preferenze {
  modelli: Record<ModelSlot, string>
  modalitaScena: ModalitaScena
  modoUso: ModoUso
  tema: Tema
}

export type Tema = 'auto' | 'chiaro' | 'scuro'

export type Schermata =
  | 'cruscotto'
  | 'biblioteca'
  | 'ricerca'
  | 'copertura'
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
