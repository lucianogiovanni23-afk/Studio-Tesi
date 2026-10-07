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
        note.push(`"${fonte.titolo}" ce l'hai già in biblioteca.`)
        continue
      }
      useStudio.getState().aggiungiFonte(fonte)
      const salvata = useStudio.getState().progetto.fonti.find((f) => f.id === fonte.id) ?? fonte
      aggiunte.push(salvata)
      logOk('bibliotecario', `Ho messo il PDF "${file.name}" in biblioteca.`)
      note.push(nota || `"${fonte.titolo}" aggiunto: autori, anno e rivista li ho presi da Crossref.`)
    } catch (err) {
      note.push(`"${file.name}": ${err instanceof Error ? err.message : 'non sono riuscito a leggerlo'}`)
    }
  }
  return { aggiunte, note }
}
