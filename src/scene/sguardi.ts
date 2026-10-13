/**
 * Quando entri nella sala i colleghi alzano lo sguardo verso di te per un
 * attimo, uno dopo l'altro, poi tornano al lavoro.
 */
let inizio = -1

/** Ritardo (s) tra una persona e l'altra, e quanto dura l'occhiata. */
const SCALINO = 0.22
const DURATA = 1.7

export function segnalaIngresso() {
  inizio = performance.now() / 1000
}

/** True mentre la persona (ordine = posizione da sinistra) ti guarda dopo il tuo ingresso. */
export function occhiataIngresso(ordine: number): boolean {
  if (inizio < 0) return false
  const t = performance.now() / 1000 - inizio - ordine * SCALINO
  return t > 0 && t < DURATA
}
