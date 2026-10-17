import { apriDocumentoPdf } from '../agents/corpus'

/**
 * Lettura delle immagini (OCR) dei PDF scansionati, tutta sul dispositivo e
 * senza internet dopo la prima volta: tesseract.js (italiano e inglese) si
 * scarica solo quando serve, dai file dell'app (assets/ocr/, messi lì dalla
 * build; il service worker li conserva alla prima lettura). Le pagine si
 * disegnano con pdf.js a 300 dpi e si leggono una alla volta.
 */

/** Più o meno 300 dpi: la risoluzione con cui tesseract legge meglio. */
const DPI = 300
/** Safari su iPad non disegna tele più grandi di circa 16 milioni di pixel. */
const MAX_PIXEL = 16_000_000

export class LetturaFermata extends Error {
  constructor() {
    super('Hai fermato la lettura delle immagini.')
    this.name = 'AbortError'
  }
}

interface LettoreOcr {
  recognize: (immagine: Blob) => Promise<{ data: { text: string } }>
  terminate: () => Promise<unknown>
}

interface ModuloTesseract {
  createWorker: (lingue: string, oem: number, opzioni: Record<string, unknown>) => Promise<LettoreOcr>
}

function cartellaOcr(): string {
  return new URL('assets/ocr/', document.baseURI).href
}

async function creaLettore(): Promise<LettoreOcr> {
  const modulo = (await import('tesseract.js/dist/tesseract.esm.min.js')) as { default: ModuloTesseract }
  const base = cartellaOcr()
  return modulo.default.createWorker('ita+eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: `${base}lang`,
    // Il lavoratore si carica dal suo file (stessa origine), niente indirizzi blob: né CDN.
    workerBlobURL: false,
    // I file li conserva già il service worker: niente seconda copia in IndexedDB.
    cacheMethod: 'none',
    gzip: true,
  })
}

function tela(larghezza: number, altezza: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = larghezza
  c.height = altezza
  return c
}

function inPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Non riesco a preparare l\'immagine della pagina.'))), 'image/png'))
}

/** Stessa pulizia del testo dei PDF normali. */
function pulisci(testo: string): string {
  return testo.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Legge le pagine di un PDF scansionato. `suPagina(0, totale)` arriva mentre si
 * prepara il lettore, poi una volta per pagina letta.
 */
export async function leggiPdfConOcr(
  dati: ArrayBuffer,
  suPagina: (corrente: number, totale: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const { documento, chiudi } = await apriDocumentoPdf(dati)
  const totale = documento.numPages
  const pagine: string[] = []
  let lettore: LettoreOcr | null = null
  const controlla = () => {
    if (signal?.aborted) throw new LetturaFermata()
  }
  try {
    suPagina(0, totale)
    lettore = await creaLettore()
    controlla()
    for (let n = 1; n <= totale; n++) {
      const pagina = await documento.getPage(n)
      const base = pagina.getViewport({ scale: 1 })
      let scala = DPI / 72
      if (base.width * base.height * scala * scala > MAX_PIXEL) scala = Math.sqrt(MAX_PIXEL / (base.width * base.height))
      const vista = pagina.getViewport({ scale: scala })
      const c = tela(Math.floor(vista.width), Math.floor(vista.height))
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('Questo browser non mi fa disegnare le pagine.')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
      await pagina.render({ canvas: c, canvasContext: ctx, viewport: vista }).promise
      pagina.cleanup()
      controlla()
      const immagine = await inPng(c)
      // La tela si libera subito: su iPad la memoria è poca.
      c.width = 0
      c.height = 0
      const { data } = await lettore.recognize(immagine)
      controlla()
      pagine.push(pulisci(data.text))
      suPagina(n, totale)
    }
    return pagine
  } finally {
    await lettore?.terminate().catch(() => {})
    await chiudi().catch(() => {})
  }
}
