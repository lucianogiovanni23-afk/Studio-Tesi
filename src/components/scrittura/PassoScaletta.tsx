import { useState } from 'react'
import { formattaDollari } from '../../agents/costs'
import { proponiScaletta, stimaComando, useScrittore } from '../../agents/scrittore'
import { useStudio } from '../../store'
import type { Capitolo, Sezione } from '../../types'
import { Conferma } from '../Conferma'

/** Passo 2: la scaletta della sezione, proposta dallo Scrittore o scritta a mano, va approvata. */
export function PassoScaletta({ cap, sez }: { cap: Capitolo; sez: Sezione }) {
  const setScaletta = useStudio((s) => s.setScaletta)
  const approva = useStudio((s) => s.approvaScaletta)
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const inCorso = useScrittore((s) => s.inCorso)
  const lacune = useScrittore((s) => s.lacune[sez.id])
  const [errore, setErrore] = useState<string | null>(null)

  if (!sez.fontiConfermate) {
    return (
      <section className="passo-scrittura passo-bloccato">
        <h3>
          <span className="passo-numero">2</span> Scaletta della sezione
        </h3>
        <p className="nota">Prima approva le fonti della sezione.</p>
      </section>
    )
  }

  if (sez.scalettaApprovata) {
    return (
      <section className="passo-scrittura passo-fatto">
        <div className="passo-testa">
          <h3>
            <span className="passo-numero">2</span> Scaletta approvata
          </h3>
          <button type="button" className="bottone bottone-piccolo bottone-vuoto" onClick={() => approva(cap.id, sez.id, false)}>
            Modifica
          </button>
        </div>
        <ol className="scaletta-approvata">
          {sez.scaletta.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </section>
    )
  }

  const occupato = inCorso !== null
  const stima = haChiave ? stimaComando(cap, sez, 'scaletta') : null
  const punti = sez.scaletta
  const cambia = (i: number, v: string) => setScaletta(cap.id, sez.id, punti.map((x, j) => (j === i ? v : x)))
  const sposta = (i: number, d: -1 | 1) => {
    const copia = [...punti]
    ;[copia[i], copia[i + d]] = [copia[i + d], copia[i]]
    setScaletta(cap.id, sez.id, copia)
  }

  return (
    <section className="passo-scrittura passo-attivo">
      <h3>
        <span className="passo-numero">2</span> Scaletta della sezione
      </h3>
      <p className="nota">I punti in ordine, con i riferimenti da usare. Correggila come vuoi, poi approvala: la bozza la seguirà.</p>
      {inCorso?.comando === 'scaletta' && inCorso.sezioneId === sez.id && <p className="in-corso">Lo Scrittore prepara la scaletta…</p>}
      {punti.length > 0 && (
        <ol className="scaletta-editor">
          {punti.map((p, i) => (
            <li key={i} className="riga-editor">
              <textarea className="campo" rows={2} value={p} onChange={(e) => cambia(i, e.target.value)} aria-label={`Punto ${i + 1} della scaletta`} />
              <button type="button" className="icona" onClick={() => sposta(i, -1)} disabled={i === 0} aria-label="Sposta su">
                ↑
              </button>
              <button type="button" className="icona" onClick={() => sposta(i, 1)} disabled={i === punti.length - 1} aria-label="Sposta giù">
                ↓
              </button>
              <button type="button" className="icona" onClick={() => setScaletta(cap.id, sez.id, punti.filter((_, j) => j !== i))} aria-label="Togli il punto">
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      {lacune && lacune.length > 0 && (
        <div className="allerta">
          <strong>Che cosa manca nelle fonti, secondo lo Scrittore:</strong>
          <ul className="elenco-semplice">
            {lacune.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {errore && <p className="allerta allerta-errore">{errore}</p>}
      <div className="riga-editor">
        <Conferma
          classe="bottone"
          etichetta={punti.length ? 'Proponi un\'altra scaletta' : 'Proponi una scaletta'}
          domanda={
            stima
              ? `Costo stimato ${formattaDollari(stima.minimo)} – ${formattaDollari(stima.massimo)}${stima.cache ? ' (materiale già in cache)' : ''}. Procedo?`
              : 'Procedo?'
          }
          conferma="Proponi"
          disabilitato={!haChiave || occupato}
          onConferma={async () => {
            setErrore(null)
            try {
              await proponiScaletta(cap.id, sez.id)
            } catch (err) {
              setErrore(err instanceof Error ? err.message : 'Errore.')
            }
          }}
        />
        <button type="button" className="bottone bottone-vuoto" onClick={() => setScaletta(cap.id, sez.id, [...punti, ''])}>
          Aggiungi un punto
        </button>
        {punti.filter((p) => p.trim()).length > 0 && (
          <Conferma
            classe="bottone bottone-primario"
            etichetta="Approvo la scaletta"
            domanda="Confermi la scaletta così com'è?"
            conferma="Sì, approvo"
            onConferma={() => {
              setScaletta(cap.id, sez.id, punti.filter((p) => p.trim()))
              approva(cap.id, sez.id, true)
            }}
          />
        )}
      </div>
    </section>
  )
}
