/**
 * Entrata nell'ufficio: la porta a vetri si attraversa una volta per ogni
 * apertura dell'app (tornando da una pagina non si ripete). Non si salva.
 */
export const passaggio = { introFatta: false }

/** Solo per le prove automatiche: con `studio-tesi.salta-intro` = '1' l'entrata non parte. */
export function introDaSaltare(): boolean {
  try {
    return localStorage.getItem('studio-tesi.salta-intro') === '1'
  } catch {
    return false
  }
}
