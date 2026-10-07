import { useMemo, useRef, useState } from 'react'
import { costoStimato, modalitaGratuita } from '../agents/api'
import { fontiSenzaScheda, gruppiSchede, preparaScheda, preparaSchedeInBlocco, stimaScheda, stimaSchedeInBlocco, testoPerScheda, verificaFrasi } from '../agents/schede'
import { puòAvereTestoCompleto, recuperaTestoCompleto, recuperaTuttiNelBrowser, stimaTestoCompleto } from '../agents/testoCompleto'
import { Conferma } from '../components/Conferma'
import { Esito } from '../components/Esito'
import { TemiChips } from '../components/TemiChips'
import { ETICHETTA_ORIGINE, ETICHETTA_STATO_FONTE, autoreAnno } from '../domain/bibliografia'
import { ETICHETTA_TEMA } from '../domain/dominio'
import { useLargo } from '../hooks/useLayoutMode'
import { testoDaPdf } from '../io/pdfPaper'
import { aggiungiPdfInBiblioteca } from '../io/aggiungiPdf'
import { useStudio } from '../store'
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
      domanda={`${f.scheda ? 'La scheda attuale sarà sostituita. ' : ''}${costoStimato(stima)}. Procedo?`}
      conferma="Prepara"
      disabilitato={lavoro}
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
                <Esito esito={fr.esito} /> «{fr.testo}»{fr.pagina ? <strong className="pagina"> p. {fr.pagina}</strong> : null}
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
              const [v] = verificaFrasi([nuovaFrase.trim()], testoPerScheda(f).testo, f)
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
// Testo completo open access
// ---------------------------------------------------------------------------

function TestoCompleto({ f }: { f: Fonte }) {
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const [stato, setStato] = useState<'fermo' | 'browser' | 'api'>('fermo')
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'avviso' | 'errore'; testo: string } | null>(null)
  const [bloccato, setBloccato] = useState(false)
  const [indirizzo, setIndirizzo] = useState<string | null>(null)
  if (f.testoCompleto) {
    return (
      <p className="nota nota-ok">
        Testo completo disponibile{f.pagine?.length ? `: ${f.pagine.length} pagine, le citazioni avranno il numero di pagina` : ''}.
      </p>
    )
  }
  if (!puòAvereTestoCompleto(f)) return null
  const stima = stimaTestoCompleto()

  const prova = async (conApi: boolean) => {
    setStato(conApi ? 'api' : 'browser')
    setMessaggio(null)
    try {
      const e = await recuperaTestoCompleto(f.id, conApi)
      if (e.ok) {
        setMessaggio({ tono: 'ok', testo: `Testo completo ${e.via === 'browser' ? 'scaricato gratis dal browser' : 'letto tramite l\'API'}${e.pagine ? `: ${e.pagine} pagine` : ''}. Ora puoi rifare la scheda sul testo completo.` })
      } else if (e.motivo === 'nessun_indirizzo') {
        setMessaggio({ tono: 'avviso', testo: 'Per questo articolo non risulta una versione gratuita. Se hai il PDF (per esempio dalla biblioteca dell\'università), allegalo.' })
      } else if (e.motivo === 'non_corrisponde') {
        setMessaggio({ tono: 'avviso', testo: 'Il documento trovato non sembra questo articolo (il titolo non compare nelle prime pagine): non l\'ho usato.' })
      } else {
        setBloccato(true)
        setIndirizzo(e.indirizzi[0] ?? null)
        setMessaggio({
          tono: 'avviso',
          testo: conApi
            ? 'Neanche tramite l\'API è stato possibile leggere il documento.'
            : `Il sito che ospita la versione gratuita non permette al browser di scaricarla direttamente.${haChiave ? '' : ' Aprila dal link qui sotto, scarica il PDF e allegalo a questa fonte: è gratis.'}`,
        })
      }
    } catch (err) {
      setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Errore.' })
    } finally {
      setStato('fermo')
    }
  }

  return (
    <section className="testo-completo">
      <h3>Testo completo</h3>
      <p className="nota">
        {f.oaUrl ? 'Il catalogo indica una versione gratuita (open access) di questo articolo. ' : 'Cerco su OpenAlex, tramite il DOI, se esiste una versione gratuita. '}
        Con il testo completo la scheda e le citazioni si basano sull'articolo intero e indicano il numero di pagina.
      </p>
      {stato !== 'fermo' ? (
        <p className="in-corso">{stato === 'browser' ? 'Provo a scaricarlo dal browser…' : 'Lo leggo tramite l\'API…'}</p>
      ) : (
        <div className="riga-editor">
          <button type="button" className="bottone" onClick={() => void prova(false)}>
            Cerca il testo completo (gratis)
          </button>
          {bloccato && indirizzo && !haChiave && (
            <a className="bottone" href={indirizzo} target="_blank" rel="noreferrer">
              Apri la versione gratuita
            </a>
          )}
          {bloccato && haChiave && (
            <Conferma
              classe="bottone bottone-primario"
              etichetta="Leggilo tramite l'API"
              domanda={`${costoStimato(stima)} (dipende dalla lunghezza del PDF). Procedo?`}
              conferma="Procedi"
              onConferma={() => void prova(true)}
            />
          )}
        </div>
      )}
      {messaggio && <p className={messaggio.tono === 'ok' ? 'nota nota-ok' : messaggio.tono === 'errore' ? 'allerta allerta-errore' : 'allerta'}>{messaggio.testo}</p>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Dettaglio di una fonte
// ---------------------------------------------------------------------------

/** Testo completo per tutte le fonti: prima gratis dal browser, poi (se vuoi) tramite l'API per le rimaste. */
/** Schede di più fonti in pochi passaggi: in modalità gratuita è il modo più rapido. */
function SchedeInBlocco() {
  const fonti = useStudio((s) => s.progetto.fonti)
  const modello = useStudio((s) => s.preferenze.modelli.bibliotecario)
  const lavoro = useStudio((s) => s.agenti.bibliotecario.status === 'lavoro')
  const [avanzamento, setAvanzamento] = useState<string | null>(null)
  const [esito, setEsito] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)
  const senza = useMemo(() => fontiSenzaScheda(fonti), [fonti])
  if (senza.length < 2 && !esito) return null
  const gruppi = gruppiSchede(senza).length
  const stima = stimaSchedeInBlocco(senza, modello)
  const passaggi = `${gruppi} ${gruppi === 1 ? 'passaggio' : 'passaggi'}${modalitaGratuita() ? ' su Claude.ai' : ''}`

  return (
    <div className="testo-completo-tutte">
      {avanzamento ? (
        <span className="in-corso">{avanzamento}</span>
      ) : (
        senza.length >= 2 && (
          <Conferma
            classe="bottone bottone-piccolo"
            etichetta={`Prepara le schede di ${senza.length} fonti insieme`}
            domanda={`${senza.length} fonti in ${passaggi}. ${costoStimato(stima)}. Procedo?`}
            conferma="Prepara"
            disabilitato={lavoro}
            onConferma={async () => {
              setEsito(null)
              try {
                const r = await preparaSchedeInBlocco(
                  senza.map((f) => f.id),
                  (g, tot) => setAvanzamento(`Schede di lettura: gruppo ${g} di ${tot}…`),
                )
                setEsito({ tono: 'ok', testo: `${r.fatte} schede pronte${r.frasiScartate ? `; ${r.frasiScartate} frasi chiave scartate perché non si ritrovano nel testo` : ''}.` })
              } catch (err) {
                const annullato = err instanceof DOMException && err.name === 'AbortError'
                setEsito({ tono: 'errore', testo: annullato ? 'Interrotto: le schede già pronte restano salvate.' : err instanceof Error ? err.message : 'Errore.' })
              }
              setAvanzamento(null)
            }}
          />
        )
      )}
      {esito && <span className={esito.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'}>{esito.testo}</span>}
    </div>
  )
}

function TestoCompletoPerTutte() {
  const fonti = useStudio((s) => s.progetto.fonti)
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const candidate = fonti.filter(puòAvereTestoCompleto).length
  const [avanzamento, setAvanzamento] = useState<string | null>(null)
  const [daApi, setDaApi] = useState<string[]>([])
  const [esito, setEsito] = useState<string | null>(null)
  if (candidate === 0 && daApi.length === 0 && !esito) return null
  const stima = stimaTestoCompleto()

  return (
    <div className="testo-completo-tutte">
      {avanzamento ? (
        <span className="in-corso">{avanzamento}</span>
      ) : (
        candidate > 0 && (
          <button
            type="button"
            className="bottone bottone-piccolo"
            onClick={async () => {
              setEsito(null)
              const r = await recuperaTuttiNelBrowser((fatte, totale) => setAvanzamento(`Cerco il testo completo: ${fatte} di ${totale}…`))
              setAvanzamento(null)
              setDaApi(r.daApi)
              setEsito(`${r.riusciti} testi completi scaricati gratis.${r.daApi.length ? ` ${r.daApi.length} sono gratuiti ma il sito non li fa scaricare al browser.` : ''}`)
            }}
          >
            Cerca il testo completo per {candidate} {candidate === 1 ? 'fonte' : 'fonti'} (gratis)
          </button>
        )
      )}
      {esito && <span className="nota">{esito}</span>}
      {daApi.length > 0 && !avanzamento && haChiave && (
        <Conferma
          classe="bottone bottone-piccolo bottone-primario"
          etichetta={`Leggi le ${daApi.length} rimaste tramite l'API`}
          domanda={`${costoStimato(stima, daApi.length)}. Procedo?`}
          conferma="Procedi"
          onConferma={async () => {
            let ok = 0
            for (const [i, id] of daApi.entries()) {
              setAvanzamento(`Leggo tramite l'API: ${i + 1} di ${daApi.length}…`)
              try {
                if ((await recuperaTestoCompleto(id, true)).ok) ok += 1
              } catch {
                // Si passa alla successiva: l'errore resta nel registro.
              }
            }
            setAvanzamento(null)
            setDaApi([])
            setEsito(`${ok} testi completi letti tramite l'API.`)
          }}
        />
      )}
    </div>
  )
}

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
        {f.pagine?.length ? (
          <label className="campo-blocco">
            <span className="etichetta">Numero stampato della prima pagina del PDF</span>
            <input
              className="campo"
              inputMode="numeric"
              value={f.paginaIniziale ?? 1}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10)
                aggiorna(f.id, { paginaIniziale: Number.isFinite(n) && n > 0 ? n : 1 })
              }}
            />
            <span className="nota">
              Serve a citare la pagina giusta della rivista: se l'articolo inizia a p. 245, le citazioni dalla prima pagina del PDF diventano "p. 245".
              Dopo una modifica, "Verifica le citazioni" nella scrittura aggiorna le pagine.
            </span>
          </label>
        ) : null}
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
              const { testo, pagine } = await testoDaPdf(file)
              aggiorna(f.id, { testo, pagine, testoCompleto: true })
              setAllegato(`Testo allegato: ${pagine.length} pagine, ${Math.round(testo.length / 1000)} mila caratteri. Ora puoi rifare la scheda sul testo completo.`)
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

      <TestoCompleto f={f} />

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
  const vai = useStudio((s) => s.vai)
  const largo = useLargo(1100)
  const input = useRef<HTMLInputElement>(null)
  const [vista, setVista] = useState<Vista>('schede')
  const [testo, setTesto] = useState('')
  const [tema, setTema] = useState<TemaFonte | ''>('')
  const [stato, setStato] = useState<StatoFonte | ''>('')
  const scelta = useStudio((s) => s.fonteAperta)
  const setScelta = useStudio((s) => s.apriFonte)
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
    const { aggiunte, note } = await aggiungiPdfInBiblioteca(files, setCaricamento)
    if (aggiunte.length) setScelta(aggiunte[aggiunte.length - 1].id)
    setCaricamento(note.join(' ') || null)
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
      <TestoCompletoPerTutte />
      <SchedeInBlocco />

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
                  {f.testoCompleto ? <span className="nota-ok">testo completo{f.pagine?.length ? ' con pagine' : ''}</span> : puòAvereTestoCompleto(f) && f.oaUrl ? <span className="oa">open access</span> : null}
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
