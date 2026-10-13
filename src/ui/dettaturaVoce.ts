import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Logica della dettatura a voce (Web Speech API del browser): il componente
 * con il bottone è in Dettatura.tsx.
 */

// --- tipi minimi della Web Speech API (non tutti i browser li dichiarano) ---
interface RisultatoVoce {
  readonly isFinal: boolean
  readonly 0: { transcript: string }
}
interface EventoRisultati {
  readonly resultIndex: number
  readonly results: { readonly length: number; readonly [i: number]: RisultatoVoce }
}
interface Riconoscitore {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: EventoRisultati) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type CostruttoreRiconoscitore = new () => Riconoscitore

function costruttore(): CostruttoreRiconoscitore | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: CostruttoreRiconoscitore; webkitSpeechRecognition?: CostruttoreRiconoscitore }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const dettaturaSupportata = () => costruttore() !== null

/** Punteggiatura detta a voce: "virgola", "punto interrogativo", "a capo"… */
export function punteggiatura(testo: string): string {
  let t = ` ${testo.trim()} `
  const sostituzioni: [RegExp, string][] = [
    [/\s+nuovo paragrafo\s+/gi, '\n\n'],
    [/\s+a capo\s+/gi, '\n'],
    [/\s+punto e virgola\s+/gi, '; '],
    [/\s+punto interrogativo\s+/gi, '? '],
    [/\s+punto esclamativo\s+/gi, '! '],
    [/\s+virgola\s+/gi, ', '],
    [/\s+due punti\s+/gi, ': '],
    [/\s+apri parentesi\s+/gi, ' ('],
    [/\s+chiudi parentesi\s+/gi, ') '],
    // "punto" solo in fondo a quello che hai detto: "punto di vista" resta com'è.
    [/\s+punto\s*$/i, '. '],
  ]
  for (const [re, con] of sostituzioni) t = t.replace(re, con)
  // Maiuscola dopo punto, punto interrogativo, esclamativo e a capo.
  t = t.replace(/([.!?]\s+|\n)([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase())
  t = t.replace(/^ +/, '').replace(/ +$/, '')
  // Dopo un segno di punteggiatura si lascia lo spazio per la frase successiva.
  return /[.!?;:,]$/.test(t) ? `${t} ` : t
}

/** Unisce il testo dettato a quello che c'era: spazio giusto e maiuscola a inizio frase. */
export function unisciDettato(prima: string, dettato: string): string {
  let d = dettato.replace(/^\s+/, '')
  if (!d) return ''
  const finePrima = prima.replace(/[ \t]+$/, '')
  const inizioFrase = !finePrima.trim() || /[.!?]$/.test(finePrima) || /\n$/.test(prima)
  if (inizioFrase && /^[a-zà-ÿ]/.test(d)) d = d.charAt(0).toUpperCase() + d.slice(1)
  const serveSpazio = prima.length > 0 && !/\s$/.test(prima) && !/^[,.;:!?)\n]/.test(d)
  return (serveSpazio ? ' ' : '') + d
}

/** Il testo dettato in fondo a un campo (per esempio la chat). */
export function aggiungiDettato(prima: string, dettato: string): string {
  return prima + unisciDettato(prima, dettato)
}

const MESSAGGI: Record<string, string> = {
  'not-allowed': "Il browser non mi lascia usare il microfono. Tocca il lucchetto accanto all'indirizzo (su iPad: Impostazioni › Safari › Microfono) e scegli Consenti.",
  'service-not-allowed': "Il browser non mi lascia usare la dettatura. Controlla il permesso del microfono per questo sito.",
  'audio-capture': 'Non trovo un microfono collegato.',
  network: 'Per la dettatura serve internet: il browser riconosce la voce online.',
  'language-not-supported': "Questo browser non riconosce l'italiano a voce.",
}

export interface StatoVoce {
  supportata: boolean
  attiva: boolean
  provvisorio: string
  problema: string | null
  avvia: () => void
  ferma: () => void
  alterna: () => void
}

/** Dettatura: `onFinale` riceve ogni pezzo di frase riconosciuto, già con la punteggiatura detta a voce. */
export function useDettatura(onFinale: (testo: string) => void): StatoVoce {
  const [supportata] = useState(dettaturaSupportata)
  const [attiva, setAttiva] = useState(false)
  const [provvisorio, setProvvisorio] = useState('')
  const [problema, setProblema] = useState<string | null>(null)
  const riconoscitore = useRef<Riconoscitore | null>(null)
  const voluta = useRef(false)
  const richiamo = useRef(onFinale)
  useEffect(() => {
    richiamo.current = onFinale
  })

  const ferma = useCallback(() => {
    voluta.current = false
    riconoscitore.current?.stop()
    setProvvisorio('')
  }, [])

  const avvia = useCallback(() => {
    const C = costruttore()
    if (!C) return
    setProblema(null)
    voluta.current = true
    let r = riconoscitore.current
    if (!r) {
      r = new C()
      r.lang = 'it-IT'
      r.continuous = true
      r.interimResults = true
      r.onstart = () => setAttiva(true)
      r.onresult = (e) => {
        let inCorso = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const ris = e.results[i]
          const testo = ris[0]?.transcript ?? ''
          if (ris.isFinal) {
            const pulito = punteggiatura(testo)
            if (pulito.trim()) richiamo.current(pulito)
          } else inCorso += testo
        }
        setProvvisorio(inCorso.trim())
      }
      r.onerror = (e) => {
        // "no-speech" e "aborted" non sono problemi: si continua ad ascoltare o ci si ferma in silenzio.
        if (e.error === 'no-speech' || e.error === 'aborted') return
        voluta.current = false
        setProblema(MESSAGGI[e.error] ?? 'La dettatura si è fermata. Riprova.')
      }
      r.onend = () => {
        // Il browser smette da solo dopo un po' di silenzio: se stai ancora dettando si riparte.
        if (voluta.current) {
          try {
            riconoscitore.current?.start()
            return
          } catch {
            voluta.current = false
          }
        }
        setAttiva(false)
        setProvvisorio('')
      }
      riconoscitore.current = r
    }
    try {
      r.start()
      setAttiva(true)
    } catch {
      // Già in ascolto: va bene così.
    }
  }, [])

  useEffect(
    () => () => {
      voluta.current = false
      riconoscitore.current?.abort()
    },
    [],
  )

  const alterna = useCallback(() => (voluta.current ? ferma() : avvia()), [avvia, ferma])
  return { supportata, attiva, provvisorio, problema, avvia, ferma, alterna }
}
