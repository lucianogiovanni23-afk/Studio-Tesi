import { useStudio } from '../store'
import type { AgentKey } from '../types'
import { AGENTE } from './agenti'
import type { Messaggio } from './api'
import { chiamataChatStream, creaClient, toApiError } from './api'
import { contestoStabile, contestoVariabile } from './chat'
import { SYSTEM_CHAT } from './prompts'

/**
 * Domande libere a una persona dell'ufficio. Ognuno risponde dal suo ruolo,
 * conoscendo tutta la tesi (lo stesso contesto della chat). Senza chiave la
 * domanda passa da Claude.ai, come ogni altro comando.
 */

const STORIA = 10

function ruolo(k: AgentKey): string {
  const d = AGENTE[k]
  return `In questa conversazione sei ${d.persona.nome}, ${d.persona.titolo.toLowerCase()} dello studio della tesi. Il tuo compito: ${d.ruolo}
Parli in prima persona, con cortesia professionale e frasi brevi, come un collega in ufficio. Se la domanda riguarda il lavoro di un collega (Giulia Romano per il corso, Marco Ferrara per le fonti, Luca Esposito per la scrittura, Elena Conti per la revisione), rispondi comunque e indica a chi chiedere.`
}

const lavori = new Set<AgentKey>()

export function staRispondendo(k: AgentKey): boolean {
  return lavori.has(k)
}

export async function chiediAgente(k: AgentKey, domanda: string): Promise<void> {
  const testo = domanda.trim()
  if (!testo || lavori.has(k)) return
  const s = useStudio.getState()
  const storia = (s.progetto.conversazioni[k] ?? []).slice(-STORIA)
  s.aggiungiBattuta(k, { da: 'studente', testo })
  const id = useStudio.getState().aggiungiBattuta(k, { da: 'agente', testo: '…' })
  lavori.add(k)
  const messaggi: Messaggio[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: contestoStabile(), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `${contestoVariabile()}\n\nUsa queste informazioni per rispondere allo studente.` },
      ],
    },
    { role: 'assistant', content: 'Ho davanti la tesi e lo stato del lavoro.' },
    ...storia.filter((b) => b.testo.trim() && b.testo !== '…').map((b): Messaggio => ({ role: b.da === 'studente' ? 'user' : 'assistant', content: b.testo })),
    { role: 'user', content: testo },
  ]
  let accumulato = ''
  try {
    const finale = await chiamataChatStream({
      client: creaClient(s.apiKey),
      model: s.preferenze.modelli.chat,
      maxTokens: 2000,
      effort: 'low',
      chi: 'chat',
      azione: `domanda a ${AGENTE[k].persona.nome}`,
      system: [{ type: 'text', text: `${SYSTEM_CHAT}\n\n${ruolo(k)}` }],
      messages: messaggi,
      onTesto: (pezzo) => {
        accumulato += pezzo
        useStudio.getState().aggiornaBattuta(k, id, accumulato)
      },
    })
    useStudio.getState().aggiornaBattuta(k, id, finale || accumulato || '(nessuna risposta)')
    useStudio.getState().faiParlare(Math.min(6000, 1500 + (finale || '').length * 25))
  } catch (err) {
    const annullato = err instanceof DOMException && err.name === 'AbortError'
    useStudio.getState().aggiornaBattuta(k, id, annullato ? 'Va bene, lasciamo stare per ora.' : `Non sono riuscito a rispondere: ${toApiError(err).message}`)
  } finally {
    lavori.delete(k)
  }
}
