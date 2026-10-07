import { create } from 'zustand'
import { toApiError } from '../agents/api'
import { AGENTE } from '../agents/agenti'
import { useStudio } from '../store'
import type { AgentKey } from '../types'

/** Che cosa sta facendo ogni persona dell'ufficio in questo momento (non si salva). */
export const useUfficio = create<{ occupato: Partial<Record<AgentKey, string>>; avanzamento: Partial<Record<AgentKey, string>> }>(() => ({
  occupato: {},
  avanzamento: {},
}))

export function segnaAvanzamento(k: AgentKey, testo: string | null) {
  useUfficio.setState((s) => ({ avanzamento: { ...s.avanzamento, [k]: testo ?? undefined } }))
}

/**
 * Esegue un'azione scelta nella conversazione: la tua risposta entra nello
 * storico, la persona lavora e poi racconta com'è andata.
 */
export async function eseguiAzione(k: AgentKey, etichetta: string, lavoro: string, fai: () => Promise<string | void>) {
  if (useUfficio.getState().occupato[k]) return
  const st = useStudio.getState
  st().aggiungiBattuta(k, { da: 'studente', testo: etichetta })
  useUfficio.setState((s) => ({ occupato: { ...s.occupato, [k]: lavoro } }))
  try {
    const risposta = await fai()
    if (risposta) {
      st().aggiungiBattuta(k, { da: 'agente', testo: risposta, tono: 'ok' })
      st().faiParlare(Math.min(6000, 1200 + risposta.length * 22))
    }
  } catch (err) {
    const annullato = err instanceof DOMException && err.name === 'AbortError'
    st().aggiungiBattuta(k, {
      da: 'agente',
      testo: annullato ? 'Va bene, ci fermiamo qui. Riprendiamo quando vuoi.' : `Non ci sono riuscit${AGENTE[k].persona.titolo.endsWith('a') ? 'a' : 'o'}: ${toApiError(err).message}`,
      tono: annullato ? undefined : 'errore',
    })
  } finally {
    useUfficio.setState((s) => ({ occupato: { ...s.occupato, [k]: undefined }, avanzamento: { ...s.avanzamento, [k]: undefined } }))
  }
}
