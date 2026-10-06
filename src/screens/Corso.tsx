import { useMemo, useRef, useState } from 'react'
import {
  aggiungiAlCorpus,
  collocazione,
  estraiPdf,
  pagineDaTesto,
  cercaPassaggi,
  rimuoviDalCorpus,
  suddividi,
} from '../agents/corpus'
import { formattaDollari } from '../agents/costs'
import { annullaQuadro, generaQuadro, stimaQuadro } from '../agents/lettoreCorso'
import { logAvviso, logOk } from '../agents/supervisor'
import { Conferma } from '../components/Conferma'
import { Esito } from '../components/Esito'
import { nuovoId } from '../domain/progettoIniziale'
import { estrazioneInCorso, quadroObsoleto, useStudio } from '../store'
import type { CourseFile, Passaggio } from '../types'

const ACCETTA = '.pdf,.txt,.md,application/pdf,text/plain,text/markdown'

function formatta(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`
}

function tipo(file: File): CourseFile['kind'] | null {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (nome.endsWith('.txt') || nome.endsWith('.md') || file.type.startsWith('text/')) return 'testo'
  return null
}

function avanzamento(f: CourseFile): number {
  if (f.status === 'pronto' || f.status === 'errore') return 100
  if (f.status === 'lettura') return Math.round(f.progress / 2)
  return 50 + Math.round(((f.paginaCorrente ?? 0) / Math.max(1, f.pagine ?? 1)) * 50)
}

/** Estrae il testo dei file uno alla volta: su iPad la memoria è poca. */
async function leggiFile(lista: FileList, suScartati: (nomi: string[]) => void) {
  const st = useStudio.getState
  const scartati: string[] = []
  const coda: { file: File; kind: CourseFile['kind']; id: string }[] = []
  for (const file of Array.from(lista)) {
    const kind = tipo(file)
    if (!kind) {
      scartati.push(file.name)
      continue
    }
    const id = nuovoId('corso')
    coda.push({ file, kind, id })
    st().aggiungiCourseFile({ id, name: file.name, size: file.size, kind, progress: 0, status: 'lettura' })
  }
  suScartati(scartati)

  for (const voce of coda) {
    const aggiorna = (patch: Partial<CourseFile>) => st().aggiornaCourseFile(voce.id, patch)
    try {
      let pagine: string[]
      if (voce.kind === 'pdf') {
        const buffer = await voce.file.arrayBuffer()
        aggiorna({ progress: 100, status: 'estrazione' })
        const esito = await estraiPdf(buffer, (corrente, totale) => aggiorna({ paginaCorrente: corrente, pagine: totale }))
        if (esito.scansionato) {
          throw new Error(
            'Il PDF non ha testo selezionabile (è una scansione). Esportalo con il riconoscimento del testo (OCR) e ricaricalo.',
          )
        }
        pagine = esito.pagine
      } else {
        const testo = await voce.file.text()
        if (!testo.trim()) throw new Error('File di testo vuoto.')
        pagine = pagineDaTesto(testo)
      }
      const passaggi = suddividi(voce.id, voce.file.name, pagine)
      if (passaggi.length === 0) throw new Error('Nessun testo leggibile nel file.')
      await aggiungiAlCorpus(voce.id, passaggi)
      aggiorna({ status: 'pronto', progress: 100, pagine: pagine.length, paginaCorrente: pagine.length, passaggi: passaggi.length })
      logOk(null, `Materiale del corso: "${voce.file.name}" letto — ${pagine.length} pagine, ${passaggi.length} passaggi.`)
    } catch (err) {
      const messaggio = err instanceof Error ? err.message : 'Lettura non riuscita.'
      aggiorna({ status: 'errore', progress: 100, errore: messaggio })
      logAvviso(null, `Materiale del corso: "${voce.file.name}" — ${messaggio}`)
    }
  }
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
          if (e.dataTransfer.files.length) void leggiFile(e.dataTransfer.files, setScartati)
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
            if (e.target.files?.length) void leggiFile(e.target.files, setScartati)
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
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const modello = useStudio((s) => s.preferenze.modelli.lettore)
  const vai = useStudio((s) => s.vai)
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

      {!haChiave ? (
        <p className="allerta">
          Serve la chiave API.{' '}
          <button type="button" className="link" onClick={() => vai('impostazioni')}>
            Impostazioni
          </button>
        </p>
      ) : pronti === 0 ? (
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
              ? `Costo stimato ${formattaDollari(stima.minimo)} – ${formattaDollari(stima.massimo)} con ${modello}. Procedo?`
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

export function Corso() {
  return (
    <div className="griglia-due">
      <div>
        <Caricamento />
        <CercaNelCorso />
      </div>
      <Quadro />
    </div>
  )
}
