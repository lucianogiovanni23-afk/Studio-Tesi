import '../styles/panoramica.css'
import { useEffect, useId, useMemo, useState } from 'react'
import { formattaDollari } from '../agents/costs'
import { Conferma } from '../components/Conferma'
import { IndiceEditor } from '../components/IndiceEditor'
import { useGuida } from '../components/guidaStato'
import { ETICHETTA_STATO } from '../domain/etichette'
import { suggerimenti } from '../domain/suggerimenti'
import { avanzamento, percorso, type PassoPercorso, type StatoPasso } from '../domain/avanzamento'
import { costoDelMese, paroleCapitolo, useStudio } from '../store'
import type { Progetto, StatoCapitolo } from '../types'
import { Cassetto } from '../ui/Cassetto'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'
import { coriandoli } from '../ui/festa'
import { suonoTraguardo } from '../ui/suoni'

const STATI: StatoCapitolo[] = ['da_fare', 'bozza', 'rivisto', 'approvato']

const pagine = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 })

const movimentoRidotto = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Coriandoli e accordo: per l'indice approvato e i capitoli approvati. */
function festeggia() {
  coriandoli()
  suonoTraguardo()
}

// ---------------------------------------------------------------------------
// In alto: la tesi, l'anello delle pagine, cosa fare adesso
// ---------------------------------------------------------------------------

function TitoloEDomanda() {
  const titolo = useStudio((s) => s.progetto.titolo)
  const domanda = useStudio((s) => s.progetto.domanda)
  const setTitolo = useStudio((s) => s.setTitolo)
  const setDomanda = useStudio((s) => s.setDomanda)
  const [modifica, setModifica] = useState(false)
  return (
    <section className="pannello la-tesi pan-carta">
      <div className="pannello-testa">
        <span className="etichetta pan-occhiello">
          <Icona nome="libro" dimensione={15} /> La tua tesi
        </span>
        <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={() => setModifica((m) => !m)}>
          {modifica ? <Icona nome="spunta" dimensione={16} /> : <Icona nome="matita" dimensione={16} />}
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

/** Un numero che sale da 0 al valore, una volta sola (fermo se il movimento è ridotto). */
function useConteggio(valore: number, durata = 1100) {
  const [mostrato, setMostrato] = useState(0)
  const fermo = movimentoRidotto()
  useEffect(() => {
    if (fermo) return
    let fotogramma = 0
    const inizio = performance.now()
    const passo = (t: number) => {
      const k = Math.min(1, (t - inizio) / durata)
      setMostrato(valore * (1 - Math.pow(1 - k, 3)))
      if (k < 1) fotogramma = requestAnimationFrame(passo)
    }
    fotogramma = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(fotogramma)
  }, [valore, durata, fermo])
  return fermo ? valore : mostrato
}

/** Anello grande verso il minimo di pagine: si riempie all'apertura. */
function Anello({ quota, pagineScritte, pagineMax }: { quota: number; pagineScritte: number; pagineMax: number }) {
  const q = Math.max(0, Math.min(1, quota))
  const id = useId().replace(/:/g, '')
  const r = 84
  const giro = 2 * Math.PI * r
  const [pieno, setPieno] = useState(movimentoRidotto)
  useEffect(() => {
    if (pieno) return
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setPieno(true)))
    return () => cancelAnimationFrame(f)
  }, [pieno])
  const percento = useConteggio(Math.round(q * 100))
  return (
    <div
      className="pan-anello"
      role="meter"
      aria-label="Pagine scritte"
      aria-valuemin={0}
      aria-valuemax={pagineMax}
      aria-valuenow={pagineScritte}
    >
      <svg viewBox="0 0 200 200" aria-hidden>
        <defs>
          <linearGradient id={`anello-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--oliva)" />
            <stop offset="100%" stopColor="var(--oro)" />
          </linearGradient>
        </defs>
        <circle className="pan-anello-fondo" cx="100" cy="100" r={r} />
        <circle
          className="pan-anello-pieno"
          cx="100"
          cy="100"
          r={r}
          stroke={`url(#anello-${id})`}
          strokeDasharray={`${giro} ${giro}`}
          strokeDashoffset={pieno ? giro * (1 - Math.max(0.004, q)) : giro}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="pan-anello-centro" aria-hidden>
        <strong>{Math.round(percento)}%</strong>
        <span>del minimo</span>
      </div>
    </div>
  )
}

function AChePuntoSei() {
  const progetto = useStudio((s) => s.progetto)
  const a = useMemo(() => avanzamento(progetto), [progetto])
  return (
    <section className="pannello pan-carta pan-punto" aria-labelledby="titolo-avanzamento">
      <div className="pan-punto-testa">
        <h2 id="titolo-avanzamento">A che punto sei</h2>
        <Info etichetta="Come conto le pagine">
          Una pagina è circa {progetto.obiettivo.parolePerPagina} parole (Word, Times 12, interlinea 1,5). Puoi cambiare
          l'obiettivo nelle Impostazioni.
        </Info>
      </div>
      <Anello quota={a.pagine / Math.max(1, a.pagineMin)} pagineScritte={a.pagine} pagineMax={a.pagineMax} />
      <div className="pan-punto-dati">
        <p className="pan-punto-grande">
          <strong>{pagine(a.pagine)}</strong> {a.pagine === 1 ? 'pagina' : 'pagine'} scritte
        </p>
        <p className="pan-punto-obiettivo">obiettivo {a.pagineMin}–{a.pagineMax} pagine</p>
        <p className="nota">
          {a.parole.toLocaleString('it-IT')} parole ·{' '}
          {a.mancano > 0
            ? `mancano circa ${a.mancano} pagine per arrivare a ${a.pagineMin}`
            : a.pagine > a.pagineMax
              ? `hai superato le ${a.pagineMax} pagine: vedi dove puoi tagliare`
              : 'sei nella lunghezza giusta'}
        </p>
      </div>
    </section>
  )
}

function ProssimoPasso({ apriIndice }: { apriIndice: () => void }) {
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
    if (v.vai === 'cruscotto') apriIndice()
    else vai(v.vai)
  }

  return (
    <section className={`pannello pan-carta pan-prossimo tono-${prima.tono}`} aria-labelledby="titolo-prossimo">
      <span className="pan-prossimo-icona" aria-hidden>
        <Icona nome={prima.tono === 'urgente' ? 'bandiera' : prima.tono === 'info' ? 'info' : 'scintille'} dimensione={22} />
      </span>
      <h2 id="titolo-prossimo">Cosa fare adesso</h2>
      <p className="pan-prossimo-testo">{prima.testo}</p>
      <button type="button" className="bottone bottone-primario pan-prossimo-via" onClick={() => esegui(prima)}>
        {prima.etichetta}
        <Icona nome="freccia" dimensione={18} />
      </button>
      {altre.length > 0 && (
        <details className="pan-altre">
          <summary>
            <Icona nome="elenco" dimensione={16} /> Altre cose da fare ({altre.length})
          </summary>
          <ul className="pan-altre-elenco">
            {altre.map((v) => (
              <li key={v.id} className={`tono-${v.tono}`}>
                <span>{v.testo}</span>
                <button type="button" className="bottone bottone-secondario bottone-piccolo" onClick={() => esegui(v)}>
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

// ---------------------------------------------------------------------------
// Il percorso: i quattro passi con il loro avanzamento
// ---------------------------------------------------------------------------

const ETICHETTA_PASSO: Record<StatoPasso, string> = { da_iniziare: 'da iniziare', in_corso: 'in corso', fatto: 'fatto' }
const ICONA_PASSO: Record<PassoPercorso['id'], string> = { corso: 'libro', fonti: 'libri', scrittura: 'matita', revisione: 'scudo' }

/** Il numero grande di ogni passo, con la sua barretta (0–1). */
function misuraPasso(id: PassoPercorso['id'], p: Progetto): { valore: string; cosa: string; quota: number } {
  const sezioni = p.capitoli.flatMap((c) => c.sezioni)
  const n = Math.max(1, sezioni.length)
  switch (id) {
    case 'corso': {
      const pronti = p.courseFiles.filter((f) => f.status === 'pronto').length
      return { valore: String(pronti), cosa: pronti === 1 ? 'file pronto' : 'file pronti', quota: pronti === 0 ? 0 : p.quadro ? 1 : 0.5 }
    }
    case 'fonti': {
      const conFonti = sezioni.filter((s) => s.fontiConfermate).length
      return { valore: `${Math.round((conFonti / n) * 100)}%`, cosa: 'sezioni con fonti', quota: conFonti / n }
    }
    case 'scrittura': {
      const scritte = sezioni.filter((s) => s.testo.trim()).length
      return { valore: `${Math.round((scritte / n) * 100)}%`, cosa: 'sezioni scritte', quota: scritte / n }
    }
    case 'revisione': {
      const approvati = p.capitoli.filter((c) => c.stato === 'approvato').length
      return { valore: `${approvati}/${p.capitoli.length}`, cosa: 'capitoli approvati', quota: approvati / Math.max(1, p.capitoli.length) }
    }
  }
}

function Numeri() {
  const fonti = useStudio((s) => s.progetto.fonti.length)
  const usi = useStudio((s) => s.progetto.usi)
  const fileCorso = useStudio((s) => s.progetto.courseFiles.length)
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const mese = useMemo(() => costoDelMese(usi), [usi])
  return (
    <ul className="pan-pillole" aria-label="In numeri">
      <li>
        <Icona nome="libri" dimensione={16} />
        <strong>{fonti}</strong> <span>fonti in biblioteca</span>
      </li>
      <li>
        <Icona nome="file" dimensione={16} />
        <strong>{fileCorso}</strong> <span>file del corso</span>
      </li>
      <li>
        <Icona nome={haChiave || mese > 0 ? 'grafico' : 'scintille'} dimensione={16} />
        <strong>{haChiave || mese > 0 ? formattaDollari(mese) : 'gratis'}</strong>{' '}
        <span>{haChiave || mese > 0 ? 'spesi questo mese' : 'versione gratis'}</span>
      </li>
    </ul>
  )
}

function Percorso() {
  const progetto = useStudio((s) => s.progetto)
  const vai = useStudio((s) => s.vai)
  const passi = useMemo(() => percorso(progetto), [progetto])
  return (
    <section className="pannello pan-percorso" aria-labelledby="titolo-percorso">
      <div className="pan-sezione-testa">
        <h2 id="titolo-percorso">
          <Icona nome="mappa" dimensione={20} /> Il percorso
        </h2>
        <Numeri />
      </div>
      <ol className="pan-passi">
        {passi.map((p) => {
          const m = misuraPasso(p.id, progetto)
          return (
            <li key={p.id} className={`pan-passo pan-passo-${p.stato}`}>
              <div className="pan-passo-testa">
                <span className="pan-passo-icona" aria-hidden>
                  {p.stato === 'fatto' ? <Icona nome="spunta" dimensione={20} /> : <Icona nome={ICONA_PASSO[p.id]} dimensione={20} />}
                </span>
                <span className="pan-passo-numero">Passo {p.numero}</span>
                <span className="pan-passo-stato">{ETICHETTA_PASSO[p.stato]}</span>
              </div>
              <p className="pan-passo-titolo">
                <strong>{p.titolo}</strong>
                <Info etichetta={`Cosa si fa: ${p.titolo}`}>{p.cosa}</Info>
              </p>
              <p className="pan-passo-misura">
                <strong>{m.valore}</strong> <span>{m.cosa}</span>
              </p>
              <span className="pan-barretta" aria-hidden>
                <span style={{ width: `${Math.round(Math.min(1, m.quota) * 100)}%` }} />
              </span>
              <p className="nota pan-passo-riassunto">{p.riassunto}</p>
              <button
                type="button"
                className="bottone bottone-secondario bottone-piccolo pan-passo-via"
                onClick={() => vai(p.vai)}
                aria-label={`${p.titolo}: ${p.azione}`}
              >
                {p.azione}
                <Icona nome="freccia" dimensione={16} />
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Indice: compatto sulla pagina, completo nel cassetto
// ---------------------------------------------------------------------------

function Indice({ apriEditor }: { apriEditor: () => void }) {
  const progetto = useStudio((s) => s.progetto)
  const capitoli = progetto.capitoli
  const approvato = progetto.indiceApprovato
  const approvatoIl = progetto.indiceApprovatoIl
  const apriSezione = useStudio((s) => s.apriSezione)
  const a = useMemo(() => avanzamento(progetto), [progetto])

  return (
    <section className="pannello pan-indice" id="indice" aria-labelledby="titolo-indice">
      <div className="pan-sezione-testa">
        <h2 id="titolo-indice">
          <Icona nome="elenco" dimensione={20} /> Indice
        </h2>
        {approvato ? (
          <span className="pan-chip pan-chip-ok">
            <Icona nome="spunta" dimensione={14} /> approvato il {new Date(approvatoIl ?? '').toLocaleDateString('it-IT')}
          </span>
        ) : (
          <span className="pan-chip pan-chip-attesa">
            <Icona nome="orologio" dimensione={14} /> da approvare
          </span>
        )}
        <button type="button" className="bottone bottone-secondario pan-indice-modifica" onClick={apriEditor}>
          <Icona nome="matita" dimensione={16} />
          Modifica indice
        </button>
      </div>

      <ol className="pan-capitoli">
        {capitoli.map((c, i) => {
          const av = a.capitoli[i]
          return (
            <li key={c.id} className={`pan-cap stato-cap-${c.stato}`}>
              <button type="button" className="pan-cap-titolo" onClick={() => apriSezione(c.id, c.sezioni[0]?.id ?? null)}>
                <span className="pan-cap-numero">{i + 1}</span>
                <span className="pan-cap-testi">
                  <span className="pan-cap-nome">{c.titolo}</span>
                  <small>
                    {c.sezioni.length} sezioni · {paroleCapitolo(c).toLocaleString('it-IT')} parole
                  </small>
                </span>
              </button>
              {av && (
                <span className="pan-cap-pagine">
                  <span className="pan-barretta" aria-hidden>
                    <span
                      style={{ width: `${Math.min(100, (av.pagine / av.obiettivoMax) * 100)}%` }}
                      className={av.pagine >= av.obiettivoMin ? 'raggiunto' : ''}
                    />
                  </span>
                  <span className="pan-cap-numeri">
                    {pagine(av.pagine)} / {av.obiettivoMin}–{av.obiettivoMax} pp.
                  </span>
                </span>
              )}
              <span className="pan-stato">{ETICHETTA_STATO[c.stato]}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function EditorIndice({ aperto, chiudi }: { aperto: boolean; chiudi: () => void }) {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const approvato = useStudio((s) => s.progetto.indiceApprovato)
  const approvatoIl = useStudio((s) => s.progetto.indiceApprovatoIl)
  const approva = useStudio((s) => s.approvaIndice)
  const setStato = useStudio((s) => s.setStatoCapitolo)

  return (
    <Cassetto aperto={aperto} onChiudi={chiudi} titolo="Modifica indice" larghezza={640}>
      <div className="pan-editor">
        {approvato ? (
          <p className="nota nota-ok">
            <Icona nome="spunta" dimensione={16} /> Indice approvato da te il {new Date(approvatoIl ?? '').toLocaleDateString('it-IT')}.
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
                chiudi()
                festeggia()
              }}
            />
          </div>
        )}

        <h3 className="pan-editor-titolo">
          <Icona nome="bandiera" dimensione={18} /> A che punto è ogni capitolo
        </h3>
        <ul className="pan-stati">
          {capitoli.map((c, i) => (
            <li key={c.id} className={`stato-cap-${c.stato}`}>
              <span className="pan-cap-numero">{i + 1}</span>
              <span className="pan-stati-nome">{c.titolo}</span>
              <label className="seleziona-stato">
                <span className="sr">Stato del capitolo {i + 1}</span>
                <select
                  className="campo"
                  value={c.stato}
                  onChange={(e) => {
                    const nuovo = e.target.value as StatoCapitolo
                    setStato(c.id, nuovo)
                    if (nuovo === 'approvato' && c.stato !== 'approvato') festeggia()
                  }}
                >
                  {STATI.map((s) => (
                    <option key={s} value={s}>
                      {ETICHETTA_STATO[s]}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>

        <h3 className="pan-editor-titolo">
          <Icona nome="matita" dimensione={18} /> Capitoli e sezioni
        </h3>
        <IndiceEditor />

        <div className="pan-editor-piede">
          <button type="button" className="bottone bottone-secondario" onClick={chiudi}>
            Fatto
          </button>
        </div>
      </div>
    </Cassetto>
  )
}

export function Cruscotto() {
  const [editor, setEditor] = useState(false)

  // La guida "Come funziona" ora vive solo nella finestra: al primo avvio la apriamo da qui.
  useEffect(() => {
    const g = useGuida.getState()
    if (!g.vista && !g.aperta) useGuida.setState({ aperta: true })
  }, [])

  return (
    <div className="pan">
      <div className="pan-eroe">
        <TitoloEDomanda />
        <AChePuntoSei />
        <ProssimoPasso apriIndice={() => setEditor(true)} />
      </div>
      <Percorso />
      <Indice apriEditor={() => setEditor(true)} />
      <EditorIndice aperto={editor} chiudi={() => setEditor(false)} />
    </div>
  )
}
