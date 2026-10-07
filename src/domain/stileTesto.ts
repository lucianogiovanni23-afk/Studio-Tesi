import type { VoceGlossario } from '../types'
import { paragrafi } from './citazioniTesto'

/**
 * Controlli di stile fatti in codice, senza costi:
 * - formule tipiche dei testi generati dall'IA;
 * - parole "jolly" ripetute (fondamentale, cruciale, significativo…);
 * - connettivi ripetuti a inizio frase e chiusure riassuntive di paragrafo;
 * - ritmo monotono (frasi tutte della stessa lunghezza);
 * - varianti al posto dei termini del glossario e del lessico del corso.
 */

export type TipoSegnalazione = 'formula' | 'parola_jolly' | 'connettivo' | 'chiusura' | 'ritmo' | 'lessico'

export interface Segnalazione {
  tipo: TipoSegnalazione
  /** Indice del paragrafo (da 0). */
  paragrafo: number
  /** Il punto del testo interessato. */
  testo: string
  spiegazione: string
  suggerimento: string
}

interface Formula {
  re: RegExp
  spiegazione: string
  suggerimento: string
}

const ENFASI = 'Togli la premessa e scrivi direttamente il fatto.'
const RUOLO = 'Di\' che cosa fa concretamente (aumenta, riduce, sposta, rende più incerto).'

/**
 * \b di JavaScript non riconosce le lettere accentate ("È", "è" a inizio
 * parola): i confini di parola si riscrivono con le classi Unicode.
 */
function unicode(f: Formula): Formula {
  const sorgente = f.re.source.replace(/^\\b/, '(?<![\\p{L}\\d])').replace(/\\b$/, '(?![\\p{L}\\d])')
  return { ...f, re: new RegExp(sorgente, 'giu') }
}

/** Formule ricorrenti nei testi generati: non sono errori, ma sommate danno il "sapore" dell'IA. */
export const FORMULE: Formula[] = [
  { re: /\bè (?:fondamentale|importante|cruciale|essenziale|doveroso|opportuno) (?:sottolineare|notare|evidenziare|ricordare|considerare|precisare)\b/gi, spiegazione: 'formula di enfasi vuota', suggerimento: ENFASI },
  { re: /\b(?:va|vale la pena|occorre|bisogna) (?:sottolineat[oa]|sottolineare|notare|evidenziare|ricordare)\b/gi, spiegazione: 'formula di enfasi vuota', suggerimento: ENFASI },
  { re: /\b(?:gioca|giocano|riveste|rivestono|assume|assumono|ricopre|ricoprono) un ruolo (?:cruciale|fondamentale|chiave|centrale|determinante|di primo piano|essenziale|decisivo)\b/gi, spiegazione: 'metafora logora ("ruolo cruciale")', suggerimento: RUOLO },
  { re: /\bnel (?:complesso |variegato |vasto |moderno |attuale )?panorama\b/gi, spiegazione: 'apertura generica ("nel panorama")', suggerimento: 'Parti dal caso concreto: Calabria, campagna, frantoio.' },
  { re: /\bin un (?:contesto|mondo|scenario|mercato) (?:sempre più|in continua|in rapida)\b/gi, spiegazione: 'apertura generica', suggerimento: 'Sostituisci con un dato o un fatto preciso.' },
  { re: /\bsempre più (?:complesso|complessa|incerto|incerta|dinamico|dinamica|globalizzato|competitivo|competitiva|rilevante|centrale)\b/gi, spiegazione: '"sempre più…" generico', suggerimento: 'Indica rispetto a quando e di quanto.' },
  { re: /\b(?:sfide e opportunità|opportunità e sfide|rischi e opportunità)\b/gi, spiegazione: 'coppia fatta ("sfide e opportunità")', suggerimento: 'Nomina la sfida specifica.' },
  { re: /\ba 360 gradi\b/gi, spiegazione: 'espressione abusata', suggerimento: 'Togli o specifica gli aspetti considerati.' },
  { re: /\bin modo (?:significativo|sostanziale|approfondito|esaustivo|olistico)\b/gi, spiegazione: 'avverbio vago', suggerimento: 'Quantifica o togli.' },
  { re: /\b(?:alla luce di quanto|da quanto) (?:detto|esposto|emerso|visto|analizzato)\b/gi, spiegazione: 'raccordo riassuntivo', suggerimento: 'Collega direttamente alla frase precedente.' },
  { re: /\b(?:emerge|risulta|appare) (?:chiaramente|evidente|con chiarezza)\b/gi, spiegazione: 'formula di evidenza', suggerimento: 'Mostra il dato che lo prova.' },
  { re: /\b(?:si può|possiamo|è possibile) (?:quindi |dunque |pertanto )?(?:affermare|concludere|dire|osservare) che\b/gi, spiegazione: 'premessa superflua', suggerimento: 'Scrivi direttamente la conclusione.' },
  { re: /\b(?:il presente|questo) (?:capitolo|paragrafo|lavoro|elaborato) (?:si propone di|intende|mira a|vuole)\b/gi, spiegazione: 'annuncio di intenti', suggerimento: 'Entra nel merito: l\'indice dice già che cosa farai.' },
  { re: /\besplor(?:are|eremo|a|ano|ando|ato)\b/gi, spiegazione: '"esplorare" in senso figurato', suggerimento: 'Usa analizzare, esaminare, confrontare.' },
  { re: /\b(?:evidenzia|evidenziano|sottolinea|sottolineano|mette in luce|mettono in luce) come\b/gi, spiegazione: '"evidenzia come"', suggerimento: 'Scrivi "mostra che" seguito dal fatto.' },
  { re: /\bdi (?:fondamentale|primaria|cruciale|vitale) importanza\b/gi, spiegazione: 'enfasi vuota', suggerimento: 'Spiega perché conta.' },
  { re: /\bin (?:un'ottica|quest'ottica|tale ottica)\b/gi, spiegazione: 'formula burocratica', suggerimento: 'Riformula in modo diretto.' },
  { re: /\b(?:sinergi[ae]|olistic[oaie]|poliedric[oaie]|intrinsecamente|imprescindibil[ei])\b/gi, spiegazione: 'parola ricercata tipica dei testi generati', suggerimento: 'Usa una parola più semplice o togli.' },
  { re: /\bnon solo\b[^.]{0,90}\bma anche\b/gi, spiegazione: 'costruzione "non solo… ma anche"', suggerimento: 'Va bene una volta; ripetuta diventa un tic.' },
  { re: /—/g, spiegazione: 'trattino lungo', suggerimento: 'Nella prosa italiana di una tesi usa virgole o parentesi.' },
].map(unicode)

const JOLLY = ['fondamentale', 'cruciale', 'significativo', 'significativa', 'significativi', 'significative', 'notevole', 'notevoli', 'essenziale', 'determinante', 'rilevante', 'rilevanti']

const CHIUSURE = /^(?:in sintesi|in conclusione|in definitiva|complessivamente|in questo modo|così facendo|ciò dimostra|questo dimostra|questo evidenzia|ciò evidenzia|in altre parole|riassumendo)\b/i

const CONNETTIVI = ['inoltre', 'infatti', 'pertanto', 'tuttavia', 'dunque', 'in particolare', 'di conseguenza', 'allo stesso tempo', 'parallelamente']

function frasiDi(paragrafo: string): string[] {
  return paragrafo
    .replace(/\[[FC]\d+\]/g, '')
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.split(/\s+/).length >= 3)
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Varianti del glossario (e del lessico del corso) usate al posto del termine scelto. */
export function variantiUsate(testo: string, glossario: VoceGlossario[]): { variante: string; termine: string; paragrafo: number }[] {
  const fuori: { variante: string; termine: string; paragrafo: number }[] = []
  const pars = paragrafi(testo)
  for (const v of glossario) {
    for (const variante of v.varianti) {
      if (variante.trim().length < 3 || variante.trim().toLowerCase() === v.termine.trim().toLowerCase()) continue
      const re = new RegExp(`(^|[^\\p{L}])${escape(variante.trim())}(?=$|[^\\p{L}])`, 'iu')
      pars.forEach((p, i) => {
        if (re.test(p)) fuori.push({ variante: variante.trim(), termine: v.termine, paragrafo: i })
      })
    }
  }
  return fuori
}

export function analizzaStile(testo: string, glossario: VoceGlossario[] = []): Segnalazione[] {
  const pars = paragrafi(testo)
  const segnalazioni: Segnalazione[] = []
  const parole = testo.replace(/\[[FC]\d+\]/g, '').split(/\s+/).filter(Boolean).length

  pars.forEach((p, i) => {
    for (const f of FORMULE) {
      for (const m of p.matchAll(f.re)) {
        segnalazioni.push({ tipo: 'formula', paragrafo: i, testo: m[0], spiegazione: f.spiegazione, suggerimento: f.suggerimento })
      }
    }
    const frasi = frasiDi(p)
    const ultima = frasi[frasi.length - 1]
    if (frasi.length >= 3 && ultima && CHIUSURE.test(ultima)) {
      segnalazioni.push({
        tipo: 'chiusura',
        paragrafo: i,
        testo: ultima.slice(0, 120),
        spiegazione: 'chiusura riassuntiva del paragrafo',
        suggerimento: 'Togli la frase che riassume: il paragrafo ha già detto la cosa.',
      })
    }
  })

  // Parole jolly: si segnalano se ripetute o troppo frequenti.
  const minuscolo = testo.toLowerCase()
  let totaleJolly = 0
  for (const j of JOLLY) {
    const n = minuscolo.match(new RegExp(`(^|[^\\p{L}])${j}(?=$|[^\\p{L}])`, 'gu'))?.length ?? 0
    totaleJolly += n
    if (n >= 3) {
      const i = pars.findIndex((p) => p.toLowerCase().includes(j))
      segnalazioni.push({
        tipo: 'parola_jolly',
        paragrafo: Math.max(0, i),
        testo: j,
        spiegazione: `"${j}" ripetuto ${n} volte`,
        suggerimento: 'Sostituisci con l\'effetto concreto o con un numero.',
      })
    }
  }
  if (parole >= 200 && (totaleJolly / parole) * 1000 > 8) {
    segnalazioni.push({
      tipo: 'parola_jolly',
      paragrafo: 0,
      testo: `${totaleJolly} aggettivi enfatici`,
      spiegazione: 'troppi aggettivi enfatici (fondamentale, cruciale, significativo…)',
      suggerimento: 'Tienine al massimo uno ogni due paragrafi.',
    })
  }

  // Connettivi ripetuti a inizio frase in tutta la sezione.
  const inizi = new Map<string, number[]>()
  pars.forEach((p, i) => {
    for (const f of frasiDi(p)) {
      const c = CONNETTIVI.find((x) => f.toLowerCase().startsWith(`${x},`) || f.toLowerCase().startsWith(`${x} `))
      if (c) inizi.set(c, [...(inizi.get(c) ?? []), i])
    }
  })
  for (const [c, dove] of inizi) {
    if (dove.length >= 3) {
      segnalazioni.push({
        tipo: 'connettivo',
        paragrafo: dove[0],
        testo: c,
        spiegazione: `${dove.length} frasi iniziano con "${c}"`,
        suggerimento: 'Varia o togli il connettivo: spesso il legame è già chiaro.',
      })
    }
  }

  // Ritmo: frasi tutte della stessa lunghezza.
  const lunghezze = pars.flatMap(frasiDi).map((f) => f.split(/\s+/).length)
  if (lunghezze.length >= 8) {
    const media = lunghezze.reduce((a, b) => a + b, 0) / lunghezze.length
    const dev = Math.sqrt(lunghezze.reduce((a, b) => a + (b - media) ** 2, 0) / lunghezze.length)
    if (dev / media < 0.3) {
      segnalazioni.push({
        tipo: 'ritmo',
        paragrafo: 0,
        testo: `frasi di circa ${Math.round(media)} parole`,
        spiegazione: 'ritmo monotono: quasi tutte le frasi hanno la stessa lunghezza',
        suggerimento: 'Alterna frasi brevi e frasi più articolate.',
      })
    }
  }

  for (const v of variantiUsate(testo, glossario)) {
    segnalazioni.push({
      tipo: 'lessico',
      paragrafo: v.paragrafo,
      testo: v.variante,
      spiegazione: `"${v.variante}" al posto di "${v.termine}"`,
      suggerimento: `Usa il termine del corso e del glossario: "${v.termine}".`,
    })
  }

  return segnalazioni
}

/** Elenco delle formule da evitare, da mettere nelle istruzioni dello Scrittore. */
export const ISTRUZIONI_STILE = `STILE (vale per ogni testo che scrivi)
- Scrivi come uno studente preparato, non come un manuale: frasi dirette, soggetti concreti (l'olivicoltore, il frantoio, la campagna 2023/24), verbi precisi.
- Alterna frasi brevi e frasi più articolate; niente paragrafi che finiscono con una frase riassuntiva ("In sintesi…", "In questo modo…").
- Non usare: "è fondamentale/importante sottolineare", "gioca/riveste un ruolo cruciale/chiave", "nel panorama", "in un contesto sempre più…", "sfide e opportunità", "a 360 gradi", "in modo significativo", "alla luce di quanto detto", "emerge chiaramente", "si può affermare che", "esplorare" in senso figurato, "evidenzia come", "di fondamentale importanza", "sinergia", "olistico", il trattino lungo.
- Al massimo un aggettivo enfatico (fondamentale, cruciale, significativo) ogni due paragrafi; non iniziare più frasi di fila con lo stesso connettivo.
- Usa la terminologia del materiale del corso e del glossario esattamente com'è scritta, mai le varianti indicate.`
