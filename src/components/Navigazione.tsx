import type { ReactNode } from 'react'
import { useStudio } from '../store'
import { AGENTE } from '../agents/agenti'
import type { AgentKey, Schermata } from '../types'
import { Ritratto } from './Ritratto'
import { Illustrazione, type TipoIllustrazione } from '../ui/Illustrazione'

/**
 * Navigazione a percorso: Inizio, i quattro passi del lavoro, Chiedi.
 * Sul computer sta nella testata; sul telefono diventa una barra in basso.
 * Biblioteca e ricerca stanno sotto "Fonti", lezioni e glossario sotto "Corso".
 */

const ICONE: Record<string, ReactNode> = {
  ufficio: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16.5" cy="8" r="3" />
      <path d="M2.5 20c.6-4 3-6 5.5-6s4.9 2 5.5 6M11.6 15.2c1.2-1 2.9-1.4 4.9-1.2 2.5.3 4.4 2.2 4.9 6" />
    </>
  ),
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
  { id: 'ufficio', nome: 'Ufficio', schermate: ['ufficio', 'chat'] },
  { id: 'inizio', nome: 'Panoramica', schermate: ['cruscotto'] },
  { id: 'corso', nome: 'Corso', numero: 1, schermate: ['corso', 'glossario'] },
  { id: 'fonti', nome: 'Fonti', numero: 2, schermate: ['biblioteca', 'ricerca', 'copertura'] },
  { id: 'scrittura', nome: 'Scrittura', numero: 3, schermate: ['scrittura'] },
  { id: 'revisione', nome: 'Revisione', numero: 4, schermate: ['revisione'] },
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
    { id: 'corso', nome: 'Lezioni' },
    { id: 'glossario', nome: 'Glossario' },
  ],
  glossario: [
    { id: 'corso', nome: 'Lezioni' },
    { id: 'glossario', nome: 'Glossario' },
  ],
  biblioteca: [
    { id: 'biblioteca', nome: 'Biblioteca' },
    { id: 'ricerca', nome: 'Nuove fonti' },
    { id: 'copertura', nome: 'Copertura' },
  ],
  ricerca: [
    { id: 'biblioteca', nome: 'Biblioteca' },
    { id: 'ricerca', nome: 'Nuove fonti' },
    { id: 'copertura', nome: 'Copertura' },
  ],
  copertura: [
    { id: 'biblioteca', nome: 'Biblioteca' },
    { id: 'ricerca', nome: 'Nuove fonti' },
    { id: 'copertura', nome: 'Copertura' },
  ],
}

interface Intro {
  passo?: number
  titolo: string
  frase: string
  /** Il collega dell'ufficio che si occupa di questa pagina. */
  agente?: AgentKey
  illustrazione?: TipoIllustrazione
}

const INTRO: Record<Schermata, Intro | null> = {
  cruscotto: null,
  ufficio: null,
  corso: { illustrazione: 'uliveto', passo: 1, titolo: 'Corso', agente: 'lettore', frase: "Carica le lezioni: la lettrice trova i concetti e le parole del corso da usare in tutta la tesi." },
  glossario: { illustrazione: 'uliveto', passo: 1, titolo: 'Corso', agente: 'lettore', frase: 'Le parole tecniche come le usa il corso: lo scrittore deve usare proprio queste.' },
  biblioteca: { illustrazione: 'scaffali', passo: 2, titolo: 'Fonti', agente: 'bibliotecario', frase: 'Le fonti che hai raccolto: leggi i riassunti e scegli quali usare in ogni paragrafo.' },
  ricerca: { illustrazione: 'scaffali', passo: 2, titolo: 'Fonti', agente: 'bibliotecario', frase: 'Cerca articoli negli archivi delle università: in biblioteca entra solo quello che scegli tu.' },
  copertura: { illustrazione: 'scaffali', passo: 2, titolo: 'Fonti', agente: 'bibliotecario', frase: 'Quali paragrafi hanno abbastanza fonti e a quali ne servono altre.' },
  scrittura: { illustrazione: 'scrivania', passo: 3, titolo: 'Scrittura', agente: 'scrittore', frase: "Un paragrafo alla volta: scegli le fonti, dai l'ok alla scaletta, poi la bozza. Ogni citazione viene controllata sulla fonte." },
  revisione: { illustrazione: 'lente', passo: 4, titolo: 'Revisione', agente: 'revisore', frase: 'Note del relatore, controllo di tutta la tesi, bibliografia e file Word.' },
  chat: { illustrazione: 'chat', titolo: 'Chiedi', frase: "Chiedi quello che vuoi sulla tesi: l'assistente conosce capitoli, fonti e note del relatore." },
  impostazioni: { illustrazione: 'ingranaggi', titolo: 'Impostazioni', frase: 'Chiave API (se vuoi), sincronizzazione tra dispositivi, file del progetto, quante pagine vuoi scrivere e il ripristino.' },
}

/** Titolo del passo, una frase su a cosa serve la pagina e, se ci sono, le sue schede. */
export function TestaSchermata() {
  const schermata = useStudio((s) => s.schermata)
  const vai = useStudio((s) => s.vai)
  const intro = INTRO[schermata]
  const schede = SCHEDE[schermata]
  const scegliAgente = useStudio((s) => s.scegliAgente)
  if (!intro) return null
  const def = intro.agente ? AGENTE[intro.agente] : null
  return (
    <div className="testa-schermata" style={def ? { ['--colore-agente' as string]: def.colore } : undefined}>
      <div className="testa-testo">
        {intro.passo && <span className="testa-passo">Passo {intro.passo} di 4</span>}
        <h1>{intro.titolo}</h1>
        <p>{intro.frase}</p>
      </div>
      {intro.illustrazione && <Illustrazione tipo={intro.illustrazione} />}
      {def && (
        <button type="button" className="testa-agente" onClick={() => scegliAgente(def.key)} title={`Vai nell'ufficio a parlare con ${def.persona.femminile ? 'la' : 'il'} ${def.persona.nome.toLowerCase()}`}>
          <Ritratto k={def.key} dimensione={44} />
          <span>
            <strong>{def.persona.nome}</strong>
            <small>Chiedi {def.persona.femminile ? 'a lei' : 'a lui'} →</small>
          </span>
        </button>
      )}
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
