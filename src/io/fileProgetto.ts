import { esportaCorpus, importaCorpus } from '../agents/corpus'
import { normalizzaProgetto, progettoIniziale } from '../domain/progettoIniziale'
import { useStudio } from '../store'
import type { Passaggio, Progetto } from '../types'

/**
 * File di progetto: un unico JSON da spostare fra computer e iPad (via iCloud
 * o Drive). Contiene il progetto e il testo estratto dei PDF; non contiene mai
 * la chiave API né le preferenze del dispositivo.
 */

export const FORMATO = 'studio-tesi-progetto'
export const VERSIONE = 1

export interface FileProgetto {
  formato: typeof FORMATO
  versione: number
  salvatoIl: string
  progetto: Progetto
  corpus: Record<string, Passaggio[]>
}

/** Nessuna chiave API, né token di GitHub, deve finire in un file di progetto. */
function contieneChiave(json: string): boolean {
  // I prefissi delle chiavi, scritti in modo da non comparire letterali nel codice.
  return /sk-an[t]-|githu[b]_pat_|gh[p]_[A-Za-z0-9]{20}/i.test(json)
}

/** Blocca un contenuto che sta per uscire dal browser se contiene una chiave. */
export function controllaSegreti(json: string) {
  if (contieneChiave(json)) {
    throw new Error(
      'Nel progetto c\'è un testo che sembra una chiave API di Anthropic o un token di GitHub, quindi non salvo. Trovalo, toglilo dai testi e poi salva di nuovo.',
    )
  }
}

function nomeFile(titolo: string): string {
  const base = titolo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  const data = new Date().toISOString().slice(0, 10)
  return `${base || 'tesi'}-${data}.studiotesi.json`
}

export function preparaFile(): { nome: string; contenuto: string } {
  const { progetto } = useStudio.getState()
  const dati: FileProgetto = {
    formato: FORMATO,
    versione: VERSIONE,
    salvatoIl: new Date().toISOString(),
    progetto: { ...progetto, salvatoSuFileIl: new Date().toISOString() },
    corpus: esportaCorpus(),
  }
  const contenuto = JSON.stringify(dati)
  controllaSegreti(contenuto)
  return { nome: nomeFile(progetto.titolo), contenuto }
}

/** Scarica il file (su iPad finisce in File, da cui si sposta su iCloud o Drive). */
export function salvaProgetto(): string {
  const { nome, contenuto } = preparaFile()
  const blob = new Blob([contenuto], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  useStudio.getState().segnaSalvatoSuFile()
  return nome
}

export interface AnteprimaFile {
  titolo: string
  salvatoIl: string
  capitoli: number
  parole: number
  fonti: number
  fileCorso: number
  dati: FileProgetto
}

function èOggetto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** Legge e controlla un file di progetto, senza ancora sostituire nulla. */
export async function leggiFileProgetto(file: File): Promise<AnteprimaFile> {
  const testo = await file.text()
  let dati: unknown
  try {
    dati = JSON.parse(testo)
  } catch {
    throw new Error('Questo file non riesco ad aprirlo: non sembra un progetto.')
  }
  if (!èOggetto(dati) || dati.formato !== FORMATO) {
    throw new Error('Questo file non è un progetto di Studio tesi.')
  }
  if (typeof dati.versione !== 'number' || dati.versione > VERSIONE) {
    throw new Error("Questo file viene da una versione più nuova dell'app: ricarica la pagina e riprova.")
  }
  if (!èOggetto(dati.progetto) || !Array.isArray(dati.progetto.capitoli) || !èOggetto(dati.corpus)) {
    throw new Error('Il file del progetto è rovinato o manca qualche pezzo.')
  }
  // I campi mancanti (file di versioni precedenti) prendono il valore iniziale.
  const progetto = normalizzaProgetto({ ...progettoIniziale(), ...(dati.progetto as Partial<Progetto>) } as Progetto)
  const completo: FileProgetto = { ...(dati as unknown as FileProgetto), progetto }
  return {
    titolo: progetto.titolo,
    salvatoIl: String(dati.salvatoIl ?? ''),
    capitoli: progetto.capitoli.length,
    parole: progetto.capitoli.reduce(
      (n, c) => n + c.sezioni.reduce((m, s) => m + s.testo.split(/\s+/).filter(Boolean).length, 0),
      0,
    ),
    fonti: progetto.fonti.length,
    fileCorso: progetto.courseFiles.length,
    dati: completo,
  }
}

/** I file del corso senza testo nel corpus vanno ricaricati. */
export function fileCorsoControllati(progetto: Progetto, corpus: Record<string, Passaggio[]>): Progetto['courseFiles'] {
  return progetto.courseFiles.map((f) =>
    f.status === 'pronto' && !corpus[f.id]
      ? { ...f, status: 'errore' as const, errore: 'Il testo di questo file non era nel progetto: caricalo di nuovo.' }
      : f.status === 'lettura' || f.status === 'estrazione'
        ? { ...f, status: 'errore' as const, errore: 'La lettura si è fermata a metà: carica di nuovo il file.' }
        : f,
  )
}

/** Sostituisce il progetto corrente con quello del file (dopo la conferma in linea). */
export async function apriProgetto(anteprima: AnteprimaFile) {
  const { progetto, corpus } = anteprima.dati
  await importaCorpus(corpus)
  useStudio.getState().sostituisciProgetto({ ...progetto, courseFiles: fileCorsoControllati(progetto, corpus) })
}
