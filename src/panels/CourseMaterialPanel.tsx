import { useRef, useState } from 'react'
import { cancelRun, runPipeline } from '../agents/pipeline'
import { logInfo, logOk, logWarn } from '../agents/supervisor'
import { selectCanStart, selectMaterialReady, useStudioStore } from '../store'
import type { CourseFile } from '../types'

const ACCEPTED = '.pdf,.txt,.md,application/pdf,text/plain,text/markdown'

function kindOf(file: File): CourseFile['kind'] | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (name.endsWith('.txt') || name.endsWith('.md')) return 'text'
  if (file.type.startsWith('text/')) return 'text'
  return null
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Legge un file aggiornando la percentuale sui byte effettivamente letti.
 * I PDF diventano base64 (blocchi document), i .txt/.md testo da concatenare.
 */
function readFile(file: File, kind: CourseFile['kind'], id: string): Promise<void> {
  return new Promise((resolve) => {
    const { patchCourseFile } = useStudioStore.getState()
    const reader = new FileReader()

    reader.onprogress = (event) => {
      if (!event.lengthComputable) return
      const percent = Math.min(99, Math.round((event.loaded / event.total) * 100))
      patchCourseFile(id, { progress: percent })
    }

    reader.onerror = () => {
      patchCourseFile(id, {
        status: 'error',
        progress: 100,
        error: 'Lettura del file non riuscita.',
      })
      logWarn(null, `Materiale del corso: lettura di "${file.name}" non riuscita.`)
      resolve()
    }

    reader.onload = () => {
      if (kind === 'pdf') {
        const result = String(reader.result ?? '')
        const base64 = result.slice(result.indexOf(',') + 1)
        if (!base64) {
          patchCourseFile(id, { status: 'error', progress: 100, error: 'PDF vuoto o illeggibile.' })
        } else {
          patchCourseFile(id, { status: 'ready', progress: 100, base64 })
        }
      } else {
        const text = String(reader.result ?? '').trim()
        if (!text) {
          patchCourseFile(id, { status: 'error', progress: 100, error: 'File di testo vuoto.' })
        } else {
          patchCourseFile(id, { status: 'ready', progress: 100, text })
        }
      }
      logOk(null, `Materiale del corso: "${file.name}" caricato (${formatSize(file.size)}).`)
      resolve()
    }

    if (kind === 'pdf') reader.readAsDataURL(file)
    else reader.readAsText(file)
  })
}

export function CourseMaterialPanel() {
  const courseFiles = useStudioStore((s) => s.courseFiles)
  const thesisTopic = useStudioStore((s) => s.thesisTopic)
  const chapterBrief = useStudioStore((s) => s.chapterBrief)
  const setThesisTopic = useStudioStore((s) => s.setThesisTopic)
  const setChapterBrief = useStudioStore((s) => s.setChapterBrief)
  const removeCourseFile = useStudioStore((s) => s.removeCourseFile)
  const running = useStudioStore((s) => s.running)
  const globalError = useStudioStore((s) => s.globalError)
  const canStart = useStudioStore(selectCanStart)
  const materialReady = useStudioStore(selectMaterialReady)
  const apiKey = useStudioStore((s) => s.apiKey)
  const resetRun = useStudioStore((s) => s.resetRun)

  const inputRef = useRef<HTMLInputElement>(null)
  const [rejected, setRejected] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const bad: string[] = []
    const accepted: { file: File; kind: CourseFile['kind']; id: string }[] = []

    for (const file of Array.from(list)) {
      const kind = kindOf(file)
      if (!kind) {
        bad.push(file.name)
        continue
      }
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      accepted.push({ file, kind, id })
      useStudioStore.getState().addCourseFile({
        id,
        name: file.name,
        size: file.size,
        kind,
        progress: 0,
        status: 'reading',
      })
    }

    setRejected(bad)
    if (bad.length > 0) {
      logWarn(null, `File ignorati (formato non supportato): ${bad.join(', ')}.`)
    }

    // Un file alla volta, così la barra mostra il nome di quello in corso.
    for (const item of accepted) {
      await readFile(item.file, item.kind, item.id)
    }
    logInfo(null, 'Materiale del corso pronto come contesto condiviso per tutti e 5 gli agenti.')
  }

  const pdfCount = courseFiles.filter((f) => f.kind === 'pdf').length
  const textCount = courseFiles.filter((f) => f.kind === 'text').length
  const reading = courseFiles.filter((f) => f.status === 'reading')
  const overall =
    courseFiles.length === 0
      ? 0
      : Math.round(courseFiles.reduce((sum, f) => sum + f.progress, 0) / courseFiles.length)

  const missing: string[] = []
  if (!apiKey.trim()) missing.push('la chiave API')
  if (!materialReady) missing.push('il materiale del corso al 100%')
  if (!thesisTopic.trim()) missing.push("l'argomento della tesi")
  if (!chapterBrief.trim()) missing.push('il capitolo da scrivere')

  return (
    <section className="panel panel-material">
      <h2 className="panel-title">
        Passo 1 — Materiale del corso
        <span className="panel-badge">obbligatorio</span>
      </h2>

      <div
        className={`dropzone ${dragging ? 'dropzone-on' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void handleFiles(e.dataTransfer.files)
        }}
      >
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
          Carica il materiale del corso (Finanza Aziendale)
        </button>
        <p className="hint">
          PDF delle lezioni e appunti in .txt / .md. Trascina i file qui oppure usa il pulsante.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {courseFiles.length > 0 && (
        <>
          <div className="progress-head">
            <span>
              Caricamento complessivo: <strong>{overall}%</strong>
            </span>
            <span className="hint">
              {pdfCount} PDF · {textCount} file di testo
            </span>
          </div>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${overall}%` }} />
          </div>
          {reading.length > 0 && (
            <p className="hint">In lettura: {reading.map((f) => f.name).join(', ')}</p>
          )}

          <ul className="file-list">
            {courseFiles.map((file) => (
              <li key={file.id} className={`file-row file-${file.status}`}>
                <span className="file-check" aria-hidden>
                  {file.status === 'ready' ? '✓' : file.status === 'error' ? '⚠' : '…'}
                </span>
                <span className="file-name" title={file.name}>
                  {file.name}
                </span>
                <span className="file-meta">
                  {file.kind === 'pdf' ? 'PDF' : 'testo'} · {formatSize(file.size)}
                </span>
                <span className="file-progress">
                  <span className="progress small">
                    <span className="progress-bar" style={{ width: `${file.progress}%` }} />
                  </span>
                  {file.progress}%
                </span>
                <button
                  type="button"
                  className="btn btn-tiny"
                  onClick={() => removeCourseFile(file.id)}
                  disabled={running}
                  aria-label={`Rimuovi ${file.name}`}
                >
                  ✕
                </button>
                {file.error && <span className="file-error">{file.error}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {rejected.length > 0 && (
        <p className="alert alert-warn">
          Formato non supportato, file ignorati: {rejected.join(', ')}. Sono accettati solo PDF, .txt
          e .md.
        </p>
      )}

      <div className="divider" />

      <label className="field">
        <span className="field-label">Argomento della tesi</span>
        <input
          className="input"
          value={thesisTopic}
          onChange={(e) => setThesisTopic(e.target.value)}
          placeholder="es. La gestione del rischio di portafoglio nelle imprese industriali italiane"
          disabled={running}
        />
      </label>

      <label className="field">
        <span className="field-label">Capitolo o sezione da scrivere</span>
        <textarea
          className="textarea"
          rows={3}
          value={chapterBrief}
          onChange={(e) => setChapterBrief(e.target.value)}
          placeholder="es. Capitolo 2 — Il modello di Markowitz e la frontiera efficiente"
          disabled={running}
        />
      </label>

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary btn-start"
          onClick={() => void runPipeline()}
          disabled={!canStart}
        >
          {running ? 'La squadra è al lavoro…' : 'Avvia la squadra'}
        </button>
        {running ? (
          <button type="button" className="btn btn-ghost" onClick={cancelRun}>
            Interrompi
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={resetRun}>
            Azzera l'esecuzione
          </button>
        )}
      </div>

      {!running && missing.length > 0 && (
        <p className="hint">Per avviare la squadra manca: {missing.join(', ')}.</p>
      )}

      {globalError && <p className="alert alert-error">{globalError}</p>}
    </section>
  )
}
