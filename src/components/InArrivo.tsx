import type { ReactNode } from 'react'

/** Schermata prevista in una fase successiva: spiega cosa arriverà. */
export function InArrivo({ titolo, fase, children }: { titolo: string; fase: number; children: ReactNode }) {
  return (
    <section className="pannello in-arrivo">
      <h2>{titolo}</h2>
      <p className="distintivo">in arrivo con la fase {fase}</p>
      <div className="in-arrivo-testo">{children}</div>
    </section>
  )
}
