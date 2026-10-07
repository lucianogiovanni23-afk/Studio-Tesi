import { useMemo, useState } from 'react'
import { formattaDollari } from '../agents/costs'
import { Conferma } from '../components/Conferma'
import { IndiceEditor } from '../components/IndiceEditor'
import { ETICHETTA_STATO } from '../domain/etichette'
import { suggerimenti } from '../domain/suggerimenti'
import { useLargo } from '../hooks/useLayoutMode'
import { costoDelMese, paroleCapitolo, useStudio } from '../store'
import type { StatoCapitolo } from '../types'
import { GuidaIniziale } from '../components/Guida'
import { avanzamento, percorso, type StatoPasso } from '../domain/avanzamento'


const STATI: StatoCapitolo[] = ['da_fare', 'bozza', 'rivisto', 'approvato']

function TitoloEDomanda() {
  const titolo = useStudio((s) => s.progetto.titolo)
  const domanda = useStudio((s) => s.progetto.domanda)
  const setTitolo = useStudio((s) => s.setTitolo)
  const setDomanda = useStudio((s) => s.setDomanda)
  const [modifica, setModifica] = useState(false)
  return (
    <section className="pannello la-tesi">
      <div className="pannello-testa">
        <span className="etichetta">La tua tesi</span>
        <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={() => setModifica((m) => !m)}>
          {modifica ? 'Fatto' : 'Modifica'}
        </button>
      </div>
      {modifica ? (
        <>
          <label className="campo-blocco">
            <span className="etichetta">Titolo</span>
            <textarea className="campo campo-titolo" rows={2} value={titolo} onChange={(e) => setTitolo(e.target.value)} />
          </label>
          <label className="campo-blocco">
            <span className="etichetta">Domanda di ricerca</span>
            <textarea className="campo" rows={4} value={domanda} onChange={(e) => setDomanda(e.target.value)} />
          </label>
        </>
      ) : (
        <>
          <h2 className="la-tesi-titolo">{titolo}</h2>
          <p className="la-tesi-domanda">{domanda}</p>
        </>
      )}
    </section>
  )
}

const pagine = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 })

/** Pagine scritte rispetto all'obiettivo (50-60 pagine), per tutta la tesi e per capitolo. */
function Avanzamento() {
  const progetto = useStudio((s) => s.progetto)
  const a = useMemo(() => avanzamento(progetto), [progetto])
  const fineScala = a.pagineMax * 1.1
  return (
    <section className="pannello avanzamento" aria-labelledby="titolo-avanzamento">
      <div className="pannello-testa">
        <h2 id="titolo-avanzamento">A che punto sei</h2>
        <span className="nota">obiettivo {a.pagineMin}–{a.pagineMax} pagine</span>
      </div>
      <div className="avanzamento-testa">
        <Anello quota={a.pagine / Math.max(1, a.pagineMin)} />
        <p className="avanzamento-grande">
          <strong>{pagine(a.pagine)}</strong> {a.pagine === 1 ? 'pagina' : 'pagine'} scritte
        </p>
      </div>
      <div
        className="barra-pagine"
        role="meter"
        aria-label="Pagine scritte"
        aria-valuemin={0}
        aria-valuemax={a.pagineMax}
        aria-valuenow={a.pagine}
      >
        <span className="barra-riempita" style={{ width: `${Math.min(100, (a.pagine / fineScala) * 100)}%` }} />
        <span className="barra-obiettivo" style={{ left: `${(a.pagineMin / fineScala) * 100}%`, width: `${((a.pagineMax - a.pagineMin) / fineScala) * 100}%` }} />
      </div>
      <p className="nota">
        {a.parole.toLocaleString('it-IT')} parole ·{' '}
        {a.mancano > 0
          ? `mancano circa ${a.mancano} pagine per arrivare a ${a.pagineMin}`
          : a.pagine > a.pagineMax
            ? `hai superato le ${a.pagineMax} pagine: vedi dove puoi tagliare`
            : 'sei nella lunghezza giusta'}
      </p>
      <ul className="avanzamento-capitoli">
        {a.capitoli.map((c) => (
          <li key={c.id}>
            <span className="avanzamento-cap-titolo">
              {c.numero}. {c.titolo}
            </span>
            <span className="barra-piccola" aria-hidden>
              <span style={{ width: `${Math.min(100, (c.pagine / c.obiettivoMax) * 100)}%` }} className={c.pagine >= c.obiettivoMin ? 'raggiunto' : ''} />
            </span>
            <span className="avanzamento-cap-pagine">
              {pagine(c.pagine)} / {c.obiettivoMin}–{c.obiettivoMax} pp.
            </span>
          </li>
        ))}
      </ul>
      <p className="nota">Una pagina è circa {progetto.obiettivo.parolePerPagina} parole (Word, Times 12, interlinea 1,5). Puoi cambiare l'obiettivo nelle Impostazioni.</p>
    </section>
  )
}

/** Anello di avanzamento verso il minimo di pagine. */
function Anello({ quota }: { quota: number }) {
  const q = Math.max(0, Math.min(1, quota))
  const r = 34
  const giro = 2 * Math.PI * r
  return (
    <svg className="anello" width="84" height="84" viewBox="0 0 84 84" aria-hidden>
      <defs>
        <linearGradient id="anello-sfumatura" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--oliva)" />
          <stop offset="100%" stopColor="var(--oro)" />
        </linearGradient>
      </defs>
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--crema-2)" strokeWidth="9" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke="url(#anello-sfumatura)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${Math.max(0.001, q) * giro} ${giro}`}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="47" textAnchor="middle" className="anello-testo">
        {Math.round(q * 100)}%
      </text>
    </svg>
  )
}

const ETICHETTA_PASSO: Record<StatoPasso, string> = { da_iniziare: 'da iniziare', in_corso: 'in corso', fatto: 'fatto' }

function Percorso() {
  const progetto = useStudio((s) => s.progetto)
  const vai = useStudio((s) => s.vai)
  const passi = useMemo(() => percorso(progetto), [progetto])
  return (
    <section className="pannello" aria-labelledby="titolo-percorso">
      <h2 id="titolo-percorso">Il percorso</h2>
      <ol className="percorso">
        {passi.map((p) => (
          <li key={p.id} className={`tappa tappa-${p.stato}`}>
            <span className="tappa-numero" aria-hidden>
              {p.stato === 'fatto' ? '✓' : p.numero}
            </span>
            <div className="tappa-corpo">
              <p className="tappa-titolo">
                <strong>{p.titolo}</strong> <span className="tappa-stato">{ETICHETTA_PASSO[p.stato]}</span>
              </p>
              <p className="tappa-cosa">{p.cosa}</p>
              <p className="nota">{p.riassunto}</p>
            </div>
            <button type="button" className="bottone bottone-piccolo" onClick={() => vai(p.vai)} aria-label={`${p.titolo}: ${p.azione}`}>
              {p.azione}
            </button>
          </li>
        ))}
      </ol>
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
          {modifica ? 'Fatto' : 'Modifica indice'}
        </button>
      </div>

      {approvato ? (
        <p className="nota nota-ok">
          Indice approvato da te il {new Date(approvatoIl ?? '').toLocaleDateString('it-IT')}.
        </p>
      ) : (
        <div className="banda banda-attesa">
          <p>
            <strong>Indice da approvare.</strong> È solo un punto di partenza: cambialo come vuoi e poi approvalo. Se lo
            cambi dopo, dovrai riapprovarlo.
          </p>
          <Conferma
            etichetta="Approvo l'indice"
            domanda="Va bene l'indice così?"
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

function ProssimoPasso() {
  const progetto = useStudio((s) => s.progetto)
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const vai = useStudio((s) => s.vai)
  const voci = useMemo(() => {
    // La nota sulla modalità gratuita è un'informazione, non un'urgenza: va in fondo.
    const tutte = suggerimenti(progetto, haChiave)
    return [...tutte.filter((v) => v.tono !== 'info'), ...tutte.filter((v) => v.tono === 'info')]
  }, [progetto, haChiave])
  const [prima, ...altre] = voci
  const esegui = (v: (typeof voci)[number]) => {
    if (v.vai === 'cruscotto') document.getElementById('indice')?.scrollIntoView({ behavior: 'smooth' })
    else vai(v.vai)
  }

  return (
    <section className={`pannello prossimo tono-${prima.tono}`} aria-labelledby="titolo-prossimo">
      <h2 id="titolo-prossimo">Cosa fare adesso</h2>
      <p className="prossimo-testo">{prima.testo}</p>
      <button type="button" className="bottone bottone-primario" onClick={() => esegui(prima)}>
        {prima.etichetta}
      </button>
      {altre.length > 0 && (
        <details className="altre-cose">
          <summary>Altre cose da fare ({altre.length})</summary>
          <ul className="cosa-fare">
            {altre.map((v) => (
              <li key={v.id} className={`tono-${v.tono}`}>
                <span>{v.testo}</span>
                <button type="button" className="bottone bottone-piccolo" onClick={() => esegui(v)}>
                  {v.etichetta}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function Numeri() {
  const fonti = useStudio((s) => s.progetto.fonti.length)
  const usi = useStudio((s) => s.progetto.usi)
  const fileCorso = useStudio((s) => s.progetto.courseFiles.length)
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const mese = useMemo(() => costoDelMese(usi), [usi])

  return (
    <div className="numeri">
      <div>
        <strong>{fonti}</strong>
        <span>fonti in biblioteca</span>
      </div>
      <div>
        <strong>{fileCorso}</strong>
        <span>file del corso</span>
      </div>
      <div>
        <strong>{haChiave || mese > 0 ? formattaDollari(mese) : 'gratis'}</strong>
        <span>{haChiave || mese > 0 ? 'spesi questo mese' : 'versione gratis'}</span>
      </div>
    </div>
  )
}

export function Cruscotto() {
  const largo = useLargo(1000)

  return (
    <div className={`inizio ${largo ? 'inizio-largo' : ''}`}>
      <GuidaIniziale />
      <div className="inizio-colonna">
        <ProssimoPasso />
        <Avanzamento />
        <Indice />
      </div>
      <div className="inizio-colonna">
        <TitoloEDomanda />
        <Percorso />
        <Numeri />
      </div>
    </div>
  )
}
