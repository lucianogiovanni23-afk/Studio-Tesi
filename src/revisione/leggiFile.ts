import { estraiPdf } from '../agents/corpus'

/**
 * Testo da un file di note del relatore: .txt/.md, .pdf (pdf.js, già usato
 * per il corso) o .docx (che è uno zip: si legge word/document.xml con il
 * DecompressionStream del browser, senza librerie in più).
 */

export const ACCETTA_NOTE = '.txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function testoDaFile(file: File): Promise<string> {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.pdf') || file.type === 'application/pdf') {
    const { pagine, scansionato } = await estraiPdf(await file.arrayBuffer(), undefined, 60)
    if (scansionato) throw new Error('Questo PDF è una scansione (un\'immagine): non riesco a leggerne il testo. Copia le note a mano.')
    return pagine.join('\n\n')
  }
  if (nome.endsWith('.docx')) return testoDaDocx(await file.arrayBuffer())
  if (nome.endsWith('.doc')) throw new Error('I file .doc vecchi non li leggo: aprilo in Word e salvalo come .docx, oppure copia il testo.')
  return (await file.text()).replace(/\r/g, '')
}

async function testoDaDocx(buffer: ArrayBuffer): Promise<string> {
  const xml = await leggiDaZip(buffer, 'word/document.xml')
  const commenti = await leggiDaZip(buffer, 'word/comments.xml').catch(() => '')
  const corpo = xmlInTesto(xml)
  // I commenti a margine di Word sono spesso proprio le correzioni del relatore.
  const note = commenti ? xmlInTesto(commenti) : ''
  return note ? `${corpo}\n\nCOMMENTI A MARGINE:\n${note}` : corpo
}

function xmlInTesto(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Legge un file da uno zip cercandolo nella directory centrale. */
async function leggiDaZip(buffer: ArrayBuffer, percorso: string): Promise<string> {
  const v = new DataView(buffer)
  // Fine della directory centrale: firma 0x06054b50, negli ultimi 64 KB.
  let fine = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fine = i
      break
    }
  }
  if (fine < 0) throw new Error('Questo file Word sembra rovinato.')
  const voci = v.getUint16(fine + 10, true)
  let p = v.getUint32(fine + 16, true)
  const dec = new TextDecoder()
  for (let n = 0; n < voci; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break
    const metodo = v.getUint16(p + 10, true)
    const compressi = v.getUint32(p + 20, true)
    const lNome = v.getUint16(p + 28, true)
    const lExtra = v.getUint16(p + 30, true)
    const lCommento = v.getUint16(p + 32, true)
    const locale = v.getUint32(p + 42, true)
    const nome = dec.decode(new Uint8Array(buffer, p + 46, lNome))
    if (nome === percorso) {
      const inizio = locale + 30 + v.getUint16(locale + 26, true) + v.getUint16(locale + 28, true)
      const dati = new Uint8Array(buffer, inizio, compressi)
      if (metodo === 0) return dec.decode(dati)
      if (metodo !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Questo browser non riesce ad aprire i file Word: copia il testo delle note.')
      const flusso = new Blob([dati]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return await new Response(flusso).text()
    }
    p += 46 + lNome + lExtra + lCommento
  }
  throw new Error(`Nel file Word manca ${percorso}.`)
}
