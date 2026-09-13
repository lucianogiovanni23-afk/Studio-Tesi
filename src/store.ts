import { create } from 'zustand'
import { AGENT_ORDER, type AgentId } from './agents'

/**
 * Fase di un agente. Guida sia il badge nella sala di controllo
 * sia lo stato animato del personaggio 3D.
 */
export type AgentPhase = 'idle' | 'waiting' | 'walking' | 'working' | 'done' | 'error'

export interface AgentRuntime {
  phase: AgentPhase
  reasoning: string
  result: string
  error: string | null
  /** true quando il personaggio ha finito di camminare ed è arrivato alla scrivania. */
  arrived: boolean
}

const API_KEY_STORAGE = 'agenti3d.anthropic-api-key'

function emptyAgent(): AgentRuntime {
  return { phase: 'idle', reasoning: '', result: '', error: null, arrived: false }
}

function emptyAgents(): Record<AgentId, AgentRuntime> {
  return AGENT_ORDER.reduce(
    (acc, id) => {
      acc[id] = emptyAgent()
      return acc
    },
    {} as Record<AgentId, AgentRuntime>,
  )
}

function readStoredKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? ''
  } catch {
    // localStorage può essere disabilitato (navigazione privata, policy del browser).
    return ''
  }
}

function writeStoredKey(value: string) {
  try {
    if (value) localStorage.setItem(API_KEY_STORAGE, value)
    else localStorage.removeItem(API_KEY_STORAGE)
  } catch {
    // Se non possiamo scrivere, la chiave resta solo in memoria per questa sessione.
  }
}

interface PipelineState {
  apiKey: string
  sourceText: string
  agents: Record<AgentId, AgentRuntime>
  running: boolean
  activeAgent: AgentId | null
  /** Errore non legato a un singolo agente (es. chiave mancante). */
  globalError: string | null
  /** Sezione RISULTATO del sintetizzatore: è quello che appare sulla lavagna. */
  finalReport: string

  setApiKey: (key: string) => void
  clearApiKey: () => void
  setSourceText: (text: string) => void
  patchAgent: (id: AgentId, patch: Partial<AgentRuntime>) => void
  setRunning: (running: boolean) => void
  setActiveAgent: (id: AgentId | null) => void
  setGlobalError: (message: string | null) => void
  setFinalReport: (report: string) => void
  setArrived: (id: AgentId, arrived: boolean) => void
  /** Riporta agenti e output allo stato iniziale (i personaggi tornano in posizione di riposo). */
  resetPipeline: () => void
}

export const usePipelineStore = create<PipelineState>()((set) => ({
  apiKey: readStoredKey(),
  sourceText: '',
  agents: emptyAgents(),
  running: false,
  activeAgent: null,
  globalError: null,
  finalReport: '',

  setApiKey: (key) => {
    writeStoredKey(key)
    set({ apiKey: key, globalError: null })
  },
  clearApiKey: () => {
    writeStoredKey('')
    set({ apiKey: '' })
  },
  setSourceText: (sourceText) => set({ sourceText }),
  patchAgent: (id, patch) =>
    set((state) => ({
      agents: { ...state.agents, [id]: { ...state.agents[id], ...patch } },
    })),
  setRunning: (running) => set({ running }),
  setActiveAgent: (activeAgent) => set({ activeAgent }),
  setGlobalError: (globalError) => set({ globalError }),
  setFinalReport: (finalReport) => set({ finalReport }),
  setArrived: (id, arrived) =>
    set((state) =>
      state.agents[id].arrived === arrived
        ? state
        : { agents: { ...state.agents, [id]: { ...state.agents[id], arrived } } },
    ),
  resetPipeline: () =>
    set({
      agents: emptyAgents(),
      running: false,
      activeAgent: null,
      globalError: null,
      finalReport: '',
    }),
}))
