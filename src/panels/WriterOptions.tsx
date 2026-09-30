import { useState } from 'react'
import { rigeneraOpzione } from '../agents/pipeline'
import { useStudioStore } from '../store'
import type { Opzione } from '../types'
import { ChapterView, RiepilogoCitazioni } from './ChapterView'
import { testoPerCopia } from './citazioniUi'

export function Valutazione({ opzione }: { opzione: Opzione }) {
  const v = opzione.valutazione
  if (!v) return null
  return (
    <div className={`allerta ${v.criticita.length === 0 ? 'allerta-ok' : 'allerta-avviso'}`}>
      <strong>Controllore.</strong>
      {v.punti_di_forza.length > 0 && (
        <>
          <p className="valutazione-titolo">Punti di forza</p>
          <ul className="elenco-semplice">
            {v.punti_di_forza.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {v.criticita.length > 0 && (
        <>
          <p className="valutazione-titolo">Criticità</p>
          <ul className="elenco-semplice">
            {v.criticita.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function WriterOptions() {
  const opzioni = useStudioStore((s) => s.opzioni)
  const attiva = useStudioStore((s) => s.opzioneAttiva)
  const setAttiva = useStudioStore((s) => s.setOpzioneAttiva)
  const apriLettura = useStudioStore((s) => s.apriLettura)
  const prefisso = useStudioStore((s) => s.prefissoScrittore)
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)
  const [copiata, setCopiata] = useState<string | null>(null)

  if (opzioni.length === 0) return null
  const corrente = opzioni.find((o) => o.impianto === attiva) ?? opzioni[0]
  const rifinituraInCorso = opzioni.some((o) => o.rifinisce !== null)

  const copia = async (o: Opzione) => {
    try {
      await navigator.clipboard?.writeText(testoPerCopia(o, prefisso?.riferimenti ?? []))
      setCopiata(o.impianto)
      window.setTimeout(() => setCopiata(null), 2000)
    } catch {
      // Copia non disponibile: il testo resta comunque selezionabile a mano.
    }
  }

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">Le tre opzioni dello Scrittore</h2>

      <div className="schede" role="tablist">
        {opzioni.map((o) => (
          <button
            key={o.impianto}
            type="button"
            role="tab"
            aria-selected={o.impianto === corrente.impianto}
            className={`scheda ${o.impianto === corrente.impianto ? 'scheda-attiva' : ''} ${
              o.stato === 'errore' ? 'scheda-guasta' : ''
            }`}
            onClick={() => setAttiva(o.impianto)}
          >
            Opzione {o.impianto}
            {o.stato === 'in_corso' ? ' …' : o.stato === 'errore' ? ' ⚠' : o.valutazione && o.valutazione.criticita.length === 0 ? ' ✓' : ''}
          </button>
        ))}
      </div>

      <p className="impianto">{corrente.etichetta}</p>

      {corrente.stato === 'in_corso' && <p className="nota in-corso">In scrittura…</p>}

      {corrente.stato === 'errore' && (
        <>
          <p className="allerta allerta-errore" role="alert">
            {corrente.errore}
          </p>
          <div className="azioni">
            <button
              type="button"
              className="bottone bottone-primario bottone-piccolo"
              onClick={() => void rigeneraOpzione(corrente.impianto)}
              disabled={inEsecuzione}
            >
              Rigenera questa opzione
            </button>
          </div>
        </>
      )}

      <Valutazione opzione={corrente} />

      {corrente.risultato && (
        <>
          <div className="azioni">
            <button
              type="button"
              className="bottone bottone-primario bottone-piccolo"
              onClick={() => apriLettura(corrente.impianto)}
            >
              Leggi su carta
            </button>
            <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={() => void copia(corrente)}>
              {copiata === corrente.impianto ? 'Copiato ✓' : 'Copia'}
            </button>
            <button
              type="button"
              className="bottone bottone-vuoto bottone-piccolo"
              onClick={() => void rigeneraOpzione(corrente.impianto)}
              disabled={inEsecuzione || rifinituraInCorso}
            >
              Rigenera
            </button>
            <span className="contatore">{corrente.parole} parole</span>
            <RiepilogoCitazioni opzione={corrente} />
          </div>

          <ChapterView opzione={corrente} />

          {corrente.passaggi.length > 0 && (
            <details className="dettagli">
              <summary>Come ha lavorato lo Scrittore</summary>
              <ol className="passaggi">
                {corrente.passaggi.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  )
}
