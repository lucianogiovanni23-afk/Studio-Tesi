import { useState } from 'react'
import { AGENTE } from '../agents/agenti'
import { useStudio } from '../store'
import type { AgentKey } from '../types'

/** Il ragionamento dell'agente, a passaggi: una nuvoletta alla volta. */
export function PassaggiRagionamento({ agentKey }: { agentKey: AgentKey }) {
  const agente = AGENTE[agentKey]
  const passaggi = useStudio((s) => s.agenti[agentKey].passaggi)
  const errore = useStudio((s) => s.agenti[agentKey].errore)
  const chiudi = useStudio((s) => s.apriNuvoletta)
  const [indice, setIndice] = useState(0)
  const [mostrati, setMostrati] = useState(passaggi)

  // Nuovo ragionamento: si riparte dal primo passaggio.
  if (mostrati !== passaggi) {
    setMostrati(passaggi)
    setIndice(0)
  }

  const totale = passaggi.length
  const i = Math.min(indice, Math.max(0, totale - 1))

  return (
    <div className="nuvoletta" style={{ borderColor: agente.colore }} role="dialog" aria-label={`Ragionamento di ${agente.nome}`}>
      <div className="nuvoletta-testa">
        <strong style={{ color: agente.colore }}>{agente.nome}</strong>
        <button type="button" className="icona" onClick={() => chiudi(null)} aria-label="Chiudi">
          ✕
        </button>
      </div>
      {errore && <p className="nuvoletta-errore">{errore}</p>}
      {totale > 0 ? (
        <>
          <p className="nuvoletta-passaggio">{passaggi[i]}</p>
          <div className="nuvoletta-nav">
            <button type="button" className="icona" onClick={() => setIndice(i - 1)} disabled={i === 0} aria-label="Passaggio precedente">
              ‹
            </button>
            <span>
              passaggio {i + 1} di {totale}
            </span>
            <button
              type="button"
              className="icona"
              onClick={() => setIndice(i + 1)}
              disabled={i >= totale - 1}
              aria-label="Passaggio successivo"
            >
              ›
            </button>
          </div>
        </>
      ) : (
        !errore && <p className="nuvoletta-passaggio nuvoletta-vuota">{agente.ruolo}</p>
      )}
    </div>
  )
}
