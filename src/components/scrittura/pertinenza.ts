import type { Fonte, Sezione } from '../../types'

/** Fonti della biblioteca ordinate per vicinanza a titolo, obiettivo e scaletta della sezione. */
export function fontiPertinenti(fonti: Fonte[], sez: Sezione): { f: Fonte; peso: number }[] {
  const testo = `${sez.titolo} ${sez.obiettivo} ${sez.scaletta.join(' ')}`.toLowerCase()
  const parole = [...new Set(testo.split(/[^a-zàèéìòù]+/).filter((w) => w.length > 4))]
  return fonti
    .map((f) => {
      const corpo = `${f.titolo} ${f.abstract} ${f.temi.join(' ')} ${f.scheda?.rilevanza ?? ''} ${f.scheda?.risultati ?? ''}`.toLowerCase()
      return { f, peso: parole.filter((w) => corpo.includes(w.slice(0, -1))).length }
    })
    .sort((a, b) => b.peso - a.peso || a.f.numero - b.f.numero)
}
