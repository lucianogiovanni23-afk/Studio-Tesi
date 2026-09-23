import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set as idbSet } from 'idb-keyval'
import { MODELLI_PREDEFINITI, type ModelSlot } from './agents/api'
import { ARGOMENTO_PREDEFINITO, CAPITOLO_PREDEFINITO } from './agents/prompts'
import type {
  AgentKey,
  AgentRuntime,
  ApprovalStatus,
  CaseFile,
  ChatMessage,
  CourseFile,
  Fonte,
  FonteScartata,
  ImpiantoKey,
  LogEntry,
  LogKind,
  Opzione,
  RisultatoControllore,
  RisultatoLettore,
  SceltaFonte,
  TickerItem,
} from './types'

const CHIAVE_API_STORAGE = 'studio-tesi.anthropic-api-key'
const MAX_LOG = 500
const MAX_TICKER = 40

export const AGENT_KEYS: AgentKey[] = [
  'lettore',
  'ricercatore',
  'selettore',
  'scrittore',
  'controllore',
]

function agenteVuoto(): AgentRuntime {
  return { status: 'idle', microLabel: '', passaggi: [], errore: null, arrived: false, tentativi: 0 }
}

function agentiVuoti(): Record<AgentKey, AgentRuntime> {
  return AGENT_KEYS.reduce(
    (acc, k) => {
      acc[k] = agenteVuoto()
      return acc
    },
    {} as Record<AgentKey, AgentRuntime>,
  )
}

// La chiave API resta in localStorage e non entra mai nello stato persistito.
function leggiChiave(): string {
  try {
    return localStorage.getItem(CHIAVE_API_STORAGE) ?? ''
  } catch {
    return ''
  }
}

function scriviChiave(valore: string) {
  try {
    if (valore) localStorage.setItem(CHIAVE_API_STORAGE, valore)
    else localStorage.removeItem(CHIAVE_API_STORAGE)
  } catch {
    // Storage non disponibile: la chiave resta solo in memoria per questa sessione.
  }
}

/** localStorage è troppo piccolo per i capitoli: la sessione vive in IndexedDB. */
const storageIndexedDb: StateStorage = {
  getItem: async (nome) => (await get<string>(nome)) ?? null,
  setItem: async (nome, valore) => {
    await idbSet(nome, valore)
  },
  removeItem: async (nome) => {
    await del(nome)
  },
}

let idLog = 0
let idTicker = 0

export interface StudioState {
  // --- configurazione ---
  apiKey: string
  modelli: Record<ModelSlot, string>

  // --- materiale ---
  courseFiles: CourseFile[]
  caseFiles: CaseFile[]
  argomento: string
  capitolo: string

  // --- esecuzione ---
  agenti: Record<AgentKey, AgentRuntime>
  inEsecuzione: boolean
  agenteAttivo: AgentKey | null
  erroreGlobale: string | null
  /** Agente da cui ripartire dopo un errore. */
  ripresaDa: AgentKey | null

  dossier: RisultatoLettore | null
  fonti: Fonte[]
  fontiScartate: FonteScartata[]
  selezionate: SceltaFonte[]
  scartateDalSelettore: SceltaFonte[]
  coperturaSufficiente: boolean
  avvisoRicerca: string | null

  approvazione: ApprovalStatus
  giroApprovazione: number
  motivoRifiuto: string
  storicoApprovazioni: string[]

  opzioni: Opzione[]
  referto: RisultatoControllore | null

  // --- diagnostica e interfaccia ---
  log: LogEntry[]
  consoleAperta: boolean
  logNonVisti: number
  erroriNonVisti: number
  ticker: TickerItem[]

  nuvolettaAperta: AgentKey | null
  fuocoCamera: AgentKey | null
  tokenFuoco: number
  campanellaSuonata: boolean
  audioAttivo: boolean

  chat: ChatMessage[]
  chatInCorso: boolean
  chatErrore: string | null
  chatParziale: string

  // --- azioni ---
  setApiKey: (k: string) => void
  setModello: (slot: ModelSlot, id: string) => void
  ripristinaModelli: () => void

  aggiungiCourseFile: (f: CourseFile) => void
  aggiornaCourseFile: (id: string, patch: Partial<CourseFile>) => void
  rimuoviCourseFile: (id: string) => void
  aggiungiCaseFile: (f: CaseFile) => void
  aggiornaCaseFile: (id: string, patch: Partial<CaseFile>) => void
  rimuoviCaseFile: (id: string) => void

  setArgomento: (v: string) => void
  setCapitolo: (v: string) => void

  patchAgente: (k: AgentKey, patch: Partial<AgentRuntime>) => void
  setArrivato: (k: AgentKey, v: boolean) => void
  setInEsecuzione: (v: boolean) => void
  setAgenteAttivo: (k: AgentKey | null) => void
  setErroreGlobale: (m: string | null) => void
  setRipresaDa: (k: AgentKey | null) => void

  setDossier: (d: RisultatoLettore | null) => void
  setFonti: (f: Fonte[], scartate: FonteScartata[]) => void
  setSelezione: (sel: SceltaFonte[], scartate: SceltaFonte[], copertura: boolean) => void
  setAvvisoRicerca: (m: string | null) => void

  chiediApprovazione: () => void
  approva: () => void
  rifiuta: (motivo: string) => void
  azzeraApprovazione: () => void

  inizializzaOpzioni: (opzioni: Opzione[]) => void
  patchOpzione: (impianto: ImpiantoKey, patch: Partial<Opzione>) => void
  setReferto: (r: RisultatoControllore | null) => void

  aggiungiLog: (kind: LogKind, agente: AgentKey | null, messaggio: string) => void
  setConsoleAperta: (v: boolean) => void
  svuotaLog: () => void
  aggiungiTicker: (testo: string, segno: TickerItem['segno']) => void

  alternaNuvoletta: (k: AgentKey) => void
  chiudiNuvoletta: () => void
  inquadra: (k: AgentKey | null) => void
  setCampanella: (v: boolean) => void
  setAudioAttivo: (v: boolean) => void

  aggiungiChat: (m: ChatMessage) => void
  setChatInCorso: (v: boolean) => void
  setChatErrore: (m: string | null) => void
  setChatParziale: (t: string) => void
  svuotaChat: () => void

  sbloccaInterfaccia: () => void
  nuovaSessione: () => void
}

const statoEsecuzioneVuoto = {
  agenti: agentiVuoti(),
  inEsecuzione: false,
  agenteAttivo: null,
  erroreGlobale: null,
  ripresaDa: null,
  dossier: null,
  fonti: [],
  fontiScartate: [],
  selezionate: [],
  scartateDalSelettore: [],
  coperturaSufficiente: true,
  avvisoRicerca: null,
  approvazione: 'inattiva' as ApprovalStatus,
  giroApprovazione: 0,
  motivoRifiuto: '',
  storicoApprovazioni: [],
  opzioni: [],
  referto: null,
  nuvolettaAperta: null,
  campanellaSuonata: false,
}

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      apiKey: leggiChiave(),
      modelli: { ...MODELLI_PREDEFINITI },

      courseFiles: [],
      caseFiles: [],
      argomento: ARGOMENTO_PREDEFINITO,
      capitolo: CAPITOLO_PREDEFINITO,

      ...statoEsecuzioneVuoto,

      log: [],
      consoleAperta: false,
      logNonVisti: 0,
      erroriNonVisti: 0,
      ticker: [],

      fuocoCamera: null,
      tokenFuoco: 0,
      audioAttivo: true,

      chat: [],
      chatInCorso: false,
      chatErrore: null,
      chatParziale: '',

      setApiKey: (k) => {
        scriviChiave(k)
        set({ apiKey: k, erroreGlobale: null })
      },
      setModello: (slot, id) => set((s) => ({ modelli: { ...s.modelli, [slot]: id } })),
      ripristinaModelli: () => set({ modelli: { ...MODELLI_PREDEFINITI } }),

      aggiungiCourseFile: (f) => set((s) => ({ courseFiles: [...s.courseFiles, f] })),
      aggiornaCourseFile: (id, patch) =>
        set((s) => ({ courseFiles: s.courseFiles.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      rimuoviCourseFile: (id) => set((s) => ({ courseFiles: s.courseFiles.filter((f) => f.id !== id) })),
      aggiungiCaseFile: (f) => set((s) => ({ caseFiles: [...s.caseFiles, f] })),
      aggiornaCaseFile: (id, patch) =>
        set((s) => ({ caseFiles: s.caseFiles.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      rimuoviCaseFile: (id) => set((s) => ({ caseFiles: s.caseFiles.filter((f) => f.id !== id) })),

      setArgomento: (argomento) => set({ argomento }),
      setCapitolo: (capitolo) => set({ capitolo }),

      patchAgente: (k, patch) =>
        set((s) => ({ agenti: { ...s.agenti, [k]: { ...s.agenti[k], ...patch } } })),
      setArrivato: (k, v) =>
        set((s) =>
          s.agenti[k].arrived === v ? s : { agenti: { ...s.agenti, [k]: { ...s.agenti[k], arrived: v } } },
        ),
      setInEsecuzione: (inEsecuzione) => set({ inEsecuzione }),
      setAgenteAttivo: (agenteAttivo) => set({ agenteAttivo }),
      setErroreGlobale: (erroreGlobale) => set({ erroreGlobale }),
      setRipresaDa: (ripresaDa) => set({ ripresaDa }),

      setDossier: (dossier) => set({ dossier }),
      setFonti: (fonti, fontiScartate) => set({ fonti, fontiScartate }),
      setSelezione: (selezionate, scartateDalSelettore, coperturaSufficiente) =>
        set({ selezionate, scartateDalSelettore, coperturaSufficiente }),
      setAvvisoRicerca: (avvisoRicerca) => set({ avvisoRicerca }),

      chiediApprovazione: () =>
        set((s) => ({
          approvazione: 'in_attesa',
          giroApprovazione: s.giroApprovazione + 1,
          motivoRifiuto: '',
        })),
      approva: () =>
        set((s) => ({
          approvazione: 'approvata',
          storicoApprovazioni: [...s.storicoApprovazioni, `Giro ${s.giroApprovazione}: approvato.`],
        })),
      rifiuta: (motivo) =>
        set((s) => ({
          approvazione: 'rifiutata',
          motivoRifiuto: motivo,
          storicoApprovazioni: [
            ...s.storicoApprovazioni,
            `Giro ${s.giroApprovazione}: non convince${motivo.trim() ? ` — ${motivo.trim()}` : '.'}`,
          ],
        })),
      azzeraApprovazione: () => set({ approvazione: 'inattiva', motivoRifiuto: '' }),

      inizializzaOpzioni: (opzioni) => set({ opzioni }),
      patchOpzione: (impianto, patch) =>
        set((s) => ({
          opzioni: s.opzioni.map((o) => (o.impianto === impianto ? { ...o, ...patch } : o)),
        })),
      setReferto: (referto) => set({ referto }),

      aggiungiLog: (kind, agente, messaggio) =>
        set((s) => {
          idLog += 1
          const voce: LogEntry = { id: idLog, at: Date.now(), kind, agente, messaggio }
          const log = [...s.log, voce].slice(-MAX_LOG)
          if (s.consoleAperta) return { log }
          return {
            log,
            logNonVisti: s.logNonVisti + 1,
            erroriNonVisti: s.erroriNonVisti + (kind === 'fallimento' ? 1 : 0),
          }
        }),
      setConsoleAperta: (v) =>
        set(v ? { consoleAperta: true, logNonVisti: 0, erroriNonVisti: 0 } : { consoleAperta: false }),
      svuotaLog: () => set({ log: [], logNonVisti: 0, erroriNonVisti: 0 }),
      aggiungiTicker: (testo, segno) =>
        set((s) => {
          idTicker += 1
          return { ticker: [...s.ticker, { id: idTicker, testo, segno }].slice(-MAX_TICKER) }
        }),

      alternaNuvoletta: (k) =>
        set((s) => ({ nuvolettaAperta: s.nuvolettaAperta === k ? null : k })),
      chiudiNuvoletta: () => set({ nuvolettaAperta: null }),
      inquadra: (k) => set((s) => ({ fuocoCamera: k, tokenFuoco: s.tokenFuoco + 1 })),
      setCampanella: (campanellaSuonata) => set({ campanellaSuonata }),
      setAudioAttivo: (audioAttivo) => set({ audioAttivo }),

      aggiungiChat: (m) => set((s) => ({ chat: [...s.chat, m] })),
      setChatInCorso: (chatInCorso) => set({ chatInCorso }),
      setChatErrore: (chatErrore) => set({ chatErrore }),
      setChatParziale: (chatParziale) => set({ chatParziale }),
      svuotaChat: () => set({ chat: [], chatErrore: null, chatParziale: '' }),

      /** Riabilita i controlli: usata dal Controllore dopo un errore di runtime. */
      sbloccaInterfaccia: () => {
        const { agenti } = get()
        const patch = { ...agenti }
        for (const k of AGENT_KEYS) {
          if (patch[k].status === 'working' || patch[k].status === 'walking') {
            patch[k] = {
              ...patch[k],
              status: 'error',
              microLabel: 'interrotto',
              errore: patch[k].errore ?? 'Interfaccia ripristinata dopo un errore di runtime.',
            }
          }
        }
        set({ agenti: patch, inEsecuzione: false, agenteAttivo: null, chatInCorso: false })
      },

      nuovaSessione: () =>
        set({
          ...statoEsecuzioneVuoto,
          agenti: agentiVuoti(),
          courseFiles: [],
          caseFiles: [],
          log: [],
          logNonVisti: 0,
          erroriNonVisti: 0,
          ticker: [],
          chat: [],
          chatErrore: null,
          chatParziale: '',
          chatInCorso: false,
        }),
    }),
    {
      name: 'studio-tesi-sessione',
      storage: createJSONStorage(() => storageIndexedDb),
      version: 1,
      // I PDF originali non si salvano: pesano troppo e si ricaricano.
      partialize: (s) => ({
        modelli: s.modelli,
        argomento: s.argomento,
        capitolo: s.capitolo,
        courseFiles: s.courseFiles.map((f) => ({ ...f, base64: undefined })),
        caseFiles: s.caseFiles,
        agenti: s.agenti,
        dossier: s.dossier,
        fonti: s.fonti,
        fontiScartate: s.fontiScartate,
        selezionate: s.selezionate,
        scartateDalSelettore: s.scartateDalSelettore,
        coperturaSufficiente: s.coperturaSufficiente,
        approvazione: s.approvazione,
        giroApprovazione: s.giroApprovazione,
        storicoApprovazioni: s.storicoApprovazioni,
        opzioni: s.opzioni,
        referto: s.referto,
        log: s.log,
        ticker: s.ticker,
        chat: s.chat,
        audioAttivo: s.audioAttivo,
      }),
    },
  ),
)

// --- selettori ---------------------------------------------------------------

/** I PDF salvati perdono il base64: dopo un ricaricamento vanno ricaricati. */
export function materialeDaRicaricare(s: StudioState): CourseFile[] {
  return s.courseFiles.filter((f) => f.kind === 'pdf' && f.status === 'pronto' && !f.base64)
}

export function materialePronto(s: StudioState): boolean {
  return (
    s.courseFiles.length > 0 &&
    s.courseFiles.every((f) => f.status === 'pronto') &&
    materialeDaRicaricare(s).length === 0
  )
}

export function siPuoAvviare(s: StudioState): boolean {
  return (
    materialePronto(s) &&
    s.argomento.trim().length > 0 &&
    s.capitolo.trim().length > 0 &&
    s.apiKey.trim().length > 0 &&
    !s.inEsecuzione
  )
}

export function fontiApprovate(s: StudioState): Fonte[] {
  const scelte = new Set(s.selezionate.map((v) => v.url))
  return s.fonti.filter((f) => scelte.has(f.url))
}
