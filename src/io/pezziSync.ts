import type { Capitolo, Fonte, Progetto } from '../types'

/**
 * Il progetto diviso in pezzi per la sincronizzazione: un file per capitolo,
 * le fonti in pochi "cassetti" (una fonte cambia → si rimanda solo il suo
 * cassetto), il registro (ricerche, costi, risultati da approvare) e le
 * conversazioni. Tutto il resto è piccolo e sta nel file principale, che
 * elenca i pezzi con lo sha esatto della loro versione su GitHub: chi riceve
 * legge proprio quelle versioni, anche se nel frattempo un pezzo è cambiato.
 */

export const CARTELLA_PEZZI = 'studio-tesi/pezzi'
const CASSETTI_FONTI = 8

/** Come sono ordinati capitoli e fonti nel progetto. */
export interface Struttura {
  capitoli: string[]
  fonti: string[]
}

export interface Diviso {
  /** Il progetto senza le parti grosse (capitoli e fonti restano vuoti: servono alle versioni vecchie dell'app per spiegare l'errore). */
  scheletro: Progetto
  struttura: Struttura
  /** percorso → JSON del pezzo, in ordine stabile. */
  pezzi: [string, string][]
}

function sicuro(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'x'
}

function cassetto(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0
  return Math.abs(h) % CASSETTI_FONTI
}

/** Percorsi dei capitoli: stabili e senza doppioni anche con id strani. */
function percorsiCapitoli(capitoli: Capitolo[]): string[] {
  const usati = new Set<string>()
  return capitoli.map((c) => {
    let p = `${CARTELLA_PEZZI}/capitolo-${sicuro(c.id)}.json`
    for (let n = 2; usati.has(p); n++) p = `${CARTELLA_PEZZI}/capitolo-${sicuro(c.id)}-${n}.json`
    usati.add(p)
    return p
  })
}

export function dividi(p: Progetto): Diviso {
  const pezzi: [string, string][] = []
  const percorsi = percorsiCapitoli(p.capitoli)
  p.capitoli.forEach((c, i) => pezzi.push([percorsi[i], JSON.stringify(c)]))
  const cassetti: Fonte[][] = Array.from({ length: CASSETTI_FONTI }, () => [])
  for (const f of p.fonti) cassetti[cassetto(f.id)].push(f)
  cassetti.forEach((fonti, k) => {
    if (fonti.length) pezzi.push([`${CARTELLA_PEZZI}/fonti-${k}.json`, JSON.stringify(fonti)])
  })
  pezzi.push([`${CARTELLA_PEZZI}/registro.json`, JSON.stringify({ ricerche: p.ricerche, usi: p.usi, inAttesa: p.inAttesa })])
  pezzi.push([`${CARTELLA_PEZZI}/conversazioni.json`, JSON.stringify({ chat: p.chat, conversazioni: p.conversazioni })])
  const scheletro: Progetto = { ...p, capitoli: [], fonti: [], ricerche: [], usi: [], inAttesa: [], chat: [], conversazioni: {} }
  return { scheletro, struttura: { capitoli: percorsi, fonti: p.fonti.map((f) => f.id) }, pezzi }
}

function oggetto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** Rimette insieme il progetto. Se manca un pezzo o non torna qualcosa, si ferma: meglio niente che un progetto a metà. */
export function ricomponi(scheletro: Progetto, struttura: Struttura, pezzi: Map<string, string>): Progetto {
  const leggi = (percorso: string): unknown => {
    const json = pezzi.get(percorso)
    if (json === undefined) throw new Error(`manca ${percorso}`)
    return JSON.parse(json)
  }
  const capitoli = struttura.capitoli.map((percorso) => {
    const c = leggi(percorso)
    if (!oggetto(c) || !Array.isArray(c.sezioni)) throw new Error(`${percorso} non è un capitolo`)
    return c as unknown as Capitolo
  })
  const perId = new Map<string, Fonte>()
  for (const [percorso] of pezzi) {
    if (!/\/fonti-\d+\.json$/.test(percorso)) continue
    const elenco = leggi(percorso)
    if (!Array.isArray(elenco)) throw new Error(`${percorso} non è un elenco di fonti`)
    for (const f of elenco as Fonte[]) perId.set(f.id, f)
  }
  const fonti = struttura.fonti.map((id) => {
    const f = perId.get(id)
    if (!f) throw new Error(`manca la fonte ${id}`)
    return f
  })
  const registro = leggi(`${CARTELLA_PEZZI}/registro.json`) as Pick<Progetto, 'ricerche' | 'usi' | 'inAttesa'>
  const conv = leggi(`${CARTELLA_PEZZI}/conversazioni.json`) as Pick<Progetto, 'chat' | 'conversazioni'>
  if (!oggetto(registro) || !oggetto(conv)) throw new Error('registro o conversazioni rovinati')
  return {
    ...scheletro,
    capitoli,
    fonti,
    ricerche: registro.ricerche ?? [],
    usi: registro.usi ?? [],
    inAttesa: registro.inAttesa ?? [],
    chat: conv.chat ?? [],
    conversazioni: conv.conversazioni ?? {},
  }
}
