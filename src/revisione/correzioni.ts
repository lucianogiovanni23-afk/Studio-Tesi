import { ApiError, chiamataStrutturata, creaClient } from '../agents/api'
import { normalizza } from '../agents/citations'
import { stimaChiamata, tokenDaCaratteri, type Stima } from '../agents/costs'
import { SYSTEM_REVISORE } from '../agents/prompts'
import { contesto, posti, testoEtichettato, type Posto } from '../agents/revisore'
import { consegna, oggetto } from '../agents/schemas'
import { logOk, sorveglia } from '../agents/supervisor'
import { paragrafi } from '../domain/citazioniTesto'
import { adesso, nuovoId } from '../domain/progettoIniziale'
import { useStudio } from '../store'
import type { CompitoCorrezione, Consegna, NoteCorrezioni } from '../types'

/**
 * Correzioni del relatore: le note (incollate o da file) diventano una lista
 * di cose concrete da fare, ognuna legata al paragrafo o alla sezione della
 * tesi di cui parla. Il codice controlla che il paragrafo indicato esista.
 */

const SCHEMA_CORREZIONI = consegna(
  oggetto({
    compiti: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        posizione: {
          type: 'string',
          description:
            'Dove intervenire, con le etichette del testo: "2.1 §3" per un paragrafo, "2.1" per una sezione intera, "2" per un capitolo intero, "tesi" se riguarda tutto il lavoro.',
        },
        compito: {
          type: 'string',
          description: 'Cosa deve fare lo studente, in UNA frase concreta che inizia con un verbo (es. "Aggiungi un esempio della campagna 2023 sui costi del frantoio").',
        },
        nota: { type: 'string', description: 'Le parole del relatore da cui nasce il compito, copiate alla lettera dalle note.' },
      }),
    },
  }),
)

export function correzioniDi(): NoteCorrezioni[] {
  return useStudio.getState().progetto.correzioni ?? []
}

/** Unico punto di scrittura: il progetto cambia, quindi finisce nel salvataggio e nella sincronizzazione. */
function aggiorna(fn: (elenco: NoteCorrezioni[]) => NoteCorrezioni[]) {
  useStudio.setState((s) => ({ progetto: { ...s.progetto, correzioni: fn(s.progetto.correzioni ?? []) } }))
}

export function segnaCompito(noteId: string, compitoId: string, fatto: boolean) {
  aggiorna((elenco) =>
    elenco.map((n) =>
      n.id !== noteId ? n : { ...n, compiti: n.compiti.map((c) => (c.id === compitoId ? { ...c, fatto, fattoIl: fatto ? adesso() : undefined } : c)) },
    ),
  )
}

export function rimuoviNote(noteId: string) {
  aggiorna((elenco) => elenco.filter((n) => n.id !== noteId))
}

export function stimaCorrezioni(testoNote: string): Stima {
  const s = useStudio.getState()
  const caratteri = posti(null).reduce((n, x) => n + x.sez.testo.length, 0) + testoNote.length
  return stimaChiamata(s.preferenze.modelli.revisore, { input: tokenDaCaratteri(caratteri) + 4000, output: 3000 })
}

interface CompitoGrezzo {
  posizione: string
  compito: string
  nota: string
}

/** "2.1 §3", "2.1", "cap. 2", "tesi" → dove si trova nella tesi. */
export function leggiPosizione(
  posizione: string,
  elenco: Posto[],
): { capitoloId: string | null; sezioneId: string | null; paragrafo: number | null; passo: string; spostato: boolean } {
  const p = String(posizione ?? '')
  const capitoli = useStudio.getState().progetto.capitoli
  const sez = p.match(/(\d+)\.(\d+)(?:\s*§\s*(\d+))?/)
  if (sez) {
    const posto = elenco.find((x) => x.etichetta === `${sez[1]}.${sez[2]}`)
    if (posto) {
      if (!sez[3]) return { capitoloId: posto.cap.id, sezioneId: posto.sez.id, paragrafo: null, passo: '', spostato: false }
      const n = Number(sez[3])
      const par = paragrafi(posto.sez.testo)[n - 1]
      if (par) return { capitoloId: posto.cap.id, sezioneId: posto.sez.id, paragrafo: n, passo: par.slice(0, 120), spostato: false }
      // Il paragrafo non c'è: il compito resta, legato alla sezione.
      return { capitoloId: posto.cap.id, sezioneId: posto.sez.id, paragrafo: null, passo: '', spostato: true }
    }
  }
  const cap = p.match(/\d+/)
  if (cap && !/tesi/i.test(p)) {
    const c = capitoli[Number(cap[0]) - 1]
    if (c) return { capitoloId: c.id, sezioneId: null, paragrafo: null, passo: '', spostato: !!sez }
  }
  return { capitoloId: null, sezioneId: null, paragrafo: null, passo: '', spostato: !!sez }
}

/** Chiede al Revisore la lista delle correzioni (con la chiave API o gratis tramite Claude.ai). */
export async function creaCorrezioni(testoNote: string, origine: string): Promise<NoteCorrezioni> {
  const note = testoNote.trim()
  if (!note) throw new ApiError('sconosciuto', 'Incolla prima le note del relatore.')
  const s = useStudio.getState()
  const elenco = posti(null)
  const client = creaClient(s.apiKey)
  s.patchAgente('revisore', { status: 'lavoro', etichetta: 'trasformo le note in una lista…', errore: null })
  try {
    const risposta = await sorveglia<Consegna<{ compiti: CompitoGrezzo[] }>>({
      agente: 'revisore',
      passo: 'Correzioni del relatore',
      esegui: (_t, suggerimento) =>
        chiamataStrutturata({
          client,
          model: s.preferenze.modelli.revisore,
          maxTokens: 8000,
          effort: 'medium',
          chi: 'revisore',
          azione: 'lista delle correzioni del relatore',
          system: [{ type: 'text', text: suggerimento ? `${SYSTEM_REVISORE}\n\n${suggerimento}` : SYSTEM_REVISORE }],
          messages: [
            {
              role: 'user',
              content: `${contesto()}\n\nTESTO DELLA TESI (paragrafi etichettati):\n"""\n${testoEtichettato(elenco)}\n"""\n\nNOTE DEL RELATORE:\n"""\n${note}\n"""\n\nCOMPITO: trasforma le note del relatore in una lista di cose concrete da fare. Una nota che chiede più cose diventa più compiti. Per ogni compito indica la posizione con le etichette del testo (il paragrafo "2.1 §3" quando la nota parla di un punto preciso, altrimenti la sezione o il capitolo, oppure "tesi"), scrivi il compito in una frase semplice che inizia con un verbo e copia le parole del relatore da cui nasce. Non inventare richieste che il relatore non ha fatto.`,
            },
          ],
          schema: SCHEMA_CORREZIONI,
        }),
      valida: (d) =>
        Array.isArray(d?.risultato?.compiti) && d.risultato.compiti.length > 0
          ? { ok: true }
          : { ok: false, suggerimento: 'Manca "compiti", oppure è vuoto.' },
    })

    let spostati = 0
    const compiti: CompitoCorrezione[] = []
    const normNote = normalizza(note)
    for (const g of risposta.risultato.compiti) {
      const testo = String(g.compito ?? '').trim()
      if (!testo) continue
      const dove = leggiPosizione(g.posizione, elenco)
      if (dove.spostato) spostati += 1
      const nota = String(g.nota ?? '').trim()
      compiti.push({
        id: nuovoId('cmp'),
        compito: testo,
        // Le parole del relatore si tengono solo se compaiono davvero nelle note.
        nota: nota && normNote.includes(normalizza(nota).slice(0, 40)) ? nota : '',
        capitoloId: dove.capitoloId,
        sezioneId: dove.sezioneId,
        paragrafo: dove.paragrafo,
        passo: dove.passo,
        fatto: false,
      })
    }
    const nuove: NoteCorrezioni = { id: nuovoId('cor'), data: adesso(), testo: note, origine, compiti, spostati }
    aggiorna((e) => [nuove, ...e])
    useStudio.getState().patchAgente('revisore', { status: 'attesa', etichetta: `${compiti.length} correzioni da fare`, passaggi: risposta.passaggi, errore: null })
    logOk('revisore', `Note del relatore: ${compiti.length} correzioni${spostati ? `, ${spostati} legate alla sezione perché il paragrafo indicato non c'è` : ''}.`)
    return nuove
  } catch (err) {
    useStudio.getState().patchAgente('revisore', { status: 'errore', etichetta: "c'è stato un problema", errore: err instanceof Error ? err.message : 'Qualcosa è andato storto.' })
    throw err
  }
}
