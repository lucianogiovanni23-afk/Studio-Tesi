import { aggiungiAlCorpus, estraiPdf, pagineDaTesto, suddividi } from '../agents/corpus'
import { logAvviso, logOk } from '../agents/supervisor'
import { nuovoId } from '../domain/progettoIniziale'
import { useStudio } from '../store'
import type { CourseFile } from '../types'

/** Lettura dei file del corso: la usano la pagina Corso e la conversazione con la Lettrice. */

export const ACCETTA_CORSO = '.pdf,.txt,.md,application/pdf,text/plain,text/markdown'

function tipo(file: File): CourseFile['kind'] | null {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (nome.endsWith('.txt') || nome.endsWith('.md') || file.type.startsWith('text/')) return 'testo'
  return null
}

/** Estrae il testo dei file uno alla volta: su iPad la memoria è poca. */
export async function caricaFileCorso(lista: FileList | File[], suScartati: (nomi: string[]) => void = () => {}): Promise<{ letti: number; errori: number }> {
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

  let letti = 0
  let errori = 0
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
      letti += 1
      logOk(null, `Materiale del corso: "${voce.file.name}" letto — ${pagine.length} pagine, ${passaggi.length} passaggi.`)
    } catch (err) {
      const messaggio = err instanceof Error ? err.message : 'Lettura non riuscita.'
      errori += 1
      aggiorna({ status: 'errore', progress: 100, errore: messaggio })
      logAvviso(null, `Materiale del corso: "${voce.file.name}" — ${messaggio}`)
    }
  }
  return { letti, errori }
}
