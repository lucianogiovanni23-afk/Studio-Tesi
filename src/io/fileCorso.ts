import { aggiungiAlCorpus, estraiPdf, pagineDaTesto, suddividi } from '../agents/corpus'
import { logAvviso, logInfo, logOk } from '../agents/supervisor'
import { nuovoId } from '../domain/progettoIniziale'
import { useStudio } from '../store'
import type { CourseFile } from '../types'

/** Lettura dei file del corso: la usano la pagina Corso e la conversazione con la Lettrice. */

/** Letture delle immagini (OCR) in corso, per il tasto Ferma. */
const ocrInCorso = new Map<string, AbortController>()

/** Ferma la lettura delle immagini di un PDF scansionato. */
export function fermaOcr(fileId: string) {
  ocrInCorso.get(fileId)?.abort()
}

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
    // Se lo stesso file era rimasto in errore o da ricaricare, il nuovo prende il suo posto.
    for (const vecchio of st().progetto.courseFiles) {
      if (vecchio.name === file.name && vecchio.status !== 'pronto') st().rimuoviCourseFile(vecchio.id)
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
      let ocr = false
      if (voce.kind === 'pdf') {
        const buffer = await voce.file.arrayBuffer()
        aggiorna({ progress: 100, status: 'estrazione', fase: 'testo' })
        const esito = await estraiPdf(buffer, (corrente, totale) => aggiorna({ paginaCorrente: corrente, pagine: totale }))
        if (esito.scansionato) {
          // PDF fatto di immagini: si legge il testo dalle immagini, qui sul dispositivo.
          const controller = new AbortController()
          ocrInCorso.set(voce.id, controller)
          aggiorna({ fase: 'ocr', paginaCorrente: 0, pagine: esito.pagine.length })
          logInfo(null, `Lezioni del corso: "${voce.file.name}" è una scansione, leggo il testo dalle immagini.`)
          try {
            const { leggiPdfConOcr } = await import('./ocrPdf')
            pagine = await leggiPdfConOcr(buffer, (corrente, totale) => aggiorna({ paginaCorrente: corrente, pagine: totale }), controller.signal)
          } catch (err) {
            if (controller.signal.aborted) throw new Error('Hai fermato la lettura delle immagini. Se vuoi, togli il file e caricalo di nuovo.')
            throw new Error(
              `Questo PDF è una scansione e non sono riuscito a leggere le immagini${err instanceof Error && err.message ? ` (${err.message})` : ''}. Riprova, oppure passalo in un'app che riconosce il testo (OCR) e caricalo di nuovo.`,
            )
          } finally {
            ocrInCorso.delete(voce.id)
          }
          ocr = true
        } else pagine = esito.pagine
      } else {
        const testo = await voce.file.text()
        if (!testo.trim()) throw new Error('Il file è vuoto.')
        pagine = pagineDaTesto(testo)
      }
      // I passaggi letti dalle immagini sono segnati: le citazioni dicono comunque file e pagina.
      const passaggi = suddividi(voce.id, voce.file.name, pagine).map((p) => (ocr ? { ...p, ocr: true } : p))
      if (passaggi.length === 0) {
        throw new Error(ocr ? 'Ho guardato le immagini di questo PDF ma non ci ho trovato testo da leggere.' : 'Nel file non c\'è testo che riesco a leggere.')
      }
      await aggiungiAlCorpus(voce.id, passaggi)
      aggiorna({ status: 'pronto', progress: 100, pagine: pagine.length, paginaCorrente: pagine.length, passaggi: passaggi.length, ...(ocr ? { ocr: true } : {}), fase: undefined })
      letti += 1
      logOk(null, `Lezioni del corso: ho letto "${voce.file.name}" (${pagine.length} pagine${ocr ? ', dalle immagini' : ''}).`)
    } catch (err) {
      const messaggio = err instanceof Error ? err.message : 'Non sono riuscito a leggerlo.'
      errori += 1
      aggiorna({ status: 'errore', progress: 100, errore: messaggio })
      logAvviso(null, `Lezioni del corso: "${voce.file.name}" — ${messaggio}`)
    }
  }
  return { letti, errori }
}
