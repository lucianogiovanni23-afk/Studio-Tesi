import type { ApiMessage, UserContent } from './api'
import type { AgentKey, CourseFile, Draft, Source } from '../types'

/** Oltre questa soglia il testo del materiale viene ridotto a un estratto. */
const MAX_TEXT_CHARS = 14_000
/** Tetto complessivo sui PDF allegati a ogni chiamata (base64), per non sforare i limiti. */
const MAX_PDF_BASE64 = 3_000_000

const FORMATO = `Rispondi SEMPRE in italiano e usa ESATTAMENTE questo formato, senza premesse e senza sezioni aggiuntive:

RAGIONAMENTO:
1. <primo passaggio del tuo ragionamento, una riga>
2. <secondo passaggio>
3. <terzo passaggio>
(da 3 a 5 passaggi numerati, uno per riga, brevi)

RISULTATO:
<qui solo l'output finale del tuo compito>`

// ---------------------------------------------------------------------------
// Contesto condiviso: il materiale del corso accompagna OGNI chiamata.
// ---------------------------------------------------------------------------

export interface SharedContext {
  thesisTopic: string
  chapterBrief: string
  courseFiles: CourseFile[]
}

/** Estratto del testo: testa e coda, così non si perde né l'inizio né le conclusioni. */
function excerpt(text: string, limit: number): string {
  const clean = text.trim()
  if (clean.length <= limit) return clean
  const head = clean.slice(0, Math.floor(limit * 0.65))
  const tail = clean.slice(-Math.floor(limit * 0.3))
  return `${head}\n\n[…estratto: parte centrale omessa per non superare i limiti di contesto…]\n\n${tail}`
}

/** Blocchi document (PDF) da allegare alla chiamata, entro il tetto di dimensione. */
export function buildDocumentBlocks(courseFiles: CourseFile[]): {
  blocks: UserContent[]
  skipped: string[]
} {
  const blocks: UserContent[] = []
  const skipped: string[] = []
  let budget = MAX_PDF_BASE64

  for (const file of courseFiles) {
    if (file.kind !== 'pdf' || file.status !== 'ready' || !file.base64) continue
    if (file.base64.length > budget) {
      skipped.push(file.name)
      continue
    }
    budget -= file.base64.length
    blocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: file.base64 },
    })
  }

  return { blocks, skipped }
}

/** Testo concatenato dei file .txt/.md, ridotto a estratto se molto lungo. */
export function buildMaterialText(courseFiles: CourseFile[]): string {
  const parts = courseFiles
    .filter((f) => f.kind === 'text' && f.status === 'ready' && f.text)
    .map((f) => `--- ${f.name} ---\n${f.text!.trim()}`)
  if (parts.length === 0) return ''
  return excerpt(parts.join('\n\n'), MAX_TEXT_CHARS)
}

/** Intestazione comune a tutti gli agenti: argomento, capitolo e materiale del corso. */
export function buildContextHeader(ctx: SharedContext, skippedPdf: string[]): string {
  const materialText = buildMaterialText(ctx.courseFiles)
  const pdfNames = ctx.courseFiles
    .filter((f) => f.kind === 'pdf' && f.status === 'ready')
    .map((f) => f.name)

  const lines = [
    'CONTESTO CONDIVISO DEL PROGETTO DI TESI (valido per tutti gli agenti):',
    '',
    `ARGOMENTO DELLA TESI (deciso dallo studente, non modificabile):\n"""\n${ctx.thesisTopic.trim()}\n"""`,
    '',
    `CAPITOLO O SEZIONE DA SCRIVERE:\n"""\n${ctx.chapterBrief.trim()}\n"""`,
  ]

  if (pdfNames.length > 0) {
    lines.push('', `MATERIALE DEL CORSO IN PDF ALLEGATO A QUESTO MESSAGGIO: ${pdfNames.join(', ')}.`)
  }
  if (skippedPdf.length > 0) {
    lines.push(
      `NOTA: questi PDF non sono allegati in questa chiamata per limiti di contesto: ${skippedPdf.join(', ')}.`,
    )
  }
  if (materialText) {
    lines.push('', `MATERIALE DEL CORSO IN TESTO:\n"""\n${materialText}\n"""`)
  }
  if (pdfNames.length === 0 && !materialText) {
    lines.push('', 'ATTENZIONE: nessun materiale del corso leggibile è stato allegato.')
  }

  return lines.join('\n')
}

/** Messaggio utente completo: PDF allegati + testo del contesto + istruzione dell'agente. */
export function buildUserMessage(ctx: SharedContext, instruction: string): ApiMessage {
  const { blocks, skipped } = buildDocumentBlocks(ctx.courseFiles)
  const content: UserContent[] = [
    ...blocks,
    { type: 'text', text: `${buildContextHeader(ctx, skipped)}\n\n${instruction}` },
  ]
  return { role: 'user', content }
}

// ---------------------------------------------------------------------------
// System prompt dei 5 agenti
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPTS: Record<AgentKey, string> = {
  lettore: `Sei il "Lettore", primo agente di una squadra che aiuta uno studente a scrivere un capitolo della sua tesi di laurea in Finanza Aziendale.
Ricevi l'argomento della tesi scelto dallo studente e il materiale del corso di Finanza Aziendale (PDF delle lezioni e/o appunti in testo).
Il tuo compito è studiare quel materiale ed estrarre una base solida per la ricerca successiva:
- i concetti chiave del corso che riguardano l'argomento scelto;
- la terminologia tecnica da usare, con la definizione usata nel corso;
- i collegamenti espliciti fra l'argomento della tesi e i contenuti delle lezioni (quali parti del materiale servono e perché);
- le lacune: cosa l'argomento richiede ma il materiale del corso non copre, e che quindi andrà cercato online.
Non inventare contenuti che non sono nel materiale: se qualcosa manca, dillo e mettilo fra le lacune.

${FORMATO}

Nella sezione RISULTATO usa esattamente queste quattro intestazioni, in quest'ordine:

Concetti chiave
<elenco puntato>

Terminologia tecnica
<elenco puntato "termine — definizione dal corso">

Collegamenti con l'argomento della tesi
<elenco puntato>

Lacune da colmare con la ricerca
<elenco puntato>`,

  ricercatore: `Sei il "Ricercatore", secondo agente di una squadra che aiuta uno studente a scrivere un capitolo della sua tesi di laurea in Finanza Aziendale.
Hai a disposizione il tool di ricerca web: DEVI usarlo davvero. È assolutamente vietato scrivere una fonte che non provenga dai risultati della ricerca: ogni URL che riporti deve essere un URL reale restituito dal tool. Non inventare, non ricostruire a memoria, non modificare gli URL.
Cerca informazioni, dataset, paper accademici, articoli e dati aggiornati pertinenti all'argomento della tesi, tenendo conto della base preparata dal Lettore e delle lacune che ha segnalato.
Fai più ricerche mirate con query diverse (in italiano e in inglese) prima di rispondere. Punta a 6-10 fonti di buona qualità, privilegiando paper, pubblicazioni accademiche, banche dati, autorità di vigilanza e fonti istituzionali rispetto a blog generalisti.

${FORMATO}

Nella sezione RISULTATO elenca le fonti usando ESATTAMENTE questo schema a blocchi, ripetuto per ogni fonte e senza altro testo fra un blocco e l'altro:

[FONTE]
TITOLO: <titolo della pagina o del paper>
URL: <URL completo e reale, così come restituito dalla ricerca, che inizia con http>
CONTENUTO: <una o due frasi su cosa contiene davvero>
RILEVANZA: <una frase su perché è utile per questo capitolo di tesi>

Se la ricerca non restituisce risultati utili, scrivi nella sezione RISULTATO la riga "NESSUNA FONTE TROVATA" seguita dalla spiegazione, senza inventare fonti.`,

  selettore: `Sei il "Selettore", terzo agente di una squadra che aiuta uno studente a scrivere un capitolo della sua tesi di laurea in Finanza Aziendale.
Ricevi l'elenco delle fonti trovate dal Ricercatore e devi tenere SOLO quelle davvero pertinenti al progetto di tesi e al capitolo da scrivere, scartando le altre.
Valuta: pertinenza rispetto all'argomento e al capitolo, autorevolezza della fonte, attualità dei dati, coerenza con il taglio del corso di Finanza Aziendale, e il fatto che non siano doppioni.
Non puoi aggiungere fonti che non siano nell'elenco del Ricercatore, e non puoi modificarne gli URL.
Nella sezione RAGIONAMENTO motiva brevemente sia le fonti tenute sia quelle scartate.

${FORMATO}

Nella sezione RISULTATO usa ESATTAMENTE questo schema a blocchi, uno per ogni fonte dell'elenco ricevuto, senza altro testo fra i blocchi:

[TENUTA]
TITOLO: <titolo>
URL: <URL identico a quello ricevuto>
MOTIVO: <perché la tieni, una frase>

[SCARTATA]
TITOLO: <titolo>
URL: <URL identico a quello ricevuto>
MOTIVO: <perché la scarti, una frase>

Se ritieni che le fonti pertinenti disponibili non siano sufficienti per scrivere il capitolo, aggiungi in fondo alla sezione RISULTATO la riga [NUOVA RICERCA] seguita da una riga che spiega quali ricerche mancano: il Ricercatore farà un altro giro.`,

  scrittore: `Sei lo "Scrittore", quarto agente di una squadra che aiuta uno studente a scrivere un capitolo della sua tesi di laurea in Finanza Aziendale.
Scrivi il capitolo o la sezione richiesta usando l'argomento della tesi, il materiale del corso, la base preparata dal Lettore e SOLO le fonti selezionate e approvate dallo studente.
Devi produrre TRE opzioni di scrittura differenti per taglio e approccio (per esempio: impostazione teorico-formale; impostazione applicata con esempi e dati; impostazione critica e comparativa). Tutte e tre devono essere in italiano accademico universitario, pertinenti alla materia, coerenti con le fonti approvate e prive di affermazioni non supportate.
Ogni opzione deve essere un testo completo e autosufficiente, articolato in paragrafi, di almeno 450 parole, con i riferimenti alle fonti indicati fra parentesi tonde con titolo e URL.

${FORMATO}

Nella sezione RISULTATO usa ESATTAMENTE questo schema, senza altro testo fra i blocchi:

[OPZIONE 1]
APPROCCIO: <una riga che descrive il taglio scelto>
TESTO:
<il testo completo dell'opzione 1>

[OPZIONE 2]
APPROCCIO: <una riga>
TESTO:
<il testo completo dell'opzione 2>

[OPZIONE 3]
APPROCCIO: <una riga>
TESTO:
<il testo completo dell'opzione 3>`,

  controllore: `Sei il "Controllore", quinto agente di una squadra che aiuta uno studente a scrivere un capitolo della sua tesi di laurea in Finanza Aziendale.
Sorvegli la qualità del lavoro degli altri agenti: verifichi che le fonti siano reali e pertinenti e che i testi prodotti siano accademicamente corretti e coerenti con le fonti approvate.
Sii concreto e severo ma utile: segnala problemi specifici, non giudizi generici.

Rispondi SEMPRE in italiano e usa ESATTAMENTE questo formato:

RAGIONAMENTO:
1. <primo passaggio del controllo>
2. <secondo passaggio>
(da 3 a 5 passaggi numerati, uno per riga)

RISULTATO:
<il referto del controllo>

STATO: OK
(oppure "STATO: PROBLEMA" se hai rilevato almeno un problema rilevante)`,
}

// ---------------------------------------------------------------------------
// Istruzioni specifiche per ogni passo della pipeline
// ---------------------------------------------------------------------------

function sourceList(sources: Source[]): string {
  if (sources.length === 0) return '(nessuna fonte)'
  return sources
    .map(
      (s, i) =>
        `${i + 1}. TITOLO: ${s.title}\n   URL: ${s.url}\n   CONTENUTO: ${s.summary || '(non specificato)'}\n   RILEVANZA: ${s.relevance || '(non specificata)'}`,
    )
    .join('\n')
}

export function lettoreInstruction(): string {
  return 'COMPITO: studia il materiale del corso qui allegato e prepara la base di lavoro per l\'argomento di tesi indicato sopra.'
}

export function ricercatoreInstruction(lettoreResult: string, previousAttempt?: string): string {
  const base = `BASE PREPARATA DAL LETTORE:\n"""\n${lettoreResult || '(non disponibile)'}\n"""\n\nCOMPITO: usa il tool di ricerca web per trovare fonti reali e aggiornate utili a questo capitolo di tesi. Ogni URL che riporti deve provenire dai risultati della ricerca.`
  if (!previousAttempt) return base
  return `${base}\n\nATTENZIONE: è un nuovo giro di ricerca. Il Selettore ha ritenuto insufficienti le fonti del giro precedente per questo motivo:\n"""\n${previousAttempt}\n"""\nCerca fonti NUOVE e diverse da quelle già trovate, con query differenti.`
}

export function selettoreInstruction(
  lettoreResult: string,
  found: Source[],
  rejectionReason: string,
  previousSelection: string,
): string {
  const parts = [
    `BASE PREPARATA DAL LETTORE:\n"""\n${lettoreResult || '(non disponibile)'}\n"""`,
    `ELENCO COMPLETO DELLE FONTI TROVATE DAL RICERCATORE:\n"""\n${sourceList(found)}\n"""`,
  ]

  if (rejectionReason !== '' || previousSelection !== '') {
    parts.push(
      `LA TUA SELEZIONE PRECEDENTE È STATA RIFIUTATA DALLO STUDENTE.\nSelezione precedente:\n"""\n${previousSelection || '(non disponibile)'}\n"""\nMotivo del rifiuto indicato dallo studente:\n"""\n${rejectionReason.trim() || '(nessun motivo specificato: rivedi comunque la selezione con occhio critico e cambia qualcosa)'}\n"""\nCOMPITO: rivedi la selezione tenendo conto del motivo. Puoi tenere fonti che prima avevi scartato e scartare fonti che prima avevi tenuto, ma solo fra quelle dell'elenco del Ricercatore. Se davvero non ci sono abbastanza fonti pertinenti, chiudi con [NUOVA RICERCA].`,
    )
  } else {
    parts.push(
      'COMPITO: seleziona le fonti da usare per il capitolo, scartando le non pertinenti, e motiva ogni scelta.',
    )
  }

  return parts.join('\n\n')
}

export function scrittoreInstruction(lettoreResult: string, selected: Source[]): string {
  return `BASE PREPARATA DAL LETTORE:\n"""\n${lettoreResult || '(non disponibile)'}\n"""\n\nFONTI SELEZIONATE E APPROVATE DALLO STUDENTE (usa solo queste):\n"""\n${sourceList(selected)}\n"""\n\nCOMPITO: scrivi il capitolo o la sezione indicata sopra, in tre opzioni differenti per taglio e approccio.`
}

export function supervisorSourcesInstruction(
  found: Source[],
  unverified: Source[],
  searchErrors: string[],
): string {
  const parts = [
    `FONTI RIPORTATE DAL RICERCATORE:\n"""\n${sourceList(found)}\n"""`,
    `CONTROLLO AUTOMATICO DEGLI URL: ${
      unverified.length === 0
        ? 'tutti gli URL riportati corrispondono a risultati reali del tool di ricerca web.'
        : `questi URL NON compaiono fra i risultati reali della ricerca e potrebbero essere inventati:\n${unverified.map((s) => `- ${s.title} — ${s.url}`).join('\n')}`
    }`,
  ]
  if (searchErrors.length > 0) {
    parts.push(`ERRORI DEL TOOL DI RICERCA WEB:\n${searchErrors.map((e) => `- ${e}`).join('\n')}`)
  }
  parts.push(
    'COMPITO: valuta l\'affidabilità di questo giro di ricerca. Nella sezione RISULTATO scrivi un referto breve (massimo 8 righe) sulle fonti sospette o mancanti e su cosa conviene fare. Chiudi con la riga STATO.',
  )
  return parts.join('\n\n')
}

export function supervisorDraftsInstruction(drafts: Draft[], selected: Source[]): string {
  const draftText = drafts
    .map((d, i) => `[OPZIONE ${i + 1}] APPROCCIO: ${d.approach}\n${d.text}`)
    .join('\n\n')

  return `FONTI APPROVATE DALLO STUDENTE:\n"""\n${sourceList(selected)}\n"""\n\nTRE OPZIONI PRODOTTE DALLO SCRITTORE:\n"""\n${draftText}\n"""\n\nCOMPITO: valuta ognuna delle tre opzioni per coerenza con le fonti approvate, correttezza accademica e pertinenza al capitolo richiesto. Non bloccare le opzioni valide a causa di una sbagliata: giudica ciascuna separatamente.

Nella sezione RISULTATO usa ESATTAMENTE questo schema:

[VALUTAZIONE OPZIONE 1]
ESITO: OK
NOTE: <giudizio in una o due frasi; se ESITO è PROBLEMA spiega il problema specifico>

[VALUTAZIONE OPZIONE 2]
ESITO: OK
NOTE: <...>

[VALUTAZIONE OPZIONE 3]
ESITO: OK
NOTE: <...>

Usa "ESITO: PROBLEMA" solo quando l'opzione ha un difetto evidente (afferma cose non supportate dalle fonti, è fuori tema, non è scrittura accademica, o è palesemente incompleta). Chiudi con la riga STATO.`
}

// ---------------------------------------------------------------------------
// Chat sul progetto
// ---------------------------------------------------------------------------

export const CHAT_SYSTEM = `Sei l'assistente di "Studio tesi", un'applicazione in cui una squadra di cinque agenti AI (Lettore, Ricercatore, Selettore, Scrittore, Controllore) aiuta uno studente a scrivere un capitolo della sua tesi di laurea in Finanza Aziendale.
Sei un esperto di finanza aziendale e di scrittura accademica, e conosci nel dettaglio questo specifico progetto di tesi: ne ricevi lo stato aggiornato a ogni messaggio.

Rispondi in italiano, in modo diretto e concreto, a tre famiglie di domande:
1. MERITO DELLA TESI: di cosa parla il materiale del corso, se le fonti selezionate sono valide, che taglio dare al capitolo, quale delle tre opzioni dello Scrittore è più solida e perché, che obiezioni farebbe un relatore, quali altre fonti cercare. Qui entra nel merito disciplinare: modelli, formule, ipotesi, limiti, letteratura.
2. STATO DELL'ESECUZIONE: cosa sta facendo ora ogni agente, a che punto è la pipeline, perché il Selettore ha rifatto la selezione.
3. PROCESSI TECNICI: cosa dice la console di diagnostica, perché una chiamata è stata ritentata, cosa significa un errore.

Usa lo stato del progetto che ricevi come fonte di verità: non inventare fonti, output o eventi che non compaiono lì. Se un'informazione non è ancora disponibile, dillo e spiega cosa manca. Quando dai un giudizio accademico, motivalo.`

export interface ChatContext {
  thesisTopic: string
  chapterBrief: string
  materialSummary: string
  foundSources: Source[]
  selectedSources: Source[]
  drafts: Draft[]
  agentStates: string
  recentLogs: string
  approvalInfo: string
}

/** Fotografia dello stato del progetto allegata a ogni messaggio della chat. */
export function buildChatContext(ctx: ChatContext): string {
  const draftBlock =
    ctx.drafts.length === 0
      ? '(lo Scrittore non ha ancora prodotto le bozze)'
      : ctx.drafts
          .map(
            (d, i) =>
              `[OPZIONE ${i + 1}] approccio: ${d.approach}\nverdetto del Controllore: ${
                d.review ? (d.review.ok ? `OK — ${d.review.note}` : `PROBLEMA — ${d.review.note}`) : 'non ancora valutata'
              }\ntesto:\n${d.text.slice(0, 2500)}`,
          )
          .join('\n\n')

  return `STATO ATTUALE DEL PROGETTO DI TESI

ARGOMENTO: ${ctx.thesisTopic.trim() || '(non ancora indicato)'}
CAPITOLO DA SCRIVERE: ${ctx.chapterBrief.trim() || '(non ancora indicato)'}

ESTRATTO DEL MATERIALE DEL CORSO:
"""
${ctx.materialSummary || '(nessun materiale caricato)'}
"""

FONTI TROVATE DAL RICERCATORE:
${ctx.foundSources.length === 0 ? '(nessuna)' : sourceList(ctx.foundSources)}

FONTI SELEZIONATE:
${ctx.selectedSources.length === 0 ? '(nessuna)' : sourceList(ctx.selectedSources)}

APPROVAZIONE UMANA: ${ctx.approvalInfo}

BOZZE DELLO SCRITTORE:
${draftBlock}

STATO DEGLI AGENTI:
${ctx.agentStates}

ULTIME RIGHE DELLA CONSOLE DI DIAGNOSTICA:
${ctx.recentLogs || '(console vuota)'}`
}
