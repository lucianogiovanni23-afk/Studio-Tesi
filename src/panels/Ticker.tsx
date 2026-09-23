import { useMemo } from 'react'
import { NOME_SOCIETA } from '../agents/definitions'
import { useStudioStore } from '../store'

/**
 * Banda che scorre in cima alla pagina, alimentata dagli eventi reali dell'app:
 * nessuna quotazione di borsa inventata.
 */
export function Ticker() {
  const voci = useStudioStore((s) => s.ticker)
  const errori = useStudioStore((s) => s.log.filter((l) => l.kind === 'fallimento').length)
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)

  const testo = useMemo(() => {
    const parti = voci.slice(-12).map((v) => `${v.segno} ${v.testo}`)
    parti.push(`● CONTROLLORE ${errori === 0 ? '0 ERRORI' : `${errori} ERRORI`}`)
    if (parti.length < 4) {
      parti.unshift(`● ${NOME_SOCIETA.toUpperCase()} · SALA OPERATIVA`)
      parti.push('● IN ATTESA DI ISTRUZIONI')
    }
    return parti.join('   ·   ')
  }, [voci, errori])

  return (
    <div className="banda-ticker" role="status" aria-live="off">
      {/* Il testo è duplicato per ottenere uno scorrimento continuo. */}
      <div className={`banda-scorrimento ${inEsecuzione ? 'banda-veloce' : ''}`}>
        <span>{testo}</span>
        <span aria-hidden>{testo}</span>
      </div>
    </div>
  )
}
