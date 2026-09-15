/** Tipi condivisi fra store, pipeline, pannelli e scena 3D. */

export type AgentKey = 'lettore' | 'ricercatore' | 'selettore' | 'scrittore' | 'controllore'

export type AgentStatus =
  | 'idle'
  | 'queued'
  | 'walking'
  | 'working'
  | 'waiting'
  | 'done'
  | 'error'

export interface AgentRuntime {
  status: AgentStatus
  /** Micro-etichetta sempre visibile sopra la testa ("Cerco fonti online…"). */
  microLabel: string
  reasoning: string
  /** Ragionamento spezzato in passaggi discreti per la nuvoletta. */
  steps: string[]
  result: string
  error: string | null
  /** true quando il personaggio è arrivato alla propria postazione. */
  arrived: boolean
  attempts: number
}

export interface Source {
  title: string
  url: string
  summary: string
  relevance: string
  /** true se l'URL compare davvero fra i risultati del tool di ricerca web. */
  verified: boolean
}

export interface DiscardedSource {
  title: string
  url: string
  reason: string
}

export interface DraftReview {
  ok: boolean
  note: string
}

export interface Draft {
  label: string
  approach: string
  text: string
  review: DraftReview | null
}

export type LogKind = 'ok' | 'warn' | 'repair' | 'fail' | 'info'

export interface LogEntry {
  id: number
  at: number
  kind: LogKind
  agent: AgentKey | null
  message: string
}

export type CourseFileStatus = 'reading' | 'ready' | 'error'

export interface CourseFile {
  id: string
  name: string
  size: number
  kind: 'pdf' | 'text'
  /** 0-100, calcolata sui byte letti da FileReader.onprogress. */
  progress: number
  status: CourseFileStatus
  /** PDF: contenuto in base64 da inviare come blocco document. */
  base64?: string
  /** .txt/.md: testo letto e concatenato nel contesto condiviso. */
  text?: string
  error?: string
}

export type ApprovalStatus = 'idle' | 'pending' | 'approved' | 'rejected'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
