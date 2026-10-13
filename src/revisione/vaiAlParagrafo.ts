import { normalizza } from '../agents/citations'
import { paragrafi } from '../domain/citazioniTesto'
import { useStudio } from '../store'

/**
 * Apre la sezione nella Scrittura e, quando l'editor è pronto, seleziona il
 * paragrafo: prima lo cerca per il suo inizio (il testo può essere cambiato),
 * poi per numero.
 */
export function vaiAlParagrafo(capitoloId: string, sezioneId: string | null, paragrafo: number | null, passo: string) {
  useStudio.getState().apriSezione(capitoloId, sezioneId)
  if (!sezioneId || (!paragrafo && !passo)) return
  const inizio = performance.now()
  const prova = () => {
    const editor = document.querySelector<HTMLTextAreaElement>('textarea.editor-testo')
    if (!editor) {
      if (performance.now() - inizio < 3000) requestAnimationFrame(prova)
      return
    }
    const testo = editor.value
    const pars = paragrafi(testo)
    const chiave = normalizza(passo).slice(0, 50)
    let indice = chiave ? pars.findIndex((p) => normalizza(p).startsWith(chiave)) : -1
    // Il passo può essere anche una frase in mezzo al paragrafo.
    if (indice < 0 && chiave) indice = pars.findIndex((p) => normalizza(p).includes(chiave))
    if (indice < 0 && paragrafo) indice = Math.min(paragrafo, pars.length) - 1
    if (indice < 0) return
    const da = testo.indexOf(pars[indice])
    if (da < 0) return
    editor.focus({ preventScroll: true })
    editor.setSelectionRange(da, da + pars[indice].length)
    // Scorre all'altezza del paragrafo, sia dentro l'editor sia nella pagina.
    const quota = da / Math.max(1, testo.length)
    editor.scrollTop = Math.max(0, quota * editor.scrollHeight - editor.clientHeight / 3)
    const r = editor.getBoundingClientRect()
    const y = window.scrollY + r.top + quota * r.height - window.innerHeight / 3
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  }
  requestAnimationFrame(prova)
}
