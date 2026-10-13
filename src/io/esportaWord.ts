import { bibliografia } from '../domain/bibliografia'
import { paragrafi, partiParagrafo } from '../domain/citazioniTesto'
import { frontespizioDi } from '../domain/ritmo'
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

/** Centimetri in twip (1 cm = 567 twip). */
const cm = (n: number) => Math.round(n * 567)

/**
 * Costruisce il file Word pronto da consegnare: frontespizio con i dati delle
 * Impostazioni, indice automatico (Word lo aggiorna all'apertura), numeri di
 * pagina in basso, margini da tesi (3 cm a sinistra per la rilegatura),
 * carattere 12 con interlinea 1,5, testo giustificato, titoli numerati con gli
 * stili di Word, un capitolo per pagina, note a piè di pagina vere nello stile
 * note e bibliografia in fondo. La libreria si scarica solo adesso.
 */
export async function costruisciWord(opzioni: OpzioniWord): Promise<{ blob: Blob; nome: string }> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    FootnoteReferenceRun,
    HeadingLevel,
    Packer,
    PageNumber,
    Paragraph,
    Table,
    TableCell,
    TableOfContents,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx')
  const p = useStudio.getState().progetto
  const stile = p.stileCitazione
  const fr = frontespizioDi(p)
  const font = fr.carattere
  const tuttaLaTesi = !opzioni.capitoloId
  const capitoli = opzioni.capitoloId ? p.capitoli.filter((c) => c.id === opzioni.capitoloId) : p.capitoli
  if (capitoli.length === 0) throw new Error('Non trovo più questo capitolo.')

  type Blocco = InstanceType<typeof Paragraph> | InstanceType<typeof Table> | InstanceType<typeof TableOfContents>
  const note: Record<number, { children: InstanceType<typeof Paragraph>[] }> = {}
  let prossimaNota = 1
  const margini = { top: cm(2.5), bottom: cm(2.5), right: cm(2.5), left: cm(3), header: cm(1.25), footer: cm(1.25) }

  // --- frontespizio --------------------------------------------------------
  const centrato = (testo: string, o: { size?: number; bold?: boolean; italics?: boolean; allCaps?: boolean; prima?: number; dopo?: number } = {}) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: o.prima ?? 0, after: o.dopo ?? 0, line: (o.size ?? 24) > 28 ? 360 : 276 },
      children: [new TextRun({ text: testo, size: o.size ?? 24, bold: o.bold, italics: o.italics, allCaps: o.allCaps })],
    })

  const frontespizio: Blocco[] = []
  if (opzioni.conFrontespizio) {
    if (fr.universita.trim()) frontespizio.push(centrato(fr.universita.trim(), { size: 30, bold: true, allCaps: true, dopo: 120 }))
    if (fr.dipartimento.trim()) frontespizio.push(centrato(fr.dipartimento.trim(), { size: 26, dopo: 80 }))
    if (fr.corsoDiLaurea.trim()) frontespizio.push(centrato(fr.corsoDiLaurea.trim(), { size: 24, italics: true }))
    frontespizio.push(
      centrato('Tesi di laurea in Finanza Aziendale', { size: 24, italics: true, prima: 2200, dopo: 360 }),
      centrato(p.titolo, { size: 34, bold: true, dopo: 2400 }),
    )
    const senzaBordi = {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    }
    const colonna = (righe: { testo: string; bold?: boolean; italics?: boolean }[], allineamento: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
      new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        borders: senzaBordi,
        children: righe.map(
          (r) =>
            new Paragraph({
              alignment: allineamento,
              spacing: { line: 276, after: 60 },
              children: [new TextRun({ text: r.testo, bold: r.bold, italics: r.italics })],
            }),
        ),
      })
    const sinistra = [
      { testo: 'Relatore', italics: true },
      { testo: fr.relatore.trim() || '______________________', bold: true },
      ...(fr.correlatore.trim() ? [{ testo: 'Correlatore', italics: true }, { testo: fr.correlatore.trim(), bold: true }] : []),
    ]
    const destra = [
      { testo: 'Candidato', italics: true },
      { testo: fr.candidato.trim() || '______________________', bold: true },
      ...(fr.matricola.trim() ? [{ testo: `Matricola ${fr.matricola.trim()}` }] : []),
    ]
    frontespizio.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...senzaBordi, insideHorizontal: senzaBordi.top, insideVertical: senzaBordi.top },
        rows: [new TableRow({ children: [colonna(sinistra, AlignmentType.LEFT), colonna(destra, AlignmentType.RIGHT)] })],
      }),
    )
    if (fr.annoAccademico.trim()) frontespizio.push(centrato(`Anno accademico ${fr.annoAccademico.trim()}`, { prima: 2000 }))
  }

  // --- indice e testo --------------------------------------------------------
  const corpo: Blocco[] = []
  if (tuttaLaTesi) {
    corpo.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 240 },
        children: [new TextRun({ text: 'Indice', bold: true, size: 32 })],
      }),
      new TableOfContents('Indice', { hyperlink: true, headingStyleRange: '1-2' }),
    )
  }

  capitoli.forEach((c, k) => {
    const n = p.capitoli.indexOf(c) + 1
    corpo.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        // Ogni capitolo comincia su una pagina nuova.
        pageBreakBefore: corpo.length > 0 || k > 0,
        children: [new TextRun(`${n}. ${c.titolo}`)],
      }),
    )
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
          note[id] = {
            children: [
              new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 240, after: 0 }, children: [new TextRun({ text: parte.testo, size: 20 })] }),
            ],
          }
          return new FootnoteReferenceRun(id)
        })
        corpo.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { firstLine: cm(0.6) }, children: runs }))
      }
    })
  })

  if (opzioni.conBibliografia) {
    const biblio = bibliografia(capitoli, p.fonti, stile)
    corpo.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('Bibliografia')] }))
    if (biblio.voci.length === 0) corpo.push(new Paragraph({ children: [new TextRun({ text: 'Nessuna fonte citata.', italics: true })] }))
    for (const v of biblio.voci) {
      corpo.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: cm(0.75), hanging: cm(0.75) },
          spacing: { after: 120 },
          children: [new TextRun(v.testo)],
        }),
      )
    }
    if (biblio.corso.length) {
      corpo.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Materiale del corso')] }))
      for (const f of biblio.corso) {
        corpo.push(new Paragraph({ indent: { left: cm(0.75), hanging: cm(0.75) }, spacing: { after: 120 }, children: [new TextRun(f)] }))
      }
    }
  }

  const piede = new Footer({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 22 })] })],
  })

  const titoli = { font, color: '000000', bold: true }
  const documento = new Document({
    creator: fr.candidato.trim() || 'Studio tesi',
    title: p.titolo,
    description: 'Tesi di laurea in Finanza Aziendale',
    // Word chiede di aggiornare i campi all'apertura: così l'indice prende i numeri di pagina.
    features: { updateFields: true },
    styles: {
      default: {
        document: {
          run: { font, size: 24 },
          paragraph: { spacing: { line: 360, after: 120 }, alignment: AlignmentType.JUSTIFIED },
        },
        heading1: {
          run: { ...titoli, size: 32 },
          paragraph: { spacing: { before: 480, after: 360, line: 276 }, alignment: AlignmentType.LEFT, keepNext: true },
        },
        heading2: {
          run: { ...titoli, size: 26 },
          paragraph: { spacing: { before: 360, after: 160, line: 276 }, alignment: AlignmentType.LEFT, keepNext: true },
        },
        footnoteText: { run: { font, size: 20 }, paragraph: { spacing: { line: 240, after: 0 } } },
      },
    },
    footnotes: note,
    sections: [
      ...(frontespizio.length ? [{ properties: { page: { margin: margini } }, children: frontespizio }] : []),
      {
        properties: { page: { margin: margini } },
        footers: { default: piede },
        children: corpo,
      },
    ],
  })

  const blob = await Packer.toBlob(documento)
  const nome = `${nomeFile(p.titolo)}${opzioni.capitoloId ? `-capitolo-${p.capitoli.findIndex((c) => c.id === opzioni.capitoloId) + 1}` : ''}.docx`
  return { blob, nome }
}

/** Esporta la tesi (o un capitolo) in Word e la scarica. Restituisce il nome del file. */
export async function esportaWord(opzioni: OpzioniWord): Promise<string> {
  const { blob, nome } = await costruisciWord(opzioni)
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
