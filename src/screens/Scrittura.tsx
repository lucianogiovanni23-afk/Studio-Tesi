import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENTE } from '../agents/agenti'
import { Conferma } from '../components/Conferma'
import { Esito } from '../components/Esito'
import { ETICHETTA_STATO } from '../domain/etichette'
import { useLargo } from '../hooks/useLayoutMode'
import { useModoUso } from '../hooks/useModoUso'
import { contaParoleTesto, useStudio } from '../store'
import type { Autore, Capitolo, Sezione } from '../types'

const COMANDI = [
  'Proponi una bozza della sezione',
  'Riscrivi questo paragrafo',
  'Dammi due alternative',
  'Collega al corso',
  'Verifica le citazioni',
]

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
function Editor({ cap, sez }: { cap: Capitolo; sez: Sezione }) {
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
      placeholder="Scrivi qui il testo della sezione. Dalla fase 3 lo Scrittore potrà proporti una bozza, ma il testo resta sempre modificabile da te."
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
            setEsito(ok ? 'Versione salvata.' : 'Nessuna modifica dall\'ultima versione: niente da salvare.')
            if (ok) setNota('')
          }, 0)
        }}
      >
        <input className="campo" placeholder="Nota (facoltativa)" value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota della versione" />
        <button type="submit" className="bottone">
          Salva versione
        </button>
      </form>
      {esito && <p className="nota" role="status">{esito}</p>}
      {versioni.length === 0 ? (
        <p className="nota">Nessuna versione salvata per questa sezione.</p>
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
                  domanda="Tornare a questa versione? Il testo attuale resta fra le versioni."
                  conferma="Ripristina"
                  onConferma={() => {
                    ripristina(cap.id, sez.id, v.id)
                    setEsito('Versione ripristinata. Il testo precedente è stato conservato fra le versioni.')
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
      <h3>Fonti utili</h3>
      {fonti.length === 0 ? (
        <p className="nota">
          La biblioteca è vuota. Dalla fase 2 qui compariranno le fonti adatte a questa sezione; dalla fase 3 dovrai
          approvarle prima della stesura.
        </p>
      ) : (
        <p className="nota">{fonti.length} fonti in biblioteca.</p>
      )}

      <h3>Dal corso</h3>
      {concetti.length === 0 ? (
        <p className="nota">
          {quadro ? 'Nessun concetto del quadro teorico collegato al titolo.' : 'Quadro teorico non ancora generato.'}{' '}
          <button type="button" className="link" onClick={() => vai('corso')}>
            Materiale del corso
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

export function Scrittura() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const capId = useStudio((s) => s.capitoloAperto)
  const sezId = useStudio((s) => s.sezioneAperta)
  const apri = useStudio((s) => s.apriSezione)
  const setCarta = useStudio((s) => s.setCarta)
  const modo = useModoUso()
  const largo = useLargo(1100)
  const tre = modo === 'computer' && largo

  const cap = capitoli.find((c) => c.id === capId) ?? capitoli[0]
  const sez = cap?.sezioni.find((s) => s.id === sezId) ?? cap?.sezioni[0]

  if (!cap) {
    return (
      <section className="pannello">
        <p>L'indice è vuoto: aggiungi un capitolo dal cruscotto.</p>
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
        <div className="testa-sezione">
          <div>
            <p className="sopratitolo">
              Capitolo {indiceCap + 1} · {cap.titolo} · <span className={`stato-cap-${cap.stato} pastiglia`}>{ETICHETTA_STATO[cap.stato]}</span>
            </p>
            <h2>{sez ? `${indiceCap + 1}.${cap.sezioni.indexOf(sez) + 1} ${sez.titolo}` : 'Nessuna sezione'}</h2>
            {sez?.obiettivo && <p className="obiettivo">{sez.obiettivo}</p>}
          </div>
          <button type="button" className="bottone" onClick={() => setCarta(true)}>
            Modalità carta
          </button>
        </div>

        {sez ? (
          <>
            <div className="comandi-scrittore" role="toolbar" aria-label="Comandi dello Scrittore">
              {COMANDI.map((c) => (
                <button key={c} type="button" className="bottone bottone-piccolo" disabled title="Disponibile con la fase 3">
                  {c}
                </button>
              ))}
              <span className="nota">I comandi dello Scrittore arrivano con la fase 3. Intanto puoi scrivere tu.</span>
            </div>
            <Editor cap={cap} sez={sez} />
            <p className="nota conteggio">{contaParoleTesto(sez.testo)} parole · ultima modifica {dataBreve(sez.aggiornataIl)}</p>
            <Versioni cap={cap} sez={sez} />
          </>
        ) : (
          <p className="nota">Questo capitolo non ha sezioni: aggiungile dall'indice nel cruscotto.</p>
        )}
      </main>

      {sez && <Utili sez={sez} />}
    </div>
  )
}
