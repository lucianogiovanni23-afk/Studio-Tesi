import { DOMANDE_CORSO } from '../domain/dominio'
import { useStudio } from '../store'
import type { Consegna, VoceGlossario } from '../types'
import { ApiError, chiamataStrutturata, creaClient } from './api'
import { normalizza, verificaEstratto } from './citations'
import { BUDGET_LETTORE, collocazione, recuperaPassaggi, statisticheCorpus, testoCorpusNormalizzato } from './corpus'
import { stimaChiamata, tokenDaCaratteri, type Stima } from './costs'
import { SYSTEM_LETTORE, elencoPassaggi, intestazioneProgetto } from './prompts'
import { SCHEMA_LESSICO } from './schemas'
import { logOk, passaggiValidi, sorveglia } from './supervisor'

interface TermineGrezzo {
  termine: string
  definizione: string
  varianti_da_evitare: string[]
  rif: string
  estratto: string
}

/** Occorrenze di un'espressione nel testo normalizzato, a parole intere. */
function conta(testoNorm: string, espressione: string): number {
  const e = normalizza(espressione).replace(/[.,'"-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (e.length < 3) return 0
  const re = new RegExp(`(^|[^a-z0-9])${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`, 'g')
  return testoNorm.match(re)?.length ?? 0
}

export function stimaLessico(modello: string): Stima {
  const caratteri = Math.min(statisticheCorpus().caratteri, BUDGET_LETTORE)
  return stimaChiamata(modello, { input: tokenDaCaratteri(caratteri) + 4000, output: 5000 })
}

export interface EsitoLessico {
  nuove: number
  aggiornate: number
  scartati: string[]
  variantiTolte: number
}

/**
 * Il Lettore ricava il lessico del corso: i termini come li scrivono le
 * lezioni. In codice si tengono solo i termini che compaiono davvero nel
 * materiale e si tolgono le "varianti da evitare" che il corso stesso usa spesso.
 */
export async function ricavaLessico(): Promise<EsitoLessico> {
  const s = useStudio.getState()
  const p = s.progetto
  const passaggi = recuperaPassaggi(
    [...DOMANDE_CORSO, ...p.glossario.map((v) => v.termine), p.titolo, p.domanda],
    BUDGET_LETTORE,
  )
  if (passaggi.length === 0) throw new ApiError('sconosciuto', 'Carica prima il materiale del corso.')

  const client = creaClient(s.apiKey)
  s.patchAgente('lettore', { status: 'lavoro', etichetta: 'ricavo il lessico del corso…', errore: null })
  try {
    const consegna = await sorveglia<Consegna<{ termini: TermineGrezzo[] }>>({
      agente: 'lettore',
      passo: 'Lessico del corso',
      esegui: (_t, suggerimento) =>
        chiamataStrutturata({
          client,
          model: s.preferenze.modelli.lettore,
          maxTokens: 8000,
          effort: 'medium',
          chi: 'lettore',
          azione: 'lessico del corso',
          system: [{ type: 'text', text: suggerimento ? `${SYSTEM_LETTORE}\n\n${suggerimento}` : SYSTEM_LETTORE }],
          messages: [
            {
              role: 'user',
              content: `${intestazioneProgetto(p)}\n\nPASSAGGI DEL MATERIALE DEL CORSO:\n"""\n${elencoPassaggi(passaggi)}\n"""\n\nCOMPITO: ricava il LESSICO DEL CORSO utile a questa tesi: da 15 a 40 termini tecnici di Finanza Aziendale scritti esattamente come li usano le lezioni (per esempio "grado di leva operativa", "margine di contribuzione", "fabbisogno finanziario"). Per ognuno indica le varianti generiche o i sinonimi che un testo scritto da un'IA userebbe al posto del termine del corso, il passaggio in cui è definito e una frase copiata alla lettera che lo contiene.`,
            },
          ],
          schema: SCHEMA_LESSICO,
        }),
      valida: (d) =>
        !passaggiValidi(d?.passaggi)
          ? { ok: false, suggerimento: 'Il campo "passaggi" deve avere da 3 a 6 frasi.' }
          : Array.isArray(d?.risultato?.termini) && d.risultato.termini.length >= 3
            ? { ok: true }
            : { ok: false, suggerimento: 'Servono almeno 3 termini.' },
    })

    const testoNorm = testoCorpusNormalizzato(normalizza)
    const voci: Omit<VoceGlossario, 'id'>[] = []
    const scartati: string[] = []
    let variantiTolte = 0
    for (const t of consegna.risultato.termini) {
      const occorrenze = conta(testoNorm, t.termine)
      if (occorrenze === 0) {
        // Un termine che non compare nel corso non è "terminologia del corso".
        scartati.push(t.termine)
        continue
      }
      const numero = Number(String(t.rif).replace(/\D/g, ''))
      const passaggio = passaggi[numero - 1]
      const verificato = passaggio ? verificaEstratto(t.estratto, passaggio.testo) !== 'non_trovato' : false
      // Una variante che il corso usa spesso non va vietata: è anch'essa lessico del corso.
      const varianti = (t.varianti_da_evitare ?? []).filter((v) => {
        const ok = v.trim().length >= 3 && v.trim().toLowerCase() !== t.termine.trim().toLowerCase() && conta(testoNorm, v) * 4 < occorrenze
        if (!ok) variantiTolte += 1
        return ok
      })
      voci.push({
        termine: t.termine.trim(),
        definizione: t.definizione,
        varianti,
        nota: verificato ? '' : 'Definizione non ritrovata alla lettera nel passaggio indicato: controllala.',
        origine: 'corso',
        occorrenze,
        collocazione: passaggio && verificato ? collocazione(passaggio) : '',
      })
    }

    const esito = useStudio.getState().unisciLessico(voci)
    useStudio.getState().patchAgente('lettore', {
      status: 'fatto',
      etichetta: 'lessico del corso pronto',
      passaggi: consegna.passaggi,
      errore: null,
    })
    logOk('lettore', `Lessico del corso: ${esito.nuove} termini nuovi, ${esito.aggiornate} aggiornati, ${scartati.length} scartati perché assenti dal corso.`)
    return { ...esito, scartati, variantiTolte }
  } catch (err) {
    useStudio.getState().patchAgente('lettore', { status: 'errore', etichetta: 'errore', errore: err instanceof Error ? err.message : 'Errore.' })
    throw err
  }
}
