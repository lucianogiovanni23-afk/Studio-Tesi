import { costoStimato } from '../agents/api'
import { useMemo, useState } from 'react'
import {
  accettaPropostaRevisione,
  controlloConRevisore,
  controlloSoloCodice,
  proponiPerOsservazione,
  stimaControllo,
  stimaOsservazione,
} from '../agents/revisore'
import { Conferma } from '../components/Conferma'
import { esportaWord } from '../io/esportaWord'
import { TestoCitato } from '../components/TestoCitato'
import { bibliografia } from '../domain/bibliografia'
import { useStudio } from '../store'
import type { Osservazione, PropostaRevisione, TipoRilievo } from '../types'

type Scheda = 'osservazioni' | 'controllo' | 'bibliografia' | 'word'

function useEtichettaSezione() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  return (capId: string | null, sezId: string | null): string => {
    const i = capitoli.findIndex((c) => c.id === capId)
    if (i < 0) return 'tutta la tesi'
    const j = capitoli[i].sezioni.findIndex((s) => s.id === sezId)
    return j < 0 ? `capitolo ${i + 1}` : `${i + 1}.${j + 1} ${capitoli[i].sezioni[j].titolo}`
  }
}

// ---------------------------------------------------------------------------
// Osservazioni del relatore
// ---------------------------------------------------------------------------

function CartaProposta({ o, p }: { o: Osservazione; p: PropostaRevisione }) {
  const rifiuta = useStudio((s) => s.aggiornaPropostaRevisione)
  const etichetta = useEtichettaSezione()
  const citazioni = useStudio(
    (s) => s.progetto.capitoli.find((c) => c.id === p.capitoloId)?.sezioni.find((x) => x.id === p.sezioneId)?.citazioni,
  )
  const apri = useStudio((s) => s.apriSezione)
  return (
    <li className={`proposta-rev stato-prop-${p.stato}`}>
      <div className="proposta-rev-testa">
        <button type="button" className="link" onClick={() => apri(p.capitoloId, p.sezioneId)}>
          {etichetta(p.capitoloId, p.sezioneId)}
        </button>
        <span className="pastiglia-origine">{p.tipo === 'modifica' ? 'modifica di un paragrafo' : 'consiglio'}</span>
        {p.stato !== 'in_attesa' && <span className={`consiglio consiglio-${p.stato === 'accettata' ? 'tenere' : 'scartare'}`}>{p.stato}</span>}
      </div>
      <p className="motivo">{p.motivo}</p>
      {p.tipo === 'modifica' ? (
        <div className="prima-dopo">
          <div>
            <span className="etichetta">Prima</span>
            <TestoCitato testo={p.originale} citazioni={citazioni ?? []} classe="testo-prima" />
          </div>
          <div>
            <span className="etichetta">Dopo</span>
            <TestoCitato testo={p.proposta} citazioni={citazioni ?? []} classe="testo-dopo" />
          </div>
        </div>
      ) : (
        <p className="consiglio-testo">{p.proposta}</p>
      )}
      {p.avviso && <p className="allerta">{p.avviso}</p>}
      {p.stato === 'in_attesa' && (
        <div className="riga-editor">
          <button type="button" className="bottone bottone-vuoto" onClick={() => rifiuta(o.id, p.id, { stato: 'rifiutata' })}>
            Rifiuta
          </button>
          <button type="button" className="bottone bottone-primario" onClick={() => accettaPropostaRevisione(o.id, p.id)}>
            {p.tipo === 'modifica' ? 'Usa la modifica' : 'Ne terrò conto'}
          </button>
        </div>
      )}
    </li>
  )
}

export function CartaOsservazione({ o }: { o: Osservazione }) {
  const aggiorna = useStudio((s) => s.aggiornaOsservazione)
  const rimuovi = useStudio((s) => s.rimuoviOsservazione)
  const etichetta = useEtichettaSezione()
  const [lavoro, setLavoro] = useState(false)
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)
  const stima = stimaOsservazione(o.capitoloId)
  const daDecidere = o.proposte.filter((p) => p.stato === 'in_attesa').length

  return (
    <li className={`osservazione oss-${o.stato}`}>
      <div className="pannello-testa">
        <span className="nota">
          {new Date(o.data).toLocaleDateString('it-IT')} · {etichetta(o.capitoloId, null)} · <strong>{o.stato}</strong>
          {daDecidere > 0 && ` · ${daDecidere} proposte da guardare`}
        </span>
        <span className="riga-editor">
          <button type="button" className="bottone bottone-piccolo bottone-vuoto" onClick={() => aggiorna(o.id, { stato: o.stato === 'aperta' ? 'risolta' : 'aperta' })}>
            {o.stato === 'aperta' ? 'Segna come risolta' : 'Riapri'}
          </button>
          <Conferma classe="icona" etichetta="✕" domanda="Cancello questa nota?" conferma="Elimina" pericolosa onConferma={() => rimuovi(o.id)} />
        </span>
      </div>
      <blockquote className="testo-osservazione">{o.testo}</blockquote>
      {o.lettura && (
        <p className="nota">
          <strong>Come la capisce il revisore:</strong> {o.lettura}
        </p>
      )}
      {lavoro ? (
        <p className="in-corso">Il revisore sta preparando le proposte…</p>
      ) : (
        o.stato === 'aperta' && (
          <Conferma
            classe={o.proposte.length ? 'bottone bottone-piccolo' : 'bottone bottone-primario'}
            etichetta={o.proposte.length ? 'Chiedi nuove proposte' : 'Chiedi al revisore'}
            domanda={`${costoStimato(stima)}${o.proposte.length ? '; le proposte di adesso verranno sostituite' : ''}. Procedo?`}
            conferma="Procedi"
            onConferma={async () => {
              setLavoro(true)
              setMessaggio(null)
              try {
                const { scartate } = await proponiPerOsservazione(o.id)
                if (scartate) setMessaggio({ tono: 'ok', testo: `${scartate} ${scartate === 1 ? 'proposta scartata' : 'proposte scartate'} perché parlavano di un paragrafo che nel testo non c'è.` })
              } catch (err) {
                setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Qualcosa è andato storto.' })
              } finally {
                setLavoro(false)
              }
            }}
          />
        )
      )}
      {messaggio && <p className={messaggio.tono === 'ok' ? 'nota' : 'allerta allerta-errore'}>{messaggio.testo}</p>}
      {o.proposte.length > 0 && (
        <ul className="elenco-proposte">
          {o.proposte.map((p) => (
            <CartaProposta key={p.id} o={o} p={p} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Osservazioni() {
  const osservazioni = useStudio((s) => s.progetto.osservazioni)
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const aggiungi = useStudio((s) => s.aggiungiOsservazione)
  const [testo, setTesto] = useState('')
  const [capitolo, setCapitolo] = useState<string>('')
  const ordinate = useMemo(() => [...osservazioni].sort((a, b) => Number(a.stato === 'risolta') - Number(b.stato === 'risolta')), [osservazioni])

  return (
    <div className="colonna-unica">
      <section className="pannello">
        <h2>Nuova nota del relatore</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!testo.trim()) return
            aggiungi(testo.trim(), capitolo || null)
            setTesto('')
          }}
        >
          <label className="campo-blocco">
            <span className="etichetta">Nota</span>
            <textarea className="campo" rows={4} value={testo} placeholder="Incolla qui la nota del relatore" onChange={(e) => setTesto(e.target.value)} />
          </label>
          <label className="campo-blocco">
            <span className="etichetta">Di cosa parla</span>
            <select className="campo" value={capitolo} onChange={(e) => setCapitolo(e.target.value)}>
              <option value="">tutta la tesi</option>
              {capitoli.map((c, i) => (
                <option key={c.id} value={c.id}>
                  Capitolo {i + 1}: {c.titolo}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="bottone bottone-primario" disabled={!testo.trim()}>
            Aggiungi la nota
          </button>
        </form>
      </section>
      <section className="pannello">
        <h2>Note del relatore ({osservazioni.filter((o) => o.stato === 'aperta').length} da sistemare)</h2>
        {ordinate.length === 0 ? (
          <p className="nota">Ancora nessuna nota. Quando il relatore ti manda dei commenti, incollali qui: il revisore ti propone cosa cambiare e tu decidi, una cosa alla volta.</p>
        ) : (
          <ul className="elenco-osservazioni">
            {ordinate.map((o) => (
              <CartaOsservazione key={o.id} o={o} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controllo della tesi
// ---------------------------------------------------------------------------

const NOME_TIPO: Record<TipoRilievo, string> = {
  terminologia: 'Termini',
  ripetizione: 'Ripetizioni',
  materia: 'Fuori tema',
  coerenza: 'Contraddizioni',
  citazioni: 'Citazioni',
  stile_ia: 'Frasi da IA',
}

function Controllo() {
  const controllo = useStudio((s) => s.progetto.controllo)
  const apri = useStudio((s) => s.apriSezione)
  const etichetta = useEtichettaSezione()
  const [filtro, setFiltro] = useState<TipoRilievo | ''>('')
  const [lavoro, setLavoro] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const stima = stimaControllo()
  const rilievi = useMemo(() => (controllo?.rilievi ?? []).filter((r) => !filtro || r.tipo === filtro), [controllo, filtro])
  const conteggi = useMemo(() => {
    const c: Partial<Record<TipoRilievo, number>> = {}
    for (const r of controllo?.rilievi ?? []) c[r.tipo] = (c[r.tipo] ?? 0) + 1
    return c
  }, [controllo])

  return (
    <section className="pannello">
      <h2>Controlla tutta la tesi</h2>
      <p className="nota">
        Il controllo veloce è gratis: trova termini scritti diversi dal glossario, frasi ripetute, parole che portano fuori tema
        e citazioni rosse. Il revisore invece legge tutto e guarda se i capitoli si contraddicono o escono dal tema. Ogni cosa che
        segnala deve citare una frase vera della tesi, se no la scarto.
      </p>
      <div className="riga-editor">
        <button type="button" className="bottone" onClick={controlloSoloCodice}>
          Controllo veloce (gratis)
        </button>
        {lavoro ? (
          <span className="in-corso">Il revisore sta leggendo tutta la tesi…</span>
        ) : (
          <Conferma
            classe="bottone bottone-primario"
            etichetta="Fallo leggere al revisore"
            domanda={`${costoStimato(stima)}. Procedo?`}
            conferma="Procedi"
            onConferma={async () => {
              setLavoro(true)
              setErrore(null)
              try {
                await controlloConRevisore()
              } catch (err) {
                setErrore(err instanceof Error ? err.message : 'Qualcosa è andato storto.')
              } finally {
                setLavoro(false)
              }
            }}
          />
        )}
      </div>
      {errore && <p className="allerta allerta-errore">{errore}</p>}

      {controllo && (
        <>
          <p className="nota">
            Ultimo controllo: {new Date(controllo.data).toLocaleString('it-IT')} · {controllo.conRevisore ? 'veloce + revisore' : 'solo veloce'} ·{' '}
            {controllo.rilievi.length} cose da guardare
            {controllo.scartati > 0 && ` · ${controllo.scartati} segnalazioni del revisore tolte perché citavano frasi che non ci sono`}
          </p>
          <div className="filtri-tipo" role="group" aria-label="Filtra per tipo">
            <button type="button" className={`tema ${filtro === '' ? 'tema-attivo' : 'tema-spento'}`} onClick={() => setFiltro('')}>
              tutti ({controllo.rilievi.length})
            </button>
            {(Object.keys(NOME_TIPO) as TipoRilievo[]).map((t) => (
              <button key={t} type="button" className={`tema ${filtro === t ? 'tema-attivo' : 'tema-spento'}`} onClick={() => setFiltro(t)}>
                {NOME_TIPO[t]} ({conteggi[t] ?? 0})
              </button>
            ))}
          </div>
          {rilievi.length === 0 ? (
            <p className="nota nota-ok">Niente da segnalare{filtro ? ' per questo tipo' : ''}.</p>
          ) : (
            <ul className="elenco-rilievi">
              {rilievi.map((r) => (
                <li key={r.id} className={`rilievo rilievo-${r.tipo}`}>
                  <div className="candidato-testa">
                    <span className="pastiglia-origine">{NOME_TIPO[r.tipo]}</span>
                    <span className="verifica">{r.origine === 'codice' ? 'controllo veloce' : 'revisore'}</span>
                    {r.capitoloId && (
                      <button type="button" className="link" onClick={() => apri(r.capitoloId!, r.sezioneId)}>
                        {etichetta(r.capitoloId, r.sezioneId)}
                      </button>
                    )}
                  </div>
                  <blockquote className="estratto">«{r.passo}»</blockquote>
                  <p>{r.problema}</p>
                  <p className="nota">
                    <strong>Cosa fare:</strong> {r.suggerimento}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Bibliografia
// ---------------------------------------------------------------------------

function Bibliografia() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const fonti = useStudio((s) => s.progetto.fonti)
  const stile = useStudio((s) => s.progetto.stileCitazione)
  const segna = useStudio((s) => s.segnaFontiCitate)
  const vai = useStudio((s) => s.vai)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const biblio = useMemo(() => bibliografia(capitoli, fonti, stile), [capitoli, fonti, stile])
  const testo = [
    'Bibliografia',
    '',
    ...biblio.voci.map((v) => v.testo),
    ...(biblio.corso.length ? ['', 'Materiale del corso', '', ...biblio.corso] : []),
  ].join('\n')

  return (
    <section className="pannello">
      <div className="pannello-testa">
        <h2>Bibliografia</h2>
        <span className="nota">
          stile {stile === 'note' ? 'note a piè di pagina' : 'autore-anno'} ·{' '}
          <button type="button" className="link" onClick={() => vai('impostazioni')}>
            cambia
          </button>
        </span>
      </div>
      <p className="nota">La faccio con i dati veri delle fonti che citi nel testo (autori, anno, rivista, DOI), in ordine alfabetico.</p>
      {biblio.mancanti.length > 0 && <p className="allerta">Rimandi a fonti che non sono in biblioteca: {biblio.mancanti.join(', ')}.</p>}
      {biblio.voci.length === 0 ? (
        <p className="nota">Nel testo non citi ancora nessuna fonte.</p>
      ) : (
        <ol className="bibliografia">
          {biblio.voci.map((v) => (
            <li key={v.fonte.id}>{v.testo}</li>
          ))}
        </ol>
      )}
      {biblio.corso.length > 0 && (
        <>
          <h3>Materiale del corso che citi</h3>
          <ul className="elenco-semplice">
            {biblio.corso.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
      <div className="riga-editor">
        <button
          type="button"
          className="bottone"
          disabled={biblio.voci.length === 0}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(testo)
              setMessaggio('Bibliografia copiata.')
            } catch {
              setMessaggio('Il browser non mi ha fatto copiare: usa "Scarica".')
            }
          }}
        >
          Copia la bibliografia
        </button>
        <button
          type="button"
          className="bottone bottone-vuoto"
          disabled={biblio.voci.length === 0}
          onClick={() => {
            const url = URL.createObjectURL(new Blob([testo], { type: 'text/plain;charset=utf-8' }))
            const a = document.createElement('a')
            a.href = url
            a.download = 'bibliografia.txt'
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 5000)
          }}
        >
          Scarica (.txt)
        </button>
        <button
          type="button"
          className="bottone bottone-vuoto"
          disabled={biblio.voci.length === 0}
          onClick={() => setMessaggio(`${segna()} fonti segnate come usate, con i capitoli in cui compaiono.`)}
        >
          Segna le fonti come usate
        </button>
      </div>
      {messaggio && (
        <p className="nota nota-ok" role="status">
          {messaggio}
        </p>
      )}
      {biblio.nonCitate.length > 0 && (
        <details>
          <summary>Fonti che non hai citato ({biblio.nonCitate.length})</summary>
          <ul className="elenco-semplice">
            {biblio.nonCitate.map((f) => (
              <li key={f.id}>
                [F{f.numero}] {f.titolo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function EsportaWord() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const stile = useStudio((s) => s.progetto.stileCitazione)
  const [capitolo, setCapitolo] = useState('')
  const [conBibliografia, setConBibliografia] = useState(true)
  const [conFrontespizio, setConFrontespizio] = useState(true)
  const [lavoro, setLavoro] = useState(false)
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)

  return (
    <section className="pannello">
      <h2>Scarica in Word</h2>
      <p className="nota">
        Un file Word da mandare al relatore: titoli già pronti per l'indice automatico, Times New Roman 12, interlinea 1,5,
        citazioni nello stile che hai scelto ({stile === 'note' ? 'note a piè di pagina' : 'autore-anno nel testo'}) e bibliografia in fondo.
      </p>
      <label className="campo-blocco">
        <span className="etichetta">Cosa vuoi scaricare</span>
        <select className="campo" value={capitolo} onChange={(e) => setCapitolo(e.target.value)}>
          <option value="">tutta la tesi</option>
          {capitoli.map((c, i) => (
            <option key={c.id} value={c.id}>
              Capitolo {i + 1}: {c.titolo}
            </option>
          ))}
        </select>
      </label>
      <label className="interruttore">
        <input type="checkbox" checked={conFrontespizio} onChange={(e) => setConFrontespizio(e.target.checked)} />
        <span>Pagina con il titolo</span>
      </label>
      <label className="interruttore">
        <input type="checkbox" checked={conBibliografia} onChange={(e) => setConBibliografia(e.target.checked)} />
        <span>Bibliografia in fondo</span>
      </label>
      <button
        type="button"
        className="bottone bottone-primario"
        disabled={lavoro}
        onClick={async () => {
          setLavoro(true)
          setMessaggio(null)
          try {
            const nome = await esportaWord({ capitoloId: capitolo || null, conBibliografia, conFrontespizio })
            setMessaggio({ tono: 'ok', testo: `Scaricato "${nome}".` })
          } catch (err) {
            setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Non sono riuscito a creare il file.' })
          } finally {
            setLavoro(false)
          }
        }}
      >
        {lavoro ? 'Preparo il file…' : 'Scarica il file Word'}
      </button>
      {messaggio && (
        <p className={messaggio.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'} role="status">
          {messaggio.testo}
        </p>
      )}
    </section>
  )
}

export function Revisione() {
  const [scheda, setScheda] = useState<Scheda>('osservazioni')
  const aperte = useStudio((s) => s.progetto.osservazioni.filter((o) => o.stato === 'aperta').length)
  const voci: { id: Scheda; nome: string }[] = [
    { id: 'osservazioni', nome: `Note del relatore${aperte ? ` (${aperte})` : ''}` },
    { id: 'controllo', nome: 'Controlla la tesi' },
    { id: 'bibliografia', nome: 'Bibliografia' },
    { id: 'word', nome: 'Scarica in Word' },
  ]
  return (
    <div className="colonna-unica">
      <div className="schede-rev" role="tablist">
        {voci.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={scheda === v.id}
            className={`bottone ${scheda === v.id ? 'bottone-primario' : ''}`}
            onClick={() => setScheda(v.id)}
          >
            {v.nome}
          </button>
        ))}
      </div>
      {scheda === 'osservazioni' && <Osservazioni />}
      {scheda === 'controllo' && <Controllo />}
      {scheda === 'bibliografia' && <Bibliografia />}
      {scheda === 'word' && <EsportaWord />}
    </div>
  )
}
