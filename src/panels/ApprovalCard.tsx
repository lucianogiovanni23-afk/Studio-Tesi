import { useState } from 'react'
import { useStudioStore } from '../store'

/**
 * Punto di approvazione umana: la pipeline si ferma qui e lo Scrittore
 * non parte in nessun caso prima che io abbia approvato.
 */
export function ApprovalCard({ variant = 'inline' }: { variant?: 'inline' | 'docked' }) {
  const approvalStatus = useStudioStore((s) => s.approvalStatus)
  const approvalRound = useStudioStore((s) => s.approvalRound)
  const selectedSources = useStudioStore((s) => s.selectedSources)
  const discardedSources = useStudioStore((s) => s.discardedSources)
  const approvalHistory = useStudioStore((s) => s.approvalHistory)
  const approveSources = useStudioStore((s) => s.approveSources)
  const rejectSources = useStudioStore((s) => s.rejectSources)
  const [reason, setReason] = useState('')
  const [showDiscarded, setShowDiscarded] = useState(false)

  if (approvalStatus !== 'pending') return null

  return (
    <section className={`panel approval ${variant === 'docked' ? 'approval-docked' : ''}`}>
      <h2 className="panel-title">
        Serve la tua approvazione
        <span className="panel-badge panel-badge-hot">giro {approvalRound}</span>
      </h2>

      <p className="hint">
        Il Selettore ha scelto {selectedSources.length} fonti su{' '}
        {selectedSources.length + discardedSources.length}. Lo Scrittore parte solo dopo la tua
        approvazione.
      </p>

      <ul className="source-list">
        {selectedSources.map((source) => (
          <li key={source.url} className="source">
            <div className="source-head">
              <strong>{source.title}</strong>
              {source.verified ? (
                <span className="tag tag-ok">URL verificato</span>
              ) : (
                <span className="tag tag-warn">URL non confermato</span>
              )}
            </div>
            <a className="source-url" href={source.url} target="_blank" rel="noreferrer noopener">
              {source.url}
            </a>
            {source.summary && <p className="source-text">{source.summary}</p>}
            {source.relevance && <p className="source-text source-why">{source.relevance}</p>}
          </li>
        ))}
      </ul>

      {discardedSources.length > 0 && (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setShowDiscarded((v) => !v)}
          >
            {showDiscarded ? 'Nascondi' : 'Mostra'} le {discardedSources.length} fonti scartate
          </button>
          {showDiscarded && (
            <ul className="source-list source-list-muted">
              {discardedSources.map((source) => (
                <li key={source.url} className="source">
                  <strong>{source.title}</strong>
                  <a className="source-url" href={source.url} target="_blank" rel="noreferrer noopener">
                    {source.url}
                  </a>
                  {source.reason && <p className="source-text">Scartata perché: {source.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <label className="field">
        <span className="field-label">Motivo (facoltativo, se non ti convince)</span>
        <textarea
          className="textarea"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="es. servono più paper accademici e meno articoli divulgativi"
        />
      </label>

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary btn-start"
          onClick={() => {
            approveSources()
            setReason('')
          }}
        >
          Approvo
        </button>
        <button
          type="button"
          className="btn btn-danger btn-start"
          onClick={() => {
            rejectSources(reason)
            setReason('')
          }}
        >
          Non mi convince
        </button>
      </div>

      {approvalHistory.length > 0 && (
        <ul className="history">
          {approvalHistory.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
