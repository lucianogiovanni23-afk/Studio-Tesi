import { AGENTI } from '../agents/agenti'
import { useStudio } from '../store'
import { PassaggiRagionamento } from './PassaggiRagionamento'

const TESTO_STATO = {
  riposo: 'a riposo',
  lavoro: 'sta lavorando',
  attesa: 'aspetta te',
  fatto: 'ha finito',
  errore: 'qualcosa non va',
}

/**
 * Stato degli agenti: compare solo quando qualcuno lavora, aspetta, ha finito
 * o ha avuto un errore. Tocca un agente per il suo ragionamento.
 */
export function AgentiBar() {
  const agenti = useStudio((s) => s.agenti)
  const nuvoletta = useStudio((s) => s.nuvoletta)
  const apri = useStudio((s) => s.apriNuvoletta)
  const attivi = AGENTI.filter((a) => agenti[a.key].status !== 'riposo')
  if (attivi.length === 0) return null

  return (
    <div className="agenti-bar" aria-label="Agenti al lavoro">
      {attivi.map((a) => {
        const r = agenti[a.key]
        return (
          <div key={a.key} className="agenti-voce">
            <button
              type="button"
              className={`agente-chip stato-${r.status} ${nuvoletta === a.key ? 'agente-chip-aperto' : ''}`}
              onClick={() => apri(nuvoletta === a.key ? null : a.key)}
              aria-expanded={nuvoletta === a.key}
            >
              <span className="punto" style={{ background: a.colore }} />
              <span className="agente-nome">{a.nome}</span>
              <span className="agente-stato">{r.etichetta || TESTO_STATO[r.status]}</span>
            </button>
            {nuvoletta === a.key && (
              <div className="agenti-popover">
                <PassaggiRagionamento agentKey={a.key} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
