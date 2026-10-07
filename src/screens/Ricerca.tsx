import { useMemo, useState } from 'react'
import { annullaRicerca, avviaRicerca, stimaRicerca, useRicerca, type OpzioniRicerca } from '../agents/bibliotecario'
import { CATALOGHI, provaCataloghi, type EsitoProva } from '../agents/cataloghi'
import { formattaDollari } from '../agents/costs'
import { Conferma } from '../components/Conferma'
import { Esito } from '../components/Esito'
import { TemiChips } from '../components/TemiChips'
import { ETICHETTA_ORIGINE, autoreAnno } from '../domain/bibliografia'
import { DOMINI_ISTITUZIONALI } from '../domain/dominio'
import { useStudio } from '../store'
import type { Candidato } from '../types'

const ICONA_PASSO = { attesa: '○', corso: '…', ok: '✓', avviso: '!', errore: '✕', saltato: '–' }

function Modulo() {
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const modelli = useStudio((s) => s.preferenze.modelli)
  const vai = useStudio((s) => s.vai)
  const inCorso = useRicerca((s) => s.inCorso)
  const [domanda, setDomanda] = useState('')
  const [opzioni, setOpzioni] = useState<OpzioniRicerca>({ cataloghi: true, istituzionali: true, web: true })
  const stima = useMemo(() => stimaRicerca(opzioni), [opzioni, modelli]) // eslint-disable-line react-hooks/exhaustive-deps

  const casella = (k: keyof OpzioniRicerca, testo: string, nota: string) => (
    <label className="interruttore">
      <input type="checkbox" checked={opzioni[k]} onChange={(e) => setOpzioni({ ...opzioni, [k]: e.target.checked })} disabled={inCorso} />
      <span>
        {testo}
        <small className="nota"> — {nota}</small>
      </span>
    </label>
  )

  return (
    <section className="pannello">
      <h2>Nuova ricerca</h2>
      <label className="campo-blocco">
        <span className="etichetta">Domanda di ricerca</span>
        <textarea
          className="campo"
          rows={3}
          value={domanda}
          placeholder="Per esempio: come varia la marginalità dei frantoi calabresi nelle annate di scarica?"
          onChange={(e) => setDomanda(e.target.value)}
          disabled={inCorso}
        />
      </label>
      {casella('cataloghi', 'Cataloghi accademici', 'OpenAlex, Crossref, Semantic Scholar; gratuiti, dal tuo browser')}
      {casella('istituzionali', 'Siti istituzionali', 'ISMEA, ISTAT, CREA-RICA, ARPACAL, Copernicus e altri')}
      {casella('web', 'Web generico', 'studi e rapporti anche in spagnolo e inglese')}

      {!haChiave ? (
        <p className="allerta">
          Serve la chiave API per il piano di ricerca e la selezione.{' '}
          <button type="button" className="link" onClick={() => vai('impostazioni')}>
            Impostazioni
          </button>
        </p>
      ) : inCorso ? (
        <div className="riga-editor">
          <span className="in-corso">Il Bibliotecario sta cercando…</span>
          <button type="button" className="bottone bottone-vuoto" onClick={annullaRicerca}>
            Ferma
          </button>
        </div>
      ) : (
        <Conferma
          classe="bottone bottone-primario"
          etichetta="Cerca"
          disabilitato={domanda.trim().length < 8 || !(opzioni.cataloghi || opzioni.istituzionali || opzioni.web)}
          domanda={`Costo stimato ${formattaDollari(stima.minimo)} – ${formattaDollari(stima.massimo)} (i cataloghi sono gratuiti). Procedo?`}
          conferma="Avvia la ricerca"
          onConferma={() => void avviaRicerca(domanda.trim(), opzioni)}
        />
      )}
      <details className="dettagli-piccoli">
        <summary>Siti istituzionali consultati</summary>
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
    <section className="pannello">
      <h2>Avanzamento</h2>
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
    <section className="pannello">
      <h2>Cataloghi dal tuo browser</h2>
      <p className="nota">
        I cataloghi accademici si interrogano direttamente da questo browser, senza costi. Una prova veloce dice se
        rispondono (una rete scolastica, un proxy o un'estensione potrebbero bloccarli).
      </p>
      <button
        type="button"
        className="bottone"
        disabled={prova}
        onClick={async () => {
          setProva(true)
          setEsiti(await provaCataloghi())
          setProva(false)
        }}
      >
        {prova ? 'Provo…' : 'Prova i cataloghi'}
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
    </section>
  )
}

function CartaCandidato({ c }: { c: Candidato }) {
  const decidi = useStudio((s) => s.decidiCandidato)
  const aggiorna = useStudio((s) => s.aggiornaCandidato)
  const f = c.fonte
  const [aperto, setAperto] = useState(false)

  return (
    <li className={`candidato ${c.consiglio?.decisione === 'scartare' ? 'candidato-sconsigliato' : ''}`}>
      <div className="candidato-testa">
        <span className="pastiglia-origine">{ETICHETTA_ORIGINE[f.origine]}</span>
        <span className={`verifica verifica-${c.verifica}`}>
          {c.verifica === 'catalogo' ? 'metadati dal catalogo' : 'URL verificato fra i risultati'}
        </span>
        {f.oaUrl && <span className="verifica">open access</span>}
        {c.consiglio && (
          <span className={`consiglio consiglio-${c.consiglio.decisione}`}>
            {c.consiglio.decisione === 'tenere' ? `consigliata · pertinenza ${c.consiglio.pertinenza}` : 'sconsigliata'}
          </span>
        )}
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
      <p className="nota">
        {autoreAnno(f, false)}
        {f.rivista ? ` · ${f.rivista}` : ''}
        {f.doi ? ` · DOI ${f.doi}` : ''}
      </p>
      {c.consiglio && <p className="motivo">{c.consiglio.motivo}</p>}
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
          <button type="button" className="link" onClick={() => setAperto((a) => !a)} aria-expanded={aperto}>
            {aperto ? 'Nascondi abstract' : 'Mostra abstract'}
          </button>
          {aperto && <p className="abstract">{f.abstract}</p>}
        </>
      )}
      <div className="candidato-piede">
        <TemiChips temi={f.temi} onCambia={(temi) => aggiorna(c.id, { temi })} />
        <span className="azioni-candidato">
          <button type="button" className="bottone bottone-vuoto" onClick={() => decidi(c.id, false)}>
            Scarta
          </button>
          <button type="button" className="bottone bottone-primario" onClick={() => decidi(c.id, true)}>
            Approva
          </button>
        </span>
      </div>
    </li>
  )
}

function InAttesa() {
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
    <section className="pannello">
      <div className="pannello-testa">
        <h2>Da approvare ({inAttesa.length})</h2>
        <label>
          <span className="sr">Mostra</span>
          <select className="campo campo-stretto" value={filtro} onChange={(e) => setFiltro(e.target.value as 'tutti' | 'consigliati')}>
            <option value="tutti">tutti</option>
            <option value="consigliati">solo consigliati</option>
          </select>
        </label>
      </div>
      {inAttesa.length === 0 ? (
        <p className="nota">Nessun risultato in attesa. Ogni fonte entra in biblioteca solo dopo la tua approvazione.</p>
      ) : (
        <>
          <div className="riga-editor">
            {consigliati.length > 0 && (
              <Conferma
                classe="bottone"
                etichetta={`Approva i ${consigliati.length} consigliati`}
                domanda={`Mettere in biblioteca ${consigliati.length} fonti?`}
                conferma="Approva"
                onConferma={() => consigliati.forEach((c) => decidi(c.id, true))}
              />
            )}
            {sconsigliati.length > 0 && (
              <Conferma
                classe="bottone bottone-vuoto"
                etichetta={`Scarta i ${sconsigliati.length} sconsigliati`}
                domanda={`Scartare ${sconsigliati.length} risultati?`}
                conferma="Scarta"
                pericolosa
                onConferma={() => sconsigliati.forEach((c) => decidi(c.id, false))}
              />
            )}
          </div>
          <ul className="elenco-candidati">
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
    <section className="pannello">
      <h2>Ricerche fatte</h2>
      <ul className="storico">
        {ricerche.map((r) => (
          <li key={r.id}>
            <details>
              <summary>
                {new Date(r.data).toLocaleDateString('it-IT')} — {r.domanda} <small>({r.trovati} risultati)</small>
              </summary>
              {r.query.length > 0 && <p className="nota">Query: {r.query.join(' · ')}</p>}
              {Object.keys(r.perCatalogo).length > 0 && (
                <p className="nota">
                  Cataloghi: {Object.entries(r.perCatalogo).map(([k, v]) => `${k} ${typeof v === 'number' ? v : `(${v})`}`).join(' · ')}
                </p>
              )}
              {r.esclusi.length > 0 && (
                <>
                  <p>
                    <strong>Esclusi e segnalazioni</strong>
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
    </section>
  )
}

export function Ricerca() {
  return (
    <div className="griglia-due">
      <div>
        <Modulo />
        <Avanzamento />
        <ProvaCataloghi />
        <Storico />
      </div>
      <div>
        <InAttesa />
      </div>
    </div>
  )
}
