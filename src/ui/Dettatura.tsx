import '../styles/dettatura.css'
import { useDettatura, type StatoVoce } from './dettaturaVoce'

/**
 * Dettatura a voce con la Web Speech API del browser (gratis, niente server
 * nostro): italiano, ascolto continuo, testo provvisorio mentre parli. Il
 * bottone non compare se il browser non la supporta (per esempio Firefox).
 *
 * Uso semplice (campo della chat):
 *   <Dettatura onTesto={(t) => setBozza((b) => aggiungiDettato(b, t))} />
 * Uso diviso (Scrittura): useDettatura (in dettaturaVoce.ts) + BottoneDettatura + StatoDettatura.
 */

/** Il bottone col microfono; mentre ascolta ha il pallino rosso che pulsa. */
export function BottoneDettatura({ voce, classe = '', conTesto = false }: { voce: StatoVoce; classe?: string; conTesto?: boolean }) {
  if (!voce.supportata) return null
  const etichetta = voce.attiva ? 'Ferma la dettatura' : 'Detta a voce'
  return (
    <button
      type="button"
      className={`dettatura-bottone ${voce.attiva ? 'dettatura-attiva' : ''} ${classe}`}
      onClick={voce.alterna}
      aria-pressed={voce.attiva}
      aria-label={etichetta}
      title={voce.attiva ? 'Ti ascolto: tocca per fermare' : 'Detta a voce (in italiano)'}
    >
      <svg className="dettatura-icona" viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
      </svg>
      {voce.attiva && <span className="dettatura-pallino" aria-hidden />}
      {conTesto && <span className="dettatura-bottone-testo">{voce.attiva ? 'Ferma' : 'Detta'}</span>}
    </button>
  )
}

/** Riga sotto il bottone: "Ti ascolto…", il testo provvisorio o il problema col permesso. */
export function StatoDettatura({ voce, classe = '' }: { voce: StatoVoce; classe?: string }) {
  if (!voce.supportata || (!voce.attiva && !voce.problema)) return null
  if (voce.problema) {
    return (
      <p className={`dettatura-stato dettatura-problema ${classe}`} role="alert">
        {voce.problema}
      </p>
    )
  }
  return (
    <p className={`dettatura-stato ${classe}`} role="status" aria-live="polite">
      <span className="dettatura-pallino dettatura-pallino-fermo" aria-hidden />
      {voce.provvisorio ? (
        <span className="dettatura-provvisorio">{voce.provvisorio}…</span>
      ) : (
        <span>
          Ti ascolto, parla pure. Per la punteggiatura di' «virgola», «punto», «a capo». La prima volta il browser ti chiede il
          permesso del microfono.
        </span>
      )}
    </p>
  )
}

/** Tutto insieme, per un campo di testo semplice come quello della chat. */
export function Dettatura({ onTesto, classe = '' }: { onTesto: (testo: string) => void; classe?: string }) {
  const voce = useDettatura(onTesto)
  if (!voce.supportata) return null
  return (
    <span className={`dettatura ${classe}`}>
      <BottoneDettatura voce={voce} />
      <StatoDettatura voce={voce} classe="dettatura-stato-flottante" />
    </span>
  )
}
