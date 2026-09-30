import type Anthropic from '@anthropic-ai/sdk'
import type {
  CaseFile,
  CourseFile,
  Fonte,
  ImpiantoKey,
  Opzione,
  Paragrafo,
  Passaggio,
  PrefissoScrittore,
  Riferimento,
  RisultatoLettore,
  Scaletta,
} from '../types'
import { collocazione } from './corpus'

export const ARGOMENTO_PREDEFINITO =
  'Il rischio climatico come componente del rischio operativo e finanziario in un business fortemente stagionale: il caso Miraya Beach Park, analizzato su più stagioni.'

export const CAPITOLO_PREDEFINITO =
  "Capitolo 2 — Il rischio operativo e la leva operativa in un'attività stagionale"

/** Vincolo di materia condiviso da tutti e cinque gli agenti e dalla chat. */
export const SUBJECT_GUARDRAIL = `VINCOLO DI MATERIA (vale sempre, senza eccezioni)
Resta esclusivamente nell'ambito della Finanza Aziendale, come definito dal materiale del corso allegato. Non trattare Ragioneria (bilancio in senso contabile/normativo, principi contabili) né Diritto Commerciale o Privato (forme societarie, responsabilità degli amministratori, normativa concorsuale). Se una fonte o un'informazione riguarda principalmente questi ambiti, scartala e dillo esplicitamente.

Criterio operativo: se un tema non è trattato nel materiale del corso caricato, non trattarlo, nemmeno come sfondo o cenno introduttivo.`

export const VINCOLO_STAGIONI = `VINCOLO SULL'ORIZZONTE TEMPORALE
L'analisi deve basarsi su PIÙ STAGIONI, non su una sola: usa serie pluriennali (dati meteo storici e risultati per evento su più stagioni) e ragiona sulla variabilità fra una stagione e l'altra. Un'analisi che si fermasse a una singola stagione è incompleta.`

const FORMATO_PASSAGGI = `Nel campo "passaggi" scrivi il metodo che hai seguito, diviso in passaggi brevi e autonomi (da 3 a 6), rivolti allo studente: servono a fargli capire come sei arrivato al risultato. Ogni passaggio è una frase compiuta, leggibile da sola.`

const REGOLE_CITAZIONE = `REGOLE DI CITAZIONE (verificate in codice, parola per parola)
- Ogni affermazione che deriva da una fonte o dal corso è seguita dal marcatore del riferimento: [F1], [F2]… per le fonti approvate, [C1], [C2]… per i passaggi del corso.
- Per ogni marcatore aggiungi una voce in "citazioni" con: "rif" (l'etichetta), "affermazione" (la frase che sostieni) ed "estratto".
- L'"estratto" è un passo COPIATO ALLA LETTERA dal testo di quel riferimento, così come appare qui sotto: niente parafrasi, niente traduzioni, niente riassunti. Può essere una parte di una frase, purché letterale.
- Per le fonti web puoi citare solo i loro "estratti verificati": non hai altro testo di quelle pagine.
- Non attribuire a un riferimento qualcosa che il suo testo non dice. Se non hai un appoggio testuale, scrivi l'affermazione come tua argomentazione, senza marcatore.`

// ---------------------------------------------------------------------------
// Contesto condiviso
// ---------------------------------------------------------------------------

/** Tetto sui PDF scansionati allegati per intero (base64), sotto i 32 MB di una richiesta. */
const MAX_PDF_SCANSIONATI = 20_000_000

export interface ContestoProgetto {
  argomento: string
  capitolo: string
  courseFiles: CourseFile[]
  caseFiles: CaseFile[]
}

/** I PDF scansionati non hanno testo estraibile: si allegano interi e li legge il modello. */
export function blocchiPdfScansionati(courseFiles: CourseFile[]): {
  blocchi: Anthropic.ContentBlockParam[]
  saltati: string[]
} {
  const blocchi: Anthropic.ContentBlockParam[] = []
  const saltati: string[] = []
  let budget = MAX_PDF_SCANSIONATI
  for (const f of courseFiles) {
    if (!f.scansionato || f.status !== 'pronto') continue
    if (!f.base64 || f.base64.length > budget) {
      saltati.push(f.name)
      continue
    }
    budget -= f.base64.length
    blocchi.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: f.base64 },
      title: f.name,
    })
  }
  return { blocchi, saltati }
}

export function riepilogoCaso(caseFiles: CaseFile[]): string {
  const pronti = caseFiles.filter((f) => f.status === 'pronto')
  if (pronti.length === 0) {
    return "(nessun dato del caso caricato: il Ricercatore potrà trovare solo dati meteo pubblici e letteratura, non i dati privati dell'attività)"
  }
  return pronti.map((f) => f.riepilogo).join('\n\n')
}

export function intestazioneProgetto(ctx: ContestoProgetto): string {
  return [
    `ARGOMENTO DELLA TESI (deciso dallo studente, non modificabile):\n"""\n${ctx.argomento.trim()}\n"""`,
    `CAPITOLO O SEZIONE DA SCRIVERE:\n"""\n${ctx.capitolo.trim()}\n"""`,
    `DATI DEL CASO (più stagioni, privati, non reperibili online):\n"""\n${riepilogoCaso(ctx.caseFiles)}\n"""`,
  ].join('\n\n')
}

export function dossierTestuale(dossier: RisultatoLettore | null): string {
  if (!dossier) return '(dossier non disponibile)'
  return [
    'CONCETTI CHIAVE DEL CORSO:',
    ...dossier.concetti_chiave.map((c) => `- ${c.termine}: ${c.definizione} (${c.lezione_di_riferimento})`),
    '',
    "COLLEGAMENTI CON L'ARGOMENTO:",
    ...dossier.collegamenti_argomento.map((c) => `- ${c}`),
    '',
    'METRICHE APPLICABILI (del corso, non indici contabili):',
    ...dossier.metriche_applicabili.map((m) => `- ${m}`),
    '',
    `SINTESI DEI DATI DEL CASO:\n${dossier.sintesi_dati_caso}`,
  ].join('\n')
}

function elencoPassaggi(passaggi: Passaggio[], prefisso = 'C'): string {
  return passaggi
    .map((p, i) => `[${prefisso}${i + 1}] ${collocazione(p)}\n${p.testo}`)
    .join('\n\n---\n\n')
}

export function elencoFonti(fonti: Fonte[], conEstratti = false): string {
  if (fonti.length === 0) return '(nessuna fonte)'
  return fonti
    .map((f, i) => {
      const righe = [
        `${i + 1}. [${f.tipo}] ${f.titolo}`,
        `   URL: ${f.url}`,
        `   Contenuto: ${f.descrizione}`,
        `   Rilevanza: ${f.perche_rilevante}`,
        `   Pagina letta: ${f.letta ? 'sì' : 'no'} · Estratti verificati: ${f.estratti.length}`,
      ]
      if (conEstratti) f.estratti.forEach((e) => righe.push(`   > "${e}"`))
      return righe.join('\n')
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function system(corpo: string): string {
  return `${corpo}\n\n${SUBJECT_GUARDRAIL}\n\n${FORMATO_PASSAGGI}`
}

export const SYSTEM_LETTORE = system(
  `Sei il "Lettore", primo agente di una squadra che aiuta uno studente a scrivere un capitolo della sua tesi di laurea triennale in Finanza Aziendale.
Ricevi l'argomento, i passaggi del materiale del corso più pertinenti (ognuno con file e pagine) e il riepilogo dei dati privati del caso.
Produci un DOSSIER DEL CORSO per tutta la squadra: concetti chiave con la definizione usata a lezione, collegamenti fra argomento e materiale, metriche applicabili e sintesi dei dati del caso.
Nel campo "lezione_di_riferimento" indica file e pagine del passaggio da cui viene il concetto.
Le metriche devono essere quelle di Finanza Aziendale del corso (per esempio grado di leva operativa, leva finanziaria, misure di rischio e rendimento), non indici di bilancio in senso contabile.
Non inventare contenuti che non sono nel materiale: se un concetto necessario manca, dillo nei collegamenti.

${VINCOLO_STAGIONI}`,
)

export const SYSTEM_RICERCATORE = system(
  `Sei il "Ricercatore", secondo agente della squadra.
Hai due strumenti e devi usarli davvero:
1. web_search, per trovare le fonti. È vietato riportare una fonte che non provenga dai risultati: ogni URL va copiato esattamente da un risultato.
2. web_fetch, per LEGGERE le pagine delle fonti che intendi riportare. Leggi ogni fonte prima di consegnarla.
Per ogni fonte riporta da 2 a 5 "estratti": passi copiati carattere per carattere dal testo della pagina letta (dati, definizioni, risultati utili al capitolo). Gli estratti vengono confrontati in codice con il testo scaricato: quelli non letterali vengono scartati.
Preferisci pagine HTML, abstract e schede di dataset ai PDF molto lunghi, che costano molto da leggere.
Cerca: letteratura accademica sul rischio climatico e meteorologico nelle attività stagionali, serie storiche meteo pluriennali per l'area del caso, dati di settore sul turismo balneare e sui parchi acquatici, studi sul rischio operativo e sulla leva operativa. Fai più ricerche mirate, in italiano e in inglese.
Scarta le fonti prevalentemente contabili, normative o giuridiche e dichiarale in "fonti_scartate" con il motivo.
Quando hai finito, chiama submit_ricercatore: è l'unico modo di consegnare. Punta a 5-7 fonti solide.

${VINCOLO_STAGIONI}`,
)

export const SYSTEM_SELETTORE = system(
  `Sei il "Selettore", terzo agente della squadra.
Ricevi le fonti trovate dal Ricercatore: contengono solo URL verificati, con gli estratti confermati in codice. Tieni SOLO quelle davvero utili al capitolo.
Criteri, in ordine: aderenza alla sola Finanza Aziendale come definita dal materiale del corso; pertinenza; autorevolezza; utilità per un'analisi su più stagioni; presenza di estratti verificati (una fonte senza estratti non potrà essere citata); assenza di doppioni.
Una fonte autorevole ma prevalentemente contabile, normativa o giuridica va scartata, e il motivo va scritto.
Non aggiungere fonti che non siano nell'elenco e non modificarne gli URL.
Imposta "copertura_sufficiente" a false se le fonti pertinenti non bastano: il Ricercatore farà un nuovo giro.

${VINCOLO_STAGIONI}`,
)

/** Identico per tutte le chiamate dello Scrittore: fa parte del prefisso in cache. */
export const SYSTEM_SCRITTORE = system(
  `Sei lo "Scrittore", quarto agente della squadra.
Scrivi in italiano accademico universitario, adatto a una tesi di laurea triennale in Finanza Aziendale.
Usi solo i riferimenti forniti: le fonti approvate dallo studente (F1, F2…) e i passaggi del materiale del corso (C1, C2…), oltre al dossier e ai dati del caso.
Non inserire affermazioni fattuali che nessun riferimento sostiene.
Le istruzioni specifiche di ogni richiesta (scaletta, stesura, rifinitura) arrivano in fondo al messaggio.

${REGOLE_CITAZIONE}

${VINCOLO_STAGIONI}`,
)

export const SYSTEM_CONTROLLORE = system(
  `Sei il "Controllore", quinto agente della squadra: sorvegli la qualità del lavoro degli altri.
Sei severo ma utile: segnali problemi specifici, con il punto preciso in cui si trovano, mai giudizi generici.
Compili una checklist con quattro voci obbligatorie, ognuna con il proprio id:
- "fonti_verificate": le fonti usate hanno URL confermato dalla ricerca (fidati del controllo automatico che ricevi);
- "perimetro_materia": nessuno sconfinamento in Ragioneria o in Diritto Commerciale/Privato; se ne trovi, indica agente e punto;
- "coerenza_fonti": le affermazioni delle opzioni sono sostenute dalle fonti approvate;
- "piu_stagioni": l'argomento è trattato su più stagioni e non su una sola.
Valuti separatamente ciascuna opzione (punti di forza e criticità): un problema in una non penalizza le altre.
Per OGNI citazione ricevuta dai un giudizio: "supportata" se l'estratto sostiene davvero l'affermazione, "parziale" se la sostiene solo in parte o l'affermazione va oltre, "non_supportata" se non la sostiene. Il controllo automatico ti dice già se l'estratto è letterale; tu giudichi il significato.
Nel campo "agente" indica a chi attribuire il problema, oppure "nessuno".

${VINCOLO_STAGIONI}`,
)

// ---------------------------------------------------------------------------
// Messaggi utente
// ---------------------------------------------------------------------------

export function messaggioLettore(ctx: ContestoProgetto, passaggi: Passaggio[]): Anthropic.MessageParam {
  const { blocchi, saltati } = blocchiPdfScansionati(ctx.courseFiles)
  const file = new Set(passaggi.map((p) => p.file))
  const parti = [
    intestazioneProgetto(ctx),
    `PASSAGGI DEL MATERIALE DEL CORSO (${passaggi.length}, da ${file.size} file, selezionati per pertinenza):\n"""\n${elencoPassaggi(passaggi)}\n"""`,
  ]
  if (blocchi.length > 0) parti.push('Sono allegati anche PDF scansionati, senza testo estraibile: leggili dalle immagini.')
  if (saltati.length > 0) parti.push(`NOTA: questi PDF scansionati non sono allegati per limiti di dimensione: ${saltati.join(', ')}.`)
  parti.push('COMPITO: produci il dossier che userà tutta la squadra.')
  return { role: 'user', content: [...blocchi, { type: 'text', text: parti.join('\n\n') }] }
}

export function messaggioRicercatore(
  ctx: ContestoProgetto,
  dossier: RisultatoLettore | null,
  motivoNuovoGiro?: string,
): Anthropic.MessageParam {
  const parti = [intestazioneProgetto(ctx), `DOSSIER DEL CORSO:\n"""\n${dossierTestuale(dossier)}\n"""`]
  if (motivoNuovoGiro) {
    parti.push(
      `NUOVO GIRO DI RICERCA. Il giro precedente non è bastato:\n"""\n${motivoNuovoGiro}\n"""\nCerca fonti NUOVE e diverse, con query differenti e più mirate.`,
    )
  }
  parti.push('COMPITO: cerca, leggi le pagine e consegna le fonti con gli estratti letterali chiamando submit_ricercatore.')
  return { role: 'user', content: parti.join('\n\n') }
}

export function messaggioSelettore(
  ctx: ContestoProgetto,
  dossier: RisultatoLettore | null,
  fonti: Fonte[],
  motivoRifiuto: string,
  selezionePrecedente: string,
): Anthropic.MessageParam {
  const parti = [
    intestazioneProgetto(ctx),
    `DOSSIER DEL CORSO:\n"""\n${dossierTestuale(dossier)}\n"""`,
    `FONTI TROVATE DAL RICERCATORE (URL ed estratti verificati in codice):\n"""\n${elencoFonti(fonti, true)}\n"""`,
  ]
  if (motivoRifiuto || selezionePrecedente) {
    parti.push(
      `LA TUA SELEZIONE PRECEDENTE È STATA RIFIUTATA DALLO STUDENTE.\nSelezione precedente:\n"""\n${selezionePrecedente || '(non disponibile)'}\n"""\nMotivo:\n"""\n${motivoRifiuto.trim() || '(nessun motivo specificato: rivedi comunque la scelta con occhio critico e cambia qualcosa)'}\n"""\nCOMPITO: rivedi la selezione tenendo conto del motivo, scegliendo solo fra le fonti qui sopra.`,
    )
  } else {
    parti.push('COMPITO: seleziona le fonti da usare per il capitolo e motiva ogni scelta.')
  }
  return { role: 'user', content: parti.join('\n\n') }
}

/**
 * Prefisso comune a tutte le chiamate dello Scrittore. Viene costruito una
 * volta, conservato e riusato identico: è la condizione perché il prompt
 * caching funzioni fra scaletta, tre opzioni e rifiniture.
 */
export function costruisciPrefisso(
  ctx: ContestoProgetto,
  dossier: RisultatoLettore | null,
  fonti: Fonte[],
  passaggi: Passaggio[],
): PrefissoScrittore {
  const riferimenti: Riferimento[] = [
    ...fonti.map((f, i) => ({
      etichetta: `F${i + 1}`,
      tipo: 'fonte' as const,
      titolo: f.titolo,
      collocazione: f.url,
      testo: f.estratti.join('\n'),
    })),
    ...passaggi.map((p, i) => ({
      etichetta: `C${i + 1}`,
      tipo: 'corso' as const,
      titolo: p.file,
      collocazione: collocazione(p),
      testo: p.testo,
    })),
  ]

  const blocchiFonti = fonti
    .map((f, i) => {
      const estratti =
        f.estratti.length > 0
          ? f.estratti.map((e) => `  > "${e}"`).join('\n')
          : '  (nessun estratto verificato: questa fonte non può essere citata)'
      return `[F${i + 1}] ${f.titolo} (${f.tipo})\n  URL: ${f.url}\n  Estratti verificati:\n${estratti}`
    })
    .join('\n\n')

  const testo = [
    intestazioneProgetto(ctx),
    `DOSSIER DEL CORSO:\n"""\n${dossierTestuale(dossier)}\n"""`,
    `FONTI APPROVATE DALLO STUDENTE (citabili solo attraverso i loro estratti verificati):\n"""\n${blocchiFonti || '(nessuna)'}\n"""`,
    `PASSAGGI DEL MATERIALE DEL CORSO (citabili alla lettera):\n"""\n${elencoPassaggi(passaggi)}\n"""`,
  ].join('\n\n')

  return { testo, riferimenti }
}

/** Messaggio dello Scrittore: prefisso in cache più l'istruzione variabile in fondo. */
export function messaggioScrittore(
  prefisso: PrefissoScrittore,
  pdfScansionati: Anthropic.ContentBlockParam[],
  istruzione: string,
): Anthropic.MessageParam {
  return {
    role: 'user',
    content: [
      ...pdfScansionati,
      { type: 'text', text: prefisso.testo, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: istruzione },
    ],
  }
}

function testoScaletta(s: Scaletta): string {
  return [
    `Titolo: ${s.titolo_capitolo}`,
    ...s.sezioni.map(
      (sez, i) =>
        `${i + 1}. ${sez.titoletto} — ${sez.obiettivo}\n${sez.punti.map((p) => `   • ${p}`).join('\n')}${
          sez.riferimenti.length > 0 ? `\n   Riferimenti previsti: ${sez.riferimenti.join(', ')}` : ''
        }`,
    ),
    `Nota di metodo: ${s.nota_metodo}`,
  ].join('\n')
}

export function istruzioneScaletta(motivoRifiuto: string, precedente: Scaletta | null, suggerimento: string): string {
  const parti = [
    'COMPITO: proponi la SCALETTA del capitolo indicato sopra: titolo, da 4 a 7 sezioni con titoletto, obiettivo, punti da sviluppare e riferimenti previsti (F… e C…). Non scrivere ancora il testo.',
  ]
  if (precedente) {
    parti.push(
      `La scaletta precedente è stata RIFIUTATA dallo studente.\nScaletta precedente:\n"""\n${testoScaletta(precedente)}\n"""\nMotivo:\n"""\n${motivoRifiuto.trim() || '(nessun motivo specificato: proponi un impianto diverso)'}\n"""`,
    )
  }
  if (suggerimento) parti.push(suggerimento)
  return parti.join('\n\n')
}

export const IMPIANTI: Record<ImpiantoKey, { etichetta: string; istruzione: string }> = {
  A: {
    etichetta: 'Impianto teorico-deduttivo',
    istruzione:
      'Imposta il capitolo in modo teorico-deduttivo: parti dalla teoria del corso (definizioni, modelli, relazioni fra le grandezze) e scendi al caso, che serve come applicazione.',
  },
  B: {
    etichetta: 'Impianto empirico',
    istruzione:
      'Imposta il capitolo in modo empirico: parti da ciò che mostrano i dati del caso sulle diverse stagioni e interpretalo con gli strumenti teorici del corso.',
  },
  C: {
    etichetta: 'Impianto critico-comparativo',
    istruzione:
      'Imposta il capitolo in modo critico-comparativo: confronta approcci diversi alla lettura del rischio in contesti stagionali, discutine limiti e ipotesi implicite.',
  },
}

export function istruzioneOpzione(scaletta: Scaletta, impianto: ImpiantoKey, suggerimento: string): string {
  return [
    `SCALETTA APPROVATA DALLO STUDENTE (seguine le sezioni, nello stesso ordine e con gli stessi titoletti):\n"""\n${testoScaletta(scaletta)}\n"""`,
    `IMPOSTAZIONE RICHIESTA — ${IMPIANTI[impianto].etichetta}\n${IMPIANTI[impianto].istruzione} L'impostazione cambia l'argomentazione dentro le sezioni, non la loro sequenza.`,
    'COMPITO: scrivi il capitolo completo, un paragrafo per sezione della scaletta, almeno 700 parole in tutto, rispettando le regole di citazione.',
    suggerimento,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function istruzioneRifinitura(
  scaletta: Scaletta | null,
  opzione: Opzione,
  indice: number,
  richiesta: string,
  suggerimento: string,
): string {
  const paragrafi = opzione.risultato?.paragrafi ?? []
  const contesto = paragrafi
    .map((p, i) => `${i === indice ? '>>> PARAGRAFO DA RIFINIRE <<<\n' : ''}### ${p.titoletto}\n${p.testo}`)
    .join('\n\n')
  const attuale = paragrafi[indice]

  return [
    scaletta ? `SCALETTA APPROVATA:\n"""\n${testoScaletta(scaletta)}\n"""` : '',
    `CAPITOLO ATTUALE (${opzione.etichetta}):\n"""\n${contesto}\n"""`,
    attuale
      ? `CITAZIONI ATTUALI DEL PARAGRAFO:\n${attuale.citazioni.map((c) => `- [${c.rif}] "${c.estratto}"`).join('\n') || '(nessuna)'}`
      : '',
    `RICHIESTA DELLO STUDENTE PER IL PARAGRAFO "${attuale?.titoletto ?? ''}":\n"""\n${richiesta.trim()}\n"""`,
    'COMPITO: riscrivi SOLO quel paragrafo secondo la richiesta, mantenendo il titoletto (salvo richiesta contraria), il registro accademico e le regole di citazione. Restituisci il paragrafo con le sue citazioni.',
    suggerimento,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export interface CitazioneDaGiudicare {
  id: string
  rif: string
  titoloRif: string
  affermazione: string
  estratto: string
  testuale: string
}

export function elencaCitazioni(opzioni: Opzione[], riferimenti: Riferimento[]): CitazioneDaGiudicare[] {
  const perEtichetta = new Map(riferimenti.map((r) => [r.etichetta, r]))
  const elenco: CitazioneDaGiudicare[] = []
  for (const o of opzioni) {
    o.risultato?.paragrafi.forEach((p, ip) =>
      p.citazioni.forEach((c, ic) =>
        elenco.push({
          id: `${o.impianto}.${ip + 1}.${ic + 1}`,
          rif: c.rif,
          titoloRif: perEtichetta.get(c.rif.toUpperCase())?.titolo ?? 'riferimento sconosciuto',
          affermazione: c.affermazione,
          estratto: c.estratto,
          testuale: c.verifica?.testuale ?? 'non verificata',
        }),
      ),
    )
  }
  return elenco
}

function testoCitazioni(citazioni: CitazioneDaGiudicare[]): string {
  return citazioni
    .map(
      (c) =>
        `[${c.id}] rif ${c.rif} (${c.titoloRif}) · controllo testuale: ${c.testuale}\n  Affermazione: ${c.affermazione}\n  Estratto: "${c.estratto}"`,
    )
    .join('\n')
}

export function messaggioControllore(
  ctx: ContestoProgetto,
  fontiApprovate: Fonte[],
  opzioni: Opzione[],
  esitoUrl: string,
  citazioni: CitazioneDaGiudicare[],
): Anthropic.MessageParam {
  const testoOpzioni = opzioni
    .map((o) => {
      if (!o.risultato) return `[OPZIONE ${o.impianto}] non prodotta: ${o.errore ?? 'errore sconosciuto'}`
      const corpo = o.risultato.paragrafi.map((p, i) => `§${i + 1} ${p.titoletto}\n${p.testo}`).join('\n\n')
      return `[OPZIONE ${o.impianto}] ${o.etichetta} — "${o.risultato.titolo}" (${o.parole} parole)\n${corpo}`
    })
    .join('\n\n---\n\n')

  return {
    role: 'user',
    content: [
      intestazioneProgetto(ctx),
      `FONTI APPROVATE:\n"""\n${elencoFonti(fontiApprovate)}\n"""`,
      `CONTROLLO AUTOMATICO DEGLI URL (eseguito in codice):\n${esitoUrl}`,
      `OPZIONI PRODOTTE DALLO SCRITTORE:\n"""\n${testoOpzioni}\n"""`,
      `CITAZIONI DA GIUDICARE (${citazioni.length}, una per una, con il loro id):\n"""\n${testoCitazioni(citazioni) || '(nessuna)'}\n"""`,
      'COMPITO: compila la checklist a quattro voci, valuta separatamente ogni opzione prodotta e dai un giudizio a ogni citazione.',
    ].join('\n\n'),
  }
}

export function messaggioGiudizi(paragrafo: Paragrafo, citazioni: CitazioneDaGiudicare[]): Anthropic.MessageParam {
  return {
    role: 'user',
    content: [
      `PARAGRAFO RIFINITO — ${paragrafo.titoletto}:\n"""\n${paragrafo.testo}\n"""`,
      `CITAZIONI DA GIUDICARE:\n"""\n${testoCitazioni(citazioni) || '(nessuna)'}\n"""`,
      'COMPITO: dai un giudizio a ogni citazione di questo paragrafo.',
    ].join('\n\n'),
  }
}

// ---------------------------------------------------------------------------
// Chat sul progetto
// ---------------------------------------------------------------------------

export const SYSTEM_CHAT_BASE = `Sei l'assistente di "Studio tesi", un'applicazione in cui cinque agenti AI aiutano uno studente a scrivere un capitolo della sua tesi di laurea triennale in Finanza Aziendale.
Sei un esperto di Finanza Aziendale e di scrittura accademica e conosci questo specifico progetto: ne ricevi lo stato aggiornato a ogni domanda.

Rispondi in italiano, entrando nel merito, a tre famiglie di domande:
1. MERITO DELLA TESI: contenuti del materiale del corso e dei dati del caso, solidità delle fonti, scaletta, quale delle tre opzioni è più solida e perché, obiezioni prevedibili del relatore, quali altre fonti cercare.
2. STATO DELL'ESECUZIONE: cosa sta facendo ogni agente, perché il Selettore ha rifatto la scelta, a che punto è l'approvazione.
3. PROCESSI TECNICI: cosa dice la console, perché una chiamata è stata ritentata, cosa significa una citazione non verificata, quanto è costata l'esecuzione.

Usa lo stato del progetto come unica fonte di verità: non inventare fonti, testi o eventi che non compaiono lì. Se un'informazione non è disponibile, dillo.

${SUBJECT_GUARDRAIL}`

export interface StatoPerChat {
  argomento: string
  capitolo: string
  dossier: RisultatoLettore | null
  riepilogoCaso: string
  fontiApprovate: Fonte[]
  scaletta: Scaletta | null
  opzioni: Opzione[]
  statiAgenti: string
  console: string
  approvazione: string
  costi: string
}

export function contestoChat(s: StatoPerChat): string {
  const opzioni =
    s.opzioni.length === 0
      ? '(lo Scrittore non ha ancora prodotto le opzioni)'
      : s.opzioni
          .map((o) => {
            if (!o.risultato) return `[OPZIONE ${o.impianto}] ${o.etichetta}: non prodotta (${o.errore ?? 'errore'})`
            const citazioni = o.risultato.paragrafi.flatMap((p) => p.citazioni)
            const deboli = citazioni.filter(
              (c) => c.verifica?.giudizio === 'non_supportata' || c.verifica?.testuale === 'non_trovato',
            ).length
            const corpo = o.risultato.paragrafi.map((p) => `${p.titoletto}: ${p.testo}`).join('\n')
            return `[OPZIONE ${o.impianto}] ${o.etichetta} — "${o.risultato.titolo}" (${o.parole} parole, ${citazioni.length} citazioni, ${deboli} deboli)\n${corpo.slice(0, 3000)}`
          })
          .join('\n\n')

  return `STATO ATTUALE DEL PROGETTO

ARGOMENTO: ${s.argomento.trim() || '(non indicato)'}
CAPITOLO: ${s.capitolo.trim() || '(non indicato)'}

DOSSIER DEL CORSO:
"""
${dossierTestuale(s.dossier)}
"""

DATI DEL CASO:
"""
${s.riepilogoCaso}
"""

FONTI APPROVATE:
${s.fontiApprovate.length === 0 ? '(nessuna)' : elencoFonti(s.fontiApprovate)}

APPROVAZIONI: ${s.approvazione}

SCALETTA: ${s.scaletta ? testoScaletta(s.scaletta) : '(non ancora proposta)'}

OPZIONI DELLO SCRITTORE:
${opzioni}

STATO DEGLI AGENTI:
${s.statiAgenti}

COSTI: ${s.costi}

ULTIME RIGHE DELLA CONSOLE:
${s.console || '(console vuota)'}`
}
