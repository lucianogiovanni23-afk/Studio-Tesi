import { useEffect, useRef, useState } from 'react'
import { inviaMessaggioChat } from '../agents/pipeline'
import { useStudioStore } from '../store'

const SUGGERIMENTI = [
  'Di cosa parla il materiale del corso che ho caricato?',
  'Le fonti selezionate reggono per una tesi triennale?',
  'Quale delle tre opzioni è più solida e perché?',
  'Che obiezioni mi farebbe il relatore su questo capitolo?',
  'Come faccio a mostrare la leva operativa con i dati delle stagioni?',
  'Cosa sta facendo ora ogni agente?',
  'Cosa dice la console di diagnostica?',
]

export function ChatPanel() {
  const messaggi = useStudioStore((s) => s.chat)
  const inCorso = useStudioStore((s) => s.chatInCorso)
  const parziale = useStudioStore((s) => s.chatParziale)
  const errore = useStudioStore((s) => s.chatErrore)
  const svuota = useStudioStore((s) => s.svuotaChat)
  const [bozza, setBozza] = useState('')
  const elenco = useRef<HTMLDivElement>(null)

  useEffect(() => {
    elenco.current?.scrollTo({ top: elenco.current.scrollHeight, behavior: 'smooth' })
  }, [messaggi, parziale])

  const invia = (testo: string) => {
    const valore = testo.trim()
    if (!valore || inCorso) return
    setBozza('')
    void inviaMessaggioChat(valore)
  }

  return (
    <section className="pannello chat">
      <h2 className="pannello-titolo filetto-doppio">
        Chat sul progetto
        {messaggi.length > 0 && (
          <button type="button" className="bottone bottone-minuscolo" onClick={svuota}>
            Nuova conversazione
          </button>
        )}
      </h2>

      <div className="chat-storico" ref={elenco}>
        {messaggi.length === 0 && !inCorso && (
          <p className="nota">
            Chiedimi del merito della tesi, dello stato degli agenti o di cosa dice la console.
          </p>
        )}
        {messaggi.map((m, i) => (
          <div key={i} className={`chat-messaggio chat-${m.role}`}>
            <span className="chat-chi">{m.role === 'user' ? 'Tu' : 'Assistente'}</span>
            <p className="chat-testo">{m.content}</p>
          </div>
        ))}
        {inCorso && (
          <div className="chat-messaggio chat-assistant">
            <span className="chat-chi">Assistente</span>
            <p className="chat-testo">
              {parziale || <em className="chat-attesa">sto ragionando sul tuo progetto…</em>}
            </p>
          </div>
        )}
      </div>

      {errore && (
        <p className="allerta allerta-errore" role="alert">
          {errore}
        </p>
      )}

      {messaggi.length === 0 && (
        <div className="suggerimenti">
          {SUGGERIMENTI.map((s) => (
            <button key={s} type="button" className="gettone" onClick={() => invia(s)} disabled={inCorso}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat-modulo"
        onSubmit={(e) => {
          e.preventDefault()
          invia(bozza)
        }}
      >
        <textarea
          className="campo area"
          rows={2}
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              invia(bozza)
            }
          }}
          placeholder="Scrivi la tua domanda…"
          aria-label="Domanda per l'assistente"
        />
        <button type="submit" className="bottone bottone-primario" disabled={inCorso || bozza.trim() === ''}>
          {inCorso ? 'Attendi…' : 'Invia'}
        </button>
      </form>
    </section>
  )
}
