import { useMemo } from 'react'
import { analizzaStile } from '../../domain/stileTesto'
import { useStudio } from '../../store'
import type { Sezione } from '../../types'

/** Rilevatore di frasi tipiche dell'IA e di termini diversi dal lessico del corso, calcolato in codice. */
export function useStile(sez: Sezione) {
  const glossario = useStudio((s) => s.progetto.glossario)
  const segnalazioni = useMemo(() => analizzaStile(sez.testo, glossario), [sez.testo, glossario])
  const lessico = segnalazioni.filter((s) => s.tipo === 'lessico').length
  return { segnalazioni, lessico, ia: segnalazioni.length - lessico }
}

/** Testo del bottoncino nella barra sotto il foglio. */
export function etichettaStile(sez: Sezione, ia: number, lessico: number): string {
  if (!sez.testo.trim()) return 'Frasi da IA: —'
  return `Frasi da IA: ${ia} · parole del corso: ${lessico === 0 ? 'ok' : `${lessico} da sistemare`}`
}
