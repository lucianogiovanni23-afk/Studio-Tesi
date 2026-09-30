import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set as idbSet } from 'idb-keyval'
import { MODELLI_PREDEFINITI, impostaRegistratoreUso, type ModelSlot } from './agents/api'
import { contaParole } from './agents/citations'
import { costoUso } from './agents/costs'
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
  GiudizioCitazione,
  ImpiantoKey,
  LogEntry,
  LogKind,
  ModalitaScena,
  Opzione,
  Paragrafo,
  Passo,
  PrefissoScrittore,
  Profondita,
  RisultatoControllore,
  RisultatoLettore,
  Scaletta,
  SceltaFonte,
  TickerItem,
  Vista,
  VoceUso,
} from './types'

const CHIAVE_API_STORAGE = 'studio-tesi.anthropic-api-key'
const MAX_LOG = 500
const MAX_TICKER = 40
const MAX_USI = 400

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

export interface InfoLettura {
  passaggi: number
  file: number
  caratteri: number
  /** Caratteri totali del corpus, per mostrare quanta parte è stata letta. */
  totale: number
}

export interface StudioState {
  // --- configurazione ---
  apiKey: string
  modelli: Record<ModelSlot, string>
  profondita: Profondita
  modalitaScena: ModalitaScena

  // --- materiale ---
  courseFiles: CourseFile[]
  caseFiles: CaseFile[]
  argomento: string
  capitolo: string
  /** true quando il corpus salvato è stato confrontato con l'elenco dei file. */
  corpusSincronizzato: boolean

  // --- esecuzione ---
  agenti: Record<AgentKey, AgentRuntime>
  inEsecuzione: boolean
  agenteAttivo: AgentKey | null
  erroreGlobale: string | null
  /** Agente da cui ripartire dopo un errore. */
  ripresaDa: AgentKey | null
  esecuzione: number

  dossier: RisultatoLettore | null
  infoLettura: InfoLettura | null
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

  prefissoScrittore: PrefissoScrittore | null
  scaletta: Scaletta | null
  approvazioneScaletta: ApprovalStatus
  giroScaletta: number
  motivoRifiutoScaletta: string
  storicoScaletta: string[]

  opzioni: Opzione[]
  opzioneAttiva: ImpiantoKey
  referto: RisultatoControllore | null

  usi: VoceUso[]

  // --- diagnostica e interfaccia ---
  vista: Vista
  passoAttivo: Passo
  letturaAperta: ImpiantoKey | null
  log: LogEntry[]
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
  setProfondita: (p: Profondita) => void
  setModalitaScena: (m: ModalitaScena) => void

  aggiungiCourseFile: (f: CourseFile) => void
  aggiornaCourseFile: (id: string, patch: Partial<CourseFile>) => void
  rimuoviCourseFile: (id: string) => void
  aggiungiCaseFile: (f: CaseFile) => void
  aggiornaCaseFile: (id: string, patch: Partial<CaseFile>) => void
  rimuoviCaseFile: (id: string) => void
  setCorpusSincronizzato: (v: boolean) => void

  setArgomento: (v: string) => void
  setCapitolo: (v: string) => void

  patchAgente: (k: AgentKey, patch: Partial<AgentRuntime>) => void
  setArrivato: (k: AgentKey, v: boolean) => void
  setInEsecuzione: (v: boolean) => void
  setAgenteAttivo: (k: AgentKey | null) => void
  setErroreGlobale: (m: string | null) => void
  setRipresaDa: (k: AgentKey | null) => void
  nuovaEsecuzione: () => void

  setDossier: (d: RisultatoLettore | null) => void
  setInfoLettura: (i: InfoLettura | null) => void
  setFonti: (f: Fonte[], scartate: FonteScartata[]) => void
  setSelezione: (sel: SceltaFonte[], scartate: SceltaFonte[], copertura: boolean) => void
  setAvvisoRicerca: (m: string | null) => void

  chiediApprovazione: () => void
  approva: () => void
  rifiuta: (motivo: string) => void
  azzeraApprovazione: () => void

  setPrefissoScrittore: (p: PrefissoScrittore | null) => void
  setScaletta: (s: Scaletta | null) => void
  chiediApprovazioneScaletta: () => void
  approvaScaletta: () => void
  rifiutaScaletta: (motivo: string) => void
  azzeraApprovazioneScaletta: () => void

  inizializzaOpzioni: (opzioni: Opzione[]) => void
  patchOpzione: (impianto: ImpiantoKey, patch: Partial<Opzione>) => void
  setOpzioneAttiva: (i: ImpiantoKey) => void
  /** Sostituisce un paragrafo conservando la versione precedente per l'annullamento. */
  patchParagrafo: (impianto: ImpiantoKey, indice: number, paragrafo: Paragrafo) => void
  annullaParagrafo: (impianto: ImpiantoKey, indice: number) => void
  applicaGiudizi: (giudizi: GiudizioCitazione[]) => void
  setReferto: (r: RisultatoControllore | null) => void

  registraUso: (voce: Omit<VoceUso, 'at' | 'esecuzione'>) => void
  azzeraUsi: () => void

  setVista: (v: Vista) => void
  setPassoAttivo: (p: Passo) => void
  apriLettura: (i: ImpiantoKey | null) => void
  aggiungiLog: (kind: LogKind, agente: AgentKey | null, messaggio: string) => void
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
  infoLettura: null,
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
  prefissoScrittore: null,
  scaletta: null,
  approvazioneScaletta: 'inattiva' as ApprovalStatus,
  giroScaletta: 0,
  motivoRifiutoScaletta: '',
  storicoScaletta: [],
  opzioni: [],
  opzioneAttiva: 'A' as ImpiantoKey,
  referto: null,
  letturaAperta: null,
  nuvolettaAperta: null,
  campanellaSuonata: false,
}

function aggiornaOpzione(opzioni: Opzione[], impianto: ImpiantoKey, fn: (o: Opzione) => Opzione): Opzione[] {
  return opzioni.map((o) => (o.impianto === impianto ? fn(o) : o))
}

export const useStudioStore = create<StudioState>()(
  persist(
    (set, get) => ({
      apiKey: leggiChiave(),
      modelli: { ...MODELLI_PREDEFINITI },
      profondita: 'standard',
      modalitaScena: 'auto',

      courseFiles: [],
      caseFiles: [],
      argomento: ARGOMENTO_PREDEFINITO,
      capitolo: CAPITOLO_PREDEFINITO,
      corpusSincronizzato: false,

      ...statoEsecuzioneVuoto,
      esecuzione: 0,
      usi: [],

      vista: 'lavoro',
      passoAttivo: 'materiale',
      log: [],
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
      setProfondita: (profondita) => set({ profondita }),
      setModalitaScena: (modalitaScena) => set({ modalitaScena }),

      aggiungiCourseFile: (f) => set((s) => ({ courseFiles: [...s.courseFiles, f] })),
      aggiornaCourseFile: (id, patch) =>
        set((s) => ({ courseFiles: s.courseFiles.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      rimuoviCourseFile: (id) => set((s) => ({ courseFiles: s.courseFiles.filter((f) => f.id !== id) })),
      aggiungiCaseFile: (f) => set((s) => ({ caseFiles: [...s.caseFiles, f] })),
      aggiornaCaseFile: (id, patch) =>
        set((s) => ({ caseFiles: s.caseFiles.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      rimuoviCaseFile: (id) => set((s) => ({ caseFiles: s.caseFiles.filter((f) => f.id !== id) })),
      setCorpusSincronizzato: (corpusSincronizzato) => set({ corpusSincronizzato }),

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
      nuovaEsecuzione: () => set((s) => ({ esecuzione: s.esecuzione + 1 })),

      setDossier: (dossier) => set({ dossier }),
      setInfoLettura: (infoLettura) => set({ infoLettura }),
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

      setPrefissoScrittore: (prefissoScrittore) => set({ prefissoScrittore }),
      setScaletta: (scaletta) => set({ scaletta }),
      chiediApprovazioneScaletta: () =>
        set((s) => ({
          approvazioneScaletta: 'in_attesa',
          giroScaletta: s.giroScaletta + 1,
          motivoRifiutoScaletta: '',
        })),
      approvaScaletta: () =>
        set((s) => ({
          approvazioneScaletta: 'approvata',
          storicoScaletta: [...s.storicoScaletta, `Scaletta ${s.giroScaletta}: approvata.`],
        })),
      rifiutaScaletta: (motivo) =>
        set((s) => ({
          approvazioneScaletta: 'rifiutata',
          motivoRifiutoScaletta: motivo,
          storicoScaletta: [
            ...s.storicoScaletta,
            `Scaletta ${s.giroScaletta}: da rifare${motivo.trim() ? ` — ${motivo.trim()}` : '.'}`,
          ],
        })),
      azzeraApprovazioneScaletta: () => set({ approvazioneScaletta: 'inattiva', motivoRifiutoScaletta: '' }),

      inizializzaOpzioni: (opzioni) => set({ opzioni }),
      patchOpzione: (impianto, patch) =>
        set((s) => ({ opzioni: aggiornaOpzione(s.opzioni, impianto, (o) => ({ ...o, ...patch })) })),
      setOpzioneAttiva: (opzioneAttiva) => set({ opzioneAttiva }),
      patchParagrafo: (impianto, indice, paragrafo) =>
        set((s) => ({
          opzioni: aggiornaOpzione(s.opzioni, impianto, (o) => {
            if (!o.risultato || !o.risultato.paragrafi[indice]) return o
            const paragrafi = o.risultato.paragrafi.map((p, i) => (i === indice ? paragrafo : p))
            return {
              ...o,
              risultato: { ...o.risultato, paragrafi },
              parole: contaParole(paragrafi),
              storico: { ...o.storico, [indice]: [...(o.storico[indice] ?? []), o.risultato.paragrafi[indice]] },
            }
          }),
        })),
      annullaParagrafo: (impianto, indice) =>
        set((s) => ({
          opzioni: aggiornaOpzione(s.opzioni, impianto, (o) => {
            const versioni = o.storico[indice] ?? []
            if (!o.risultato || versioni.length === 0) return o
            const precedente = versioni[versioni.length - 1]
            const paragrafi = o.risultato.paragrafi.map((p, i) => (i === indice ? precedente : p))
            return {
              ...o,
              risultato: { ...o.risultato, paragrafi },
              parole: contaParole(paragrafi),
              storico: { ...o.storico, [indice]: versioni.slice(0, -1) },
            }
          }),
        })),
      applicaGiudizi: (giudizi) =>
        set((s) => {
          const perId = new Map(giudizi.map((g) => [g.id.trim().toUpperCase(), g]))
          return {
            opzioni: s.opzioni.map((o) => {
              if (!o.risultato) return o
              const paragrafi = o.risultato.paragrafi.map((p, ip) => ({
                ...p,
                citazioni: p.citazioni.map((c, ic) => {
                  const g = perId.get(`${o.impianto}.${ip + 1}.${ic + 1}`)
                  if (!g) return c
                  return {
                    ...c,
                    verifica: {
                      testuale: c.verifica?.testuale ?? 'non_trovato',
                      giudizio: g.giudizio,
                      nota: g.nota,
                    },
                  }
                }),
              }))
              return { ...o, risultato: { ...o.risultato, paragrafi } }
            }),
          }
        }),
      setReferto: (referto) => set({ referto }),

      registraUso: (voce) =>
        set((s) => ({ usi: [...s.usi, { ...voce, at: Date.now(), esecuzione: s.esecuzione }].slice(-MAX_USI) })),
      azzeraUsi: () => set({ usi: [] }),

      setVista: (vista) =>
        set(vista === 'console' ? { vista, logNonVisti: 0, erroriNonVisti: 0 } : { vista }),
      setPassoAttivo: (passoAttivo) => set({ passoAttivo }),
      apriLettura: (letturaAperta) => set({ letturaAperta }),
      aggiungiLog: (kind, agente, messaggio) =>
        set((s) => {
          idLog += 1
          const voce: LogEntry = { id: idLog, at: Date.now(), kind, agente, messaggio }
          const log = [...s.log, voce].slice(-MAX_LOG)
          if (s.vista === 'console') return { log }
          return {
            log,
            logNonVisti: s.logNonVisti + 1,
            erroriNonVisti: s.erroriNonVisti + (kind === 'fallimento' ? 1 : 0),
          }
        }),
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
        const { agenti, opzioni } = get()
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
        set({
          agenti: patch,
          inEsecuzione: false,
          agenteAttivo: null,
          chatInCorso: false,
          opzioni: opzioni.map((o) => (o.rifinisce === null ? o : { ...o, rifinisce: null })),
        })
      },

      nuovaSessione: () =>
        set({
          ...statoEsecuzioneVuoto,
          agenti: agentiVuoti(),
          courseFiles: [],
          caseFiles: [],
          passoAttivo: 'materiale',
          vista: 'lavoro',
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
      version: 2,
      // I PDF scansionati non si salvano: pesano troppo e si ricaricano.
      partialize: (s) => ({
        modelli: s.modelli,
        profondita: s.profondita,
        modalitaScena: s.modalitaScena,
        argomento: s.argomento,
        capitolo: s.capitolo,
        courseFiles: s.courseFiles.map((f) => ({ ...f, base64: undefined })),
        caseFiles: s.caseFiles,
        agenti: s.agenti,
        esecuzione: s.esecuzione,
        dossier: s.dossier,
        infoLettura: s.infoLettura,
        fonti: s.fonti,
        fontiScartate: s.fontiScartate,
        selezionate: s.selezionate,
        scartateDalSelettore: s.scartateDalSelettore,
        coperturaSufficiente: s.coperturaSufficiente,
        approvazione: s.approvazione,
        giroApprovazione: s.giroApprovazione,
        storicoApprovazioni: s.storicoApprovazioni,
        prefissoScrittore: s.prefissoScrittore,
        scaletta: s.scaletta,
        approvazioneScaletta: s.approvazioneScaletta,
        giroScaletta: s.giroScaletta,
        storicoScaletta: s.storicoScaletta,
        opzioni: s.opzioni.map((o) => ({ ...o, rifinisce: null })),
        opzioneAttiva: s.opzioneAttiva,
        referto: s.referto,
        usi: s.usi,
        passoAttivo: s.passoAttivo,
        log: s.log,
        ticker: s.ticker,
        chat: s.chat,
        audioAttivo: s.audioAttivo,
      }),
      // Dalla versione 1 si tengono solo le scelte dello studente: i risultati
      // avevano un formato diverso (niente estratti, niente citazioni).
      migrate: (salvato, versione) => {
        const s = (salvato ?? {}) as Partial<StudioState>
        if (versione >= 2) return s as StudioState
        const modelli = { ...MODELLI_PREDEFINITI, ...(s.modelli ?? {}) } as Record<ModelSlot, string>
        if (modelli.selettore === 'claude-sonnet-5') modelli.selettore = MODELLI_PREDEFINITI.selettore
        return {
          modelli,
          argomento: s.argomento ?? ARGOMENTO_PREDEFINITO,
          capitolo: s.capitolo ?? CAPITOLO_PREDEFINITO,
          caseFiles: s.caseFiles ?? [],
          chat: s.chat ?? [],
          audioAttivo: s.audioAttivo ?? true,
        } as unknown as StudioState
      },
    },
  ),
)

// Ogni chiamata API registra qui i token consumati e il loro costo.
impostaRegistratoreUso((chi, modello, uso) => {
  useStudioStore.getState().registraUso({
    chi,
    modello,
    input: uso.input,
    output: uso.output,
    scritturaCache: uso.scritturaCache5m + uso.scritturaCache1h,
    letturaCache: uso.letturaCache,
    ricerche: uso.ricerche,
    letture: uso.letture,
    costo: costoUso(modello, uso),
  })
})

// --- selettori ---------------------------------------------------------------
// Restituiscono solo valori primitivi o porzioni esistenti dello stato: gli
// elenchi derivati vanno calcolati nei componenti con useMemo.

/** I PDF scansionati perdono il base64 al ricaricamento: vanno ricaricati. */
export function daRicaricare(f: CourseFile): boolean {
  return f.status === 'pronto' && !!f.scansionato && !f.base64
}

export function materialePronto(s: StudioState): boolean {
  return (
    s.corpusSincronizzato &&
    s.courseFiles.length > 0 &&
    s.courseFiles.every((f) => f.status === 'pronto' && !daRicaricare(f))
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

/** Da usare fuori dal render (pipeline): crea un nuovo elenco a ogni chiamata. */
export function calcolaFontiApprovate(fonti: Fonte[], selezionate: SceltaFonte[]): Fonte[] {
  const scelte = new Set(selezionate.map((v) => v.url))
  return fonti.filter((f) => scelte.has(f.url))
}

export function costoTotale(usi: VoceUso[], esecuzione?: number): number {
  return usi.reduce((s, u) => (esecuzione === undefined || u.esecuzione === esecuzione ? s + u.costo : s), 0)
}
