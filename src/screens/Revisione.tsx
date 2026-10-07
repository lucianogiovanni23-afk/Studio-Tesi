import { useMemo, useState } from 'react'
import { formattaDollari } from '../agents/costs'
import {
  accettaPropostaRevisione,
  controlloConRevisore,
  controlloSoloCodice,
  proponiPerOsservazione,
  stimaControllo,
  stimaOsservazione,
} from '../agents/revisore'
import { Conferma } from '../components/Conferma'
import { TestoCitato } from '../components/TestoCitato'
import { bibliografia } from '../domain/bibliografia'
import { useStudio } from '../store'
import type { Osservazione, PropostaRevisione, TipoRilievo } from '../types'

type Scheda = 'osservazioni' | 'controllo' | 'bibliografia'

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
            {p.tipo === 'modifica' ? 'Accetta e applica' : 'Ne terrò conto'}
          </button>
        </div>
      )}
    </li>
  )
}

function CartaOsservazione({ o }: { o: Osservazione }) {
  const aggiorna = useStudio((s) => s.aggiornaOsservazione)
  const rimuovi = useStudio((s) => s.rimuoviOsservazione)
  const haChiave = useStudio((s) => s.apiKey.length > 0)
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
          {daDecidere > 0 && ` · ${daDecidere} proposte da decidere`}
        </span>
        <span className="riga-editor">
          <button type="button" className="bottone bottone-piccolo bottone-vuoto" onClick={() => aggiorna(o.id, { stato: o.stato === 'aperta' ? 'risolta' : 'aperta' })}>
            {o.stato === 'aperta' ? 'Segna come risolta' : 'Riapri'}
          </button>
          <Conferma classe="icona" etichetta="✕" domanda="Eliminare l'osservazione?" conferma="Elimina" pericolosa onConferma={() => rimuovi(o.id)} />
        </span>
      </div>
      <blockquote className="testo-osservazione">{o.testo}</blockquote>
      {o.lettura && (
        <p className="nota">
          <strong>Lettura del Revisore:</strong> {o.lettura}
        </p>
      )}
      {lavoro ? (
        <p className="in-corso">Il Revisore sta preparando le proposte…</p>
      ) : (
        o.stato === 'aperta' && (
          <Conferma
            classe={o.proposte.length ? 'bottone bottone-piccolo' : 'bottone bottone-primario'}
            etichetta={o.proposte.length ? 'Chiedi nuove proposte' : 'Chiedi le proposte al Revisore'}
            disabilitato={!haChiave}
            domanda={`Costo stimato ${formattaDollari(stima.minimo)} – ${formattaDollari(stima.massimo)}${o.proposte.length ? '; le proposte attuali saranno sostituite' : ''}. Procedo?`}
            conferma="Procedi"
            onConferma={async () => {
              setLavoro(true)
              setMessaggio(null)
              try {
                const { scartate } = await proponiPerOsservazione(o.id)
                if (scartate) setMessaggio({ tono: 'ok', testo: `${scartate} ${scartate === 1 ? 'proposta scartata' : 'proposte scartate'} perché il paragrafo citato non c'è nel testo.` })
              } catch (err) {
                setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Errore.' })
              } finally {
                setLavoro(false)
              }
            }}
          />
        )
      )}
      {!haChiave && <p className="nota">Per le proposte serve la chiave API.</p>}
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
        <h2>Nuova osservazione del relatore</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!testo.trim()) return
            aggiungi(testo.trim(), capitolo || null)
            setTesto('')
          }}
        >
          <label className="campo-blocco">
            <span className="etichetta">Osservazione</span>
            <textarea className="campo" rows={4} value={testo} placeholder="Incolla qui il commento del relatore" onChange={(e) => setTesto(e.target.value)} />
          </label>
          <label className="campo-blocco">
            <span className="etichetta">Si riferisce a</span>
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
            Aggiungi l'osservazione
          </button>
        </form>
      </section>
      <section className="pannello">
        <h2>Osservazioni ({osservazioni.filter((o) => o.stato === 'aperta').length} aperte)</h2>
        {ordinate.length === 0 ? (
          <p className="nota">Nessuna osservazione. Quando il relatore ti manda commenti, incollali qui: il Revisore propone modifiche puntuali e decidi tu, una per una.</p>
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
  materia: 'Vincolo di materia',
  coerenza: 'Coerenza',
  citazioni: 'Citazioni',
}

function Controllo() {
  const controllo = useStudio((s) => s.progetto.controllo)
  const haChiave = useStudio((s) => s.apiKey.length > 0)
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
      <h2>Controllo di tutta la tesi</h2>
      <p className="nota">
        Il controllo in codice è gratuito: varianti del glossario, frasi ripetute, parole spia di sconfinamenti, citazioni rosse.
        Il Revisore aggiunge un giudizio di merito su coerenza fra capitoli, punti di vista e materia; ogni suo rilievo deve citare
        un passo che esiste davvero nella tesi, altrimenti viene scartato.
      </p>
      <div className="riga-editor">
        <button type="button" className="bottone" onClick={controlloSoloCodice}>
          Controllo in codice (gratis)
        </button>
        {lavoro ? (
          <span className="in-corso">Il Revisore sta leggendo tutta la tesi…</span>
        ) : (
          <Conferma
            classe="bottone bottone-primario"
            etichetta="Controllo completo con il Revisore"
            disabilitato={!haChiave}
            domanda={`Costo stimato ${formattaDollari(stima.minimo)} – ${formattaDollari(stima.massimo)}. Procedo?`}
            conferma="Procedi"
            onConferma={async () => {
              setLavoro(true)
              setErrore(null)
              try {
                await controlloConRevisore()
              } catch (err) {
                setErrore(err instanceof Error ? err.message : 'Errore.')
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
            Ultimo controllo: {new Date(controllo.data).toLocaleString('it-IT')} · {controllo.conRevisore ? 'codice e Revisore' : 'solo codice'} ·{' '}
            {controllo.rilievi.length} rilievi
            {controllo.scartati > 0 && ` · ${controllo.scartati} rilievi del Revisore scartati perché il passo citato non c'è`}
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
            <p className="nota nota-ok">Nessun rilievo{filtro ? ' di questo tipo' : ''}.</p>
          ) : (
            <ul className="elenco-rilievi">
              {rilievi.map((r) => (
                <li key={r.id} className={`rilievo rilievo-${r.tipo}`}>
                  <div className="candidato-testa">
                    <span className="pastiglia-origine">{NOME_TIPO[r.tipo]}</span>
                    <span className="verifica">{r.origine === 'codice' ? 'controllo in codice' : 'Revisore'}</span>
                    {r.capitoloId && (
                      <button type="button" className="link" onClick={() => apri(r.capitoloId!, r.sezioneId)}>
                        {etichetta(r.capitoloId, r.sezioneId)}
                      </button>
                    )}
                  </div>
                  <blockquote className="estratto">«{r.passo}»</blockquote>
                  <p>{r.problema}</p>
                  <p className="nota">
                    <strong>Suggerimento:</strong> {r.suggerimento}
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
      <p className="nota">Generata dai metadati veri delle fonti citate nel testo (autori, anno, rivista, DOI), in ordine alfabetico.</p>
      {biblio.mancanti.length > 0 && <p className="allerta">Marcatori senza fonte in biblioteca: {biblio.mancanti.join(', ')}.</p>}
      {biblio.voci.length === 0 ? (
        <p className="nota">Nessuna fonte è ancora citata nel testo.</p>
      ) : (
        <ol className="bibliografia">
          {biblio.voci.map((v) => (
            <li key={v.fonte.id}>{v.testo}</li>
          ))}
        </ol>
      )}
      {biblio.corso.length > 0 && (
        <>
          <h3>Materiale del corso citato</h3>
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
              setMessaggio('Il browser non ha permesso la copia: usa "Scarica".')
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
          Segna come usate le fonti citate
        </button>
      </div>
      {messaggio && (
        <p className="nota nota-ok" role="status">
          {messaggio}
        </p>
      )}
      {biblio.nonCitate.length > 0 && (
        <details>
          <summary>Fonti in biblioteca non citate ({biblio.nonCitate.length})</summary>
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

export function Revisione() {
  const [scheda, setScheda] = useState<Scheda>('osservazioni')
  const aperte = useStudio((s) => s.progetto.osservazioni.filter((o) => o.stato === 'aperta').length)
  const voci: { id: Scheda; nome: string }[] = [
    { id: 'osservazioni', nome: `Osservazioni del relatore${aperte ? ` (${aperte})` : ''}` },
    { id: 'controllo', nome: 'Controllo della tesi' },
    { id: 'bibliografia', nome: 'Bibliografia' },
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
    </div>
  )
}
