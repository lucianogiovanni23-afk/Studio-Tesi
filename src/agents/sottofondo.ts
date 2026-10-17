import type { Richiesta } from './lavori'

/**
 * Il collegamento con il lavoratore in sottofondo. Se il lavoratore non parte
 * (browser vecchio, errore nel caricarlo) o si rompe, la stessa richiesta la
 * esegue la pagina con lo stesso codice: il risultato non cambia.
 *
 * Dove gira è scritto in <html data-sottofondo="lavoratore|pagina">: serve a
 * capire, anche nei collaudi, quale strada è stata usata.
 */

type Avanzamento = (quota: number, fase: string) => void

interface InAttesa {
  risolvi: (x: unknown) => void
  rifiuta: (e: unknown) => void
  avanzamento?: Avanzamento
  richiesta: Richiesta
}

let lavoratore: Worker | null = null
let avvio: Promise<Worker | null> | null = null
let guasto = false
let prossimo = 1
const attese = new Map<number, InAttesa>()

function segna(dove: 'lavoratore' | 'pagina') {
  try {
    document.documentElement.dataset.sottofondo = dove
  } catch {
    // Nessun documento: niente da segnare.
  }
}

/** Errore che arriva dal lavoratore con il suo nome (FirmaDiversa, AbortError…). */
export class ErroreLavoro extends Error {
  constructor(nome: string, messaggio: string) {
    super(messaggio)
    this.name = nome
  }
}

function abbandona(motivo: string) {
  guasto = true
  try {
    lavoratore?.terminate()
  } catch {
    // già chiuso
  }
  lavoratore = null
  // Le richieste rimaste a metà le rifà la pagina.
  const rimaste = [...attese.entries()]
  attese.clear()
  for (const [id, a] of rimaste) void inPagina(id, a.richiesta, a.avanzamento).then(a.risolvi, a.rifiuta)
  console.info(`Lavori in sottofondo nella pagina: ${motivo}`)
}

function avvia(): Promise<Worker | null> {
  if (guasto) return Promise.resolve(null)
  if (lavoratore) return Promise.resolve(lavoratore)
  avvio ??= (async () => {
    try {
      const { default: Lavoratore } = await import('./sottofondo.worker?worker')
      const w = new Lavoratore()
      await new Promise<void>((pronto, errore) => {
        const t = setTimeout(() => errore(new Error('il lavoratore non risponde')), 15_000)
        w.onerror = (e) => {
          clearTimeout(t)
          errore(new Error(e.message || 'errore nel lavoratore'))
        }
        w.onmessage = (e: MessageEvent<{ pronto?: boolean }>) => {
          if (e.data?.pronto) {
            clearTimeout(t)
            pronto()
          }
        }
      })
      w.onmessage = (e: MessageEvent<{ id: number; esito?: unknown; errore?: { nome: string; messaggio: string }; avanzamento?: number; fase?: string }>) => {
        const a = attese.get(e.data.id)
        if (!a) return
        if (typeof e.data.avanzamento === 'number') {
          a.avanzamento?.(e.data.avanzamento, e.data.fase ?? '')
          return
        }
        attese.delete(e.data.id)
        if (e.data.errore) a.rifiuta(new ErroreLavoro(e.data.errore.nome, e.data.errore.messaggio))
        else a.risolvi(e.data.esito)
      }
      w.onerror = (e) => {
        e.preventDefault()
        abbandona(e.message || 'errore nel lavoratore')
      }
      w.onmessageerror = () => abbandona('messaggio illeggibile')
      lavoratore = w
      return w
    } catch (err) {
      abbandona(err instanceof Error ? err.message : 'non parte')
      return null
    } finally {
      avvio = null
    }
  })()
  return avvio
}

async function inPagina(id: number, richiesta: Richiesta, avanzamento?: Avanzamento): Promise<unknown> {
  segna('pagina')
  const { esegui } = await import('./lavori')
  return esegui(id, richiesta, avanzamento ?? (() => {}), () => new Promise((r) => setTimeout(r, 0)))
}

/** Esegue un lavoro: nel lavoratore se possibile, altrimenti nella pagina. Restituisce anche l'id (per fermarlo). */
export function chiedi<T>(richiesta: Richiesta, avanzamento?: Avanzamento): { id: number; esito: Promise<T> } {
  const id = prossimo++
  const esito = (async () => {
    const w = await avvia()
    if (!w) return (await inPagina(id, richiesta, avanzamento)) as T
    segna('lavoratore')
    return new Promise<T>((risolvi, rifiuta) => {
      attese.set(id, { risolvi: risolvi as (x: unknown) => void, rifiuta, avanzamento, richiesta })
      w.postMessage({ id, richiesta })
    })
  })()
  return { id, esito }
}

/** Ferma un lavoro lungo (il controllo delle frasi simili). */
export async function fermaLavoro(id: number) {
  if (lavoratore && !guasto) lavoratore.postMessage({ id, ferma: true })
  else (await import('./lavori')).ferma(id)
}
