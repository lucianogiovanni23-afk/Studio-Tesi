import { AGENT_BY_KEY } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { LogKind } from '../types'

const ICON: Record<LogKind, string> = {
  ok: '✓',
  warn: '⚠',
  repair: '⟳',
  fail: '✕',
  info: 'ℹ',
}

const KIND_LABEL: Record<LogKind, string> = {
  ok: 'esito positivo',
  warn: 'avviso',
  repair: 'riparazione in corso',
  fail: 'fallimento',
  info: 'informazione',
}

function timestamp(at: number): string {
  const d = new Date(at)
  return `${d.toLocaleTimeString('it-IT', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

/** Console di diagnostica del Controllore: chiusa di default, con contatori sempre visibili. */
export function Console() {
  const logs = useStudioStore((s) => s.logs)
  const open = useStudioStore((s) => s.consoleOpen)
  const setConsoleOpen = useStudioStore((s) => s.setConsoleOpen)
  const clearLogs = useStudioStore((s) => s.clearLogs)
  const unseenLogs = useStudioStore((s) => s.unseenLogs)
  const unseenErrors = useStudioStore((s) => s.unseenErrors)
  const unlockUi = useStudioStore((s) => s.unlockUi)

  const totalErrors = logs.filter((l) => l.kind === 'fail').length

  return (
    <section className="panel console">
      <button
        type="button"
        className="console-toggle"
        onClick={() => setConsoleOpen(!open)}
        aria-expanded={open}
      >
        <span className="console-caret" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="console-title">Console del Controllore</span>
        <span className="console-counts">
          <span className="count">{logs.length} eventi</span>
          {totalErrors > 0 && <span className="count count-error">{totalErrors} errori</span>}
          {!open && unseenLogs > 0 && (
            <span className="count count-new">
              {unseenLogs} nuovi
              {unseenErrors > 0 ? ` · ${unseenErrors} ✕` : ''}
            </span>
          )}
        </span>
      </button>

      {open && (
        <>
          <div className="actions">
            <button type="button" className="btn btn-tiny" onClick={clearLogs}>
              Svuota la console
            </button>
            <button type="button" className="btn btn-tiny" onClick={unlockUi}>
              Sblocca l'interfaccia
            </button>
          </div>
          <ol className="log-list">
            {logs.length === 0 && <li className="hint">Nessun evento registrato.</li>}
            {logs.map((entry) => (
              <li key={entry.id} className={`log log-${entry.kind}`}>
                <span className="log-icon" title={KIND_LABEL[entry.kind]} aria-label={KIND_LABEL[entry.kind]}>
                  {ICON[entry.kind]}
                </span>
                <span className="log-time">{timestamp(entry.at)}</span>
                {entry.agent && (
                  <span className="log-agent" style={{ color: AGENT_BY_KEY[entry.agent].color }}>
                    {AGENT_BY_KEY[entry.agent].name}
                  </span>
                )}
                <span className="log-message">{entry.message}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
