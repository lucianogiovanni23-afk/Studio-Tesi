import { useStudioStore } from '../store'
import { MAX_TOKENS, WRITER_MAX_TOKENS, callAnthropic, type ApiMessage } from './api'
import { AGENT_BY_KEY } from './definitions'
import {
  CHAT_SYSTEM,
  SYSTEM_PROMPTS,
  buildChatContext,
  buildMaterialText,
  buildUserMessage,
  lettoreInstruction,
  ricercatoreInstruction,
  scrittoreInstruction,
  selettoreInstruction,
  supervisorDraftsInstruction,
  supervisorSourcesInstruction,
  type SharedContext,
} from './prompts'
import {
  applyAgentOutput,
  guardedCall,
  logFail,
  logInfo,
  logOk,
  logWarn,
  parseDraftReviews,
  parseDrafts,
  readStatus,
  requireBlocks,
  requireSections,
  requireStatusLine,
} from './supervisor'
import {
  WEB_SEARCH_TOOL,
  harvestSearch,
  parseSelection,
  parseSources,
  wantsNewSearch,
} from './webSearch'
import type { AgentKey } from '../types'

/** Token della run corrente: incrementarlo invalida quella precedente. */
let runToken = 0
let controller: AbortController | null = null

/** Se la scena 3D non è montata non restiamo bloccati ad aspettare l'arrivo. */
const ARRIVAL_TIMEOUT_MS = 12_000
const MAX_SEARCH_ROUNDS = 4

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function stale(token: number): boolean {
  return token !== runToken
}

/** Attende che il personaggio abbia finito di camminare fino alla postazione. */
function waitForArrival(agent: AgentKey, token: number): Promise<void> {
  return new Promise((resolve) => {
    if (useStudioStore.getState().agents[agent].arrived) {
      resolve()
      return
    }
    let timer: ReturnType<typeof setTimeout>
    const unsubscribe = useStudioStore.subscribe((state) => {
      if (state.agents[agent].arrived || stale(token)) {
        clearTimeout(timer)
        unsubscribe()
        resolve()
      }
    })
    timer = setTimeout(() => {
      unsubscribe()
      resolve()
    }, ARRIVAL_TIMEOUT_MS)
  })
}

/** Blocca la pipeline finché lo studente non approva o rifiuta la selezione. */
function waitForDecision(token: number): Promise<'approved' | 'rejected' | 'cancelled'> {
  return new Promise((resolve) => {
    const current = useStudioStore.getState().approvalStatus
    if (current === 'approved' || current === 'rejected') {
      resolve(current)
      return
    }
    const unsubscribe = useStudioStore.subscribe((state) => {
      if (stale(token)) {
        unsubscribe()
        resolve('cancelled')
        return
      }
      if (state.approvalStatus === 'approved' || state.approvalStatus === 'rejected') {
        unsubscribe()
        resolve(state.approvalStatus)
      }
    })
  })
}

async function goToDesk(agent: AgentKey, token: number, label: string) {
  const store = useStudioStore.getState()
  store.setActiveAgent(agent)
  store.patchAgent(agent, { status: 'walking', microLabel: 'Vado alla postazione…', arrived: false })
  await waitForArrival(agent, token)
  if (stale(token)) return
  useStudioStore.getState().patchAgent(agent, { status: 'working', microLabel: label })
}

function sharedContext(): SharedContext {
  const s = useStudioStore.getState()
  return {
    thesisTopic: s.thesisTopic,
    chapterBrief: s.chapterBrief,
    courseFiles: s.courseFiles,
  }
}

/** Interrompe la run in corso, chiamata API inclusa. */
export function cancelRun() {
  runToken += 1
  controller?.abort()
  controller = null
  const store = useStudioStore.getState()
  store.setRunning(false)
  store.setActiveAgent(null)
  store.resetApproval()
  logWarn(null, 'Esecuzione interrotta manualmente.')
}

export async function runPipeline() {
  const start = useStudioStore.getState()
  const apiKey = start.apiKey.trim()

  if (!apiKey) {
    start.setGlobalError('Incolla la tua chiave API Anthropic prima di avviare la squadra.')
    return
  }
  if (start.courseFiles.length === 0 || start.courseFiles.some((f) => f.status !== 'ready')) {
    start.setGlobalError('Carica il materiale del corso e attendi che il caricamento sia al 100%.')
    return
  }
  if (!start.thesisTopic.trim() || !start.chapterBrief.trim()) {
    start.setGlobalError("Scrivi l'argomento della tesi e il capitolo da produrre.")
    return
  }

  runToken += 1
  const token = runToken
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal

  start.resetRun()
  start.setRunning(true)
  logInfo(null, 'Avvio della squadra: contesto condiviso pronto per tutti e 5 gli agenti.')

  // Il Controllore è attivo dall'inizio e resta in ascolto per tutta la pipeline.
  useStudioStore
    .getState()
    .patchAgent('controllore', { status: 'working', microLabel: 'Sorveglio il processo…' })

  try {
    // --- 1. Lettore --------------------------------------------------------
    await goToDesk('lettore', token, 'Studio il materiale del corso…')
    if (stale(token)) return

    const lettore = await guardedCall({
      agent: 'lettore',
      step: 'Lettore',
      apiKey,
      system: SYSTEM_PROMPTS.lettore,
      messages: [buildUserMessage(sharedContext(), lettoreInstruction())],
      maxTokens: MAX_TOKENS,
      signal,
      validate: requireSections(200),
    })
    if (stale(token)) return

    applyAgentOutput('lettore', lettore.reasoning, lettore.result)
    useStudioStore.getState().patchAgent('lettore', { status: 'done', microLabel: 'Base pronta ✓' })

    // --- 2-3. Ricerca → selezione → approvazione (ciclo) -------------------
    let approved = false
    let round = 0
    let needSearch = true
    let searchFeedback = ''
    let previousSelection = ''

    while (!approved && round < MAX_SEARCH_ROUNDS) {
      round += 1

      if (needSearch) {
        await goToDesk('ricercatore', token, 'Cerco fonti online…')
        if (stale(token)) return

        const ricercatore = await guardedCall({
          agent: 'ricercatore',
          step: `Ricercatore (giro ${round})`,
          apiKey,
          system: SYSTEM_PROMPTS.ricercatore,
          messages: [
            buildUserMessage(
              sharedContext(),
              ricercatoreInstruction(lettore.result, searchFeedback || undefined),
            ),
          ],
          maxTokens: MAX_TOKENS,
          tools: [{ ...WEB_SEARCH_TOOL }],
          signal,
          validate: (response, sections) => {
            const base = requireSections(80)(response, sections)
            if (!base.ok) return base
            const harvest = harvestSearch(response.blocks)
            if (!harvest.used && harvest.errors.length === 0) {
              return {
                ok: false,
                hint: 'Non hai usato il tool di ricerca web: devi eseguire davvero delle ricerche prima di elencare le fonti.',
              }
            }
            if (harvest.errors.length > 0) return { ok: true }
            const parsed = parseSources(sections.result, harvest.results)
            if (parsed.length === 0 && !/NESSUNA\s+FONTE\s+TROVATA/i.test(sections.result)) {
              return {
                ok: false,
                hint: 'Nessuna fonte riconosciuta: usa lo schema a blocchi [FONTE] con le righe TITOLO, URL, CONTENUTO, RILEVANZA.',
              }
            }
            return { ok: true }
          },
        })
        if (stale(token)) return

        const harvest = harvestSearch(ricercatore.response.blocks)
        const sources = parseSources(ricercatore.result, harvest.results)
        const unverified = sources.filter((s) => !s.verified)

        applyAgentOutput('ricercatore', ricercatore.reasoning, ricercatore.result)
        useStudioStore.getState().setFoundSources(sources)

        if (harvest.queries.length > 0) {
          logInfo('ricercatore', `Query eseguite: ${harvest.queries.join(' · ')}`)
        }

        if (harvest.errors.length > 0) {
          const notice = harvest.errors.join(' ')
          useStudioStore.getState().setSearchNotice(notice)
          for (const error of harvest.errors) logFail('ricercatore', error)
        } else {
          useStudioStore.getState().setSearchNotice(null)
        }

        if (sources.length === 0) {
          const message =
            harvest.errors.length > 0
              ? `La ricerca web non ha prodotto fonti utilizzabili. ${harvest.errors.join(' ')}`
              : 'La ricerca web non ha restituito fonti utilizzabili per questo argomento. Prova a riformulare l\'argomento della tesi o a riavviare la squadra.'
          useStudioStore.getState().setSearchNotice(message)
          useStudioStore
            .getState()
            .patchAgent('ricercatore', { status: 'error', microLabel: 'Nessuna fonte trovata', error: message })
          useStudioStore.getState().setGlobalError(message)
          logFail('ricercatore', message)
          return
        }

        logOk(
          'ricercatore',
          `${sources.length} fonti riportate, ${sources.length - unverified.length} con URL confermato dalla ricerca.`,
        )

        // Il Controllore verifica che gli URL siano reali.
        const check = await guardedCall({
          agent: 'controllore',
          step: 'Verifica URL delle fonti',
          apiKey,
          system: SYSTEM_PROMPTS.controllore,
          messages: [
            buildUserMessage(
              sharedContext(),
              supervisorSourcesInstruction(sources, unverified, harvest.errors),
            ),
          ],
          maxTokens: MAX_TOKENS,
          signal,
          validate: requireStatusLine(),
        })
        if (stale(token)) return

        applyAgentOutput('controllore', check.reasoning, check.result)
        if (unverified.length > 0) {
          const message = `${unverified.length} fonte/i con URL non confermato dai risultati di ricerca: ${unverified
            .map((s) => s.url)
            .join(', ')}`
          logFail('controllore', message)
          useStudioStore.getState().setSearchNotice(message)
        } else if (readStatus(check.response.text) === 'PROBLEMA') {
          logWarn('controllore', 'Il controllo sulle fonti ha segnalato un problema: vedi il referto.')
        } else {
          logOk('controllore', 'Tutti gli URL riportati corrispondono a risultati reali di ricerca.')
        }

        useStudioStore
          .getState()
          .patchAgent('ricercatore', { status: 'done', microLabel: 'Fonti trovate ✓' })
      }

      // --- Selettore ------------------------------------------------------
      await goToDesk('selettore', token, 'Seleziono le fonti…')
      if (stale(token)) return

      const found = useStudioStore.getState().foundSources
      const selettore = await guardedCall({
        agent: 'selettore',
        step: `Selettore (giro ${round})`,
        apiKey,
        system: SYSTEM_PROMPTS.selettore,
        messages: [
          buildUserMessage(
            sharedContext(),
            selettoreInstruction(
              lettore.result,
              found,
              useStudioStore.getState().rejectionReason,
              previousSelection,
            ),
          ),
        ],
        maxTokens: MAX_TOKENS,
        signal,
        validate: requireBlocks(
          /\[\s*(TENUTA|SCARTATA)\s*\]/gi,
          1,
          'Usa lo schema a blocchi [TENUTA] / [SCARTATA] con le righe TITOLO, URL, MOTIVO.',
        ),
      })
      if (stale(token)) return

      previousSelection = selettore.result
      applyAgentOutput('selettore', selettore.reasoning, selettore.result)

      const { kept, discarded } = parseSelection(selettore.result, found)
      useStudioStore.getState().setSelectedSources(kept)
      useStudioStore.getState().setDiscardedSources(discarded)
      logOk('selettore', `${kept.length} fonti tenute, ${discarded.length} scartate.`)

      if (kept.length === 0 || wantsNewSearch(selettore.result)) {
        if (round >= MAX_SEARCH_ROUNDS) {
          logWarn('selettore', 'Numero massimo di giri di ricerca raggiunto: procedo con quello che c\'è.')
        } else {
          searchFeedback =
            kept.length === 0
              ? 'Nessuna delle fonti trovate era pertinente.'
              : 'Il Selettore ha chiesto un nuovo giro di ricerca: le fonti pertinenti non bastano.'
          logRepairNewSearch(searchFeedback)
          needSearch = true
          useStudioStore.getState().resetApproval()
          useStudioStore
            .getState()
            .patchAgent('selettore', { status: 'done', microLabel: 'Servono altre fonti' })
          continue
        }
      }

      // --- Punto di approvazione umana ------------------------------------
      useStudioStore.getState().requestApproval()
      useStudioStore
        .getState()
        .patchAgent('selettore', { status: 'waiting', microLabel: 'Attendo la tua approvazione…' })
      logInfo('selettore', 'In attesa dell\'approvazione umana sulle fonti selezionate.')

      const decision = await waitForDecision(token)
      if (stale(token) || decision === 'cancelled') return

      if (decision === 'approved') {
        approved = true
        logOk('selettore', 'Selezione approvata dallo studente.')
        useStudioStore
          .getState()
          .patchAgent('selettore', { status: 'done', microLabel: 'Fonti approvate ✓' })
      } else {
        const reason = useStudioStore.getState().rejectionReason
        logWarn('selettore', `Selezione rifiutata${reason ? `: ${reason}` : '.'} Rivedo la scelta.`)
        useStudioStore.getState().resetApproval()
        needSearch = false
      }
    }

    if (!approved) {
      const message =
        'Non è stato possibile arrivare a una selezione approvata entro il numero massimo di giri. Riavvia la squadra o modifica l\'argomento.'
      useStudioStore.getState().setGlobalError(message)
      logFail(null, message)
      return
    }

    // --- 4. Scrittore ------------------------------------------------------
    const selected = useStudioStore.getState().selectedSources
    await goToDesk('scrittore', token, 'Scrivo le tre bozze…')
    if (stale(token)) return

    const scrittore = await guardedCall({
      agent: 'scrittore',
      step: 'Scrittore',
      apiKey,
      system: SYSTEM_PROMPTS.scrittore,
      messages: [buildUserMessage(sharedContext(), scrittoreInstruction(lettore.result, selected))],
      maxTokens: WRITER_MAX_TOKENS,
      signal,
      validate: (response, sections) => {
        const base = requireSections(600)(response, sections)
        if (!base.ok) return base
        const drafts = parseDrafts(sections.result)
        if (drafts.length < 3) {
          return {
            ok: false,
            hint: `Hai prodotto ${drafts.length} opzioni invece di 3. Usa i marcatori [OPZIONE 1], [OPZIONE 2], [OPZIONE 3] con le righe APPROCCIO: e TESTO:.`,
          }
        }
        const tooShort = drafts.find((d) => d.text.split(/\s+/).length < 150)
        if (tooShort) {
          return {
            ok: false,
            hint: `L'${tooShort.label.toLowerCase()} è troppo breve: ogni opzione deve essere un testo completo di almeno 450 parole.`,
          }
        }
        return { ok: true }
      },
    })
    if (stale(token)) return

    const drafts = parseDrafts(scrittore.result)
    applyAgentOutput('scrittore', scrittore.reasoning, scrittore.result)
    useStudioStore.getState().setDrafts(drafts)
    useStudioStore.getState().patchAgent('scrittore', { status: 'done', microLabel: 'Tre bozze pronte ✓' })
    logOk('scrittore', `${drafts.length} opzioni di scrittura prodotte.`)

    // --- 5. Controllo finale ----------------------------------------------
    await goToDesk('controllore', token, 'Valuto le tre opzioni…')
    if (stale(token)) return

    const finalCheck = await guardedCall({
      agent: 'controllore',
      step: 'Valutazione delle bozze',
      apiKey,
      system: SYSTEM_PROMPTS.controllore,
      messages: [buildUserMessage(sharedContext(), supervisorDraftsInstruction(drafts, selected))],
      maxTokens: MAX_TOKENS,
      signal,
      validate: (response, sections) => {
        const base = requireStatusLine()(response, sections)
        if (!base.ok) return base
        if (parseDraftReviews(sections.result).size < drafts.length) {
          return {
            ok: false,
            hint: 'Devi valutare tutte le opzioni con i blocchi [VALUTAZIONE OPZIONE n], ESITO: e NOTE:.',
          }
        }
        return { ok: true }
      },
    })
    if (stale(token)) return

    applyAgentOutput('controllore', finalCheck.reasoning, finalCheck.result)
    useStudioStore.getState().setSupervisorVerdict(finalCheck.result)

    const reviews = parseDraftReviews(finalCheck.result)
    let problems = 0
    for (const [index, review] of reviews) {
      if (index >= drafts.length) continue
      useStudioStore.getState().setDraftReview(index, review)
      if (!review.ok) problems += 1
    }

    if (problems > 0) {
      logWarn('controllore', `${problems} opzione/i con problemi segnalati: le altre restano valide.`)
    } else {
      logOk('controllore', 'Le tre opzioni risultano coerenti con le fonti approvate.')
    }

    useStudioStore
      .getState()
      .patchAgent('controllore', { status: 'done', microLabel: 'Controllo completato ✓' })
    useStudioStore.getState().setActiveAgent(null)
    logOk(null, 'Pipeline completata: scegli l\'opzione che preferisci.')
  } catch (err) {
    if (isAbort(err) || stale(token)) return

    const agent = useStudioStore.getState().activeAgent
    const message =
      err instanceof Error ? err.message : 'Errore inatteso durante l\'esecuzione della pipeline.'

    if (agent) {
      useStudioStore.getState().patchAgent(agent, {
        status: 'error',
        microLabel: 'Errore',
        error: message,
      })
    }
    useStudioStore.getState().setGlobalError(message)
    logFail(agent, message)
  } finally {
    // I controlli tornano sempre attivi, anche dopo un errore.
    if (!stale(token)) {
      const store = useStudioStore.getState()
      store.setRunning(false)
      store.setActiveAgent(null)
      if (store.approvalStatus === 'pending') store.resetApproval()
      if (store.agents.controllore.status === 'working') {
        store.patchAgent('controllore', { status: 'done', microLabel: 'Sorveglianza conclusa' })
      }
    }
  }
}

function logRepairNewSearch(reason: string) {
  useStudioStore.getState().addLog('repair', 'selettore', `Nuovo giro di ricerca: ${reason}`)
}

// ---------------------------------------------------------------------------
// Chat sul progetto
// ---------------------------------------------------------------------------

export async function sendChatMessage(text: string) {
  const store = useStudioStore.getState()
  const question = text.trim()
  if (!question || store.chatBusy) return

  const apiKey = store.apiKey.trim()
  if (!apiKey) {
    store.setChatError('Incolla la tua chiave API Anthropic per usare la chat.')
    return
  }

  store.addChatMessage({ role: 'user', content: question })
  store.setChatBusy(true)
  store.setChatError(null)

  try {
    const state = useStudioStore.getState()

    const agentStates = Object.entries(state.agents)
      .map(([key, runtime]) => {
        const def = AGENT_BY_KEY[key as AgentKey]
        return `- ${def.name}: stato "${runtime.status}"${runtime.microLabel ? ` (${runtime.microLabel})` : ''}${
          runtime.error ? ` — errore: ${runtime.error}` : ''
        }`
      })
      .join('\n')

    const recentLogs = state.logs
      .slice(-25)
      .map((l) => `[${new Date(l.at).toLocaleTimeString('it-IT')}] ${l.kind.toUpperCase()} ${l.message}`)
      .join('\n')

    const pdfNames = state.courseFiles
      .filter((f) => f.kind === 'pdf' && f.status === 'ready')
      .map((f) => f.name)
    const materialText = buildMaterialText(state.courseFiles)
    const materialSummary = [
      pdfNames.length > 0 ? `PDF caricati: ${pdfNames.join(', ')}.` : '',
      materialText,
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 8000)

    const approvalInfo =
      state.approvalStatus === 'pending'
        ? `in attesa della decisione dello studente (giro ${state.approvalRound})`
        : state.approvalHistory.length > 0
          ? state.approvalHistory.join(' | ')
          : 'non ancora richiesta'

    const context = buildChatContext({
      thesisTopic: state.thesisTopic,
      chapterBrief: state.chapterBrief,
      materialSummary,
      foundSources: state.foundSources,
      selectedSources: state.selectedSources,
      drafts: state.drafts,
      agentStates,
      recentLogs,
      approvalInfo,
    })

    const history: ApiMessage[] = state.chatMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))
    // Il contesto aggiornato viaggia insieme all'ultima domanda.
    history[history.length - 1] = {
      role: 'user',
      content: `${context}\n\n---\n\nDOMANDA DELLO STUDENTE:\n${question}`,
    }

    const response = await callAnthropic({
      apiKey,
      system: CHAT_SYSTEM,
      messages: history,
      maxTokens: MAX_TOKENS,
    })

    const answer = response.text.trim()
    if (!answer) throw new Error("L'assistente ha risposto senza contenuto testuale.")

    useStudioStore.getState().addChatMessage({ role: 'assistant', content: answer })
    logOk(null, 'Risposta della chat ricevuta.')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore inatteso nella chat.'
    useStudioStore.getState().setChatError(message)
    logFail(null, `Chat: ${message}`)
  } finally {
    useStudioStore.getState().setChatBusy(false)
  }
}
