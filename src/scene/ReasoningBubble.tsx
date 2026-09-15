import { useState } from 'react'
import { Html } from '@react-three/drei'
import { AGENT_BY_KEY } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { AgentKey } from '../types'

/**
 * Nuvoletta ancorata sopra la testa dell'agente: mostra il RAGIONAMENTO
 * spezzato in passaggi discreti, uno alla volta.
 */
export function ReasoningBubble({ agentKey }: { agentKey: AgentKey }) {
  const agent = AGENT_BY_KEY[agentKey]
  const steps = useStudioStore((s) => s.agents[agentKey].steps)
  const error = useStudioStore((s) => s.agents[agentKey].error)
  const closeBubble = useStudioStore((s) => s.closeBubble)
  const [index, setIndex] = useState(0)
  const [shownSteps, setShownSteps] = useState(steps)

  // Nuovo ragionamento: si riparte dal primo passaggio.
  if (shownSteps !== steps) {
    setShownSteps(steps)
    setIndex(0)
  }

  const total = steps.length
  const current = total > 0 ? steps[Math.min(index, total - 1)] : ''

  return (
    <Html position={[0, 3.05, 0]} center distanceFactor={7.5} zIndexRange={[40, 20]}>
      <div className="bubble" style={{ borderColor: agent.color }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="bubble-head">
          <strong style={{ color: agent.color }}>{agent.name}</strong>
          <button
            type="button"
            className="bubble-close"
            onClick={closeBubble}
            aria-label="Chiudi la nuvoletta"
          >
            ✕
          </button>
        </div>

        {total > 0 ? (
          <>
            <p className="bubble-step">{current}</p>
            <div className="bubble-nav">
              <button
                type="button"
                className="bubble-arrow"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                aria-label="Passaggio precedente"
              >
                ‹
              </button>
              <span className="bubble-counter">
                passaggio {Math.min(index, total - 1) + 1} di {total}
              </span>
              <button
                type="button"
                className="bubble-arrow"
                onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                disabled={index >= total - 1}
                aria-label="Passaggio successivo"
              >
                ›
              </button>
            </div>
          </>
        ) : (
          <p className="bubble-step bubble-empty">
            {error ?? 'Nessun ragionamento ancora: questo agente non ha lavorato.'}
          </p>
        )}
      </div>
    </Html>
  )
}
