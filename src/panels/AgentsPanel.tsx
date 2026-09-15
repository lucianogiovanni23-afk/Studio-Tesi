import { useState } from 'react'
import { AGENTS } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { AgentKey, AgentStatus } from '../types'

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'in attesa del turno',
  queued: 'in coda',
  walking: 'sta andando alla postazione',
  working: 'al lavoro',
  waiting: 'aspetta la tua decisione',
  done: 'completato',
  error: 'errore',
}

function AgentCard({ agentKey }: { agentKey: AgentKey }) {
  const agent = AGENTS.find((a) => a.key === agentKey)!
  const runtime = useStudioStore((s) => s.agents[agentKey])
  const openBubbleAgent = useStudioStore((s) => s.openBubbleAgent)
  const toggleBubble = useStudioStore((s) => s.toggleBubble)
  const focusCamera = useStudioStore((s) => s.focusCamera)
  const [tab, setTab] = useState<'result' | 'reasoning'>('result')

  const hasOutput = runtime.result !== '' || runtime.reasoning !== ''

  return (
    <article className={`agent-card status-${runtime.status}`} style={{ borderColor: agent.color }}>
      <header className="agent-head">
        <span className="agent-dot" style={{ background: agent.color }} />
        <div className="agent-id">
          <strong style={{ color: agent.color }}>{agent.name}</strong>
          <span className="agent-role">{agent.role}</span>
        </div>
        <span className={`agent-status status-pill-${runtime.status}`}>
          {STATUS_LABEL[runtime.status]}
        </span>
      </header>

      {runtime.microLabel && <p className="agent-micro">{runtime.microLabel}</p>}
      {runtime.attempts > 1 && (
        <p className="hint">Tentativi effettuati dal Controllore: {runtime.attempts}</p>
      )}
      {runtime.error && <p className="alert alert-error">{runtime.error}</p>}

      <div className="agent-actions">
        <button type="button" className="btn btn-tiny" onClick={() => focusCamera(agentKey)}>
          Vai alla postazione
        </button>
        <button
          type="button"
          className="btn btn-tiny"
          onClick={() => toggleBubble(agentKey)}
          disabled={runtime.steps.length === 0}
        >
          {openBubbleAgent === agentKey ? 'Chiudi nuvoletta' : 'Apri nuvoletta'}
        </button>
      </div>

      {hasOutput && (
        <>
          <div className="mini-tabs">
            <button
              type="button"
              className={`mini-tab ${tab === 'result' ? 'mini-tab-on' : ''}`}
              onClick={() => setTab('result')}
            >
              Risultato
            </button>
            <button
              type="button"
              className={`mini-tab ${tab === 'reasoning' ? 'mini-tab-on' : ''}`}
              onClick={() => setTab('reasoning')}
            >
              Ragionamento ({runtime.steps.length})
            </button>
          </div>
          {tab === 'result' ? (
            <pre className="output">{runtime.result || '(nessun risultato)'}</pre>
          ) : runtime.steps.length > 0 ? (
            <ol className="steps">
              {runtime.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="hint">Nessun passaggio di ragionamento registrato.</p>
          )}
        </>
      )}
    </article>
  )
}

function SourcesSummary() {
  const foundSources = useStudioStore((s) => s.foundSources)
  const selectedSources = useStudioStore((s) => s.selectedSources)
  const searchNotice = useStudioStore((s) => s.searchNotice)

  if (foundSources.length === 0 && !searchNotice) return null
  const selectedUrls = new Set(selectedSources.map((s) => s.url))

  return (
    <section className="panel">
      <h2 className="panel-title">Fonti dalla ricerca web</h2>
      {searchNotice && <p className="alert alert-warn">{searchNotice}</p>}
      <p className="hint">
        {foundSources.length} trovate · {selectedSources.length} selezionate
      </p>
      <ul className="source-list">
        {foundSources.map((source) => (
          <li key={source.url} className="source">
            <div className="source-head">
              <strong>{source.title}</strong>
              {selectedUrls.has(source.url) && <span className="tag tag-ok">selezionata</span>}
              {!source.verified && <span className="tag tag-warn">URL non confermato</span>}
            </div>
            <a className="source-url" href={source.url} target="_blank" rel="noreferrer noopener">
              {source.url}
            </a>
            {source.summary && <p className="source-text">{source.summary}</p>}
            {source.relevance && <p className="source-text source-why">{source.relevance}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DraftsPanel() {
  const drafts = useStudioStore((s) => s.drafts)
  const supervisorVerdict = useStudioStore((s) => s.supervisorVerdict)
  const [active, setActive] = useState(0)

  if (drafts.length === 0) return null
  const current = drafts[Math.min(active, drafts.length - 1)]

  return (
    <section className="panel">
      <h2 className="panel-title">Le tre opzioni dello Scrittore</h2>
      <div className="mini-tabs">
        {drafts.map((draft, i) => (
          <button
            key={i}
            type="button"
            className={`mini-tab ${i === active ? 'mini-tab-on' : ''} ${
              draft.review && !draft.review.ok ? 'mini-tab-flag' : ''
            }`}
            onClick={() => setActive(i)}
          >
            {draft.label}
            {draft.review && !draft.review.ok ? ' ⚠' : draft.review ? ' ✓' : ''}
          </button>
        ))}
      </div>

      <p className="draft-approach">{current.approach}</p>

      {current.review && (
        <p className={`alert ${current.review.ok ? 'alert-ok' : 'alert-warn'}`}>
          <strong>Controllore:</strong> {current.review.ok ? 'nessun problema rilevato.' : 'problema rilevato.'}{' '}
          {current.review.note}
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => void navigator.clipboard?.writeText(current.text)}
        >
          Copia questa opzione
        </button>
        <span className="counter">{current.text.split(/\s+/).filter(Boolean).length} parole</span>
      </div>

      <pre className="output output-draft">{current.text}</pre>

      {supervisorVerdict && (
        <details className="details">
          <summary>Referto completo del Controllore</summary>
          <pre className="output">{supervisorVerdict}</pre>
        </details>
      )}
    </section>
  )
}

export function AgentsPanel() {
  return (
    <>
      <section className="panel">
        <h2 className="panel-title">I cinque agenti</h2>
        <div className="agent-grid">
          {AGENTS.map((agent) => (
            <AgentCard key={agent.key} agentKey={agent.key} />
          ))}
        </div>
      </section>
      <SourcesSummary />
      <DraftsPanel />
    </>
  )
}
