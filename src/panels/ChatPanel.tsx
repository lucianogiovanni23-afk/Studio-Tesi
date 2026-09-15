import { useEffect, useRef, useState } from 'react'
import { sendChatMessage } from '../agents/pipeline'
import { useStudioStore } from '../store'

const SUGGESTIONS = [
  'Di cosa parla il materiale del corso che ho caricato?',
  'Le fonti selezionate sono valide per un capitolo di tesi?',
  'Quale delle tre opzioni è la più solida e perché?',
  'Che obiezioni mi farebbe il relatore su questo capitolo?',
  'Che taglio conviene dare a questo capitolo?',
  'Cosa sta facendo ora ogni agente?',
  'Cosa dice la console di diagnostica?',
]

export function ChatPanel() {
  const messages = useStudioStore((s) => s.chatMessages)
  const busy = useStudioStore((s) => s.chatBusy)
  const error = useStudioStore((s) => s.chatError)
  const clearChat = useStudioStore((s) => s.clearChat)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const submit = (text: string) => {
    const value = text.trim()
    if (!value || busy) return
    setDraft('')
    void sendChatMessage(value)
  }

  return (
    <section className="panel chat">
      <h2 className="panel-title">
        Chat sul progetto
        {messages.length > 0 && (
          <button type="button" className="btn btn-tiny" onClick={clearChat}>
            Nuova conversazione
          </button>
        )}
      </h2>

      <div className="chat-log" ref={listRef}>
        {messages.length === 0 && (
          <p className="hint">
            Chiedimi del merito della tesi, dello stato degli agenti o di cosa dice la console.
          </p>
        )}
        {messages.map((message, i) => (
          <div key={i} className={`chat-msg chat-${message.role}`}>
            <span className="chat-who">{message.role === 'user' ? 'Tu' : 'Assistente'}</span>
            <p className="chat-text">{message.content}</p>
          </div>
        ))}
        {busy && (
          <div className="chat-msg chat-assistant">
            <span className="chat-who">Assistente</span>
            <p className="chat-text chat-typing">sto ragionando sul tuo progetto…</p>
          </div>
        )}
      </div>

      {error && <p className="alert alert-error">{error}</p>}

      {messages.length === 0 && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => submit(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        <textarea
          className="textarea"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit(draft)
            }
          }}
          placeholder="Scrivi la tua domanda…"
          aria-label="Domanda per l'assistente"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || draft.trim() === ''}>
          {busy ? 'Attendi…' : 'Invia'}
        </button>
      </form>
    </section>
  )
}
