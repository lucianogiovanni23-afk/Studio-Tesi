import { paginaEstratto } from '../domain/pagine'
import { useStudio } from '../store'
import type { Consegna, EstrattoVerificato, Fonte, SchedaLettura } from '../types'
import { ApiError, chiamataStrutturata, creaClient } from './api'
import { verificaEstratto } from './citations'
import { stimaChiamata, tokenDaCaratteri, type Stima } from './costs'
import { SYSTEM_BIBLIOTECARIO, intestazioneProgetto } from './prompts'
import { SCHEMA_SCHEDA } from './schemas'
import { logOk, passaggiValidi, sorveglia } from './supervisor'

/** Oltre questa lunghezza si manda l'inizio del testo: abstract, introduzione, risultati. */
const MAX_CARATTERI = 150_000

interface SchedaGrezza {
  domanda: string
  metodo: string
  risultati: string
  rilevanza: string
  frasi_chiave: string[]
}

export function testoPerScheda(f: Fonte): { testo: string; base: 'testo' | 'abstract' } {
  if (f.testoCompleto && f.testo.trim().length > 400) return { testo: f.testo.slice(0, MAX_CARATTERI), base: 'testo' }
  const testo = [f.abstract, ...f.estratti.map((e) => e.testo)].filter(Boolean).join('\n\n')
  return { testo, base: 'abstract' }
}

export function stimaScheda(f: Fonte, modello: string): Stima {
  return stimaChiamata(modello, { input: tokenDaCaratteri(testoPerScheda(f).testo.length) + 3500, output: 1500 })
}

/** Controlla in codice ogni frase chiave sul testo della fonte. */
export function verificaFrasi(frasi: string[], testo: string, fonte?: Fonte): EstrattoVerificato[] {
  return frasi.map((t) => {
    const esito = verificaEstratto(t, testo)
    const pagina = fonte && esito !== 'non_trovato' && esito !== 'rif_sconosciuto' ? paginaEstratto(fonte, t) : null
    return { testo: t, esito, ...(pagina ? { pagina } : {}) }
  })
}

const inCorso = new Set<string>()

export function schedaInCorso(id: string): boolean {
  return inCorso.has(id)
}

export async function preparaScheda(fonteId: string): Promise<{ scartate: number }> {
  const s = useStudio.getState()
  const fonte = s.progetto.fonti.find((f) => f.id === fonteId)
  if (!fonte) throw new ApiError('sconosciuto', 'Fonte non trovata.')
  const { testo, base } = testoPerScheda(fonte)
  if (testo.trim().length < 80) {
    throw new ApiError('sconosciuto', 'Questa fonte non ha testo da leggere: carica il PDF del paper e riprova.')
  }

  const client = creaClient(s.apiKey)
  inCorso.add(fonteId)
  s.patchAgente('bibliotecario', { status: 'lavoro', etichetta: 'preparo una scheda di lettura…', errore: null })
  try {
    const consegna = await sorveglia<Consegna<SchedaGrezza>>({
      agente: 'bibliotecario',
      passo: 'Scheda di lettura',
      esegui: (_t, suggerimento) =>
        chiamataStrutturata<Consegna<SchedaGrezza>>({
          client,
          model: s.preferenze.modelli.bibliotecario,
          maxTokens: 4000,
          effort: 'medium',
          chi: 'bibliotecario',
          azione: 'scheda di lettura',
          system: [{ type: 'text', text: suggerimento ? `${SYSTEM_BIBLIOTECARIO}\n\n${suggerimento}` : SYSTEM_BIBLIOTECARIO }],
          messages: [
            {
              role: 'user',
              content: [
                intestazioneProgetto(s.progetto),
                `FONTE: ${fonte.titolo}\n${fonte.autori.join(', ') || 'autore n.d.'} · ${fonte.anno ?? 's.d.'}${fonte.rivista ? ` · ${fonte.rivista}` : ''}`,
                base === 'abstract'
                  ? 'ATTENZIONE: hai solo l\'abstract (o gli estratti), non il testo completo: dillo nel metodo e non inventare dettagli.'
                  : '',
                `TESTO DELLA FONTE:\n"""\n${testo}\n"""`,
                'COMPITO: prepara la scheda di lettura. Le frasi chiave vanno copiate alla lettera dal testo qui sopra. Nella rilevanza indica il punto di vista (raccolta o frantoio) e il capitolo dell\'indice.',
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
          ],
          schema: SCHEMA_SCHEDA,
        }),
      valida: (d) => (passaggiValidi(d?.passaggi) && d?.risultato?.risultati ? { ok: true } : { ok: false, suggerimento: 'Compila tutti i campi.' }),
    })

    const r = consegna.risultato
    const verificate = verificaFrasi(r.frasi_chiave ?? [], testo, fonte)
    const tenute = verificate.filter((v) => v.esito === 'verificato' || v.esito === 'approssimato')
    const scheda: SchedaLettura = {
      domanda: r.domanda,
      metodo: r.metodo,
      risultati: r.risultati,
      rilevanza: r.rilevanza,
      frasiChiave: tenute,
      corretta: false,
      base,
      preparataIl: new Date().toISOString(),
    }
    useStudio.getState().aggiornaFonte(fonteId, { scheda })
    useStudio.getState().patchAgente('bibliotecario', {
      status: 'fatto',
      etichetta: 'scheda pronta',
      passaggi: consegna.passaggi,
      errore: null,
    })
    const scartate = verificate.length - tenute.length
    logOk('bibliotecario', `Scheda di "${fonte.titolo}": ${tenute.length} frasi chiave verificate${scartate ? `, ${scartate} scartate perché non ritrovate` : ''}.`)
    return { scartate }
  } catch (err) {
    useStudio.getState().patchAgente('bibliotecario', {
      status: 'errore',
      etichetta: 'errore',
      errore: err instanceof Error ? err.message : 'Errore sconosciuto.',
    })
    throw err
  } finally {
    inCorso.delete(fonteId)
  }
}
