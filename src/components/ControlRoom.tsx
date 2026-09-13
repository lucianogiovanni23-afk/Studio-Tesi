import { AGENTS, type AgentDefinition } from '../agents'
import { usePipelineStore, type AgentPhase } from '../store'
import { runPipeline } from '../lib/pipeline'

const BADGE: Record<AgentPhase, { label: string; className: string }> = {
  idle: { label: 'in pausa', className: 'badge-idle' },
  waiting: { label: 'in attesa', className: 'badge-waiting' },
  walking: { label: 'in arrivo', className: 'badge-waiting' },
  working: { label: 'al lavoro', className: 'badge-working' },
  done: { label: 'fatto', className: 'badge-done' },
  error: { label: 'errore', className: 'badge-error' },
}

function AgentCard({ agent, index }: { agent: AgentDefinition; index: number }) {
  const state = usePipelineStore((s) => s.agents[agent.id])
  const running = usePipelineStore((s) => s.running)
  const badge = BADGE[state.phase]

  return (
    <article className="card" style={{ '--agent': agent.color } as React.CSSProperties}>
      <header className="card-head">
        <span className="card-index">{index + 1}</span>
        <div className="card-titles">
          <h3>{agent.name}</h3>
          <p>{agent.role}</p>
        </div>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
      </header>

      {state.error && (
        <div className="card-error" role="alert">
          <p>{state.error}</p>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void runPipeline(agent.id)}
            disabled={running}
          >
            Riprova da qui
          </button>
        </div>
      )}

      {state.reasoning && (
        <div className="card-section">
          <span className="card-label">Ragionamento</span>
          <p className="reasoning">{state.reasoning}</p>
        </div>
      )}

      {state.result && (
        <div className="card-section">
          <span className="card-label">Risultato</span>
          <pre className="result">{state.result}</pre>
        </div>
      )}

      {!state.error && !state.result && !state.reasoning && (
        <p className="card-placeholder">
          {state.phase === 'working'
            ? 'Elaborazione in corso…'
            : state.phase === 'walking'
              ? 'Si sta dirigendo alla scrivania…'
              : 'Nessun output ancora.'}
        </p>
      )}
    </article>
  )
}

export function ControlRoom() {
  return (
    <section className="panel">
      <h2 className="panel-title">Sala di controllo</h2>
      <div className="cards">
        {AGENTS.map((agent, i) => (
          <AgentCard key={agent.id} agent={agent} index={i} />
        ))}
      </div>
    </section>
  )
}
