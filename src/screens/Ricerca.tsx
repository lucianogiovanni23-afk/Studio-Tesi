import '../styles/fonti.css'
import { costoStimato } from '../agents/api'
import { useEffect, useMemo, useState } from 'react'
import { annullaRicerca, avviaRicerca, stimaRicerca, useRicerca, type OpzioniRicerca } from '../agents/bibliotecario'
import { CATALOGHI, provaCataloghi, type EsitoProva } from '../agents/cataloghi'
import { Conferma } from '../components/Conferma'
import { Esito } from '../components/Esito'
import { Ritratto } from '../components/Ritratto'
import { TemiChips } from '../components/TemiChips'
import { ETICHETTA_ORIGINE, autoreAnno } from '../domain/bibliografia'
import { DOMINI_ISTITUZIONALI } from '../domain/dominio'
import { useStudio } from '../store'
import type { Candidato } from '../types'
import { Fisarmonica } from '../ui/Fisarmonica'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'

const ICONA_PASSO = { attesa: '○', corso: '…', ok: '✓', avviso: '!', errore: '✕', saltato: '–' }

function Modulo() {
  const gratuita = useStudio((s) => !s.apiKey.trim())
  const modelli = useStudio((s) => s.preferenze.modelli)
  const inCorso = useRicerca((s) => s.inCorso)
  // Se si arriva dalla mappa di copertura la domanda è già pronta (si usa una volta sola).
  const [domanda, setDomanda] = useState(() => useStudio.getState().domandaProposta)
  useEffect(() => {
    if (useStudio.getState().domandaProposta) useStudio.setState({ domandaProposta: '' })
  }, [])
  const [scelte, setOpzioni] = useState<OpzioniRicerca>({ cataloghi: true, istituzionali: true, web: true })
  // Senza chiave la ricerca web non è disponibile: restano i cataloghi.
  const opzioni = gratuita ? { ...scelte, istituzionali: false, web: false } : scelte
  const stima = useMemo(() => stimaRicerca(opzioni), [opzioni, modelli]) // eslint-disable-line react-hooks/exhaustive-deps

  const casella = (k: keyof OpzioniRicerca, testo: string, nota: string, icona: string) => (
    <label className={`ric-opzione interruttore ${opzioni[k] ? 'ric-opzione-attiva' : ''} ${gratuita && k !== 'cataloghi' ? 'ric-opzione-spenta' : ''}`}>
      <input type="checkbox" checked={opzioni[k]} onChange={(e) => setOpzioni({ ...scelte, [k]: e.target.checked })} disabled={inCorso || (gratuita && k !== 'cataloghi')} />
      <span className="ric-opzione-icona" aria-hidden>
        <Icona nome={icona} dimensione={18} />
      </span>
      <span className="ric-opzione-testo">
        {testo}
        <small className="nota"> — {nota}</small>
      </span>
    </label>
  )

  return (
    <section className="pannello ric-modulo">
      <h2>
        <Icona nome="lente" /> Cerca fonti nuove
      </h2>
      <label className="campo-blocco">
        <span className="etichetta">Cosa vuoi cercare?</span>
        <textarea
          className="campo"
          rows={3}
          value={domanda}
          placeholder="Per esempio: quanto guadagnano i frantoi calabresi negli anni di raccolta scarsa?"
          onChange={(e) => setDomanda(e.target.value)}
          disabled={inCorso}
        />
      </label>
      <span className="etichetta ric-dove">
        Dove cerco
        {gratuita && (
          <Info>
            Sei in modalità gratis: cerco solo negli archivi di articoli. Per i siti ufficiali e il resto del web serve la chiave API. I report di
            ISMEA, ISTAT e simili puoi scaricarli tu e metterli in Biblioteca come PDF.
          </Info>
        )}
      </span>
      <div className="ric-opzioni">
        {casella('cataloghi', 'Archivi di articoli', 'OpenAlex, Crossref, Semantic Scholar. Gratis', 'libri')}
        {casella('istituzionali', 'Siti ufficiali', 'ISMEA, ISTAT, CREA-RICA, ARPACAL, Copernicus e altri', 'scudo')}
        {casella('web', 'Resto del web', 'studi e report anche in inglese e spagnolo', 'link')}
      </div>
      {gratuita && <p className="nota ric-gratis">Modalità gratis: solo archivi di articoli.</p>}
      {inCorso ? (
        <div className="riga-editor ric-invia">
          <span className="in-corso">Il Bibliotecario sta cercando…</span>
          <button type="button" className="bottone bottone-vuoto" onClick={annullaRicerca}>
            Ferma
          </button>
        </div>
      ) : (
        <div className="ric-invia">
        <Conferma
          classe="bottone bottone-primario ric-cerca"
          etichetta={
            <>
              <Icona nome="cerca" />
              Cerca
            </>
          }
          disabilitato={domanda.trim().length < 8 || !(opzioni.cataloghi || opzioni.istituzionali || opzioni.web)}
          domanda={`${costoStimato(stima)} (gli archivi di articoli sono gratis). Procedo?`}
          conferma="Cerca"
          onConferma={() => void avviaRicerca(domanda.trim(), opzioni)}
        />
        </div>
      )}
      <details className="dettagli-piccoli">
        <summary>Quali siti ufficiali guardo</summary>
        <p className="nota">{DOMINI_ISTITUZIONALI.join(' · ')}</p>
      </details>
    </section>
  )
}

function Avanzamento() {
  const passi = useRicerca((s) => s.passi)
  const errore = useRicerca((s) => s.errore)
  if (passi.length === 0) return null
  return (
    <section className="pannello ric-avanzamento">
      <h2>
        <Icona nome="orologio" /> A che punto sono
      </h2>
      <ol className="passi-ricerca">
        {passi.map((p) => (
          <li key={p.id} className={`passo-${p.stato}`}>
            <span className="passo-icona" aria-hidden>
              {ICONA_PASSO[p.stato]}
            </span>
            <span>
              <strong>{p.titolo}</strong>
              {p.dettaglio && <small>{p.dettaglio}</small>}
            </span>
          </li>
        ))}
      </ol>
      {errore && <p className="allerta allerta-errore">{errore}</p>}
    </section>
  )
}

function ProvaCataloghi() {
  const [esiti, setEsiti] = useState<EsitoProva[] | null>(null)
  const [prova, setProva] = useState(false)
  return (
    <Fisarmonica
      titolo="Prova gli archivi"
      icona="scudo"
      riassunto={esiti ? `${esiti.filter((e) => e.ok).length} di ${esiti.length} rispondono` : 'Vedi se gli archivi rispondono da qui'}
      azioni={
        <Info>
          Gli archivi di articoli li consulto direttamente da questo browser, gratis. Con una prova veloce vedi se rispondono (la rete della scuola, un
          proxy o un'estensione potrebbero bloccarli).
        </Info>
      }
    >
      <button
        type="button"
        className="bottone bottone-secondario"
        disabled={prova}
        onClick={async () => {
          setProva(true)
          setEsiti(await provaCataloghi())
          setProva(false)
        }}
      >
        <Icona nome="aggiorna" />
        {prova ? 'Provo…' : 'Fai una prova'}
      </button>
      {esiti && (
        <ul className="elenco-semplice prova-cataloghi">
          {esiti.map((e) => (
            <li key={e.catalogo} className={e.ok ? 'nota-ok' : 'testo-errore'}>
              <strong>{CATALOGHI.find((c) => c.key === e.catalogo)?.nome}</strong>: {e.messaggio}
            </li>
          ))}
        </ul>
      )}
    </Fisarmonica>
  )
}

function CartaCandidato({ c }: { c: Candidato }) {
  const decidi = useStudio((s) => s.decidiCandidato)
  const aggiorna = useStudio((s) => s.aggiornaCandidato)
  const f = c.fonte
  const [aperto, setAperto] = useState(false)
  const decisione = c.consiglio?.decisione

  return (
    <li className={`candidato ric-carta ${decisione === 'scartare' ? 'candidato-sconsigliato' : decisione === 'tenere' ? 'ric-carta-consigliata' : ''}`}>
      <div className="candidato-testa">
        {c.consiglio && (
          <span className={`consiglio consiglio-${c.consiglio.decisione}`}>
            {c.consiglio.decisione === 'tenere' ? `consigliata · quanto c'entra: ${c.consiglio.pertinenza}` : 'sconsigliata'}
          </span>
        )}
        <span className="pastiglia-origine">{ETICHETTA_ORIGINE[f.origine]}</span>
        <span className={`verifica verifica-${c.verifica}`}>
          <Icona nome="spunta" dimensione={12} />
          {c.verifica === 'catalogo' ? "dati presi dall'archivio" : 'link controllato'}
        </span>
        {f.oaUrl && <span className="verifica">gratis online</span>}
      </div>
      <h3 className="candidato-titolo">
        {f.url ? (
          <a href={f.url} target="_blank" rel="noopener noreferrer">
            {f.titolo}
          </a>
        ) : (
          f.titolo
        )}
      </h3>
      <p className="nota ric-autori">
        {autoreAnno(f, false)}
        {f.rivista ? ` · ${f.rivista}` : ''}
        {f.doi ? ` · DOI ${f.doi}` : ''}
      </p>
      {c.consiglio && (
        <div className="ric-motivo">
          <Ritratto k="bibliotecario" dimensione={28} />
          <p className="motivo">{c.consiglio.motivo}</p>
        </div>
      )}
      {f.estratti.length > 0 && (
        <ul className="estratti-candidato">
          {f.estratti.map((e, i) => (
            <li key={i}>
              <Esito esito={e.esito} /> «{e.testo}»
            </li>
          ))}
        </ul>
      )}
      {f.abstract && (
        <>
          <button type="button" className="link ric-leggi" onClick={() => setAperto((a) => !a)} aria-expanded={aperto}>
            <Icona nome={aperto ? 'su' : 'giu'} dimensione={14} />
            {aperto ? 'Nascondi il riassunto' : 'Leggi il riassunto'}
          </button>
          {aperto && <p className="abstract">{f.abstract}</p>}
        </>
      )}
      <div className="candidato-piede">
        <TemiChips temi={f.temi} onCambia={(temi) => aggiorna(c.id, { temi })} />
        <span className="azioni-candidato">
          <button type="button" className="bottone bottone-vuoto" onClick={() => decidi(c.id, false)}>
            <Icona nome="chiudi" />
            Scarta
          </button>
          <button type="button" className="bottone ric-tieni" onClick={() => decidi(c.id, true)}>
            <Icona nome="spunta" />
            Tienila
          </button>
        </span>
      </div>
    </li>
  )
}

export function InAttesa() {
  const inAttesa = useStudio((s) => s.progetto.inAttesa)
  const decidi = useStudio((s) => s.decidiCandidato)
  const [filtro, setFiltro] = useState<'consigliati' | 'tutti'>('tutti')
  const visibili = useMemo(
    () => (filtro === 'consigliati' ? inAttesa.filter((c) => c.consiglio?.decisione === 'tenere') : inAttesa),
    [inAttesa, filtro],
  )
  const consigliati = useMemo(() => inAttesa.filter((c) => c.consiglio?.decisione === 'tenere'), [inAttesa])
  const sconsigliati = useMemo(() => inAttesa.filter((c) => c.consiglio?.decisione === 'scartare'), [inAttesa])

  return (
    <section className="pannello ric-attesa">
      <div className="pannello-testa">
        <h2>
          <Icona nome="cassetto" /> Da controllare ({inAttesa.length})
          <Info>Una fonte entra in biblioteca solo se decidi di tenerla. Per ognuna il Bibliotecario ti scrive perché te la consiglia o no.</Info>
        </h2>
        {inAttesa.length > 0 && (
          <label>
            <span className="sr">Mostra</span>
            <select className="campo campo-stretto" value={filtro} onChange={(e) => setFiltro(e.target.value as 'tutti' | 'consigliati')}>
              <option value="tutti">tutti</option>
              <option value="consigliati">solo consigliati</option>
            </select>
          </label>
        )}
      </div>
      {inAttesa.length === 0 ? (
        <div className="ric-vuoto">
          <span className="ric-vuoto-icona" aria-hidden>
            <Icona nome="cassetto" dimensione={28} />
          </span>
          <p className="nota">Non c'è niente da controllare. Una fonte entra in biblioteca solo se decidi di tenerla.</p>
        </div>
      ) : (
        <>
          {(consigliati.length > 0 || sconsigliati.length > 0) && (
            <div className="riga-editor ric-tutti">
              {consigliati.length > 0 && (
                <Conferma
                  classe="bottone bottone-secondario"
                  etichetta={
                    <>
                      <Icona nome="spunta" />
                      {`Tieni i ${consigliati.length} consigliati`}
                    </>
                  }
                  domanda={`Metto in biblioteca ${consigliati.length} fonti?`}
                  conferma="Sì, tienile"
                  onConferma={() => consigliati.forEach((c) => decidi(c.id, true))}
                />
              )}
              {sconsigliati.length > 0 && (
                <Conferma
                  classe="bottone bottone-vuoto"
                  etichetta={`Scarta i ${sconsigliati.length} sconsigliati`}
                  domanda={`Scarto ${sconsigliati.length} risultati?`}
                  conferma="Scarta"
                  pericolosa
                  onConferma={() => sconsigliati.forEach((c) => decidi(c.id, false))}
                />
              )}
            </div>
          )}
          <ul className="elenco-candidati ric-carte">
            {visibili.map((c) => (
              <CartaCandidato key={c.id} c={c} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Storico() {
  const ricerche = useStudio((s) => s.progetto.ricerche)
  if (ricerche.length === 0) return null
  return (
    <Fisarmonica titolo="Ricerche fatte" icona="orologio" riassunto={`${ricerche.length} ${ricerche.length === 1 ? 'ricerca' : 'ricerche'} · l'ultima il ${new Date(ricerche[0].data).toLocaleDateString('it-IT')}`}>
      <ul className="storico">
        {ricerche.map((r) => (
          <li key={r.id}>
            <details>
              <summary>
                {new Date(r.data).toLocaleDateString('it-IT')} — {r.domanda} <small>({r.trovati} risultati)</small>
              </summary>
              {r.query.length > 0 && <p className="nota">Cosa ho cercato: {r.query.join(' · ')}</p>}
              {Object.keys(r.perCatalogo).length > 0 && (
                <p className="nota">
                  Archivi: {Object.entries(r.perCatalogo).map(([k, v]) => `${k} ${typeof v === 'number' ? v : `(${v})`}`).join(' · ')}
                </p>
              )}
              {r.esclusi.length > 0 && (
                <>
                  <p>
                    <strong>Cosa ho scartato e perché</strong>
                  </p>
                  <ul className="elenco-semplice">
                    {r.esclusi.map((e, i) => (
                      <li key={i}>
                        {e.titolo} {e.url && <small className="url-escluso">{e.url}</small>} — {e.motivo}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </details>
          </li>
        ))}
      </ul>
    </Fisarmonica>
  )
}

export function Ricerca() {
  return (
    <div className="ricerca-pagina">
      <div className="ric-colonna">
        <Modulo />
        <Avanzamento />
        <ProvaCataloghi />
        <Storico />
      </div>
      <InAttesa />
    </div>
  )
}
