import { ETICHETTA_TEMA } from '../domain/dominio'
import type { TemaFonte } from '../types'

const TEMI = Object.keys(ETICHETTA_TEMA) as TemaFonte[]

/** Tag per tema, attivabili con un tocco. */
export function TemiChips({ temi, onCambia, sola = false }: { temi: TemaFonte[]; onCambia?: (t: TemaFonte[]) => void; sola?: boolean }) {
  const elenco = sola ? temi : TEMI
  return (
    <span className="temi" role={sola ? undefined : 'group'} aria-label="Temi">
      {elenco.map((t) =>
        sola || !onCambia ? (
          <span key={t} className={`tema tema-${t}`}>
            {ETICHETTA_TEMA[t]}
          </span>
        ) : (
          <button
            key={t}
            type="button"
            className={`tema tema-${t} ${temi.includes(t) ? 'tema-attivo' : 'tema-spento'}`}
            aria-pressed={temi.includes(t)}
            onClick={() => onCambia(temi.includes(t) ? temi.filter((x) => x !== t) : [...temi, t])}
          >
            {ETICHETTA_TEMA[t]}
          </button>
        ),
      )}
    </span>
  )
}
