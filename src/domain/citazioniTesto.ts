import type { Citazione, Fonte, StileCitazione } from '../types'
import { autoreAnno } from './bibliografia'

/**
 * Testo delle sezioni con i marcatori di citazione: [F12] rimanda alla fonte
 * numero 12 della biblioteca, [C3] a un passaggio del corso registrato fra le
 * citazioni della sezione. Il testo resta semplice e modificabile a mano.
 */

export const MARCATORE = /\[([FC]\d+)\]/g

/** Paragrafi non vuoti, separati da una riga vuota. */
export function paragrafi(testo: string): string[] {
  return testo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** Indice del paragrafo in cui si trova il cursore. */
export function paragrafoAlCursore(testo: string, posizione: number): number {
  const prima = testo.slice(0, posizione)
  const blocchi = prima.split(/\n\s*\n/)
  // Il blocco corrente conta solo se contiene già testo; altrimenti è il successivo.
  return Math.max(0, blocchi.filter((b) => b.trim()).length - (blocchi[blocchi.length - 1].trim() ? 1 : 0))
}

/** Sostituisce il paragrafo `indice` (fra quelli non vuoti), conservando il resto del testo. */
export function sostituisciParagrafo(testo: string, indice: number, nuovo: string): string {
  const parti = testo.split(/(\n\s*\n)/)
  let contatore = -1
  for (let i = 0; i < parti.length; i += 2) {
    if (!parti[i].trim()) continue
    contatore += 1
    if (contatore === indice) {
      parti[i] = nuovo.trim()
      return parti.join('')
    }
  }
  return testo.trim() ? `${testo.trimEnd()}\n\n${nuovo.trim()}` : nuovo.trim()
}

export function marcatoriDi(testo: string): Set<string> {
  return new Set([...testo.matchAll(MARCATORE)].map((m) => m[1].toUpperCase()))
}

/** Tiene solo le citazioni il cui marcatore compare ancora nel testo. */
export function pulisciCitazioni(testo: string, citazioni: Citazione[]): Citazione[] {
  const presenti = marcatoriDi(testo)
  return citazioni.filter((c) => presenti.has(c.rif.toUpperCase()))
}

export type Colore = 'verde' | 'ambra' | 'rosso'

/** Verde se verificata, ambra se quasi letterale o sostegno parziale, rosso se non ritrovata o non supportata. */
export function coloreCitazione(c: Citazione): Colore {
  if (c.testuale === 'non_trovato' || c.testuale === 'rif_sconosciuto' || c.giudizio === 'non_supportata') return 'rosso'
  if (c.testuale === 'approssimato' || c.giudizio === 'parziale') return 'ambra'
  return 'verde'
}

/** Il colore peggiore fra le citazioni di uno stesso marcatore. */
export function coloreMarcatore(rif: string, citazioni: Citazione[]): Colore | 'senza' {
  const proprie = citazioni.filter((c) => c.rif.toUpperCase() === rif.toUpperCase())
  if (proprie.length === 0) return 'senza'
  const colori = proprie.map(coloreCitazione)
  return colori.includes('rosso') ? 'rosso' : colori.includes('ambra') ? 'ambra' : 'verde'
}

export type Segmento = { tipo: 'testo'; testo: string } | { tipo: 'marcatore'; rif: string }

export function segmenti(paragrafo: string): Segmento[] {
  const fuori: Segmento[] = []
  let ultimo = 0
  for (const m of paragrafo.matchAll(MARCATORE)) {
    if (m.index > ultimo) fuori.push({ tipo: 'testo', testo: paragrafo.slice(ultimo, m.index) })
    fuori.push({ tipo: 'marcatore', rif: m[1].toUpperCase() })
    ultimo = m.index + m[0].length
  }
  if (ultimo < paragrafo.length) fuori.push({ tipo: 'testo', testo: paragrafo.slice(ultimo) })
  return fuori
}

// ---------------------------------------------------------------------------
// Esportazione nello stile scelto
// ---------------------------------------------------------------------------

function fonteDiRif(rif: string, fonti: Fonte[]): Fonte | undefined {
  const n = Number(rif.slice(1))
  return fonti.find((f) => f.numero === n)
}

function rimandoCorso(rif: string, citazioni: Citazione[]): string {
  const p = citazioni.find((c) => c.rif.toUpperCase() === rif && c.passaggio)?.passaggio
  if (!p) return 'materiale del corso'
  const [da, a] = p.pagine
  return `${p.file.replace(/\.(pdf|txt|md)$/i, '')}, ${da === a ? `p. ${da}` : `pp. ${da}-${a}`}`
}

/** Riferimento completo per le note a piè di pagina. */
export function riferimentoCompleto(f: Fonte): string {
  const autori = f.autori.length ? f.autori.join(', ') : 'Autore n.d.'
  const anno = f.anno ?? 's.d.'
  const dove = [f.rivista, f.doi ? `doi:${f.doi}` : f.url].filter(Boolean).join(', ')
  return `${autori} (${anno}), ${f.titolo}${dove ? `, ${dove}` : ''}.`
}

const APICE = '⁰¹²³⁴⁵⁶⁷⁸⁹'
function apice(n: number): string {
  return String(n)
    .split('')
    .map((c) => APICE[Number(c)])
    .join('')
}

/**
 * Testo pronto da copiare: in stile autore-anno i marcatori diventano
 * "(Rossi, 2021)" e quelli consecutivi si uniscono "(Rossi, 2021; Verdi, 2020)";
 * in stile note diventano un numero in apice con le note in fondo.
 */
export function esportaTesto(testo: string, citazioni: Citazione[], fonti: Fonte[], stile: StileCitazione): string {
  const gruppo = /(?:\s*\[[FC]\d+\])+/g
  const note: string[] = []

  const convertito = testo.replace(gruppo, (blocco) => {
    const rifs = [...blocco.matchAll(MARCATORE)].map((m) => m[1].toUpperCase())
    if (stile === 'note') {
      const testi = rifs.map((r) => {
        if (r.startsWith('C')) return `Materiale del corso: ${rimandoCorso(r, citazioni)}.`
        const f = fonteDiRif(r, fonti)
        return f ? riferimentoCompleto(f) : `Fonte ${r} non trovata in biblioteca.`
      })
      note.push(testi.join(' '))
      return apice(note.length)
    }
    const voci = rifs.map((r) => {
      if (r.startsWith('C')) return rimandoCorso(r, citazioni)
      const f = fonteDiRif(r, fonti)
      return f ? autoreAnno(f, false) : `fonte ${r}?`
    })
    return ` (${[...new Set(voci)].join('; ')})`
  })

  if (stile === 'note' && note.length) {
    return `${convertito}\n\n—\n${note.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
  }
  return convertito
}

export type Parte = { tipo: 'testo'; testo: string } | { tipo: 'nota'; testo: string }

/**
 * Un paragrafo diviso in testo e note, per l'esportazione in Word: in stile
 * autore-anno i rimandi restano nel testo; in stile note ogni gruppo di
 * marcatori diventa una nota a piè di pagina vera.
 */
export function partiParagrafo(paragrafo: string, citazioni: Citazione[], fonti: Fonte[], stile: StileCitazione): Parte[] {
  if (stile === 'autore-anno') return [{ tipo: 'testo', testo: esportaTesto(paragrafo, citazioni, fonti, 'autore-anno') }]
  const parti: Parte[] = []
  const gruppo = /(?:\s*\[[FC]\d+\])+/g
  let ultimo = 0
  for (const m of paragrafo.matchAll(gruppo)) {
    if (m.index > ultimo) parti.push({ tipo: 'testo', testo: paragrafo.slice(ultimo, m.index) })
    const rifs = [...m[0].matchAll(MARCATORE)].map((x) => x[1].toUpperCase())
    const testi = rifs.map((r) => {
      if (r.startsWith('C')) return `Materiale del corso: ${rimandoCorso(r, citazioni)}.`
      const f = fonteDiRif(r, fonti)
      return f ? riferimentoCompleto(f) : `Fonte ${r} non trovata in biblioteca.`
    })
    parti.push({ tipo: 'nota', testo: testi.join(' ') })
    ultimo = m.index + m[0].length
  }
  if (ultimo < paragrafo.length) parti.push({ tipo: 'testo', testo: paragrafo.slice(ultimo) })
  return parti
}

/** Testo leggibile per la modalità carta: marcatori convertiti nello stile, senza note in fondo. */
export function testoPerLettura(testo: string, citazioni: Citazione[], fonti: Fonte[]): string {
  return esportaTesto(testo, citazioni, fonti, 'autore-anno')
}
