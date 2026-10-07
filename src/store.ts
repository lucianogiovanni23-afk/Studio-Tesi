import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set as idbSet } from 'idb-keyval'
import { AGENT_KEYS } from './agents/agenti'
import { impostaControlloBudget, impostaModalitaGratuita, impostaRegistratoreUso } from './agents/api'
import { costoUso, risparmioCache } from './agents/costs'
import {
  adesso,
  firmaCorso,
  nuovaSezione,
  nuovoCapitolo,
  normalizzaProgetto,
  nuovoId,
  prossimoNumero,
  preferenzeIniziali,
  progettoIniziale,
} from './domain/progettoIniziale'
import type {
  AgentKey,
  AgentRuntime,
  Autore,
  Candidato,
  Capitolo,
  Citazione,
  ControlloTesi,
  MessaggioChat,
  Osservazione,
  PropostaRevisione,
  CourseFile,
  Fonte,
  ModelSlot,
  Preferenze,
  Progetto,
  QuadroTeorico,
  RegistroRicerca,
  Schermata,
  Sezione,
  StatoCapitolo,
  StileCitazione,
  VoceGlossario,
  VoceUso,
  ObiettivoPagine,
  Battuta,
} from './types'

export const CHIAVE_API_STORAGE = 'studio-tesi.anthropic-api-key'
const MAX_LOG = 400
const MAX_USI = 2000
const MAX_VERSIONI = 60

export type LogKind = 'info' | 'ok' | 'avviso' | 'riparazione' | 'fallimento'

export interface LogEntry {
  id: string
  ora: string
  kind: LogKind
  agente: AgentKey | null
  messaggio: string
}

function agenteVuoto(): AgentRuntime {
  return { status: 'riposo', etichetta: '', passaggi: [], errore: null, tentativi: 0 }
}

function agentiVuoti(): Record<AgentKey, AgentRuntime> {
  return Object.fromEntries(AGENT_KEYS.map((k) => [k, agenteVuoto()])) as Record<AgentKey, AgentRuntime>
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
    // Storage non disponibile: la chiave resta in memoria per questa sessione.
  }
}

/** localStorage è troppo piccolo per una tesi: il progetto vive in IndexedDB. */
const archivioIdb: StateStorage = {
  getItem: async (nome) => (await get<string>(nome)) ?? null,
  setItem: async (nome, valore) => {
    await idbSet(nome, valore)
  },
  removeItem: async (nome) => {
    await del(nome)
  },
}

export interface StatoStudio {
  progetto: Progetto
  preferenze: Preferenze
  apiKey: string

  schermata: Schermata
  capitoloAperto: string | null
  sezioneAperta: string | null
  cartaAperta: boolean
  /** Fonte aperta in Biblioteca (anche arrivando dalla ricerca o dalla mappa di copertura). */
  fonteAperta: string | null
  /** Domanda da proporre nella pagina di ricerca, per esempio dalla mappa di copertura. */
  domandaProposta: string
  concentrazione: boolean
  /** L'agente con cui stai parlando nell'ufficio. */
  agenteUfficio: AgentKey
  /** Fino a quando (ms) l'agente scelto "parla" nella scena. */
  parlaFino: number
  /** Cresce a ogni scelta di una persona: la telecamera la raggiunge anche se era già scelta. */
  inquadratura: number
  nuvoletta: AgentKey | null
  agenti: Record<AgentKey, AgentRuntime>
  log: LogEntry[]
  corpusSincronizzato: boolean

  // impostazioni
  setApiKey: (v: string) => void
  setModello: (slot: ModelSlot, id: string) => void
  setPreferenze: (p: Partial<Omit<Preferenze, 'modelli'>>) => void

  // navigazione
  vai: (s: Schermata) => void
  apriSezione: (capitoloId: string, sezioneId: string | null) => void
  setCarta: (v: boolean) => void
  apriFonte: (id: string | null) => void
  proponiRicerca: (domanda: string) => void
  setConcentrazione: (v: boolean) => void
  scegliAgente: (k: AgentKey) => void
  aggiungiBattuta: (k: AgentKey, b: Omit<Battuta, 'id' | 'data'>) => string
  aggiornaBattuta: (k: AgentKey, id: string, testo: string) => void
  svuotaConversazione: (k: AgentKey) => void
  faiParlare: (ms: number) => void
  apriNuvoletta: (k: AgentKey | null) => void

  // progetto
  setTitolo: (v: string) => void
  setDomanda: (v: string) => void
  setCaso: (c: Partial<Progetto['casoAziendale']>) => void
  setStileCitazione: (s: StileCitazione) => void

  // indice
  aggiungiCapitolo: (titolo: string) => void
  rinominaCapitolo: (id: string, titolo: string) => void
  rimuoviCapitolo: (id: string) => void
  spostaCapitolo: (id: string, delta: -1 | 1) => void
  setStatoCapitolo: (id: string, stato: StatoCapitolo) => void
  aggiungiSezione: (capitoloId: string, titolo: string) => void
  aggiornaSezione: (capitoloId: string, sezioneId: string, patch: Partial<Pick<Sezione, 'titolo' | 'obiettivo'>>) => void
  rimuoviSezione: (capitoloId: string, sezioneId: string) => void
  spostaSezione: (capitoloId: string, sezioneId: string, delta: -1 | 1) => void
  approvaIndice: () => void

  // testi e versioni
  setTestoSezione: (capitoloId: string, sezioneId: string, testo: string) => void
  salvaVersione: (capitoloId: string, sezioneId: string, nota: string, autore?: Autore) => boolean
  ripristinaVersione: (capitoloId: string, sezioneId: string, versioneId: string) => void

  // stesura per sezioni
  setFontiSezione: (capitoloId: string, sezioneId: string, ids: string[]) => void
  confermaFontiSezione: (capitoloId: string, sezioneId: string, si: boolean) => void
  setScaletta: (capitoloId: string, sezioneId: string, punti: string[]) => void
  approvaScaletta: (capitoloId: string, sezioneId: string, si: boolean) => void
  /** Sostituisce testo e citazioni conservando prima il testo corrente fra le versioni. */
  applicaTesto: (capitoloId: string, sezioneId: string, testo: string, citazioni: Citazione[], nota: string, autore: Autore) => void
  setCitazioni: (capitoloId: string, sezioneId: string, citazioni: Citazione[]) => void

  // revisione e chat
  aggiungiOsservazione: (testo: string, capitoloId: string | null) => string
  aggiornaOsservazione: (id: string, patch: Partial<Osservazione>) => void
  rimuoviOsservazione: (id: string) => void
  aggiornaPropostaRevisione: (osservazioneId: string, propostaId: string, patch: Partial<PropostaRevisione>) => void
  setControllo: (c: ControlloTesi | null) => void
  aggiungiMessaggio: (m: MessaggioChat) => void
  aggiornaMessaggio: (id: string, testo: string) => void
  svuotaChat: () => void
  /** Segna come "usate" le fonti citate nei capitoli, con i capitoli in cui compaiono. */
  segnaFontiCitate: () => number

  // glossario
  aggiungiVoce: (v: Omit<VoceGlossario, 'id'>) => void
  aggiornaVoce: (id: string, patch: Partial<Omit<VoceGlossario, 'id'>>) => void
  rimuoviVoce: (id: string) => void
  /** Aggiunge o aggiorna i termini ricavati dal corso: hanno la precedenza sulle definizioni iniziali, non su quelle scritte dallo studente. */
  unisciLessico: (voci: Omit<VoceGlossario, 'id'>[]) => { nuove: number; aggiornate: number }

  // biblioteca e ricerca
  registraRicerca: (r: RegistroRicerca, candidati: Candidato[]) => void
  decidiCandidato: (id: string, approva: boolean) => void
  aggiornaCandidato: (id: string, patch: Partial<Fonte>) => void
  aggiungiFonte: (f: Fonte) => void
  aggiornaFonte: (id: string, patch: Partial<Fonte>) => void
  rimuoviFonte: (id: string) => void

  // materiale del corso
  aggiungiCourseFile: (f: CourseFile) => void
  aggiornaCourseFile: (id: string, patch: Partial<CourseFile>) => void
  rimuoviCourseFile: (id: string) => void
  setQuadro: (q: QuadroTeorico | null) => void
  setCorpusSincronizzato: (v: boolean) => void

  // costi
  registraUso: (v: Omit<VoceUso, 'id' | 'data'>) => void
  azzeraUsi: () => void
  setBudget: (dollari: number | null) => void
  setObiettivo: (o: Partial<ObiettivoPagine>) => void

  // agenti e registro
  patchAgente: (k: AgentKey, patch: Partial<AgentRuntime>) => void
  aggiungiLog: (kind: LogKind, agente: AgentKey | null, messaggio: string) => void
  sbloccaInterfaccia: () => void

  // file di progetto
  /** Sostituisce il progetto; poi si va nell'ufficio, o nella schermata indicata. */
  sostituisciProgetto: (p: Progetto, dopo?: Schermata) => void
  segnaSalvatoSuFile: () => void
}

type Set = (fn: (s: StatoStudio) => Partial<StatoStudio>) => void

/** Applica una modifica al progetto. */
function conProgetto(set: Set, fn: (p: Progetto) => Partial<Progetto>) {
  set((s) => ({ progetto: { ...s.progetto, ...fn(s.progetto) } }))
}

/** Le modifiche strutturali all'indice richiedono una nuova approvazione. */
function modificaIndice(set: Set, fn: (capitoli: Capitolo[]) => Capitolo[]) {
  conProgetto(set, (p) => ({ capitoli: fn(p.capitoli), indiceApprovato: false, indiceApprovatoIl: null }))
}

function mappaCapitolo(capitoli: Capitolo[], id: string, fn: (c: Capitolo) => Capitolo): Capitolo[] {
  return capitoli.map((c) => (c.id === id ? fn(c) : c))
}

function mappaSezione(c: Capitolo, id: string, fn: (s: Sezione) => Sezione): Capitolo {
  return { ...c, sezioni: c.sezioni.map((s) => (s.id === id ? fn(s) : s)) }
}

function sposta<T extends { id: string }>(elenco: T[], id: string, delta: -1 | 1): T[] {
  const i = elenco.findIndex((x) => x.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= elenco.length) return elenco
  const copia = [...elenco]
  ;[copia[i], copia[j]] = [copia[j], copia[i]]
  return copia
}

function aggiungiVersione(s: Sezione, nota: string, autore: Autore): Sezione {
  const versione = { id: nuovoId('v'), data: adesso(), testo: s.testo, nota, autore }
  return { ...s, versioni: [...s.versioni, versione].slice(-MAX_VERSIONI) }
}

export const useStudio = create<StatoStudio>()(
  persist(
    (set) => ({
      progetto: progettoIniziale(),
      preferenze: preferenzeIniziali(),
      apiKey: leggiChiave(),

      schermata: 'ufficio',
      capitoloAperto: null,
      sezioneAperta: null,
      cartaAperta: false,
      fonteAperta: null,
      domandaProposta: '',
      concentrazione: false,
      agenteUfficio: 'lettore',
      parlaFino: 0,
      inquadratura: 0,
      nuvoletta: null,
      agenti: agentiVuoti(),
      log: [],
      corpusSincronizzato: false,

      setApiKey: (v) => {
        scriviChiave(v.trim())
        set(() => ({ apiKey: v.trim() }))
      },
      setModello: (slot, id) =>
        set((s) => ({ preferenze: { ...s.preferenze, modelli: { ...s.preferenze.modelli, [slot]: id } } })),
      setPreferenze: (p) => set((s) => ({ preferenze: { ...s.preferenze, ...p } })),

      vai: (schermata) => set(() => ({ schermata, nuvoletta: null })),
      apriSezione: (capitoloAperto, sezioneAperta) =>
        set(() => ({ capitoloAperto, sezioneAperta, schermata: 'scrittura', nuvoletta: null })),
      setCarta: (cartaAperta) => set(() => ({ cartaAperta })),
      apriFonte: (fonteAperta) => set(() => ({ fonteAperta, ...(fonteAperta ? { schermata: 'biblioteca' as const } : {}) })),
      proponiRicerca: (domandaProposta) => set(() => ({ domandaProposta, schermata: 'ricerca' })),
      setConcentrazione: (concentrazione) => set(() => ({ concentrazione })),
      scegliAgente: (agenteUfficio) => set((s) => ({ agenteUfficio, schermata: 'ufficio', inquadratura: s.inquadratura + 1 })),
      faiParlare: (ms) => set(() => ({ parlaFino: Date.now() + ms })),
      aggiungiBattuta: (k, b) => {
        const id = nuovoId('battuta')
        // Si tengono le ultime 120 battute per persona: bastano per il filo del discorso.
        conProgetto(set, (p) => ({ conversazioni: { ...p.conversazioni, [k]: [...(p.conversazioni[k] ?? []), { ...b, id, data: adesso() }].slice(-120) } }))
        return id
      },
      aggiornaBattuta: (k, id, testo) =>
        conProgetto(set, (p) => ({ conversazioni: { ...p.conversazioni, [k]: (p.conversazioni[k] ?? []).map((b) => (b.id === id ? { ...b, testo } : b)) } })),
      svuotaConversazione: (k) => conProgetto(set, (p) => ({ conversazioni: { ...p.conversazioni, [k]: [] } })),
      apriNuvoletta: (nuvoletta) => set(() => ({ nuvoletta })),

      setTitolo: (titolo) => conProgetto(set, () => ({ titolo })),
      setDomanda: (domanda) => conProgetto(set, () => ({ domanda })),
      setCaso: (c) => conProgetto(set, (p) => ({ casoAziendale: { ...p.casoAziendale, ...c } })),
      setStileCitazione: (stileCitazione) => conProgetto(set, () => ({ stileCitazione })),

      aggiungiCapitolo: (titolo) => modificaIndice(set, (cc) => [...cc, nuovoCapitolo(titolo)]),
      rinominaCapitolo: (id, titolo) => modificaIndice(set, (cc) => mappaCapitolo(cc, id, (c) => ({ ...c, titolo }))),
      rimuoviCapitolo: (id) => modificaIndice(set, (cc) => cc.filter((c) => c.id !== id)),
      spostaCapitolo: (id, delta) => modificaIndice(set, (cc) => sposta(cc, id, delta)),
      setStatoCapitolo: (id, stato) =>
        conProgetto(set, (p) => ({ capitoli: mappaCapitolo(p.capitoli, id, (c) => ({ ...c, stato })) })),
      aggiungiSezione: (capitoloId, titolo) =>
        modificaIndice(set, (cc) =>
          mappaCapitolo(cc, capitoloId, (c) => ({ ...c, sezioni: [...c.sezioni, nuovaSezione(titolo)] })),
        ),
      aggiornaSezione: (capitoloId, sezioneId, patch) =>
        modificaIndice(set, (cc) =>
          mappaCapitolo(cc, capitoloId, (c) => mappaSezione(c, sezioneId, (s) => ({ ...s, ...patch }))),
        ),
      rimuoviSezione: (capitoloId, sezioneId) =>
        modificaIndice(set, (cc) =>
          mappaCapitolo(cc, capitoloId, (c) => ({ ...c, sezioni: c.sezioni.filter((s) => s.id !== sezioneId) })),
        ),
      spostaSezione: (capitoloId, sezioneId, delta) =>
        modificaIndice(set, (cc) =>
          mappaCapitolo(cc, capitoloId, (c) => ({ ...c, sezioni: sposta(c.sezioni, sezioneId, delta) })),
        ),
      approvaIndice: () => conProgetto(set, () => ({ indiceApprovato: true, indiceApprovatoIl: adesso() })),

      setTestoSezione: (capitoloId, sezioneId, testo) =>
        conProgetto(set, (p) => ({
          capitoli: mappaCapitolo(p.capitoli, capitoloId, (c) => {
            const aggiornato = mappaSezione(c, sezioneId, (s) => ({ ...s, testo, aggiornataIl: adesso() }))
            // Il primo testo scritto porta il capitolo da "da fare" a "bozza".
            const stato = c.stato === 'da_fare' && testo.trim() ? 'bozza' : c.stato
            return { ...aggiornato, stato }
          }),
        })),
      salvaVersione: (capitoloId, sezioneId, nota, autore = 'studente') => {
        let salvata = false
        conProgetto(set, (p) => ({
          capitoli: mappaCapitolo(p.capitoli, capitoloId, (c) =>
            mappaSezione(c, sezioneId, (s) => {
              const ultima = s.versioni[s.versioni.length - 1]
              // Niente doppioni: se il testo non è cambiato non serve una nuova versione.
              if (ultima && ultima.testo === s.testo) return s
              salvata = true
              return aggiungiVersione(s, nota, autore)
            }),
          ),
        }))
        return salvata
      },
      ripristinaVersione: (capitoloId, sezioneId, versioneId) =>
        conProgetto(set, (p) => ({
          capitoli: mappaCapitolo(p.capitoli, capitoloId, (c) =>
            mappaSezione(c, sezioneId, (s) => {
              const v = s.versioni.find((x) => x.id === versioneId)
              if (!v) return s
              // Prima di tornare indietro si conserva il testo corrente: il ripristino è reversibile.
              const ultima = s.versioni[s.versioni.length - 1]
              const conservata =
                ultima && ultima.testo === s.testo ? s : aggiungiVersione(s, 'Prima del ripristino', 'sistema')
              return { ...conservata, testo: v.testo, aggiornataIl: adesso() }
            }),
          ),
        })),

      setFontiSezione: (capitoloId, sezioneId, ids) =>
        conProgetto(set, (p) => ({
          capitoli: mappaCapitolo(p.capitoli, capitoloId, (c) =>
            mappaSezione(c, sezioneId, (s) => ({ ...s, fontiApprovate: ids, fontiConfermate: false })),
          ),
        })),
      confermaFontiSezione: (capitoloId, sezioneId, si) =>
        conProgetto(set, (p) => ({
          capitoli: mappaCapitolo(p.capitoli, capitoloId, (c) =>
            mappaSezione(c, sezioneId, (s) => ({ ...s, fontiConfermate: si })),
          ),
        })),
      setScaletta: (capitoloId, sezioneId, punti) =>
        conProgetto(set, (p) => ({
          capitoli: mappaCapitolo(p.capitoli, capitoloId, (c) =>
            mappaSezione(c, sezioneId, (s) => ({ ...s, scaletta: punti, scalettaApprovata: false })),
          ),
        })),
      approvaScaletta: (capitoloId, sezioneId, si) =>
        conProgetto(set, (p) => ({
          capitoli: mappaCapitolo(p.capitoli, capitoloId, (c) =>
            mappaSezione(c, sezioneId, (s) => ({ ...s, scalettaApprovata: si })),
          ),
        })),
      applicaTesto: (capitoloId, sezioneId, testo, citazioni, nota, autore) =>
        conProgetto(set, (p) => ({
          capitoli: mappaCapitolo(p.capitoli, capitoloId, (c) => {
            const aggiornato = mappaSezione(c, sezioneId, (s) => {
              const ultima = s.versioni[s.versioni.length - 1]
              const prima = s.testo.trim() && (!ultima || ultima.testo !== s.testo) ? aggiungiVersione(s, `Prima di: ${nota}`, 'studente') : s
              return aggiungiVersione({ ...prima, testo, citazioni, aggiornataIl: adesso() }, nota, autore)
            })
            return { ...aggiornato, stato: c.stato === 'da_fare' && testo.trim() ? 'bozza' : c.stato }
          }),
        })),
      setCitazioni: (capitoloId, sezioneId, citazioni) =>
        conProgetto(set, (p) => ({
          capitoli: mappaCapitolo(p.capitoli, capitoloId, (c) => mappaSezione(c, sezioneId, (s) => ({ ...s, citazioni }))),
        })),

      aggiungiOsservazione: (testo, capitoloId) => {
        const id = nuovoId('oss')
        conProgetto(set, (p) => ({
          osservazioni: [{ id, testo, capitoloId, data: adesso(), stato: 'aperta', proposte: [], lettura: '' }, ...p.osservazioni],
        }))
        return id
      },
      aggiornaOsservazione: (id, patch) =>
        conProgetto(set, (p) => ({ osservazioni: p.osservazioni.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      rimuoviOsservazione: (id) => conProgetto(set, (p) => ({ osservazioni: p.osservazioni.filter((o) => o.id !== id) })),
      aggiornaPropostaRevisione: (oid, pid, patch) =>
        conProgetto(set, (p) => ({
          osservazioni: p.osservazioni.map((o) =>
            o.id === oid ? { ...o, proposte: o.proposte.map((x) => (x.id === pid ? { ...x, ...patch } : x)) } : o,
          ),
        })),
      setControllo: (controllo) => conProgetto(set, () => ({ controllo })),
      aggiungiMessaggio: (m) => conProgetto(set, (p) => ({ chat: [...p.chat, m].slice(-200) })),
      aggiornaMessaggio: (id, testo) =>
        conProgetto(set, (p) => ({ chat: p.chat.map((m) => (m.id === id ? { ...m, testo } : m)) })),
      svuotaChat: () => conProgetto(set, () => ({ chat: [] })),
      segnaFontiCitate: () => {
        let segnate = 0
        conProgetto(set, (p) => {
          const perFonte = new Map<number, globalThis.Set<string>>()
          for (const c of p.capitoli) {
            for (const s of c.sezioni) {
              for (const m of s.testo.matchAll(/\[F(\d+)\]/g)) {
                const n = Number(m[1])
                if (!perFonte.has(n)) perFonte.set(n, new Set())
                perFonte.get(n)!.add(c.id)
              }
            }
          }
          return {
            fonti: p.fonti.map((f) => {
              const capitoli = perFonte.get(f.numero)
              if (!capitoli) return f
              segnate += 1
              return { ...f, stato: 'usata' as const, usataIn: [...new Set([...f.usataIn, ...capitoli])] }
            }),
          }
        })
        return segnate
      },

      aggiungiVoce: (v) => conProgetto(set, (p) => ({ glossario: [...p.glossario, { origine: 'studente', ...v, id: nuovoId('gl') }] })),
      aggiornaVoce: (id, patch) =>
        conProgetto(set, (p) => ({ glossario: p.glossario.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
      unisciLessico: (voci) => {
        let nuove = 0
        let aggiornate = 0
        conProgetto(set, (p) => {
          const glossario = [...p.glossario]
          for (const v of voci) {
            const i = glossario.findIndex((g) => g.termine.trim().toLowerCase() === v.termine.trim().toLowerCase())
            if (i < 0) {
              glossario.push({ ...v, id: nuovoId('gl') })
              nuove += 1
              continue
            }
            const g = glossario[i]
            glossario[i] = {
              ...g,
              definizione: g.origine === 'studente' ? g.definizione : v.definizione,
              varianti: [...new Set([...g.varianti, ...v.varianti])],
              origine: g.origine === 'studente' ? 'studente' : 'corso',
              occorrenze: v.occorrenze,
              collocazione: v.collocazione,
            }
            aggiornate += 1
          }
          return { glossario }
        })
        return { nuove, aggiornate }
      },
      rimuoviVoce: (id) => conProgetto(set, (p) => ({ glossario: p.glossario.filter((v) => v.id !== id) })),

      registraRicerca: (r, candidati) =>
        conProgetto(set, (p) => ({
          ricerche: [r, ...p.ricerche].slice(0, 50),
          inAttesa: [...p.inAttesa, ...candidati],
        })),
      decidiCandidato: (id, approva) =>
        conProgetto(set, (p) => {
          const c = p.inAttesa.find((x) => x.id === id)
          const inAttesa = p.inAttesa.filter((x) => x.id !== id)
          if (!c || !approva || giàInBiblioteca(p.fonti, c.fonte)) return { inAttesa }
          return { inAttesa, fonti: [...p.fonti, { ...c.fonte, numero: prossimoNumero(p.fonti), aggiuntaIl: adesso() }] }
        }),
      aggiornaCandidato: (id, patch) =>
        conProgetto(set, (p) => ({
          inAttesa: p.inAttesa.map((c) => (c.id === id ? { ...c, fonte: { ...c.fonte, ...patch } } : c)),
        })),
      aggiungiFonte: (f) => conProgetto(set, (p) => ({ fonti: [...p.fonti, { ...f, numero: prossimoNumero(p.fonti) }] })),
      aggiornaFonte: (id, patch) =>
        conProgetto(set, (p) => ({ fonti: p.fonti.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      rimuoviFonte: (id) => conProgetto(set, (p) => ({ fonti: p.fonti.filter((f) => f.id !== id) })),

      aggiungiCourseFile: (f) => conProgetto(set, (p) => ({ courseFiles: [...p.courseFiles, f] })),
      aggiornaCourseFile: (id, patch) =>
        conProgetto(set, (p) => ({ courseFiles: p.courseFiles.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      rimuoviCourseFile: (id) => conProgetto(set, (p) => ({ courseFiles: p.courseFiles.filter((f) => f.id !== id) })),
      setQuadro: (quadro) => conProgetto(set, () => ({ quadro })),
      setCorpusSincronizzato: (corpusSincronizzato) => set(() => ({ corpusSincronizzato })),

      registraUso: (v) =>
        conProgetto(set, (p) => ({
          usi: [...p.usi, { ...v, id: nuovoId('uso'), data: adesso() }].slice(-MAX_USI),
        })),
      azzeraUsi: () => conProgetto(set, () => ({ usi: [] })),
      setBudget: (budgetMensile) => conProgetto(set, () => ({ budgetMensile })),
      setObiettivo: (o) => conProgetto(set, (p) => ({ obiettivo: { ...p.obiettivo, ...o } })),

      patchAgente: (k, patch) => set((s) => ({ agenti: { ...s.agenti, [k]: { ...s.agenti[k], ...patch } } })),
      aggiungiLog: (kind, agente, messaggio) =>
        set((s) => ({
          log: [
            ...s.log,
            { id: nuovoId('log'), ora: new Date().toLocaleTimeString('it-IT'), kind, agente, messaggio },
          ].slice(-MAX_LOG),
        })),
      sbloccaInterfaccia: () =>
        set((s) => {
          const agenti = { ...s.agenti }
          for (const k of AGENT_KEYS) {
            if (agenti[k].status === 'lavoro') {
              agenti[k] = { ...agenti[k], status: 'errore', etichetta: 'interrotto', errore: 'Lavoro interrotto da un errore.' }
            }
          }
          return { agenti }
        }),

      sostituisciProgetto: (progetto, dopo = 'ufficio') =>
        set(() => ({ progetto, capitoloAperto: null, sezioneAperta: null, schermata: dopo, agenti: agentiVuoti() })),
      segnaSalvatoSuFile: () => conProgetto(set, () => ({ salvatoSuFileIl: adesso() })),
    }),
    {
      name: 'studio-tesi-olio-v1',
      version: 1,
      storage: createJSONStorage(() => archivioIdb),
      partialize: (s) => ({ progetto: s.progetto, preferenze: s.preferenze }),
      merge: (salvato, attuale) => {
        const dati = (salvato ?? {}) as Partial<StatoStudio>
        return {
          ...attuale,
          progetto: dati.progetto ? normalizzaProgetto({ ...attuale.progetto, ...dati.progetto }) : attuale.progetto,
          preferenze: dati.preferenze
            ? {
                ...attuale.preferenze,
                ...dati.preferenze,
                modelli: { ...attuale.preferenze.modelli, ...dati.preferenze.modelli },
              }
            : attuale.preferenze,
        }
      },
    },
  ),
)

// Senza chiave API gli agenti lavorano gratis tramite Claude.ai.
impostaModalitaGratuita(() => !useStudio.getState().apiKey.trim())

// Prima di ogni chiamata: se il budget del mese è esaurito, la chiamata non parte.
impostaControlloBudget(() => {
  const { budgetMensile, usi } = useStudio.getState().progetto
  if (budgetMensile === null) return null
  const speso = costoDelMese(usi)
  return speso >= budgetMensile
    ? `Hai raggiunto il budget di questo mese (${speso.toFixed(2).replace('.', ',')} $ su ${budgetMensile.toFixed(2).replace('.', ',')} $). Per continuare alza il budget nelle Impostazioni.`
    : null
})

// Ogni risposta dell'API registra i suoi consumi qui.
impostaRegistratoreUso((chi, azione, modello, uso) => {
  useStudio.getState().registraUso({
    chi,
    azione,
    modello,
    input: uso.input,
    output: uso.output,
    scritturaCache: uso.scritturaCache5m + uso.scritturaCache1h,
    letturaCache: uso.letturaCache,
    ricerche: uso.ricerche,
    letture: uso.letture,
    costo: costoUso(modello, uso),
    risparmio: risparmioCache(modello, uso),
  })
})

// ---------------------------------------------------------------------------
// Derivati (funzioni pure: nei componenti si usano dentro useMemo)
// ---------------------------------------------------------------------------

export function meseCorrente(): string {
  return new Date().toISOString().slice(0, 7)
}

export function costoDelMese(usi: VoceUso[], mese = meseCorrente()): number {
  return usi.filter((u) => u.data.startsWith(mese)).reduce((s, u) => s + u.costo, 0)
}

export function quadroObsoleto(p: Progetto): boolean {
  return p.quadro !== null && p.quadro.firmaCorso !== firmaCorso(p)
}

export function contaParoleTesto(testo: string): number {
  return testo.replace(/\[[A-Z]\d+\]/g, '').split(/\s+/).filter(Boolean).length
}

export function paroleCapitolo(c: Capitolo): number {
  return c.sezioni.reduce((n, s) => n + contaParoleTesto(s.testo), 0)
}

/** Una fonte è già in biblioteca se ha lo stesso DOI, lo stesso URL o lo stesso titolo. */
export function giàInBiblioteca(fonti: Fonte[], f: Pick<Fonte, 'doi' | 'url' | 'titolo'>): boolean {
  const titolo = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const url = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#]+$/, '')
  return fonti.some(
    (x) =>
      (f.doi && x.doi === f.doi) || (f.url && x.url && url(x.url) === url(f.url)) || (f.titolo && titolo(x.titolo) === titolo(f.titolo)),
  )
}

export function estrazioneInCorso(p: Progetto): boolean {
  return p.courseFiles.some((f) => f.status === 'lettura' || f.status === 'estrazione')
}
