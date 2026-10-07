import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { AGENTE, AGENTI } from '../agents/agenti'
import { chiediAgente } from '../agents/colloquio'
import { Ritratto } from '../components/Ritratto'
import { useLargo } from '../hooks/useLayoutMode'
import { useQualitaScena } from '../scene/qualita'
import { useStudio } from '../store'
import type { AgentKey } from '../types'
import { useTurno, type Azione } from '../ufficio/dialoghi'
import { eseguiAzione, useUfficio } from '../ufficio/statoUfficio'

// L'ufficio 3D si carica a parte: sul telefono, o con la scena spenta, non si scarica nemmeno.
const Scene = lazy(() => import('../scene/Scene').then((m) => ({ default: m.Scene })))

/** Larghezza del pannello della conversazione sopra la scena, margini compresi. */
const PANNELLO = 470
/** Quante risposte si vedono subito. */
const VISIBILI = 3

const ora = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

/** Le quattro persone: si sceglie con chi parlare. */
function Colleghi() {
  const scelto = useStudio((s) => s.agenteUfficio)
  const scegli = useStudio((s) => s.scegliAgente)
  const agenti = useStudio((s) => s.agenti)
  const occupato = useUfficio((s) => s.occupato)
  return (
    <div className="colleghi" role="tablist" aria-label="Con chi vuoi parlare">
      {AGENTI.map((a) => (
        <button
          key={a.key}
          type="button"
          role="tab"
          aria-selected={scelto === a.key}
          className={`collega ${scelto === a.key ? 'collega-scelto' : ''}`}
          onClick={() => scegli(a.key)}
          style={{ ['--colore-agente' as string]: a.colore }}
        >
          <span className="collega-ritratto">
            <Ritratto k={a.key} dimensione={40} />
            {(occupato[a.key] || agenti[a.key].status === 'lavoro') && <span className="collega-lavora" aria-label="sta lavorando" />}
          </span>
          <span className="collega-nome">{a.persona.nome.split(' ')[0]}</span>
          <span className="collega-ruolo">{a.persona.titolo}</span>
        </button>
      ))}
    </div>
  )
}

function BottoneAzione({ k, a }: { k: AgentKey; a: Azione }) {
  const vai = useStudio((s) => s.vai)
  const occupato = useUfficio((s) => Boolean(s.occupato[k]))
  const input = useRef<HTMLInputElement>(null)
  const classe = `risposta ${a.principale ? 'risposta-principale' : ''}`
  if (a.file) {
    const f = a.file
    return (
      <>
        <button type="button" className={classe} disabled={occupato} onClick={() => input.current?.click()}>
          <span aria-hidden>📎</span> {a.etichetta}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept={f.accept}
          multiple={f.multiplo}
          aria-label={a.etichetta}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length) void eseguiAzione(k, `${a.etichetta}: ${files.map((x) => x.name).join(', ')}`, a.lavoro ?? 'lavoro…', () => f.carica(files))
          }}
        />
      </>
    )
  }
  return (
    <button
      type="button"
      className={classe}
      disabled={occupato && !a.vai}
      onClick={() => {
        if (a.vai) vai(a.vai)
        else if (a.esegui) void eseguiAzione(k, a.etichetta, a.lavoro ?? 'lavoro…', a.esegui)
      }}
    >
      {a.etichetta}
      {a.vai && <span aria-hidden> →</span>}
    </button>
  )
}

/** La conversazione con la persona scelta: storico, turno attuale con le risposte possibili, campo di testo. */
function Conversazione({ k }: { k: AgentKey }) {
  const def = AGENTE[k]
  const battute = useStudio((s) => s.progetto.conversazioni[k]) ?? []
  const runtime = useStudio((s) => s.agenti[k])
  const occupato = useUfficio((s) => s.occupato[k])
  const avanzamento = useUfficio((s) => s.avanzamento[k])
  const svuota = useStudio((s) => s.svuotaConversazione)
  const turno = useTurno(k)
  const [testo, setTesto] = useState('')
  const [speciale, setSpeciale] = useState<boolean | null>(null)
  const [tutte, setTutte] = useState(false)
  const [turnoPrima, setTurnoPrima] = useState(turno.testo)
  if (turnoPrima !== turno.testo) {
    // A ogni nuovo turno si riparte con le sole risposte principali.
    setTurnoPrima(turno.testo)
    setTutte(false)
  }
  // Prima le risposte principali; le altre restano a portata ma non affollano la conversazione.
  const azioni = [...turno.azioni.filter((a) => a.principale), ...turno.azioni.filter((a) => !a.principale)]
  const fondo = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const modoSpeciale = turno.speciale ? (speciale ?? turno.speciale.avvio) : false
  const lavora = occupato || (runtime.status === 'lavoro' ? runtime.etichetta || 'sta lavorando…' : null)

  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' })
  }, [battute.length, turno.testo, occupato])

  const invia = () => {
    const t = testo.trim()
    if (!t || occupato) return
    setTesto('')
    if (modoSpeciale && turno.speciale) {
      const s = turno.speciale
      setSpeciale(null)
      void eseguiAzione(k, t, s.lavoro, () => s.invia(t))
    } else {
      useStudio.getState().faiParlare(1500)
      void chiediAgente(k, t)
    }
  }

  return (
    <section className="conversazione" aria-label={`Conversazione con ${def.persona.nome}`} style={{ ['--colore-agente' as string]: def.colore }}>
      <header className="conversazione-testa">
        <Ritratto k={k} dimensione={52} />
        <div>
          <h2>{def.persona.nome}</h2>
          <p>
            {def.persona.titolo}
            {lavora ? <span className="sta-lavorando"> · {avanzamento ?? lavora}</span> : null}
          </p>
        </div>
        {battute.length > 0 && (
          <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={() => svuota(k)} title="Cancella lo storico di questa conversazione">
            Ricomincia
          </button>
        )}
      </header>

      <div className="conversazione-storico" aria-live="polite">
        <div className="battuta battuta-agente">
          <p>Buongiorno! {def.persona.saluto}</p>
        </div>
        {battute.map((b) => (
          <div key={b.id} className={`battuta battuta-${b.da} ${b.tono ? `battuta-${b.tono}` : ''}`}>
            <p>{b.testo}</p>
            <time dateTime={b.data}>{ora(b.data)}</time>
          </div>
        ))}
        {lavora ? (
          <div className="battuta battuta-agente battuta-attesa">
            <p>
              <span className="puntini" aria-hidden>
                <i />
                <i />
                <i />
              </span>{' '}
              {avanzamento ?? lavora}
            </p>
          </div>
        ) : (
          <div className="battuta battuta-agente battuta-turno">
            <p>{turno.testo}</p>
            {turno.scheda && <div className="battuta-scheda">{turno.scheda}</div>}
          </div>
        )}
        {!lavora && turno.azioni.length > 0 && (
          <div className="risposte" role="group" aria-label="Risposte possibili">
            {(tutte ? azioni : azioni.slice(0, VISIBILI)).map((a) =>
              a.speciale ? (
                <button
                  key={a.id}
                  type="button"
                  className="risposta"
                  onClick={() => {
                    setSpeciale(true)
                    campo.current?.focus()
                  }}
                >
                  {a.etichetta}
                </button>
              ) : (
                <BottoneAzione key={a.id} k={k} a={a} />
              ),
            )}
            {!tutte && azioni.length > VISIBILI && (
              <button type="button" className="risposta risposta-altro" onClick={() => setTutte(true)}>
                Altre opzioni ({azioni.length - VISIBILI})
              </button>
            )}
          </div>
        )}
        <div ref={fondo} />
      </div>

      <form
        className={`conversazione-campo ${modoSpeciale ? 'campo-speciale' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          invia()
        }}
      >
        {modoSpeciale && turno.speciale && (
          <p className="campo-modo">
            {turno.speciale.placeholder.split(':')[0]}
            <button type="button" className="link" onClick={() => setSpeciale(false)}>
              oppure fai una domanda
            </button>
          </p>
        )}
        <div className="campo-riga">
          <textarea
            ref={campo}
            className="campo"
            rows={2}
            value={testo}
            placeholder={modoSpeciale && turno.speciale ? turno.speciale.placeholder : `Scrivi a ${def.persona.nome.split(' ')[0]}…`}
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                invia()
              }
            }}
            aria-label={`Messaggio per ${def.persona.nome}`}
          />
          <button type="submit" className="bottone bottone-primario" disabled={!testo.trim() || Boolean(occupato)}>
            {modoSpeciale && turno.speciale ? turno.speciale.invio : 'Invia'}
          </button>
        </div>
      </form>
    </section>
  )
}

export function Ufficio() {
  const scelto = useStudio((s) => s.agenteUfficio)
  const qualita = useQualitaScena()
  const largo = useLargo(1000)
  const conScena = largo && qualita !== 'spenta'
  return (
    <div className={`ufficio ${conScena ? 'ufficio-con-scena' : ''}`}>
      {conScena && (
        <div className="ufficio-scena">
          <Suspense fallback={<div className="scena scena-carico">Apro l'ufficio…</div>}>
            <Scene qualita={qualita} spazioDestra={PANNELLO} />
          </Suspense>
        </div>
      )}
      <div className="ufficio-pannello">
        <Colleghi />
        <Conversazione key={scelto} k={scelto} />
      </div>
    </div>
  )
}
