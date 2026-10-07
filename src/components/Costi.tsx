import { useMemo, useState } from 'react'
import { nomeChi } from '../agents/agenti'
import { formattaDollari } from '../agents/costs'
import { costoDelMese, useStudio } from '../store'
import type { VoceUso } from '../types'
import { Conferma } from './Conferma'

interface Riga {
  chiave: string
  chiamate: number
  input: number
  output: number
  cache: number
  costo: number
  risparmio: number
}

function migliaia(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)
}

function raggruppa(usi: VoceUso[], chiave: (u: VoceUso) => string): Riga[] {
  const mappa = new Map<string, Riga>()
  for (const u of usi) {
    const k = chiave(u)
    const r = mappa.get(k) ?? { chiave: k, chiamate: 0, input: 0, output: 0, cache: 0, costo: 0, risparmio: 0 }
    r.chiamate += 1
    r.input += u.input
    r.output += u.output
    r.cache += u.letturaCache
    r.costo += u.costo
    r.risparmio += u.risparmio
    mappa.set(k, r)
  }
  return [...mappa.values()]
}

function Tabella({ titolo, righe }: { titolo: string; righe: Riga[] }) {
  return (
    <div className="tabella-scorrevole">
      <table className="tabella">
        <caption>{titolo}</caption>
        <thead>
          <tr>
            <th scope="col">Voce</th>
            <th scope="col">Richieste</th>
            <th scope="col">Token inviati</th>
            <th scope="col">Token ricevuti</th>
            <th scope="col">Token riusati</th>
            <th scope="col">Costo</th>
            <th scope="col">Risparmiato</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.chiave}>
              <th scope="row">{r.chiave}</th>
              <td>{r.chiamate}</td>
              <td>{migliaia(r.input)}</td>
              <td>{migliaia(r.output)}</td>
              <td>{migliaia(r.cache)}</td>
              <td>{formattaDollari(r.costo)}</td>
              <td>{formattaDollari(r.risparmio)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Consuntivo reale dai campi usage: per agente, per azione, per mese. */
export function Costi() {
  const usi = useStudio((s) => s.progetto.usi)
  const azzera = useStudio((s) => s.azzeraUsi)
  const budget = useStudio((s) => s.progetto.budgetMensile)
  const setBudget = useStudio((s) => s.setBudget)
  const [bozzaBudget, setBozzaBudget] = useState(budget === null ? '' : String(budget))
  const mese = useMemo(() => costoDelMese(usi), [usi])

  const perAgente = useMemo(() => raggruppa(usi, (u) => nomeChi(u.chi)), [usi])
  const perAzione = useMemo(() => raggruppa(usi, (u) => u.azione || 'altro'), [usi])
  const perMese = useMemo(
    () =>
      raggruppa(usi, (u) => u.data.slice(0, 7)).sort((a, b) => b.chiave.localeCompare(a.chiave)).map((r) => ({
        ...r,
        chiave: new Date(`${r.chiave}-01T12:00:00`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
      })),
    [usi],
  )
  const totale = usi.reduce((s, u) => s + u.costo, 0)
  const risparmio = usi.reduce((s, u) => s + u.risparmio, 0)

  return (
    <section className="pannello">
      <div className="pannello-testa">
        <h2>Costi</h2>
        <span className="nota">
          in tutto {formattaDollari(totale)} · risparmiati {formattaDollari(risparmio)} grazie alla cache
        </span>
      </div>
      <form
        className="riga-editor budget"
        onSubmit={(e) => {
          e.preventDefault()
          const n = Number(bozzaBudget.replace(',', '.'))
          setBudget(bozzaBudget.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n)
        }}
      >
        <label className="campo-blocco">
          <span className="etichetta">Quanto vuoi spendere al mese, in dollari (vuoto = nessun limite)</span>
          <input className="campo" inputMode="decimal" value={bozzaBudget} onChange={(e) => setBozzaBudget(e.target.value)} placeholder="es. 15" />
        </label>
        <button type="submit" className="bottone">
          Salva il limite
        </button>
      </form>
      <p className="nota">
        Questo mese: {formattaDollari(mese)}
        {budget !== null && ` su ${formattaDollari(budget)} (${Math.min(100, Math.round((mese / budget) * 100))}%). Arrivato al limite, non parte più nessuna richiesta finché non lo alzi.`}
      </p>
      {usi.length === 0 ? (
        <p className="nota">Per ora non hai speso niente.</p>
      ) : (
        <>
          <Tabella titolo="Per mese" righe={perMese} />
          <Tabella titolo="Per collega" righe={perAgente} />
          <Tabella titolo="Per attività" righe={perAzione} />
          <Conferma
            classe="bottone bottone-vuoto bottone-piccolo"
            etichetta="Azzera i costi"
            domanda="Vuoi cancellare tutta la lista dei costi?"
            conferma="Azzera"
            pericolosa
            onConferma={azzera}
          />
        </>
      )}
      <p className="nota">
        Sono cifre calcolate dai token che l'API indica in ogni risposta e dai prezzi pubblici: è una stima, non la
        fattura. Prima di ogni azione che costa di più l'app ti dice quanto e ti chiede l'ok.
      </p>
    </section>
  )
}
