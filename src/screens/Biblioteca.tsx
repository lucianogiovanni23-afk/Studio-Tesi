import { useMemo, useRef, useState } from 'react'
import { formattaDollari } from '../agents/costs'
import { preparaScheda, stimaScheda, testoPerScheda, verificaFrasi } from '../agents/schede'
import { logOk } from '../agents/supervisor'
import { Conferma } from '../components/Conferma'
import { Esito } from '../components/Esito'
import { TemiChips } from '../components/TemiChips'
import { ETICHETTA_ORIGINE, ETICHETTA_STATO_FONTE, autoreAnno } from '../domain/bibliografia'
import { ETICHETTA_TEMA } from '../domain/dominio'
import { useLargo } from '../hooks/useLayoutMode'
import { fonteDaPdf, testoDaPdf } from '../io/pdfPaper'
import { giàInBiblioteca, useStudio } from '../store'
import type { Fonte, SchedaLettura, StatoFonte, TemaFonte } from '../types'

type Vista = 'schede' | 'tabella'

function statoScheda(f: Fonte): string {
  if (!f.scheda) return 'senza scheda'
  return f.scheda.corretta ? 'scheda rivista da te' : 'scheda da rivedere'
}

// ---------------------------------------------------------------------------
// Scheda di lettura
// ---------------------------------------------------------------------------

function Scheda({ f }: { f: Fonte }) {
  const aggiorna = useStudio((s) => s.aggiornaFonte)
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const modello = useStudio((s) => s.preferenze.modelli.bibliotecario)
  const [lavoro, setLavoro] = useState(false)
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)
  const [nuovaFrase, setNuovaFrase] = useState('')
  const stima = useMemo(() => stimaScheda(f, modello), [f, modello])
  const base = testoPerScheda(f).base

  const prepara = async () => {
    setLavoro(true)
    setMessaggio(null)
    try {
      const { scartate } = await preparaScheda(f.id)
      setMessaggio({
        tono: 'ok',
        testo: scartate ? `Scheda pronta. ${scartate} frasi chiave scartate perché non ritrovate alla lettera nel testo.` : 'Scheda pronta.',
      })
    } catch (err) {
      setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Errore.' })
    } finally {
      setLavoro(false)
    }
  }

  const bottone = (
    <Conferma
      classe={f.scheda ? 'bottone bottone-vuoto bottone-piccolo' : 'bottone bottone-primario'}
      etichetta={f.scheda ? 'Rifai la scheda' : 'Prepara la scheda di lettura'}
      domanda={`${f.scheda ? 'La scheda attuale sarà sostituita. ' : ''}Costo stimato ${formattaDollari(stima.minimo)} – ${formattaDollari(stima.massimo)}. Procedo?`}
      conferma="Prepara"
      disabilitato={!haChiave || lavoro}
      onConferma={() => void prepara()}
    />
  )

  const modifica = (patch: Partial<SchedaLettura>) => f.scheda && aggiorna(f.id, { scheda: { ...f.scheda, ...patch } })

  return (
    <section className="scheda">
      <h3>Scheda di lettura</h3>
      {base === 'abstract' && (
        <p className="nota">
          Per questa fonte c'è solo {f.abstract ? "l'abstract" : 'qualche estratto'}: la scheda sarà parziale. Allega il PDF per
          una scheda sul testo completo.
        </p>
      )}
      {!haChiave && <p className="nota">Serve la chiave API per preparare la scheda.</p>}
      {lavoro && <p className="in-corso">Il Bibliotecario sta leggendo la fonte…</p>}
      {messaggio && <p className={messaggio.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'}>{messaggio.testo}</p>}

      {!f.scheda ? (
        bottone
      ) : (
        <>
          <p className="nota">
            Preparata il {new Date(f.scheda.preparataIl).toLocaleDateString('it-IT')} sul{' '}
            {f.scheda.base === 'testo' ? 'testo completo' : "l'abstract"}. Puoi correggerla: i campi si salvano mentre scrivi.
          </p>
          {(['domanda', 'metodo', 'risultati', 'rilevanza'] as const).map((campo) => (
            <label key={campo} className="campo-blocco">
              <span className="etichetta">{campo}</span>
              <textarea
                className="campo"
                rows={campo === 'risultati' ? 4 : 2}
                value={f.scheda![campo]}
                onChange={(e) => modifica({ [campo]: e.target.value, corretta: false })}
              />
            </label>
          ))}
          <span className="etichetta">Frasi chiave (verificate sul testo della fonte)</span>
          <ul className="frasi-chiave">
            {f.scheda.frasiChiave.map((fr, i) => (
              <li key={i}>
                <Esito esito={fr.esito} /> «{fr.testo}»
                <button
                  type="button"
                  className="icona"
                  aria-label="Togli la frase"
                  onClick={() => modifica({ frasiChiave: f.scheda!.frasiChiave.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form
            className="riga-editor"
            onSubmit={(e) => {
              e.preventDefault()
              if (!nuovaFrase.trim()) return
              const [v] = verificaFrasi([nuovaFrase.trim()], testoPerScheda(f).testo)
              modifica({ frasiChiave: [...f.scheda!.frasiChiave, v] })
              setNuovaFrase('')
            }}
          >
            <input
              className="campo"
              placeholder="Aggiungi una frase copiata dalla fonte"
              value={nuovaFrase}
              onChange={(e) => setNuovaFrase(e.target.value)}
              aria-label="Nuova frase chiave"
            />
            <button type="submit" className="bottone">
              Aggiungi e verifica
            </button>
          </form>
          <div className="riga-editor">
            <label className="interruttore">
              <input type="checkbox" checked={f.scheda.corretta} onChange={(e) => modifica({ corretta: e.target.checked })} />
              <span>Ho rivisto la scheda</span>
            </label>
            {bottone}
          </div>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Dettaglio di una fonte
// ---------------------------------------------------------------------------

function Dettaglio({ f, onChiudi }: { f: Fonte; onChiudi: () => void }) {
  const aggiorna = useStudio((s) => s.aggiornaFonte)
  const rimuovi = useStudio((s) => s.rimuoviFonte)
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const input = useRef<HTMLInputElement>(null)
  const [allegato, setAllegato] = useState<string | null>(null)

  const campo = (k: 'titolo' | 'rivista' | 'doi' | 'url', etichetta: string) => (
    <label className="campo-blocco">
      <span className="etichetta">{etichetta}</span>
      <input className="campo" value={f[k]} onChange={(e) => aggiorna(f.id, { [k]: e.target.value })} />
    </label>
  )

  const usataIn = (capId: string, si: boolean) => {
    const elenco = si ? [...new Set([...f.usataIn, capId])] : f.usataIn.filter((x) => x !== capId)
    aggiorna(f.id, { usataIn: elenco, stato: elenco.length ? 'usata' : f.stato === 'usata' ? 'letta' : f.stato })
  }

  return (
    <article className="pannello dettaglio-fonte">
      <div className="pannello-testa">
        <h2>{autoreAnno(f)}</h2>
        <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={onChiudi}>
          Chiudi
        </button>
      </div>
      <p className="nota">
        {ETICHETTA_ORIGINE[f.origine]} · aggiunta il {new Date(f.aggiuntaIl).toLocaleDateString('it-IT')} ·{' '}
        {f.testoCompleto ? `testo disponibile (${f.testo.length < 1000 ? `${f.testo.length} caratteri` : `${Math.round(f.testo.length / 1000)} mila caratteri`})` : 'solo abstract'}
        {f.url && (
          <>
            {' · '}
            <a href={f.url} target="_blank" rel="noopener noreferrer">
              apri la fonte
            </a>
          </>
        )}
      </p>

      <label className="campo-blocco">
        <span className="etichetta">Stato</span>
        <select className="campo" value={f.stato} onChange={(e) => aggiorna(f.id, { stato: e.target.value as StatoFonte })}>
          {(Object.keys(ETICHETTA_STATO_FONTE) as StatoFonte[]).map((s) => (
            <option key={s} value={s}>
              {ETICHETTA_STATO_FONTE[s]}
            </option>
          ))}
        </select>
      </label>
      <span className="etichetta">Temi</span>
      <TemiChips temi={f.temi} onCambia={(temi) => aggiorna(f.id, { temi })} />

      <details className="dettagli-capitoli">
        <summary>Usata nei capitoli ({f.usataIn.length})</summary>
        {capitoli.map((c, i) => (
          <label key={c.id} className="interruttore">
            <input type="checkbox" checked={f.usataIn.includes(c.id)} onChange={(e) => usataIn(c.id, e.target.checked)} />
            <span>
              {i + 1}. {c.titolo}
            </span>
          </label>
        ))}
      </details>

      <details>
        <summary>Metadati</summary>
        {campo('titolo', 'Titolo')}
        <label className="campo-blocco">
          <span className="etichetta">Autori o ente (separati da virgola)</span>
          <input
            className="campo"
            defaultValue={f.autori.join(', ')}
            onBlur={(e) => aggiorna(f.id, { autori: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
          />
        </label>
        <label className="campo-blocco">
          <span className="etichetta">Anno</span>
          <input
            className="campo"
            inputMode="numeric"
            value={f.anno ?? ''}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10)
              aggiorna(f.id, { anno: Number.isFinite(n) ? n : null })
            }}
          />
        </label>
        {campo('rivista', 'Rivista o editore')}
        {campo('doi', 'DOI')}
        {campo('url', 'URL')}
      </details>

      {f.abstract && (
        <details>
          <summary>Abstract</summary>
          <p className="abstract">{f.abstract}</p>
        </details>
      )}
      {f.estratti.length > 0 && (
        <details open>
          <summary>Estratti verificati sulla pagina letta</summary>
          <ul className="frasi-chiave">
            {f.estratti.map((e, i) => (
              <li key={i}>
                <Esito esito={e.esito} /> «{e.testo}»
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="riga-editor">
        <button type="button" className="bottone bottone-piccolo" onClick={() => input.current?.click()}>
          {f.tipo === 'pdf' ? 'Sostituisci il PDF' : 'Allega il PDF del paper'}
        </button>
        <input
          ref={input}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setAllegato('Estraggo il testo…')
            try {
              const testo = await testoDaPdf(file)
              aggiorna(f.id, { testo, testoCompleto: true })
              setAllegato(`Testo allegato: ${Math.round(testo.length / 1000)} mila caratteri. Ora puoi rifare la scheda sul testo completo.`)
            } catch (err) {
              setAllegato(err instanceof Error ? err.message : 'Lettura non riuscita.')
            }
          }}
        />
        <Conferma
          classe="bottone bottone-vuoto bottone-piccolo"
          etichetta="Togli dalla biblioteca"
          domanda="Togliere questa fonte?"
          conferma="Togli"
          pericolosa
          onConferma={() => {
            rimuovi(f.id)
            onChiudi()
          }}
        />
      </div>
      {allegato && <p className="nota">{allegato}</p>}

      <Scheda f={f} />
    </article>
  )
}

// ---------------------------------------------------------------------------
// Tabella della letteratura
// ---------------------------------------------------------------------------

function csv(fonti: Fonte[]): string {
  const cella = (x: string) => `"${x.replace(/"/g, '""').replace(/\s+/g, ' ')}"`
  const righe = [
    ['Fonte', 'Titolo', 'Origine', 'Temi', 'Domanda', 'Metodo', 'Risultati', 'Rilevanza', 'Stato', 'DOI o URL'],
    ...fonti.map((f) => [
      autoreAnno(f, false),
      f.titolo,
      ETICHETTA_ORIGINE[f.origine],
      f.temi.map((t) => ETICHETTA_TEMA[t]).join(', '),
      f.scheda?.domanda ?? '',
      f.scheda?.metodo ?? '',
      f.scheda?.risultati ?? '',
      f.scheda?.rilevanza ?? '',
      ETICHETTA_STATO_FONTE[f.stato],
      f.doi || f.url,
    ]),
  ]
  // BOM e punto e virgola: Excel in italiano lo apre senza passaggi.
  return '﻿' + righe.map((r) => r.map(cella).join(';')).join('\r\n')
}

function Tabella({ fonti, onApri }: { fonti: Fonte[]; onApri: (id: string) => void }) {
  return (
    <section className="pannello">
      <div className="pannello-testa">
        <h2>Tabella della letteratura</h2>
        <button
          type="button"
          className="bottone bottone-piccolo"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([csv(fonti)], { type: 'text/csv;charset=utf-8' }))
            const a = document.createElement('a')
            a.href = url
            a.download = 'tabella-letteratura.csv'
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 5000)
          }}
        >
          Scarica per Excel (CSV)
        </button>
      </div>
      <div className="tabella-scorrevole">
        <table className="tabella tabella-letteratura">
          <thead>
            <tr>
              <th scope="col">Fonte</th>
              <th scope="col">Titolo</th>
              <th scope="col">Temi</th>
              <th scope="col">Metodo</th>
              <th scope="col">Risultati</th>
              <th scope="col">Stato</th>
            </tr>
          </thead>
          <tbody>
            {fonti.map((f) => (
              <tr key={f.id} onClick={() => onApri(f.id)} className="riga-cliccabile">
                <th scope="row">
                  <button type="button" className="link" onClick={() => onApri(f.id)}>
                    {autoreAnno(f, false)}
                  </button>
                </th>
                <td>{f.titolo}</td>
                <td>{f.temi.map((t) => ETICHETTA_TEMA[t]).join(', ')}</td>
                <td>{f.scheda?.metodo ?? '—'}</td>
                <td>{f.scheda?.risultati ?? '—'}</td>
                <td>{ETICHETTA_STATO_FONTE[f.stato]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Schermata
// ---------------------------------------------------------------------------

export function Biblioteca() {
  const fonti = useStudio((s) => s.progetto.fonti)
  const inAttesa = useStudio((s) => s.progetto.inAttesa.length)
  const aggiungi = useStudio((s) => s.aggiungiFonte)
  const vai = useStudio((s) => s.vai)
  const largo = useLargo(1100)
  const input = useRef<HTMLInputElement>(null)
  const [vista, setVista] = useState<Vista>('schede')
  const [testo, setTesto] = useState('')
  const [tema, setTema] = useState<TemaFonte | ''>('')
  const [stato, setStato] = useState<StatoFonte | ''>('')
  const [scelta, setScelta] = useState<string | null>(null)
  const [caricamento, setCaricamento] = useState<string | null>(null)

  const visibili = useMemo(() => {
    const t = testo.trim().toLowerCase()
    return [...fonti]
      .filter((f) => (!tema || f.temi.includes(tema)) && (!stato || f.stato === stato))
      .filter((f) => !t || `${f.titolo} ${f.autori.join(' ')} ${f.abstract} ${f.rivista}`.toLowerCase().includes(t))
      .sort((a, b) => autoreAnno(a, false).localeCompare(autoreAnno(b, false), 'it'))
  }, [fonti, testo, tema, stato])
  const fonte = fonti.find((f) => f.id === scelta) ?? null

  const caricaPdf = async (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      setCaricamento(`Leggo "${file.name}"…`)
      try {
        const { fonte: nuova, nota } = await fonteDaPdf(file, (n, tot) => setCaricamento(`Leggo "${file.name}": pagina ${n} di ${tot}`))
        if (giàInBiblioteca(useStudio.getState().progetto.fonti, nuova)) {
          setCaricamento(`"${nuova.titolo}" è già in biblioteca.`)
          continue
        }
        aggiungi(nuova)
        setScelta(nuova.id)
        logOk('bibliotecario', `PDF "${file.name}" aggiunto alla biblioteca.`)
        setCaricamento(nota || `"${nuova.titolo}" aggiunto con i metadati di Crossref.`)
      } catch (err) {
        setCaricamento(`"${file.name}": ${err instanceof Error ? err.message : 'lettura non riuscita'}`)
      }
    }
  }

  const elenco = (
    <section className="pannello">
      <div className="pannello-testa">
        <h2>Biblioteca ({fonti.length})</h2>
        <div className="riga-editor">
          <button type="button" className={`bottone bottone-piccolo ${vista === 'schede' ? 'bottone-primario' : ''}`} onClick={() => setVista('schede')}>
            Fonti
          </button>
          <button type="button" className={`bottone bottone-piccolo ${vista === 'tabella' ? 'bottone-primario' : ''}`} onClick={() => setVista('tabella')}>
            Tabella
          </button>
        </div>
      </div>

      {inAttesa > 0 && (
        <p className="allerta">
          {inAttesa} risultati di ricerca aspettano la tua approvazione.{' '}
          <button type="button" className="link" onClick={() => vai('ricerca')}>
            Vai alla ricerca
          </button>
        </p>
      )}

      <div className="filtri">
        <input className="campo" placeholder="Cerca per titolo, autore, parole" value={testo} onChange={(e) => setTesto(e.target.value)} aria-label="Cerca in biblioteca" />
        <select className="campo" value={tema} onChange={(e) => setTema(e.target.value as TemaFonte | '')} aria-label="Filtra per tema">
          <option value="">tutti i temi</option>
          {(Object.keys(ETICHETTA_TEMA) as TemaFonte[]).map((t) => (
            <option key={t} value={t}>
              {ETICHETTA_TEMA[t]}
            </option>
          ))}
        </select>
        <select className="campo" value={stato} onChange={(e) => setStato(e.target.value as StatoFonte | '')} aria-label="Filtra per stato">
          <option value="">tutti gli stati</option>
          {(Object.keys(ETICHETTA_STATO_FONTE) as StatoFonte[]).map((s) => (
            <option key={s} value={s}>
              {ETICHETTA_STATO_FONTE[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="riga-editor">
        <button type="button" className="bottone" onClick={() => input.current?.click()}>
          Aggiungi PDF di paper
        </button>
        <input ref={input} type="file" accept=".pdf,application/pdf" multiple hidden onChange={(e) => {
          void caricaPdf(e.target.files)
          e.target.value = ''
        }} />
        <button type="button" className="bottone bottone-vuoto" onClick={() => vai('ricerca')}>
          Nuova ricerca
        </button>
      </div>
      {caricamento && <p className="nota">{caricamento}</p>}

      {fonti.length === 0 ? (
        <p className="nota">
          La biblioteca si riempie nel tempo: con le ricerche approvate e con i PDF che carichi tu. Non si rifà a ogni ricerca.
        </p>
      ) : visibili.length === 0 ? (
        <p className="nota">Nessuna fonte con questi filtri.</p>
      ) : (
        <ul className="elenco-fonti">
          {visibili.map((f) => (
            <li key={f.id}>
              <button type="button" className={`fonte-voce ${scelta === f.id ? 'fonte-scelta' : ''}`} onClick={() => setScelta(f.id)}>
                <span className="fonte-rimando">{autoreAnno(f, false)}</span>
                <span className="fonte-titolo">{f.titolo}</span>
                <span className="fonte-meta">
                  <span className={`stato-fonte stato-fonte-${f.stato}`}>{ETICHETTA_STATO_FONTE[f.stato]}</span>
                  <span>{ETICHETTA_ORIGINE[f.origine]}</span>
                  <span>{statoScheda(f)}</span>
                </span>
                {f.temi.length > 0 && <TemiChips temi={f.temi} sola />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  const dettaglio = fonte && <Dettaglio key={fonte.id} f={fonte} onChiudi={() => setScelta(null)} />

  if (vista === 'tabella') {
    return (
      <div className="colonna-unica">
        {elenco}
        {dettaglio}
        <Tabella fonti={visibili} onApri={setScelta} />
      </div>
    )
  }

  return largo ? (
    <div className="griglia-due">
      <div>{elenco}</div>
      <div>{dettaglio ?? <section className="pannello nota">Scegli una fonte per vederne la scheda.</section>}</div>
    </div>
  ) : (
    <div className="colonna-unica">
      {dettaglio}
      {elenco}
    </div>
  )
}
