import { useState } from 'react'
import { Html } from '@react-three/drei'
import { AGENTE } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { AgentKey } from '../types'

/**
 * Nuvoletta ancorata sopra il broker: mostra i passaggi del ragionamento uno
 * alla volta. Può essere aperta una sola nuvoletta per volta (lo store tiene un
 * unico campo `nuvolettaAperta`).
 */
export function ReasoningBubble({ agentKey }: { agentKey: AgentKey }) {
  const agente = AGENTE[agentKey]
  const passaggi = useStudioStore((s) => s.agenti[agentKey].passaggi)
  const errore = useStudioStore((s) => s.agenti[agentKey].errore)
  const chiudi = useStudioStore((s) => s.chiudiNuvoletta)

  const [indice, setIndice] = useState(0)
  const [mostrati, setMostrati] = useState(passaggi)

  // Nuovo ragionamento: si riparte dal primo passaggio.
  if (mostrati !== passaggi) {
    setMostrati(passaggi)
    setIndice(0)
  }

  const totale = passaggi.length
  const corrente = totale > 0 ? passaggi[Math.min(indice, totale - 1)] : ''

  return (
    <Html position={[0, 3.05, 0]} center distanceFactor={7.5} zIndexRange={[40, 20]}>
      <div
        className="nuvoletta"
        style={{ borderColor: agente.colore }}
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Ragionamento di ${agente.nome}`}
      >
        <div className="nuvoletta-testa">
          <strong style={{ color: agente.colore }}>{agente.nome}</strong>
          <button type="button" className="nuvoletta-chiudi" onClick={chiudi} aria-label="Chiudi la nuvoletta">
            ✕
          </button>
        </div>

        {totale > 0 ? (
          <>
            <p className="nuvoletta-passaggio">{corrente}</p>
            <div className="nuvoletta-nav">
              <button
                type="button"
                className="nuvoletta-freccia"
                onClick={() => setIndice((i) => Math.max(0, i - 1))}
                disabled={indice === 0}
                aria-label="Passaggio precedente"
              >
                ‹
              </button>
              <span className="nuvoletta-contatore">
                passaggio {Math.min(indice, totale - 1) + 1} di {totale}
              </span>
              <button
                type="button"
                className="nuvoletta-freccia"
                onClick={() => setIndice((i) => Math.min(totale - 1, i + 1))}
                disabled={indice >= totale - 1}
                aria-label="Passaggio successivo"
              >
                ›
              </button>
            </div>
          </>
        ) : (
          <p className="nuvoletta-passaggio nuvoletta-vuota">
            {errore ?? 'Nessun ragionamento registrato: questo agente non ha ancora lavorato.'}
          </p>
        )}
      </div>
    </Html>
  )
}
