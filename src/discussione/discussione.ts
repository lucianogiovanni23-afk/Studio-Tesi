import { ApiError, chiamataStrutturata, creaClient } from '../agents/api'
import { contestoStabile } from '../agents/chat'
import { stimaChiamata, tokenDaCaratteri, type Stima } from '../agents/costs'
import { SYSTEM_REVISORE } from '../agents/prompts'
import { consegna, elenco, oggetto, stringa } from '../agents/schemas'
import { logOk, sorveglia } from '../agents/supervisor'
import { adesso, nuovoId } from '../domain/progettoIniziale'
import { useStudio } from '../store'
import type { Consegna, DomandaDiscussione, PreparazioneDiscussione, SlideDiscussione } from '../types'

/**
 * Preparazione alla discussione: domande probabili della commissione con una
 * risposta breve presa dalla tesi, e la scaletta delle slide. Con la chiave
 * API o gratis tramite Claude.ai (lo decide api.ts).
 */

const SCHEMA_DISCUSSIONE = consegna(
  oggetto({
    domande: {
      type: 'array',
      minItems: 1,
      description: 'Da 10 a 15 domande che la commissione potrebbe fare.',
      items: oggetto({
        domanda: { type: 'string', description: 'La domanda, come la farebbe un professore della commissione.' },
        risposta: {
          type: 'string',
          description:
            'Risposta breve (3-5 frasi) che lo studente può dire a voce, in prima persona, basata SOLO su quello che c\'è nella tesi e nelle fonti. Se la tesi non risponde, dillo e suggerisci come rispondere con onestà.',
        },
        sezione: { type: 'string', description: 'La sezione della tesi su cui si basa la risposta, con la sua etichetta (es. "3.2"), oppure "tesi".' },
      }),
    },
    slide: {
      type: 'array',
      minItems: 1,
      description: 'Da 8 a 12 slide per una presentazione di circa 10 minuti.',
      items: oggetto({
        titolo: stringa,
        punti: elenco(1, 'Da 3 a 4 punti brevi (massimo 10 parole ciascuno).'),
        immagine: {
          type: 'string',
          description: 'Cosa mostrare nella slide: quale grafico (con quali dati della tesi), immagine o tabella. "Nessuna" se è solo testo.',
        },
        aVoce: { type: 'string', description: 'Cosa dire a voce su questa slide, in 1-2 frasi semplici.' },
      }),
    },
  }),
)

interface DomandaGrezza {
  domanda: string
  risposta: string
  sezione: string
}

export function stimaDiscussione(): Stima {
  const s = useStudio.getState()
  return stimaChiamata(s.preferenze.modelli.revisore, { input: tokenDaCaratteri(contestoStabile().length) + 3000, output: 6000 })
}

function aggiorna(fn: (d: PreparazioneDiscussione) => PreparazioneDiscussione) {
  useStudio.setState((s) => (s.progetto.discussione ? { progetto: { ...s.progetto, discussione: fn(s.progetto.discussione) } } : {}))
}

export function segnaPronta(id: string, pronta: boolean) {
  aggiorna((d) => ({ ...d, domande: d.domande.map((q) => (q.id === id ? { ...q, pronta } : q)) }))
}

export function cambiaRisposta(id: string, risposta: string) {
  aggiorna((d) => ({ ...d, domande: d.domande.map((q) => (q.id === id ? { ...q, risposta } : q)) }))
}

export function cancellaDiscussione() {
  useStudio.setState((s) => ({ progetto: { ...s.progetto, discussione: null } }))
}

function sezioneDa(etichetta: string): { capitoloId: string | null; sezioneId: string | null } {
  const capitoli = useStudio.getState().progetto.capitoli
  const m = String(etichetta ?? '').match(/(\d+)(?:\.(\d+))?/)
  const c = m ? capitoli[Number(m[1]) - 1] : undefined
  if (!c) return { capitoloId: null, sezioneId: null }
  const sz = m?.[2] ? c.sezioni[Number(m[2]) - 1] : undefined
  return { capitoloId: c.id, sezioneId: sz?.id ?? null }
}

export async function preparaDiscussione(): Promise<PreparazioneDiscussione> {
  const s = useStudio.getState()
  const scritto = s.progetto.capitoli.some((c) => c.sezioni.some((x) => x.testo.trim()))
  if (!scritto) throw new ApiError('sconosciuto', 'Nella tesi non c\'è ancora niente di scritto: le domande le preparo quando avrai qualche capitolo.')
  const client = creaClient(s.apiKey)
  s.patchAgente('revisore', { status: 'lavoro', etichetta: 'preparo la discussione…', errore: null })
  try {
    const risposta = await sorveglia<Consegna<{ domande: DomandaGrezza[]; slide: SlideDiscussione[] }>>({
      agente: 'revisore',
      passo: 'Preparazione alla discussione',
      esegui: (_t, suggerimento) =>
        chiamataStrutturata({
          client,
          model: s.preferenze.modelli.revisore,
          maxTokens: 12_000,
          effort: 'medium',
          chi: 'revisore',
          azione: 'preparazione alla discussione',
          system: [
            {
              type: 'text',
              text: `${SYSTEM_REVISORE}\n\nIn questo compito fai il membro della commissione di laurea triennale: prepari lo studente alla discussione della tesi.${suggerimento ? `\n\n${suggerimento}` : ''}`,
            },
          ],
          messages: [
            {
              role: 'user',
              content: `${contestoStabile()}\n\nCOMPITO: prepara lo studente alla discussione.\n1) Da 10 a 15 domande probabili della commissione: domanda di ricerca e perché è importante, metodo e dati, risultati principali (raccolta e frantoio), limiti, collegamenti con il corso di Finanza Aziendale, possibili sviluppi. Per ognuna una risposta breve, in prima persona, presa SOLO dalla tesi e dalle fonti, e la sezione su cui si basa.\n2) La scaletta di 8-12 slide per circa 10 minuti: titolo, 3-4 punti brevi, cosa mostrare (grafico, immagine o tabella con i dati della tesi) e cosa dire a voce.\nResta nel vincolo di materia e non inventare dati che nella tesi non ci sono.`,
            },
          ],
          schema: SCHEMA_DISCUSSIONE,
        }),
      valida: (d) => {
        const q = d?.risultato?.domande
        const sl = d?.risultato?.slide
        if (!Array.isArray(q) || q.length < 8) return { ok: false, suggerimento: 'Servono da 10 a 15 domande.' }
        if (!Array.isArray(sl) || sl.length < 6) return { ok: false, suggerimento: 'Servono da 8 a 12 slide.' }
        return { ok: true }
      },
    })

    const domande: DomandaDiscussione[] = risposta.risultato.domande.slice(0, 18).map((q) => ({
      id: nuovoId('dom'),
      domanda: String(q.domanda ?? '').trim(),
      risposta: String(q.risposta ?? '').trim(),
      ...sezioneDa(q.sezione),
      pronta: false,
    }))
    const slide: SlideDiscussione[] = risposta.risultato.slide.slice(0, 14).map((x) => ({
      titolo: String(x.titolo ?? '').trim(),
      punti: (Array.isArray(x.punti) ? x.punti : []).map((p) => String(p).trim()).filter(Boolean).slice(0, 5),
      immagine: String(x.immagine ?? '').trim(),
      aVoce: String(x.aVoce ?? '').trim(),
    }))
    const prep: PreparazioneDiscussione = { data: adesso(), domande: domande.filter((q) => q.domanda), slide: slide.filter((x) => x.titolo) }
    useStudio.setState((st) => ({ progetto: { ...st.progetto, discussione: prep } }))
    useStudio.getState().patchAgente('revisore', { status: 'fatto', etichetta: 'discussione pronta', passaggi: risposta.passaggi, errore: null })
    logOk('revisore', `Discussione: ${prep.domande.length} domande e ${prep.slide.length} slide.`)
    return prep
  } catch (err) {
    useStudio.getState().patchAgente('revisore', { status: 'errore', etichetta: "c'è stato un problema", errore: err instanceof Error ? err.message : 'Qualcosa è andato storto.' })
    throw err
  }
}

// ---------------------------------------------------------------------------
// Esportazione
// ---------------------------------------------------------------------------

/** Domande e slide in Markdown (si legge bene anche come testo semplice). */
export function discussioneInTesto(d: PreparazioneDiscussione, titoloTesi: string, formato: 'md' | 'txt'): string {
  const md = formato === 'md'
  const righe: string[] = []
  righe.push(md ? `# Discussione della tesi` : 'DISCUSSIONE DELLA TESI', '', titoloTesi, '')
  righe.push(md ? `## Domande probabili (${d.domande.length})` : `DOMANDE PROBABILI (${d.domande.length})`, '')
  d.domande.forEach((q, i) => {
    righe.push(md ? `### ${i + 1}. ${q.domanda}` : `${i + 1}. ${q.domanda}`, '', md ? q.risposta : `   ${q.risposta}`, '')
  })
  righe.push(md ? `## Scaletta delle slide (${d.slide.length})` : `SCALETTA DELLE SLIDE (${d.slide.length})`, '')
  d.slide.forEach((x, i) => {
    righe.push(md ? `### Slide ${i + 1}: ${x.titolo}` : `Slide ${i + 1}: ${x.titolo}`, '')
    for (const p of x.punti) righe.push(md ? `- ${p}` : `   • ${p}`)
    righe.push('')
    if (x.immagine) righe.push(md ? `*Da mostrare:* ${x.immagine}` : `   Da mostrare: ${x.immagine}`)
    if (x.aVoce) righe.push(md ? `*A voce:* ${x.aVoce}` : `   A voce: ${x.aVoce}`)
    righe.push('')
  })
  return righe.join('\n')
}

export function scaricaTesto(nome: string, testo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([testo], { type: `${tipo};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
