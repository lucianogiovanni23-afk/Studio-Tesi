import { normalizza } from '../agents/citations'
import { segnalaSconfinamenti } from '../agents/supervisor'
import type { Progetto, RilievoTesi } from '../types'
import { coloreCitazione, marcatoriDi } from './citazioniTesto'
import { nuovoId } from './progettoIniziale'

/** Frasi del testo, senza marcatori. */
function frasi(testo: string): string[] {
  return testo
    .replace(/\[[FC]\d+\]/g, '')
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter(Boolean)
}

function fraseCon(testo: string, parola: string): string {
  const minuscola = parola.toLowerCase()
  return frasi(testo).find((f) => f.toLowerCase().includes(minuscola)) ?? parola
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const MAX_PER_TIPO = 40

/**
 * Controlli fatti in codice su tutta la tesi, senza costi:
 * - varianti del glossario usate al posto del termine scelto;
 * - frasi ripetute fra sezioni diverse (o nella stessa);
 * - parole spia di sconfinamenti in Ragioneria, Diritto o agronomia;
 * - citazioni rosse e marcatori senza citazione.
 */
export function controlliInCodice(p: Progetto): RilievoTesi[] {
  const rilievi: RilievoTesi[] = []
  const sezioni = p.capitoli.flatMap((c, i) =>
    c.sezioni.map((s, j) => ({ cap: c, sez: s, etichetta: `${i + 1}.${j + 1}` })),
  )

  // Terminologia
  const terminologia: RilievoTesi[] = []
  for (const v of p.glossario) {
    for (const variante of v.varianti) {
      if (variante.trim().length < 3 || variante.toLowerCase() === v.termine.toLowerCase()) continue
      const re = new RegExp(`(^|[^\\p{L}])${escape(variante)}(?=$|[^\\p{L}])`, 'iu')
      for (const { cap, sez, etichetta } of sezioni) {
        if (!re.test(sez.testo)) continue
        terminologia.push({
          id: nuovoId('ril'),
          tipo: 'terminologia',
          origine: 'codice',
          capitoloId: cap.id,
          sezioneId: sez.id,
          passo: fraseCon(sez.testo, variante),
          problema: `Nella sezione ${etichetta} compare «${variante}», variante di «${v.termine}» nel glossario.`,
          suggerimento: `Usa «${v.termine}» in tutta la tesi.`,
        })
      }
    }
  }
  rilievi.push(...terminologia.slice(0, MAX_PER_TIPO))

  // Ripetizioni: frasi di almeno 8 parole che compaiono due volte
  const viste = new Map<string, { etichetta: string; capId: string; sezId: string; frase: string }>()
  const ripetizioni: RilievoTesi[] = []
  for (const { cap, sez, etichetta } of sezioni) {
    for (const f of frasi(sez.testo)) {
      const chiave = normalizza(f).replace(/[.,'"-]/g, '')
      if (chiave.split(' ').length < 8) continue
      const prima = viste.get(chiave)
      if (prima) {
        ripetizioni.push({
          id: nuovoId('ril'),
          tipo: 'ripetizione',
          origine: 'codice',
          capitoloId: cap.id,
          sezioneId: sez.id,
          passo: f,
          problema: `La stessa frase compare nella sezione ${prima.etichetta} e nella sezione ${etichetta}.`,
          suggerimento: 'Tienila in un solo punto e, se serve, rimanda a quella sezione.',
        })
      } else {
        viste.set(chiave, { etichetta, capId: cap.id, sezId: sez.id, frase: f })
      }
    }
  }
  rilievi.push(...ripetizioni.slice(0, MAX_PER_TIPO))

  // Materia
  for (const { cap, sez, etichetta } of sezioni) {
    for (const termine of segnalaSconfinamenti(sez.testo)) {
      rilievi.push({
        id: nuovoId('ril'),
        tipo: 'materia',
        origine: 'codice',
        capitoloId: cap.id,
        sezioneId: sez.id,
        passo: fraseCon(sez.testo, termine.trim()),
        problema: `Nella sezione ${etichetta} compare «${termine.trim()}»: possibile sconfinamento fuori dalla Finanza Aziendale.`,
        suggerimento: 'Al massimo una frase, solo come causa di un effetto finanziario.',
      })
    }
  }

  // Citazioni
  for (const { cap, sez, etichetta } of sezioni) {
    const rosse = sez.citazioni.filter((c) => coloreCitazione(c) === 'rosso')
    const registrate = new Set(sez.citazioni.map((c) => c.rif))
    const orfani = [...marcatoriDi(sez.testo)].filter((m) => !registrate.has(m))
    if (rosse.length === 0 && orfani.length === 0) continue
    rilievi.push({
      id: nuovoId('ril'),
      tipo: 'citazioni',
      origine: 'codice',
      capitoloId: cap.id,
      sezioneId: sez.id,
      passo: rosse[0]?.affermazione ?? orfani.map((o) => `[${o}]`).join(' '),
      problema: [
        rosse.length ? `${rosse.length} citazion${rosse.length === 1 ? 'e rossa' : 'i rosse'} nella sezione ${etichetta}` : '',
        orfani.length ? `marcatori senza citazione: ${orfani.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ') + '.',
      suggerimento: 'Apri la sezione, tocca i marcatori rossi e correggi l\'estratto o togli l\'affermazione.',
    })
  }

  return rilievi
}
