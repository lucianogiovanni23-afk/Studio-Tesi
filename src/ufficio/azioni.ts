import { controllaInCodice } from '../agents/revisoreCitazioni'

/** Controllo gratuito delle citazioni di una sezione, raccontato dallo Scrittore. */
export async function verificaCitazioniSezione(capitoloId: string, sezioneId: string): Promise<string> {
  const e = controllaInCodice(capitoloId, sezioneId)
  if (e.citazioni === 0 && e.senzaCitazione.length === 0) return 'In questo paragrafo non ci sono citazioni da controllare.'
  return [
    `Ho ricontrollato ${e.citazioni} citazioni sulle fonti: ${e.verdi} verdi, ${e.ambra} gialle, ${e.rosse} rosse.`,
    e.senzaCitazione.length ? `Nel testo ci sono citazioni senza la frase della fonte (${e.senzaCitazione.join(', ')}): vanno sistemate.` : '',
    e.rosse || e.ambra ? 'Apri il foglio e tocca le citazioni colorate per vedere cosa non va.' : 'È tutto a posto.',
  ]
    .filter(Boolean)
    .join(' ')
}
