import { useState } from 'react'
import { AGENTE } from '../agents/definitions'
import { useStudioStore } from '../store'
import type { LogKind } from '../types'

const ICONA: Record<LogKind, string> = {
  ok: '✓',
  avviso: '⚠',
  riparazione: '⟳',
  fallimento: '✕',
  info: '·',
}

const DESCRIZIONE: Record<LogKind, string> = {
  ok: 'esito positivo',
  avviso: 'avviso',
  riparazione: 'riparazione in corso',
  fallimento: 'fallimento',
  info: 'informazione',
}

function orario(at: number): string {
  const d = new Date(at)
  return `${d.toLocaleTimeString('it-IT', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

/** Console di diagnostica del Controllore: chiusa di default, con i contatori. */
export function Console() {
  const log = useStudioStore((s) => s.log)
  const aperta = useStudioStore((s) => s.consoleAperta)
  const setAperta = useStudioStore((s) => s.setConsoleAperta)
  const svuota = useStudioStore((s) => s.svuotaLog)
  const nonVisti = useStudioStore((s) => s.logNonVisti)
  const erroriNonVisti = useStudioStore((s) => s.erroriNonVisti)
  const sblocca = useStudioStore((s) => s.sbloccaInterfaccia)
  const [copiato, setCopiato] = useState(false)

  const errori = log.filter((l) => l.kind === 'fallimento').length

  const copia = async () => {
    const testo = log
      .map(
        (l) =>
          `[${orario(l.at)}] ${l.kind.toUpperCase()}${l.agente ? ` (${l.agente})` : ''} ${l.messaggio}`,
      )
      .join('\n')
    try {
      await navigator.clipboard?.writeText(testo)
      setCopiato(true)
      window.setTimeout(() => setCopiato(false), 2000)
    } catch {
      // Copia non disponibile.
    }
  }

  return (
    <section className="pannello console">
      <button
        type="button"
        className="console-interruttore"
        onClick={() => setAperta(!aperta)}
        aria-expanded={aperta}
      >
        <span className="console-freccia" aria-hidden>
          {aperta ? '▾' : '▸'}
        </span>
        <span className="console-titolo">Console del Controllore</span>
        <span className="console-contatori">
          <span className="conteggio">{log.length} eventi</span>
          {errori > 0 && <span className="conteggio conteggio-errore">{errori} errori</span>}
          {!aperta && nonVisti > 0 && (
            <span className="conteggio conteggio-nuovo">
              {nonVisti} nuovi{erroriNonVisti > 0 ? ` · ${erroriNonVisti} ✕` : ''}
            </span>
          )}
        </span>
      </button>

      {aperta && (
        <>
          <div className="azioni azioni-console">
            <button type="button" className="bottone bottone-minuscolo" onClick={() => void copia()}>
              {copiato ? 'Copiato ✓' : 'Copia log'}
            </button>
            <button type="button" className="bottone bottone-minuscolo" onClick={svuota}>
              Svuota
            </button>
            <button type="button" className="bottone bottone-minuscolo" onClick={sblocca}>
              Sblocca l'interfaccia
            </button>
          </div>

          <ol className="elenco-log" aria-live="polite">
            {log.length === 0 && <li className="nota">Nessun evento registrato.</li>}
            {log.map((voce) => (
              <li key={voce.id} className={`log log-${voce.kind}`}>
                <span className="log-icona" title={DESCRIZIONE[voce.kind]} aria-label={DESCRIZIONE[voce.kind]}>
                  {ICONA[voce.kind]}
                </span>
                <span className="log-ora">{orario(voce.at)}</span>
                {voce.agente && (
                  <span className="log-agente" style={{ color: AGENTE[voce.agente].colore }}>
                    {AGENTE[voce.agente].nome}
                  </span>
                )}
                <span className="log-messaggio">{voce.messaggio}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
