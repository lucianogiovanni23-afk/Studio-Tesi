import { controllaInCodice } from '../agents/revisoreCitazioni'

/** Controllo gratuito delle citazioni di una sezione, raccontato dallo Scrittore. */
export async function verificaCitazioniSezione(capitoloId: string, sezioneId: string): Promise<string> {
  const e = controllaInCodice(capitoloId, sezioneId)
  if (e.citazioni === 0 && e.senzaCitazione.length === 0) return 'In questa sezione non ci sono citazioni da controllare.'
  return [
    `Ho ricontrollato ${e.citazioni} citazioni sul testo delle fonti: ${e.verdi} verdi, ${e.ambra} ambra, ${e.rosse} rosse.`,
    e.senzaCitazione.length ? `Nel testo ci sono marcatori senza estratto (${e.senzaCitazione.join(', ')}): vanno sistemati.` : '',
    e.rosse || e.ambra ? 'Apri il foglio e tocca i marcatori colorati per vedere cosa non torna.' : 'Va tutto bene.',
  ]
    .filter(Boolean)
    .join(' ')
}
