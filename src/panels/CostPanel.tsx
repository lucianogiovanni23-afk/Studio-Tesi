import { useMemo } from 'react'
import { LISTINO, formattaDollari, stimaEsecuzione } from '../agents/costs'
import { AGENTE } from '../agents/definitions'
import { costoTotale, useStudioStore } from '../store'
import type { VoceUso } from '../types'
import { useCaratteriCorpus } from './useCorpus'

interface Riga {
  chi: string
  chiamate: number
  input: number
  output: number
  letturaCache: number
  scritturaCache: number
  ricerche: number
  letture: number
  costo: number
  risparmio: number
}

function migliaia(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)
}

function aggrega(usi: VoceUso[]): Riga[] {
  const perChi = new Map<string, Riga>()
  for (const u of usi) {
    const r =
      perChi.get(u.chi) ??
      { chi: u.chi, chiamate: 0, input: 0, output: 0, letturaCache: 0, scritturaCache: 0, ricerche: 0, letture: 0, costo: 0, risparmio: 0 }
    const prezzi = LISTINO[u.modello] ?? LISTINO['claude-sonnet-5']
    r.chiamate += 1
    r.input += u.input
    r.output += u.output
    r.letturaCache += u.letturaCache
    r.scritturaCache += u.scritturaCache
    r.ricerche += u.ricerche
    r.letture += u.letture
    r.costo += u.costo
    // Quanto sarebbe costato leggere quei token senza cache.
    r.risparmio += (u.letturaCache * (prezzi.input - prezzi.letturaCache)) / 1_000_000
    perChi.set(u.chi, r)
  }
  const ordine = ['lettore', 'ricercatore', 'selettore', 'scrittore', 'controllore', 'chat']
  return [...perChi.values()].sort((a, b) => ordine.indexOf(a.chi) - ordine.indexOf(b.chi))
}

function nome(chi: string): string {
  return chi === 'chat' ? 'Chat' : (AGENTE[chi as keyof typeof AGENTE]?.nome ?? chi)
}

/** Stima prima dell'avvio e consuntivo reale dai campi usage di ogni risposta. */
export function CostPanel() {
  const usi = useStudioStore((s) => s.usi)
  const esecuzione = useStudioStore((s) => s.esecuzione)
  const modelli = useStudioStore((s) => s.modelli)
  const profondita = useStudioStore((s) => s.profondita)
  const azzera = useStudioStore((s) => s.azzeraUsi)
  const caratteriCorso = useCaratteriCorpus()

  const stima = useMemo(
    () => stimaEsecuzione({ modelli, caratteriCorso, profondita }),
    [modelli, caratteriCorso, profondita],
  )
  const ultima = useMemo(() => usi.filter((u) => u.esecuzione === esecuzione), [usi, esecuzione])
  const righe = useMemo(() => aggrega(ultima), [ultima])
  const totaleUltima = costoTotale(usi, esecuzione)
  const totale = costoTotale(usi)
  const risparmio = righe.reduce((s, r) => s + r.risparmio, 0)

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">Costi</h2>

      <div className="riquadri-costo">
        <div className="riquadro-costo">
          <span className="riquadro-etichetta">Stima di un'esecuzione</span>
          <strong>
            {formattaDollari(stima.minimo)} – {formattaDollari(stima.massimo)}
          </strong>
          <span className="nota">profondità {profondita}</span>
        </div>
        <div className="riquadro-costo">
          <span className="riquadro-etichetta">Ultima esecuzione</span>
          <strong>{formattaDollari(totaleUltima)}</strong>
          {risparmio > 0 && <span className="nota">cache: risparmiati {formattaDollari(risparmio)}</span>}
        </div>
        <div className="riquadro-costo">
          <span className="riquadro-etichetta">Totale registrato</span>
          <strong>{formattaDollari(totale)}</strong>
          <span className="nota">{usi.length} chiamate</span>
        </div>
      </div>

      {righe.length > 0 ? (
        <div className="tabella-scorrevole">
          <table className="tabella-costi">
            <thead>
              <tr>
                <th>Chi</th>
                <th>Chiamate</th>
                <th>Input</th>
                <th>Output</th>
                <th>Cache letta</th>
                <th>Cache scritta</th>
                <th>Ricerche</th>
                <th>Pagine</th>
                <th>Costo</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.chi}>
                  <td>{nome(r.chi)}</td>
                  <td>{r.chiamate}</td>
                  <td>{migliaia(r.input)}</td>
                  <td>{migliaia(r.output)}</td>
                  <td>{migliaia(r.letturaCache)}</td>
                  <td>{migliaia(r.scritturaCache)}</td>
                  <td>{r.ricerche}</td>
                  <td>{r.letture}</td>
                  <td>{formattaDollari(r.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="nota">Nessuna chiamata nell'esecuzione corrente.</p>
      )}

      <details className="dettagli">
        <summary>Come è composta la stima</summary>
        <ul className="elenco-semplice">
          {stima.dettaglio.map((v) => (
            <li key={v.voce}>
              {v.voce}: {formattaDollari(v.costo)}
            </li>
          ))}
        </ul>
      </details>

      <p className="nota">
        Importi calcolati sui token riportati dall'API e sul listino pubblico: sono una stima, non la
        fattura. Lo Scrittore riusa il materiale dalla cache fra scaletta, opzioni e rifiniture; il
        Selettore usa il modello più economico.
      </p>

      {usi.length > 0 && (
        <div className="azioni">
          <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={azzera}>
            Azzera il registro dei costi
          </button>
        </div>
      )}
    </section>
  )
}
