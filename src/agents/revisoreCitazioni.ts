import { marcatoriDi } from '../domain/citazioniTesto'
import { useStudio } from '../store'
import type { Citazione, Consegna, GiudizioCitazione, Sezione } from '../types'
import { ApiError, chiamataStrutturata, creaClient } from './api'
import { normalizza, verificaEstratto } from './citations'
import { stimaChiamata, type Stima } from './costs'
import { SYSTEM_REVISORE } from './prompts'
import { SCHEMA_GIUDIZI } from './schemas'
import { testoCitabile } from './scrittore'
import { logOk, sorveglia } from './supervisor'

/** Il testo su cui si verifica una citazione: la fonte in biblioteca o il passaggio del corso conservato. */
function testoDiRiferimento(c: Citazione): string | null {
  if (c.passaggio) return c.passaggio.testo
  if (c.fonteId) {
    const f = useStudio.getState().progetto.fonti.find((x) => x.id === c.fonteId)
    return f ? testoCitabile(f) : null
  }
  return null
}

export interface EsitoControllo {
  citazioni: number
  verdi: number
  ambra: number
  rosse: number
  /** Marcatori nel testo senza una citazione registrata. */
  senzaCitazione: string[]
}

/**
 * Controllo in codice, gratuito: ogni estratto viene ricercato di nuovo nel
 * testo del suo riferimento (la fonte può avere ora il testo completo) e si
 * segnalano i marcatori senza citazione.
 */
export function controllaInCodice(capitoloId: string, sezioneId: string): EsitoControllo {
  const s = useStudio.getState()
  const sez = s.progetto.capitoli.find((c) => c.id === capitoloId)?.sezioni.find((x) => x.id === sezioneId)
  if (!sez) throw new ApiError('sconosciuto', 'Sezione non trovata.')
  const aggiornate = sez.citazioni.map((c) => {
    const testo = testoDiRiferimento(c)
    return { ...c, testuale: testo === null ? ('rif_sconosciuto' as const) : verificaEstratto(c.estratto, testo) }
  })
  s.setCitazioni(capitoloId, sezioneId, aggiornate)
  const registrate = new Set(aggiornate.map((c) => c.rif))
  const senzaCitazione = [...marcatoriDi(sez.testo)].filter((m) => !registrate.has(m))
  const verdi = aggiornate.filter((c) => c.testuale === 'verificato' && c.giudizio !== 'parziale' && c.giudizio !== 'non_supportata').length
  const rosse = aggiornate.filter((c) => c.testuale === 'non_trovato' || c.testuale === 'rif_sconosciuto' || c.giudizio === 'non_supportata').length
  return { citazioni: aggiornate.length, verdi, rosse, ambra: aggiornate.length - verdi - rosse, senzaCitazione }
}

/** Il passo della fonte intorno all'estratto, perché il Revisore giudichi nel contesto. */
function contesto(testo: string, estratto: string): string {
  const t = normalizza(testo)
  const inizio = normalizza(estratto).split(' ').slice(0, 6).join(' ')
  const i = inizio ? t.indexOf(inizio) : -1
  if (i < 0) return testo.slice(0, 1200)
  // L'indice è sul testo normalizzato: basta come finestra approssimativa.
  const da = Math.max(0, Math.floor((i / Math.max(1, t.length)) * testo.length) - 500)
  return testo.slice(da, da + 1400)
}

export function stimaGiudizio(sez: Sezione): Stima {
  const modello = useStudio.getState().preferenze.modelli.revisore
  return stimaChiamata(modello, { input: 3000 + sez.citazioni.length * 600, output: 200 + sez.citazioni.length * 80 })
}

interface Giudizi {
  giudizi: { n: string; giudizio: GiudizioCitazione; motivo: string }[]
}

/** Il Revisore giudica il merito: l'estratto sostiene davvero l'affermazione? */
export async function giudicaCitazioni(capitoloId: string, sezioneId: string): Promise<void> {
  const s = useStudio.getState()
  const sez = s.progetto.capitoli.find((c) => c.id === capitoloId)?.sezioni.find((x) => x.id === sezioneId)
  if (!sez) throw new ApiError('sconosciuto', 'Sezione non trovata.')
  if (sez.citazioni.length === 0) throw new ApiError('sconosciuto', 'Questa sezione non ha citazioni da giudicare.')

  const elenco = sez.citazioni
    .map((c, i) => {
      const testo = testoDiRiferimento(c)
      return [
        `(${i + 1}) [${c.rif}] Affermazione: "${c.affermazione}"`,
        `    Estratto citato: "${c.estratto}"`,
        `    Controllo in codice: ${c.testuale ?? 'non eseguito'}`,
        `    Contesto nella fonte: """${testo ? contesto(testo, c.estratto) : '(testo non disponibile)'}"""`,
      ].join('\n')
    })
    .join('\n\n')

  const client = creaClient(s.apiKey)
  s.patchAgente('revisore', { status: 'lavoro', etichetta: 'giudico le citazioni…', errore: null })
  try {
    const consegna = await sorveglia<Consegna<Giudizi>>({
      agente: 'revisore',
      passo: 'Giudizio sulle citazioni',
      esegui: (_t, suggerimento) =>
        chiamataStrutturata<Consegna<Giudizi>>({
          client,
          model: s.preferenze.modelli.revisore,
          maxTokens: 6000,
          effort: 'medium',
          chi: 'revisore',
          azione: 'revisione: citazioni',
          system: [{ type: 'text', text: suggerimento ? `${SYSTEM_REVISORE}\n\n${suggerimento}` : SYSTEM_REVISORE }],
          messages: [
            {
              role: 'user',
              content: `SEZIONE: ${sez.titolo}\n\nCITAZIONI DA GIUDICARE:\n${elenco}\n\nCOMPITO: per OGNI citazione, indicata con il suo numero, giudica se l'estratto sostiene l'affermazione: "supportata", "parziale" (la sostiene solo in parte o l'affermazione va oltre) oppure "non_supportata". Motiva in una frase. Il controllo in codice ti dice già se l'estratto è letterale; tu giudichi il significato.`,
            },
          ],
          schema: SCHEMA_GIUDIZI,
        }),
      valida: (d) => (Array.isArray(d?.risultato?.giudizi) ? { ok: true } : { ok: false, suggerimento: 'Manca "giudizi".' }),
    })

    const perNumero = new Map(consegna.risultato.giudizi.map((g) => [Number(String(g.n).replace(/\D/g, '')), g]))
    const aggiornate = useStudio
      .getState()
      .progetto.capitoli.find((c) => c.id === capitoloId)!
      .sezioni.find((x) => x.id === sezioneId)!
      .citazioni.map((c, i) => {
        const g = perNumero.get(i + 1)
        return g ? { ...c, giudizio: g.giudizio, motivo: g.motivo } : c
      })
    useStudio.getState().setCitazioni(capitoloId, sezioneId, aggiornate)
    useStudio.getState().patchAgente('revisore', { status: 'fatto', etichetta: 'citazioni giudicate', passaggi: consegna.passaggi, errore: null })
    const deboli = aggiornate.filter((c) => c.giudizio && c.giudizio !== 'supportata').length
    logOk('revisore', `Citazioni di "${sez.titolo}": ${aggiornate.length} giudicate, ${deboli} parziali o non supportate.`)
  } catch (err) {
    useStudio.getState().patchAgente('revisore', { status: 'errore', etichetta: 'errore', errore: err instanceof Error ? err.message : 'Errore.' })
    throw err
  }
}
