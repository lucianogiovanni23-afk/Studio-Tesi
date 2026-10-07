import { paragrafi, sostituisciParagrafo, marcatoriDi, pulisciCitazioni } from '../domain/citazioniTesto'
import { controlliInCodice } from '../domain/controlliCodice'
import { adesso, nuovoId } from '../domain/progettoIniziale'
import { useStudio } from '../store'
import type { Capitolo, Consegna, PropostaRevisione, RilievoTesi, Sezione, TipoRilievo } from '../types'
import { ApiError, chiamataStrutturata, creaClient } from './api'
import { normalizza } from './citations'
import { stimaChiamata, tokenDaCaratteri, type Stima } from './costs'
import { SYSTEM_REVISORE, glossarioTestuale, quadroTestuale } from './prompts'
import { SCHEMA_CONTROLLO, SCHEMA_OSSERVAZIONE } from './schemas'
import { logOk, sorveglia } from './supervisor'

/** Oltre questa lunghezza la tesi viene mandata al Revisore a pezzi di capitolo: per ora si ferma con un avviso. */
const MAX_CARATTERI_TESI = 400_000

interface Posto {
  cap: Capitolo
  sez: Sezione
  etichetta: string
}

function posti(capitoloId: string | null): Posto[] {
  const p = useStudio.getState().progetto
  return p.capitoli.flatMap((c, i) =>
    capitoloId && c.id !== capitoloId ? [] : c.sezioni.map((s, j) => ({ cap: c, sez: s, etichetta: `${i + 1}.${j + 1}` })),
  )
}

/** Testo con paragrafi etichettati "1.2 §3": il Revisore li indica così e il codice li ritrova. */
function testoEtichettato(elenco: Posto[]): string {
  return elenco
    .map(({ sez, etichetta }) => {
      const pars = paragrafi(sez.testo)
      return `=== ${etichetta} ${sez.titolo} ===\n${pars.length ? pars.map((x, k) => `[${etichetta} §${k + 1}] ${x}`).join('\n\n') : '(sezione vuota)'}`
    })
    .join('\n\n')
}

function contesto(): string {
  const p = useStudio.getState().progetto
  return `TITOLO: ${p.titolo}\nDOMANDA DI RICERCA: ${p.domanda}\n\nGLOSSARIO (termini da usare, non le varianti):\n${glossarioTestuale(p)}\n\nQUADRO TEORICO DEL CORSO:\n${quadroTestuale(p.quadro)}`
}

// ---------------------------------------------------------------------------
// Osservazioni del relatore
// ---------------------------------------------------------------------------

export function stimaOsservazione(capitoloId: string | null): Stima {
  const s = useStudio.getState()
  const caratteri = posti(capitoloId).reduce((n, x) => n + x.sez.testo.length, 0)
  return stimaChiamata(s.preferenze.modelli.revisore, { input: tokenDaCaratteri(caratteri) + 5000, output: 3000 })
}

interface PropostaGrezza {
  posizione: string
  tipo: 'modifica' | 'commento'
  originale: string
  proposta: string
  motivo: string
}

export async function proponiPerOsservazione(osservazioneId: string): Promise<{ scartate: number }> {
  const s = useStudio.getState()
  const oss = s.progetto.osservazioni.find((o) => o.id === osservazioneId)
  if (!oss) throw new ApiError('sconosciuto', 'Osservazione non trovata.')
  const elenco = posti(oss.capitoloId)
  if (!elenco.some((x) => x.sez.testo.trim())) {
    throw new ApiError('sconosciuto', 'Il capitolo indicato non ha ancora testo da rivedere.')
  }

  const client = creaClient(s.apiKey)
  s.patchAgente('revisore', { status: 'lavoro', etichetta: 'leggo l\'osservazione del relatore…', errore: null })
  try {
    const consegna = await sorveglia<Consegna<{ lettura: string; proposte: PropostaGrezza[] }>>({
      agente: 'revisore',
      passo: 'Osservazione del relatore',
      esegui: (_t, suggerimento) =>
        chiamataStrutturata({
          client,
          model: s.preferenze.modelli.revisore,
          maxTokens: 10_000,
          effort: 'medium',
          chi: 'revisore',
          azione: 'revisione: osservazione',
          system: [{ type: 'text', text: suggerimento ? `${SYSTEM_REVISORE}\n\n${suggerimento}` : SYSTEM_REVISORE }],
          messages: [
            {
              role: 'user',
              content: `${contesto()}\n\nTESTO DA RIVEDERE (paragrafi etichettati):\n"""\n${testoEtichettato(elenco)}\n"""\n\nOSSERVAZIONE DEL RELATORE:\n"""\n${oss.testo}\n"""\n\nCOMPITO: proponi le modifiche puntuali che rispondono all'osservazione. Ogni modifica sostituisce UN paragrafo: indica la posizione, copia alla lettera il paragrafo originale e scrivi il paragrafo nuovo, mantenendo i marcatori di citazione esistenti e senza aggiungerne di nuovi. Se l'osservazione richiede un intervento che non è una riscrittura (per esempio cercare una fonte), usa un "commento". Resta nel vincolo di materia.`,
            },
          ],
          schema: SCHEMA_OSSERVAZIONE,
        }),
      valida: (d) => (Array.isArray(d?.risultato?.proposte) ? { ok: true } : { ok: false, suggerimento: 'Manca "proposte".' }),
    })

    let scartate = 0
    const proposte: PropostaRevisione[] = []
    for (const g of consegna.risultato.proposte) {
      const m = String(g.posizione ?? '').match(/(\d+)\.(\d+)\s*§\s*(\d+)/)
      const posto = m ? elenco.find((x) => x.etichetta === `${m[1]}.${m[2]}`) : undefined
      if (g.tipo === 'commento') {
        proposte.push({
          id: nuovoId('prv'),
          capitoloId: posto?.cap.id ?? elenco[0].cap.id,
          sezioneId: posto?.sez.id ?? elenco[0].sez.id,
          tipo: 'commento',
          originale: '',
          proposta: g.proposta,
          motivo: g.motivo,
          stato: 'in_attesa',
        })
        continue
      }
      // Il paragrafo originale deve esistere davvero in quella posizione.
      const par = posto && m ? paragrafi(posto.sez.testo)[Number(m[3]) - 1] : undefined
      const inizio = normalizza(g.originale ?? '').slice(0, 60)
      if (!posto || !par || !inizio || !normalizza(par).includes(inizio)) {
        scartate += 1
        continue
      }
      // Marcatori nuovi non hanno una citazione registrata: si tolgono e lo si dice.
      const ammessi = marcatoriDi(posto.sez.testo)
      const estranei = [...marcatoriDi(g.proposta)].filter((x) => !ammessi.has(x))
      const testo = estranei.length ? g.proposta.replace(/\s*\[([FC]\d+)\]/g, (t, r: string) => (ammessi.has(r) ? t : '')) : g.proposta
      proposte.push({
        id: nuovoId('prv'),
        capitoloId: posto.cap.id,
        sezioneId: posto.sez.id,
        tipo: 'modifica',
        originale: par,
        proposta: testo.trim(),
        motivo: g.motivo,
        stato: 'in_attesa',
        ...(estranei.length ? { avviso: `Tolti i marcatori senza citazione: ${estranei.join(', ')}.` } : {}),
      })
    }

    useStudio.getState().aggiornaOsservazione(osservazioneId, { proposte, lettura: consegna.risultato.lettura })
    useStudio.getState().patchAgente('revisore', { status: 'attesa', etichetta: `${proposte.length} proposte da decidere`, passaggi: consegna.passaggi, errore: null })
    logOk('revisore', `Osservazione del relatore: ${proposte.length} proposte${scartate ? `, ${scartate} scartate perché il paragrafo citato non c'è` : ''}.`)
    return { scartate }
  } catch (err) {
    useStudio.getState().patchAgente('revisore', { status: 'errore', etichetta: 'errore', errore: err instanceof Error ? err.message : 'Errore.' })
    throw err
  }
}

/** Applica una modifica accettata: il testo precedente resta fra le versioni. */
export function accettaPropostaRevisione(osservazioneId: string, propostaId: string) {
  const s = useStudio.getState()
  const oss = s.progetto.osservazioni.find((o) => o.id === osservazioneId)
  const prop = oss?.proposte.find((x) => x.id === propostaId)
  if (!oss || !prop) return
  if (prop.tipo === 'commento') {
    s.aggiornaPropostaRevisione(osservazioneId, propostaId, { stato: 'accettata' })
    return
  }
  const sez = s.progetto.capitoli.find((c) => c.id === prop.capitoloId)?.sezioni.find((x) => x.id === prop.sezioneId)
  const indice = sez ? paragrafi(sez.testo).findIndex((p) => normalizza(p) === normalizza(prop.originale)) : -1
  if (!sez || indice < 0) {
    s.aggiornaPropostaRevisione(osservazioneId, propostaId, {
      avviso: 'Il paragrafo è cambiato dopo la proposta: non si può applicare in automatico. Rifiutala o chiedi nuove proposte.',
    })
    return
  }
  const testo = sostituisciParagrafo(sez.testo, indice, prop.proposta)
  s.applicaTesto(prop.capitoloId, prop.sezioneId, testo, pulisciCitazioni(testo, sez.citazioni), 'Osservazione del relatore', 'revisore')
  s.aggiornaPropostaRevisione(osservazioneId, propostaId, { stato: 'accettata', avviso: undefined })
  // Quando tutte le proposte sono decise, l'osservazione si può chiudere.
  const dopo = useStudio.getState().progetto.osservazioni.find((o) => o.id === osservazioneId)
  if (dopo && dopo.proposte.every((x) => x.stato !== 'in_attesa')) {
    useStudio.getState().patchAgente('revisore', { status: 'fatto', etichetta: 'proposte decise' })
  }
}

// ---------------------------------------------------------------------------
// Controllo di tutta la tesi
// ---------------------------------------------------------------------------

export function stimaControllo(): Stima {
  const s = useStudio.getState()
  const caratteri = posti(null).reduce((n, x) => n + x.sez.testo.length, 0)
  return stimaChiamata(s.preferenze.modelli.revisore, { input: tokenDaCaratteri(caratteri) + 5000, output: 4000 })
}

/** Solo il controllo in codice, gratuito. */
export function controlloSoloCodice() {
  const p = useStudio.getState().progetto
  useStudio.getState().setControllo({ data: adesso(), rilievi: controlliInCodice(p), conRevisore: false, scartati: 0 })
}

interface RilievoGrezzo {
  tipo: Exclude<TipoRilievo, 'citazioni'>
  sezione: string
  passo: string
  problema: string
  suggerimento: string
}

/** Controllo in codice più il giudizio del Revisore su coerenza, termini, ripetizioni e materia. */
export async function controlloConRevisore(): Promise<void> {
  const s = useStudio.getState()
  const elenco = posti(null)
  const testo = testoEtichettato(elenco)
  if (!elenco.some((x) => x.sez.testo.trim())) throw new ApiError('sconosciuto', 'La tesi non ha ancora testo da controllare.')
  if (testo.length > MAX_CARATTERI_TESI) {
    throw new ApiError('sconosciuto', 'La tesi è troppo lunga per un controllo in una sola richiesta: usa il controllo in codice o le osservazioni per capitolo.')
  }

  const client = creaClient(s.apiKey)
  s.patchAgente('revisore', { status: 'lavoro', etichetta: 'controllo tutta la tesi…', errore: null })
  try {
    const consegna = await sorveglia<Consegna<{ rilievi: RilievoGrezzo[] }>>({
      agente: 'revisore',
      passo: 'Controllo della tesi',
      esegui: (_t, suggerimento) =>
        chiamataStrutturata({
          client,
          model: s.preferenze.modelli.revisore,
          maxTokens: 12_000,
          effort: 'medium',
          chi: 'revisore',
          azione: 'revisione: controllo della tesi',
          system: [{ type: 'text', text: suggerimento ? `${SYSTEM_REVISORE}\n\n${suggerimento}` : SYSTEM_REVISORE }],
          messages: [
            {
              role: 'user',
              content: `${contesto()}\n\nTESTO DELLA TESI:\n"""\n${testo}\n"""\n\nCOMPITO: controlla tutta la tesi e segnala: termini usati in modo diverso fra capitoli o diversi dal glossario (terminologia); concetti o frasi ripetute (ripetizione); sconfinamenti in Ragioneria, Diritto, agronomia o temi fuori dal corso (materia); contraddizioni fra capitoli, punti di vista raccolta/frantoio mescolati, analisi su una sola campagna (coerenza). Per ogni rilievo copia alla lettera il passo interessato e indica la sezione.`,
            },
          ],
          schema: SCHEMA_CONTROLLO,
        }),
      valida: (d) => (Array.isArray(d?.risultato?.rilievi) ? { ok: true } : { ok: false, suggerimento: 'Manca "rilievi".' }),
    })

    let scartati = 0
    const delRevisore: RilievoTesi[] = []
    for (const r of consegna.risultato.rilievi) {
      const posto = elenco.find((x) => x.etichetta === String(r.sezione).trim().replace(/[^\d.]/g, ''))
      const passo = normalizza(r.passo ?? '').replace(/[.,'"-]+$/, '')
      // Il passo citato deve comparire davvero nella sezione indicata (o almeno nella tesi).
      const dove = posto && passo && normalizza(posto.sez.testo).includes(passo) ? posto : elenco.find((x) => passo && normalizza(x.sez.testo).includes(passo))
      if (!dove || passo.length < 8) {
        scartati += 1
        continue
      }
      delRevisore.push({
        id: nuovoId('ril'),
        tipo: r.tipo,
        origine: 'revisore',
        capitoloId: dove.cap.id,
        sezioneId: dove.sez.id,
        passo: r.passo,
        problema: r.problema,
        suggerimento: r.suggerimento,
      })
    }
    const p = useStudio.getState().progetto
    useStudio.getState().setControllo({ data: adesso(), rilievi: [...controlliInCodice(p), ...delRevisore], conRevisore: true, scartati })
    useStudio.getState().patchAgente('revisore', { status: 'fatto', etichetta: 'controllo concluso', passaggi: consegna.passaggi, errore: null })
    logOk('revisore', `Controllo della tesi: ${delRevisore.length} rilievi del Revisore${scartati ? `, ${scartati} scartati perché il passo non c'è` : ''}.`)
  } catch (err) {
    useStudio.getState().patchAgente('revisore', { status: 'errore', etichetta: 'errore', errore: err instanceof Error ? err.message : 'Errore.' })
    throw err
  }
}
