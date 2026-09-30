import type Anthropic from '@anthropic-ai/sdk'
import {
  ApiError,
  WEB_FETCH_TOOL,
  WEB_SEARCH_TOOL,
  chiamataConStrumenti,
  type ChiamataBase,
  type Messaggio,
} from './api'
import { testoDaPdfBase64 } from './corpus'
import { TOOL_CONSEGNA_RICERCATORE } from './schemas'
import { raccogliRicerca, type RaccoltaRicerca } from './verifyUrls'
import type { Consegna } from '../types'

export interface FonteDichiarata {
  titolo: string
  url: string
  tipo: 'paper' | 'dataset' | 'articolo' | 'report'
  descrizione: string
  perche_rilevante: string
  estratti: string[]
}

export interface ConsegnaRicercatore {
  fonti: FonteDichiarata[]
  fonti_scartate: { titolo: string; url: string; motivo: string }[]
}

export interface EsitoRicerca {
  consegna: Consegna<ConsegnaRicercatore>
  raccolta: RaccoltaRicerca
  /** Testo leggibile di ogni pagina letta, per URL normalizzato. */
  testi: Map<string, string>
}

/**
 * Turno del Ricercatore: cerca, legge le pagine e consegna con il tool.
 * Se non consegna da solo, una seconda chiamata glielo impone, rimandando la
 * cronologia invariata (gli encrypted_content vanno rispediti intatti).
 */
export async function eseguiRicerca(opts: ChiamataBase): Promise<EsitoRicerca> {
  const tools = [WEB_SEARCH_TOOL, WEB_FETCH_TOOL, TOOL_CONSEGNA_RICERCATORE]

  const primo = await chiamataConStrumenti({ ...opts, tools, nomeToolConsegna: TOOL_CONSEGNA_RICERCATORE.name })
  const raccolta = raccogliRicerca(primo.blocchi)
  let grezza = primo.consegna

  if (!grezza) {
    const messaggi: Messaggio[] = [
      ...primo.messaggi,
      {
        role: 'user',
        content:
          'Ora consegna il risultato chiamando il tool submit_ricercatore. Riporta solo fonti trovate con la ricerca web, con gli URL esatti, e per ciascuna gli estratti copiati alla lettera dalle pagine che hai letto. Non eseguire altre ricerche.',
      },
    ]
    const secondo = await chiamataConStrumenti({
      ...opts,
      messages: messaggi,
      tools,
      toolChoice: { type: 'tool', name: TOOL_CONSEGNA_RICERCATORE.name } as Anthropic.ToolChoice,
      nomeToolConsegna: TOOL_CONSEGNA_RICERCATORE.name,
    })
    grezza = secondo.consegna
    if (!grezza) {
      throw new ApiError(
        'sconosciuto',
        'Il Ricercatore non ha consegnato le fonti in formato strutturato nemmeno su richiesta esplicita.',
        null,
        true,
      )
    }
  }

  // Testo di ogni pagina letta: i PDF arrivano in base64 e si estraggono qui.
  const testi = new Map<string, string>()
  for (const [chiave, pagina] of raccolta.pagine) {
    if (pagina.testo) testi.set(chiave, pagina.testo)
    else if (pagina.pdfBase64) {
      try {
        testi.set(chiave, await testoDaPdfBase64(pagina.pdfBase64))
      } catch {
        // PDF illeggibile: i suoi estratti risulteranno non verificati.
      }
    }
  }

  return { consegna: normalizza(grezza), raccolta, testi }
}

/** L'input del tool arriva come `unknown`: lo si riporta alla forma attesa. */
function normalizza(grezzo: unknown): Consegna<ConsegnaRicercatore> {
  const dato = (grezzo ?? {}) as Partial<Consegna<ConsegnaRicercatore>>
  const r = (dato.risultato ?? {}) as Partial<ConsegnaRicercatore>
  return {
    passaggi: Array.isArray(dato.passaggi) ? dato.passaggi.filter((p) => typeof p === 'string') : [],
    risultato: {
      fonti: (Array.isArray(r.fonti) ? r.fonti : []).map((f) => ({
        ...f,
        estratti: Array.isArray(f?.estratti) ? f.estratti.filter((e) => typeof e === 'string') : [],
      })),
      fonti_scartate: Array.isArray(r.fonti_scartate) ? r.fonti_scartate : [],
    },
  }
}
