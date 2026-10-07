import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icona } from './Icona'

export interface VoceMenu {
  id: string
  etichetta: string
  icona?: string
  disabilitata?: boolean
  onClick: () => void
}

/** Un pulsante che apre un piccolo elenco di azioni. */
export function MenuTendina({ etichetta, voci, classe = 'bottone bottone-primario', icona }: { etichetta: ReactNode; voci: VoceMenu[]; classe?: string; icona?: string }) {
  const [aperto, setAperto] = useState(false)
  const radice = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: PointerEvent) => !radice.current?.contains(e.target as Node) && setAperto(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAperto(false)
    window.addEventListener('pointerdown', fuori)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', fuori)
      window.removeEventListener('keydown', esc)
    }
  }, [aperto])
  return (
    <div className="menu-tendina" ref={radice}>
      <button type="button" className={classe} aria-haspopup="menu" aria-expanded={aperto} onClick={() => setAperto((a) => !a)}>
        {icona && <Icona nome={icona} />}
        {etichetta} <Icona nome="giu" dimensione={16} />
      </button>
      {aperto && (
        <div className="menu-tendina-elenco" role="menu">
          {voci.map((v) => (
            <button
              key={v.id}
              type="button"
              role="menuitem"
              disabled={v.disabilitata}
              onClick={() => {
                setAperto(false)
                v.onClick()
              }}
            >
              {v.icona && <Icona nome={v.icona} />}
              {v.etichetta}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
