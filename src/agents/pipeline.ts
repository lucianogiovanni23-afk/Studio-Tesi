import { AGENT_KEYS, calcolaFontiApprovate, costoTotale, materialePronto, useStudioStore, type StudioState } from '../store'
import type {
  AgentKey,
  ApprovalStatus,
  Citazione,
  Consegna,
  Fonte,
  GiudizioCitazione,
  ImpiantoKey,
  Opzione,
  Paragrafo,
  PrefissoScrittore,
  RisultatoControllore,
  RisultatoLettore,
  RisultatoScrittore,
  RisultatoSelettore,
  Scaletta,
} from '../types'
import {
  ApiError,
  chiamataChatStream,
  chiamataStrutturata,
  chiamataStrutturataStream,
  creaClient,
  toApiError,
  type ChiamataBase,
  type Chi,
} from './api'
import { contaParole, esaminaParagrafi, verificaCitazioni, verificaEstratto, type EsameParagrafi } from './citations'
import { BUDGET, recuperaPassaggi, statisticheCorpus } from './corpus'
import { formattaDollari } from './costs'
import {
  IMPIANTI,
  SYSTEM_CHAT_BASE,
  SYSTEM_CONTROLLORE,
  SYSTEM_LETTORE,
  SYSTEM_RICERCATORE,
  SYSTEM_SCRITTORE,
  SYSTEM_SELETTORE,
  blocchiPdfScansionati,
  contestoChat,
  costruisciPrefisso,
  elencaCitazioni,
  istruzioneOpzione,
  istruzioneRifinitura,
  istruzioneScaletta,
  messaggioControllore,
  messaggioGiudizi,
  messaggioLettore,
  messaggioRicercatore,
  messaggioScrittore,
  messaggioSelettore,
  riepilogoCaso,
  type CitazioneDaGiudicare,
  type ContestoProgetto,
} from './prompts'
import {
  SCHEMA_CONTROLLORE,
  SCHEMA_GIUDIZI,
  SCHEMA_LETTORE,
  SCHEMA_PARAGRAFO,
  SCHEMA_SCALETTA,
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
import { normalizzaUrl, verificaFonti } from './verifyUrls'
import { eseguiRicerca } from './webSearch'

let tokenRun = 0
let controller: AbortController | null = null

const TIMEOUT_ARRIVO_MS = 12_000
const MAX_GIRI_RICERCA = 4
const MAX_GIRI_SCALETTA = 4
/** Oltre questa quota di citazioni non ritrovate nella fonte, l'opzione si riscrive. */
const SOGLIA_CITAZIONI_ERRATE = 0.25

/** Domande di base per il recupero dei passaggi: i concetti cardine del corso. */
const DOMANDE_CORSO = [
  'leva operativa costi fissi costi variabili margine di contribuzione',
  'rischio operativo variabilità del risultato operativo',
  'rischio e rendimento volatilità deviazione standard',
  'leva finanziaria struttura finanziaria rischio finanziario',
  'flussi di cassa pianificazione finanziaria fabbisogno',
]

function scaduto(token: number): boolean {
  return token !== tokenRun
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function stato() {
  return useStudioStore.getState()
}

function contesto(): ContestoProgetto {
  const s = stato()
  return {
    argomento: s.argomento,
    capitolo: s.capitolo,
    courseFiles: s.courseFiles,
    caseFiles: s.caseFiles,
  }
}

function base(
  modello: string,
  maxTokens: number,
  signal: AbortSignal,
  chi: Chi,
): Omit<ChiamataBase, 'system' | 'messages'> {
  return {
    client: creaClient(stato().apiKey),
    model: modello,
    maxTokens,
    signal,
    chi,
  }
}

/** Il suggerimento del Controllore va in coda al system, tranne che per lo Scrittore (vedi sotto). */
function sistema(testo: string, suggerimento = '') {
  const blocchi = [{ type: 'text' as const, text: testo }]
  if (suggerimento) blocchi.push({ type: 'text' as const, text: suggerimento })
  return blocchi
}

/** Allo Scrittore il system resta identico a ogni chiamata: è parte del prefisso in cache. */
const SISTEMA_SCRITTORE = sistema(SYSTEM_SCRITTORE)

function fontiApprovate(): Fonte[] {
  const s = stato()
  return calcolaFontiApprovate(s.fonti, s.selezionate)
}

/** Attende che il broker abbia finito di camminare fino alla postazione. */
function attendiArrivo(agente: AgentKey, token: number): Promise<void> {
  return new Promise((resolve) => {
    if (stato().agenti[agente].arrived) {
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
function attendiDecisione(
  token: number,
  leggi: (s: StudioState) => ApprovalStatus,
): Promise<'approvata' | 'rifiutata' | 'annullata'> {
  return new Promise((resolve) => {
    const attuale = leggi(stato())
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
      const valore = leggi(s)
      if (valore === 'approvata' || valore === 'rifiutata') {
        stop()
        resolve(valore)
      }
    })
  })
}

async function allaPostazione(agente: AgentKey, token: number, etichetta: string) {
  const s = stato()
  s.setAgenteAttivo(agente)
  if (s.agenti[agente].arrived && s.agenti[agente].status !== 'idle') {
    s.patchAgente(agente, { status: 'working', microLabel: etichetta })
    return
  }
  s.patchAgente(agente, { status: 'walking', microLabel: 'raggiungo la postazione…', arrived: false })
  await attendiArrivo(agente, token)
  if (scaduto(token)) return
  stato().patchAgente(agente, { status: 'working', microLabel: etichetta })
}

export function annullaEsecuzione() {
  tokenRun += 1
  controller?.abort()
  controller = null
  const s = stato()
  s.setInEsecuzione(false)
  s.setAgenteAttivo(null)
  s.azzeraApprovazione()
  s.azzeraApprovazioneScaletta()
  for (const k of AGENT_KEYS) {
    const a = stato().agenti[k]
    if (a.status === 'working' || a.status === 'walking' || a.status === 'waiting') {
      stato().patchAgente(k, { status: 'idle', microLabel: 'fermato' })
    }
  }
  logAvviso(null, 'Esecuzione interrotta manualmente.')
}

// ---------------------------------------------------------------------------
// Lettore
// ---------------------------------------------------------------------------

async function passoLettore(token: number, signal: AbortSignal): Promise<RisultatoLettore> {
  await allaPostazione('lettore', token, 'studio il materiale del corso…')
  const s = stato()

  const passaggi = recuperaPassaggi([s.argomento, s.capitolo, ...DOMANDE_CORSO], BUDGET[s.profondita].lettore)
  const statistiche = statisticheCorpus()
  const caratteri = passaggi.reduce((n, p) => n + p.testo.length, 0)
  const file = new Set(passaggi.map((p) => p.fileId)).size
  s.setInfoLettura({ passaggi: passaggi.length, file, caratteri, totale: statistiche.caratteri })

  const scansionati = s.courseFiles.filter((f) => f.scansionato).length
  if (passaggi.length === 0 && scansionati === 0) {
    throw new ApiError(
      'sconosciuto',
      'Il materiale del corso non contiene testo leggibile. Ricarica i PDF: se sono scansioni, verranno inviati come immagini.',
    )
  }
  logInfo(
    'lettore',
    statistiche.caratteri <= caratteri
      ? `Leggo tutto il materiale: ${passaggi.length} passaggi da ${file} file.`
      : `Leggo i ${passaggi.length} passaggi più pertinenti da ${file} file (${Math.round(caratteri / 1000)} mila caratteri su ${Math.round(statistiche.caratteri / 1000)} mila).`,
  )

  const consegna = await sorveglia<Consegna<RisultatoLettore>>({
    agente: 'lettore',
    passo: 'Lettore',
    signal,
    esegui: (_t, suggerimento) =>
      chiamataStrutturata<Consegna<RisultatoLettore>>({
        ...base(s.modelli.lettore, 6000, signal, 'lettore'),
        effort: 'medium',
        system: sistema(SYSTEM_LETTORE, suggerimento),
        messages: [messaggioLettore(contesto(), passaggi)],
        schema: SCHEMA_LETTORE,
      }),
    valida: (d) => {
      if (!passaggiValidi(d?.passaggi)) return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi di una frase ciascuno.' }
      const r = d?.risultato
      if (!elencoNonVuoto(r?.concetti_chiave)) return { ok: false, suggerimento: 'Manca "concetti_chiave".' }
      if (!elencoNonVuoto(r?.metriche_applicabili)) return { ok: false, suggerimento: 'Manca "metriche_applicabili".' }
      if (!testoSostanzioso(r?.sintesi_dati_caso, 40)) return { ok: false, suggerimento: '"sintesi_dati_caso" è troppo breve.' }
      return { ok: true }
    },
  })

  const store = stato()
  store.setDossier(consegna.risultato)
  store.patchAgente('lettore', { status: 'done', microLabel: 'dossier pronto', passaggi: consegna.passaggi, errore: null })
  ticker('LETTORE ▲ DOSSIER PRONTO', '▲')
  return consegna.risultato
}

// ---------------------------------------------------------------------------
// Ricercatore
// ---------------------------------------------------------------------------

async function passoRicercatore(
  token: number,
  signal: AbortSignal,
  dossier: RisultatoLettore,
  giro: number,
  motivoNuovoGiro?: string,
): Promise<Fonte[]> {
  await allaPostazione('ricercatore', token, 'cerco e leggo le fonti…')
  const s = stato()
  s.setPassoAttivo('ricerca')

  const esito = await sorveglia({
    agente: 'ricercatore',
    passo: `Ricercatore (giro ${giro})`,
    signal,
    esegui: (_t, suggerimento) =>
      eseguiRicerca({
        ...base(s.modelli.ricercatore, 8000, signal, 'ricercatore'),
        effort: 'medium',
        system: sistema(SYSTEM_RICERCATORE, suggerimento),
        messages: [messaggioRicercatore(contesto(), dossier, motivoNuovoGiro)],
      }),
    valida: (e) => {
      if (!e.raccolta.usato && e.raccolta.errori.length === 0) {
        return { ok: false, suggerimento: 'Non hai usato la ricerca web: devi eseguire davvero delle ricerche prima di consegnare.' }
      }
      if (e.raccolta.pagine.size === 0 && e.raccolta.errori.length === 0 && e.consegna.risultato.fonti.length > 0) {
        return {
          ok: false,
          suggerimento: 'Non hai letto nessuna pagina con web_fetch: leggi le fonti prima di consegnarle, e copia gli estratti dal testo letto.',
        }
      }
      if (!passaggiValidi(e.consegna.passaggi)) {
        return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi.' }
      }
      return { ok: true }
    },
  })

  const { consegna, raccolta, testi } = esito
  const store = stato()

  if (raccolta.query.length > 0) logInfo('ricercatore', `Query eseguite: ${raccolta.query.join(' · ')}`)
  if (raccolta.pagine.size > 0) logInfo('ricercatore', `Pagine lette per intero: ${raccolta.pagine.size}.`)
  for (const errore of raccolta.errori) logFallimento('ricercatore', errore)
  store.setAvvisoRicerca(raccolta.errori.length > 0 ? raccolta.errori.join(' ') : null)

  // 1. L'URL deve comparire fra i risultati reali della ricerca o fra le pagine lette.
  const { verificate, respinte } = verificaFonti(consegna.risultato.fonti, raccolta.risultati)
  for (const r of respinte) {
    logFallimento('ricercatore', `Fonte esclusa perché l'URL non compare nei risultati di ricerca: "${r.titolo}" — ${r.url}`)
  }

  // 2. Ogni estratto deve comparire nel testo della pagina scaricata.
  let estrattiScartati = 0
  const fonti: Fonte[] = verificate.map((f) => {
    const chiave = normalizzaUrl(f.url)
    const testo = [testi.get(chiave) ?? '', ...(raccolta.passiCitati.get(chiave) ?? [])].join('\n')
    const estratti = [...new Set(f.estratti)].filter((e) => verificaEstratto(e, testo) !== 'non_trovato')
    const scartati = f.estratti.length - estratti.length
    if (scartati > 0) {
      estrattiScartati += scartati
      logAvviso('ricercatore', `"${f.titolo}": ${scartati} estratti su ${f.estratti.length} non trovati nel testo della pagina, esclusi.`)
    }
    return { ...f, verificata: true, letta: testi.has(chiave), estratti }
  })

  store.setFonti(fonti, consegna.risultato.fonti_scartate ?? [])
  const conEstratti = fonti.filter((f) => f.estratti.length > 0).length
  store.patchAgente('ricercatore', {
    status: 'done',
    microLabel: `${fonti.length} fonti, ${conEstratti} citabili`,
    passaggi: consegna.passaggi,
    errore: null,
  })

  logOk(
    'ricercatore',
    `${consegna.risultato.fonti.length} fonti dichiarate, ${fonti.length} con URL confermato (${respinte.length} escluse); ${conEstratti} con estratti verificati, ${estrattiScartati} estratti scartati.`,
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

// ---------------------------------------------------------------------------
// Selettore
// ---------------------------------------------------------------------------

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
  const s = stato()

  const consegna = await sorveglia<Consegna<RisultatoSelettore>>({
    agente: 'selettore',
    passo: `Selettore (giro ${giro})`,
    signal,
    esegui: (_t, suggerimento) =>
      chiamataStrutturata<Consegna<RisultatoSelettore>>({
        ...base(s.modelli.selettore, 4000, signal, 'selettore'),
        effort: 'low',
        system: sistema(SYSTEM_SELETTORE, suggerimento),
        messages: [messaggioSelettore(contesto(), dossier, fonti, motivoRifiuto, selezionePrecedente)],
        schema: SCHEMA_SELETTORE,
      }),
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
  const ammessi = new Map(fonti.map((f) => [normalizzaUrl(f.url), f.url]))
  const selezionate = consegna.risultato.selezionate
    .filter((v) => ammessi.has(normalizzaUrl(v.url)))
    .map((v) => ({ ...v, url: ammessi.get(normalizzaUrl(v.url))! }))
  const fuoriElenco = consegna.risultato.selezionate.length - selezionate.length
  if (fuoriElenco > 0) {
    logAvviso('selettore', `${fuoriElenco} selezioni ignorate: l'URL non era nell'elenco del Ricercatore.`)
  }

  const store = stato()
  store.setSelezione(selezionate, consegna.risultato.scartate ?? [], consegna.risultato.copertura_sufficiente)
  store.patchAgente('selettore', { passaggi: consegna.passaggi, errore: null })
  logOk('selettore', `${selezionate.length} fonti tenute, ${(consegna.risultato.scartate ?? []).length} scartate.`)

  return { ...consegna.risultato, selezionate }
}

// ---------------------------------------------------------------------------
// Scrittore: prefisso, scaletta, opzioni, rifinitura
// ---------------------------------------------------------------------------

function preparaPrefisso(dossier: RisultatoLettore, approvate: Fonte[]): PrefissoScrittore {
  const s = stato()
  const domande = [
    s.argomento,
    s.capitolo,
    ...dossier.concetti_chiave.map((c) => `${c.termine} ${c.definizione}`),
    ...dossier.collegamenti_argomento,
  ]
  const passaggi = recuperaPassaggi(domande, BUDGET[s.profondita].scrittore)
  const prefisso = costruisciPrefisso(contesto(), dossier, approvate, passaggi)
  const citabili = approvate.filter((f) => f.estratti.length > 0).length
  logInfo(
    'scrittore',
    `Riferimenti citabili: ${citabili} fonti con estratti verificati e ${passaggi.length} passaggi del corso.`,
  )
  if (citabili < approvate.length) {
    logAvviso('scrittore', `${approvate.length - citabili} fonti approvate non hanno estratti verificati: non potranno essere citate.`)
  }
  return prefisso
}

function pdfScansionati() {
  const { blocchi, saltati } = blocchiPdfScansionati(stato().courseFiles)
  if (saltati.length > 0) logAvviso('scrittore', `PDF scansionati non allegati per dimensione: ${saltati.join(', ')}.`)
  return blocchi
}

async function passoScaletta(
  token: number,
  signal: AbortSignal,
  prefisso: PrefissoScrittore,
  precedente: Scaletta | null,
  motivo: string,
  giro: number,
): Promise<Scaletta> {
  await allaPostazione('scrittore', token, 'preparo la scaletta…')
  const s = stato()
  s.setPassoAttivo('scaletta')
  const etichette = new Set(prefisso.riferimenti.map((r) => r.etichetta))
  const allegati = pdfScansionati()

  const consegna = await sorveglia<Consegna<Scaletta>>({
    agente: 'scrittore',
    passo: `Scrittore — scaletta (giro ${giro})`,
    signal,
    esegui: (_t, suggerimento) =>
      chiamataStrutturataStream<Consegna<Scaletta>>({
        ...base(s.modelli.scrittore, 6000, signal, 'scrittore'),
        effort: 'medium',
        system: SISTEMA_SCRITTORE,
        messages: [messaggioScrittore(prefisso, allegati, istruzioneScaletta(motivo, precedente, suggerimento))],
        schema: SCHEMA_SCALETTA,
      }),
    valida: (d) => {
      if (!passaggiValidi(d?.passaggi)) return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi.' }
      const r = d?.risultato
      if (!testoSostanzioso(r?.titolo_capitolo, 8)) return { ok: false, suggerimento: 'Manca il titolo del capitolo.' }
      if (!elencoNonVuoto(r?.sezioni, 3)) return { ok: false, suggerimento: 'Servono almeno 3 sezioni.' }
      if (r.sezioni.some((x) => !testoSostanzioso(x?.titoletto, 3) || !elencoNonVuoto(x?.punti))) {
        return { ok: false, suggerimento: 'Ogni sezione deve avere un titoletto e almeno un punto da sviluppare.' }
      }
      return { ok: true }
    },
  })

  // Riferimenti inesistenti: si tolgono, e lo si dice.
  let tolti = 0
  const scaletta: Scaletta = {
    ...consegna.risultato,
    sezioni: consegna.risultato.sezioni.map((sez) => {
      const riferimenti = (sez.riferimenti ?? []).map((r) => r.trim().toUpperCase()).filter((r) => etichette.has(r))
      tolti += (sez.riferimenti ?? []).length - riferimenti.length
      return { ...sez, riferimenti }
    }),
  }
  if (tolti > 0) logAvviso('scrittore', `Scaletta: ${tolti} riferimenti inesistenti rimossi.`)

  const store = stato()
  store.setScaletta(scaletta)
  store.patchAgente('scrittore', { passaggi: consegna.passaggi, errore: null })
  logOk('scrittore', `Scaletta proposta: ${scaletta.sezioni.length} sezioni.`)
  ticker('SCRITTORE ● SCALETTA PRONTA', '●')
  return scaletta
}

interface OpzioneScritta {
  passaggi: string[]
  risultato: RisultatoScrittore
  parole: number
  esame: EsameParagrafi
}

function normalizzaParagrafo(p: Partial<Paragrafo> | undefined): Paragrafo {
  return {
    titoletto: typeof p?.titoletto === 'string' ? p.titoletto : '',
    testo: typeof p?.testo === 'string' ? p.testo : '',
    citazioni: Array.isArray(p?.citazioni)
      ? p.citazioni
          .filter((c): c is Citazione => !!c && typeof c.estratto === 'string')
          .map((c) => ({ rif: String(c.rif ?? '').trim().toUpperCase(), affermazione: c.affermazione ?? '', estratto: c.estratto }))
      : [],
  }
}

/** Verifica in codice ogni citazione contro il testo del riferimento indicato. */
function verificaParagrafi(paragrafi: Paragrafo[], prefisso: PrefissoScrittore): Paragrafo[] {
  return paragrafi.map((p) => ({ ...p, citazioni: verificaCitazioni(p.citazioni, prefisso.riferimenti) }))
}

function descriviErrate(esame: EsameParagrafi): string {
  return [...esame.rifSconosciuti, ...esame.nonTrovate]
    .slice(0, 5)
    .map((c) => `[${c.rif}] "${c.estratto.slice(0, 90)}${c.estratto.length > 90 ? '…' : ''}"`)
    .join('; ')
}

function controllaCitazioni(esame: EsameParagrafi, richieste: boolean): string | null {
  if (esame.totali === 0) {
    return richieste
      ? 'Non hai inserito nessuna citazione: ogni affermazione presa dalle fonti o dal corso va marcata e accompagnata dal suo estratto letterale.'
      : null
  }
  const errate = esame.nonTrovate.length + esame.rifSconosciuti.length
  if (errate / esame.totali > SOGLIA_CITAZIONI_ERRATE) {
    return `${errate} citazioni su ${esame.totali} hanno un estratto che NON compare nel testo del riferimento indicato, o un riferimento inesistente: ${descriviErrate(esame)}. Copia gli estratti carattere per carattere dal testo dei riferimenti, oppure togli la citazione e presenta l'affermazione come tua argomentazione.`
  }
  return null
}

/** Una singola opzione dello Scrittore, riutilizzabile dal bottone "rigenera". */
async function scriviOpzione(
  impianto: ImpiantoKey,
  prefisso: PrefissoScrittore,
  scaletta: Scaletta,
  signal: AbortSignal,
  onAvvio?: () => void,
): Promise<OpzioneScritta> {
  const s = stato()
  const allegati = pdfScansionati()

  return sorveglia<OpzioneScritta>({
    agente: 'scrittore',
    passo: `Scrittore — opzione ${impianto}`,
    signal,
    esegui: async (_t, suggerimento) => {
      const d = await chiamataStrutturataStream<Consegna<RisultatoScrittore>>({
        ...base(s.modelli.scrittore, 20000, signal, 'scrittore'),
        effort: 'high',
        system: SISTEMA_SCRITTORE,
        // Il suggerimento va nell'istruzione finale, dopo il prefisso in cache.
        messages: [messaggioScrittore(prefisso, allegati, istruzioneOpzione(scaletta, impianto, suggerimento))],
        schema: SCHEMA_SCRITTORE,
        onAvvio,
      })
      const paragrafi = verificaParagrafi((d?.risultato?.paragrafi ?? []).map(normalizzaParagrafo), prefisso)
      return {
        passaggi: d?.passaggi ?? [],
        risultato: { titolo: d?.risultato?.titolo ?? '', paragrafi },
        parole: contaParole(paragrafi),
        esame: esaminaParagrafi(paragrafi),
      }
    },
    valida: (o) => {
      if (!passaggiValidi(o.passaggi)) return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi.' }
      if (!testoSostanzioso(o.risultato.titolo, 8)) return { ok: false, suggerimento: 'Manca un titolo sensato.' }
      if (o.risultato.paragrafi.filter((p) => testoSostanzioso(p.testo, 80)).length < 3) {
        return { ok: false, suggerimento: 'Servono almeno 3 paragrafi con titoletto e testo.' }
      }
      if (o.parole < 400) {
        return { ok: false, suggerimento: `Il capitolo è troppo breve (${o.parole} parole): servono almeno 700 parole di testo continuo.` }
      }
      const problema = controllaCitazioni(o.esame, true)
      if (problema) return { ok: false, suggerimento: problema }
      return { ok: true }
    },
  })
}

function registraEsito(impianto: ImpiantoKey, o: OpzioneScritta) {
  stato().patchOpzione(impianto, {
    risultato: o.risultato,
    passaggi: o.passaggi,
    parole: o.parole,
    stato: 'ok',
    errore: null,
    valutazione: null,
    storico: {},
    rifinisce: null,
  })
  const { esame } = o
  logOk(
    'scrittore',
    `Opzione ${impianto}: ${o.parole} parole, ${esame.totali} citazioni (${esame.verificate} letterali, ${esame.approssimate} quasi letterali, ${esame.nonTrovate.length + esame.rifSconosciuti.length} non ritrovate).`,
  )
  for (const i of esame.incoerenze.slice(0, 5)) logAvviso('scrittore', `Opzione ${impianto} — ${i}.`)
}

function opzioneVuota(impianto: ImpiantoKey): Opzione {
  return {
    impianto,
    etichetta: IMPIANTI[impianto].etichetta,
    passaggi: [],
    risultato: null,
    parole: 0,
    stato: 'in_corso',
    errore: null,
    valutazione: null,
    storico: {},
    rifinisce: null,
  }
}

async function passoScrittore(
  token: number,
  signal: AbortSignal,
  prefisso: PrefissoScrittore,
  scaletta: Scaletta,
): Promise<void> {
  await allaPostazione('scrittore', token, 'scrivo le tre opzioni…')
  const impianti: ImpiantoKey[] = ['A', 'B', 'C']
  const s = stato()
  s.setPassoAttivo('capitolo')
  s.inizializzaOpzioni(impianti.map(opzioneVuota))

  // A scrive il prefisso in cache; B e C partono appena A ha cominciato a
  // generare, così lo rileggono dalla cache invece di riscriverlo.
  let segnala: () => void = () => {}
  const avvioA = new Promise<void>((r) => (segnala = r))
  const esiti = await Promise.allSettled([
    scriviOpzione('A', prefisso, scaletta, signal, segnala),
    avvioA.then(() => scriviOpzione('B', prefisso, scaletta, signal)),
    avvioA.then(() => scriviOpzione('C', prefisso, scaletta, signal)),
  ])
  if (scaduto(token)) return

  let riuscite = 0
  esiti.forEach((esito, indice) => {
    const impianto = impianti[indice]
    if (esito.status === 'fulfilled') {
      riuscite += 1
      registraEsito(impianto, esito.value)
    } else {
      if (isAbort(esito.reason)) return
      const messaggio = toApiError(esito.reason).message
      stato().patchOpzione(impianto, { stato: 'errore', errore: messaggio })
      logFallimento('scrittore', `Opzione ${impianto} non prodotta: ${messaggio}`)
    }
  })

  const prima = stato().opzioni.find((o) => o.stato === 'ok')
  if (prima) stato().setOpzioneAttiva(prima.impianto)

  stato().patchAgente('scrittore', {
    status: riuscite > 0 ? 'done' : 'error',
    microLabel: riuscite > 0 ? `${riuscite} opzioni su 3` : 'nessuna opzione prodotta',
    errore: riuscite > 0 ? null : 'Tutte e tre le opzioni sono fallite.',
  })
  ticker(`SCRITTORE ▲ ${riuscite}/3 OPZIONI`, riuscite === 3 ? '▲' : '▼')

  if (riuscite === 0) throw new ApiError('sconosciuto', 'Nessuna delle tre opzioni è stata prodotta.')
}

// ---------------------------------------------------------------------------
// Controllore
// ---------------------------------------------------------------------------

async function passoControllore(token: number, signal: AbortSignal, approvate: Fonte[], prefisso: PrefissoScrittore) {
  const opzioni = stato().opzioni.filter((o) => o.stato === 'ok')
  if (opzioni.length === 0) return

  await allaPostazione('controllore', token, 'verifico citazioni e opzioni…')
  const s = stato()

  const nonVerificate = s.fonti.filter((f) => !f.verificata)
  const senzaEstratti = approvate.filter((f) => f.estratti.length === 0).length
  const esitoUrl = [
    nonVerificate.length === 0
      ? `Tutte le ${s.fonti.length} fonti in uso hanno un URL confermato dalla ricerca web; quelle non confermate erano già state escluse.`
      : `Attenzione: ${nonVerificate.length} fonti hanno un URL non confermato.`,
    `${approvate.length - senzaEstratti} fonti approvate su ${approvate.length} hanno estratti confrontati con il testo della pagina scaricata.`,
  ].join(' ')

  // Controllo lessicale di supporto, riportato in console.
  const testoCompleto = opzioni
    .map((o) => o.risultato?.paragrafi.map((p) => `${p.titoletto} ${p.testo}`).join(' ') ?? '')
    .join(' ')
  const sospetti = segnalaSconfinamenti(testoCompleto)
  if (sospetti.length > 0) {
    logAvviso('controllore', `Termini fuori perimetro da verificare nel testo: ${sospetti.join(', ')}.`)
  }

  const citazioni = elencaCitazioni(opzioni, prefisso.riferimenti)
  const minimoGiudizi = Math.ceil(citazioni.length * 0.8)

  const consegna = await sorveglia<Consegna<RisultatoControllore>>({
    agente: 'controllore',
    passo: 'Controllore — verifica finale',
    signal,
    esegui: (_t, suggerimento) =>
      chiamataStrutturataStream<Consegna<RisultatoControllore>>({
        ...base(s.modelli.controllore, 16000, signal, 'controllore'),
        effort: 'medium',
        system: sistema(SYSTEM_CONTROLLORE, suggerimento),
        messages: [messaggioControllore(contesto(), approvate, opzioni, esitoUrl, citazioni)],
        schema: SCHEMA_CONTROLLORE,
      }),
    valida: (d) => {
      if (!passaggiValidi(d?.passaggi)) return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere almeno 3 passaggi.' }
      const r = d?.risultato
      if (!elencoNonVuoto(r?.checklist, 4)) {
        return { ok: false, suggerimento: 'La checklist deve contenere tutte e quattro le voci obbligatorie.' }
      }
      if (!elencoNonVuoto(r?.valutazioni, opzioni.length)) {
        return { ok: false, suggerimento: `Servono ${opzioni.length} valutazioni, una per ogni opzione prodotta.` }
      }
      if ((r?.giudizi ?? []).length < minimoGiudizi) {
        return {
          ok: false,
          suggerimento: `Hai giudicato ${(r?.giudizi ?? []).length} citazioni su ${citazioni.length}: serve un giudizio per ciascuna, con il suo id.`,
        }
      }
      return { ok: true }
    },
  })

  const finale = stato()
  finale.setReferto(consegna.risultato)
  finale.applicaGiudizi(consegna.risultato.giudizi ?? [])
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

  const deboli = (consegna.risultato.giudizi ?? []).filter((g) => g.giudizio !== 'supportata').length
  if (deboli > 0) logAvviso('controllore', `${deboli} citazioni giudicate deboli o non supportate: sono evidenziate nel testo.`)

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

const ORDINE: AgentKey[] = ['lettore', 'ricercatore', 'selettore', 'scrittore', 'controllore']

export async function avviaSquadra(riprendiDa?: AgentKey) {
  const iniziale = stato()

  if (!iniziale.apiKey.trim()) {
    iniziale.setErroreGlobale('Incolla la tua chiave API Anthropic nel pannello impostazioni.')
    return
  }
  if (!materialePronto(iniziale)) {
    iniziale.setErroreGlobale('Carica il materiale del corso e attendi che la lettura di tutti i file sia completata.')
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

  const store = stato()
  store.setErroreGlobale(null)
  store.setRipresaDa(null)
  store.setInEsecuzione(true)
  store.setCampanella(false)

  // Riprendendo da un agente si conservano i risultati già ottenuti.
  const daCapo = !riprendiDa
  if (daCapo) {
    store.nuovaEsecuzione()
    for (const k of AGENT_KEYS) {
      store.patchAgente(k, { status: 'idle', microLabel: '', passaggi: [], errore: null, arrived: false, tentativi: 0 })
    }
    store.setDossier(null)
    store.setInfoLettura(null)
    store.setFonti([], [])
    store.setSelezione([], [], true)
    store.azzeraApprovazione()
    store.setPrefissoScrittore(null)
    store.setScaletta(null)
    store.azzeraApprovazioneScaletta()
    store.inizializzaOpzioni([])
    store.setReferto(null)
    store.setPassoAttivo('ricerca')
  }

  // Il Controllore si siede per primo e resta attivo per tutto il processo.
  stato().patchAgente('controllore', { status: 'working', microLabel: 'sorveglio il processo…' })
  logInfo(null, daCapo ? 'Avvio della squadra.' : `Ripresa da: ${riprendiDa}.`)
  ticker('SEDUTA APERTA ● HARROW & VANCE SECURITIES', '●')

  try {
    const partenza = riprendiDa ? Math.max(0, ORDINE.indexOf(riprendiDa)) : 0

    // --- Lettore ---------------------------------------------------------
    let dossier = stato().dossier
    if (partenza <= 0 || !dossier) {
      dossier = await passoLettore(token, signal)
    }
    if (scaduto(token)) return

    // --- Ricerca, selezione e approvazione delle fonti --------------------
    let approvato = stato().approvazione === 'approvata' && partenza >= 3
    const fontiNuove = !approvato
    let giro = 0
    let serveRicerca = partenza <= 1 || stato().fonti.length === 0
    let motivoNuovoGiro: string | undefined
    let selezionePrecedente = ''

    while (!approvato && giro < MAX_GIRI_RICERCA) {
      giro += 1

      if (serveRicerca) {
        await passoRicercatore(token, signal, dossier, giro, motivoNuovoGiro)
        if (scaduto(token)) return
      }

      const selezione = await passoSelettore(
        token,
        signal,
        dossier,
        stato().fonti,
        stato().motivoRifiuto,
        selezionePrecedente,
        giro,
      )
      if (scaduto(token)) return

      selezionePrecedente = selezione.selezionate.map((v) => `- ${v.url}: ${v.motivo}`).join('\n')

      if (selezione.selezionate.length === 0 || !selezione.copertura_sufficiente) {
        if (giro >= MAX_GIRI_RICERCA) {
          logAvviso('selettore', "Numero massimo di giri raggiunto: procedo con quello che c'è.")
        } else {
          motivoNuovoGiro =
            selezione.selezionate.length === 0
              ? 'Nessuna fonte del giro precedente era abbastanza pertinente.'
              : 'Il Selettore ha giudicato insufficiente la copertura delle fonti.'
          logRiparazione('selettore', `Nuovo giro di ricerca: ${motivoNuovoGiro}`)
          serveRicerca = true
          stato().azzeraApprovazione()
          stato().patchAgente('selettore', { status: 'done', microLabel: 'servono altre fonti' })
          continue
        }
      }

      // --- Punto di approvazione umana ------------------------------------
      const attesa = stato()
      attesa.chiediApprovazione()
      attesa.setPassoAttivo('fonti')
      attesa.patchAgente('selettore', { status: 'waiting', microLabel: 'attendo la tua approvazione…' })
      logInfo('selettore', "In attesa dell'approvazione umana sulle fonti selezionate.")
      ticker('SELETTORE ● ATTESA APPROVAZIONE', '●')

      const decisione = await attendiDecisione(token, (s) => s.approvazione)
      if (scaduto(token) || decisione === 'annullata') return

      if (decisione === 'approvata') {
        approvato = true
        logOk('selettore', 'Selezione approvata dallo studente.')
        ticker('APPROVAZIONE ▲ FONTI CONFERMATE', '▲')
        stato().patchAgente('selettore', { status: 'done', microLabel: 'fonti approvate' })
      } else {
        const motivo = stato().motivoRifiuto
        logAvviso('selettore', `Selezione rifiutata${motivo ? `: ${motivo}` : '.'} Rivedo la scelta.`)
        ticker('APPROVAZIONE ▼ SELEZIONE RIFIUTATA', '▼')
        stato().azzeraApprovazione()
        serveRicerca = false
      }
    }

    if (!approvato) {
      const messaggio = 'Non si è arrivati a una selezione approvata entro il numero massimo di giri.'
      stato().setErroreGlobale(messaggio)
      logFallimento(null, messaggio)
      return
    }

    const approvate = fontiApprovate()

    // --- Prefisso dello Scrittore -----------------------------------------
    let prefisso = stato().prefissoScrittore
    if (fontiNuove || !prefisso) {
      prefisso = preparaPrefisso(dossier, approvate)
      const s = stato()
      s.setPrefissoScrittore(prefisso)
      s.setScaletta(null)
      s.azzeraApprovazioneScaletta()
      s.inizializzaOpzioni([])
      s.setReferto(null)
    }

    // --- Scaletta e approvazione ------------------------------------------
    let scaletta = stato().scaletta
    let scalettaOk = stato().approvazioneScaletta === 'approvata' && !!scaletta
    let giroScaletta = 0
    let motivoScaletta = ''

    while (!scalettaOk && giroScaletta < MAX_GIRI_SCALETTA) {
      giroScaletta += 1
      scaletta = await passoScaletta(token, signal, prefisso, giroScaletta > 1 ? scaletta : null, motivoScaletta, giroScaletta)
      if (scaduto(token)) return

      const attesa = stato()
      attesa.chiediApprovazioneScaletta()
      attesa.setPassoAttivo('scaletta')
      attesa.patchAgente('scrittore', { status: 'waiting', microLabel: 'attendo la tua approvazione della scaletta…' })
      logInfo('scrittore', "In attesa dell'approvazione umana sulla scaletta.")
      ticker('SCRITTORE ● ATTESA APPROVAZIONE SCALETTA', '●')

      const decisione = await attendiDecisione(token, (s) => s.approvazioneScaletta)
      if (scaduto(token) || decisione === 'annullata') return

      if (decisione === 'approvata') {
        scalettaOk = true
        scaletta = stato().scaletta
        logOk('scrittore', 'Scaletta approvata dallo studente.')
        ticker('APPROVAZIONE ▲ SCALETTA CONFERMATA', '▲')
      } else {
        motivoScaletta = stato().motivoRifiutoScaletta
        logAvviso('scrittore', `Scaletta rifiutata${motivoScaletta ? `: ${motivoScaletta}` : '.'} La rifaccio.`)
        ticker('APPROVAZIONE ▼ SCALETTA DA RIFARE', '▼')
        stato().azzeraApprovazioneScaletta()
      }
    }

    if (!scalettaOk || !scaletta) {
      const messaggio = 'Non si è arrivati a una scaletta approvata entro il numero massimo di giri.'
      stato().setErroreGlobale(messaggio)
      logFallimento(null, messaggio)
      return
    }

    // --- Scrittore e Controllore ------------------------------------------
    const giaScritte = partenza >= 4 && stato().opzioni.some((o) => o.stato === 'ok')
    if (!giaScritte) {
      await passoScrittore(token, signal, prefisso, scaletta)
      if (scaduto(token)) return
    }

    await passoControllore(token, signal, approvate, prefisso)
    if (scaduto(token)) return

    stato().setCampanella(true)
    stato().setPassoAttivo('capitolo')
    logOk(null, "Capitolo completato: scegli l'opzione che preferisci e rifinisci i paragrafi.")
    ticker('SEDUTA CHIUSA ▲ CAPITOLO PRONTO', '▲')
  } catch (err) {
    if (isAbort(err) || scaduto(token)) return

    const errore = toApiError(err)
    const agente = stato().agenteAttivo
    if (agente) {
      stato().patchAgente(agente, { status: 'error', microLabel: 'errore', errore: errore.message })
      stato().setRipresaDa(agente)
    }
    stato().setErroreGlobale(errore.message)
    logFallimento(agente, errore.message)
    ticker('ERRORE ▼ ESECUZIONE INTERROTTA', '▼')
  } finally {
    // I controlli tornano sempre utilizzabili, anche dopo un errore.
    if (!scaduto(token)) {
      const finale = stato()
      finale.setInEsecuzione(false)
      finale.setAgenteAttivo(null)
      if (finale.approvazione === 'in_attesa') finale.azzeraApprovazione()
      if (finale.approvazioneScaletta === 'in_attesa') finale.azzeraApprovazioneScaletta()
      if (finale.agenti.controllore.status === 'working') {
        finale.patchAgente('controllore', { status: 'done', microLabel: 'sorveglianza conclusa' })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Interventi sul capitolo già scritto
// ---------------------------------------------------------------------------

/** Rigenera una singola opzione fallita senza rifare il resto. */
export async function rigeneraOpzione(impianto: ImpiantoKey) {
  const s = stato()
  const { prefissoScrittore: prefisso, scaletta } = s
  if (!prefisso || !scaletta || s.inEsecuzione) return

  const locale = new AbortController()
  s.patchOpzione(impianto, { ...opzioneVuota(impianto) })
  s.patchAgente('scrittore', { status: 'working', microLabel: `riscrivo l'opzione ${impianto}…` })
  logInfo('scrittore', `Rigenerazione dell'opzione ${impianto}.`)

  try {
    registraEsito(impianto, await scriviOpzione(impianto, prefisso, scaletta, locale.signal))
    logOk('scrittore', `Opzione ${impianto} rigenerata.`)
  } catch (err) {
    const messaggio = toApiError(err).message
    stato().patchOpzione(impianto, { stato: 'errore', errore: messaggio })
    logFallimento('scrittore', `Rigenerazione dell'opzione ${impianto} fallita: ${messaggio}`)
  } finally {
    stato().patchAgente('scrittore', { status: 'done', microLabel: 'opzioni pronte' })
  }
}

function citazioniDaGiudicare(impianto: ImpiantoKey, indice: number, paragrafo: Paragrafo, prefisso: PrefissoScrittore) {
  const titoli = new Map(prefisso.riferimenti.map((r) => [r.etichetta, r.titolo]))
  return paragrafo.citazioni.map<CitazioneDaGiudicare>((c, ic) => ({
    id: `${impianto}.${indice + 1}.${ic + 1}`,
    rif: c.rif,
    titoloRif: titoli.get(c.rif) ?? 'riferimento sconosciuto',
    affermazione: c.affermazione,
    estratto: c.estratto,
    testuale: c.verifica?.testuale ?? 'non verificata',
  }))
}

/**
 * Riscrive un solo paragrafo secondo la richiesta dello studente. Le citazioni
 * nuove passano lo stesso controllo testuale e il giudizio del Controllore; la
 * versione precedente resta disponibile per l'annullamento.
 */
export async function rifinisciParagrafo(impianto: ImpiantoKey, indice: number, richiesta: string) {
  const s = stato()
  const opzione = s.opzioni.find((o) => o.impianto === impianto)
  const prefisso = s.prefissoScrittore
  if (!opzione?.risultato || !prefisso || !richiesta.trim()) return
  if (s.inEsecuzione || s.opzioni.some((o) => o.rifinisce !== null)) return
  if (!s.apiKey.trim()) {
    s.setErroreGlobale('Incolla la tua chiave API Anthropic nel pannello impostazioni.')
    return
  }

  const locale = new AbortController()
  const signal = locale.signal
  const numero = indice + 1
  s.patchOpzione(impianto, { rifinisce: indice })
  s.patchAgente('scrittore', { status: 'working', microLabel: `rifinisco il §${numero} dell'opzione ${impianto}…` })
  logInfo('scrittore', `Rifinitura del §${numero} (opzione ${impianto}): ${richiesta.trim()}`)

  try {
    const allegati = pdfScansionati()
    const rifinito = await sorveglia<{ passaggi: string[]; paragrafo: Paragrafo; esame: EsameParagrafi }>({
      agente: 'scrittore',
      passo: `Scrittore — rifinitura §${numero} ${impianto}`,
      signal,
      esegui: async (_t, suggerimento) => {
        const d = await chiamataStrutturataStream<Consegna<Paragrafo>>({
          ...base(s.modelli.scrittore, 6000, signal, 'scrittore'),
          effort: 'high',
          system: SISTEMA_SCRITTORE,
          messages: [
            messaggioScrittore(
              prefisso,
              allegati,
              istruzioneRifinitura(stato().scaletta, opzione, indice, richiesta, suggerimento),
            ),
          ],
          schema: SCHEMA_PARAGRAFO,
        })
        const [paragrafo] = verificaParagrafi([normalizzaParagrafo(d?.risultato)], prefisso)
        return { passaggi: d?.passaggi ?? [], paragrafo, esame: esaminaParagrafi([paragrafo]) }
      },
      valida: (r) => {
        if (!testoSostanzioso(r.paragrafo.titoletto, 3)) return { ok: false, suggerimento: 'Manca il titoletto del paragrafo.' }
        if (contaParole([r.paragrafo]) < 60) return { ok: false, suggerimento: 'Il paragrafo è troppo breve: servono almeno 60 parole.' }
        const problema = controllaCitazioni(r.esame, false)
        if (problema) return { ok: false, suggerimento: problema }
        return { ok: true }
      },
    })

    let paragrafo = rifinito.paragrafo

    // Giudizio del Controllore sulle sole citazioni nuove: se fallisce, il
    // paragrafo resta valido con il solo controllo testuale.
    if (paragrafo.citazioni.length > 0) {
      stato().patchAgente('controllore', { status: 'working', microLabel: `verifico le citazioni del §${numero}…` })
      try {
        const daGiudicare = citazioniDaGiudicare(impianto, indice, paragrafo, prefisso)
        const esito = await sorveglia<Consegna<{ giudizi: GiudizioCitazione[] }>>({
          agente: 'controllore',
          passo: `Controllore — citazioni §${numero} ${impianto}`,
          signal,
          esegui: (_t, suggerimento) =>
            chiamataStrutturata<Consegna<{ giudizi: GiudizioCitazione[] }>>({
              ...base(s.modelli.controllore, 3000, signal, 'controllore'),
              effort: 'low',
              system: sistema(SYSTEM_CONTROLLORE, suggerimento),
              messages: [messaggioGiudizi(paragrafo, daGiudicare)],
              schema: SCHEMA_GIUDIZI,
            }),
          valida: (d) =>
            Array.isArray(d?.risultato?.giudizi)
              ? { ok: true }
              : { ok: false, suggerimento: 'Manca l\'elenco "giudizi".' },
        })
        const perId = new Map(esito.risultato.giudizi.map((g) => [g.id.trim().toUpperCase(), g]))
        paragrafo = {
          ...paragrafo,
          citazioni: paragrafo.citazioni.map((c, ic) => {
            const g = perId.get(`${impianto}.${numero}.${ic + 1}`)
            return g ? { ...c, verifica: { testuale: c.verifica?.testuale ?? 'non_trovato', giudizio: g.giudizio, nota: g.nota } } : c
          }),
        }
      } catch (err) {
        if (isAbort(err)) throw err
        logAvviso('controllore', `Giudizio sulle citazioni del §${numero} non disponibile: ${toApiError(err).message}`)
      } finally {
        stato().patchAgente('controllore', { status: 'done', microLabel: 'controllo completato' })
      }
    }

    stato().patchParagrafo(impianto, indice, paragrafo)
    logOk('scrittore', `§${numero} dell'opzione ${impianto} rifinito: la versione precedente resta recuperabile con "Annulla".`)
    ticker(`SCRITTORE ▲ §${numero} RIFINITO`, '▲')
  } catch (err) {
    if (isAbort(err)) return
    const messaggio = toApiError(err).message
    stato().setErroreGlobale(`Rifinitura non riuscita: ${messaggio}`)
    logFallimento('scrittore', `Rifinitura del §${numero} fallita: ${messaggio}`)
  } finally {
    stato().patchOpzione(impianto, { rifinisce: null })
    stato().patchAgente('scrittore', { status: 'done', microLabel: 'opzioni pronte' })
  }
}

// ---------------------------------------------------------------------------
// Chat sul progetto
// ---------------------------------------------------------------------------

function riepilogoCosti(s: StudioState): string {
  if (s.usi.length === 0) return 'nessuna chiamata registrata'
  const perAgente = new Map<string, number>()
  for (const u of s.usi) {
    if (u.esecuzione !== s.esecuzione) continue
    perAgente.set(u.chi, (perAgente.get(u.chi) ?? 0) + u.costo)
  }
  const dettaglio = [...perAgente.entries()].map(([k, v]) => `${k} ${formattaDollari(v)}`).join(', ')
  return `ultima esecuzione ${formattaDollari(costoTotale(s.usi, s.esecuzione))} (${dettaglio || 'nessun dettaglio'}); totale registrato ${formattaDollari(costoTotale(s.usi))}. Stime da listino, non fatturazione ufficiale.`
}

export async function inviaMessaggioChat(testo: string) {
  const s = stato()
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
    const attuale = stato()

    const statiAgenti = AGENT_KEYS.map((k) => {
      const a = attuale.agenti[k]
      return `- ${k}: ${a.status}${a.microLabel ? ` (${a.microLabel})` : ''}${a.errore ? ` — errore: ${a.errore}` : ''}`
    }).join('\n')

    const console20 = attuale.log
      .slice(-20)
      .map((l) => `[${new Date(l.at).toLocaleTimeString('it-IT')}] ${l.kind.toUpperCase()} ${l.messaggio}`)
      .join('\n')

    const approvazione = [
      attuale.approvazione === 'in_attesa'
        ? `fonti: in attesa della decisione dello studente (giro ${attuale.giroApprovazione})`
        : `fonti: ${attuale.storicoApprovazioni.join(' | ') || 'non ancora richiesta'}`,
      attuale.approvazioneScaletta === 'in_attesa'
        ? `scaletta: in attesa della decisione (giro ${attuale.giroScaletta})`
        : `scaletta: ${attuale.storicoScaletta.join(' | ') || 'non ancora richiesta'}`,
    ].join(' · ')

    // Il contesto sta nel system e viene rigenerato a ogni domanda.
    const system = [
      { type: 'text' as const, text: SYSTEM_CHAT_BASE },
      {
        type: 'text' as const,
        text: contestoChat({
          argomento: attuale.argomento,
          capitolo: attuale.capitolo,
          dossier: attuale.dossier,
          riepilogoCaso: riepilogoCaso(attuale.caseFiles),
          fontiApprovate: calcolaFontiApprovate(attuale.fonti, attuale.selezionate),
          scaletta: attuale.scaletta,
          opzioni: attuale.opzioni,
          statiAgenti,
          console: console20,
          approvazione,
          costi: riepilogoCosti(attuale),
        }),
      },
    ]

    segnalaInizioChiamata()
    let risposta: string
    try {
      risposta = await chiamataChatStream({
        client: creaClient(attuale.apiKey),
        model: attuale.modelli.chat,
        maxTokens: 4000,
        effort: 'medium',
        chi: 'chat',
        system,
        messages: attuale.chat.map((m) => ({ role: m.role, content: m.content })),
        signal: locale.signal,
        onTesto: (frammento) => {
          const ora = stato()
          ora.setChatParziale(ora.chatParziale + frammento)
        },
      })
    } finally {
      segnalaFineChiamata()
    }

    if (!risposta) throw new ApiError('sconosciuto', "L'assistente ha risposto senza contenuto.")

    stato().aggiungiChat({ role: 'assistant', content: risposta })
    stato().setChatParziale('')
    logOk(null, 'Risposta della chat ricevuta.')
  } catch (err) {
    const messaggio = toApiError(err).message
    stato().setChatErrore(messaggio)
    stato().setChatParziale('')
    logFallimento(null, `Chat: ${messaggio}`)
  } finally {
    stato().setChatInCorso(false)
  }
}
