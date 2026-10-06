import { useState, type ReactNode } from 'react'

/**
 * Conferma in linea, al posto di window.confirm: il primo tocco mostra la
 * domanda e i due bottoni accanto all'azione.
 */
export function Conferma({
  etichetta,
  domanda,
  conferma = 'Conferma',
  onConferma,
  pericolosa = false,
  disabilitato = false,
  classe = 'bottone',
}: {
  etichetta: ReactNode
  domanda: ReactNode
  conferma?: string
  onConferma: () => void
  pericolosa?: boolean
  disabilitato?: boolean
  classe?: string
}) {
  const [aperta, setAperta] = useState(false)
  if (!aperta) {
    return (
      <button type="button" className={classe} onClick={() => setAperta(true)} disabled={disabilitato}>
        {etichetta}
      </button>
    )
  }
  return (
    <span className="conferma-in-linea" role="group">
      <span className="conferma-domanda">{domanda}</span>
      <button
        type="button"
        className={`bottone ${pericolosa ? 'bottone-pericolo' : 'bottone-primario'}`}
        onClick={() => {
          setAperta(false)
          onConferma()
        }}
      >
        {conferma}
      </button>
      <button type="button" className="bottone bottone-vuoto" onClick={() => setAperta(false)}>
        Annulla
      </button>
    </span>
  )
}
