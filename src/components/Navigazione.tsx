import type { ReactNode } from 'react'
import { useStudio } from '../store'
import type { Schermata } from '../types'

/**
 * Navigazione a percorso: Inizio, i quattro passi del lavoro, Chiedi.
 * Sul computer sta nella testata; sul telefono diventa una barra in basso.
 * Biblioteca e ricerca stanno sotto "Fonti", lezioni e glossario sotto "Corso".
 */

const ICONE: Record<string, ReactNode> = {
  inizio: <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" />,
  corso: <path d="M4 6.5C6.5 5 9.5 5 12 6.5 14.5 5 17.5 5 20 6.5V19c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0zM12 6.5V19" />,
  fonti: <path d="M5 4h4v16H5zM10.5 4h4v16h-4zM16 5.2l3.8-1 3.2 15.5-3.8.8z" transform="translate(-1 0)" />,
  scrittura: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  revisione: <path d="M5 12.5 9.5 17 19 7.5" />,
  chat: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
}

export function Icona({ nome }: { nome: string }) {
  return (
    <svg className="icona-nav" viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      {ICONE[nome]}
    </svg>
  )
}

interface Voce {
  id: string
  nome: string
  numero?: number
  schermate: Schermata[]
}

const VOCI: Voce[] = [
  { id: 'inizio', nome: 'Inizio', schermate: ['cruscotto'] },
  { id: 'corso', nome: 'Corso', numero: 1, schermate: ['corso', 'glossario'] },
  { id: 'fonti', nome: 'Fonti', numero: 2, schermate: ['biblioteca', 'ricerca'] },
  { id: 'scrittura', nome: 'Scrittura', numero: 3, schermate: ['scrittura'] },
  { id: 'revisione', nome: 'Revisione', numero: 4, schermate: ['revisione'] },
  { id: 'chat', nome: 'Chiedi', schermate: ['chat'] },
]

export function NavigazionePrincipale() {
  const schermata = useStudio((s) => s.schermata)
  const vai = useStudio((s) => s.vai)
  return (
    <nav className="navigazione" aria-label="Schermate">
      {VOCI.map((v) => {
        const attiva = v.schermate.includes(schermata)
        return (
          <button
            key={v.id}
            type="button"
            className={`nav-voce ${attiva ? 'nav-attiva' : ''}`}
            aria-current={attiva ? 'page' : undefined}
            onClick={() => vai(v.schermate[0])}
          >
            <Icona nome={v.id} />
            <span className="nav-nome">
              {v.numero && <span className="nav-numero">{v.numero}</span>}
              {v.nome}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

const SCHEDE: Partial<Record<Schermata, { id: Schermata; nome: string }[]>> = {
  corso: [
    { id: 'corso', nome: 'Lezioni e quadro teorico' },
    { id: 'glossario', nome: 'Glossario' },
  ],
  glossario: [
    { id: 'corso', nome: 'Lezioni e quadro teorico' },
    { id: 'glossario', nome: 'Glossario' },
  ],
  biblioteca: [
    { id: 'biblioteca', nome: 'Biblioteca' },
    { id: 'ricerca', nome: 'Cerca nuove fonti' },
  ],
  ricerca: [
    { id: 'biblioteca', nome: 'Biblioteca' },
    { id: 'ricerca', nome: 'Cerca nuove fonti' },
  ],
}

const INTRO: Record<Schermata, { titolo: string; frase: string } | null> = {
  cruscotto: null,
  corso: { titolo: '1 · Corso', frase: "Carica le lezioni: l'app ne ricava i concetti e il lessico da usare in tutta la tesi." },
  glossario: { titolo: '1 · Corso', frase: 'I termini tecnici come li usa il corso: lo Scrittore è obbligato a usarli.' },
  biblioteca: { titolo: '2 · Fonti', frase: 'Le fonti raccolte: leggile con le schede e scegli quali usare in ogni sezione.' },
  ricerca: { titolo: '2 · Fonti', frase: 'Cerca articoli nei cataloghi accademici: niente entra in biblioteca senza la tua approvazione.' },
  scrittura: { titolo: '3 · Scrittura', frase: 'Sezione per sezione: scegli le fonti, approva la scaletta, poi bozza. Ogni citazione è verificata sulla fonte.' },
  revisione: { titolo: '4 · Revisione', frase: 'Osservazioni del relatore, controllo di tutta la tesi, bibliografia ed esportazione in Word.' },
  chat: { titolo: 'Chiedi', frase: "Domande libere sulla tesi: l'assistente conosce capitoli, fonti e osservazioni." },
  impostazioni: { titolo: 'Impostazioni', frase: 'Chiave API (facoltativa), sincronizzazione fra dispositivi, file del progetto e obiettivo di pagine.' },
}

/** Titolo del passo, una frase su a cosa serve la pagina e, se ci sono, le sue schede. */
export function TestaSchermata() {
  const schermata = useStudio((s) => s.schermata)
  const vai = useStudio((s) => s.vai)
  const intro = INTRO[schermata]
  const schede = SCHEDE[schermata]
  if (!intro) return null
  return (
    <div className="testa-schermata">
      <div>
        <h1>{intro.titolo}</h1>
        <p>{intro.frase}</p>
      </div>
      {schede && (
        <div className="sotto-schede" role="tablist">
          {schede.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === schermata}
              className={`sotto-voce ${s.id === schermata ? 'sotto-attiva' : ''}`}
              onClick={() => vai(s.id)}
            >
              {s.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
