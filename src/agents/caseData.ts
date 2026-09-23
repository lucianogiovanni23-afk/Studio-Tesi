import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { CaseTable } from '../types'

/** Righe mostrate in anteprima e inviate agli agenti per ogni foglio. */
const RIGHE_ANTEPRIMA = 8
/** Righe campionate per dedurre l'intervallo di date. */
const RIGHE_CAMPIONE = 5000

function normalizzaRiga(riga: Record<string, unknown>): Record<string, string> {
  const fuori: Record<string, string> = {}
  for (const [chiave, valore] of Object.entries(riga)) {
    if (valore === null || valore === undefined) fuori[chiave] = ''
    else if (valore instanceof Date) fuori[chiave] = valore.toISOString().slice(0, 10)
    else fuori[chiave] = String(valore)
  }
  return fuori
}

export function leggiCsv(testo: string, nomeFile: string): CaseTable[] {
  const esito = Papa.parse<Record<string, unknown>>(testo, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  const righe = (esito.data ?? []).map(normalizzaRiga)
  const colonne = esito.meta?.fields ?? (righe[0] ? Object.keys(righe[0]) : [])

  return [
    {
      foglio: nomeFile,
      colonne,
      righe: righe.slice(0, RIGHE_ANTEPRIMA),
      totaleRighe: righe.length,
    },
  ]
}

export function leggiExcel(buffer: ArrayBuffer): CaseTable[] {
  const libro = XLSX.read(buffer, { type: 'array', cellDates: true })
  const tabelle: CaseTable[] = []

  for (const nomeFoglio of libro.SheetNames) {
    const foglio = libro.Sheets[nomeFoglio]
    if (!foglio) continue
    const grezze = XLSX.utils.sheet_to_json<Record<string, unknown>>(foglio, { defval: '' })
    const righe = grezze.map(normalizzaRiga)
    const colonne = righe[0] ? Object.keys(righe[0]) : []
    tabelle.push({
      foglio: nomeFoglio,
      colonne,
      righe: righe.slice(0, RIGHE_ANTEPRIMA),
      totaleRighe: righe.length,
    })
  }

  return tabelle
}

/** Cerca una colonna che sembri una data e ne ricava l'intervallo coperto. */
function intervalloDate(righe: Record<string, string>[], colonne: string[]): string | null {
  const candidate = colonne.filter((c) => /data|date|giorno|day|mese|month|anno|year|stagione|season/i.test(c))
  if (candidate.length === 0) return null

  for (const colonna of candidate) {
    const valori = righe
      .slice(0, RIGHE_CAMPIONE)
      .map((r) => r[colonna])
      .filter((v) => v && v.trim() !== '')

    if (valori.length === 0) continue

    const tempi = valori
      .map((v) => {
        const diretto = Date.parse(v)
        if (!Number.isNaN(diretto)) return diretto
        // Formato italiano gg/mm/aaaa
        const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v.trim())
        if (m) return Date.parse(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
        return NaN
      })
      .filter((t) => !Number.isNaN(t))

    if (tempi.length >= 2) {
      const da = new Date(Math.min(...tempi)).toISOString().slice(0, 10)
      const a = new Date(Math.max(...tempi)).toISOString().slice(0, 10)
      return `${colonna}: da ${da} a ${a}`
    }

    // Colonna di anni o stagioni: elenco dei valori distinti.
    const distinti = [...new Set(valori)].slice(0, 12)
    if (distinti.length > 1) return `${colonna}: ${distinti.join(', ')}`
  }

  return null
}

/** Riepilogo testuale inviato agli agenti: struttura e prime righe, non tutto il file. */
export function riepilogaTabelle(nomeFile: string, tabelle: CaseTable[]): string {
  if (tabelle.length === 0) return `${nomeFile}: nessun foglio leggibile.`

  const parti = tabelle.map((t) => {
    const periodo = intervalloDate(t.righe, t.colonne)
    const intestazione = `Foglio "${t.foglio}": ${t.totaleRighe} righe, ${t.colonne.length} colonne (${t.colonne.join(', ')})${
      periodo ? `. Periodo — ${periodo}` : ''
    }`

    if (t.righe.length === 0) return intestazione

    const anteprima = t.righe
      .map((r) => t.colonne.map((c) => `${c}=${r[c] ?? ''}`).join(' | '))
      .join('\n')

    return `${intestazione}\nPrime righe:\n${anteprima}`
  })

  return `FILE ${nomeFile}\n${parti.join('\n\n')}`
}

export function totaleRighe(tabelle: CaseTable[]): number {
  return tabelle.reduce((somma, t) => somma + t.totaleRighe, 0)
}
