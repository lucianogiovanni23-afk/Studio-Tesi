import { bibliografia } from '../domain/bibliografia'
import { paragrafi, partiParagrafo } from '../domain/citazioniTesto'
import { useStudio } from '../store'

export interface OpzioniWord {
  /** null = tutta la tesi. */
  capitoloId: string | null
  conBibliografia: boolean
  conFrontespizio: boolean
}

function nomeFile(titolo: string): string {
  return (
    titolo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'tesi'
  )
}

/**
 * Esporta la tesi (o un capitolo) in Word, nello stile di citazione scelto:
 * titoli con gli stili "Titolo 1/2" (Word ne ricava l'indice), note a piè di
 * pagina vere nello stile note, bibliografia dai metadati in fondo.
 * La libreria si scarica solo al momento dell'esportazione.
 */
export async function esportaWord(opzioni: OpzioniWord): Promise<string> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, FootnoteReferenceRun } = await import('docx')
  const p = useStudio.getState().progetto
  const stile = p.stileCitazione
  const capitoli = opzioni.capitoloId ? p.capitoli.filter((c) => c.id === opzioni.capitoloId) : p.capitoli
  if (capitoli.length === 0) throw new Error('Non trovo più questo capitolo.')

  const note: Record<number, { children: InstanceType<typeof Paragraph>[] }> = {}
  let prossimaNota = 1
  const corpo: InstanceType<typeof Paragraph>[] = []

  if (opzioni.conFrontespizio) {
    corpo.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 400 }, children: [new TextRun({ text: p.titolo, bold: true, size: 36 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tesi di laurea triennale in Finanza Aziendale', italics: true })] }),
    )
  }

  capitoli.forEach((c) => {
    const n = p.capitoli.indexOf(c) + 1
    corpo.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: opzioni.conFrontespizio || corpo.length > 0, children: [new TextRun(`Capitolo ${n}. ${c.titolo}`)] }))
    c.sezioni.forEach((s, j) => {
      corpo.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`${n}.${j + 1} ${s.titolo}`)] }))
      const pars = paragrafi(s.testo)
      if (pars.length === 0) {
        corpo.push(new Paragraph({ children: [new TextRun({ text: '[Sezione ancora da scrivere]', italics: true, color: '888888' })] }))
        return
      }
      for (const par of pars) {
        const runs = partiParagrafo(par, s.citazioni, p.fonti, stile).map((parte) => {
          if (parte.tipo === 'testo') return new TextRun(parte.testo)
          const id = prossimaNota++
          note[id] = { children: [new Paragraph({ children: [new TextRun({ text: parte.testo, size: 20 })] })] }
          return new FootnoteReferenceRun(id)
        })
        corpo.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 360 }, children: runs }))
      }
    })
  })

  if (opzioni.conBibliografia) {
    const biblio = bibliografia(capitoli, p.fonti, stile)
    corpo.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('Bibliografia')] }))
    if (biblio.voci.length === 0) corpo.push(new Paragraph({ children: [new TextRun({ text: 'Nessuna fonte citata.', italics: true })] }))
    for (const v of biblio.voci) {
      corpo.push(new Paragraph({ indent: { left: 360, hanging: 360 }, spacing: { after: 120 }, children: [new TextRun(v.testo)] }))
    }
    if (biblio.corso.length) {
      corpo.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Materiale del corso')] }))
      for (const f of biblio.corso) corpo.push(new Paragraph({ children: [new TextRun(f)] }))
    }
  }

  const documento = new Document({
    creator: 'Studio tesi',
    title: p.titolo,
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 24 }, paragraph: { spacing: { line: 360, after: 120 } } },
        heading1: { run: { font: 'Times New Roman', size: 32, bold: true }, paragraph: { spacing: { before: 240, after: 240 } } },
        heading2: { run: { font: 'Times New Roman', size: 26, bold: true }, paragraph: { spacing: { before: 240, after: 120 } } },
      },
    },
    footnotes: note,
    sections: [{ children: corpo }],
  })

  const blob = await Packer.toBlob(documento)
  const nome = `${nomeFile(p.titolo)}${opzioni.capitoloId ? `-capitolo-${p.capitoli.findIndex((c) => c.id === opzioni.capitoloId) + 1}` : ''}.docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return nome
}
