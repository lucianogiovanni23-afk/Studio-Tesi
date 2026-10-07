import type { Passaggio, Progetto, Schermata } from '../types'

/**
 * Ricerca in tutta la tesi, in codice e gratuita: sezioni, fonti (anche il
 * testo completo e le schede), glossario, materiale del corso, osservazioni
 * e chat. Ogni risultato ha un estratto con le parole trovate.
 */

export type GruppoRisultati = 'sezioni' | 'fonti' | 'glossario' | 'corso' | 'osservazioni' | 'chat'

export interface Risultato {
  id: string
  gruppo: GruppoRisultati
  titolo: string
  /** Estratto diviso in pezzi: quelli con `trovato` vanno evidenziati. */
  estratto: { testo: string; trovato: boolean }[]
  punteggio: number
  apri:
    | { tipo: 'sezione'; capitoloId: string; sezioneId: string }
    | { tipo: 'fonte'; fonteId: string }
    | { tipo: 'schermata'; schermata: Schermata }
}

export const NOME_GRUPPO: Record<GruppoRisultati, string> = {
  sezioni: 'Testo della tesi',
  fonti: 'Fonti',
  glossario: 'Glossario',
  corso: 'Lezioni del corso',
  osservazioni: 'Osservazioni del relatore',
  chat: 'Chat',
}

/** Minuscole e senza accenti, un carattere per carattere: le posizioni restano quelle del testo originale. */
function piega(testo: string): string {
  let fuori = ''
  for (const c of testo) {
    const base = c.normalize('NFD')[0] ?? c
    fuori += (base.length === c.length ? base : c).toLowerCase()
  }
  return fuori.length === testo.length ? fuori : testo.toLowerCase()
}

export function termini(domanda: string): string[] {
  return [...new Set(piega(domanda).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2))]
}

const MARGINE = 70

/** Estratto intorno alla prima parola trovata, con tutte le parole evidenziate. */
function estratto(testo: string, cercate: string[]): { pezzi: Risultato['estratto']; colpi: number } | null {
  const piegato = piega(testo)
  const posizioni: [number, number][] = []
  for (const t of cercate) {
    let i = piegato.indexOf(t)
    while (i >= 0) {
      posizioni.push([i, i + t.length])
      i = piegato.indexOf(t, i + t.length)
    }
  }
  // Tutte le parole devono comparire nel testo.
  if (cercate.some((t) => !piegato.includes(t))) return null
  posizioni.sort((a, b) => a[0] - b[0])
  const primo = posizioni[0]?.[0] ?? 0
  const da = Math.max(0, primo - MARGINE)
  const a = Math.min(testo.length, primo + MARGINE * 2)
  const pezzi: Risultato['estratto'] = []
  let cursore = da
  for (const [s, e] of posizioni) {
    if (s < cursore || s >= a) continue
    if (s > cursore) pezzi.push({ testo: testo.slice(cursore, s), trovato: false })
    pezzi.push({ testo: testo.slice(s, Math.min(e, a)), trovato: true })
    cursore = Math.min(e, a)
  }
  if (cursore < a) pezzi.push({ testo: testo.slice(cursore, a), trovato: false })
  if (da > 0) pezzi.unshift({ testo: '…', trovato: false })
  if (a < testo.length) pezzi.push({ testo: '…', trovato: false })
  return { pezzi: pezzi.map((p) => ({ ...p, testo: p.testo.replace(/\s+/g, ' ') })), colpi: posizioni.length }
}

export function cercaOvunque(p: Progetto, domanda: string, passaggiCorso: (d: string) => Passaggio[]): Risultato[] {
  const cercate = termini(domanda)
  if (cercate.length === 0) return []
  const fuori: Risultato[] = []
  const aggiungi = (r: Omit<Risultato, 'estratto' | 'punteggio'>, testo: string, bonusTitolo: string) => {
    const e = estratto(testo, cercate) ?? estratto(bonusTitolo, cercate)
    if (!e) return
    const nelTitolo = cercate.every((t) => piega(bonusTitolo).includes(t))
    fuori.push({ ...r, estratto: e.pezzi, punteggio: e.colpi + (nelTitolo ? 5 : 0) })
  }

  p.capitoli.forEach((c, i) =>
    c.sezioni.forEach((s, j) => {
      const titolo = `${i + 1}.${j + 1} ${s.titolo}`
      aggiungi(
        { id: `sez-${s.id}`, gruppo: 'sezioni', titolo, apri: { tipo: 'sezione', capitoloId: c.id, sezioneId: s.id } },
        [s.testo.replace(/\[[A-Z]\d+\]/g, ''), s.obiettivo, s.scaletta.join(' · ')].filter(Boolean).join('\n'),
        titolo,
      )
    }),
  )

  for (const f of p.fonti) {
    const titolo = `[F${f.numero}] ${f.autori[0]?.split(' ').pop() ?? ''}${f.anno ? ` ${f.anno}` : ''} · ${f.titolo}`
    const scheda = f.scheda ? [f.scheda.risultati, f.scheda.rilevanza, ...f.scheda.frasiChiave.map((x) => x.testo)].join('\n') : ''
    aggiungi({ id: `fonte-${f.id}`, gruppo: 'fonti', titolo, apri: { tipo: 'fonte', fonteId: f.id } }, [scheda, f.abstract, f.testo].filter(Boolean).join('\n'), `${f.titolo} ${f.autori.join(' ')}`)
  }

  for (const g of p.glossario) {
    aggiungi({ id: `gl-${g.id}`, gruppo: 'glossario', titolo: g.termine, apri: { tipo: 'schermata', schermata: 'glossario' } }, `${g.termine}: ${g.definizione} ${g.varianti.join(', ')}`, g.termine)
  }

  for (const ps of passaggiCorso(domanda)) {
    const pagine = ps.pagine[0] === ps.pagine[1] ? `p. ${ps.pagine[0]}` : `pp. ${ps.pagine[0]}–${ps.pagine[1]}`
    const e = estratto(ps.testo, cercate) ?? estratto(ps.testo, cercate.slice(0, 1))
    if (e) fuori.push({ id: `corso-${ps.id}`, gruppo: 'corso', titolo: `${ps.file}, ${pagine}`, estratto: e.pezzi, punteggio: e.colpi, apri: { tipo: 'schermata', schermata: 'corso' } })
  }

  p.osservazioni.forEach((o, i) => {
    aggiungi({ id: `oss-${o.id}`, gruppo: 'osservazioni', titolo: `Osservazione ${i + 1}${o.stato === 'aperta' ? ' (aperta)' : ''}`, apri: { tipo: 'schermata', schermata: 'revisione' } }, o.testo, '')
  })

  for (const m of p.chat) {
    aggiungi({ id: `chat-${m.id}`, gruppo: 'chat', titolo: m.ruolo === 'studente' ? 'Tua domanda' : 'Risposta', apri: { tipo: 'schermata', schermata: 'chat' } }, m.testo, '')
  }

  return fuori.sort((a, b) => b.punteggio - a.punteggio)
}
