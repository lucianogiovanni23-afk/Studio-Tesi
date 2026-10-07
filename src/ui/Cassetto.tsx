import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icona } from './Icona'

/**
 * Pannello che scorre da destra sopra la pagina (dettagli di una fonte,
 * strumenti della scrittura…). Si chiude con la X, con Esc o toccando fuori.
 */
export function Cassetto({
  aperto,
  onChiudi,
  titolo,
  children,
  larghezza = 520,
}: {
  aperto: boolean
  onChiudi: () => void
  titolo: ReactNode
  children: ReactNode
  larghezza?: number
}) {
  useEffect(() => {
    if (!aperto) return
    const tasto = (e: KeyboardEvent) => e.key === 'Escape' && onChiudi()
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [aperto, onChiudi])
  if (!aperto) return null
  return createPortal(
    <div className="cassetto-velo" onClick={onChiudi}>
      <aside
        className="cassetto"
        role="dialog"
        aria-modal="true"
        aria-label={typeof titolo === 'string' ? titolo : 'Dettagli'}
        style={{ ['--larghezza-cassetto' as string]: `${larghezza}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cassetto-testa">
          <h2>{titolo}</h2>
          <button type="button" className="bottone-icona" aria-label="Chiudi" onClick={onChiudi}>
            <Icona nome="chiudi" />
          </button>
        </header>
        <div className="cassetto-corpo">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}
