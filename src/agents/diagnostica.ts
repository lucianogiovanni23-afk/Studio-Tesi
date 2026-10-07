import { useStudio } from '../store'
import type { ModelSlot } from '../types'
import { ETICHETTE_SLOT } from './agenti'
import { WEB_SEARCH_TOOL, chiamataConStrumenti, chiamataStrutturata, chiamataStrutturataStream, creaClient, toApiError } from './api'
import { provaCataloghi } from './cataloghi'
import { raccogliRicerca } from './verifyUrls'

export interface EsitoDiagnosi {
  voce: string
  ok: boolean
  messaggio: string
  millisecondi: number
}

const SCHEMA_OK = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
}

async function cronometra(voce: string, fn: () => Promise<string>): Promise<EsitoDiagnosi> {
  const inizio = performance.now()
  try {
    const messaggio = await fn()
    return { voce, ok: true, messaggio, millisecondi: Math.round(performance.now() - inizio) }
  } catch (err) {
    return { voce, ok: false, messaggio: toApiError(err).message, millisecondi: Math.round(performance.now() - inizio) }
  }
}

/**
 * Prova reale, con la chiave dello studente, di ciò che l'app usa: ogni
 * modello configurato risponde con un output strutturato minimo (lo Scrittore
 * anche in streaming), la ricerca web fa una sola ricerca, i cataloghi una
 * query dal browser. Costo complessivo: pochi centesimi.
 */
export async function eseguiDiagnosi(conRicercaWeb: boolean, suEsito: (e: EsitoDiagnosi) => void): Promise<void> {
  const s = useStudio.getState()
  const client = creaClient(s.apiKey)
  const modelli = s.preferenze.modelli
  const perModello = new Map<string, ModelSlot[]>()
  for (const [slot, modello] of Object.entries(modelli) as [ModelSlot, string][]) {
    perModello.set(modello, [...(perModello.get(modello) ?? []), slot])
  }

  for (const [modello, slot] of perModello) {
    const voce = `${modello} (${slot.map((x) => ETICHETTE_SLOT[x]).join(', ')})`
    const streaming = slot.includes('scrittore')
    suEsito(
      await cronometra(voce, async () => {
        const base = {
          client,
          model: modello,
          maxTokens: 1024,
          effort: 'low' as const,
          chi: 'diagnostica' as const,
          azione: 'diagnostica',
          system: [{ type: 'text' as const, text: 'Rispondi solo con il JSON richiesto.' }],
          messages: [{ role: 'user' as const, content: 'Prova di funzionamento: restituisci ok = true.' }],
          schema: SCHEMA_OK,
        }
        const r = streaming
          ? await chiamataStrutturataStream<{ ok: boolean }>(base)
          : await chiamataStrutturata<{ ok: boolean }>(base)
        if (r.ok !== true) throw new Error('risposta inattesa')
        return streaming ? 'output strutturato e streaming funzionano' : 'output strutturato funziona'
      }),
    )
  }

  if (conRicercaWeb) {
    suEsito(
      await cronometra(`Ricerca web (${modelli.bibliotecario})`, async () => {
        const r = await chiamataConStrumenti({
          client,
          model: modelli.bibliotecario,
          maxTokens: 1024,
          effort: 'low',
          chi: 'diagnostica',
          azione: 'diagnostica',
          system: [{ type: 'text', text: 'Fai una sola ricerca e rispondi in una frase.' }],
          messages: [{ role: 'user', content: 'Cerca "ISTAT produzione olio Calabria" e dimmi il titolo del primo risultato.' }],
          tools: [{ ...WEB_SEARCH_TOOL, max_uses: 1 }],
          nomeToolConsegna: '',
        })
        const raccolta = raccogliRicerca(r.blocchi)
        if (raccolta.errori.length) throw new Error(raccolta.errori.join(' '))
        if (!raccolta.usato) throw new Error('il modello non ha usato la ricerca web')
        return `ricerca web attiva: ${raccolta.risultati.length} risultati verificabili`
      }),
    )
  }

  for (const c of await provaCataloghi()) {
    suEsito({ voce: `Catalogo ${c.catalogo}`, ok: c.ok, messaggio: c.messaggio, millisecondi: 0 })
  }
}
