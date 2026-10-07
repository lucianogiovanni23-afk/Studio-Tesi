import { logOk } from '../agents/supervisor'
import { giàInBiblioteca, useStudio } from '../store'
import type { Fonte } from '../types'
import { fonteDaPdf } from './pdfPaper'

/** Aggiunge alla biblioteca i PDF di articoli: la usano la Biblioteca e la conversazione con il Bibliotecario. */
export async function aggiungiPdfInBiblioteca(
  files: FileList | File[],
  suAvanzamento: (testo: string) => void = () => {},
): Promise<{ aggiunte: Fonte[]; note: string[] }> {
  const aggiunte: Fonte[] = []
  const note: string[] = []
  for (const file of Array.from(files)) {
    suAvanzamento(`Leggo "${file.name}"…`)
    try {
      const { fonte, nota } = await fonteDaPdf(file, (n, tot) => suAvanzamento(`Leggo "${file.name}": pagina ${n} di ${tot}`))
      if (giàInBiblioteca(useStudio.getState().progetto.fonti, fonte)) {
        note.push(`"${fonte.titolo}" è già in biblioteca.`)
        continue
      }
      useStudio.getState().aggiungiFonte(fonte)
      const salvata = useStudio.getState().progetto.fonti.find((f) => f.id === fonte.id) ?? fonte
      aggiunte.push(salvata)
      logOk('bibliotecario', `PDF "${file.name}" aggiunto alla biblioteca.`)
      note.push(nota || `"${fonte.titolo}" aggiunto con i metadati di Crossref.`)
    } catch (err) {
      note.push(`"${file.name}": ${err instanceof Error ? err.message : 'lettura non riuscita'}`)
    }
  }
  return { aggiunte, note }
}
