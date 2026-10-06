import type Anthropic from '@anthropic-ai/sdk'
import { BLOCCO_DOMINIO, VINCOLO_MATERIA } from '../domain/dominio'
import type { Passaggio, Progetto, QuadroTeorico } from '../types'
import { collocazione } from './corpus'

/**
 * Prompt degli agenti. Ogni system prompt contiene, sempre nello stesso
 * ordine, il ruolo, il dominio della tesi e il vincolo di materia: così il
 * prefisso resta stabile e può essere riusato dalla cache.
 */

const FORMATO_PASSAGGI = `Nel campo "passaggi" spiega il metodo che hai seguito in passaggi brevi e autonomi (da 3 a 6), rivolti allo studente: ogni passaggio è una frase compiuta, leggibile da sola.`

const STILE = `Scrivi in italiano. Non usare nomi reali di persone o di aziende private come esempi inventati.`

function sistema(ruolo: string): string {
  return [ruolo, BLOCCO_DOMINIO, VINCOLO_MATERIA, STILE, FORMATO_PASSAGGI].join('\n\n')
}

export const SYSTEM_BIBLIOTECARIO = sistema(
  `Sei il "Bibliotecario" di una squadra che aiuta uno studente di laurea triennale in Finanza Aziendale a fare ricerca e a scrivere la tesi, per tutta la sua durata.
Cerchi fonti nei cataloghi accademici, nei siti istituzionali e sul web, le selezioni e prepari schede di lettura (domanda, metodo, risultati, rilevanza, frasi chiave copiate alla lettera).
Non inventi mai una fonte, un URL o una frase: tutto ciò che riporti deve venire dai risultati e dalle pagine che hai davvero letto.`,
)

export const SYSTEM_LETTORE = sistema(
  `Sei il "Lettore del corso" di una squadra che aiuta uno studente di laurea triennale in Finanza Aziendale a scrivere la tesi.
Ricavi dal materiale del corso il QUADRO TEORICO che tutti gli agenti useranno in ogni capitolo: rischio operativo, leva operativa, struttura dei costi, liquidità e fabbisogno finanziario, volatilità dei flussi, rischio e rendimento, strumenti di gestione del rischio.
Usi solo il materiale del corso che ricevi: se un concetto utile alla tesi non c'è, lo elenchi fra le lacune e non lo spieghi.
Per ogni concetto indichi il passaggio da cui viene ([C1], [C2]…) e una frase copiata alla lettera da quel passaggio: viene confrontata in codice con il testo.`,
)

export const SYSTEM_SCRITTORE = sistema(
  `Sei lo "Scrittore" di una squadra che aiuta uno studente di laurea triennale in Finanza Aziendale a scrivere la tesi.
Scrivi in italiano accademico, UNA sezione alla volta, seguendo la scaletta approvata dallo studente.
Usi solo i riferimenti forniti: le fonti approvate per la sezione e i passaggi del materiale del corso. Ogni affermazione presa da un riferimento ha il suo marcatore e un estratto copiato alla lettera.`,
)

export const SYSTEM_REVISORE = sistema(
  `Sei il "Revisore" di una squadra che aiuta uno studente di laurea triennale in Finanza Aziendale a scrivere la tesi.
Controlli le citazioni (se l'estratto sostiene davvero l'affermazione), la coerenza dei termini fra capitoli e con il glossario, le ripetizioni, gli sconfinamenti di materia, e trasformi le osservazioni del relatore in proposte di modifica puntuali.
Sei severo ma utile: indichi sempre il punto preciso e una proposta concreta.`,
)

export const SYSTEM_CHAT = sistema(
  `Sei l'assistente di ricerca e scrittura della tesi. Conosci il progetto: indice e stato dei capitoli, biblioteca, quadro teorico del corso, glossario, osservazioni del relatore, stato degli agenti e costi.
Rispondi in modo breve e concreto. Se ti si chiede di trattare un tema escluso dal vincolo di materia, spiega perché non va sviluppato.`,
)

// ---------------------------------------------------------------------------
// Contesto del progetto
// ---------------------------------------------------------------------------

export function indiceTestuale(p: Progetto): string {
  return p.capitoli
    .map((c, i) => [`${i + 1}. ${c.titolo}`, ...c.sezioni.map((s, j) => `   ${i + 1}.${j + 1} ${s.titolo}`)].join('\n'))
    .join('\n')
}

export function glossarioTestuale(p: Progetto): string {
  return p.glossario.map((v) => `- ${v.termine}: ${v.definizione}`).join('\n')
}

export function intestazioneProgetto(p: Progetto): string {
  const caso = p.casoAziendale.attivo && p.casoAziendale.descrizione.trim()
    ? `CASO AZIENDALE (anonimizzato):\n${p.casoAziendale.descrizione.trim()}`
    : 'CASO AZIENDALE: nessuno per ora; la tesi studia il settore in Calabria.'
  return [
    `TITOLO DELLA TESI: ${p.titolo.trim()}`,
    `DOMANDA DI RICERCA: ${p.domanda.trim()}`,
    caso,
    `INDICE:\n${indiceTestuale(p)}`,
    `GLOSSARIO CONDIVISO (usa questi termini, non le varianti):\n${glossarioTestuale(p)}`,
  ].join('\n\n')
}

export function quadroTestuale(q: QuadroTeorico | null): string {
  if (!q) return '(quadro teorico non ancora generato)'
  return [
    'CONCETTI DEL CORSO:',
    ...q.concetti.map((c) => `- ${c.termine}: ${c.definizione} (${c.collocazione})`),
    '',
    'TEMI NON TRATTATI DAL CORSO (da non sviluppare):',
    ...(q.lacune.length ? q.lacune.map((l) => `- ${l}`) : ['- nessuno segnalato']),
  ].join('\n')
}

export function elencoPassaggi(passaggi: Passaggio[], prefisso = 'C'): string {
  return passaggi.map((p, i) => `[${prefisso}${i + 1}] ${collocazione(p)}\n${p.testo}`).join('\n\n---\n\n')
}

export function messaggioLettore(p: Progetto, passaggi: Passaggio[]): Anthropic.MessageParam {
  const file = new Set(passaggi.map((x) => x.file))
  return {
    role: 'user',
    content: [
      intestazioneProgetto(p),
      `PASSAGGI DEL MATERIALE DEL CORSO (${passaggi.length}, da ${file.size} file, selezionati per pertinenza):\n"""\n${elencoPassaggi(passaggi)}\n"""`,
      'COMPITO: ricava il quadro teorico del corso utile a questa tesi. Per ogni concetto indica il passaggio [C…] e una frase copiata alla lettera. Collega i concetti ai capitoli dell\'indice ed elenca le lacune.',
    ].join('\n\n'),
  }
}
