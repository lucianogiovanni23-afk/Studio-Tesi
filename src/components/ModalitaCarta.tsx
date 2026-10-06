import { useEffect } from 'react'
import { useStudio } from '../store'

/** Rilettura a tutto schermo, come su carta: un capitolo intero, senza distrazioni. */
export function ModalitaCarta() {
  const aperta = useStudio((s) => s.cartaAperta)
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const capId = useStudio((s) => s.capitoloAperto)
  const titoloTesi = useStudio((s) => s.progetto.titolo)
  const chiudi = useStudio((s) => s.setCarta)
  const apri = useStudio((s) => s.apriSezione)

  useEffect(() => {
    if (!aperta) return
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') chiudi(false)
    }
    window.addEventListener('keydown', suTasto)
    document.body.classList.add('senza-scroll')
    return () => {
      window.removeEventListener('keydown', suTasto)
      document.body.classList.remove('senza-scroll')
    }
  }, [aperta, chiudi])

  if (!aperta) return null
  const i = Math.max(0, capitoli.findIndex((c) => c.id === capId))
  const cap = capitoli[i]
  if (!cap) return null

  const vaiA = (j: number) => {
    const c = capitoli[j]
    if (c) apri(c.id, c.sezioni[0]?.id ?? null)
    chiudi(true)
    document.querySelector('.carta-scorrimento')?.scrollTo({ top: 0 })
  }

  return (
    <div className="carta" role="dialog" aria-modal="true" aria-label="Modalità carta">
      <div className="carta-barra">
        <button type="button" className="bottone" onClick={() => vaiA(i - 1)} disabled={i === 0}>
          ‹ Capitolo precedente
        </button>
        <span className="carta-titolo-tesi">{titoloTesi}</span>
        <button type="button" className="bottone" onClick={() => vaiA(i + 1)} disabled={i >= capitoli.length - 1}>
          Capitolo successivo ›
        </button>
        <button type="button" className="bottone bottone-primario" onClick={() => chiudi(false)}>
          Chiudi
        </button>
      </div>
      <div className="carta-scorrimento">
        <article className="carta-foglio" lang="it">
          <p className="carta-numero">Capitolo {i + 1}</p>
          <h1>{cap.titolo}</h1>
          {cap.sezioni.map((s, j) => (
            <section key={s.id}>
              <h2>
                {i + 1}.{j + 1} {s.titolo}
              </h2>
              {s.testo.trim() ? (
                s.testo
                  .split(/\n\s*\n/)
                  .filter((p) => p.trim())
                  .map((p, k) => <p key={k}>{p}</p>)
              ) : (
                <p className="carta-vuota">Sezione ancora da scrivere.</p>
              )}
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}
