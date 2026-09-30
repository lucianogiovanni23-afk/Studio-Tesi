import { useState } from 'react'
import { AGENTE, AGENTI } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { AgentKey, AgentStatus } from '../types'

const ETICHETTA_STATO: Record<AgentStatus, string> = {
  idle: 'in attesa',
  walking: 'in arrivo',
  working: 'al lavoro',
  waiting: 'attende te',
  done: 'fatto',
  error: 'errore',
}

function Gettone({ agentKey, aperto, onApri }: { agentKey: AgentKey; aperto: boolean; onApri: () => void }) {
  const agente = AGENTE[agentKey]
  const stato = useStudioStore((s) => s.agenti[agentKey].status)
  const micro = useStudioStore((s) => s.agenti[agentKey].microLabel)

  return (
    <button
      type="button"
      className={`membro membro-${stato} ${aperto ? 'membro-aperto' : ''}`}
      style={{ ['--colore-agente' as string]: agente.colore }}
      onClick={onApri}
      aria-expanded={aperto}
      title={micro || ETICHETTA_STATO[stato]}
    >
      <span className="membro-punto" aria-hidden />
      <span className="membro-nome">{agente.nome}</span>
      <span className="membro-stato">{ETICHETTA_STATO[stato]}</span>
    </button>
  )
}

function Dettaglio({ agentKey }: { agentKey: AgentKey }) {
  const agente = AGENTE[agentKey]
  const runtime = useStudioStore((s) => s.agenti[agentKey])
  const modello = useStudioStore((s) => s.modelli[agentKey])
  const inquadra = useStudioStore((s) => s.inquadra)
  const alternaNuvoletta = useStudioStore((s) => s.alternaNuvoletta)
  const nuvoletta = useStudioStore((s) => s.nuvolettaAperta === agentKey)
  const scenaAttiva = useStudioStore((s) => s.modalitaScena !== 'spenta')

  return (
    <div className="membro-dettaglio" style={{ borderLeftColor: agente.colore }}>
      <p className="nota">
        <strong style={{ color: agente.colore }}>{agente.nome}</strong> · {agente.ruolo} · {modello}
      </p>
      {runtime.microLabel && <p className="scheda-micro">{runtime.microLabel}</p>}
      {runtime.tentativi > 1 && <p className="nota">Tentativi effettuati dal Controllore: {runtime.tentativi}</p>}
      {runtime.errore && (
        <p className="allerta allerta-errore" role="alert">
          {runtime.errore}
        </p>
      )}
      {runtime.passaggi.length > 0 ? (
        <ol className="passaggi">
          {runtime.passaggi.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      ) : (
        <p className="nota">Il ragionamento comparirà quando l'agente avrà consegnato.</p>
      )}
      {scenaAttiva && (
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
            {nuvoletta ? 'Chiudi la nuvoletta' : 'Nuvoletta in scena'}
          </button>
        </div>
      )}
    </div>
  )
}

/** La squadra in una riga: stato di ogni agente e, a richiesta, il suo ragionamento. */
export function TeamStrip() {
  const [aperto, setAperto] = useState<AgentKey | null>(null)

  return (
    <div className="squadra">
      <div className="squadra-riga">
        {AGENTI.map((a) => (
          <Gettone
            key={a.key}
            agentKey={a.key}
            aperto={aperto === a.key}
            onApri={() => setAperto((v) => (v === a.key ? null : a.key))}
          />
        ))}
      </div>
      {aperto && <Dettaglio agentKey={aperto} />}
    </div>
  )
}
