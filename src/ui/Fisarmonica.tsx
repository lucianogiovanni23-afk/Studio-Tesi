import { useState, type ReactNode } from 'react'
import { Icona } from './Icona'

/** Riquadro che si apre e si chiude: titolo sempre visibile, contenuto a richiesta. */
export function Fisarmonica({
  titolo,
  icona,
  riassunto,
  aperta: iniziale = false,
  children,
  azioni,
}: {
  titolo: ReactNode
  icona?: string
  /** Una riga che si vede anche da chiusa (es. "3 file · pronte"). */
  riassunto?: ReactNode
  aperta?: boolean
  children: ReactNode
  /** Pulsanti a destra del titolo, sempre visibili. */
  azioni?: ReactNode
}) {
  const [aperta, setAperta] = useState(iniziale)
  return (
    <section className={`fisarmonica pannello ${aperta ? 'fisarmonica-aperta' : ''}`}>
      <div className="fisarmonica-testa">
        <button type="button" className="fisarmonica-interruttore" aria-expanded={aperta} onClick={() => setAperta((a) => !a)}>
          {icona && (
            <span className="fisarmonica-icona">
              <Icona nome={icona} dimensione={20} />
            </span>
          )}
          <span className="fisarmonica-titoli">
            <span className="fisarmonica-titolo">{titolo}</span>
            {riassunto && <span className="fisarmonica-riassunto">{riassunto}</span>}
          </span>
          <Icona nome="giu" className="fisarmonica-freccia" />
        </button>
        {azioni && <div className="fisarmonica-azioni">{azioni}</div>}
      </div>
      {aperta && <div className="fisarmonica-corpo">{children}</div>}
    </section>
  )
}
