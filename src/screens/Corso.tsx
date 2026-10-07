import { costoStimato, modalitaGratuita } from '../agents/api'
import { useMemo, useRef, useState } from 'react'
import { collocazione, cercaPassaggi, rimuoviDalCorpus } from '../agents/corpus'
import { annullaQuadro, generaQuadro, stimaQuadro } from '../agents/lettoreCorso'
import { ricavaLessico, stimaLessico } from '../agents/lessico'
import { Conferma } from '../components/Conferma'
import { Esito } from '../components/Esito'
import { ACCETTA_CORSO as ACCETTA, caricaFileCorso } from '../io/fileCorso'
import { estrazioneInCorso, quadroObsoleto, useStudio } from '../store'
import type { CourseFile, Passaggio } from '../types'


function formatta(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`
}

function avanzamento(f: CourseFile): number {
  if (f.status === 'pronto' || f.status === 'errore') return 100
  if (f.status === 'lettura') return Math.round(f.progress / 2)
  return 50 + Math.round(((f.paginaCorrente ?? 0) / Math.max(1, f.pagine ?? 1)) * 50)
}

function Caricamento() {
  const courseFiles = useStudio((s) => s.progetto.courseFiles)
  const occupato = useStudio((s) => estrazioneInCorso(s.progetto))
  const rimuovi = useStudio((s) => s.rimuoviCourseFile)
  const input = useRef<HTMLInputElement>(null)
  const [trascina, setTrascina] = useState(false)
  const [scartati, setScartati] = useState<string[]>([])

  const pronti = courseFiles.filter((f) => f.status === 'pronto')
  const passaggi = pronti.reduce((n, f) => n + (f.passaggi ?? 0), 0)
  const complessivo = courseFiles.length
    ? Math.round(courseFiles.reduce((s, f) => s + avanzamento(f), 0) / courseFiles.length)
    : 0

  return (
    <section className="pannello">
      <h2>File del corso</h2>
      <div
        className={`zona-rilascio ${trascina ? 'zona-attiva' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setTrascina(true)
        }}
        onDragLeave={() => setTrascina(false)}
        onDrop={(e) => {
          e.preventDefault()
          setTrascina(false)
          if (e.dataTransfer.files.length) void caricaFileCorso(e.dataTransfer.files, setScartati)
        }}
      >
        <button type="button" className="bottone bottone-primario" onClick={() => input.current?.click()}>
          Aggiungi PDF o appunti
        </button>
        <p className="nota">
          PDF delle lezioni, dispense, appunti in .txt o .md, anche molti insieme. Il testo viene estratto nel browser,
          diviso in passaggi con file e pagina e salvato sul dispositivo. Mentre si estrae il testo la scena 3D si ferma.
        </p>
        <input
          ref={input}
          type="file"
          accept={ACCETTA}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void caricaFileCorso(e.target.files, setScartati)
            e.target.value = ''
          }}
        />
      </div>

      {scartati.length > 0 && <p className="allerta">Formato non supportato, file ignorati: {scartati.join(', ')}.</p>}

      {courseFiles.length > 0 && (
        <>
          <div className="testa-progresso">
            <span>
              {occupato ? 'Lettura in corso' : 'Materiale pronto'}: <strong>{complessivo}%</strong>
            </span>
            <span className="nota">
              {pronti.length} file pronti · {passaggi} passaggi citabili
            </span>
          </div>
          <span className="progresso">
            <span className="progresso-barra" style={{ width: `${complessivo}%` }} />
          </span>
          <ul className="elenco-file">
            {courseFiles.map((f) => (
              <li key={f.id} className={`riga-file riga-${f.status}`}>
                <span aria-hidden>{f.status === 'pronto' ? '✓' : f.status === 'errore' ? '⚠' : '…'}</span>
                <span className="nome-file" title={f.name}>
                  {f.name}
                </span>
                <span className="nota">
                  {f.status === 'estrazione'
                    ? `pagina ${f.paginaCorrente ?? 0} di ${f.pagine ?? '…'}`
                    : f.status === 'pronto'
                      ? `${f.pagine} ${f.pagine === 1 ? 'pagina' : 'pagine'} · ${f.passaggi} ${f.passaggi === 1 ? 'passaggio' : 'passaggi'}`
                      : formatta(f.size)}
                </span>
                <Conferma
                  classe="icona"
                  etichetta="✕"
                  domanda={`Togliere "${f.name}"?`}
                  conferma="Togli"
                  pericolosa
                  disabilitato={f.status === 'lettura' || f.status === 'estrazione'}
                  onConferma={() => {
                    void rimuoviDalCorpus(f.id)
                    rimuovi(f.id)
                  }}
                />
                {f.errore && <span className="errore-file">{f.errore}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Quadro() {
  const quadro = useStudio((s) => s.progetto.quadro)
  const obsoleto = useStudio((s) => quadroObsoleto(s.progetto))
  const pronti = useStudio((s) => s.progetto.courseFiles.filter((f) => f.status === 'pronto').length)
  const occupato = useStudio((s) => estrazioneInCorso(s.progetto))
  const lettore = useStudio((s) => s.agenti.lettore)
  const modello = useStudio((s) => s.preferenze.modelli.lettore)
  const [errore, setErrore] = useState<string | null>(null)
  const [aperto, setAperto] = useState<string | null>(null)

  const inCorso = lettore.status === 'lavoro'
  // Si ricalcola quando cambiano i file del corso pronti.
  const stima = useMemo(() => (pronti > 0 ? stimaQuadro(modello) : null), [pronti, modello])

  const avvia = async () => {
    setErrore(null)
    try {
      await generaQuadro()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore sconosciuto.')
    }
  }

  return (
    <section className="pannello">
      <div className="pannello-testa">
        <h2>Quadro teorico del corso</h2>
        {quadro && <span className="nota">generato il {new Date(quadro.generatoIl).toLocaleDateString('it-IT')}</span>}
      </div>
      <p className="nota">
        Il Lettore del corso ricava dal tuo materiale i concetti che userai in ogni capitolo (rischio operativo, leva
        operativa, liquidità, volatilità dei flussi…). Ogni definizione ha una frase copiata dal corso, confrontata in
        codice con il testo: verde se c'è alla lettera, ambra se quasi, rosso se non si ritrova.
      </p>

      {obsoleto && <p className="allerta">Hai cambiato i file del corso dopo l'ultima generazione: conviene aggiornare il quadro.</p>}

      {pronti === 0 ? (
        <p className="nota">Carica almeno un file del corso per generare il quadro.</p>
      ) : inCorso ? (
        <div className="riga-editor">
          <span className="in-corso">Il Lettore sta leggendo il materiale…</span>
          <button type="button" className="bottone bottone-vuoto" onClick={annullaQuadro}>
            Ferma
          </button>
        </div>
      ) : (
        <Conferma
          classe="bottone bottone-primario"
          etichetta={quadro ? 'Aggiorna il quadro teorico' : 'Genera il quadro teorico'}
          domanda={
            stima
              ? `${costoStimato(stima)}${modalitaGratuita() ? '' : ` con ${modello}`}. Procedo?`
              : 'Procedo?'
          }
          conferma="Genera"
          disabilitato={occupato}
          onConferma={() => void avvia()}
        />
      )}

      {errore && <p className="allerta allerta-errore">{errore}</p>}

      {quadro && (
        <>
          <ul className="elenco-concetti-grandi">
            {quadro.concetti.map((c) => (
              <li key={c.termine}>
                <div className="concetto-testa">
                  <strong>{c.termine}</strong>
                  <button
                    type="button"
                    className="marcatore"
                    onClick={() => setAperto(aperto === c.termine ? null : c.termine)}
                    aria-expanded={aperto === c.termine}
                  >
                    <Esito esito={c.esito} />
                  </button>
                </div>
                <p>{c.definizione}</p>
                <p className="applicazione">{c.applicazione}</p>
                {aperto === c.termine && (
                  <blockquote className="estratto">
                    «{c.estratto}»<cite>{c.collocazione}</cite>
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
          {quadro.collegamenti.length > 0 && (
            <>
              <h3>Collegamenti con i capitoli</h3>
              <ul className="elenco-semplice">
                {quadro.collegamenti.map((c, i) => (
                  <li key={i}>
                    <strong>{c.capitolo}:</strong> {c.collegamento}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3>Temi non trattati dal corso</h3>
          {quadro.lacune.length === 0 ? (
            <p className="nota">Nessuna lacuna segnalata.</p>
          ) : (
            <>
              <p className="nota">Per il vincolo di materia questi temi non andranno sviluppati nella tesi.</p>
              <ul className="elenco-semplice">
                {quadro.lacune.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

function CercaNelCorso() {
  const firma = useStudio((s) => s.progetto.courseFiles.map((f) => `${f.id}:${f.status}`).join('|'))
  const [domanda, setDomanda] = useState('')
  const [risultati, setRisultati] = useState<Passaggio[] | null>(null)

  return (
    <section className="pannello">
      <h2>Cerca nel materiale</h2>
      <form
        className="riga-editor"
        onSubmit={(e) => {
          e.preventDefault()
          void firma
          setRisultati(domanda.trim() ? cercaPassaggi(domanda, 6) : null)
        }}
      >
        <input
          className="campo"
          placeholder="Per esempio: leva operativa"
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          aria-label="Cerca nel materiale del corso"
        />
        <button type="submit" className="bottone">
          Cerca
        </button>
      </form>
      {risultati && risultati.length === 0 && <p className="nota">Nessun passaggio pertinente.</p>}
      {risultati && risultati.length > 0 && (
        <ul className="elenco-passaggi">
          {risultati.map((p) => (
            <li key={p.id}>
              <cite>{collocazione(p)}</cite>
              <p>{p.testo.length > 600 ? `${p.testo.slice(0, 600)}…` : p.testo}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Lessico() {
  const glossario = useStudio((s) => s.progetto.glossario)
  const pronti = useStudio((s) => s.progetto.courseFiles.filter((f) => f.status === 'pronto').length)
  const occupato = useStudio((s) => estrazioneInCorso(s.progetto))
  const modello = useStudio((s) => s.preferenze.modelli.lettore)
  const lettore = useStudio((s) => s.agenti.lettore)
  const vai = useStudio((s) => s.vai)
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)
  const delCorso = useMemo(() => glossario.filter((v) => v.origine === 'corso').sort((a, b) => (b.occorrenze ?? 0) - (a.occorrenze ?? 0)), [glossario])
  const stima = useMemo(() => (pronti > 0 ? stimaLessico(modello) : null), [pronti, modello])

  return (
    <section className="pannello">
      <h2>Lessico del corso</h2>
      <p className="nota">
        Il Lettore ricava dalle lezioni i termini tecnici come li scrive il tuo corso e li mette nel glossario. Lo Scrittore e il Revisore devono
        usare quelli e non le loro varianti; il rilevatore della scrittura segnala ogni variante. In codice si tengono solo i termini che compaiono
        davvero nei tuoi file.
      </p>
      {lettore.status === 'lavoro' && lettore.etichetta.includes('lessico') ? (
        <p className="in-corso">Il Lettore sta ricavando il lessico…</p>
      ) : (
        <Conferma
          classe="bottone bottone-primario"
          etichetta={delCorso.length ? 'Aggiorna il lessico del corso' : 'Ricava il lessico del corso'}
          disabilitato={pronti === 0 || occupato}
          domanda={stima ? `${costoStimato(stima)}. Procedo?` : 'Procedo?'}
          conferma="Ricava"
          onConferma={async () => {
            setMessaggio(null)
            try {
              const e = await ricavaLessico()
              setMessaggio({
                tono: 'ok',
                testo: `${e.nuove} termini nuovi e ${e.aggiornate} aggiornati nel glossario.${e.scartati.length ? ` Scartati perché non compaiono nei tuoi file: ${e.scartati.join(', ')}.` : ''}${e.variantiTolte ? ` ${e.variantiTolte} varianti non vietate perché le usa anche il corso.` : ''}`,
              })
            } catch (err) {
              setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Errore.' })
            }
          }}
        />
      )}
      {messaggio && <p className={messaggio.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'}>{messaggio.testo}</p>}
      {delCorso.length > 0 && (
        <>
          <ul className="elenco-lessico">
            {delCorso.map((v) => (
              <li key={v.id}>
                <strong>{v.termine}</strong> <small className="nota">{v.occorrenze} volte nei file{v.collocazione ? ` · ${v.collocazione}` : ''}</small>
                {v.varianti.length > 0 && <span className="nota"> — non usare: {v.varianti.join(', ')}</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="link" onClick={() => vai('glossario')}>
            Modifica nel glossario
          </button>
        </>
      )}
    </section>
  )
}

export function Corso() {
  return (
    <div className="griglia-due">
      <div>
        <Caricamento />
        <CercaNelCorso />
      </div>
      <div>
        <Quadro />
        <Lessico />
      </div>
    </div>
  )
}
