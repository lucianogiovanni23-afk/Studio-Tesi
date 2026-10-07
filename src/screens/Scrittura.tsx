import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENTE } from '../agents/agenti'
import { Conferma } from '../components/Conferma'
import { TestoCitato } from '../components/TestoCitato'
import { ComandiScrittore } from '../components/scrittura/ComandiScrittore'
import { PassoFonti } from '../components/scrittura/PassoFonti'
import { PassoScaletta } from '../components/scrittura/PassoScaletta'
import { fontiPertinenti } from '../components/scrittura/pertinenza'
import { esaminaCitazioni } from '../agents/citations'
import { selezionaParagrafo, useScrittore } from '../agents/scrittore'
import { PannelloStile } from '../components/scrittura/PannelloStile'
import { esportaTesto, paragrafoAlCursore } from '../domain/citazioniTesto'
import { Esito } from '../components/Esito'
import { autoreAnno } from '../domain/bibliografia'
import { ETICHETTA_STATO } from '../domain/etichette'
import { useLargo } from '../hooks/useLayoutMode'
import { useModoUso } from '../hooks/useModoUso'
import { contaParoleTesto, useStudio } from '../store'
import type { Autore, Capitolo, Sezione } from '../types'

function nomeAutore(a: Autore): string {
  if (a === 'studente') return 'tu'
  if (a === 'sistema') return 'automatico'
  return AGENTE[a].nome
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Colonna sinistra: indice navigabile. */
function IndiceLaterale({ capitoli, capId, sezId }: { capitoli: Capitolo[]; capId: string | null; sezId: string | null }) {
  const apri = useStudio((s) => s.apriSezione)
  return (
    <nav className="indice-laterale" aria-label="Indice">
      {capitoli.map((c, i) => (
        <div key={c.id} className={`il-capitolo stato-cap-${c.stato}`}>
          <p className="il-titolo">
            <span className="indice-numero">{i + 1}</span> {c.titolo}
          </p>
          <ul>
            {c.sezioni.map((s, j) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`il-sezione ${c.id === capId && s.id === sezId ? 'il-attiva' : ''}`}
                  onClick={() => apri(c.id, s.id)}
                >
                  <span>
                    {i + 1}.{j + 1}
                  </span>{' '}
                  {s.titolo}
                  {s.testo.trim() ? <small>{contaParoleTesto(s.testo)} parole</small> : <small>vuota</small>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Testo della sezione: modificabile direttamente; si salva nello store con un breve ritardo. */
function Editor({ cap, sez, onCursore }: { cap: Capitolo; sez: Sezione; onCursore: (paragrafo: number) => void }) {
  const setTesto = useStudio((s) => s.setTestoSezione)
  const [testo, setTestoLocale] = useState(sez.testo)
  const [sezioneMostrata, setSezioneMostrata] = useState(sez.id)
  const timer = useRef<number | null>(null)
  const inSospeso = useRef<{ cap: string; sez: string; testo: string } | null>(null)

  // Cambio di sezione o ripristino di una versione: si riparte dal testo salvato.
  if (sezioneMostrata !== sez.id) {
    setSezioneMostrata(sez.id)
    setTestoLocale(sez.testo)
  }
  useEffect(() => {
    if (!inSospeso.current) setTestoLocale(sez.testo)
  }, [sez.testo])

  const scrivi = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    const p = inSospeso.current
    inSospeso.current = null
    if (p) setTesto(p.cap, p.sez, p.testo)
  }

  // Alla chiusura o al cambio di sezione il testo in sospeso non va perso.
  useEffect(() => () => scrivi(), [sez.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <textarea
      className="editor-testo"
      value={testo}
      placeholder="Scrivi qui il testo. Oppure, dopo aver scelto fonti e scaletta, chiedi una bozza allo Scrittore: puoi sempre cambiarla tu. I segni tipo [F12] o [C3] dicono da quale fonte viene una frase."
      onSelect={(e) => onCursore(paragrafoAlCursore(e.currentTarget.value, e.currentTarget.selectionStart))}
      onChange={(e) => {
        setTestoLocale(e.target.value)
        inSospeso.current = { cap: cap.id, sez: sez.id, testo: e.target.value }
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(scrivi, 600)
      }}
      onBlur={scrivi}
      aria-label={`Testo della sezione ${sez.titolo}`}
      spellCheck
      lang="it"
    />
  )
}

function Versioni({ cap, sez }: { cap: Capitolo; sez: Sezione }) {
  const salva = useStudio((s) => s.salvaVersione)
  const ripristina = useStudio((s) => s.ripristinaVersione)
  const [nota, setNota] = useState('')
  const [esito, setEsito] = useState<string | null>(null)
  const [aperta, setAperta] = useState<string | null>(null)
  const versioni = useMemo(() => [...sez.versioni].reverse(), [sez.versioni])

  return (
    <section className="versioni">
      <h3>Versioni</h3>
      <form
        className="riga-editor"
        onSubmit={(e) => {
          e.preventDefault()
          // Il testo in modifica viene scritto nello store prima di salvarne la versione.
          ;(document.activeElement as HTMLElement | null)?.blur()
          setTimeout(() => {
            const ok = salva(cap.id, sez.id, nota.trim() || 'Versione salvata da te')
            setEsito(ok ? 'Versione salvata.' : 'Non hai cambiato niente dall\'ultima versione.')
            if (ok) setNota('')
          }, 0)
        }}
      >
        <input className="campo" placeholder="Nota (se vuoi)" value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota della versione" />
        <button type="submit" className="bottone">
          Salva versione
        </button>
      </form>
      {esito && <p className="nota" role="status">{esito}</p>}
      {versioni.length === 0 ? (
        <p className="nota">Ancora nessuna versione salvata.</p>
      ) : (
        <ul className="elenco-versioni">
          {versioni.map((v) => (
            <li key={v.id}>
              <div className="versione-riga">
                <button type="button" className="link" onClick={() => setAperta(aperta === v.id ? null : v.id)} aria-expanded={aperta === v.id}>
                  {dataBreve(v.data)} · {nomeAutore(v.autore)} · {contaParoleTesto(v.testo)} parole
                </button>
                <Conferma
                  classe="bottone bottone-piccolo bottone-vuoto"
                  etichetta="Ripristina"
                  domanda="Vuoi tornare a questa versione? Il testo di adesso resta salvato."
                  conferma="Ripristina"
                  onConferma={() => {
                    ripristina(cap.id, sez.id, v.id)
                    setEsito('Fatto, sei tornato a questa versione. Il testo di prima è salvato fra le versioni.')
                  }}
                />
              </div>
              {v.nota && <p className="nota">{v.nota}</p>}
              {aperta === v.id && <pre className="anteprima-versione">{v.testo || '(vuota)'}</pre>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Colonna destra: materiale utile alla sezione. */
function Utili({ sez }: { sez: Sezione }) {
  const quadro = useStudio((s) => s.progetto.quadro)
  const glossario = useStudio((s) => s.progetto.glossario)
  const fonti = useStudio((s) => s.progetto.fonti)
  const vai = useStudio((s) => s.vai)
  const testoMinuscolo = (sez.titolo + ' ' + sez.obiettivo).toLowerCase()

  // Fonti della biblioteca più vicine al titolo e all'obiettivo della sezione.
  // Prima le fonti approvate per la sezione, poi le più vicine al suo titolo e obiettivo.
  const approvate = useMemo(() => fonti.filter((f) => sez.fontiApprovate.includes(f.id)), [fonti, sez.fontiApprovate])
  const utili = useMemo(
    () =>
      fontiPertinenti(fonti, sez)
        .filter((x) => x.peso > 0 && !sez.fontiApprovate.includes(x.f.id))
        .slice(0, 5)
        .map((x) => x.f),
    [fonti, sez],
  )

  const concetti = useMemo(() => {
    if (!quadro) return []
    return quadro.concetti
      .map((c) => ({ c, peso: c.termine.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && testoMinuscolo.includes(w)).length }))
      .sort((a, b) => b.peso - a.peso)
      .slice(0, 5)
      .map((x) => x.c)
  }, [quadro, testoMinuscolo])

  return (
    <aside className="colonna-utili" aria-label="Fonti utili per la sezione">
      <h3>Fonti della sezione</h3>
      {approvate.length === 0 ? (
        <p className="nota">{sez.fontiConfermate ? 'Solo il materiale del corso.' : 'Non le hai ancora scelte.'}</p>
      ) : (
        <ul className="elenco-concetti">
          {approvate.map((f) => (
            <li key={f.id}>
              <strong>
                <code>[F{f.numero}]</code> {autoreAnno(f)}
              </strong>
              <span>{f.titolo}</span>
              {f.scheda && <small>{f.scheda.risultati.slice(0, 160)}</small>}
            </li>
          ))}
        </ul>
      )}

      <h3>Altre fonti utili</h3>
      {fonti.length === 0 ? (
        <p className="nota">
          La biblioteca è vuota.{' '}
          <button type="button" className="link" onClick={() => vai('ricerca')}>
            Fai una ricerca
          </button>
        </p>
      ) : utili.length === 0 ? (
        <p className="nota">Nessun'altra fonte sembra c'entrare con questa parte.</p>
      ) : (
        <ul className="elenco-concetti">
          {utili.map((f) => (
            <li key={f.id}>
              <strong>
                <code>[F{f.numero}]</code> {autoreAnno(f)}
              </strong>
              <span>{f.titolo}</span>
              <small>{f.scheda ? (f.scheda.corretta ? 'scheda controllata' : 'scheda da controllare') : 'senza scheda'}</small>
            </li>
          ))}
        </ul>
      )}

      <h3>Dal corso</h3>
      {concetti.length === 0 ? (
        <p className="nota">
          {quadro ? 'Nessun concetto del corso c\'entra con questo titolo.' : 'I concetti del corso non sono ancora pronti.'}{' '}
          <button type="button" className="link" onClick={() => vai('corso')}>
            Vai al corso
          </button>
        </p>
      ) : (
        <ul className="elenco-concetti">
          {concetti.map((c) => (
            <li key={c.termine}>
              <strong>
                {c.termine} <Esito esito={c.esito} />
              </strong>
              <span>{c.definizione}</span>
              <small>{c.collocazione}</small>
            </li>
          ))}
        </ul>
      )}

      <h3>Glossario</h3>
      <ul className="elenco-glossario-breve">
        {glossario.slice(0, 12).map((v) => (
          <li key={v.id} title={v.definizione}>
            {v.termine}
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** Il testo con i marcatori colorati e la copia nello stile di citazione scelto. */
function ConCitazioni({ sez }: { sez: Sezione }) {
  const fonti = useStudio((s) => s.progetto.fonti)
  const stile = useStudio((s) => s.progetto.stileCitazione)
  const [aperto, setAperto] = useState(false)
  const [copiato, setCopiato] = useState<string | null>(null)
  const esame = useMemo(() => esaminaCitazioni(sez.testo, sez.citazioni), [sez.testo, sez.citazioni])
  // La barra resta sempre al suo posto: se comparisse al primo salvataggio, sposterebbe i bottoni sotto il dito.
  const vuoto = !sez.testo.trim()

  return (
    <section className="con-citazioni">
      <div className="riga-editor">
        <button type="button" className="bottone bottone-piccolo" onClick={() => setAperto((a) => !a)} aria-expanded={aperto} disabled={vuoto}>
          {aperto ? 'Nascondi le citazioni' : `Mostra le citazioni (${esame.totali})`}
        </button>
        <button
          type="button"
          className="bottone bottone-piccolo"
          disabled={vuoto}
          onClick={async () => {
            const testo = esportaTesto(sez.testo, sez.citazioni, fonti, stile)
            try {
              await navigator.clipboard.writeText(testo)
              setCopiato(`Testo copiato, con le citazioni ${stile === 'note' ? 'in nota a piè di pagina' : 'autore-anno'}.`)
            } catch {
              setCopiato(testo)
            }
          }}
        >
          Copia il testo ({stile === 'note' ? 'note' : 'autore-anno'})
        </button>
      </div>
      {copiato &&
        (copiato.startsWith('Testo copiato') ? (
          <p className="nota nota-ok" role="status">
            {copiato}
          </p>
        ) : (
          <label className="campo-blocco">
            <span className="etichetta">Copia da qui (il browser non mi ha fatto copiare da solo)</span>
            <textarea className="campo" rows={6} readOnly value={copiato} />
          </label>
        ))}
      {esame.incoerenze.length > 0 && <p className="allerta">Da sistemare: {esame.incoerenze.join('; ')}.</p>}
      {aperto && !vuoto && <TestoCitato testo={sez.testo} citazioni={sez.citazioni} classe="testo-anteprima" />}
    </section>
  )
}

/** In concentrazione resta solo il testo: una barra sottile dice dove sei e come uscire. */
function BarraConcentrazione({ titolo, parole }: { titolo: string; parole: number }) {
  const esci = useStudio((s) => s.setConcentrazione)
  const parolePerPagina = useStudio((s) => s.progetto.obiettivo.parolePerPagina)
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') esci(false)
    }
    window.addEventListener('keydown', suTasto)
    return () => {
      window.removeEventListener('keydown', suTasto)
      esci(false)
    }
  }, [esci])
  return (
    <div className="barra-concentrazione" role="region" aria-label="Modalità concentrazione">
      <span className="barra-concentrazione-titolo">{titolo}</span>
      <span className="nota">
        {parole} parole · circa {(parole / parolePerPagina).toLocaleString('it-IT', { maximumFractionDigits: 1 })} pagine
      </span>
      <button type="button" className="bottone bottone-piccolo" onClick={() => esci(false)}>
        Esci <span className="tasto">Esc</span>
      </button>
    </div>
  )
}

export function Scrittura() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const capId = useStudio((s) => s.capitoloAperto)
  const sezId = useStudio((s) => s.sezioneAperta)
  const apri = useStudio((s) => s.apriSezione)
  const setCarta = useStudio((s) => s.setCarta)
  const concentrazione = useStudio((s) => s.concentrazione)
  const setConcentrazione = useStudio((s) => s.setConcentrazione)
  const modo = useModoUso()
  const largo = useLargo(1100)
  const tre = modo === 'computer' && largo
  const selezione = useScrittore((s) => s.selezione)

  const cap = capitoli.find((c) => c.id === capId) ?? capitoli[0]
  const sez = cap?.sezioni.find((s) => s.id === sezId) ?? cap?.sezioni[0]

  if (!cap) {
    return (
      <section className="pannello">
        <p>L'indice è vuoto: aggiungi un capitolo dalla Panoramica.</p>
      </section>
    )
  }

  const indiceCap = capitoli.indexOf(cap)

  return (
    <div className={`scrittura ${tre ? 'scrittura-tre' : 'scrittura-una'}`}>
      {tre ? (
        <IndiceLaterale capitoli={capitoli} capId={cap.id} sezId={sez?.id ?? null} />
      ) : (
        <label className="campo-blocco selettore-sezione">
          <span className="etichetta">Sezione</span>
          <select
            className="campo"
            value={`${cap.id}|${sez?.id ?? ''}`}
            onChange={(e) => {
              const [c, s] = e.target.value.split('|')
              apri(c, s || null)
            }}
          >
            {capitoli.map((c, i) => (
              <optgroup key={c.id} label={`${i + 1}. ${c.titolo}`}>
                {c.sezioni.map((s, j) => (
                  <option key={s.id} value={`${c.id}|${s.id}`}>
                    {i + 1}.{j + 1} {s.titolo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      <main className="colonna-testo">
        {concentrazione && sez && <BarraConcentrazione titolo={`${indiceCap + 1}.${cap.sezioni.indexOf(sez) + 1} ${sez.titolo}`} parole={contaParoleTesto(sez.testo)} />}
        <div className="testa-sezione">
          <div>
            <p className="sopratitolo">
              Capitolo {indiceCap + 1} · {cap.titolo} · <span className={`stato-cap-${cap.stato} pastiglia`}>{ETICHETTA_STATO[cap.stato]}</span>
            </p>
            <h2>{sez ? `${indiceCap + 1}.${cap.sezioni.indexOf(sez) + 1} ${sez.titolo}` : 'Nessuna sezione'}</h2>
            {sez?.obiettivo && <p className="obiettivo">{sez.obiettivo}</p>}
          </div>
          <div className="riga-editor azioni-sezione">
            <button type="button" className="bottone" onClick={() => setConcentrazione(true)}>
              Concentrazione
            </button>
            <button type="button" className="bottone" onClick={() => setCarta(true)}>
              Modalità carta
            </button>
          </div>
        </div>

        {sez ? (
          <>
            <PassoFonti cap={cap} sez={sez} />
            <PassoScaletta cap={cap} sez={sez} />
            <section className="passo-scrittura passo-testo">
              <h3>
                <span className="passo-numero">3</span> Scrivi il testo
              </h3>
              <ComandiScrittore cap={cap} sez={sez} paragrafo={selezione?.sezioneId === sez.id ? selezione.n : null} />
              <Editor cap={cap} sez={sez} onCursore={(n) => selezionaParagrafo(sez.id, n)} />
              <p className="nota conteggio">{contaParoleTesto(sez.testo)} parole · ultima modifica {dataBreve(sez.aggiornataIl)}</p>
              <ConCitazioni sez={sez} />
              <PannelloStile sez={sez} />
            </section>
            <Versioni cap={cap} sez={sez} />
          </>
        ) : (
          <p className="nota">Questo capitolo non ha sezioni: aggiungile dall'indice nella Panoramica.</p>
        )}
      </main>

      {sez && <Utili sez={sez} />}
    </div>
  )
}
