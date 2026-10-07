import { get, set as idbSet } from 'idb-keyval'
import { normalizzaProgetto, nuovoId } from '../domain/progettoIniziale'
import { paroleCapitolo, useStudio } from '../store'
import type { Progetto } from '../types'

/**
 * Copie di sicurezza automatiche del progetto, nel browser: un'istantanea
 * all'avvio e ogni 15 minuti se qualcosa è cambiato, le ultime 10. Servono a
 * tornare indietro dopo un errore; non sostituiscono il file su iCloud o Drive.
 * Il testo del corso non è incluso: resta nel suo archivio e non cambia.
 */

const CHIAVE = 'studio-tesi-copie'
const MAX_COPIE = 10
const OGNI_MS = 15 * 60 * 1000

export interface CopiaSicurezza {
  id: string
  data: string
  motivo: string
  parole: number
  fonti: number
  progetto: string
}

export async function elencoCopie(): Promise<CopiaSicurezza[]> {
  return (await get<CopiaSicurezza[]>(CHIAVE)) ?? []
}

function impronta(p: Progetto): string {
  // La chat e i costi cambiano spesso ma non meritano una copia da soli.
  return JSON.stringify({ ...p, chat: [], usi: [] })
}

/** Crea una copia se il progetto è cambiato dall'ultima. Restituisce true se l'ha creata. */
export async function creaCopia(motivo: string, forza = false): Promise<boolean> {
  const p = useStudio.getState().progetto
  const copie = await elencoCopie()
  const json = JSON.stringify(p)
  const ultima = copie[0]
  if (!forza && ultima && impronta(JSON.parse(ultima.progetto) as Progetto) === impronta(p)) return false
  const nuova: CopiaSicurezza = {
    id: nuovoId('copia'),
    data: new Date().toISOString(),
    motivo,
    parole: p.capitoli.reduce((n, c) => n + paroleCapitolo(c), 0),
    fonti: p.fonti.length,
    progetto: json,
  }
  await idbSet(CHIAVE, [nuova, ...copie].slice(0, MAX_COPIE))
  return true
}

export async function ripristinaCopia(id: string): Promise<void> {
  const copia = (await elencoCopie()).find((c) => c.id === id)
  if (!copia) throw new Error('Copia non trovata.')
  // Prima di tornare indietro si salva lo stato attuale: anche il ripristino è reversibile.
  await creaCopia('Prima del ripristino', true)
  useStudio.getState().sostituisciProgetto(normalizzaProgetto(JSON.parse(copia.progetto) as Progetto))
  // Si resta nelle impostazioni, dove si vede l'esito del ripristino.
  useStudio.setState({ schermata: 'impostazioni' })
}

let avviate = false

/** Copia all'avvio (dopo il caricamento del progetto) e poi a intervalli. */
export function avviaCopieAutomatiche() {
  if (avviate) return
  avviate = true
  const prima = () => void creaCopia('All\'avvio').catch(() => {})
  if (useStudio.persist.hasHydrated()) prima()
  else useStudio.persist.onFinishHydration(prima)
  setInterval(() => void creaCopia('Automatica').catch(() => {}), OGNI_MS)
}
