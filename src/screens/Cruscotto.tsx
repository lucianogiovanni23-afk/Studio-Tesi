import { Suspense, lazy, useMemo, useState } from 'react'
import { formattaDollari } from '../agents/costs'
import { Conferma } from '../components/Conferma'
import { IndiceEditor } from '../components/IndiceEditor'
import { ETICHETTA_STATO } from '../domain/etichette'
import { suggerimenti } from '../domain/suggerimenti'
import { useLargo } from '../hooks/useLayoutMode'
import { costoDelMese, paroleCapitolo, useStudio } from '../store'
import type { StatoCapitolo } from '../types'
import { useQualitaScena } from '../scene/qualita'

// La scena 3D si carica a parte: con la modalità "spenta" non si scarica nemmeno.
const Scene = lazy(() => import('../scene/Scene').then((m) => ({ default: m.Scene })))

const STATI: StatoCapitolo[] = ['da_fare', 'bozza', 'rivisto', 'approvato']

function TitoloEDomanda() {
  const titolo = useStudio((s) => s.progetto.titolo)
  const domanda = useStudio((s) => s.progetto.domanda)
  const setTitolo = useStudio((s) => s.setTitolo)
  const setDomanda = useStudio((s) => s.setDomanda)
  return (
    <section className="pannello">
      <label className="campo-blocco">
        <span className="etichetta">Titolo</span>
        <textarea className="campo campo-titolo" rows={2} value={titolo} onChange={(e) => setTitolo(e.target.value)} />
      </label>
      <label className="campo-blocco">
        <span className="etichetta">Domanda di ricerca</span>
        <textarea className="campo" rows={4} value={domanda} onChange={(e) => setDomanda(e.target.value)} />
      </label>
    </section>
  )
}

function Indice() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const approvato = useStudio((s) => s.progetto.indiceApprovato)
  const approvatoIl = useStudio((s) => s.progetto.indiceApprovatoIl)
  const approva = useStudio((s) => s.approvaIndice)
  const setStato = useStudio((s) => s.setStatoCapitolo)
  const apriSezione = useStudio((s) => s.apriSezione)
  const [modifica, setModifica] = useState(false)

  return (
    <section className="pannello" id="indice">
      <div className="pannello-testa">
        <h2>Indice</h2>
        <button type="button" className="bottone bottone-vuoto" onClick={() => setModifica((m) => !m)}>
          {modifica ? 'Fine modifica' : 'Modifica indice'}
        </button>
      </div>

      {approvato ? (
        <p className="nota nota-ok">
          Indice approvato da te il {new Date(approvatoIl ?? '').toLocaleDateString('it-IT')}.
        </p>
      ) : (
        <div className="banda banda-attesa">
          <p>
            <strong>Indice da approvare.</strong> È una proposta di partenza: modificalo come vuoi, poi approvalo. Ogni
            modifica successiva richiede una nuova approvazione.
          </p>
          <Conferma
            etichetta="Approvo l'indice"
            domanda="Confermi l'indice così com'è?"
            conferma="Sì, approvo"
            classe="bottone bottone-primario"
            onConferma={() => {
              approva()
              setModifica(false)
            }}
          />
        </div>
      )}

      {modifica ? (
        <IndiceEditor />
      ) : (
        <ol className="indice-lista">
          {capitoli.map((c, i) => (
            <li key={c.id} className={`indice-voce stato-cap-${c.stato}`}>
              <button type="button" className="indice-titolo" onClick={() => apriSezione(c.id, c.sezioni[0]?.id ?? null)}>
                <span className="indice-numero">{i + 1}</span>
                <span>
                  {c.titolo}
                  <small>
                    {c.sezioni.length} sezioni · {paroleCapitolo(c)} parole
                  </small>
                </span>
              </button>
              <label className="seleziona-stato">
                <span className="sr">Stato del capitolo {i + 1}</span>
                <select className="campo" value={c.stato} onChange={(e) => setStato(c.id, e.target.value as StatoCapitolo)}>
                  {STATI.map((s) => (
                    <option key={s} value={s}>
                      {ETICHETTA_STATO[s]}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function CosaFare() {
  const progetto = useStudio((s) => s.progetto)
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const vai = useStudio((s) => s.vai)
  const voci = useMemo(() => suggerimenti(progetto, haChiave), [progetto, haChiave])

  return (
    <section className="pannello">
      <h2>Cosa fare adesso</h2>
      <ul className="cosa-fare">
        {voci.map((v) => (
          <li key={v.id} className={`tono-${v.tono}`}>
            <span>{v.testo}</span>
            <button
              type="button"
              className="bottone bottone-piccolo"
              onClick={() => {
                if (v.vai === 'cruscotto') document.getElementById('indice')?.scrollIntoView({ behavior: 'smooth' })
                else vai(v.vai)
              }}
            >
              {v.etichetta}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Numeri() {
  const fonti = useStudio((s) => s.progetto.fonti.length)
  const usi = useStudio((s) => s.progetto.usi)
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const fileCorso = useStudio((s) => s.progetto.courseFiles.length)
  const mese = useMemo(() => costoDelMese(usi), [usi])
  const parole = useMemo(() => capitoli.reduce((n, c) => n + paroleCapitolo(c), 0), [capitoli])
  const perStato = useMemo(
    () => Object.fromEntries(STATI.map((s) => [s, capitoli.filter((c) => c.stato === s).length])) as Record<StatoCapitolo, number>,
    [capitoli],
  )

  return (
    <section className="pannello numeri">
      <div>
        <strong>{fonti}</strong>
        <span>fonti in biblioteca</span>
      </div>
      <div>
        <strong>{formattaDollari(mese)}</strong>
        <span>costi di questo mese</span>
      </div>
      <div>
        <strong>{parole.toLocaleString('it-IT')}</strong>
        <span>parole scritte</span>
      </div>
      <div>
        <strong>{fileCorso}</strong>
        <span>file del corso</span>
      </div>
      <p className="legenda-stati">
        {STATI.map((s) => (
          <span key={s} className={`stato-cap-${s}`}>
            <i /> {ETICHETTA_STATO[s]}: {perStato[s]}
          </span>
        ))}
      </p>
    </section>
  )
}

export function Cruscotto() {
  const qualita = useQualitaScena()
  const largo = useLargo(1180)

  const scena =
    qualita === 'spenta' ? null : (
      <Suspense fallback={<div className="scena scena-carico">Preparo lo studio…</div>}>
        <Scene qualita={qualita} />
      </Suspense>
    )

  return (
    <div className={`cruscotto ${largo ? 'cruscotto-largo' : ''}`}>
      {scena && <div className="cruscotto-scena">{scena}</div>}
      <div className="cruscotto-pannelli">
        <TitoloEDomanda />
        <CosaFare />
        <Numeri />
        <Indice />
      </div>
    </div>
  )
}
