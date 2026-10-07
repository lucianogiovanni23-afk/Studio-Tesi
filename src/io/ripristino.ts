import { tieniSoloNelCorpus } from '../agents/corpus'
import { progettoIniziale } from '../domain/progettoIniziale'
import { useStudio } from '../store'

/**
 * Ricomincia da capo tenendo solo le lezioni del corso (e quello che la
 * lettrice ne ha ricavato). Fonti, testo scritto, ricerche, osservazioni,
 * glossario e conversazioni tornano come al primo avvio. La chiave API, il
 * collegamento fra dispositivi e le preferenze restano.
 */
export async function ripristinaTenendoIlCorso() {
  const { progetto, sostituisciProgetto } = useStudio.getState()
  const nuovo = { ...progettoIniziale(), courseFiles: progetto.courseFiles, quadro: progetto.quadro }
  await tieniSoloNelCorpus(new Set(progetto.courseFiles.map((f) => f.id)))
  sostituisciProgetto(nuovo)
}

/** Cosa sparirà, per farlo vedere prima di confermare. */
export function cosaSiCancella() {
  const p = useStudio.getState().progetto
  const parole = p.capitoli.flatMap((c) => c.sezioni).reduce((n, s) => n + (s.testo?.trim() ? s.testo.trim().split(/\s+/).length : 0), 0)
  return { fonti: p.fonti.length, parole, osservazioni: p.osservazioni.length, lezioni: p.courseFiles.length }
}
