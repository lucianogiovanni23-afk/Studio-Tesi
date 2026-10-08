import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { AGENTE, AGENTI } from '../agents/agenti'
import { chiediAgente } from '../agents/colloquio'
import { Ritratto } from '../components/Ritratto'
import { useLargo, useMovimentoRidotto } from '../hooks/useLayoutMode'
import { useQualitaScena } from '../scene/qualita'
import { useStudio } from '../store'
import type { AgentKey } from '../types'
import { useTurno, type Azione } from '../ufficio/dialoghi'
import { eseguiAzione, useUfficio } from '../ufficio/statoUfficio'
import { seguiAmbiente } from '../ui/ambiente'
import type { Schermata } from '../types'
import '../styles/caricamento.css'

// L'ufficio 3D si carica a parte: sul telefono, o con la scena spenta, non si scarica nemmeno.
const Scene = lazy(() => import('../scene/Scene').then((m) => ({ default: m.Scene })))

/** Eventi della scena 3D (definiti in scene/Effetti e scene/punti: qui solo i nomi, per non caricarla). */
const EVENTO_PRONTO = 'studio-tesi-ufficio-pronto'
const EVENTO_PROGRESSO = 'studio-tesi-ufficio-progresso'
const EVENTO_VOLO = 'studio-tesi-vola-schermo'
/** Volo della telecamera dentro lo schermo prima di cambiare pagina: mai più di così. */
const ATTESA_VOLO = 600

let volando = false

/**
 * Apre una pagina dall'ufficio: se la sala 3D è visibile la telecamera vola
 * nello schermo di chi parla e la pagina "esce" dal monitor; altrimenti (o
 * con meno animazioni) si va subito.
 */
function apriDaSchermo(k: AgentKey, dove: Schermata) {
  const vai = useStudio.getState().vai
  const radice = document.documentElement
  const ridotto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const scena = document.querySelector('.scena-ufficio canvas')
  if (ridotto || !scena || radice.dataset.ufficioPronto !== '1') {
    vai(dove)
    return
  }
  if (volando) return
  volando = true
  radice.classList.add('volo-schermo')
  window.dispatchEvent(new CustomEvent(EVENTO_VOLO, { detail: k }))
  window.setTimeout(() => {
    volando = false
    radice.classList.remove('volo-schermo')
    radice.classList.add('esce-schermo')
    vai(dove)
    window.setTimeout(() => radice.classList.remove('esce-schermo'), 700)
  }, ATTESA_VOLO)
}

/**
 * Schermata di caricamento sopra la sala 3D: marchio, frase e una barra che
 * segue i download veri (useProgress, dentro la scena). Sparisce in
 * dissolvenza quando il primo fotogramma è pronto.
 */
function CaricamentoUfficio() {
  const ridotto = useMovimentoRidotto()
  const [progresso, setProgresso] = useState(0)
  const [pronto, setPronto] = useState(() => document.documentElement.dataset.ufficioPronto === '1')
  const [via, setVia] = useState(pronto)

  useEffect(() => {
    const avanza = (e: Event) => {
      const p = Number((e as CustomEvent<number>).detail) || 0
      setProgresso((x) => Math.max(x, p))
    }
    const fatto = () => setPronto(true)
    window.addEventListener(EVENTO_PROGRESSO, avanza)
    window.addEventListener(EVENTO_PRONTO, fatto)
    // rete di sicurezza: la schermata non resta mai lì per sempre
    const t = window.setTimeout(fatto, 30000)
    return () => {
      window.removeEventListener(EVENTO_PROGRESSO, avanza)
      window.removeEventListener(EVENTO_PRONTO, fatto)
      window.clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    if (!pronto) return
    const t = window.setTimeout(() => setVia(true), ridotto ? 0 : 650)
    return () => window.clearTimeout(t)
  }, [pronto, ridotto])

  if (via) return null
  // il primo 10% è lo scaricamento del codice 3D, poi i file veri
  const quota = pronto ? 100 : Math.round(10 + progresso * 0.85)
  return (
    <div className={`caricamento-ufficio ${pronto ? 'caricamento-finito' : ''}`} role="status" aria-live="polite">
      <div className="caricamento-centro">
        <svg className="caricamento-marchio" viewBox="0 0 32 32" width="64" height="64" aria-hidden>
          <g className="foglia foglia-oliva">
            <ellipse cx="13" cy="17" rx="7" ry="10" transform="rotate(-25 13 17)" />
          </g>
          <g className="foglia foglia-oro">
            <ellipse cx="21" cy="14" rx="5" ry="8" transform="rotate(30 21 14)" />
          </g>
        </svg>
        <p className="caricamento-testo">{pronto ? 'Eccoci.' : "Sto preparando l'ufficio…"}</p>
        <div className="caricamento-barra" role="progressbar" aria-label="Caricamento dell'ufficio" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quota}>
          <span style={{ transform: `scaleX(${quota / 100})` }} />
        </div>
        <p className="caricamento-quota" aria-hidden>
          {quota}%
        </p>
      </div>
    </div>
  )
}

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
          <span className="collega-nome">{a.persona.breve}</span>
          <span className="collega-ruolo">{a.persona.titolo}</span>
        </button>
      ))}
    </div>
  )
}

function BottoneAzione({ k, a }: { k: AgentKey; a: Azione }) {
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
            if (files.length) void eseguiAzione(k, `${a.etichetta}: ${files.map((x) => x.name).join(', ')}`, a.lavoro ?? 'ci lavoro…', () => f.carica(files))
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
        if (a.vai) apriDaSchermo(k, a.vai)
        else if (a.esegui) void eseguiAzione(k, a.etichetta, a.lavoro ?? 'ci lavoro…', a.esegui)
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
          <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={() => svuota(k)} title="Cancella questa chat e riparti da zero">
            Ricomincia
          </button>
        )}
      </header>

      <div className="conversazione-storico" aria-live="polite">
        <div className="battuta battuta-agente">
          <p>Ciao! {def.persona.saluto}</p>
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
            placeholder={modoSpeciale && turno.speciale ? turno.speciale.placeholder : 'Scrivi qui quello che vuoi chiedere…'}
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
  // sottofondo d'ufficio, solo se i suoni sono accesi e solo finché si è qui
  useEffect(() => seguiAmbiente(), [])
  return (
    <div className={`ufficio ${conScena ? 'ufficio-con-scena' : ''}`}>
      {conScena && (
        <div className="ufficio-scena">
          <Suspense fallback={<div className="scena scena-carico" />}>
            <Scene key={qualita} qualita={qualita} spazioDestra={PANNELLO} />
          </Suspense>
          <CaricamentoUfficio key={qualita} />
        </div>
      )}
      <div className="ufficio-pannello">
        <Colleghi />
        <Conversazione key={scelto} k={scelto} />
      </div>
    </div>
  )
}
