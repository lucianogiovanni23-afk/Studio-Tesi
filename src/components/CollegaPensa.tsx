import '../styles/pensa.css'
import { useEffect, useState } from 'react'
import { AGENTE } from '../agents/agenti'
import { usePonte } from '../agents/ponte'
import type { AgentKey } from '../types'
import { FRASI_PENSA } from './pensaFrasi'
import { Ritratto } from './Ritratto'

/**
 * Il ritratto del collega che "pensa": respiro leggero, alone nel suo colore,
 * nuvoletta con i puntini e una riga che dice cosa sta facendo. Con
 * prefers-reduced-motion resta tutto fermo (le frasi non girano).
 */
export function CollegaPensa({
  k,
  frase,
  dettaglio,
  dimensione = 56,
}: {
  k: AgentKey
  /** Frase al posto di quelle predefinite. */
  frase?: string
  /** Seconda riga, più piccola (per esempio "aspetto la risposta da Claude.ai"). */
  dettaglio?: string
  dimensione?: number
}) {
  const frasi = FRASI_PENSA[k]
  const [i, setI] = useState(0)
  useEffect(() => {
    if (frase) return
    const fermo = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (fermo) return
    const t = window.setInterval(() => setI((x) => (x + 1) % frasi.length), 3200)
    return () => window.clearInterval(t)
  }, [frase, frasi.length])
  const def = AGENTE[k]
  const testo = frase ?? frasi[i]
  return (
    <div className="pensa" role="status" aria-live="polite" style={{ ['--colore-agente' as string]: def.colore }}>
      <span className="pensa-volto" style={{ width: dimensione, height: dimensione }}>
        <span className="pensa-alone" aria-hidden />
        <span className="pensa-respiro">
          <Ritratto k={k} dimensione={dimensione} />
        </span>
        <span className="pensa-nuvola" aria-hidden>
          <i className="pensa-bolla pensa-bolla-1" />
          <i className="pensa-bolla pensa-bolla-2" />
          <span className="pensa-fumetto">
            <i />
            <i />
            <i />
          </span>
        </span>
      </span>
      <span className="pensa-testi">
        <span className="pensa-chi">{def.persona.nome}</span>
        <span className="pensa-frase" key={testo}>
          {testo}
        </span>
        {dettaglio && <span className="pensa-dettaglio">{dettaglio}</span>}
      </span>
    </div>
  )
}

/** Come sopra, e se si lavora gratis dice che aspetta la risposta da Claude.ai. */
export function CollegaAlLavoro({ k, frase }: { k: AgentKey; frase?: string }) {
  const suClaudeAi = usePonte((s) => s.coda.length > 0)
  return <CollegaPensa k={k} frase={frase} dettaglio={suClaudeAi ? 'Aspetto la risposta da Claude.ai: copia, incolla e torna qui.' : undefined} />
}
