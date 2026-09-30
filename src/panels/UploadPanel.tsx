import { useMemo, useRef, useState } from 'react'
import { leggiCsv, leggiExcel, riepilogaTabelle, totaleRighe } from '../agents/caseData'
import {
  aggiungiAlCorpus,
  arrayBufferInBase64,
  estraiPdf,
  pagineDaTesto,
  rimuoviDalCorpus,
  suddividi,
} from '../agents/corpus'
import { logAvviso, logInfo, logOk } from '../agents/supervisor'
import { daRicaricare as vaRicaricato, useStudioStore } from '../store'
import type { CaseFile, CourseFile } from '../types'
import { useStatisticheCorpus } from './useCorpus'

/** Oltre questa dimensione un PDF scansionato non può essere allegato alle richieste. */
const MAX_SCANSIONATO = 15 * 1024 * 1024

const ACCETTA_CORSO = '.pdf,.txt,.md,application/pdf,text/plain,text/markdown'
const ACCETTA_CASO = '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function formatta(byte: number): string {
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`
}

function idUnico(nome: string, size: number): string {
  return `${nome}-${size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Legge un file aggiornando la percentuale sui byte effettivamente letti. */
function leggiConProgresso(
  file: File,
  modo: 'dataURL' | 'testo' | 'buffer',
  suProgresso: (percento: number) => void,
): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const lettore = new FileReader()

    lettore.onprogress = (evento) => {
      if (!evento.lengthComputable) return
      suProgresso(Math.min(99, Math.round((evento.loaded / evento.total) * 100)))
    }
    lettore.onerror = () => reject(new Error('Lettura del file non riuscita.'))
    lettore.onload = () => {
      suProgresso(100)
      resolve(lettore.result as string | ArrayBuffer)
    }

    if (modo === 'dataURL') lettore.readAsDataURL(file)
    else if (modo === 'testo') lettore.readAsText(file)
    else lettore.readAsArrayBuffer(file)
  })
}

// ---------------------------------------------------------------------------
// Materiale del corso
// ---------------------------------------------------------------------------

function tipoCorso(file: File): CourseFile['kind'] | null {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (nome.endsWith('.txt') || nome.endsWith('.md') || file.type.startsWith('text/')) return 'testo'
  return null
}

function tipoCaso(file: File): CaseFile['kind'] | null {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.csv')) return 'csv'
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) return 'excel'
  return null
}

function AreaCaricamento({
  titolo,
  descrizione,
  obbligatorio,
  accetta,
  etichettaBottone,
  onFiles,
}: {
  titolo: string
  descrizione: string
  obbligatorio: boolean
  accetta: string
  etichettaBottone: string
  onFiles: (files: FileList | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [trascina, setTrascina] = useState(false)

  return (
    <div
      className={`zona-rilascio ${trascina ? 'zona-rilascio-attiva' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setTrascina(true)
      }}
      onDragLeave={() => setTrascina(false)}
      onDrop={(e) => {
        e.preventDefault()
        setTrascina(false)
        onFiles(e.dataTransfer.files)
      }}
    >
      <h3 className="zona-titolo">
        {titolo}
        <span className={obbligatorio ? 'distintivo distintivo-caldo' : 'distintivo'}>
          {obbligatorio ? 'obbligatorio' : 'consigliato'}
        </span>
      </h3>
      <button type="button" className="bottone bottone-primario" onClick={() => input.current?.click()}>
        {etichettaBottone}
      </button>
      <p className="nota">{descrizione}</p>
      <input
        ref={input}
        type="file"
        accept={accetta}
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function BarraProgresso({ percento }: { percento: number }) {
  return (
    <span className="progresso">
      <span className="progresso-barra" style={{ width: `${percento}%` }} />
    </span>
  )
}

export function UploadPanel() {
  const courseFiles = useStudioStore((s) => s.courseFiles)
  const caseFiles = useStudioStore((s) => s.caseFiles)
  const argomento = useStudioStore((s) => s.argomento)
  const capitolo = useStudioStore((s) => s.capitolo)
  const setArgomento = useStudioStore((s) => s.setArgomento)
  const setCapitolo = useStudioStore((s) => s.setCapitolo)
  const rimuoviCourseFile = useStudioStore((s) => s.rimuoviCourseFile)
  const rimuoviCaseFile = useStudioStore((s) => s.rimuoviCaseFile)
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)
  const statistiche = useStatisticheCorpus()
  // Derivato con useMemo: un selettore che costruisce un array nuovo a ogni
  // chiamata farebbe ri-renderizzare all'infinito.
  const daRicaricare = useMemo(() => courseFiles.filter(vaRicaricato), [courseFiles])

  const [scartati, setScartati] = useState<string[]>([])
  const [anteprima, setAnteprima] = useState<string | null>(null)

  const gestisciCorso = async (lista: FileList | null) => {
    if (!lista || lista.length === 0) return
    const store = useStudioStore.getState()
    const cattivi: string[] = []
    const buoni: { file: File; kind: CourseFile['kind']; id: string }[] = []

    for (const file of Array.from(lista)) {
      const kind = tipoCorso(file)
      if (!kind) {
        cattivi.push(file.name)
        continue
      }
      const id = idUnico(file.name, file.size)
      buoni.push({ file, kind, id })
      store.aggiungiCourseFile({
        id,
        name: file.name,
        size: file.size,
        kind,
        progress: 0,
        status: 'lettura',
      })
    }

    setScartati(cattivi)
    if (cattivi.length > 0) logAvviso(null, `File ignorati (formato non supportato): ${cattivi.join(', ')}.`)

    // Uno alla volta: l'estrazione del testo è pesante e su iPad la memoria è poca.
    for (const voce of buoni) {
      const aggiorna = (patch: Partial<CourseFile>) => useStudioStore.getState().aggiornaCourseFile(voce.id, patch)
      try {
        let pagine: string[]
        let scansionato = false
        let base64: string | undefined

        if (voce.kind === 'pdf') {
          const buffer = (await leggiConProgresso(voce.file, 'buffer', (p) => aggiorna({ progress: p }))) as ArrayBuffer
          aggiorna({ status: 'estrazione' })
          const esito = await estraiPdf(buffer, (corrente, totale) =>
            aggiorna({ paginaCorrente: corrente, pagine: totale }),
          )
          pagine = esito.pagine
          scansionato = esito.scansionato
          if (scansionato) {
            if (voce.file.size > MAX_SCANSIONATO) {
              throw new Error(
                'PDF senza testo selezionabile (scansione) e troppo grande per essere inviato come immagini. Esportalo con il riconoscimento del testo (OCR) e ricaricalo.',
              )
            }
            base64 = arrayBufferInBase64(buffer)
          }
        } else {
          const testo = (await leggiConProgresso(voce.file, 'testo', (p) => aggiorna({ progress: p }))) as string
          if (!testo.trim()) throw new Error('File di testo vuoto.')
          pagine = pagineDaTesto(testo)
        }

        const passaggi = scansionato ? [] : suddividi(voce.id, voce.file.name, pagine)
        if (!scansionato && passaggi.length === 0) throw new Error('Nessun testo leggibile nel file.')
        await aggiungiAlCorpus(voce.id, passaggi)

        aggiorna({
          status: 'pronto',
          progress: 100,
          pagine: pagine.length,
          paginaCorrente: pagine.length,
          passaggi: passaggi.length,
          scansionato,
          base64,
        })
        logOk(
          null,
          scansionato
            ? `Materiale del corso: "${voce.file.name}" è una scansione (${pagine.length} pagine): verrà letto dalle immagini.`
            : `Materiale del corso: "${voce.file.name}" letto — ${pagine.length} pagine, ${passaggi.length} passaggi.`,
        )
      } catch (err) {
        const messaggio = err instanceof Error ? err.message : 'Lettura non riuscita.'
        aggiorna({ status: 'errore', progress: 100, errore: messaggio })
        logAvviso(null, `Materiale del corso: "${voce.file.name}" — ${messaggio}`)
      }
    }
    logInfo(null, 'Materiale del corso indicizzato: a ogni chiamata gli agenti ricevono i passaggi più pertinenti.')
  }

  const gestisciCaso = async (lista: FileList | null) => {
    if (!lista || lista.length === 0) return
    const store = useStudioStore.getState()
    const cattivi: string[] = []
    const buoni: { file: File; kind: CaseFile['kind']; id: string }[] = []

    for (const file of Array.from(lista)) {
      const kind = tipoCaso(file)
      if (!kind) {
        cattivi.push(file.name)
        continue
      }
      const id = idUnico(file.name, file.size)
      buoni.push({ file, kind, id })
      store.aggiungiCaseFile({
        id,
        name: file.name,
        size: file.size,
        kind,
        progress: 0,
        status: 'lettura',
        tabelle: [],
        riepilogo: '',
      })
    }

    if (cattivi.length > 0) {
      setScartati((s) => [...s, ...cattivi])
      logAvviso(null, `Dati del caso ignorati (formato non supportato): ${cattivi.join(', ')}.`)
    }

    for (const voce of buoni) {
      try {
        const tabelle =
          voce.kind === 'csv'
            ? leggiCsv(
                (await leggiConProgresso(voce.file, 'testo', (p) =>
                  useStudioStore.getState().aggiornaCaseFile(voce.id, { progress: p }),
                )) as string,
                voce.file.name,
              )
            : leggiExcel(
                (await leggiConProgresso(voce.file, 'buffer', (p) =>
                  useStudioStore.getState().aggiornaCaseFile(voce.id, { progress: p }),
                )) as ArrayBuffer,
              )

        if (tabelle.length === 0 || totaleRighe(tabelle) === 0) {
          throw new Error('Nessuna riga leggibile nel file.')
        }

        useStudioStore.getState().aggiornaCaseFile(voce.id, {
          status: 'pronto',
          progress: 100,
          tabelle,
          riepilogo: riepilogaTabelle(voce.file.name, tabelle),
        })
        logOk(
          null,
          `Dati del caso: "${voce.file.name}" letto — ${tabelle.length} foglio/i, ${totaleRighe(tabelle)} righe.`,
        )
      } catch (err) {
        const messaggio = err instanceof Error ? err.message : 'Lettura non riuscita.'
        useStudioStore.getState().aggiornaCaseFile(voce.id, { status: 'errore', progress: 100, errore: messaggio })
        logAvviso(null, `Dati del caso: "${voce.file.name}" — ${messaggio}`)
      }
    }
  }

  // Lettura dei byte e estrazione del testo pesano metà ciascuna.
  const avanzamento = (f: CourseFile) => {
    if (f.status === 'pronto' || f.status === 'errore') return 100
    if (f.status === 'lettura') return Math.round(f.progress / 2)
    return 50 + Math.round(((f.paginaCorrente ?? 0) / Math.max(1, f.pagine ?? 1)) * 50)
  }
  const complessivoCorso =
    courseFiles.length === 0
      ? 0
      : Math.round(courseFiles.reduce((s, f) => s + avanzamento(f), 0) / courseFiles.length)
  const scansionati = courseFiles.filter((f) => f.scansionato).length

  const fileAnteprima = caseFiles.find((f) => f.id === anteprima)

  return (
    <section className="pannello pannello-materiale">
      <h2 className="pannello-titolo filetto-doppio">Materiale e dati</h2>

      <AreaCaricamento
        titolo="Materiale del corso — Finanza Aziendale"
        descrizione="PDF delle lezioni, dispense e appunti in .txt / .md, anche molti insieme. Il testo viene estratto nel browser, diviso in passaggi con file e pagina e salvato sul dispositivo: a ogni chiamata gli agenti ricevono solo i passaggi più pertinenti."
        obbligatorio
        accetta={ACCETTA_CORSO}
        etichettaBottone="Carica il materiale del corso"
        onFiles={(l) => void gestisciCorso(l)}
      />

      {courseFiles.length > 0 && (
        <>
          <div className="testa-progresso">
            <span>
              Lettura complessiva: <strong>{complessivoCorso}%</strong>
            </span>
            <span className="nota">
              {courseFiles.length} file · {statistiche.passaggi} passaggi ·{' '}
              {Math.round(statistiche.caratteri / 1000)} mila caratteri
              {scansionati > 0 ? ` · ${scansionati} scansioni` : ''}
            </span>
          </div>
          <BarraProgresso percento={complessivoCorso} />

          <ul className={`elenco-file ${courseFiles.length > 8 ? 'elenco-lungo' : ''}`}>
            {courseFiles.map((f) => (
              <li key={f.id} className={`riga-file riga-${f.status}`}>
                <span className="spunta" aria-hidden>
                  {f.status === 'pronto' ? '✓' : f.status === 'errore' ? '⚠' : '…'}
                </span>
                <span className="nome-file" title={f.name}>
                  {f.name}
                </span>
                <span className="meta-file">
                  {f.status === 'estrazione'
                    ? `estraggo il testo: pagina ${f.paginaCorrente ?? 0} di ${f.pagine ?? '…'}`
                    : f.status === 'pronto'
                      ? f.scansionato
                        ? `scansione · ${f.pagine} pagine · letta dalle immagini`
                        : `${f.pagine ?? '?'} pagine · ${f.passaggi ?? 0} passaggi`
                      : `${f.kind === 'pdf' ? 'PDF' : 'testo'} · ${formatta(f.size)}`}
                </span>
                <span className="percentuale">{avanzamento(f)}%</span>
                <button
                  type="button"
                  className="bottone bottone-minuscolo"
                  onClick={() => {
                    // Il corpus in memoria si aggiorna subito, prima che l'elenco cambi.
                    void rimuoviDalCorpus(f.id)
                    rimuoviCourseFile(f.id)
                  }}
                  disabled={inEsecuzione}
                  aria-label={`Rimuovi ${f.name}`}
                >
                  ✕
                </button>
                {f.errore && <span className="errore-file">{f.errore}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {daRicaricare.length > 0 && (
        <p className="allerta allerta-avviso">
          I PDF scansionati non vengono salvati sul dispositivo: dopo un ricaricamento della pagina
          vanno ricaricati. File da ricaricare: {daRicaricare.map((f) => f.name).join(', ')}.
        </p>
      )}

      <div className="separatore" />

      <AreaCaricamento
        titolo="Dati del caso (più stagioni)"
        descrizione="CSV ed Excel con ricavi, ingressi per evento e costi su più stagioni. Sono dati privati: senza di essi il Ricercatore trova solo meteo e letteratura."
        obbligatorio={false}
        accetta={ACCETTA_CASO}
        etichettaBottone="Carica i dati del caso"
        onFiles={(l) => void gestisciCaso(l)}
      />

      {caseFiles.length > 0 && (
        <ul className="elenco-file">
          {caseFiles.map((f) => (
            <li key={f.id} className={`riga-file riga-${f.status}`}>
              <span className="spunta" aria-hidden>
                {f.status === 'pronto' ? '✓' : f.status === 'errore' ? '⚠' : '…'}
              </span>
              <span className="nome-file" title={f.name}>
                {f.name}
              </span>
              <span className="meta-file">
                {f.tabelle.length > 0
                  ? `${f.tabelle.length} foglio/i · ${totaleRighe(f.tabelle)} righe`
                  : formatta(f.size)}
              </span>
              <span className="percentuale">{f.progress}%</span>
              {f.status === 'pronto' && (
                <button
                  type="button"
                  className="bottone bottone-minuscolo"
                  onClick={() => setAnteprima(anteprima === f.id ? null : f.id)}
                >
                  {anteprima === f.id ? 'Chiudi' : 'Anteprima'}
                </button>
              )}
              <button
                type="button"
                className="bottone bottone-minuscolo"
                onClick={() => rimuoviCaseFile(f.id)}
                disabled={inEsecuzione}
                aria-label={`Rimuovi ${f.name}`}
              >
                ✕
              </button>
              {f.errore && <span className="errore-file">{f.errore}</span>}
            </li>
          ))}
        </ul>
      )}

      {fileAnteprima && (
        <div className="anteprima-tabella">
          {fileAnteprima.tabelle.map((t) => (
            <div key={t.foglio}>
              <p className="nota">
                <strong>{t.foglio}</strong> — {t.totaleRighe} righe, {t.colonne.length} colonne
              </p>
              <div className="tabella-scorrevole">
                <table>
                  <thead>
                    <tr>
                      {t.colonne.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.righe.map((r, i) => (
                      <tr key={i}>
                        {t.colonne.map((c) => (
                          <td key={c}>{r[c]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {scartati.length > 0 && (
        <p className="allerta allerta-avviso">
          Formato non supportato, file ignorati: {scartati.join(', ')}.
        </p>
      )}

      <div className="separatore" />

      <label className="campo-blocco">
        <span className="campo-etichetta">Argomento della tesi</span>
        <textarea
          className="campo area"
          rows={3}
          value={argomento}
          onChange={(e) => setArgomento(e.target.value)}
          disabled={inEsecuzione}
        />
      </label>

      <label className="campo-blocco">
        <span className="campo-etichetta">Capitolo o sezione da scrivere</span>
        <textarea
          className="campo area"
          rows={2}
          value={capitolo}
          onChange={(e) => setCapitolo(e.target.value)}
          disabled={inEsecuzione}
        />
      </label>
    </section>
  )
}
