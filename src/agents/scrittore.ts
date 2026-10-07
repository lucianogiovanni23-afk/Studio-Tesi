import { create } from 'zustand'
import { autoreAnno } from '../domain/bibliografia'
import { paragrafi, sostituisciParagrafo } from '../domain/citazioniTesto'
import { useStudio } from '../store'
import type { Capitolo, Citazione, Consegna, Fonte, Passaggio, Sezione } from '../types'
import { ApiError, chiamataStrutturataStream, creaClient } from './api'
import { normalizza, verificaEstratto } from './citations'
import { collocazione, recuperaPassaggi } from './corpus'
import { stimaChiamata, tokenDaCaratteri, type Stima } from './costs'
import { SYSTEM_SCRITTORE, intestazioneProgetto, quadroTestuale } from './prompts'
import { SCHEMA_ALTERNATIVE, SCHEMA_BOZZA, SCHEMA_PARAGRAFO, SCHEMA_SCALETTA } from './schemas'
import { logOk, passaggiValidi, sorveglia } from './supervisor'

/** Caratteri di materiale del corso nel prefisso dello Scrittore. */
const BUDGET_CORSO = 60_000
/** Caratteri di testo per fonte e in totale, per tenere il prefisso entro un costo ragionevole. */
const MAX_PER_FONTE = 30_000
const MAX_FONTI = 120_000
/** La cache dura 5 minuti dall'ultimo uso. */
const DURATA_CACHE_MS = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// Prefisso comune in cache
// ---------------------------------------------------------------------------

interface Prefisso {
  firma: string
  testo: string
  /** "F12" → fonte; "C3" → passaggio del corso. */
  fonti: Map<string, Fonte>
  testiFonti: Map<string, string>
  corso: Map<string, Passaggio>
}

const prefissi = new Map<string, Prefisso>()
const ultimoUso = new Map<string, number>()

/** Il testo citabile di una fonte: completo se c'è, altrimenti abstract, estratti e frasi chiave verificate. */
export function testoCitabile(f: Fonte): string {
  if (f.testoCompleto && f.testo.trim().length > 400) return f.testo.slice(0, MAX_PER_FONTE)
  return [f.abstract, ...f.estratti.map((e) => e.testo), ...(f.scheda?.frasiChiave.map((x) => x.testo) ?? [])]
    .filter(Boolean)
    .join('\n')
}

function firmaDi(cap: Capitolo, sez: Sezione): string {
  const p = useStudio.getState().progetto
  const fonti = sez.fontiApprovate
    .map((id) => p.fonti.find((f) => f.id === id))
    .filter((f): f is Fonte => Boolean(f))
    .map((f) => `${f.id}:${f.testo.length}:${f.abstract.length}:${f.estratti.length}`)
  return [
    cap.id,
    cap.titolo,
    sez.id,
    sez.titolo,
    sez.obiettivo,
    sez.scaletta.join('|'),
    fonti.join('|'),
    p.quadro?.generatoIl ?? '',
    p.courseFiles.map((f) => `${f.id}:${f.status}`).join('|'),
    p.capitoli.map((c) => c.titolo + c.sezioni.map((s) => s.titolo).join('/')).join('|'),
    p.glossario.map((v) => v.termine + v.definizione).join('|'),
    p.titolo,
    p.domanda,
  ].join('§')
}

/**
 * Il materiale comune a tutte le richieste di una sezione. Viene costruito una
 * volta e riusato identico finché fonti, scaletta e corso non cambiano: è la
 * condizione perché il prompt caching funzioni.
 */
export function prefissoSezione(cap: Capitolo, sez: Sezione): Prefisso {
  const firma = firmaDi(cap, sez)
  const esistente = prefissi.get(sez.id)
  if (esistente && esistente.firma === firma) return esistente

  const p = useStudio.getState().progetto
  const fonti = new Map<string, Fonte>()
  const testiFonti = new Map<string, string>()
  let usati = 0
  const blocchiFonti: string[] = []
  for (const id of sez.fontiApprovate) {
    const f = p.fonti.find((x) => x.id === id)
    if (!f) continue
    const rif = `F${f.numero}`
    const testo = testoCitabile(f).slice(0, Math.max(2000, MAX_FONTI - usati))
    usati += testo.length
    fonti.set(rif, f)
    testiFonti.set(rif, testo)
    const scheda = f.scheda ? `\n  Scheda: ${f.scheda.risultati} — Rilevanza: ${f.scheda.rilevanza}` : ''
    blocchiFonti.push(
      `[${rif}] ${autoreAnno(f)} ${f.titolo}${f.rivista ? ` — ${f.rivista}` : ''}${scheda}\n  Testo citabile${f.testoCompleto ? '' : ' (solo abstract ed estratti)'}:\n"""\n${testo}\n"""`,
    )
  }

  const passaggi = recuperaPassaggi([sez.titolo, sez.obiettivo, ...sez.scaletta, cap.titolo], BUDGET_CORSO)
  const corso = new Map<string, Passaggio>()
  passaggi.forEach((x, i) => corso.set(`C${i + 1}`, x))

  const numero = p.capitoli.indexOf(cap) + 1
  const testo = [
    intestazioneProgetto(p),
    `QUADRO TEORICO DEL CORSO:\n${quadroTestuale(p.quadro)}`,
    `CAPITOLO ${numero}: ${cap.titolo}\nSEZIONE ${numero}.${cap.sezioni.indexOf(sez) + 1}: ${sez.titolo}\nOBIETTIVO: ${sez.obiettivo || '(non indicato)'}`,
    `SCALETTA APPROVATA DALLO STUDENTE:\n${sez.scaletta.length && sez.scalettaApprovata ? sez.scaletta.map((x, i) => `${i + 1}. ${x}`).join('\n') : '(non ancora approvata)'}`,
    `FONTI APPROVATE PER LA SEZIONE (citabili solo attraverso il loro testo qui sotto):\n${blocchiFonti.join('\n\n') || '(nessuna: la sezione si basa sul materiale del corso)'}`,
    `PASSAGGI DEL MATERIALE DEL CORSO (citabili alla lettera):\n${passaggi.map((x, i) => `[C${i + 1}] ${collocazione(x)}\n${x.testo}`).join('\n\n---\n\n') || '(nessuno)'}`,
  ].join('\n\n')

  const nuovo = { firma, testo, fonti, testiFonti, corso }
  prefissi.set(sez.id, nuovo)
  return nuovo
}

// ---------------------------------------------------------------------------
// Proposte (non salvate: vanno accettate o scartate)
// ---------------------------------------------------------------------------

export type Comando = 'scaletta' | 'bozza' | 'riscrivi' | 'alternative' | 'corso'

export interface Opzione {
  etichetta: string
  /** Paragrafi proposti, con i marcatori già rinumerati per la sezione. */
  paragrafi: string[]
  citazioni: Citazione[]
}

export interface Proposta {
  sezioneId: string
  capitoloId: string
  comando: Exclude<Comando, 'scaletta'>
  /** Per i comandi su un paragrafo: quale. */
  indice: number | null
  opzioni: Opzione[]
  creataIl: string
}

interface StatoScrittore {
  proposte: Record<string, Proposta | undefined>
  inCorso: { sezioneId: string; comando: Comando } | null
  lacune: Record<string, string[] | undefined>
}

export const useScrittore = create<StatoScrittore>(() => ({ proposte: {}, inCorso: null, lacune: {} }))

export function scartaProposta(sezioneId: string) {
  useScrittore.setState((s) => ({ proposte: { ...s.proposte, [sezioneId]: undefined } }))
}

// ---------------------------------------------------------------------------
// Stime
// ---------------------------------------------------------------------------

const OUTPUT: Record<Comando, number> = { scaletta: 1500, bozza: 4500, riscrivi: 900, alternative: 1800, corso: 1000 }

/** Stima del costo di un comando, tenendo conto della cache se il prefisso è stato usato da poco. */
export function stimaComando(cap: Capitolo, sez: Sezione, comando: Comando): Stima & { cache: boolean } {
  const pre = prefissoSezione(cap, sez)
  const tokenPrefisso = tokenDaCaratteri(pre.testo.length + SYSTEM_SCRITTORE.length)
  const recente = Date.now() - (ultimoUso.get(sez.id) ?? 0) < DURATA_CACHE_MS && prefissi.get(sez.id)?.firma === pre.firma
  const variabile = 1200 + tokenDaCaratteri(sez.testo.length)
  const modello = useStudio.getState().preferenze.modelli.scrittore
  const stima = stimaChiamata(modello, {
    input: variabile,
    output: OUTPUT[comando],
    ...(recente ? { letturaCache: tokenPrefisso } : { scritturaCache5m: tokenPrefisso }),
  })
  return { ...stima, cache: recente }
}

// ---------------------------------------------------------------------------
// Verifica e integrazione dell'output
// ---------------------------------------------------------------------------

interface ParagrafoGrezzo {
  testo: string
  citazioni: { rif: string; affermazione: string; estratto: string }[]
}

/**
 * Ogni citazione viene confrontata in codice con il testo del suo riferimento.
 * I passaggi del corso prendono un'etichetta stabile per la sezione: se lo
 * stesso passaggio è già citato si riusa la sua etichetta, altrimenti la prima libera.
 */
function integra(pre: Prefisso, sez: Sezione, grezzi: ParagrafoGrezzo[]): { paragrafi: string[]; citazioni: Citazione[] } {
  const etichetteC = new Map<string, string>()
  const usate = new Set([...sez.testo.matchAll(/\[C(\d+)\]/g)].map((m) => Number(m[1])))
  for (const c of sez.citazioni) if (c.rif.startsWith('C')) usate.add(Number(c.rif.slice(1)))
  const perTesto = new Map(sez.citazioni.filter((c) => c.passaggio).map((c) => [c.passaggio!.testo, c.rif]))

  const etichettaCorso = (rifPrompt: string): string => {
    const presente = etichetteC.get(rifPrompt)
    if (presente) return presente
    const passaggio = pre.corso.get(rifPrompt)
    const riuso = passaggio ? perTesto.get(passaggio.testo) : undefined
    let nuova = riuso
    if (!nuova) {
      let n = 1
      while (usate.has(n)) n += 1
      usate.add(n)
      nuova = `C${n}`
    }
    etichetteC.set(rifPrompt, nuova)
    return nuova
  }

  const citazioni: Citazione[] = []
  const testi = grezzi.map((g) => {
    const testo = (g.testo ?? '').replace(/\[([FC]\d+)\]/gi, (_, r: string) => {
      const rif = r.toUpperCase()
      return rif.startsWith('C') ? `[${etichettaCorso(rif)}]` : `[${rif}]`
    })
    for (const c of g.citazioni ?? []) {
      const rif = String(c.rif ?? '').trim().toUpperCase()
      if (rif.startsWith('C')) {
        const passaggio = pre.corso.get(rif)
        citazioni.push({
          rif: etichettaCorso(rif),
          affermazione: c.affermazione,
          estratto: c.estratto,
          testuale: passaggio ? verificaEstratto(c.estratto, passaggio.testo) : 'rif_sconosciuto',
          ...(passaggio ? { passaggio: { file: passaggio.file, pagine: passaggio.pagine, testo: passaggio.testo } } : {}),
        })
      } else {
        const fonte = pre.fonti.get(rif)
        citazioni.push({
          rif,
          affermazione: c.affermazione,
          estratto: c.estratto,
          // Una fonte non approvata per la sezione non è citabile: risulta in rosso.
          testuale: fonte ? verificaEstratto(c.estratto, pre.testiFonti.get(rif) ?? '') : 'rif_sconosciuto',
          ...(fonte ? { fonteId: fonte.id } : {}),
        })
      }
    }
    return testo.trim()
  })
  return { paragrafi: testi.filter(Boolean), citazioni }
}

// ---------------------------------------------------------------------------
// Chiamate
// ---------------------------------------------------------------------------

function trova(capitoloId: string, sezioneId: string): { cap: Capitolo; sez: Sezione } {
  const cap = useStudio.getState().progetto.capitoli.find((c) => c.id === capitoloId)
  const sez = cap?.sezioni.find((s) => s.id === sezioneId)
  if (!cap || !sez) throw new ApiError('sconosciuto', 'Sezione non trovata.')
  return { cap, sez }
}

async function chiama<T>(
  cap: Capitolo,
  sez: Sezione,
  comando: Comando,
  istruzione: string,
  schema: Record<string, unknown>,
  maxTokens: number,
  effort: 'medium' | 'high',
  valida: (d: Consegna<T>) => { ok: boolean; suggerimento?: string },
): Promise<{ consegna: Consegna<T>; pre: Prefisso }> {
  if (useScrittore.getState().inCorso) {
    throw new ApiError('sconosciuto', 'Lo Scrittore sta già lavorando: una sezione e un comando alla volta.')
  }
  const s = useStudio.getState()
  const client = creaClient(s.apiKey)
  const pre = prefissoSezione(cap, sez)
  useScrittore.setState({ inCorso: { sezioneId: sez.id, comando } })
  s.patchAgente('scrittore', { status: 'lavoro', etichetta: `${sez.titolo.slice(0, 32)}…`, errore: null })
  try {
    const consegna = await sorveglia<Consegna<T>>({
      agente: 'scrittore',
      passo: `Scrittore — ${comando}`,
      esegui: (_t, suggerimento) =>
        chiamataStrutturataStream<Consegna<T>>({
          client,
          model: s.preferenze.modelli.scrittore,
          maxTokens,
          effort,
          chi: 'scrittore',
          azione: `scrittura: ${comando}`,
          // Sistema e materiale comune restano identici fra i comandi: il prefisso finisce in cache.
          system: [{ type: 'text', text: SYSTEM_SCRITTORE }],
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: pre.testo, cache_control: { type: 'ephemeral' } },
                { type: 'text', text: suggerimento ? `${istruzione}\n\n${suggerimento}` : istruzione },
              ],
            },
          ],
          schema,
        }),
      valida,
    })
    ultimoUso.set(sez.id, Date.now())
    useStudio.getState().patchAgente('scrittore', {
      status: 'fatto',
      etichetta: 'proposta pronta',
      passaggi: consegna.passaggi,
      errore: null,
    })
    return { consegna, pre }
  } catch (err) {
    useStudio.getState().patchAgente('scrittore', {
      status: 'errore',
      etichetta: 'errore',
      errore: err instanceof Error ? err.message : 'Errore sconosciuto.',
    })
    throw err
  } finally {
    useScrittore.setState({ inCorso: null })
  }
}

const VALIDA_PASSAGGI = (d: { passaggi?: unknown }) =>
  passaggiValidi(d?.passaggi) ? null : { ok: false, suggerimento: 'Il campo "passaggi" deve avere da 3 a 6 frasi.' }

interface Scaletta {
  punti: { titolo: string; contenuto: string; riferimenti: string[] }[]
  lacune: string[]
}

export async function proponiScaletta(capitoloId: string, sezioneId: string): Promise<void> {
  const { cap, sez } = trova(capitoloId, sezioneId)
  const { consegna } = await chiama<Scaletta>(
    cap,
    sez,
    'scaletta',
    'COMPITO: proponi la SCALETTA della sezione: da 3 a 6 punti in ordine logico. Per ogni punto indica cosa dice e quali riferimenti (F… e C…) userai. Segnala fra le lacune che cosa manca nelle fonti approvate.',
    SCHEMA_SCALETTA,
    4000,
    'medium',
    (d) => VALIDA_PASSAGGI(d) ?? (d?.risultato?.punti?.length >= 2 ? { ok: true } : { ok: false, suggerimento: 'Servono almeno 2 punti.' }),
  )
  const punti = consegna.risultato.punti.map(
    (p) => `${p.titolo}: ${p.contenuto}${p.riferimenti.length ? ` [${p.riferimenti.join(', ')}]` : ''}`,
  )
  useStudio.getState().setScaletta(capitoloId, sezioneId, punti)
  useScrittore.setState((s) => ({ lacune: { ...s.lacune, [sezioneId]: consegna.risultato.lacune } }))
  logOk('scrittore', `Scaletta proposta per "${sez.titolo}": ${punti.length} punti, da approvare.`)
}

export async function proponiBozza(capitoloId: string, sezioneId: string): Promise<void> {
  const { cap, sez } = trova(capitoloId, sezioneId)
  if (!sez.fontiConfermate || !sez.scalettaApprovata) {
    throw new ApiError('sconosciuto', 'Prima della bozza approva le fonti della sezione e la scaletta.')
  }
  const { consegna, pre } = await chiama<{ paragrafi: ParagrafoGrezzo[] }>(
    cap,
    sez,
    'bozza',
    'COMPITO: scrivi la BOZZA completa della sezione seguendo la scaletta approvata, punto per punto, in circa 600-900 parole divise in paragrafi. Cita con i marcatori e gli estratti letterali.',
    SCHEMA_BOZZA,
    16_000,
    'high',
    (d) => VALIDA_PASSAGGI(d) ?? (d?.risultato?.paragrafi?.length >= 2 ? { ok: true } : { ok: false, suggerimento: 'Servono almeno 2 paragrafi.' }),
  )
  const opzione = { etichetta: 'Bozza della sezione', ...integra(pre, sez, consegna.risultato.paragrafi) }
  registraProposta({ sezioneId, capitoloId, comando: 'bozza', indice: null, opzioni: [opzione], creataIl: new Date().toISOString() })
}

function paragrafoCorrente(sez: Sezione, indice: number): string {
  const p = paragrafi(sez.testo)[indice]
  if (!p) throw new ApiError('sconosciuto', 'Seleziona un paragrafo del testo (tocca dentro il paragrafo).')
  return p
}

function contestoParagrafo(sez: Sezione, indice: number): string {
  const tutti = paragrafi(sez.testo)
  return `TESTO ATTUALE DELLA SEZIONE (paragrafi numerati):\n${tutti.map((p, i) => `(${i + 1}) ${p}`).join('\n\n')}\n\nPARAGRAFO SU CUI LAVORARE: (${indice + 1})`
}

export async function riscriviParagrafo(capitoloId: string, sezioneId: string, indice: number, richiesta: string): Promise<void> {
  const { cap, sez } = trova(capitoloId, sezioneId)
  paragrafoCorrente(sez, indice)
  const { consegna, pre } = await chiama<{ paragrafo: ParagrafoGrezzo }>(
    cap,
    sez,
    'riscrivi',
    `${contestoParagrafo(sez, indice)}\n\nCOMPITO: riscrivi SOLO quel paragrafo, coerente con quelli vicini. ${richiesta.trim() ? `Richiesta dello studente: """${richiesta.trim()}"""` : 'Rendilo più chiaro e rigoroso.'} Mantieni le citazioni valide, con estratti letterali.`,
    SCHEMA_PARAGRAFO,
    4000,
    'medium',
    (d) => VALIDA_PASSAGGI(d) ?? (d?.risultato?.paragrafo?.testo ? { ok: true } : { ok: false, suggerimento: 'Manca il paragrafo.' }),
  )
  const opzione = { etichetta: 'Paragrafo riscritto', ...integra(pre, sez, [consegna.risultato.paragrafo]) }
  registraProposta({ sezioneId, capitoloId, comando: 'riscrivi', indice, opzioni: [opzione], creataIl: new Date().toISOString() })
}

export async function dueAlternative(capitoloId: string, sezioneId: string, indice: number): Promise<void> {
  const { cap, sez } = trova(capitoloId, sezioneId)
  paragrafoCorrente(sez, indice)
  const { consegna, pre } = await chiama<{ alternative: { approccio: string; paragrafo: ParagrafoGrezzo }[] }>(
    cap,
    sez,
    'alternative',
    `${contestoParagrafo(sez, indice)}\n\nCOMPITO: proponi DUE alternative di quel paragrafo, con impostazioni diverse (per esempio una più analitica e una più sintetica, oppure un ordine diverso degli argomenti). Indica l'approccio di ciascuna.`,
    SCHEMA_ALTERNATIVE,
    6000,
    'medium',
    (d) => VALIDA_PASSAGGI(d) ?? (d?.risultato?.alternative?.length >= 2 ? { ok: true } : { ok: false, suggerimento: 'Servono esattamente due alternative.' }),
  )
  const opzioni = consegna.risultato.alternative.slice(0, 2).map((a, i) => ({
    etichetta: `Alternativa ${i + 1}: ${a.approccio}`,
    ...integra(pre, sez, [a.paragrafo]),
  }))
  registraProposta({ sezioneId, capitoloId, comando: 'alternative', indice, opzioni, creataIl: new Date().toISOString() })
}

export async function collegaAlCorso(capitoloId: string, sezioneId: string, indice: number): Promise<void> {
  const { cap, sez } = trova(capitoloId, sezioneId)
  paragrafoCorrente(sez, indice)
  const { consegna, pre } = await chiama<{ paragrafo: ParagrafoGrezzo }>(
    cap,
    sez,
    'corso',
    `${contestoParagrafo(sez, indice)}\n\nCOMPITO: riscrivi quel paragrafo COLLEGANDOLO esplicitamente ai concetti del corso (per esempio leva operativa, rischio operativo, liquidità, volatilità dei flussi), citando i passaggi [C…] con estratti letterali. Non aggiungere concetti assenti dal materiale del corso.`,
    SCHEMA_PARAGRAFO,
    4000,
    'medium',
    (d) => VALIDA_PASSAGGI(d) ?? (d?.risultato?.paragrafo?.testo ? { ok: true } : { ok: false, suggerimento: 'Manca il paragrafo.' }),
  )
  const opzione = { etichetta: 'Paragrafo collegato al corso', ...integra(pre, sez, [consegna.risultato.paragrafo]) }
  registraProposta({ sezioneId, capitoloId, comando: 'corso', indice, opzioni: [opzione], creataIl: new Date().toISOString() })
}

function registraProposta(p: Proposta) {
  useScrittore.setState((s) => ({ proposte: { ...s.proposte, [p.sezioneId]: p } }))
  const citazioni = p.opzioni.flatMap((o) => o.citazioni)
  const verdi = citazioni.filter((c) => c.testuale === 'verificato').length
  logOk('scrittore', `Proposta pronta: ${citazioni.length} citazioni, ${verdi} verificate alla lettera.`)
}

/** Applica l'opzione scelta: il testo precedente resta fra le versioni. */
export function accettaProposta(sezioneId: string, indiceOpzione: number) {
  const p = useScrittore.getState().proposte[sezioneId]
  if (!p) return
  const { sez } = trova(p.capitoloId, sezioneId)
  const opzione = p.opzioni[indiceOpzione]
  const nuovoTesto =
    p.indice === null ? opzione.paragrafi.join('\n\n') : sostituisciParagrafo(sez.testo, p.indice, opzione.paragrafi.join('\n\n'))
  // Le citazioni del paragrafo sostituito se ne vanno con lui, anche se il nuovo usa lo stesso marcatore.
  const vecchio = p.indice === null ? '' : normalizza(paragrafi(sez.testo)[p.indice] ?? '')
  const resto = p.indice === null ? '' : normalizza(paragrafi(sez.testo).filter((_, i) => i !== p.indice).join(' '))
  const delVecchio = (c: Citazione) => {
    const inizio = normalizza(c.affermazione).replace(/[.,;:]+$/, '').slice(0, 40)
    return inizio.length > 8 && vecchio.includes(inizio) && !resto.includes(inizio)
  }
  const base = p.indice === null ? [] : sez.citazioni.filter((c) => !delVecchio(c))
  const marcatori = new Set([...nuovoTesto.matchAll(/\[([FC]\d+)\]/g)].map((m) => m[1]))
  const citazioni = [...base, ...opzione.citazioni].filter((c) => marcatori.has(c.rif))
  const nota = { bozza: 'Bozza dello Scrittore', riscrivi: 'Paragrafo riscritto', alternative: opzione.etichetta, corso: 'Collegamento al corso' }[p.comando]
  useStudio.getState().applicaTesto(p.capitoloId, sezioneId, nuovoTesto, citazioni, nota, 'scrittore')
  scartaProposta(sezioneId)
}
