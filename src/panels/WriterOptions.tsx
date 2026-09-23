import { useState } from 'react'
import { rigeneraOpzione } from '../agents/pipeline'
import { useStudioStore } from '../store'
import type { ImpiantoKey, Opzione } from '../types'

function testoCompleto(o: Opzione): string {
  if (!o.risultato) return ''
  return [
    o.risultato.titolo,
    '',
    ...o.risultato.paragrafi.flatMap((p) => [p.titoletto, p.testo, '']),
    'Fonti citate:',
    ...o.risultato.fonti_citate,
  ].join('\n')
}

export function WriterOptions() {
  const opzioni = useStudioStore((s) => s.opzioni)
  const [attiva, setAttiva] = useState<ImpiantoKey>('A')
  const [copiata, setCopiata] = useState<ImpiantoKey | null>(null)

  if (opzioni.length === 0) return null
  const corrente = opzioni.find((o) => o.impianto === attiva) ?? opzioni[0]

  const copia = async (o: Opzione) => {
    try {
      await navigator.clipboard?.writeText(testoCompleto(o))
      setCopiata(o.impianto)
      window.setTimeout(() => setCopiata(null), 2000)
    } catch {
      // Copia non disponibile: il testo resta comunque selezionabile a mano.
    }
  }

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">Le tre opzioni dello Scrittore</h2>

      <div className="schede">
        {opzioni.map((o) => (
          <button
            key={o.impianto}
            type="button"
            className={`scheda ${o.impianto === attiva ? 'scheda-attiva' : ''} ${
              o.stato === 'errore' ? 'scheda-guasta' : ''
            }`}
            onClick={() => setAttiva(o.impianto)}
          >
            Opzione {o.impianto}
            {o.stato === 'errore' ? ' ⚠' : o.valutazione && o.valutazione.criticita.length === 0 ? ' ✓' : ''}
          </button>
        ))}
      </div>

      <p className="impianto">{corrente.etichetta}</p>

      {corrente.stato === 'in_corso' && <p className="nota">In scrittura…</p>}

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
            >
              Rigenera questa opzione
            </button>
          </div>
        </>
      )}

      {corrente.valutazione && (
        <div
          className={`allerta ${corrente.valutazione.criticita.length === 0 ? 'allerta-ok' : 'allerta-avviso'}`}
        >
          <strong>Controllore.</strong>
          {corrente.valutazione.punti_di_forza.length > 0 && (
            <>
              <p className="valutazione-titolo">Punti di forza</p>
              <ul className="elenco-semplice">
                {corrente.valutazione.punti_di_forza.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {corrente.valutazione.criticita.length > 0 && (
            <>
              <p className="valutazione-titolo">Criticità</p>
              <ul className="elenco-semplice">
                {corrente.valutazione.criticita.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {corrente.risultato && (
        <>
          <div className="azioni">
            <button
              type="button"
              className="bottone bottone-vuoto bottone-piccolo"
              onClick={() => void copia(corrente)}
            >
              {copiata === corrente.impianto ? 'Copiato ✓' : 'Copia questa opzione'}
            </button>
            <span className="contatore">{corrente.risultato.parole} parole</span>
            <button
              type="button"
              className="bottone bottone-vuoto bottone-piccolo"
              onClick={() => void rigeneraOpzione(corrente.impianto)}
            >
              Rigenera
            </button>
          </div>

          <article className="capitolo">
            <h3 className="capitolo-titolo">{corrente.risultato.titolo}</h3>
            {corrente.risultato.paragrafi.map((p, i) => (
              <section key={i}>
                <h4 className="capitolo-sottotitolo">{p.titoletto}</h4>
                <p className="capitolo-testo">{p.testo}</p>
              </section>
            ))}
            {corrente.risultato.fonti_citate.length > 0 && (
              <>
                <h4 className="capitolo-sottotitolo">Fonti citate</h4>
                <ul className="elenco-semplice">
                  {corrente.risultato.fonti_citate.map((u) => (
                    <li key={u}>
                      <a href={u} target="_blank" rel="noreferrer noopener">
                        {u}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>

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
