import { AGENTI } from '../agents/agenti'
import { useStudio } from '../store'
import { PassaggiRagionamento } from './PassaggiRagionamento'

const TESTO_STATO = {
  riposo: 'a riposo',
  lavoro: 'al lavoro',
  attesa: 'aspetta te',
  fatto: 'ha finito',
  errore: 'errore',
}

/** Stato dei quattro agenti, visibile in ogni schermata; tocca per il ragionamento. */
export function AgentiBar() {
  const agenti = useStudio((s) => s.agenti)
  const nuvoletta = useStudio((s) => s.nuvoletta)
  const apri = useStudio((s) => s.apriNuvoletta)

  return (
    <div className="agenti-bar">
      {AGENTI.map((a) => {
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
