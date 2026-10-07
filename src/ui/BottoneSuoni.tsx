import { useSyncExternalStore } from 'react'
import { Icona } from './Icona'
import { impostaSuoni, suonoRisposta, suoniAccesi } from './suoni'

const iscriviti = (fai: () => void) => {
  window.addEventListener('studio-tesi-suoni', fai)
  return () => window.removeEventListener('studio-tesi-suoni', fai)
}

/** Accende e spegne i suoni leggeri, dalla testata. */
export function BottoneSuoni() {
  const acceso = useSyncExternalStore(iscriviti, suoniAccesi, () => false)
  return (
    <button
      type="button"
      className="bottone-testata"
      aria-label={acceso ? 'Spegni i suoni' : 'Accendi i suoni'}
      aria-pressed={acceso}
      title={acceso ? 'Suoni accesi' : 'Suoni spenti'}
      onClick={() => {
        impostaSuoni(!acceso)
        if (!acceso) suonoRisposta()
      }}
    >
      <Icona nome={acceso ? 'suono' : 'muto'} dimensione={19} />
    </button>
  )
}
