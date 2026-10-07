import { useEffect, useMemo, useRef, useState } from 'react'
import { fermaChat, inviaMessaggio, stimaMessaggio, useChat } from '../agents/chat'
import { formattaDollari } from '../agents/costs'
import { Conferma } from '../components/Conferma'
import { useStudio } from '../store'

const SPUNTI = [
  'A che punto sono con la tesi?',
  'Quali fonti non ho ancora letto?',
  'Che cosa manca al capitolo 3?',
  'Quali osservazioni del relatore sono ancora aperte?',
  'Quanto ho speso questo mese e per cosa?',
]

/** Chat che conosce tutta la tesi: capitoli, biblioteca, osservazioni, agenti e costi. */
export function Chat() {
  const messaggi = useStudio((s) => s.progetto.chat)
  const svuota = useStudio((s) => s.svuotaChat)
  const gratuita = useStudio((s) => !s.apiKey.trim())
  const modello = useStudio((s) => s.preferenze.modelli.chat)
  const inCorso = useChat((s) => s.inCorso)
  const errore = useChat((s) => s.errore)
  const [testo, setTesto] = useState('')
  const fine = useRef<HTMLDivElement>(null)
  const progetto = useStudio((s) => s.progetto)
  // Il contesto si ricostruisce solo quando cambia il progetto, non a ogni tasto.
  const stima = useMemo(() => {
    void progetto // serve solo da segnale di ricalcolo
    void modello
    return gratuita ? null : stimaMessaggio()
  }, [gratuita, progetto, modello])

  useEffect(() => {
    fine.current?.scrollIntoView({ block: 'end' })
  }, [messaggi])

  const invia = (t: string) => {
    if (!t.trim() || inCorso) return
    setTesto('')
    void inviaMessaggio(t)
  }

  return (
    <section className="pannello chat">
      <div className="pannello-testa">
        <h2>Chat sulla tesi</h2>
        {messaggi.length > 0 && (
          <Conferma classe="bottone bottone-piccolo bottone-vuoto" etichetta="Svuota la chat" domanda="Cancellare la conversazione?" conferma="Svuota" pericolosa onConferma={svuota} />
        )}
      </div>
      <p className="nota">
        Conosce capitoli e testi, biblioteca, quadro teorico, osservazioni del relatore, stato degli agenti e costi. Ha lo
        stesso vincolo di materia degli agenti.
      </p>

      <div className="chat-messaggi" aria-live="polite">
        {messaggi.length === 0 && (
          <div className="spunti">
            {SPUNTI.map((s) => (
              <button key={s} type="button" className="tema tema-spento" disabled={inCorso} onClick={() => invia(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messaggi.map((m) => (
          <div key={m.id} className={`messaggio messaggio-${m.ruolo}`}>
            <span className="messaggio-chi">{m.ruolo === 'studente' ? 'Tu' : 'Assistente'}</span>
            <div className="messaggio-testo">{m.testo || (inCorso ? '…' : '')}</div>
          </div>
        ))}
        <div ref={fine} />
      </div>

      {errore && <p className="allerta allerta-errore">{errore}</p>}
      <form
          className="chat-modulo"
          onSubmit={(e) => {
            e.preventDefault()
            invia(testo)
          }}
        >
          <textarea
            className="campo"
            rows={3}
            value={testo}
            placeholder="Scrivi una domanda (Invio per mandare, Maiusc+Invio per andare a capo)"
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                invia(testo)
              }
            }}
            aria-label="Messaggio per la chat"
          />
          <div className="riga-editor">
            {inCorso ? (
              <button type="button" className="bottone bottone-vuoto" onClick={fermaChat}>
                Ferma
              </button>
            ) : (
              <button type="submit" className="bottone bottone-primario" disabled={!testo.trim()}>
                Invia
              </button>
            )}
            {gratuita && <span className="nota">Gratis: ogni domanda passa da Claude.ai, con il contesto della tesi già pronto.</span>}
            {stima && (
              <span className="nota">
                circa {formattaDollari(stima.minimo)} – {formattaDollari(stima.massimo)} a messaggio con {modello} (il contesto della tesi resta in cache per 5 minuti; il primo messaggio costa di più)
              </span>
            )}
          </div>
        </form>
    </section>
  )
}
