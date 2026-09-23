import { AGENT_KEYS, fontiApprovate, useStudioStore } from '../store'
import type {
  AgentKey,
  Consegna,
  Fonte,
  ImpiantoKey,
  RisultatoControllore,
  RisultatoLettore,
  RisultatoScrittore,
  RisultatoSelettore,
} from '../types'
import {
  ApiError,
  chiamataChatStream,
  chiamataStrutturata,
  chiamataStrutturataStream,
  creaClient,
  toApiError,
  type ChiamataBase,
} from './api'
import {
  IMPIANTI,
  SYSTEM_CHAT_BASE,
  SYSTEM_CONTROLLORE,
  SYSTEM_LETTORE,
  SYSTEM_RICERCATORE,
  SYSTEM_SCRITTORE,
  SYSTEM_SELETTORE,
  contestoChat,
  elencoFonti,
  messaggioControllore,
  messaggioLettore,
  messaggioRicercatore,
  messaggioScrittore,
  messaggioSelettore,
  riepilogoCaso,
  type ContestoProgetto,
} from './prompts'
import {
  SCHEMA_CONTROLLORE,
  SCHEMA_LETTORE,
  SCHEMA_SCRITTORE,
  SCHEMA_SELETTORE,
} from './schemas'
import {
  elencoNonVuoto,
  logAvviso,
  logFallimento,
  logInfo,
  logOk,
  logRiparazione,
  passaggiValidi,
  segnalaFineChiamata,
  segnalaInizioChiamata,
  segnalaSconfinamenti,
  sorveglia,
  testoSostanzioso,
  ticker,
} from './supervisor'
import { verificaFonti } from './verifyUrls'
import { eseguiRicerca } from './webSearch'

let tokenRun = 0
let controller: AbortController | null = null

const TIMEOUT_ARRIVO_MS = 12_000
const MAX_GIRI_RICERCA = 4

function scaduto(token: number): boolean {
  return token !== tokenRun
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function contesto(): ContestoProgetto {
  const s = useStudioStore.getState()
  return {
    argomento: s.argomento,
    capitolo: s.capitolo,
    courseFiles: s.courseFiles,
    caseFiles: s.caseFiles,
  }
}

function base(modello: string, maxTokens: number, signal: AbortSignal): Omit<ChiamataBase, 'system' | 'messages'> {
  return {
    client: creaClient(useStudioStore.getState().apiKey),
    model: modello,
    maxTokens,
    signal,
  }
}

function sistema(testo: string, suggerimento: string) {
  const blocchi = [{ type: 'text' as const, text: testo }]
  if (suggerimento) blocchi.push({ type: 'text' as const, text: suggerimento })
  return blocchi
}

/** Attende che il broker abbia finito di camminare fino alla postazione. */
function attendiArrivo(agente: AgentKey, token: number): Promise<void> {
  return new Promise((resolve) => {
    if (useStudioStore.getState().agenti[agente].arrived) {
      resolve()
      return
    }
    let timer: ReturnType<typeof setTimeout>
    const stop = useStudioStore.subscribe((s) => {
      if (s.agenti[agente].arrived || scaduto(token)) {
        clearTimeout(timer)
        stop()
        resolve()
      }
    })
    timer = setTimeout(() => {
      stop()
      resolve()
    }, TIMEOUT_ARRIVO_MS)
  })
}

/** Blocca la pipeline finché lo studente non decide. */
function attendiDecisione(token: number): Promise<'approvata' | 'rifiutata' | 'annullata'> {
  return new Promise((resolve) => {
    const attuale = useStudioStore.getState().approvazione
    if (attuale === 'approvata' || attuale === 'rifiutata') {
      resolve(attuale)
      return
    }
    const stop = useStudioStore.subscribe((s) => {
      if (scaduto(token)) {
        stop()
        resolve('annullata')
        return
      }
      if (s.approvazione === 'approvata' || s.approvazione === 'rifiutata') {
        stop()
        resolve(s.approvazione)
      }
    })
  })
}

async function allaPostazione(agente: AgentKey, token: number, etichetta: string) {
  const s = useStudioStore.getState()
  s.setAgenteAttivo(agente)
  s.patchAgente(agente, { status: 'walking', microLabel: 'raggiungo la postazione…', arrived: false })
  await attendiArrivo(agente, token)
  if (scaduto(token)) return
  useStudioStore.getState().patchAgente(agente, { status: 'working', microLabel: etichetta })
}

export function annullaEsecuzione() {
  tokenRun += 1
  controller?.abort()
  controller = null
  const s = useStudioStore.getState()
  s.setInEsecuzione(false)
  s.setAgenteAttivo(null)
  s.azzeraApprovazione()
  logAvviso(null, 'Esecuzione interrotta manualmente.')
}

// ---------------------------------------------------------------------------
// I singoli passi
// ---------------------------------------------------------------------------

async function passoLettore(token: number, signal: AbortSignal): Promise<RisultatoLettore> {
  await allaPostazione('lettore', token, 'studio il materiale del corso…')
  const s = useStudioStore.getState()

  const consegna = await sorveglia<Consegna<RisultatoLettore>>({
    agente: 'lettore',
    passo: 'Lettore',
    signal,
    esegui: async (_t, suggerimento) => {
      const { dati } = await chiamataStrutturata<Consegna<RisultatoLettore>>({
        ...base(s.modelli.lettore, 4000, signal),
        system: sistema(SYSTEM_LETTORE, suggerimento),
        messages: [messaggioLettore(contesto())],
        schema: SCHEMA_LETTORE,
      })
      return dati
    },
    valida: (d) => {
      if (!passaggiValidi(d?.passaggi)) return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi di una frase ciascuno.' }
      const r = d?.risultato
      if (!elencoNonVuoto(r?.concetti_chiave)) return { ok: false, suggerimento: 'Manca "concetti_chiave".' }
      if (!elencoNonVuoto(r?.metriche_applicabili)) return { ok: false, suggerimento: 'Manca "metriche_applicabili".' }
      if (!testoSostanzioso(r?.sintesi_dati_caso, 40)) return { ok: false, suggerimento: '"sintesi_dati_caso" è troppo breve.' }
      return { ok: true }
    },
  })

  const store = useStudioStore.getState()
  store.setDossier(consegna.risultato)
  store.patchAgente('lettore', { status: 'done', microLabel: 'dossier pronto', passaggi: consegna.passaggi, errore: null })
  ticker('LETTORE ▲ DOSSIER PRONTO', '▲')
  return consegna.risultato
}

async function passoRicercatore(
  token: number,
  signal: AbortSignal,
  dossier: RisultatoLettore,
  giro: number,
  motivoNuovoGiro?: string,
): Promise<Fonte[]> {
  await allaPostazione('ricercatore', token, 'cerco fonti online…')
  const s = useStudioStore.getState()

  const esito = await sorveglia({
    agente: 'ricercatore',
    passo: `Ricercatore (giro ${giro})`,
    signal,
    esegui: async (_t, suggerimento) =>
      eseguiRicerca({
        ...base(s.modelli.ricercatore, 6000, signal),
        system: sistema(SYSTEM_RICERCATORE, suggerimento),
        messages: [messaggioRicercatore(contesto(), dossier, motivoNuovoGiro)],
      }),
    valida: (e) => {
      if (!e.raccolta.usato && e.raccolta.errori.length === 0) {
        return { ok: false, suggerimento: 'Non hai usato la ricerca web: devi eseguire davvero delle ricerche prima di consegnare.' }
      }
      if (!passaggiValidi(e.consegna.passaggi)) {
        return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi.' }
      }
      return { ok: true }
    },
  })

  const { consegna, raccolta } = esito
  const store = useStudioStore.getState()

  if (raccolta.query.length > 0) {
    logInfo('ricercatore', `Query eseguite: ${raccolta.query.join(' · ')}`)
  }
  for (const errore of raccolta.errori) logFallimento('ricercatore', errore)
  store.setAvvisoRicerca(raccolta.errori.length > 0 ? raccolta.errori.join(' ') : null)

  // Verifica deterministica: le fonti non confermate non passano al Selettore.
  const { verificate, respinte } = verificaFonti(consegna.risultato.fonti, raccolta.risultati)
  const fonti: Fonte[] = verificate.map((f) => ({ ...f, verificata: true }))

  for (const r of respinte) {
    logFallimento(
      'ricercatore',
      `Fonte esclusa perché l'URL non compare nei risultati di ricerca: "${r.titolo}" — ${r.url}`,
    )
  }

  store.setFonti(fonti, consegna.risultato.fonti_scartate ?? [])
  store.patchAgente('ricercatore', {
    status: 'done',
    microLabel: `${fonti.length} fonti verificate`,
    passaggi: consegna.passaggi,
    errore: null,
  })

  logOk(
    'ricercatore',
    `${consegna.risultato.fonti.length} fonti dichiarate, ${fonti.length} con URL confermato, ${respinte.length} escluse.`,
  )
  ticker(`RICERCATORE ▲ ${fonti.length} FONTI VERIFICATE`, '▲')

  if (fonti.length === 0) {
    const messaggio =
      raccolta.errori.length > 0
        ? `La ricerca web non ha prodotto fonti utilizzabili. ${raccolta.errori.join(' ')}`
        : raccolta.vuota
          ? 'La ricerca web non ha restituito alcun risultato per queste query. Prova a riformulare argomento e capitolo.'
          : 'Nessuna fonte dichiarata dal Ricercatore ha superato la verifica degli URL.'
    store.setAvvisoRicerca(messaggio)
    throw new ApiError('sconosciuto', messaggio)
  }

  return fonti
}

async function passoSelettore(
  token: number,
  signal: AbortSignal,
  dossier: RisultatoLettore,
  fonti: Fonte[],
  motivoRifiuto: string,
  selezionePrecedente: string,
  giro: number,
): Promise<RisultatoSelettore> {
  await allaPostazione('selettore', token, 'valuto la pertinenza…')
  const s = useStudioStore.getState()

  const consegna = await sorveglia<Consegna<RisultatoSelettore>>({
    agente: 'selettore',
    passo: `Selettore (giro ${giro})`,
    signal,
    esegui: async (_t, suggerimento) => {
      const { dati } = await chiamataStrutturata<Consegna<RisultatoSelettore>>({
        ...base(s.modelli.selettore, 4000, signal),
        system: sistema(SYSTEM_SELETTORE, suggerimento),
        messages: [messaggioSelettore(contesto(), dossier, fonti, motivoRifiuto, selezionePrecedente)],
        schema: SCHEMA_SELETTORE,
      })
      return dati
    },
    valida: (d) => {
      if (!passaggiValidi(d?.passaggi)) return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi.' }
      if (!Array.isArray(d?.risultato?.selezionate)) return { ok: false, suggerimento: 'Manca l\'elenco "selezionate".' }
      if (typeof d?.risultato?.copertura_sufficiente !== 'boolean') {
        return { ok: false, suggerimento: 'Manca il campo booleano "copertura_sufficiente".' }
      }
      return { ok: true }
    },
  })

  // Il Selettore non può inventare URL: si tengono solo quelli dell'elenco ricevuto.
  const ammessi = new Set(fonti.map((f) => f.url))
  const selezionate = consegna.risultato.selezionate.filter((v) => ammessi.has(v.url))
  const fuoriElenco = consegna.risultato.selezionate.length - selezionate.length
  if (fuoriElenco > 0) {
    logAvviso('selettore', `${fuoriElenco} selezioni ignorate: l'URL non era nell'elenco del Ricercatore.`)
  }

  const store = useStudioStore.getState()
  store.setSelezione(selezionate, consegna.risultato.scartate ?? [], consegna.risultato.copertura_sufficiente)
  store.patchAgente('selettore', { passaggi: consegna.passaggi, errore: null })
  logOk('selettore', `${selezionate.length} fonti tenute, ${(consegna.risultato.scartate ?? []).length} scartate.`)

  return { ...consegna.risultato, selezionate }
}

async function passoScrittore(
  token: number,
  signal: AbortSignal,
  dossier: RisultatoLettore,
  approvate: Fonte[],
): Promise<void> {
  await allaPostazione('scrittore', token, 'scrivo le tre opzioni…')
  const s = useStudioStore.getState()

  const impianti: ImpiantoKey[] = ['A', 'B', 'C']
  s.inizializzaOpzioni(
    impianti.map((i) => ({
      impianto: i,
      etichetta: IMPIANTI[i].etichetta,
      passaggi: [],
      risultato: null,
      stato: 'in_corso',
      errore: null,
      valutazione: null,
    })),
  )

  // Le tre opzioni partono insieme: se una fallisce le altre restano valide.
  const esiti = await Promise.allSettled(impianti.map((i) => scriviOpzione(i, dossier, approvate, signal)))

  let riuscite = 0
  esiti.forEach((esito, indice) => {
    const impianto = impianti[indice]
    if (esito.status === 'fulfilled') {
      riuscite += 1
      useStudioStore.getState().patchOpzione(impianto, {
        risultato: esito.value.risultato,
        passaggi: esito.value.passaggi,
        stato: 'ok',
        errore: null,
      })
    } else {
      const messaggio = toApiError(esito.reason).message
      useStudioStore.getState().patchOpzione(impianto, { stato: 'errore', errore: messaggio })
      logFallimento('scrittore', `Opzione ${impianto} non prodotta: ${messaggio}`)
    }
  })

  if (scaduto(token)) return

  useStudioStore.getState().patchAgente('scrittore', {
    status: riuscite > 0 ? 'done' : 'error',
    microLabel: riuscite > 0 ? `${riuscite} opzioni su 3` : 'nessuna opzione prodotta',
    errore: riuscite > 0 ? null : 'Tutte e tre le opzioni sono fallite.',
  })
  logOk('scrittore', `${riuscite} opzioni su 3 prodotte.`)
  ticker(`SCRITTORE ▲ ${riuscite}/3 OPZIONI`, riuscite === 3 ? '▲' : '▼')

  if (riuscite === 0) {
    throw new ApiError('sconosciuto', 'Nessuna delle tre opzioni è stata prodotta.')
  }
}

/** Una singola opzione dello Scrittore, riutilizzabile dal bottone "rigenera". */
export async function scriviOpzione(
  impianto: ImpiantoKey,
  dossier: RisultatoLettore,
  approvate: Fonte[],
  signal: AbortSignal,
): Promise<Consegna<RisultatoScrittore>> {
  const s = useStudioStore.getState()

  return sorveglia<Consegna<RisultatoScrittore>>({
    agente: 'scrittore',
    passo: `Scrittore — opzione ${impianto}`,
    signal,
    esegui: async (_t, suggerimento) => {
      const { dati } = await chiamataStrutturataStream<Consegna<RisultatoScrittore>>({
        ...base(s.modelli.scrittore, 16000, signal),
        effort: 'high',
        system: sistema(SYSTEM_SCRITTORE, suggerimento),
        messages: [messaggioScrittore(contesto(), dossier, approvate, impianto)],
        schema: SCHEMA_SCRITTORE,
      })
      return dati
    },
    valida: (d) => {
      if (!passaggiValidi(d?.passaggi)) return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi.' }
      const r = d?.risultato
      if (!testoSostanzioso(r?.titolo, 8)) return { ok: false, suggerimento: 'Manca un titolo sensato.' }
      if (!elencoNonVuoto(r?.paragrafi, 3)) return { ok: false, suggerimento: 'Servono almeno 3 paragrafi con titoletto e testo.' }
      const parole = (r?.paragrafi ?? []).reduce(
        (n, p) => n + (typeof p?.testo === 'string' ? p.testo.split(/\s+/).filter(Boolean).length : 0),
        0,
      )
      if (parole < 400) {
        return { ok: false, suggerimento: `Il capitolo è troppo breve (${parole} parole): servono almeno 600 parole di testo continuo.` }
      }
      const ammessi = new Set(approvate.map((f) => f.url))
      const estranee = (r?.fonti_citate ?? []).filter((u) => !ammessi.has(u))
      if (estranee.length > 0) {
        return { ok: false, suggerimento: `Hai citato URL non approvati: ${estranee.join(', ')}. Usa solo le fonti approvate.` }
      }
      return { ok: true }
    },
  })
}

async function passoControllore(token: number, signal: AbortSignal, approvate: Fonte[]): Promise<void> {
  const store = useStudioStore.getState()
  const opzioni = store.opzioni.filter((o) => o.stato === 'ok')
  if (opzioni.length === 0) return

  await allaPostazione('controllore', token, 'verifico le opzioni…')
  const s = useStudioStore.getState()

  const nonVerificate = s.fonti.filter((f) => !f.verificata)
  const esitoUrl =
    nonVerificate.length === 0
      ? `Tutte le ${s.fonti.length} fonti in uso hanno un URL confermato dai risultati della ricerca web. Le fonti non confermate erano già state escluse automaticamente.`
      : `Attenzione: ${nonVerificate.length} fonti hanno un URL non confermato.`

  // Controllo lessicale di supporto, riportato in console.
  const testoCompleto = opzioni
    .map((o) => o.risultato?.paragrafi.map((p) => `${p.titoletto} ${p.testo}`).join(' ') ?? '')
    .join(' ')
  const sospetti = segnalaSconfinamenti(testoCompleto)
  if (sospetti.length > 0) {
    logAvviso('controllore', `Termini fuori perimetro da verificare nel testo: ${sospetti.join(', ')}.`)
  }

  const consegna = await sorveglia<Consegna<RisultatoControllore>>({
    agente: 'controllore',
    passo: 'Controllore — verifica finale',
    signal,
    esegui: async (_t, suggerimento) => {
      const { dati } = await chiamataStrutturata<Consegna<RisultatoControllore>>({
        ...base(s.modelli.controllore, 5000, signal),
        system: sistema(SYSTEM_CONTROLLORE, suggerimento),
        messages: [messaggioControllore(contesto(), approvate, opzioni, esitoUrl)],
        schema: SCHEMA_CONTROLLORE,
      })
      return dati
    },
    valida: (d) => {
      if (!passaggiValidi(d?.passaggi)) return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi.' }
      const r = d?.risultato
      if (!elencoNonVuoto(r?.checklist, 4)) {
        return { ok: false, suggerimento: 'La checklist deve contenere tutte e quattro le voci obbligatorie.' }
      }
      if (!elencoNonVuoto(r?.valutazioni, opzioni.length)) {
        return { ok: false, suggerimento: `Servono ${opzioni.length} valutazioni, una per ogni opzione prodotta.` }
      }
      return { ok: true }
    },
  })

  const finale = useStudioStore.getState()
  finale.setReferto(consegna.risultato)
  finale.patchAgente('controllore', {
    status: 'done',
    microLabel: 'controllo completato',
    passaggi: consegna.passaggi,
    errore: null,
  })

  for (const valutazione of consegna.risultato.valutazioni) {
    finale.patchOpzione(valutazione.opzione, {
      valutazione: { punti_di_forza: valutazione.punti_di_forza, criticita: valutazione.criticita },
    })
  }

  const problemi = consegna.risultato.checklist.filter((v) => v.esito === 'problema')
  if (problemi.length > 0) {
    logAvviso('controllore', `${problemi.length} voci della checklist con problemi: ${problemi.map((p) => p.id).join(', ')}.`)
    ticker(`CONTROLLORE ▼ ${problemi.length} RILIEVI`, '▼')
  } else {
    logOk('controllore', 'Checklist tutta positiva.')
    ticker('CONTROLLORE ▲ NESSUN RILIEVO', '▲')
  }
}

// ---------------------------------------------------------------------------
// Orchestrazione
// ---------------------------------------------------------------------------

export async function avviaSquadra(riprendiDa?: AgentKey) {
  const iniziale = useStudioStore.getState()

  if (!iniziale.apiKey.trim()) {
    iniziale.setErroreGlobale('Incolla la tua chiave API Anthropic nel pannello impostazioni.')
    return
  }
  if (iniziale.courseFiles.length === 0 || iniziale.courseFiles.some((f) => f.status !== 'pronto')) {
    iniziale.setErroreGlobale('Carica il materiale del corso e attendi che il caricamento sia al 100%.')
    return
  }
  if (!iniziale.argomento.trim() || !iniziale.capitolo.trim()) {
    iniziale.setErroreGlobale("Compila l'argomento della tesi e il capitolo da scrivere.")
    return
  }

  tokenRun += 1
  const token = tokenRun
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal

  const store = useStudioStore.getState()
  store.setErroreGlobale(null)
  store.setRipresaDa(null)
  store.setInEsecuzione(true)
  store.setCampanella(false)

  // Riprendendo da un agente si conservano i risultati già ottenuti.
  const daCapo = !riprendiDa
  if (daCapo) {
    for (const k of AGENT_KEYS) {
      store.patchAgente(k, { status: 'idle', microLabel: '', passaggi: [], errore: null, arrived: false, tentativi: 0 })
    }
    store.setDossier(null)
    store.setFonti([], [])
    store.setSelezione([], [], true)
    store.azzeraApprovazione()
    store.inizializzaOpzioni([])
    store.setReferto(null)
  }

  // Il Controllore si siede per primo e resta attivo per tutto il processo.
  useStudioStore.getState().patchAgente('controllore', {
    status: 'working',
    microLabel: 'sorveglio il processo…',
    arrived: false,
  })
  logInfo(null, 'Avvio della squadra.')
  ticker('SEDUTA APERTA ● HARROW & VANCE SECURITIES', '●')

  try {
    const ordine: AgentKey[] = ['lettore', 'ricercatore', 'selettore', 'scrittore']
    const partenza = riprendiDa ? ordine.indexOf(riprendiDa) : 0

    // --- Lettore ---------------------------------------------------------
    let dossier = useStudioStore.getState().dossier
    if (partenza <= 0 || !dossier) {
      dossier = await passoLettore(token, signal)
    }
    if (scaduto(token)) return

    // --- Ricerca, selezione e approvazione --------------------------------
    let approvato = useStudioStore.getState().approvazione === 'approvata' && partenza > 2
    let giro = 0
    let serveRicerca = partenza <= 1 || useStudioStore.getState().fonti.length === 0
    let motivoNuovoGiro: string | undefined
    let selezionePrecedente = ''

    while (!approvato && giro < MAX_GIRI_RICERCA) {
      giro += 1

      if (serveRicerca) {
        await passoRicercatore(token, signal, dossier!, giro, motivoNuovoGiro)
        if (scaduto(token)) return
      }

      const fonti = useStudioStore.getState().fonti
      const selezione = await passoSelettore(
        token,
        signal,
        dossier!,
        fonti,
        useStudioStore.getState().motivoRifiuto,
        selezionePrecedente,
        giro,
      )
      if (scaduto(token)) return

      selezionePrecedente = selezione.selezionate
        .map((v) => `- ${v.url}: ${v.motivo}`)
        .join('\n')

      if (selezione.selezionate.length === 0 || !selezione.copertura_sufficiente) {
        if (giro >= MAX_GIRI_RICERCA) {
          logAvviso('selettore', 'Numero massimo di giri raggiunto: procedo con quello che c\'è.')
        } else {
          motivoNuovoGiro =
            selezione.selezionate.length === 0
              ? 'Nessuna fonte del giro precedente era abbastanza pertinente.'
              : 'Il Selettore ha giudicato insufficiente la copertura delle fonti.'
          logRiparazione('selettore', `Nuovo giro di ricerca: ${motivoNuovoGiro}`)
          serveRicerca = true
          useStudioStore.getState().azzeraApprovazione()
          useStudioStore.getState().patchAgente('selettore', { status: 'done', microLabel: 'servono altre fonti' })
          continue
        }
      }

      // --- Punto di approvazione umana ------------------------------------
      const attesa = useStudioStore.getState()
      attesa.chiediApprovazione()
      attesa.patchAgente('selettore', { status: 'waiting', microLabel: 'attendo la tua approvazione…' })
      logInfo('selettore', 'In attesa dell\'approvazione umana sulle fonti selezionate.')
      ticker('SELETTORE ● ATTESA APPROVAZIONE', '●')

      const decisione = await attendiDecisione(token)
      if (scaduto(token) || decisione === 'annullata') return

      if (decisione === 'approvata') {
        approvato = true
        logOk('selettore', 'Selezione approvata dallo studente.')
        ticker('APPROVAZIONE ▲ FONTI CONFERMATE', '▲')
        useStudioStore.getState().patchAgente('selettore', { status: 'done', microLabel: 'fonti approvate' })
      } else {
        const motivo = useStudioStore.getState().motivoRifiuto
        logAvviso('selettore', `Selezione rifiutata${motivo ? `: ${motivo}` : '.'} Rivedo la scelta.`)
        ticker('APPROVAZIONE ▼ SELEZIONE RIFIUTATA', '▼')
        useStudioStore.getState().azzeraApprovazione()
        serveRicerca = false
      }
    }

    if (!approvato) {
      const messaggio = 'Non si è arrivati a una selezione approvata entro il numero massimo di giri.'
      useStudioStore.getState().setErroreGlobale(messaggio)
      logFallimento(null, messaggio)
      return
    }

    // --- Scrittore e Controllore ------------------------------------------
    const approvate = fontiApprovate(useStudioStore.getState())
    await passoScrittore(token, signal, dossier!, approvate)
    if (scaduto(token)) return

    await passoControllore(token, signal, approvate)
    if (scaduto(token)) return

    useStudioStore.getState().setCampanella(true)
    logOk(null, 'Capitolo completato: scegli l\'opzione che preferisci.')
    ticker('SEDUTA CHIUSA ▲ CAPITOLO PRONTO', '▲')
  } catch (err) {
    if (isAbort(err) || scaduto(token)) return

    const errore = toApiError(err)
    const agente = useStudioStore.getState().agenteAttivo
    if (agente) {
      useStudioStore.getState().patchAgente(agente, {
        status: 'error',
        microLabel: 'errore',
        errore: errore.message,
      })
      useStudioStore.getState().setRipresaDa(agente)
    }
    useStudioStore.getState().setErroreGlobale(errore.message)
    logFallimento(agente, errore.message)
    ticker('ERRORE ▼ ESECUZIONE INTERROTTA', '▼')
  } finally {
    // I controlli tornano sempre utilizzabili, anche dopo un errore.
    if (!scaduto(token)) {
      const finale = useStudioStore.getState()
      finale.setInEsecuzione(false)
      finale.setAgenteAttivo(null)
      if (finale.approvazione === 'in_attesa') finale.azzeraApprovazione()
      if (finale.agenti.controllore.status === 'working') {
        finale.patchAgente('controllore', { status: 'done', microLabel: 'sorveglianza conclusa' })
      }
    }
  }
}

/** Rigenera una singola opzione fallita senza rifare il resto. */
export async function rigeneraOpzione(impianto: ImpiantoKey) {
  const s = useStudioStore.getState()
  const dossier = s.dossier
  if (!dossier) return

  const approvate = fontiApprovate(s)
  const locale = new AbortController()
  s.patchOpzione(impianto, { stato: 'in_corso', errore: null })
  logInfo('scrittore', `Rigenerazione dell'opzione ${impianto}.`)

  try {
    const consegna = await scriviOpzione(impianto, dossier, approvate, locale.signal)
    useStudioStore.getState().patchOpzione(impianto, {
      risultato: consegna.risultato,
      passaggi: consegna.passaggi,
      stato: 'ok',
      errore: null,
    })
    logOk('scrittore', `Opzione ${impianto} rigenerata.`)
  } catch (err) {
    const messaggio = toApiError(err).message
    useStudioStore.getState().patchOpzione(impianto, { stato: 'errore', errore: messaggio })
    logFallimento('scrittore', `Rigenerazione dell'opzione ${impianto} fallita: ${messaggio}`)
  }
}

// ---------------------------------------------------------------------------
// Chat sul progetto
// ---------------------------------------------------------------------------

export async function inviaMessaggioChat(testo: string) {
  const s = useStudioStore.getState()
  const domanda = testo.trim()
  if (!domanda || s.chatInCorso) return

  if (!s.apiKey.trim()) {
    s.setChatErrore('Incolla la tua chiave API Anthropic per usare la chat.')
    return
  }

  s.aggiungiChat({ role: 'user', content: domanda })
  s.setChatInCorso(true)
  s.setChatErrore(null)
  s.setChatParziale('')

  const locale = new AbortController()

  try {
    const stato = useStudioStore.getState()

    const statiAgenti = AGENT_KEYS.map((k) => {
      const a = stato.agenti[k]
      return `- ${k}: ${a.status}${a.microLabel ? ` (${a.microLabel})` : ''}${a.errore ? ` — errore: ${a.errore}` : ''}`
    }).join('\n')

    const console20 = stato.log
      .slice(-20)
      .map((l) => `[${new Date(l.at).toLocaleTimeString('it-IT')}] ${l.kind.toUpperCase()} ${l.messaggio}`)
      .join('\n')

    const approvazione =
      stato.approvazione === 'in_attesa'
        ? `in attesa della decisione dello studente (giro ${stato.giroApprovazione})`
        : stato.storicoApprovazioni.length > 0
          ? stato.storicoApprovazioni.join(' | ')
          : 'non ancora richiesta'

    // Il contesto sta nel system e viene rigenerato a ogni domanda.
    const system = [
      { type: 'text' as const, text: SYSTEM_CHAT_BASE },
      {
        type: 'text' as const,
        text: contestoChat({
          argomento: stato.argomento,
          capitolo: stato.capitolo,
          dossier: stato.dossier,
          riepilogoCaso: riepilogoCaso(stato.caseFiles),
          fontiApprovate: fontiApprovate(stato),
          opzioni: stato.opzioni,
          statiAgenti,
          console: console20,
          approvazione,
        }),
      },
    ]

    segnalaInizioChiamata()
    let risposta: string
    try {
      risposta = await chiamataChatStream({
        client: creaClient(stato.apiKey),
        model: stato.modelli.chat,
        maxTokens: 4000,
        system,
        messages: stato.chat.map((m) => ({ role: m.role, content: m.content })),
        signal: locale.signal,
        onTesto: (frammento) => {
          const attuale = useStudioStore.getState()
          attuale.setChatParziale(attuale.chatParziale + frammento)
        },
      })
    } finally {
      segnalaFineChiamata()
    }

    if (!risposta) throw new ApiError('sconosciuto', "L'assistente ha risposto senza contenuto.")

    useStudioStore.getState().aggiungiChat({ role: 'assistant', content: risposta })
    useStudioStore.getState().setChatParziale('')
    logOk(null, 'Risposta della chat ricevuta.')
  } catch (err) {
    const messaggio = toApiError(err).message
    useStudioStore.getState().setChatErrore(messaggio)
    useStudioStore.getState().setChatParziale('')
    logFallimento(null, `Chat: ${messaggio}`)
  } finally {
    useStudioStore.getState().setChatInCorso(false)
  }
}

/** Riepilogo delle fonti approvate, usato dalla lavagna in scena. */
export function riepilogoFontiApprovate(): string {
  return elencoFonti(fontiApprovate(useStudioStore.getState()))
}
