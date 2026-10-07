import { fontiPertinenti } from '../components/scrittura/pertinenza'
import type { Fonte, Progetto } from '../types'

export type LivelloCopertura = 'scoperta' | 'debole' | 'coperta'

export interface CoperturaSezione {
  capitoloId: string
  sezioneId: string
  numero: string
  titolo: string
  obiettivo: string
  /** Fonti scelte per la sezione (passo 1 della scrittura). */
  approvate: Fonte[]
  /** Fonti effettivamente citate nel testo. */
  citate: Fonte[]
  /** Fonti della biblioteca che sembrano pertinenti ma non sono state scelte. */
  suggerite: Fonte[]
  livello: LivelloCopertura
}

export interface Copertura {
  sezioni: CoperturaSezione[]
  /** Fonti in biblioteca che nessuna sezione usa. */
  inutilizzate: Fonte[]
  conteggio: Record<LivelloCopertura, number>
}

/** Sotto le due fonti una sezione è debole: un'affermazione si regge meglio su più studi. */
export function livello(numeroFonti: number): LivelloCopertura {
  return numeroFonti === 0 ? 'scoperta' : numeroFonti === 1 ? 'debole' : 'coperta'
}

export function copertura(p: Progetto): Copertura {
  const perId = new Map(p.fonti.map((f) => [f.id, f]))
  const usate = new Set<string>()
  const sezioni: CoperturaSezione[] = []
  p.capitoli.forEach((c, i) =>
    c.sezioni.forEach((s, j) => {
      const approvate = s.fontiApprovate.map((id) => perId.get(id)).filter((f): f is Fonte => Boolean(f))
      const citateId = [...new Set(s.citazioni.map((x) => x.fonteId).filter((id): id is string => Boolean(id)))]
      const citate = citateId.map((id) => perId.get(id)).filter((f): f is Fonte => Boolean(f))
      const tutte = new Set([...approvate, ...citate].map((f) => f.id))
      tutte.forEach((id) => usate.add(id))
      const suggerite = fontiPertinenti(p.fonti, s)
        .filter((x) => x.peso >= 2 && !tutte.has(x.f.id))
        .slice(0, 3)
        .map((x) => x.f)
      sezioni.push({
        capitoloId: c.id,
        sezioneId: s.id,
        numero: `${i + 1}.${j + 1}`,
        titolo: s.titolo,
        obiettivo: s.obiettivo,
        approvate,
        citate,
        suggerite,
        livello: livello(tutte.size),
      })
    }),
  )
  const conteggio = { scoperta: 0, debole: 0, coperta: 0 }
  for (const s of sezioni) conteggio[s.livello] += 1
  return { sezioni, inutilizzate: p.fonti.filter((f) => !usate.has(f.id)), conteggio }
}

/** La domanda da proporre al Bibliotecario per una sezione scoperta. */
export function domandaPerSezione(s: CoperturaSezione): string {
  return [s.titolo, s.obiettivo].filter(Boolean).join(': ')
}
