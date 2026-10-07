import '../styles/fonti.css'
import { useMemo, useState } from 'react'
import { autoreAnno } from '../domain/bibliografia'
import { copertura, domandaPerSezione, type CoperturaSezione, type LivelloCopertura } from '../domain/copertura'
import { useLargo } from '../hooks/useLayoutMode'
import { useStudio } from '../store'
import type { Fonte } from '../types'
import { Cassetto } from '../ui/Cassetto'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'

const ETICHETTA: Record<LivelloCopertura, string> = { scoperta: 'nessuna fonte', debole: 'una sola fonte', coperta: 'a posto' }

function Gettone({ f }: { f: Fonte }) {
  const apriFonte = useStudio((s) => s.apriFonte)
  return (
    <button type="button" className="gettone-fonte" onClick={() => apriFonte(f.id)} title={f.titolo}>
      [F{f.numero}] {autoreAnno(f, false)}
    </button>
  )
}

function scelteDi(s: CoperturaSezione): Fonte[] {
  return [...new Map([...s.approvate, ...s.citate].map((f) => [f.id, f])).values()]
}

/** Fonti della parte e le due azioni: cercarne altre o aprire la sezione. */
function CorpoSezione({ s }: { s: CoperturaSezione }) {
  const apriSezione = useStudio((st) => st.apriSezione)
  const proponi = useStudio((st) => st.proponiRicerca)
  const scelte = scelteDi(s)
  return (
    <>
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
            <Icona nome="cerca" />
            Cerca fonti
          </button>
        )}
        <button type="button" className="bottone bottone-piccolo bottone-secondario" onClick={() => apriSezione(s.capitoloId, s.sezioneId)}>
          <Icona nome="matita" />
          {s.approvate.length ? 'Apri la sezione' : 'Scegli le fonti'}
        </button>
      </div>
    </>
  )
}

function Riga({ s }: { s: CoperturaSezione }) {
  return (
    <li className={`copertura-voce copertura-${s.livello}`}>
      <div className="copertura-testa">
        <span className="copertura-segno" aria-hidden />
        <strong>
          {s.numero} {s.titolo}
        </strong>
        <span className="copertura-stato">{ETICHETTA[s.livello]}</span>
      </div>
      <CorpoSezione s={s} />
    </li>
  )
}

/** Il dettaglio di un paragrafo scelto sulla mappa. */
function DettaglioSezione({ s }: { s: CoperturaSezione }) {
  const n = scelteDi(s).length
  return (
    <div className={`cop-dettaglio-corpo copertura-${s.livello}`}>
      <span className={`cop-livello cop-livello-${s.livello}`}>
        <span className="copertura-segno" aria-hidden /> {ETICHETTA[s.livello]} · {n} {n === 1 ? 'fonte' : 'fonti'}
      </span>
      <h3>
        {s.numero} {s.titolo}
      </h3>
      {s.obiettivo && <p className="nota cop-obiettivo">{s.obiettivo}</p>}
      {n === 0 && s.suggerite.length === 0 && <p className="nota">Per questa parte non hai ancora fonti.</p>}
      <CorpoSezione s={s} />
    </div>
  )
}

/** La mappa a colori: una tessera per paragrafo, raggruppate per capitolo. */
function Mappa({ sezioni, scelta, onScegli }: { sezioni: CoperturaSezione[]; scelta: string | null; onScegli: (id: string) => void }) {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  return (
    <div className="cop-mappa">
      {capitoli.map((c, i) => {
        const sue = sezioni.filter((s) => s.capitoloId === c.id)
        if (sue.length === 0) return null
        const ok = sue.filter((s) => s.livello === 'coperta').length
        return (
          <section key={c.id} className="cop-capitolo">
            <div className="cop-capitolo-testa">
              <h3>
                <span className="cop-capitolo-numero">{i + 1}</span>
                {c.titolo}
              </h3>
              <span className="nota">
                {ok} di {sue.length} a posto
              </span>
            </div>
            <ul className="cop-tessere">
              {sue.map((s) => {
                const n = scelteDi(s).length
                return (
                  <li key={s.sezioneId}>
                    <button
                      type="button"
                      className={`cop-tessera cop-tessera-${s.livello} ${scelta === s.sezioneId ? 'cop-tessera-scelta' : ''}`}
                      aria-pressed={scelta === s.sezioneId}
                      onClick={() => onScegli(s.sezioneId)}
                    >
                      <span className="cop-tessera-numero">{s.numero}</span>
                      <span className="cop-tessera-titolo">{s.titolo}</span>
                      <span className="cop-tessera-fonti">
                        <Icona nome="libri" dimensione={14} /> {n} {n === 1 ? 'fonte' : 'fonti'}
                        <span className="sr"> · {ETICHETTA[s.livello]}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
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

type VistaCopertura = 'mappa' | 'sezioni' | 'griglia'

export function Copertura() {
  const progetto = useStudio((s) => s.progetto)
  const apriFonte = useStudio((s) => s.apriFonte)
  const largo = useLargo(900)
  const largoMappa = useLargo(1100)
  const [vista, setVista] = useState<VistaCopertura>('mappa')
  const [soloDaFare, setSoloDaFare] = useState(false)
  const c = useMemo(() => copertura(progetto), [progetto])
  const sezioni = soloDaFare ? c.sezioni.filter((s) => s.livello !== 'coperta') : c.sezioni
  // Sul computer si parte già dal primo paragrafo che ha bisogno di fonti.
  const [scelta, setScelta] = useState<string | null>(() => (largoMappa ? (c.sezioni.find((s) => s.livello !== 'coperta') ?? c.sezioni[0])?.sezioneId ?? null : null))
  const sezioneScelta = c.sezioni.find((s) => s.sezioneId === scelta) ?? null
  const totale = c.sezioni.length || 1
  const conGriglia = largo && progetto.fonti.length > 0
  const vistaVera = vista === 'griglia' && !conGriglia ? 'mappa' : vista

  const scheda = (id: VistaCopertura, nome: string, icona: string) => (
    <button type="button" role="tab" aria-selected={vistaVera === id} className={`sotto-voce ${vistaVera === id ? 'sotto-attiva' : ''}`} onClick={() => setVista(id)}>
      <Icona nome={icona} dimensione={16} /> {nome}
    </button>
  )

  return (
    <div className="copertura cop">
      <section className="pannello cop-testa">
        <div className="pannello-testa">
          <h2>
            <Icona nome="mappa" /> Dove mancano fonti
            <Info>
              Qui vedi quante fonti hai scelto per ogni parte della tesi e quante ne hai già citato. Dove ne mancano puoi far partire una ricerca già
              pronta, oppure guardare le fonti che hai già in biblioteca e che potrebbero servire.
            </Info>
          </h2>
          <div className="sotto-schede" role="tablist">
            {scheda('mappa', 'Mappa', 'griglia')}
            {scheda('sezioni', 'Elenco', 'elenco')}
            {conGriglia && scheda('griglia', 'Griglia', 'grafico')}
          </div>
        </div>
        <div className="cop-numeri copertura-riassunto">
          <span className="cop-numero copertura-scoperta">
            <strong>{c.conteggio.scoperta}</strong>
            <span>
              <span className="copertura-segno" aria-hidden /> parti senza fonti
            </span>
          </span>
          <span className="cop-numero copertura-debole">
            <strong>{c.conteggio.debole}</strong>
            <span>
              <span className="copertura-segno" aria-hidden /> con una sola fonte
            </span>
          </span>
          <span className="cop-numero copertura-coperta">
            <strong>{c.conteggio.coperta}</strong>
            <span>
              <span className="copertura-segno" aria-hidden /> a posto (due o più)
            </span>
          </span>
        </div>
        <div className="cop-barra" aria-hidden>
          <span className="cop-barra-scoperta" style={{ width: `${(c.conteggio.scoperta / totale) * 100}%` }} />
          <span className="cop-barra-debole" style={{ width: `${(c.conteggio.debole / totale) * 100}%` }} />
          <span className="cop-barra-coperta" style={{ width: `${(c.conteggio.coperta / totale) * 100}%` }} />
        </div>
        <label className="interruttore">
          <input type="checkbox" checked={soloDaFare} onChange={(e) => setSoloDaFare(e.target.checked)} />
          <span>Solo le parti con poche fonti</span>
        </label>
      </section>

      {vistaVera === 'griglia' ? (
        <section className="pannello">
          <Griglia sezioni={sezioni} fonti={progetto.fonti} />
          <p className="nota legenda-griglia">● citata nel testo · ○ scelta ma non ancora citata · · forse ti serve</p>
        </section>
      ) : vistaVera === 'sezioni' ? (
        <ol className="copertura-elenco">
          {sezioni.map((s) => (
            <Riga key={s.sezioneId} s={s} />
          ))}
        </ol>
      ) : (
        <div className={`cop-corpo ${largoMappa ? 'cop-corpo-largo' : ''}`}>
          {sezioni.length === 0 ? (
            <p className="nota pannello">Tutte le parti hanno almeno due fonti. Bel lavoro!</p>
          ) : (
            <Mappa sezioni={sezioni} scelta={scelta} onScegli={setScelta} />
          )}
          {largoMappa ? (
            <aside className="pannello cop-dettaglio" aria-live="polite">
              {sezioneScelta ? (
                <DettaglioSezione s={sezioneScelta} />
              ) : (
                <p className="nota cop-dettaglio-vuoto">
                  <Icona nome="mappa" dimensione={28} />
                  Tocca un paragrafo della mappa per vedere le sue fonti.
                </p>
              )}
            </aside>
          ) : (
            <Cassetto aperto={Boolean(sezioneScelta)} onChiudi={() => setScelta(null)} titolo={sezioneScelta ? `Paragrafo ${sezioneScelta.numero}` : 'Paragrafo'}>
              {sezioneScelta && <DettaglioSezione s={sezioneScelta} />}
            </Cassetto>
          )}
        </div>
      )}

      {c.inutilizzate.length > 0 && (
        <section className="pannello cop-inutilizzate">
          <h2>
            <Icona nome="libri" /> Fonti che non usi ancora ({c.inutilizzate.length})
            <Info>Sono in biblioteca ma non le hai ancora scelte né citate da nessuna parte.</Info>
          </h2>
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
