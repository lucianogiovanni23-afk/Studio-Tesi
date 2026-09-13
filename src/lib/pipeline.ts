import { AGENT_ORDER, buildPrompt, type AgentId } from '../agents'
import { usePipelineStore } from '../store'
import { AnthropicError, callAnthropic, parseSections } from './anthropic'

/** Token della run corrente: incrementarlo invalida la run precedente. */
let runToken = 0
let controller: AbortController | null = null

/** Sicurezza: se la scena 3D non è montata non restiamo bloccati ad aspettare l'arrivo. */
const ARRIVAL_TIMEOUT_MS = 12_000

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/** Attende che il personaggio abbia finito di camminare fino alla scrivania. */
function waitForArrival(id: AgentId, token: number): Promise<void> {
  return new Promise((resolve) => {
    if (usePipelineStore.getState().agents[id].arrived) {
      resolve()
      return
    }
    let timeout: ReturnType<typeof setTimeout>
    const unsubscribe = usePipelineStore.subscribe((state) => {
      if (state.agents[id].arrived || token !== runToken) {
        clearTimeout(timeout)
        unsubscribe()
        resolve()
      }
    })
    timeout = setTimeout(() => {
      unsubscribe()
      resolve()
    }, ARRIVAL_TIMEOUT_MS)
  })
}

/** Interrompe la run in corso (chiamata API inclusa). */
export function cancelPipeline() {
  runToken += 1
  controller?.abort()
  controller = null
  const { setRunning, setActiveAgent } = usePipelineStore.getState()
  setRunning(false)
  setActiveAgent(null)
}

/**
 * Esegue la pipeline in sequenza a partire da `startFrom`.
 * Ogni agente cammina fino alla scrivania, lavora e passa il testimone al successivo.
 * Riavviando da un agente intermedio si riusano i risultati già ottenuti (ritenta senza ricaricare).
 */
export async function runPipeline(startFrom: AgentId = AGENT_ORDER[0]) {
  const store = usePipelineStore.getState()
  const apiKey = store.apiKey.trim()
  const sourceText = store.sourceText.trim()

  if (!apiKey) {
    store.setGlobalError('Incolla la tua chiave API Anthropic prima di avviare la pipeline.')
    return
  }
  if (!sourceText) {
    store.setGlobalError('Incolla un testo da analizzare prima di avviare la pipeline.')
    return
  }

  runToken += 1
  const token = runToken
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller

  const startIndex = Math.max(0, AGENT_ORDER.indexOf(startFrom))

  store.setGlobalError(null)
  store.setRunning(true)
  store.setFinalReport('')

  // Gli agenti da (ri)eseguire tornano in posizione di riposo e in attesa del proprio turno.
  for (let i = startIndex; i < AGENT_ORDER.length; i++) {
    store.patchAgent(AGENT_ORDER[i], {
      phase: 'waiting',
      reasoning: '',
      result: '',
      error: null,
      arrived: false,
    })
  }

  const previousResults: Partial<Record<AgentId, string>> = {}
  for (let i = 0; i < startIndex; i++) {
    previousResults[AGENT_ORDER[i]] = usePipelineStore.getState().agents[AGENT_ORDER[i]].result
  }

  try {
    for (let i = startIndex; i < AGENT_ORDER.length; i++) {
      const id = AGENT_ORDER[i]
      if (token !== runToken) return

      const { patchAgent, setActiveAgent } = usePipelineStore.getState()
      setActiveAgent(id)

      // 1. Il personaggio cammina davvero fino alla sua scrivania.
      patchAgent(id, { phase: 'walking', arrived: false })
      await waitForArrival(id, token)
      if (token !== runToken) return

      // 2. Arrivato alla scrivania: si mette a lavorare e parte la chiamata API.
      patchAgent(id, { phase: 'working' })

      const { system, user } = buildPrompt(id, { sourceText, previousResults })
      const raw = await callAnthropic({ apiKey, system, user, signal })
      if (token !== runToken) return

      const { reasoning, result } = parseSections(raw)
      previousResults[id] = result
      usePipelineStore.getState().patchAgent(id, { phase: 'done', reasoning, result, error: null })

      if (id === 'sintetizzatore') {
        usePipelineStore.getState().setFinalReport(result)
      }
    }

    if (token === runToken) {
      usePipelineStore.getState().setActiveAgent(null)
      usePipelineStore.getState().setRunning(false)
    }
  } catch (err) {
    if (isAbort(err) || token !== runToken) return

    const id = usePipelineStore.getState().activeAgent ?? AGENT_ORDER[startIndex]
    const message =
      err instanceof AnthropicError
        ? err.message
        : err instanceof Error
          ? `Errore inatteso: ${err.message}`
          : 'Errore inatteso durante la chiamata API.'

    usePipelineStore.getState().patchAgent(id, { phase: 'error', error: message })
    usePipelineStore.getState().setRunning(false)
    usePipelineStore.getState().setActiveAgent(null)
  }
}
