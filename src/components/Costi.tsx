import { useMemo, useState } from 'react'
import { nomeChi } from '../agents/agenti'
import { formattaDollari } from '../agents/costs'
import { costoDelMese, useStudio } from '../store'
import type { VoceUso } from '../types'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'
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

  const quota = budget !== null && budget > 0 ? Math.min(100, Math.round((mese / budget) * 100)) : null

  return (
    <section className="pannello imp-carta imp-costi">
      <div className="imp-testa pannello-testa">
        <span className="imp-testa-icona" aria-hidden>
          <Icona nome="grafico" dimensione={20} />
        </span>
        <div className="imp-testa-titoli">
          <div className="imp-testa-riga">
            <h2>Costi</h2>
            <Info>
              Sono cifre calcolate dai token che l'API indica in ogni risposta e dai prezzi pubblici: è una stima, non la
              fattura. Prima di ogni azione che costa di più l'app ti dice quanto e ti chiede l'ok.
            </Info>
          </div>
          <p className="imp-testa-sotto nota">
            in tutto {formattaDollari(totale)} · risparmiati {formattaDollari(risparmio)} grazie alla cache
          </p>
        </div>
      </div>

      <div className="imp-cifre">
        <div className="imp-cifra">
          <span className="imp-cifra-nome">Questo mese</span>
          <span className="imp-cifra-valore">{formattaDollari(mese)}</span>
          <span className="imp-cifra-sotto">{new Date().toLocaleDateString('it-IT', { month: 'long' })}</span>
        </div>
        <div className="imp-cifra">
          <span className="imp-cifra-nome">Limite al mese</span>
          <span className="imp-cifra-valore">{budget !== null ? formattaDollari(budget) : '—'}</span>
          <span className="imp-cifra-sotto">{budget !== null ? `usato il ${quota ?? 0}%` : 'nessun limite'}</span>
        </div>
        <div className="imp-cifra">
          <span className="imp-cifra-nome">Richieste</span>
          <span className="imp-cifra-valore">{usi.length}</span>
          <span className="imp-cifra-sotto">dall'inizio</span>
        </div>
      </div>

      {quota !== null && (
        <div className={`imp-barra ${quota >= 90 ? 'imp-barra-alta' : quota >= 70 ? 'imp-barra-media' : ''}`}>
          <div
            className="imp-barra-binario"
            role="progressbar"
            aria-label="Spesa del mese rispetto al limite"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={quota}
          >
            <span style={{ width: `${quota}%` }} />
          </div>
        </div>
      )}
      {budget !== null && (
        <p className="nota">
          Questo mese: {formattaDollari(mese)} su {formattaDollari(budget)} ({quota ?? 0}%). Arrivato al limite, non parte più nessuna
          richiesta finché non lo alzi.
        </p>
      )}

      <form
        className="riga-editor budget imp-budget"
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
        <button type="submit" className="bottone bottone-primario">
          <Icona nome="spunta" dimensione={16} />
          Salva il limite
        </button>
      </form>

      {usi.length === 0 ? (
        <p className="nota imp-vuoto">Per ora non hai speso niente.</p>
      ) : (
        <>
          <div className="imp-tabelle">
            <Tabella titolo="Per mese" righe={perMese} />
            <Tabella titolo="Per collega" righe={perAgente} />
            <Tabella titolo="Per attività" righe={perAzione} />
          </div>
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
    </section>
  )
}
