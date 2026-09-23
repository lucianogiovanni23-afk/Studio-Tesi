import type Anthropic from '@anthropic-ai/sdk'
import {
  ApiError,
  WEB_SEARCH_TOOL,
  chiamataConStrumenti,
  type ChiamataBase,
  type Messaggio,
} from './api'
import { TOOL_CONSEGNA_RICERCATORE } from './schemas'
import { raccogliRicerca, type RaccoltaRicerca } from './verifyUrls'
import type { Consegna, RisultatoRicercatore } from '../types'

export interface EsitoRicerca {
  consegna: Consegna<RisultatoRicercatore>
  raccolta: RaccoltaRicerca
}

/**
 * Esegue il turno del Ricercatore.
 *
 * Il modello deve prima cercare davvero, quindi `tool_choice` resta "auto" e il
 * prompt gli chiede di chiudere chiamando il tool di consegna. Se non lo fa, si
 * fa una seconda chiamata che gliela impone: in quel caso la cronologia
 * dell'assistente viene rispedita invariata, perché i risultati di ricerca
 * contengono `encrypted_content` che l'API deve poter decifrare.
 */
export async function eseguiRicerca(opts: ChiamataBase): Promise<EsitoRicerca> {
  const tools = [WEB_SEARCH_TOOL, TOOL_CONSEGNA_RICERCATORE]

  const primo = await chiamataConStrumenti({
    ...opts,
    tools,
    nomeToolConsegna: TOOL_CONSEGNA_RICERCATORE.name,
  })

  const raccolta = raccogliRicerca(primo.blocchi)

  if (primo.consegna) {
    return { consegna: normalizza(primo.consegna), raccolta }
  }

  // Non ha consegnato: glielo si chiede esplicitamente, senza rifare ricerche.
  const messaggi: Messaggio[] = [
    ...primo.messaggi,
    {
      role: 'user',
      content:
        'Ora consegna il risultato in formato strutturato chiamando il tool submit_ricercatore. Riporta solo le fonti che hai davvero trovato con la ricerca web, con gli URL esatti restituiti dai risultati. Non eseguire altre ricerche.',
    },
  ]

  const secondo = await chiamataConStrumenti({
    ...opts,
    messages: messaggi,
    tools,
    toolChoice: { type: 'tool', name: TOOL_CONSEGNA_RICERCATORE.name } as Anthropic.ToolChoice,
    nomeToolConsegna: TOOL_CONSEGNA_RICERCATORE.name,
  })

  if (!secondo.consegna) {
    throw new ApiError(
      'sconosciuto',
      'Il Ricercatore non ha consegnato le fonti in formato strutturato nemmeno su richiesta esplicita.',
      null,
      true,
    )
  }

  // La seconda risposta non contiene nuove ricerche: vale la raccolta del primo giro.
  return { consegna: normalizza(secondo.consegna), raccolta }
}

/** L'input del tool arriva come `unknown`: lo si riporta alla forma attesa. */
function normalizza(grezzo: unknown): Consegna<RisultatoRicercatore> {
  const dato = (grezzo ?? {}) as Partial<Consegna<RisultatoRicercatore>>
  const risultato = (dato.risultato ?? {}) as Partial<RisultatoRicercatore>
  return {
    passaggi: Array.isArray(dato.passaggi) ? dato.passaggi.filter((p) => typeof p === 'string') : [],
    risultato: {
      fonti: Array.isArray(risultato.fonti) ? risultato.fonti : [],
      fonti_scartate: Array.isArray(risultato.fonti_scartate) ? risultato.fonti_scartate : [],
    },
  }
}
