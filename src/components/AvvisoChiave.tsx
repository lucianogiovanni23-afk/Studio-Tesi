/** Avviso sempre visibile accanto al campo della chiave API. */
export const TESTO_AVVISO_CHIAVE =
  'Questa chiave resta nel tuo browser e viene inviata direttamente all\'API Anthropic. Va bene per uso personale; non distribuire l\'app ad altri con la chiave dentro. Per un uso condiviso serve un backend che la nasconda.'

export function AvvisoChiave() {
  return <p className="avviso-chiave">{TESTO_AVVISO_CHIAVE}</p>
}
