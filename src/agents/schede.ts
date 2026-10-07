import { paginaEstratto } from '../domain/pagine'
import { useStudio } from '../store'
import type { Consegna, EstrattoVerificato, Fonte, SchedaLettura } from '../types'
import { ApiError, chiamataStrutturata, creaClient } from './api'
import { verificaEstratto } from './citations'
import { stimaChiamata, tokenDaCaratteri, type Stima } from './costs'
import { SYSTEM_BIBLIOTECARIO, intestazioneProgetto } from './prompts'
import { SCHEMA_SCHEDA, SCHEMA_SCHEDE } from './schemas'
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

/** Le frasi chiave restano solo se si ritrovano nel testo; la scheda si salva nella fonte. */
function salvaScheda(fonte: Fonte, testo: string, base: 'testo' | 'abstract', r: SchedaGrezza): { tenute: number; scartate: number } {
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
  useStudio.getState().aggiornaFonte(fonte.id, { scheda })
  return { tenute: tenute.length, scartate: verificate.length - tenute.length }
}

function presentazioneFonte(f: Fonte): string {
  return `${f.titolo}\n${f.autori.join(', ') || 'autore n.d.'} · ${f.anno ?? 's.d.'}${f.rivista ? ` · ${f.rivista}` : ''}`
}

const inCorso = new Set<string>()

export function schedaInCorso(id: string): boolean {
  return inCorso.has(id)
}

export async function preparaScheda(fonteId: string): Promise<{ scartate: number }> {
  const s = useStudio.getState()
  const fonte = s.progetto.fonti.find((f) => f.id === fonteId)
  if (!fonte) throw new ApiError('sconosciuto', 'Non trovo più questa fonte.')
  const { testo, base } = testoPerScheda(fonte)
  if (testo.trim().length < 80) {
    throw new ApiError('sconosciuto', 'Di questa fonte non ho niente da leggere: carica il PDF dell\'articolo e riprova.')
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
                `FONTE: ${presentazioneFonte(fonte)}`,
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

    const { tenute, scartate } = salvaScheda(fonte, testo, base, consegna.risultato)
    useStudio.getState().patchAgente('bibliotecario', {
      status: 'fatto',
      etichetta: 'scheda pronta',
      passaggi: consegna.passaggi,
      errore: null,
    })
    logOk('bibliotecario', `Scheda di "${fonte.titolo}" pronta: ${tenute} frasi chiave controllate${scartate ? `, ${scartate} tolte perché nel testo non c'erano` : ''}.`)
    return { scartate }
  } catch (err) {
    useStudio.getState().patchAgente('bibliotecario', {
      status: 'errore',
      etichetta: "c'è stato un problema",
      errore: err instanceof Error ? err.message : 'Qualcosa è andato storto.',
    })
    throw err
  } finally {
    inCorso.delete(fonteId)
  }
}

// ---------------------------------------------------------------------------
// Schede in blocco
// ---------------------------------------------------------------------------

/** Testo complessivo di un gruppo: sta comodo in una chat di Claude.ai e in una chiamata. */
const MAX_GRUPPO = 90_000
const MAX_PER_FONTE = 30_000
const MAX_FONTI_GRUPPO = 6

/** Le fonti senza scheda che hanno qualcosa da leggere. */
export function fontiSenzaScheda(fonti: Fonte[]): Fonte[] {
  return fonti.filter((f) => !f.scheda && testoPerScheda(f).testo.trim().length >= 80)
}

/** Gruppi di fonti da leggere insieme: pochi passaggi anche con molte fonti. */
export function gruppiSchede(fonti: Fonte[]): Fonte[][] {
  const gruppi: Fonte[][] = []
  let attuale: Fonte[] = []
  let lunghezza = 0
  for (const f of fonti) {
    const l = Math.min(MAX_PER_FONTE, testoPerScheda(f).testo.length)
    if (attuale.length && (lunghezza + l > MAX_GRUPPO || attuale.length >= MAX_FONTI_GRUPPO)) {
      gruppi.push(attuale)
      attuale = []
      lunghezza = 0
    }
    attuale.push(f)
    lunghezza += l
  }
  if (attuale.length) gruppi.push(attuale)
  return gruppi
}

export function stimaSchedeInBlocco(fonti: Fonte[], modello: string): Stima {
  const caratteri = fonti.reduce((n, f) => n + Math.min(MAX_PER_FONTE, testoPerScheda(f).testo.length), 0)
  return stimaChiamata(modello, { input: tokenDaCaratteri(caratteri) + 3500 * gruppiSchede(fonti).length, output: 1200 * fonti.length })
}

interface SchedeGrezze {
  schede: (SchedaGrezza & { id: string })[]
}

/**
 * Prepara le schede di più fonti con una sola richiesta per gruppo. Ogni
 * frase chiave si verifica sul testo della sua fonte, come per la scheda singola.
 * Restituisce quante schede sono state salvate.
 */
export async function preparaSchedeInBlocco(ids: string[], suAvanzamento: (gruppo: number, gruppi: number) => void): Promise<{ fatte: number; frasiScartate: number }> {
  const s = useStudio.getState()
  const fonti = ids.map((id) => s.progetto.fonti.find((f) => f.id === id)).filter((f): f is Fonte => Boolean(f))
  const gruppi = gruppiSchede(fonti)
  const client = creaClient(s.apiKey)
  let fatte = 0
  let frasiScartate = 0
  s.patchAgente('bibliotecario', { status: 'lavoro', etichetta: 'preparo le schede di lettura…', errore: null })
  try {
    for (const [g, gruppo] of gruppi.entries()) {
      suAvanzamento(g + 1, gruppi.length)
      const testi = gruppo.map((f) => {
        const { testo, base } = testoPerScheda(f)
        return { f, testo: testo.slice(0, MAX_PER_FONTE), base }
      })
      const materiale = testi
        .map(
          ({ f, testo, base }, i) =>
            `--- FONTE S${i + 1} ---\n${presentazioneFonte(f)}\n${base === 'abstract' ? '(solo abstract o estratti: dillo nel metodo e non inventare dettagli)\n' : ''}"""\n${testo}\n"""`,
        )
        .join('\n\n')
      const consegna = await sorveglia<Consegna<SchedeGrezze>>({
        agente: 'bibliotecario',
        passo: `Schede di lettura (blocco ${g + 1} di ${gruppi.length})`,
        esegui: (_t, suggerimento) =>
          chiamataStrutturata<Consegna<SchedeGrezze>>({
            client,
            model: s.preferenze.modelli.bibliotecario,
            maxTokens: 2000 + 1500 * gruppo.length,
            effort: 'medium',
            chi: 'bibliotecario',
            azione: `schede di lettura (${gruppo.length} fonti)`,
            system: [{ type: 'text', text: suggerimento ? `${SYSTEM_BIBLIOTECARIO}\n\n${suggerimento}` : SYSTEM_BIBLIOTECARIO }],
            messages: [
              {
                role: 'user',
                content: [
                  intestazioneProgetto(s.progetto),
                  materiale,
                  `COMPITO: prepara una scheda di lettura per OGNUNA delle ${gruppo.length} fonti, con il suo id (S1, S2…). Le frasi chiave vanno copiate alla lettera dal testo di quella fonte. Nella rilevanza indica il punto di vista (raccolta o frantoio) e il capitolo dell'indice.`,
                ].join('\n\n'),
              },
            ],
            schema: SCHEMA_SCHEDE,
          }),
        valida: (d) => {
          if (!passaggiValidi(d?.passaggi) || !Array.isArray(d?.risultato?.schede)) return { ok: false, suggerimento: 'Compila tutti i campi.' }
          const mancanti = testi.map((_x, i) => `S${i + 1}`).filter((id) => !d.risultato.schede.some((x) => x.id?.trim().toUpperCase() === id))
          return mancanti.length ? { ok: false, suggerimento: `Mancano le schede di ${mancanti.join(', ')}: serve una scheda per ogni fonte.` } : { ok: true }
        },
      })
      for (const r of consegna.risultato.schede) {
        const i = Number(r.id.replace(/\D/g, '')) - 1
        const voce = testi[i]
        if (!voce || !r.risultati) continue
        const esito = salvaScheda(voce.f, voce.testo, voce.base, r)
        fatte += 1
        frasiScartate += esito.scartate
      }
      useStudio.getState().patchAgente('bibliotecario', { passaggi: consegna.passaggi })
    }
    useStudio.getState().patchAgente('bibliotecario', { status: 'fatto', etichetta: 'schede pronte', errore: null })
    logOk('bibliotecario', `Schede pronte: ${fatte}${frasiScartate ? `. Ho tolto ${frasiScartate} frasi chiave perché nel testo non c'erano` : ''}.`)
    return { fatte, frasiScartate }
  } catch (err) {
    useStudio.getState().patchAgente('bibliotecario', { status: 'errore', etichetta: "c'è stato un problema", errore: err instanceof Error ? err.message : 'Qualcosa è andato storto.' })
    throw err
  }
}
