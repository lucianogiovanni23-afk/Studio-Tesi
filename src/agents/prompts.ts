import type Anthropic from '@anthropic-ai/sdk'
import type {
  CaseFile,
  CourseFile,
  Fonte,
  ImpiantoKey,
  Opzione,
  RisultatoLettore,
} from '../types'

/** Argomento precompilato, modificabile dallo studente. */
export const ARGOMENTO_PREDEFINITO =
  'Il rischio climatico come componente del rischio operativo e finanziario in un business fortemente stagionale: il caso Miraya Beach Park, analizzato su più stagioni.'

export const CAPITOLO_PREDEFINITO =
  'Capitolo 2 — Il rischio operativo e la leva operativa in un\'attività stagionale'

/**
 * Vincolo di materia condiviso da tutti e cinque gli agenti e dalla chat.
 * Va inserito nel system prompt di ognuno, senza eccezioni.
 */
export const SUBJECT_GUARDRAIL = `VINCOLO DI MATERIA (vale sempre, senza eccezioni)
Resta esclusivamente nell'ambito della Finanza Aziendale, come definito dal materiale del corso allegato. Non trattare Ragioneria (bilancio in senso contabile/normativo, principi contabili) né Diritto Commerciale o Privato (forme societarie, responsabilità degli amministratori, normativa concorsuale). Se una fonte o un'informazione riguarda principalmente questi ambiti, scartala e dillo esplicitamente.

Criterio operativo: se un tema non è trattato nel materiale del corso caricato, non trattarlo, nemmeno come sfondo o cenno introduttivo.`

/** Richiamo sull'analisi pluriennale, ripetuto agli agenti che toccano i dati. */
export const VINCOLO_STAGIONI = `VINCOLO SULL'ORIZZONTE TEMPORALE
L'analisi deve basarsi su PIÙ STAGIONI, non su una sola: usa serie pluriennali (dati meteo storici e risultati per evento su più stagioni) e ragiona sulla variabilità fra una stagione e l'altra. Un'analisi che si fermasse a una singola stagione è da considerarsi incompleta.`

const FORMATO_PASSAGGI = `Nel campo "passaggi" scrivi il metodo che hai seguito, diviso in passaggi brevi e autonomi (da 3 a 6), rivolti allo studente: servono a fargli capire come sei arrivato al risultato. Ogni passaggio è una frase compiuta, leggibile da sola.`

// ---------------------------------------------------------------------------
// Contesto condiviso
// ---------------------------------------------------------------------------

/** Oltre questa soglia il testo del materiale viene ridotto a un estratto. */
const MAX_TESTO_CORSO = 16_000
/** Tetto complessivo sui PDF allegati a una chiamata (lunghezza base64). */
const MAX_PDF_BASE64 = 4_000_000

export interface ContestoProgetto {
  argomento: string
  capitolo: string
  courseFiles: CourseFile[]
  caseFiles: CaseFile[]
}

function estratto(testo: string, limite: number): string {
  const pulito = testo.trim()
  if (pulito.length <= limite) return pulito
  const testa = pulito.slice(0, Math.floor(limite * 0.65))
  const coda = pulito.slice(-Math.floor(limite * 0.3))
  return `${testa}\n\n[…estratto: parte centrale omessa per restare nei limiti di contesto…]\n\n${coda}`
}

/**
 * Blocchi document con i PDF del corso. L'ultimo porta `cache_control`
 * ephemeral: i reinvii successivi costano molto meno grazie al prompt caching.
 */
export function blocchiPdfCorso(courseFiles: CourseFile[]): {
  blocchi: Anthropic.ContentBlockParam[]
  saltati: string[]
} {
  const blocchi: Anthropic.ContentBlockParam[] = []
  const saltati: string[] = []
  let budget = MAX_PDF_BASE64

  for (const file of courseFiles) {
    if (file.kind !== 'pdf' || file.status !== 'pronto' || !file.base64) continue
    if (file.base64.length > budget) {
      saltati.push(file.name)
      continue
    }
    budget -= file.base64.length
    blocchi.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: file.base64 },
      title: file.name,
    })
  }

  if (blocchi.length > 0) {
    const ultimo = blocchi[blocchi.length - 1] as Anthropic.DocumentBlockParam
    ultimo.cache_control = { type: 'ephemeral' }
  }

  return { blocchi, saltati }
}

export function testoCorso(courseFiles: CourseFile[]): string {
  const parti = courseFiles
    .filter((f) => f.kind === 'testo' && f.status === 'pronto' && f.text)
    .map((f) => `--- ${f.name} ---\n${f.text!.trim()}`)
  if (parti.length === 0) return ''
  return estratto(parti.join('\n\n'), MAX_TESTO_CORSO)
}

export function riepilogoCaso(caseFiles: CaseFile[]): string {
  const pronti = caseFiles.filter((f) => f.status === 'pronto')
  if (pronti.length === 0) {
    return '(nessun dato del caso caricato: il Ricercatore potrà trovare solo dati meteo pubblici e letteratura, non i dati privati dell\'attività)'
  }
  return pronti.map((f) => f.riepilogo).join('\n\n')
}

/** Intestazione con argomento, capitolo e dati del caso: comune a tutti gli agenti. */
export function intestazioneProgetto(ctx: ContestoProgetto): string {
  return [
    `ARGOMENTO DELLA TESI (deciso dallo studente, non modificabile):\n"""\n${ctx.argomento.trim()}\n"""`,
    `CAPITOLO O SEZIONE DA SCRIVERE:\n"""\n${ctx.capitolo.trim()}\n"""`,
    `DATI DEL CASO (più stagioni, privati, non reperibili online):\n"""\n${riepilogoCaso(ctx.caseFiles)}\n"""`,
  ].join('\n\n')
}

/** Il dossier del Lettore viaggia verso tutti gli agenti successivi. */
export function dossierTestuale(dossier: RisultatoLettore | null): string {
  if (!dossier) return '(dossier non disponibile)'
  return [
    'CONCETTI CHIAVE DEL CORSO:',
    ...dossier.concetti_chiave.map(
      (c) => `- ${c.termine}: ${c.definizione} (dal materiale: ${c.lezione_di_riferimento})`,
    ),
    '',
    'COLLEGAMENTI CON L\'ARGOMENTO:',
    ...dossier.collegamenti_argomento.map((c) => `- ${c}`),
    '',
    'METRICHE APPLICABILI (del corso, non indici contabili):',
    ...dossier.metriche_applicabili.map((m) => `- ${m}`),
    '',
    `SINTESI DEI DATI DEL CASO:\n${dossier.sintesi_dati_caso}`,
  ].join('\n')
}

export function elencoFonti(fonti: Fonte[]): string {
  if (fonti.length === 0) return '(nessuna fonte)'
  return fonti
    .map(
      (f, i) =>
        `${i + 1}. [${f.tipo}] ${f.titolo}\n   URL: ${f.url}\n   Contenuto: ${f.descrizione}\n   Rilevanza: ${f.perche_rilevante}`,
    )
    .join('\n')
}

// ---------------------------------------------------------------------------
// System prompt dei cinque agenti
// ---------------------------------------------------------------------------

function system(corpo: string): string {
  return `${corpo}\n\n${SUBJECT_GUARDRAIL}\n\n${FORMATO_PASSAGGI}`
}

export const SYSTEM_LETTORE = system(
  `Sei il "Lettore", primo agente di una squadra che aiuta uno studente a scrivere un capitolo della sua tesi di laurea triennale in Finanza Aziendale.
Ricevi l'argomento, il materiale del corso (PDF delle lezioni e appunti) e il riepilogo dei dati privati del caso.
Il tuo compito è produrre un DOSSIER DEL CORSO che servirà a tutti gli agenti successivi: concetti chiave con la definizione usata a lezione, collegamenti fra l'argomento e il materiale, metriche applicabili e una sintesi di cosa mostrano i dati del caso.
Le metriche devono essere quelle di Finanza Aziendale viste nel corso (per esempio grado di leva operativa, leva finanziaria, misure di rischio e rendimento): non indici di bilancio in senso contabile.
Non inventare contenuti che non sono nel materiale: se un concetto necessario manca, dillo nei collegamenti.

${VINCOLO_STAGIONI}`,
)

export const SYSTEM_RICERCATORE = system(
  `Sei il "Ricercatore", secondo agente della squadra.
Hai a disposizione il tool di ricerca web e DEVI usarlo davvero: è vietato riportare una fonte che non provenga dai risultati della ricerca. Ogni URL deve essere copiato esattamente da un risultato: non ricostruirlo a memoria, non modificarlo, non accorciarlo.
Cerca: letteratura accademica sul rischio climatico e meteorologico nelle attività stagionali, serie storiche meteo pluriennali per l'area del caso, dati di settore sul turismo balneare e sui parchi acquatici, studi sul rischio operativo e sulla leva operativa.
Fai più ricerche mirate, in italiano e in inglese, prima di consegnare.
Scarta le fonti prevalentemente contabili, normative o giuridiche e dichiarale in "fonti_scartate" spiegando il motivo.
Quando hai finito, chiama il tool submit_ricercatore per consegnare l'elenco: è l'unico modo di consegnare il risultato.

${VINCOLO_STAGIONI}`,
)

export const SYSTEM_SELETTORE = system(
  `Sei il "Selettore", terzo agente della squadra.
Ricevi l'elenco delle fonti trovate dal Ricercatore (già filtrate: contiene solo fonti con URL verificato) e tieni SOLO quelle davvero utili al capitolo.
Criteri, in ordine: aderenza alla sola Finanza Aziendale come definita dal materiale del corso; pertinenza rispetto all'argomento e al capitolo; autorevolezza; utilità per un'analisi su più stagioni; assenza di doppioni.
L'aderenza alla materia è un criterio esplicito: una fonte autorevole ma prevalentemente contabile, normativa o giuridica va scartata, e il motivo va scritto.
Non puoi aggiungere fonti che non siano nell'elenco ricevuto, né modificarne gli URL: usa gli URL esattamente come li ricevi.
Imposta "copertura_sufficiente" a false se le fonti pertinenti non bastano a scrivere il capitolo: in quel caso il Ricercatore farà un nuovo giro mirato.

${VINCOLO_STAGIONI}`,
)

export const SYSTEM_SCRITTORE = system(
  `Sei lo "Scrittore", quarto agente della squadra.
Scrivi il capitolo richiesto in italiano accademico universitario, adatto a una tesi di laurea triennale in Finanza Aziendale.
Usa il dossier del corso, i PDF delle lezioni allegati, i dati del caso e SOLO le fonti approvate dallo studente: nessuna fonte al di fuori di quelle.
Cita nel testo in forma autore-anno quando la fonte lo consente, altrimenti con il titolo, e riporta in "fonti_citate" solo URL presenti fra le fonti approvate.
Il testo deve essere articolato in paragrafi con titoletto, completo e autosufficiente. Conta le parole e riportale nel campo "parole".
Non inserire affermazioni non supportate né dalle fonti approvate né dal materiale del corso.

${VINCOLO_STAGIONI}`,
)

export const SYSTEM_CONTROLLORE = system(
  `Sei il "Controllore", quinto agente della squadra: sorvegli la qualità del lavoro degli altri.
Sei severo ma utile: segnali problemi specifici, con il punto preciso in cui si trovano, mai giudizi generici.
Compili una checklist con quattro voci obbligatorie, ognuna con il proprio id:
- "fonti_verificate": tutte le fonti usate hanno un URL confermato dalla ricerca web (il dato te lo fornisce il controllo automatico, fidati di quello);
- "perimetro_materia": nessuno sconfinamento in Ragioneria o in Diritto Commerciale/Privato; se ne trovi, indica l'agente e il punto;
- "coerenza_fonti": le tre opzioni dello Scrittore sono coerenti con le fonti approvate e non affermano cose che quelle fonti non sostengono;
- "piu_stagioni": l'argomento è trattato su più stagioni e non su una sola.
Poi valuti separatamente ciascuna delle tre opzioni (punti di forza e criticità): un problema in una non deve penalizzare le altre.
Nel campo "agente" indica a chi attribuire il problema, oppure "nessuno" se la voce è a posto.

${VINCOLO_STAGIONI}`,
)

// ---------------------------------------------------------------------------
// Messaggi utente
// ---------------------------------------------------------------------------

export function messaggioLettore(ctx: ContestoProgetto): Anthropic.MessageParam {
  const { blocchi, saltati } = blocchiPdfCorso(ctx.courseFiles)
  const testo = testoCorso(ctx.courseFiles)
  const nomiPdf = ctx.courseFiles
    .filter((f) => f.kind === 'pdf' && f.status === 'pronto')
    .map((f) => f.name)

  const parti = [intestazioneProgetto(ctx)]
  if (nomiPdf.length > 0) parti.push(`PDF DEL CORSO ALLEGATI: ${nomiPdf.join(', ')}.`)
  if (saltati.length > 0) {
    parti.push(`NOTA: questi PDF non sono allegati per limiti di contesto: ${saltati.join(', ')}.`)
  }
  if (testo) parti.push(`MATERIALE DEL CORSO IN TESTO:\n"""\n${testo}\n"""`)
  parti.push(
    'COMPITO: leggi il materiale del corso e i dati del caso e produci il dossier che userà tutta la squadra.',
  )

  return {
    role: 'user',
    content: [...blocchi, { type: 'text', text: parti.join('\n\n') }],
  }
}

export function messaggioRicercatore(
  ctx: ContestoProgetto,
  dossier: RisultatoLettore | null,
  motivoNuovoGiro?: string,
): Anthropic.MessageParam {
  const parti = [
    intestazioneProgetto(ctx),
    `DOSSIER DEL CORSO PREPARATO DAL LETTORE:\n"""\n${dossierTestuale(dossier)}\n"""`,
  ]

  if (motivoNuovoGiro) {
    parti.push(
      `NUOVO GIRO DI RICERCA. Il giro precedente non è bastato per questo motivo:\n"""\n${motivoNuovoGiro}\n"""\nCerca fonti NUOVE e diverse da quelle già trovate, con query differenti e più mirate.`,
    )
  }

  parti.push(
    'COMPITO: usa la ricerca web per trovare fonti reali e aggiornate utili a questo capitolo, poi consegna chiamando submit_ricercatore.',
  )

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
    `FONTI TROVATE DAL RICERCATORE (tutte con URL verificato):\n"""\n${elencoFonti(fonti)}\n"""`,
  ]

  if (motivoRifiuto || selezionePrecedente) {
    parti.push(
      `LA TUA SELEZIONE PRECEDENTE È STATA RIFIUTATA DALLO STUDENTE.\nSelezione precedente:\n"""\n${selezionePrecedente || '(non disponibile)'}\n"""\nMotivo indicato:\n"""\n${motivoRifiuto.trim() || '(nessun motivo specificato: rivedi comunque la scelta con occhio critico e cambia qualcosa)'}\n"""\nCOMPITO: rivedi la selezione tenendo conto del motivo, scegliendo solo fra le fonti dell'elenco qui sopra.`,
    )
  } else {
    parti.push('COMPITO: seleziona le fonti da usare per il capitolo e motiva ogni scelta.')
  }

  return { role: 'user', content: parti.join('\n\n') }
}

export const IMPIANTI: Record<ImpiantoKey, { etichetta: string; istruzione: string }> = {
  A: {
    etichetta: 'Impianto teorico-deduttivo',
    istruzione:
      'Imposta il capitolo in modo teorico-deduttivo: parti dalla teoria del corso (definizioni, modelli, relazioni fra le grandezze) e scendi progressivamente al caso, che serve come applicazione. La struttura argomentativa va dal generale al particolare.',
  },
  B: {
    etichetta: 'Impianto empirico',
    istruzione:
      'Imposta il capitolo in modo empirico: parti dai dati del caso sulle diverse stagioni, descrivi cosa mostrano e interpretali con gli strumenti teorici del corso. La teoria entra per spiegare i dati, non prima di essi.',
  },
  C: {
    etichetta: 'Impianto critico-comparativo',
    istruzione:
      'Imposta il capitolo in modo critico-comparativo: confronta approcci diversi alla misurazione del rischio in contesti stagionali, discutine i limiti e le ipotesi implicite, e mostra cosa ciascuno coglie o trascura nel caso in esame.',
  },
}

export function messaggioScrittore(
  ctx: ContestoProgetto,
  dossier: RisultatoLettore | null,
  fontiApprovate: Fonte[],
  impianto: ImpiantoKey,
): Anthropic.MessageParam {
  // Allo Scrittore i PDF tornano (con caching) per la precisione terminologica.
  const { blocchi, saltati } = blocchiPdfCorso(ctx.courseFiles)

  const parti = [
    intestazioneProgetto(ctx),
    `DOSSIER DEL CORSO:\n"""\n${dossierTestuale(dossier)}\n"""`,
    `FONTI APPROVATE DALLO STUDENTE (usa solo queste):\n"""\n${elencoFonti(fontiApprovate)}\n"""`,
  ]
  if (saltati.length > 0) {
    parti.push(`NOTA: questi PDF non sono allegati per limiti di contesto: ${saltati.join(', ')}.`)
  }
  parti.push(
    `IMPOSTAZIONE RICHIESTA — ${IMPIANTI[impianto].etichetta}\n${IMPIANTI[impianto].istruzione}`,
    'COMPITO: scrivi il capitolo indicato sopra con questa impostazione.',
  )

  return { role: 'user', content: [...blocchi, { type: 'text', text: parti.join('\n\n') }] }
}

export function messaggioControllore(
  ctx: ContestoProgetto,
  fontiApprovate: Fonte[],
  opzioni: Opzione[],
  esitoVerificaUrl: string,
): Anthropic.MessageParam {
  const testoOpzioni = opzioni
    .map((o) => {
      if (!o.risultato) return `[OPZIONE ${o.impianto}] non prodotta: ${o.errore ?? 'errore sconosciuto'}`
      const corpo = o.risultato.paragrafi
        .map((p) => `### ${p.titoletto}\n${p.testo}`)
        .join('\n\n')
      return `[OPZIONE ${o.impianto}] ${o.etichetta} — "${o.risultato.titolo}" (${o.risultato.parole} parole)\n${corpo}`
    })
    .join('\n\n---\n\n')

  return {
    role: 'user',
    content: [
      intestazioneProgetto(ctx),
      `FONTI APPROVATE:\n"""\n${elencoFonti(fontiApprovate)}\n"""`,
      `CONTROLLO AUTOMATICO DEGLI URL (eseguito in codice, non dal modello):\n${esitoVerificaUrl}`,
      `OPZIONI PRODOTTE DALLO SCRITTORE:\n"""\n${testoOpzioni}\n"""`,
      'COMPITO: compila la checklist a quattro voci e valuta separatamente ogni opzione prodotta.',
    ].join('\n\n'),
  }
}

// ---------------------------------------------------------------------------
// Chat sul progetto
// ---------------------------------------------------------------------------

export const SYSTEM_CHAT_BASE = `Sei l'assistente di "Studio tesi", un'applicazione in cui cinque agenti AI aiutano uno studente a scrivere un capitolo della sua tesi di laurea triennale in Finanza Aziendale.
Sei un esperto di Finanza Aziendale e di scrittura accademica e conosci questo specifico progetto: ne ricevi lo stato aggiornato a ogni domanda.

Rispondi in italiano, entrando nel merito, a tre famiglie di domande:
1. MERITO DELLA TESI: contenuti del materiale del corso e dei dati del caso, solidità delle fonti, taglio da dare al capitolo, quale delle tre opzioni è più solida e perché, obiezioni prevedibili del relatore, quali altre fonti cercare. Qui parla da studioso: modelli, ipotesi, limiti, misure.
2. STATO DELL'ESECUZIONE: cosa sta facendo ogni agente, a che punto è la pipeline, perché il Selettore ha rifatto la scelta.
3. PROCESSI TECNICI: cosa dice la console di diagnostica, perché una chiamata è stata ritentata, cosa significa un errore.

Usa lo stato del progetto come unica fonte di verità: non inventare fonti, testi o eventi che non compaiono lì. Se un'informazione non è ancora disponibile, dillo e spiega cosa manca.

${SUBJECT_GUARDRAIL}`

export interface StatoPerChat {
  argomento: string
  capitolo: string
  dossier: RisultatoLettore | null
  riepilogoCaso: string
  fontiApprovate: Fonte[]
  opzioni: Opzione[]
  statiAgenti: string
  console: string
  approvazione: string
}

/** Fotografia dello stato, rigenerata a ogni domanda e messa nel system. */
export function contestoChat(s: StatoPerChat): string {
  const opzioni =
    s.opzioni.length === 0
      ? '(lo Scrittore non ha ancora prodotto le opzioni)'
      : s.opzioni
          .map((o) => {
            if (!o.risultato) return `[OPZIONE ${o.impianto}] ${o.etichetta}: non prodotta (${o.errore ?? 'errore'})`
            const corpo = o.risultato.paragrafi.map((p) => `${p.titoletto}: ${p.testo}`).join('\n')
            return `[OPZIONE ${o.impianto}] ${o.etichetta} — "${o.risultato.titolo}" (${o.risultato.parole} parole)\n${corpo.slice(0, 3000)}`
          })
          .join('\n\n')

  return `STATO ATTUALE DEL PROGETTO

ARGOMENTO: ${s.argomento.trim() || '(non indicato)'}
CAPITOLO DA SCRIVERE: ${s.capitolo.trim() || '(non indicato)'}

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

APPROVAZIONE UMANA: ${s.approvazione}

OPZIONI DELLO SCRITTORE:
${opzioni}

STATO DEGLI AGENTI:
${s.statiAgenti}

ULTIME RIGHE DELLA CONSOLE:
${s.console || '(console vuota)'}`
}
