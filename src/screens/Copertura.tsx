import { useMemo, useState } from 'react'
import { autoreAnno } from '../domain/bibliografia'
import { copertura, domandaPerSezione, type CoperturaSezione, type LivelloCopertura } from '../domain/copertura'
import { useLargo } from '../hooks/useLayoutMode'
import { useStudio } from '../store'
import type { Fonte } from '../types'

const ETICHETTA: Record<LivelloCopertura, string> = { scoperta: 'nessuna fonte', debole: 'una sola fonte', coperta: 'a posto' }

function Gettone({ f }: { f: Fonte }) {
  const apriFonte = useStudio((s) => s.apriFonte)
  return (
    <button type="button" className="gettone-fonte" onClick={() => apriFonte(f.id)} title={f.titolo}>
      [F{f.numero}] {autoreAnno(f, false)}
    </button>
  )
}

function Riga({ s }: { s: CoperturaSezione }) {
  const apriSezione = useStudio((st) => st.apriSezione)
  const proponi = useStudio((st) => st.proponiRicerca)
  const scelte = [...new Map([...s.approvate, ...s.citate].map((f) => [f.id, f])).values()]
  return (
    <li className={`copertura-voce copertura-${s.livello}`}>
      <div className="copertura-testa">
        <span className="copertura-segno" aria-hidden />
        <strong>
          {s.numero} {s.titolo}
        </strong>
        <span className="copertura-stato">{ETICHETTA[s.livello]}</span>
      </div>
      {scelte.length > 0 && (
        <p className="copertura-fonti">
          {scelte.map((f) => (
            <Gettone key={f.id} f={f} />
          ))}
        </p>
      )}
      {s.suggerite.length > 0 && (
        <p className="copertura-fonti">
          <span className="nota">Già in biblioteca, forse ti servono:</span>
          {s.suggerite.map((f) => (
            <Gettone key={f.id} f={f} />
          ))}
        </p>
      )}
      <div className="riga-editor">
        {s.livello !== 'coperta' && (
          <button type="button" className="bottone bottone-piccolo bottone-primario" onClick={() => proponi(domandaPerSezione(s))}>
            Cerca fonti
          </button>
        )}
        <button type="button" className="bottone bottone-piccolo" onClick={() => apriSezione(s.capitoloId, s.sezioneId)}>
          {s.approvate.length ? 'Apri la sezione' : 'Scegli le fonti'}
        </button>
      </div>
    </li>
  )
}

/** Griglia sezioni × fonti: ● citata nel testo, ○ scelta ma non ancora citata, · forse utile. */
function Griglia({ sezioni, fonti }: { sezioni: CoperturaSezione[]; fonti: Fonte[] }) {
  const apriFonte = useStudio((s) => s.apriFonte)
  const apriSezione = useStudio((s) => s.apriSezione)
  const ordinate = [...fonti].sort((a, b) => a.numero - b.numero)
  return (
    <div className="tabella-scorrevole">
      <table className="tabella griglia-copertura">
        <caption>Quali fonti usi in ogni parte</caption>
        <thead>
          <tr>
            <th scope="col">Parte</th>
            {ordinate.map((f) => (
              <th key={f.id} scope="col">
                <button type="button" className="link" onClick={() => apriFonte(f.id)} title={`${autoreAnno(f, false)} · ${f.titolo}`}>
                  F{f.numero}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sezioni.map((s) => {
            const citate = new Set(s.citate.map((f) => f.id))
            const approvate = new Set(s.approvate.map((f) => f.id))
            const suggerite = new Set(s.suggerite.map((f) => f.id))
            return (
              <tr key={s.sezioneId} className={`copertura-${s.livello}`}>
                <th scope="row">
                  <button type="button" className="link" onClick={() => apriSezione(s.capitoloId, s.sezioneId)}>
                    <span className="copertura-segno" aria-hidden /> {s.numero} {s.titolo}
                  </button>
                </th>
                {ordinate.map((f) => (
                  <td key={f.id} className="cella-copertura">
                    {citate.has(f.id) ? (
                      <span className="cella-citata" aria-label="citata">●</span>
                    ) : approvate.has(f.id) ? (
                      <span className="cella-scelta" aria-label="scelta">○</span>
                    ) : suggerite.has(f.id) ? (
                      <span className="cella-suggerita" aria-label="forse utile">·</span>
                    ) : null}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Copertura() {
  const progetto = useStudio((s) => s.progetto)
  const apriFonte = useStudio((s) => s.apriFonte)
  const largo = useLargo(900)
  const [vista, setVista] = useState<'sezioni' | 'griglia'>('sezioni')
  const [soloDaFare, setSoloDaFare] = useState(false)
  const c = useMemo(() => copertura(progetto), [progetto])
  const sezioni = soloDaFare ? c.sezioni.filter((s) => s.livello !== 'coperta') : c.sezioni

  return (
    <div className="copertura">
      <section className="pannello">
        <div className="pannello-testa">
          <h2>Dove mancano fonti</h2>
          {largo && progetto.fonti.length > 0 && (
            <div className="sotto-schede" role="tablist">
              <button type="button" role="tab" aria-selected={vista === 'sezioni'} className={`sotto-voce ${vista === 'sezioni' ? 'sotto-attiva' : ''}`} onClick={() => setVista('sezioni')}>
                Elenco
              </button>
              <button type="button" role="tab" aria-selected={vista === 'griglia'} className={`sotto-voce ${vista === 'griglia' ? 'sotto-attiva' : ''}`} onClick={() => setVista('griglia')}>
                Griglia
              </button>
            </div>
          )}
        </div>
        <p className="copertura-riassunto">
          <span className="copertura-scoperta">
            <span className="copertura-segno" aria-hidden /> <strong>{c.conteggio.scoperta}</strong> parti senza fonti
          </span>
          <span className="copertura-debole">
            <span className="copertura-segno" aria-hidden /> <strong>{c.conteggio.debole}</strong> con una sola fonte
          </span>
          <span className="copertura-coperta">
            <span className="copertura-segno" aria-hidden /> <strong>{c.conteggio.coperta}</strong> a posto (due o più)
          </span>
        </p>
        <p className="nota">
          Qui vedi quante fonti hai scelto per ogni parte della tesi e quante ne hai già citato. Dove ne mancano puoi far partire
          una ricerca già pronta, oppure guardare le fonti che hai già in biblioteca e che potrebbero servire.
        </p>
        <label className="interruttore">
          <input type="checkbox" checked={soloDaFare} onChange={(e) => setSoloDaFare(e.target.checked)} />
          <span>Solo le parti con poche fonti</span>
        </label>
      </section>

      {vista === 'griglia' && largo && progetto.fonti.length > 0 ? (
        <section className="pannello">
          <Griglia sezioni={sezioni} fonti={progetto.fonti} />
          <p className="nota legenda-griglia">● citata nel testo · ○ scelta ma non ancora citata · · forse ti serve</p>
        </section>
      ) : (
        <ol className="copertura-elenco">
          {sezioni.map((s) => (
            <Riga key={s.sezioneId} s={s} />
          ))}
        </ol>
      )}

      {c.inutilizzate.length > 0 && (
        <section className="pannello">
          <h2>Fonti che non usi ancora ({c.inutilizzate.length})</h2>
          <p className="nota">Sono in biblioteca ma non le hai ancora scelte né citate da nessuna parte.</p>
          <p className="copertura-fonti">
            {c.inutilizzate.map((f) => (
              <button key={f.id} type="button" className="gettone-fonte" onClick={() => apriFonte(f.id)} title={f.titolo}>
                [F{f.numero}] {autoreAnno(f, false)}
              </button>
            ))}
          </p>
        </section>
      )}
    </div>
  )
}
