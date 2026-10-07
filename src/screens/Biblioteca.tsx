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
  if (!f.scheda) return 'niente riassunto'
  return f.scheda.corretta ? 'riassunto controllato' : 'riassunto da controllare'
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
        testo: scartate ? `Riassunto pronto. Ho tolto ${scartate} frasi chiave perché non le trovo uguali nel testo.` : 'Riassunto pronto.',
      })
    } catch (err) {
      setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Qualcosa è andato storto.' })
    } finally {
      setLavoro(false)
    }
  }

  const bottone = (
    <Conferma
      classe={f.scheda ? 'bottone bottone-vuoto bottone-piccolo' : 'bottone bottone-primario'}
      etichetta={f.scheda ? 'Rifai il riassunto' : 'Fai il riassunto'}
      domanda={`${f.scheda ? 'Il riassunto di adesso verrà sostituito. ' : ''}${costoStimato(stima)}. Procedo?`}
      conferma="Vai"
      disabilitato={lavoro}
      onConferma={() => void prepara()}
    />
  )

  const modifica = (patch: Partial<SchedaLettura>) => f.scheda && aggiorna(f.id, { scheda: { ...f.scheda, ...patch } })

  return (
    <section className="scheda">
      <h3>Riassunto della fonte</h3>
      {base === 'abstract' && (
        <p className="nota">
          Di questa fonte ho solo {f.abstract ? 'il riassunto degli autori' : 'qualche pezzo'}, quindi il riassunto sarà incompleto.
          Se aggiungi il PDF lo faccio su tutto il testo.
        </p>
      )}
      {lavoro && <p className="in-corso">Il Bibliotecario sta leggendo…</p>}
      {messaggio && <p className={messaggio.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'}>{messaggio.testo}</p>}

      {!f.scheda ? (
        bottone
      ) : (
        <>
          <p className="nota">
            Fatto il {new Date(f.scheda.preparataIl).toLocaleDateString('it-IT')} su{' '}
            {f.scheda.base === 'testo' ? 'tutto il testo' : 'il riassunto degli autori'}. Puoi correggerlo: si salva da solo mentre scrivi.
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
          <span className="etichetta">Frasi chiave (controllate sul testo)</span>
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
              placeholder="Incolla una frase della fonte"
              value={nuovaFrase}
              onChange={(e) => setNuovaFrase(e.target.value)}
              aria-label="Nuova frase chiave"
            />
            <button type="submit" className="bottone">
              Aggiungi e controlla
            </button>
          </form>
          <div className="riga-editor">
            <label className="interruttore">
              <input type="checkbox" checked={f.scheda.corretta} onChange={(e) => modifica({ corretta: e.target.checked })} />
              <span>L'ho controllato io</span>
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
        Ho tutto il testo{f.pagine?.length ? `: ${f.pagine.length} pagine, quindi nelle citazioni metto anche la pagina` : ''}.
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
        setMessaggio({ tono: 'ok', testo: `Fatto, ${e.via === 'browser' ? 'scaricato gratis' : 'letto con la chiave API'}${e.pagine ? `: ${e.pagine} pagine` : ''}. Ora puoi rifare il riassunto su tutto il testo.` })
      } else if (e.motivo === 'nessun_indirizzo') {
        setMessaggio({ tono: 'avviso', testo: 'Di questo articolo non trovo una versione gratis. Se hai il PDF (per esempio dalla biblioteca dell\'università), aggiungilo tu.' })
      } else if (e.motivo === 'non_corrisponde') {
        setMessaggio({ tono: 'avviso', testo: 'Il file che ho trovato non sembra questo articolo (il titolo non c\'è nelle prime pagine), quindi l\'ho lasciato stare.' })
      } else {
        setBloccato(true)
        setIndirizzo(e.indirizzi[0] ?? null)
        setMessaggio({
          tono: 'avviso',
          testo: conApi
            ? 'Non riesco a leggerlo neanche con la chiave API.'
            : `Il sito con la versione gratis non me la fa scaricare.${haChiave ? '' : ' Aprila dal link qui sotto, scarica il PDF e aggiungilo a questa fonte: è gratis.'}`,
        })
      }
    } catch (err) {
      setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Qualcosa è andato storto.' })
    } finally {
      setStato('fermo')
    }
  }

  return (
    <section className="testo-completo">
      <h3>Tutto il testo</h3>
      <p className="nota">
        {f.oaUrl ? 'Questo articolo si può leggere gratis online. ' : 'Guardo su OpenAlex se c\'è una versione gratis di questo articolo. '}
        Con tutto il testo il riassunto e le citazioni si basano sull'articolo intero e hanno il numero di pagina.
      </p>
      {stato !== 'fermo' ? (
        <p className="in-corso">{stato === 'browser' ? 'Provo a scaricarlo…' : 'Lo leggo con la chiave API…'}</p>
      ) : (
        <div className="riga-editor">
          <button type="button" className="bottone" onClick={() => void prova(false)}>
            Cerca tutto il testo
          </button>
          {bloccato && indirizzo && !haChiave && (
            <a className="bottone" href={indirizzo} target="_blank" rel="noreferrer">
              Apri la versione gratis
            </a>
          )}
          {bloccato && haChiave && (
            <Conferma
              classe="bottone bottone-primario"
              etichetta="Leggilo con la chiave"
              domanda={`${costoStimato(stima)} (dipende da quanto è lungo il PDF). Procedo?`}
              conferma="Vai"
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
  const passaggi = `${gruppi} ${gruppi === 1 ? 'giro' : 'giri'}${modalitaGratuita() ? ' su Claude.ai' : ''}`

  return (
    <div className="testo-completo-tutte">
      {avanzamento ? (
        <span className="in-corso">{avanzamento}</span>
      ) : (
        senza.length >= 2 && (
          <Conferma
            classe="bottone bottone-piccolo"
            etichetta={`Riassumi ${senza.length} fonti insieme`}
            domanda={`${senza.length} fonti in ${passaggi}. ${costoStimato(stima)}. Procedo?`}
            conferma="Vai"
            disabilitato={lavoro}
            onConferma={async () => {
              setEsito(null)
              try {
                const r = await preparaSchedeInBlocco(
                  senza.map((f) => f.id),
                  (g, tot) => setAvanzamento(`Riassunti: gruppo ${g} di ${tot}…`),
                )
                setEsito({ tono: 'ok', testo: `${r.fatte} riassunti pronti${r.frasiScartate ? `; ho tolto ${r.frasiScartate} frasi chiave perché non le trovo nel testo` : ''}.` })
              } catch (err) {
                const annullato = err instanceof DOMException && err.name === 'AbortError'
                setEsito({ tono: 'errore', testo: annullato ? 'Fermato. I riassunti già fatti restano salvati.' : err instanceof Error ? err.message : 'Qualcosa è andato storto.' })
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
              const r = await recuperaTuttiNelBrowser((fatte, totale) => setAvanzamento(`Cerco i testi: ${fatte} di ${totale}…`))
              setAvanzamento(null)
              setDaApi(r.daApi)
              setEsito(`Ho scaricato gratis ${r.riusciti} testi.${r.daApi.length ? ` Altri ${r.daApi.length} sono gratis ma il sito non me li fa scaricare.` : ''}`)
            }}
          >
            Cerca il testo di {candidate} {candidate === 1 ? 'fonte' : 'fonti'}
          </button>
        )
      )}
      {esito && <span className="nota">{esito}</span>}
      {daApi.length > 0 && !avanzamento && haChiave && (
        <Conferma
          classe="bottone bottone-piccolo bottone-primario"
          etichetta={`Leggi le altre ${daApi.length} con la chiave`}
          domanda={`${costoStimato(stima, daApi.length)}. Procedo?`}
          conferma="Vai"
          onConferma={async () => {
            let ok = 0
            for (const [i, id] of daApi.entries()) {
              setAvanzamento(`Leggo con la chiave API: ${i + 1} di ${daApi.length}…`)
              try {
                if ((await recuperaTestoCompleto(id, true)).ok) ok += 1
              } catch {
                // Si passa alla successiva: l'errore resta nel registro.
              }
            }
            setAvanzamento(null)
            setDaApi([])
            setEsito(`Ho letto ${ok} testi con la chiave API.`)
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
        {f.testoCompleto ? `c'è tutto il testo (${f.testo.length < 1000 ? `${f.testo.length} caratteri` : `${Math.round(f.testo.length / 1000)} mila caratteri`})` : 'solo il riassunto degli autori'}
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
        <summary>In quali capitoli la usi ({f.usataIn.length})</summary>
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
        <summary>Dati della fonte</summary>
        {campo('titolo', 'Titolo')}
        <label className="campo-blocco">
          <span className="etichetta">Autori o ente (separati da una virgola)</span>
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
            <span className="etichetta">Numero di pagina con cui inizia l'articolo</span>
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
              Serve per citare la pagina giusta della rivista: se l'articolo inizia a p. 245, la prima pagina del PDF diventa "p. 245".
              Se lo cambi, usa "Verifica le citazioni" nella scrittura per aggiornare le pagine.
            </span>
          </label>
        ) : null}
        {campo('doi', 'DOI')}
        {campo('url', 'URL')}
      </details>

      {f.abstract && (
        <details>
          <summary>Riassunto degli autori</summary>
          <p className="abstract">{f.abstract}</p>
        </details>
      )}
      {f.estratti.length > 0 && (
        <details open>
          <summary>Frasi controllate sulla pagina</summary>
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
          {f.tipo === 'pdf' ? 'Cambia il PDF' : 'Aggiungi il PDF'}
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
            setAllegato('Leggo il PDF…')
            try {
              const { testo, pagine } = await testoDaPdf(file)
              aggiorna(f.id, { testo, pagine, testoCompleto: true })
              setAllegato(`Fatto: ${pagine.length} pagine, ${Math.round(testo.length / 1000)} mila caratteri. Ora puoi rifare il riassunto su tutto il testo.`)
            } catch (err) {
              setAllegato(err instanceof Error ? err.message : 'Non riesco a leggere il PDF.')
            }
          }}
        />
        <Conferma
          classe="bottone bottone-vuoto bottone-piccolo"
          etichetta="Togli dalla biblioteca"
          domanda="Tolgo questa fonte?"
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
        <h2>Tabella delle fonti</h2>
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
          Scarica per Excel
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
          Hai {inAttesa} risultati da controllare.{' '}
          <button type="button" className="link" onClick={() => vai('ricerca')}>
            Vai alla ricerca
          </button>
        </p>
      )}

      <div className="filtri">
        <input className="campo" placeholder="Cerca titolo, autore o parola" value={testo} onChange={(e) => setTesto(e.target.value)} aria-label="Cerca in biblioteca" />
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
          Aggiungi PDF
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
          La biblioteca si riempie un po' alla volta: con le fonti che tieni dalle ricerche e con i PDF che carichi tu. Non si svuota a ogni ricerca.
        </p>
      ) : visibili.length === 0 ? (
        <p className="nota">Nessuna fonte con questi filtri. Prova a toglierne qualcuno.</p>
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
                  {f.testoCompleto ? <span className="nota-ok">tutto il testo{f.pagine?.length ? ' con pagine' : ''}</span> : puòAvereTestoCompleto(f) && f.oaUrl ? <span className="oa">gratis online</span> : null}
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
      <div>{dettaglio ?? <section className="pannello nota">Scegli una fonte per vederla qui.</section>}</div>
    </div>
  ) : (
    <div className="colonna-unica">
      {dettaglio}
      {elenco}
    </div>
  )
}
