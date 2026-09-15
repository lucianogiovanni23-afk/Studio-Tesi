import { create } from 'zustand'
import { AGENT_ORDER } from './agents/definitions'
import type {
  AgentKey,
  AgentRuntime,
  ApprovalStatus,
  ChatMessage,
  CourseFile,
  DiscardedSource,
  Draft,
  DraftReview,
  LogEntry,
  LogKind,
  Source,
} from './types'

const API_KEY_STORAGE = 'studio-tesi.anthropic-api-key'
const MAX_LOGS = 400

function emptyAgent(): AgentRuntime {
  return {
    status: 'idle',
    microLabel: '',
    reasoning: '',
    steps: [],
    result: '',
    error: null,
    arrived: false,
    attempts: 0,
  }
}

function emptyAgents(): Record<AgentKey, AgentRuntime> {
  return AGENT_ORDER.reduce(
    (acc, key) => {
      acc[key] = emptyAgent()
      return acc
    },
    {} as Record<AgentKey, AgentRuntime>,
  )
}

function readStoredKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

function writeStoredKey(value: string) {
  try {
    if (value) localStorage.setItem(API_KEY_STORAGE, value)
    else localStorage.removeItem(API_KEY_STORAGE)
  } catch {
    // localStorage non disponibile: la chiave resta in memoria per questa sessione.
  }
}

let logId = 0

export interface StudioState {
  apiKey: string
  courseFiles: CourseFile[]
  thesisTopic: string
  chapterBrief: string

  agents: Record<AgentKey, AgentRuntime>
  running: boolean
  activeAgent: AgentKey | null
  globalError: string | null

  foundSources: Source[]
  selectedSources: Source[]
  discardedSources: DiscardedSource[]
  searchNotice: string | null

  approvalStatus: ApprovalStatus
  approvalRound: number
  rejectionReason: string
  /** Cronologia delle decisioni umane, mostrata nella card di approvazione. */
  approvalHistory: string[]

  drafts: Draft[]
  supervisorVerdict: string

  logs: LogEntry[]
  consoleOpen: boolean
  /** Eventi registrati mentre la console era chiusa. */
  unseenLogs: number
  unseenErrors: number

  openBubbleAgent: AgentKey | null
  cameraFocus: AgentKey | null
  cameraFocusToken: number

  chatMessages: ChatMessage[]
  chatBusy: boolean
  chatError: string | null

  setApiKey: (key: string) => void
  clearApiKey: () => void

  addCourseFile: (file: CourseFile) => void
  patchCourseFile: (id: string, patch: Partial<CourseFile>) => void
  removeCourseFile: (id: string) => void
  clearCourseFiles: () => void

  setThesisTopic: (value: string) => void
  setChapterBrief: (value: string) => void

  patchAgent: (key: AgentKey, patch: Partial<AgentRuntime>) => void
  setArrived: (key: AgentKey, arrived: boolean) => void
  setRunning: (running: boolean) => void
  setActiveAgent: (key: AgentKey | null) => void
  setGlobalError: (message: string | null) => void

  setFoundSources: (sources: Source[]) => void
  setSelectedSources: (sources: Source[]) => void
  setDiscardedSources: (sources: DiscardedSource[]) => void
  setSearchNotice: (notice: string | null) => void

  requestApproval: () => void
  approveSources: () => void
  rejectSources: (reason: string) => void
  resetApproval: () => void

  setDrafts: (drafts: Draft[]) => void
  setDraftReview: (index: number, review: DraftReview) => void
  setSupervisorVerdict: (verdict: string) => void

  addLog: (kind: LogKind, agent: AgentKey | null, message: string) => void
  setConsoleOpen: (open: boolean) => void
  clearLogs: () => void

  toggleBubble: (key: AgentKey) => void
  closeBubble: () => void
  focusCamera: (key: AgentKey | null) => void

  addChatMessage: (message: ChatMessage) => void
  setChatBusy: (busy: boolean) => void
  setChatError: (error: string | null) => void
  clearChat: () => void

  /** Riabilita i controlli: usata dal Controllore dopo un errore di runtime. */
  unlockUi: () => void
  resetRun: () => void
}

export const useStudioStore = create<StudioState>()((set, get) => ({
  apiKey: readStoredKey(),
  courseFiles: [],
  thesisTopic: '',
  chapterBrief: '',

  agents: emptyAgents(),
  running: false,
  activeAgent: null,
  globalError: null,

  foundSources: [],
  selectedSources: [],
  discardedSources: [],
  searchNotice: null,

  approvalStatus: 'idle',
  approvalRound: 0,
  rejectionReason: '',
  approvalHistory: [],

  drafts: [],
  supervisorVerdict: '',

  logs: [],
  consoleOpen: false,
  unseenLogs: 0,
  unseenErrors: 0,

  openBubbleAgent: null,
  cameraFocus: null,
  cameraFocusToken: 0,

  chatMessages: [],
  chatBusy: false,
  chatError: null,

  setApiKey: (key) => {
    writeStoredKey(key)
    set({ apiKey: key, globalError: null })
  },
  clearApiKey: () => {
    writeStoredKey('')
    set({ apiKey: '' })
  },

  addCourseFile: (file) => set((s) => ({ courseFiles: [...s.courseFiles, file] })),
  patchCourseFile: (id, patch) =>
    set((s) => ({
      courseFiles: s.courseFiles.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),
  removeCourseFile: (id) =>
    set((s) => ({ courseFiles: s.courseFiles.filter((f) => f.id !== id) })),
  clearCourseFiles: () => set({ courseFiles: [] }),

  setThesisTopic: (thesisTopic) => set({ thesisTopic }),
  setChapterBrief: (chapterBrief) => set({ chapterBrief }),

  patchAgent: (key, patch) =>
    set((s) => ({ agents: { ...s.agents, [key]: { ...s.agents[key], ...patch } } })),
  setArrived: (key, arrived) =>
    set((s) =>
      s.agents[key].arrived === arrived
        ? s
        : { agents: { ...s.agents, [key]: { ...s.agents[key], arrived } } },
    ),
  setRunning: (running) => set({ running }),
  setActiveAgent: (activeAgent) => set({ activeAgent }),
  setGlobalError: (globalError) => set({ globalError }),

  setFoundSources: (foundSources) => set({ foundSources }),
  setSelectedSources: (selectedSources) => set({ selectedSources }),
  setDiscardedSources: (discardedSources) => set({ discardedSources }),
  setSearchNotice: (searchNotice) => set({ searchNotice }),

  requestApproval: () =>
    set((s) => ({
      approvalStatus: 'pending',
      approvalRound: s.approvalRound + 1,
      rejectionReason: '',
    })),
  approveSources: () =>
    set((s) => ({
      approvalStatus: 'approved',
      approvalHistory: [...s.approvalHistory, `Giro ${s.approvalRound}: approvato.`],
    })),
  rejectSources: (reason) =>
    set((s) => ({
      approvalStatus: 'rejected',
      rejectionReason: reason,
      approvalHistory: [
        ...s.approvalHistory,
        `Giro ${s.approvalRound}: non convince${reason.trim() ? ` — ${reason.trim()}` : '.'}`,
      ],
    })),
  resetApproval: () => set({ approvalStatus: 'idle', rejectionReason: '' }),

  setDrafts: (drafts) => set({ drafts }),
  setDraftReview: (index, review) =>
    set((s) => ({
      drafts: s.drafts.map((d, i) => (i === index ? { ...d, review } : d)),
    })),
  setSupervisorVerdict: (supervisorVerdict) => set({ supervisorVerdict }),

  addLog: (kind, agent, message) =>
    set((s) => {
      logId += 1
      const entry: LogEntry = { id: logId, at: Date.now(), kind, agent, message }
      const logs = [...s.logs, entry].slice(-MAX_LOGS)
      if (s.consoleOpen) return { logs }
      return {
        logs,
        unseenLogs: s.unseenLogs + 1,
        unseenErrors: s.unseenErrors + (kind === 'fail' ? 1 : 0),
      }
    }),
  setConsoleOpen: (open) =>
    set(open ? { consoleOpen: true, unseenLogs: 0, unseenErrors: 0 } : { consoleOpen: false }),
  clearLogs: () => set({ logs: [], unseenLogs: 0, unseenErrors: 0 }),

  toggleBubble: (key) => set((s) => ({ openBubbleAgent: s.openBubbleAgent === key ? null : key })),
  closeBubble: () => set({ openBubbleAgent: null }),
  focusCamera: (key) => set((s) => ({ cameraFocus: key, cameraFocusToken: s.cameraFocusToken + 1 })),

  addChatMessage: (message) => set((s) => ({ chatMessages: [...s.chatMessages, message] })),
  setChatBusy: (chatBusy) => set({ chatBusy }),
  setChatError: (chatError) => set({ chatError }),
  clearChat: () => set({ chatMessages: [], chatError: null }),

  unlockUi: () => {
    const { agents } = get()
    const patched = { ...agents }
    for (const key of AGENT_ORDER) {
      if (patched[key].status === 'working' || patched[key].status === 'walking') {
        patched[key] = {
          ...patched[key],
          status: 'error',
          microLabel: 'Interrotto da un errore',
          error: patched[key].error ?? 'Interfaccia ripristinata dopo un errore di runtime.',
        }
      }
    }
    set({ agents: patched, running: false, activeAgent: null, chatBusy: false })
  },

  resetRun: () =>
    set({
      agents: emptyAgents(),
      running: false,
      activeAgent: null,
      globalError: null,
      foundSources: [],
      selectedSources: [],
      discardedSources: [],
      searchNotice: null,
      approvalStatus: 'idle',
      approvalRound: 0,
      rejectionReason: '',
      approvalHistory: [],
      drafts: [],
      supervisorVerdict: '',
      openBubbleAgent: null,
    }),
}))

/** Vero quando c'è almeno un file e tutti sono stati letti al 100%. */
export function selectMaterialReady(s: StudioState): boolean {
  return s.courseFiles.length > 0 && s.courseFiles.every((f) => f.status === 'ready')
}

export function selectCanStart(s: StudioState): boolean {
  return (
    selectMaterialReady(s) &&
    s.thesisTopic.trim().length > 0 &&
    s.chapterBrief.trim().length > 0 &&
    s.apiKey.trim().length > 0 &&
    !s.running
  )
}
