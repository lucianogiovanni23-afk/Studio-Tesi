import { firmaCorso } from '../domain/progettoIniziale'
import { DOMANDE_CORSO } from '../domain/dominio'
import { useStudio } from '../store'
import type { ConcettoCorso, Consegna, QuadroTeorico } from '../types'
import { chiamataStrutturata, creaClient, ApiError } from './api'
import { verificaEstratto } from './citations'
import { BUDGET_LETTORE, collocazione, recuperaPassaggi, statisticheCorpus } from './corpus'
import { stimaChiamata, tokenDaCaratteri, type Stima } from './costs'
import { SYSTEM_LETTORE, messaggioLettore } from './prompts'
import { SCHEMA_QUADRO } from './schemas'
import { elencoNonVuoto, logInfo, logOk, passaggiValidi, sorveglia } from './supervisor'

interface RisultatoGrezzo {
  concetti: { termine: string; definizione: string; applicazione: string; rif: string; estratto: string }[]
  collegamenti: { capitolo: string; collegamento: string }[]
  lacune: string[]
}

const MAX_TOKEN = 8000

/** Stima del costo prima di generare il quadro teorico. */
export function stimaQuadro(modello: string): Stima {
  const caratteri = Math.min(statisticheCorpus().caratteri, BUDGET_LETTORE)
  return stimaChiamata(modello, { input: tokenDaCaratteri(caratteri) + 4000, output: 5000 })
}

let controller: AbortController | null = null

export function annullaQuadro() {
  controller?.abort()
}

/** Il Lettore legge i passaggi più pertinenti e produce il quadro teorico, verificato in codice. */
export async function generaQuadro(): Promise<void> {
  const s = useStudio.getState()
  const progetto = s.progetto
  const passaggi = recuperaPassaggi(
    [progetto.titolo, progetto.domanda, ...progetto.capitoli.map((c) => c.titolo), ...DOMANDE_CORSO],
    BUDGET_LETTORE,
  )
  if (passaggi.length === 0) {
    throw new ApiError('sconosciuto', 'Il materiale del corso non contiene testo leggibile: carica almeno un PDF o un file di testo.')
  }

  const client = creaClient(s.apiKey)
  controller = new AbortController()
  const signal = controller.signal
  s.patchAgente('lettore', { status: 'lavoro', etichetta: 'leggo il materiale del corso…', errore: null })
  logInfo('lettore', `Leggo ${passaggi.length} passaggi del corso da ${new Set(passaggi.map((p) => p.fileId)).size} file.`)

  try {
    const consegna = await sorveglia<Consegna<RisultatoGrezzo>>({
      agente: 'lettore',
      passo: 'Quadro teorico',
      signal,
      esegui: (_t, suggerimento) =>
        chiamataStrutturata<Consegna<RisultatoGrezzo>>({
          client,
          model: s.preferenze.modelli.lettore,
          maxTokens: MAX_TOKEN,
          effort: 'medium',
          signal,
          chi: 'lettore',
          azione: 'quadro teorico',
          system: [{ type: 'text', text: suggerimento ? `${SYSTEM_LETTORE}\n\n${suggerimento}` : SYSTEM_LETTORE }],
          messages: [messaggioLettore(progetto, passaggi)],
          schema: SCHEMA_QUADRO,
        }),
      valida: (d) => {
        if (!passaggiValidi(d?.passaggi)) return { ok: false, suggerimento: 'Il campo "passaggi" deve contenere da 3 a 6 frasi.' }
        if (!elencoNonVuoto(d?.risultato?.concetti, 3)) return { ok: false, suggerimento: 'Servono almeno 3 concetti del corso.' }
        return { ok: true }
      },
    })

    // Ogni estratto viene confrontato in codice con il passaggio citato.
    const concetti: ConcettoCorso[] = consegna.risultato.concetti.map((c) => {
      const numero = Number(String(c.rif ?? '').replace(/[^0-9]/g, ''))
      const passaggio = Number.isInteger(numero) && numero >= 1 ? passaggi[numero - 1] : undefined
      return {
        termine: c.termine,
        definizione: c.definizione,
        applicazione: c.applicazione,
        rif: c.rif,
        estratto: c.estratto,
        collocazione: passaggio ? collocazione(passaggio) : 'passaggio non trovato',
        esito: passaggio ? verificaEstratto(c.estratto, passaggio.testo) : 'rif_sconosciuto',
      }
    })

    const quadro: QuadroTeorico = {
      concetti,
      collegamenti: consegna.risultato.collegamenti ?? [],
      lacune: consegna.risultato.lacune ?? [],
      generatoIl: new Date().toISOString(),
      firmaCorso: firmaCorso(useStudio.getState().progetto),
    }
    const verificati = concetti.filter((c) => c.esito === 'verificato').length
    useStudio.getState().setQuadro(quadro)
    useStudio.getState().patchAgente('lettore', {
      status: 'fatto',
      etichetta: 'quadro teorico pronto',
      passaggi: consegna.passaggi,
      errore: null,
    })
    logOk('lettore', `Quadro teorico: ${concetti.length} concetti, ${verificati} con estratto verificato alla lettera.`)
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    useStudio.getState().patchAgente('lettore', {
      status: aborted ? 'riposo' : 'errore',
      etichetta: aborted ? 'fermato' : 'errore',
      errore: aborted ? null : err instanceof Error ? err.message : 'Errore sconosciuto.',
    })
    if (!aborted) throw err
  } finally {
    controller = null
  }
}
