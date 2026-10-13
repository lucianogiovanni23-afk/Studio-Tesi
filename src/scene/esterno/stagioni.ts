/**
 * La campagna fuori dalla vetrata cambia con le stagioni (in base al mese):
 * - autunno (ottobre–dicembre): raccolta delle olive, reti stese e cassette;
 * - inverno (gennaio–febbraio): erba più verde, luce più fredda;
 * - primavera (marzo–maggio): ulivi in fiore, prato verde con fiori di campo;
 * - estate (giugno–settembre): erba secca e dorata.
 * Per le prove: `studio-tesi.mese-prova` = 1..12 forza il mese.
 */
export type Stagione = 'inverno' | 'primavera' | 'estate' | 'autunno'

export function meseCorrente(): number {
  try {
    const prova = Number(localStorage.getItem('studio-tesi.mese-prova'))
    if (Number.isInteger(prova) && prova >= 1 && prova <= 12) return prova
  } catch {
    /* storage non disponibile */
  }
  return new Date().getMonth() + 1
}

export function stagioneDelMese(mese: number): Stagione {
  if (mese >= 10) return 'autunno'
  if (mese <= 2) return 'inverno'
  if (mese <= 5) return 'primavera'
  return 'estate'
}

/** Indice per gli shader: 0 inverno, 1 primavera, 2 estate, 3 autunno. */
export const INDICE_STAGIONE: Record<Stagione, number> = { inverno: 0, primavera: 1, estate: 2, autunno: 3 }
