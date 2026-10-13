import { create } from 'zustand'
import { esportaCorpus } from '../agents/corpus'
import { normalizzaProgetto, progettoIniziale } from '../domain/progettoIniziale'
import { giornoDi, giornoLeggibile } from '../domain/ritmo'
import { useStudio } from '../store'
import type { Progetto } from '../types'
import { creaCopia } from './copie'
import { controllaSegreti, fileCorsoControllati, FORMATO, VERSIONE } from './fileProgetto'
import {
  applicaProgetto,
  base64Utf8,
  datiCollegamento,
  dopoLaSincronizzazione,
  errore,
  ErroreSync,
  gh,
  leggiVersione,
  nomeDispositivo,
} from './sincronizzazione'

/**
 * Copia di sicurezza datata su GitHub: se questo dispositivo è collegato, una
 * volta al giorno (la prima volta che apri l'app quel giorno, o dopo 24 ore se
 * resta aperta) il progetto finisce in `studio-tesi/copie/AAAA-MM-GG.json`
 * nello stesso repository privato. Si tengono le ultime 30 copie.
 * Il testo del corso non è incluso: è già nel file del corso e cambia di rado.
 * Interruttore e ora dell'ultima copia sono di questo dispositivo (localStorage),
 * come il token, che non entra mai nei dati del progetto.
 */

const CARTELLA = 'studio-tesi/copie'
const MAX_COPIE = 30
const CHIAVE = 'studio-tesi.copie-github'
const CONTROLLO_MS = 60 * 60 * 1000
/** All'avvio si lascia finire prima la sincronizzazione. */
const ATTESA_AVVIO_MS = 20_000

export interface CopiaRemota {
  nome: string
  giorno: string
  percorso: string
  sha: string
  dimensione: number
}

interface Impostazione {
  attive: boolean
  /** Quando questo dispositivo ha fatto l'ultima copia (ISO). */
  ultima: string | null
  /** Giorno dell'ultima copia presente su GitHub (anche se l'ha fatta un altro dispositivo). */
  giorno: string | null
}

interface StatoCopie extends Impostazione {
  lavoro: boolean
  messaggio: string
  errore: boolean
  elenco: CopiaRemota[] | null
}

function leggiImpostazione(): Impostazione {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Partial<Impostazione> | null
    return { attive: v?.attive !== false, ultima: v?.ultima ?? null, giorno: v?.giorno ?? null }
  } catch {
    return { attive: true, ultima: null, giorno: null }
  }
}

function salvaImpostazione(p: Partial<Impostazione>) {
  const nuova = { ...leggiImpostazione(), ...p }
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(nuova))
  } catch {
    // Storage non disponibile: vale per questa sessione.
  }
  useCopieGitHub.setState(p)
}

export const useCopieGitHub = create<StatoCopie>(() => ({ ...leggiImpostazione(), lavoro: false, messaggio: '', errore: false, elenco: null }))

export function attivaCopieGitHub(attive: boolean) {
  salvaImpostazione({ attive })
  if (attive) void copiaDelGiorno()
}

/** Le copie presenti su GitHub, dalla più recente. */
export async function elencoCopieGitHub(): Promise<CopiaRemota[]> {
  const c = datiCollegamento()
  if (!c) return []
  const r = await gh(c.token, `/repos/${c.repo}/contents/${CARTELLA}`)
  if (r.status === 404) return []
  if (!r.ok) throw await errore(r, 'mentre leggevo le copie')
  const voci = (await r.json()) as { name: string; path: string; sha: string; size: number; type: string }[]
  const elenco = voci
    .filter((v) => v.type === 'file' && /^\d{4}-\d{2}-\d{2}\.json$/.test(v.name))
    .map((v) => ({ nome: v.name, giorno: v.name.slice(0, 10), percorso: v.path, sha: v.sha, dimensione: v.size }))
    .sort((a, b) => b.giorno.localeCompare(a.giorno))
  useCopieGitHub.setState({ elenco })
  return elenco
}

async function scrivi(token: string, repo: string, percorso: string, json: string, sha?: string) {
  const r = await gh(token, `/repos/${repo}/contents/${percorso}`, {
    method: 'PUT',
    body: { message: `Copia di sicurezza ${percorso.slice(-15, -5)} da ${nomeDispositivo()}`, content: base64Utf8(json), ...(sha ? { sha } : {}) },
  })
  if (r.status === 409) throw new ErroreSync('conflitto', 'GitHub era occupato, riprovo.')
  if (!r.ok) throw await errore(r, 'mentre salvavo la copia')
}

/** Toglie le copie oltre le ultime 30 (una richiesta per copia: di solito una sola). */
async function potatura(token: string, repo: string, elenco: CopiaRemota[]) {
  for (const vecchia of elenco.slice(MAX_COPIE)) {
    await dopoLaSincronizzazione()
    const r = await gh(token, `/repos/${repo}/contents/${vecchia.percorso}`, {
      method: 'DELETE',
      body: { message: `Tolgo la copia del ${vecchia.giorno}`, sha: vecchia.sha },
    })
    if (!r.ok && r.status !== 404) break
  }
}

/** Il progetto è pronto per la copia: caricato, allineato col corso e già sincronizzato almeno una volta. */
function pronto(): boolean {
  const s = useStudio.getState()
  const c = datiCollegamento()
  return Boolean(c?.giàSincronizzato) && useStudio.persist.hasHydrated() && s.corpusSincronizzato
}

/**
 * Fa la copia di oggi se manca. Con `forza` la rifà anche se c'è già (sostituisce quella di oggi).
 * Restituisce true se ha scritto una copia.
 */
export async function copiaDelGiorno(forza = false): Promise<boolean> {
  const c = datiCollegamento()
  const imp = useCopieGitHub.getState()
  if (!c || (!forza && !imp.attive) || imp.lavoro) return false
  const oggi = giornoDi()
  if (!forza && imp.giorno === oggi) return false
  if (!pronto()) return false

  useCopieGitHub.setState({ lavoro: true, messaggio: '', errore: false })
  try {
    for (let tentativo = 0; ; tentativo++) {
      try {
        await dopoLaSincronizzazione()
        const elenco = await elencoCopieGitHub()
        const diOggi = elenco.find((x) => x.giorno === oggi)
        if (diOggi && !forza) {
          // L'ha già fatta un altro dispositivo.
          salvaImpostazione({ giorno: oggi })
          return false
        }
        const progetto = useStudio.getState().progetto
        const json = JSON.stringify({ formato: FORMATO, versione: VERSIONE, salvatoIl: new Date().toISOString(), salvatoDa: nomeDispositivo(), progetto })
        controllaSegreti(json)
        await scrivi(c.token, c.repo, `${CARTELLA}/${oggi}.json`, json, diOggi?.sha)
        const adesso = new Date().toISOString()
        salvaImpostazione({ giorno: oggi, ultima: adesso })
        const aggiornato = await elencoCopieGitHub()
        await potatura(c.token, c.repo, aggiornato)
        if (aggiornato.length > MAX_COPIE) await elencoCopieGitHub()
        return true
      } catch (err) {
        if (err instanceof ErroreSync && err.tipo === 'conflitto' && tentativo < 2) {
          await new Promise((r) => setTimeout(r, 3000))
          continue
        }
        throw err
      }
    }
  } catch (err) {
    // In silenzio: lo si vede solo nelle Impostazioni.
    useCopieGitHub.setState({ errore: true, messaggio: err instanceof Error ? err.message : 'Non sono riuscito a fare la copia su GitHub.' })
    return false
  } finally {
    useCopieGitHub.setState({ lavoro: false })
  }
}

/** Torna a una copia di GitHub. Prima salva lo stato attuale fra le copie di questo browser. */
export async function ripristinaCopiaGitHub(copia: CopiaRemota): Promise<void> {
  const c = datiCollegamento()
  if (!c) throw new Error('Questo dispositivo non è più collegato a GitHub.')
  const dati = JSON.parse(await leggiVersione(c.token, c.repo, copia.sha)) as { formato?: string; versione?: number; progetto?: Progetto }
  if (dati.formato !== FORMATO || !dati.progetto || !Array.isArray(dati.progetto.capitoli)) {
    throw new Error('Questa copia non sembra un progetto di Studio tesi.')
  }
  if ((dati.versione ?? 0) > VERSIONE) throw new Error("La copia viene da una versione più nuova dell'app: ricarica la pagina.")
  await creaCopia(`Prima di tornare alla copia del ${giornoLeggibile(copia.giorno, true)}`, true)
  const base = normalizzaProgetto({ ...progettoIniziale(), ...dati.progetto } as Progetto)
  // Le lezioni restano quelle di adesso: la copia non contiene il loro testo.
  applicaProgetto({ ...base, courseFiles: fileCorsoControllati(base, esportaCorpus()) })
}

let avviate = false

/** Una copia al giorno: poco dopo l'avvio e poi ogni ora si controlla se quella di oggi c'è già. */
export function avviaCopieGitHub() {
  if (avviate) return
  avviate = true
  setTimeout(() => void copiaDelGiorno(), ATTESA_AVVIO_MS)
  setInterval(() => void copiaDelGiorno(), CONTROLLO_MS)
  window.addEventListener('online', () => void copiaDelGiorno())
}
