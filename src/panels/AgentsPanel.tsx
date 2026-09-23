import { useState } from 'react'
import { AGENTI } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { AgentKey, AgentStatus } from '../types'

const ETICHETTA_STATO: Record<AgentStatus, string> = {
  idle: 'in attesa del turno',
  walking: 'raggiunge la postazione',
  working: 'al lavoro',
  waiting: 'attende la tua decisione',
  done: 'completato',
  error: 'errore',
}

function SchedaAgente({ agentKey }: { agentKey: AgentKey }) {
  const agente = AGENTI.find((a) => a.key === agentKey)!
  const runtime = useStudioStore((s) => s.agenti[agentKey])
  const nuvolettaAperta = useStudioStore((s) => s.nuvolettaAperta)
  const alternaNuvoletta = useStudioStore((s) => s.alternaNuvoletta)
  const inquadra = useStudioStore((s) => s.inquadra)

  return (
    <article className={`scheda-agente stato-${runtime.status}`} style={{ borderLeftColor: agente.colore }}>
      <header className="scheda-testa">
        <span className="pallino" style={{ background: agente.colore }} />
        <div className="scheda-identita">
          <strong style={{ color: agente.colore }}>{agente.nome}</strong>
          <span className="scheda-ruolo">{agente.ruolo}</span>
        </div>
        <span className={`pillola pillola-${runtime.status}`}>{ETICHETTA_STATO[runtime.status]}</span>
      </header>

      {runtime.microLabel && <p className="scheda-micro">{runtime.microLabel}</p>}
      {runtime.tentativi > 1 && (
        <p className="nota">Tentativi effettuati dal Controllore: {runtime.tentativi}</p>
      )}
      {runtime.errore && (
        <p className="allerta allerta-errore" role="alert">
          {runtime.errore}
        </p>
      )}

      <div className="azioni">
        <button type="button" className="bottone bottone-minuscolo" onClick={() => inquadra(agentKey)}>
          Vai alla postazione
        </button>
        <button
          type="button"
          className="bottone bottone-minuscolo"
          onClick={() => alternaNuvoletta(agentKey)}
          disabled={runtime.passaggi.length === 0}
        >
          {nuvolettaAperta === agentKey ? 'Chiudi ragionamento' : 'Apri ragionamento'}
        </button>
      </div>

      {runtime.passaggi.length > 0 && (
        <ol className="passaggi">
          {runtime.passaggi.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      )}
    </article>
  )
}

function Dossier() {
  const dossier = useStudioStore((s) => s.dossier)
  const [aperto, setAperto] = useState(false)
  if (!dossier) return null

  return (
    <section className="pannello">
      <button
        type="button"
        className="riga-espandibile"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
      >
        <span aria-hidden>{aperto ? '▾' : '▸'}</span> Dossier del corso
        <span className="nota-inline">{dossier.concetti_chiave.length} concetti chiave</span>
      </button>

      {aperto && (
        <div className="dossier">
          <h3 className="sotto-titolo">Concetti chiave</h3>
          <ul className="elenco-semplice">
            {dossier.concetti_chiave.map((c, i) => (
              <li key={i}>
                <strong>{c.termine}</strong> — {c.definizione}
                <em className="riferimento"> ({c.lezione_di_riferimento})</em>
              </li>
            ))}
          </ul>

          <h3 className="sotto-titolo">Metriche applicabili</h3>
          <ul className="elenco-semplice">
            {dossier.metriche_applicabili.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>

          <h3 className="sotto-titolo">Collegamenti con l'argomento</h3>
          <ul className="elenco-semplice">
            {dossier.collegamenti_argomento.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>

          <h3 className="sotto-titolo">Sintesi dei dati del caso</h3>
          <p className="paragrafo">{dossier.sintesi_dati_caso}</p>
        </div>
      )}
    </section>
  )
}

function Fonti() {
  const fonti = useStudioStore((s) => s.fonti)
  const scartateDalRicercatore = useStudioStore((s) => s.fontiScartate)
  const selezionate = useStudioStore((s) => s.selezionate)
  const avviso = useStudioStore((s) => s.avvisoRicerca)
  const [mostraScartate, setMostraScartate] = useState(false)

  if (fonti.length === 0 && !avviso) return null
  const scelte = new Set(selezionate.map((s) => s.url))

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">Fonti dalla ricerca web</h2>
      {avviso && (
        <p className="allerta allerta-avviso" role="alert">
          {avviso}
        </p>
      )}
      <p className="nota">
        {fonti.length} verificate · {selezionate.length} selezionate
      </p>

      <ul className="elenco-fonti">
        {fonti.map((f) => (
          <li key={f.url} className="fonte">
            <div className="fonte-testa">
              <strong>{f.titolo}</strong>
              <span className="etichetta-tipo">{f.tipo}</span>
              {scelte.has(f.url) && <span className="etichetta etichetta-ok">selezionata</span>}
            </div>
            <a className="fonte-url" href={f.url} target="_blank" rel="noreferrer noopener">
              {f.url}
            </a>
            <p className="fonte-testo">{f.descrizione}</p>
            <p className="fonte-testo fonte-motivo">{f.perche_rilevante}</p>
          </li>
        ))}
      </ul>

      {scartateDalRicercatore.length > 0 && (
        <>
          <button
            type="button"
            className="bottone bottone-vuoto bottone-piccolo"
            onClick={() => setMostraScartate((v) => !v)}
          >
            {mostraScartate ? 'Nascondi' : 'Mostra'} le {scartateDalRicercatore.length} fonti scartate dal
            Ricercatore
          </button>
          {mostraScartate && (
            <ul className="elenco-fonti elenco-fonti-tenue">
              {scartateDalRicercatore.map((s, i) => (
                <li key={i} className="fonte">
                  <strong>{s.titolo}</strong>
                  <span className="fonte-url">{s.url}</span>
                  <p className="fonte-testo">Scartata perché: {s.motivo}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function Checklist() {
  const referto = useStudioStore((s) => s.referto)
  const inquadra = useStudioStore((s) => s.inquadra)
  if (!referto) return null

  const icona = { ok: '✓', problema: '✕', non_applicabile: '–' }

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">Verifiche del Controllore</h2>
      <ul className="checklist">
        {referto.checklist.map((v) => (
          <li key={v.id} className={`voce-checklist voce-${v.esito}`}>
            <span className="voce-icona" aria-hidden>
              {icona[v.esito]}
            </span>
            <div>
              <strong>{v.voce}</strong>
              <p className="fonte-testo">{v.dettaglio}</p>
              {v.esito === 'problema' && v.agente && v.agente !== 'controllore' && (
                <button
                  type="button"
                  className="bottone bottone-minuscolo"
                  onClick={() => inquadra(v.agente!)}
                >
                  Vai al {v.agente}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AgentsPanel() {
  return (
    <>
      <section className="pannello">
        <h2 className="pannello-titolo filetto-doppio">La squadra</h2>
        <div className="griglia-agenti">
          {AGENTI.map((a) => (
            <SchedaAgente key={a.key} agentKey={a.key} />
          ))}
        </div>
      </section>
      <Dossier />
      <Fonti />
      <Checklist />
    </>
  )
}
