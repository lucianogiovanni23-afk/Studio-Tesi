import { create } from 'zustand'
import { esportaCorpus, importaCorpus } from '../agents/corpus'
import { normalizzaProgetto, progettoIniziale } from '../domain/progettoIniziale'
import { estrazioneInCorso, useStudio } from '../store'
import type { Passaggio, Progetto } from '../types'
import { creaCopia } from './copie'
import { controllaSegreti, fileCorsoControllati, FORMATO, VERSIONE } from './fileProgetto'

/**
 * Sincronizzazione fra dispositivi tramite un repository GitHub privato dello
 * studente: niente server, il browser parla direttamente con l'API di GitHub.
 * Nel repository ci sono due file: il progetto e il testo del corso (che
 * cambia di rado e si invia solo quando cambia). Ogni invio è un commit, quindi
 * su GitHub resta anche la storia delle versioni.
 *
 * Il token, come la chiave API, resta solo in localStorage di questo
 * dispositivo e non entra mai nei dati del progetto.
 */

const CHIAVE_TOKEN = 'studio-tesi.github-token'
const CHIAVE_COLLEGAMENTO = 'studio-tesi.sincronizzazione'
const FILE_PROGETTO = 'studio-tesi/progetto.json'
const FILE_CORPUS = 'studio-tesi/corpus.json'
/** Dopo l'ultima modifica si aspetta un po', per non fare un commit a ogni lettera. */
const ATTESA_MS = 15_000
/** Mentre l'app è aperta si controlla ogni tanto se l'altro dispositivo ha inviato qualcosa. */
const CONTROLLO_MS = 120_000

interface Collegamento {
  repo: string
  shaProgetto?: string
  shaCorpus?: string
  improntaProgetto?: string
  improntaCorpus?: string
  ultima?: string
}

interface ProgettoRemoto {
  formato: string
  versione: number
  salvatoIl: string
  salvatoDa: string
  progetto: Progetto
}

export type StatoSync = 'spenta' | 'ok' | 'in_corso' | 'attesa' | 'offline' | 'errore' | 'conflitto'

interface SyncUI {
  stato: StatoSync
  messaggio: string
  repo: string | null
  ultima: string | null
  /** Le modifiche dell'altro dispositivo, quando entrambi hanno cambiato qualcosa. */
  conflitto: { da: string; il: string } | null
}

function leggi(chiave: string): string | null {
  try {
    return localStorage.getItem(chiave)
  } catch {
    return null
  }
}

function scrivi(chiave: string, valore: string | null) {
  try {
    if (valore === null) localStorage.removeItem(chiave)
    else localStorage.setItem(chiave, valore)
  } catch {
    // Storage non disponibile: la sincronizzazione vale solo per questa sessione.
  }
}

function leggiCollegamento(): Collegamento | null {
  try {
    const c = JSON.parse(leggi(CHIAVE_COLLEGAMENTO) ?? 'null') as Collegamento | null
    return c && typeof c.repo === 'string' ? c : null
  } catch {
    return null
  }
}

function salvaCollegamento(c: Collegamento | null) {
  scrivi(CHIAVE_COLLEGAMENTO, c ? JSON.stringify(c) : null)
}

export const useSync = create<SyncUI>(() => {
  const c = leggiCollegamento()
  return { stato: c ? 'ok' : 'spenta', messaggio: '', repo: c?.repo ?? null, ultima: c?.ultima ?? null, conflitto: null }
})

const aggiorna = (p: Partial<SyncUI>) => useSync.setState(p)

export function nomeDispositivo(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(ua)) return 'telefono Android'
  return 'computer'
}

/** "dall'iPhone", "dal computer"; "dell'iPad", "del computer". */
export function preposizione(pre: 'da' | 'di', nome: string): string {
  const base = pre === 'da' ? 'dal' : 'del'
  return /^[aeiouAEIOU]/.test(nome) ? `${base.slice(0, 3)}l'${nome}` : `${base} ${nome}`
}

/** Impronta veloce (cyrb53) per sapere se qualcosa è cambiato dall'ultima sincronizzazione. */
function impronta(testo: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < testo.length; i++) {
    const c = testo.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${testo.length}-${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`
}

const improntaProgetto = (p: Progetto) => impronta(JSON.stringify(p))
const improntaCorpus = (c: Record<string, Passaggio[]>) => impronta(JSON.stringify(c))

/** Un progetto appena creato, senza niente di proprio: si può sostituire senza chiedere. */
function progettoVuoto(p: Progetto): boolean {
  return (
    p.fonti.length === 0 &&
    p.courseFiles.length === 0 &&
    p.chat.length === 0 &&
    p.capitoli.every((c) => c.sezioni.every((s) => !s.testo.trim()))
  )
}

// --- API di GitHub -----------------------------------------------------------

class ErroreSync extends Error {
  tipo: 'offline' | 'conflitto' | 'errore'
  constructor(tipo: 'offline' | 'conflitto' | 'errore', messaggio: string) {
    super(messaggio)
    this.tipo = tipo
  }
}

async function gh(token: string, percorso: string, init: { method?: string; body?: unknown; accept?: string } = {}): Promise<Response> {
  try {
    return await fetch(`https://api.github.com${percorso}`, {
      method: init.method ?? 'GET',
      // Senza questo il browser può riusare per un minuto una risposta vecchia.
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: init.accept ?? 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ErroreSync('offline', 'Non raggiungo GitHub: riprovo appena torna la connessione.')
  }
}

async function errore(r: Response, cosa: string): Promise<ErroreSync> {
  if (r.status === 401) return new ErroreSync('errore', 'GitHub non accetta il token: forse è scaduto. Creane uno nuovo e ricollega questo dispositivo.')
  if (r.status === 403 || r.status === 429) {
    const testo = await r.text().catch(() => '')
    if (/rate limit/i.test(testo)) return new ErroreSync('offline', 'GitHub ha limitato le richieste per qualche minuto: riprovo più tardi.')
    return new ErroreSync('errore', 'Il token non ha il permesso di scrivere nel repository: serve "Contents" in lettura e scrittura.')
  }
  if (r.status === 404) return new ErroreSync('errore', 'Repository non trovato: controlla il nome e che il token abbia accesso proprio a quel repository.')
  if (r.status === 413) return new ErroreSync('errore', 'Il progetto è troppo grande per GitHub.')
  return new ErroreSync('errore', `GitHub ha risposto con un errore (${r.status}) ${cosa}.`)
}

/** Lo sha del file nel repository, o null se non c'è ancora. */
async function shaRemoto(token: string, repo: string, file: string): Promise<string | null> {
  const r = await gh(token, `/repos/${repo}/contents/${file}`)
  if (r.status === 404) return null
  if (!r.ok) throw await errore(r, 'leggendo i dati')
  return ((await r.json()) as { sha: string }).sha
}

/** Il contenuto esatto di quella versione (fino a 100 MB). */
async function leggiVersione(token: string, repo: string, sha: string): Promise<string> {
  const r = await gh(token, `/repos/${repo}/git/blobs/${sha}`, { accept: 'application/vnd.github.raw+json' })
  if (!r.ok) throw await errore(r, 'leggendo i dati')
  return r.text()
}

function base64Utf8(testo: string): string {
  const byte = new TextEncoder().encode(testo)
  let binario = ''
  for (let i = 0; i < byte.length; i += 0x8000) binario += String.fromCharCode(...byte.subarray(i, i + 0x8000))
  return btoa(binario)
}

/** Scrive il file; se nel frattempo l'altro dispositivo l'ha cambiato, GitHub rifiuta e lo si segnala. */
async function scriviFile(token: string, repo: string, file: string, contenuto: string, sha: string | null): Promise<string> {
  const r = await gh(token, `/repos/${repo}/contents/${file}`, {
    method: 'PUT',
    body: { message: `Aggiornamento da ${nomeDispositivo()}`, content: base64Utf8(contenuto), ...(sha ? { sha } : {}) },
  })
  if (r.status === 409 || (r.status === 422 && !sha)) throw new ErroreSync('conflitto', 'Il file è cambiato su GitHub nel frattempo.')
  if (!r.ok) throw await errore(r, 'salvando i dati')
  return ((await r.json()) as { content: { sha: string } }).content.sha
}

// --- Collegamento ------------------------------------------------------------

/** Accetta "nome/repository" o l'indirizzo completo copiato da GitHub. */
export function nomeRepository(testo: string): string | null {
  const t = testo
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  return /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(t) ? t : null
}

export async function collega(repoScritto: string, tokenScritto: string): Promise<void> {
  const repo = nomeRepository(repoScritto)
  const token = tokenScritto.trim()
  if (!repo) throw new Error('Scrivi il repository come nome-utente/nome-repository.')
  if (!token) throw new Error('Incolla il token di GitHub.')
  const r = await gh(token, `/repos/${repo}`)
  if (!r.ok) throw await errore(r, 'controllando il repository')
  const info = (await r.json()) as { private?: boolean; permissions?: { push?: boolean } }
  if (info.private !== true) {
    throw new Error('Il repository è pubblico: chiunque potrebbe leggere la tesi. Rendilo privato su GitHub oppure creane uno privato.')
  }
  if (info.permissions && info.permissions.push === false) {
    throw new Error('Il token può leggere ma non scrivere nel repository: serve "Contents" in lettura e scrittura.')
  }
  scrivi(CHIAVE_TOKEN, token)
  salvaCollegamento({ repo })
  aggiorna({ stato: 'ok', messaggio: '', repo, ultima: null, conflitto: null })
  await sincronizza()
}

/** Scollega questo dispositivo: i dati restano su GitHub e in questo browser. */
export function scollega() {
  scrivi(CHIAVE_TOKEN, null)
  salvaCollegamento(null)
  aggiorna({ stato: 'spenta', messaggio: '', repo: null, ultima: null, conflitto: null })
}

// --- Sincronizzazione ----------------------------------------------------------

type Scelta = 'invia' | 'ricevi'

/** Applica un progetto ricevuto senza spostare lo studente dalla schermata in cui si trova. */
function applicaProgetto(progetto: Progetto) {
  useStudio.setState((s) => {
    const capitolo = progetto.capitoli.find((c) => c.id === s.capitoloAperto)
    const sezioneEsiste = capitolo?.sezioni.some((x) => x.id === s.sezioneAperta)
    return {
      progetto,
      capitoloAperto: capitolo ? s.capitoloAperto : null,
      sezioneAperta: sezioneEsiste ? s.sezioneAperta : null,
    }
  })
}

async function giro(scelta?: Scelta): Promise<void> {
  const col = leggiCollegamento()
  const token = leggi(CHIAVE_TOKEN)
  if (!col || !token) return
  const s = useStudio.getState()
  if (!useStudio.persist.hasHydrated() || !s.corpusSincronizzato) return
  // Il conflitto si risolve solo con una scelta dello studente.
  if (!scelta && useSync.getState().stato === 'conflitto') return
  if (estrazioneInCorso(s.progetto)) {
    aggiorna({ stato: 'attesa', messaggio: 'Aspetto che finisca la lettura dei file del corso.' })
    return
  }
  aggiorna({ stato: 'in_corso', messaggio: '' })

  const locale = s.progetto
  const improntaLocale = improntaProgetto(locale)
  const shaP = await shaRemoto(token, col.repo, FILE_PROGETTO)
  const localeCambiato = improntaLocale !== col.improntaProgetto
  const remotoCambiato = shaP !== null && shaP !== col.shaProgetto

  let azione: Scelta | 'niente' | 'conflitto'
  if (scelta) azione = scelta
  else if (shaP === null) azione = 'invia'
  else if (!col.shaProgetto) azione = progettoVuoto(locale) ? 'ricevi' : 'conflitto'
  else if (remotoCambiato && localeCambiato) azione = 'conflitto'
  else if (remotoCambiato) azione = 'ricevi'
  else if (localeCambiato) azione = 'invia'
  else azione = 'niente'

  if (azione === 'niente') {
    aggiorna({ stato: 'ok', ultima: col.ultima ?? null })
    return
  }

  if (azione === 'conflitto' || azione === 'ricevi') {
    if (!shaP) throw new ErroreSync('errore', 'Su GitHub non c\'è ancora nessun progetto da ricevere.')
    const remoto = JSON.parse(await leggiVersione(token, col.repo, shaP)) as ProgettoRemoto
    if (remoto.formato !== FORMATO || !remoto.progetto || !Array.isArray(remoto.progetto.capitoli)) {
      throw new ErroreSync('errore', 'Il file su GitHub non è un progetto di Studio tesi.')
    }
    if (remoto.versione > VERSIONE) throw new ErroreSync('errore', "I dati su GitHub vengono da una versione più recente dell'app: aggiorna la pagina.")

    if (azione === 'conflitto') {
      aggiorna({ stato: 'conflitto', messaggio: '', conflitto: { da: remoto.salvatoDa || 'altro dispositivo', il: remoto.salvatoIl } })
      return
    }

    // Il corpus si scarica solo se è cambiato.
    const shaC = await shaRemoto(token, col.repo, FILE_CORPUS)
    let corpus = esportaCorpus()
    const corpusNuovo = shaC !== null && shaC !== col.shaCorpus
    if (corpusNuovo) corpus = (JSON.parse(await leggiVersione(token, col.repo, shaC)) as { corpus: Record<string, Passaggio[]> }).corpus ?? {}

    // Se lo studente ha scritto qualcosa mentre si scaricava, non si sovrascrive: al prossimo giro si decide.
    if (!scelta && improntaProgetto(useStudio.getState().progetto) !== improntaLocale) {
      ancora = true
      return
    }
    // Lo stato attuale resta fra le copie di sicurezza.
    await creaCopia('Prima di ricevere dall\'altro dispositivo').catch(() => false)
    if (corpusNuovo) await importaCorpus(corpus)
    const base = normalizzaProgetto({ ...progettoIniziale(), ...remoto.progetto } as Progetto)
    const progetto = { ...base, courseFiles: fileCorsoControllati(base, corpus) }
    applicaProgetto(progetto)
    const ultima = new Date().toISOString()
    salvaCollegamento({
      ...col,
      shaProgetto: shaP,
      shaCorpus: shaC ?? col.shaCorpus,
      improntaProgetto: improntaProgetto(progetto),
      improntaCorpus: improntaCorpus(corpus),
      ultima,
    })
    aggiorna({ stato: 'ok', messaggio: `Ricevute le modifiche ${preposizione('da', remoto.salvatoDa || 'altro dispositivo')}.`, ultima, conflitto: null })
    return
  }

  // Invio: prima il testo del corso (se è cambiato), poi il progetto che vi rimanda.
  const corpus = esportaCorpus()
  const impC = improntaCorpus(corpus)
  let shaCorpus = col.shaCorpus
  if (impC !== col.improntaCorpus) {
    const json = JSON.stringify({ formato: 'studio-tesi-corpus', versione: 1, corpus })
    controllaSegreti(json)
    shaCorpus = await scriviFile(token, col.repo, FILE_CORPUS, json, await shaRemoto(token, col.repo, FILE_CORPUS))
  }
  const dati: ProgettoRemoto = { formato: FORMATO, versione: VERSIONE, salvatoIl: new Date().toISOString(), salvatoDa: nomeDispositivo(), progetto: locale }
  const json = JSON.stringify(dati)
  controllaSegreti(json)
  const nuovoSha = await scriviFile(token, col.repo, FILE_PROGETTO, json, shaP)
  salvaCollegamento({ ...col, shaProgetto: nuovoSha, shaCorpus, improntaProgetto: improntaLocale, improntaCorpus: impC, ultima: dati.salvatoIl })
  aggiorna({ stato: 'ok', messaggio: '', ultima: dati.salvatoIl, conflitto: null })
}

let inCorso: Promise<void> | null = null
let ancora = false

/** Un giro di sincronizzazione; con `scelta` risolve un conflitto nel verso indicato. */
export function sincronizza(scelta?: Scelta): Promise<void> {
  if (inCorso) {
    ancora = true
    return inCorso
  }
  inCorso = (async () => {
    try {
      await giro(scelta)
    } catch (err) {
      if (err instanceof ErroreSync && err.tipo === 'conflitto') {
        // L'altro dispositivo ha scritto proprio adesso: si rifà il giro con i dati nuovi.
        ancora = true
      } else if (err instanceof ErroreSync && err.tipo === 'offline') {
        aggiorna({ stato: 'offline', messaggio: err.message })
      } else {
        aggiorna({ stato: 'errore', messaggio: err instanceof Error ? err.message : 'Sincronizzazione non riuscita.' })
      }
    } finally {
      inCorso = null
    }
    if (ancora) {
      ancora = false
      await sincronizza()
    }
  })()
  return inCorso
}

let avviata = false
let timer: ReturnType<typeof setTimeout> | undefined

function programma() {
  clearTimeout(timer)
  timer = setTimeout(() => void sincronizza(), ATTESA_MS)
}

/** Sincronizza all'avvio, dopo ogni modifica, quando si torna sull'app e ogni due minuti. */
export function avviaSincronizzazione() {
  if (avviata) return
  avviata = true
  useStudio.subscribe((s, prima) => {
    if (s.progetto !== prima.progetto) programma()
    if (s.corpusSincronizzato && !prima.corpusSincronizzato) void sincronizza()
  })
  if (useStudio.getState().corpusSincronizzato) void sincronizza()
  // Uscendo dall'app (per esempio passando dall'iPhone al computer) si invia subito.
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer)
    void sincronizza()
  })
  window.addEventListener('online', () => void sincronizza())
  setInterval(() => {
    if (document.visibilityState === 'visible') void sincronizza()
  }, CONTROLLO_MS)
}
