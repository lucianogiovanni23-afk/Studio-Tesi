import { useId, useState, type ReactNode } from 'react'
import { Icona } from './Icona'

/**
 * Una "i" accanto a un titolo: la spiegazione lunga si legge passandoci sopra
 * col mouse o toccandola, così la pagina resta pulita.
 */
export function Info({ children, etichetta = 'Spiegazione' }: { children: ReactNode; etichetta?: string }) {
  const [aperta, setAperta] = useState(false)
  const id = useId()
  return (
    <span className="info" onMouseEnter={() => setAperta(true)} onMouseLeave={() => setAperta(false)}>
      <button
        type="button"
        className="info-bottone"
        aria-label={etichetta}
        aria-expanded={aperta}
        aria-describedby={aperta ? id : undefined}
        // apre e basta: col mouse la spiegazione è già aperta al passaggio e il clic la richiudeva
        onClick={() => setAperta(true)}
        onBlur={() => setAperta(false)}
      >
        <Icona nome="info" dimensione={16} />
      </button>
      {aperta && (
        <span role="tooltip" id={id} className="info-fumetto">
          {children}
        </span>
      )}
    </span>
  )
}
