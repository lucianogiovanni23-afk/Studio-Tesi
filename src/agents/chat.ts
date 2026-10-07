import { create } from 'zustand'
import { AGENTI, nomeChi } from './agenti'
import { autoreAnno } from '../domain/bibliografia'
import { ETICHETTA_STATO } from '../domain/etichette'
import { adesso, nuovoId } from '../domain/progettoIniziale'
import { costoDelMese, contaParoleTesto, useStudio } from '../store'
import type { Messaggio } from './api'
import { chiamataChatStream, creaClient, toApiError } from './api'
import { formattaDollari, stimaChiamata, tokenDaCaratteri, type Stima } from './costs'
import { SYSTEM_CHAT, intestazioneProgetto, quadroTestuale } from './prompts'

/** Oltre questa lunghezza il testo delle sezioni viene accorciato nel contesto della chat. */
const MAX_TESTO_TESI = 160_000
const MAX_STORIA = 20

/** Parte stabile del contesto: cambia solo quando cambiano tesi o biblioteca, quindi va in cache. */
export function contestoStabile(): string {
  const p = useStudio.getState().progetto
  const totale = p.capitoli.reduce((n, c) => n + c.sezioni.reduce((m, s) => m + s.testo.length, 0), 0)
  const quota = totale > MAX_TESTO_TESI ? MAX_TESTO_TESI / totale : 1
  const capitoli = p.capitoli
    .map((c, i) => {
      const sezioni = c.sezioni
        .map((s, j) => {
          const testo = quota < 1 ? `${s.testo.slice(0, Math.floor(s.testo.length * quota))}…` : s.testo
          return `--- ${i + 1}.${j + 1} ${s.titolo} (${contaParoleTesto(s.testo)} parole; fonti ${s.fontiConfermate ? 'approvate' : 'da approvare'}; scaletta ${s.scalettaApprovata ? 'approvata' : 'da approvare'})\n${testo.trim() || '(vuota)'}`
        })
        .join('\n')
      return `=== CAPITOLO ${i + 1}: ${c.titolo} — stato: ${ETICHETTA_STATO[c.stato]}\n${sezioni}`
    })
    .join('\n\n')
  const biblioteca = p.fonti
    .map(
      (f) =>
        `[F${f.numero}] ${autoreAnno(f)} ${f.titolo} — ${f.stato}${f.temi.length ? `; temi: ${f.temi.join(', ')}` : ''}${f.scheda ? `; risultati: ${f.scheda.risultati.slice(0, 300)}` : ''}`,
    )
    .join('\n')
  return [
    intestazioneProgetto(p),
    `QUADRO TEORICO DEL CORSO:\n${quadroTestuale(p.quadro)}`,
    `TESTO DELLA TESI${quota < 1 ? ' (accorciato per lunghezza)' : ''}:\n${capitoli}`,
    `BIBLIOTECA (${p.fonti.length} fonti):\n${biblioteca || '(vuota)'}`,
  ].join('\n\n')
}

/** Parte che cambia spesso (osservazioni, agenti, costi): sta dopo il punto in cache. */
export function contestoVariabile(): string {
  const s = useStudio.getState()
  const p = s.progetto
  const osservazioni = p.osservazioni
    .map((o) => {
      const cap = p.capitoli.findIndex((c) => c.id === o.capitoloId)
      const attesa = o.proposte.filter((x) => x.stato === 'in_attesa').length
      return `- (${o.stato}) ${cap >= 0 ? `cap. ${cap + 1}` : 'tutta la tesi'}: "${o.testo.slice(0, 400)}"${attesa ? ` — ${attesa} proposte da decidere` : ''}`
    })
    .join('\n')
  const agenti = AGENTI.map((a) => `- ${a.nome}: ${s.agenti[a.key].status}${s.agenti[a.key].etichetta ? ` (${s.agenti[a.key].etichetta})` : ''}`).join('\n')
  const perChi = new Map<string, number>()
  for (const u of p.usi) perChi.set(nomeChi(u.chi), (perChi.get(nomeChi(u.chi)) ?? 0) + u.costo)
  const costi = [...perChi.entries()].map(([k, v]) => `${k} ${formattaDollari(v)}`).join(', ')
  return [
    `OSSERVAZIONI DEL RELATORE:\n${osservazioni || '(nessuna)'}`,
    `RISULTATI DI RICERCA DA APPROVARE: ${p.inAttesa.length}`,
    `STATO DEGLI AGENTI:\n${agenti}`,
    `COSTI: questo mese ${formattaDollari(costoDelMese(p.usi))}; totale per agente: ${costi || 'nessuno'}`,
  ].join('\n\n')
}

export function stimaMessaggio(): Stima {
  const s = useStudio.getState()
  const storia = s.progetto.chat.slice(-MAX_STORIA).reduce((n, m) => n + m.testo.length, 0)
  return stimaChiamata(s.preferenze.modelli.chat, {
    letturaCache: tokenDaCaratteri(contestoStabile().length + SYSTEM_CHAT.length),
    input: tokenDaCaratteri(contestoVariabile().length + storia) + 300,
    output: 700,
  })
}

export const useChat = create<{ inCorso: boolean; errore: string | null }>(() => ({ inCorso: false, errore: null }))
let controller: AbortController | null = null

export function fermaChat() {
  controller?.abort()
}

export async function inviaMessaggio(testo: string): Promise<void> {
  if (useChat.getState().inCorso || !testo.trim()) return
  const s = useStudio.getState()
  const client = creaClient(s.apiKey)
  const storia = s.progetto.chat.slice(-MAX_STORIA)
  s.aggiungiMessaggio({ id: nuovoId('msg'), ruolo: 'studente', testo: testo.trim(), data: adesso() })
  const idRisposta = nuovoId('msg')
  useStudio.getState().aggiungiMessaggio({ id: idRisposta, ruolo: 'assistente', testo: '', data: adesso() })
  useChat.setState({ inCorso: true, errore: null })
  controller = new AbortController()

  // Contesto della tesi nel primo messaggio: la parte stabile con cache_control, poi quella variabile.
  const messaggi: Messaggio[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: contestoStabile(), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `${contestoVariabile()}\n\nUsa queste informazioni per rispondere alle domande dello studente.` },
      ],
    },
    { role: 'assistant', content: 'Ho davanti tutta la tesi, la biblioteca e lo stato del lavoro. Dimmi pure.' },
    ...storia.filter((m) => m.testo.trim()).map((m): Messaggio => ({ role: m.ruolo === 'studente' ? 'user' : 'assistant', content: m.testo })),
    { role: 'user', content: testo.trim() },
  ]

  let accumulato = ''
  let ultimoAggiornamento = 0
  try {
    const finale = await chiamataChatStream({
      client,
      model: s.preferenze.modelli.chat,
      maxTokens: 4000,
      effort: 'low',
      signal: controller.signal,
      chi: 'chat',
      azione: 'chat',
      system: [{ type: 'text', text: SYSTEM_CHAT }],
      messages: messaggi,
      onTesto: (pezzo) => {
        accumulato += pezzo
        // Si aggiorna l'interfaccia a intervalli: ogni scrittura nello store finisce in IndexedDB.
        const ora = Date.now()
        if (ora - ultimoAggiornamento > 120) {
          ultimoAggiornamento = ora
          useStudio.getState().aggiornaMessaggio(idRisposta, accumulato)
        }
      },
    })
    useStudio.getState().aggiornaMessaggio(idRisposta, finale || accumulato)
  } catch (err) {
    const fermata = controller?.signal.aborted
    useStudio.getState().aggiornaMessaggio(idRisposta, accumulato + (fermata ? '\n\n(risposta interrotta)' : ''))
    if (!fermata) useChat.setState({ errore: toApiError(err).message })
  } finally {
    useChat.setState({ inCorso: false })
    controller = null
  }
}
