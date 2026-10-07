import { useEffect } from 'react'
import { caricaCorpus, rimuoviDalCorpus } from './agents/corpus'
import { installaHookControllore, logAvviso } from './agents/supervisor'
import { AgentiBar } from './components/AgentiBar'
import { ModalitaCarta } from './components/ModalitaCarta'
import { PonteClaude } from './components/PonteClaude'
import { useModoUso } from './hooks/useModoUso'
import { avviaCopieAutomatiche } from './io/copie'
import { avviaSincronizzazione } from './io/sincronizzazione'
import { AvvisoSincronizzazione, ChipSincronizzazione } from './components/Sincronizzazione'
import { Corso } from './screens/Corso'
import { Cruscotto } from './screens/Cruscotto'
import { Glossario } from './screens/Glossario'
import { Impostazioni } from './screens/Impostazioni'
import { Biblioteca } from './screens/Biblioteca'
import { Chat } from './screens/Chat'
import { Revisione } from './screens/Revisione'
import { Ricerca } from './screens/Ricerca'
import { Scrittura } from './screens/Scrittura'
import { useStudio } from './store'
import type { Schermata } from './types'

const VOCI: { id: Schermata; nome: string }[] = [
  { id: 'cruscotto', nome: 'Cruscotto' },
  { id: 'scrittura', nome: 'Scrittura' },
  { id: 'biblioteca', nome: 'Biblioteca' },
  { id: 'ricerca', nome: 'Ricerca' },
  { id: 'corso', nome: 'Corso' },
  { id: 'revisione', nome: 'Revisione' },
  { id: 'glossario', nome: 'Glossario' },
  { id: 'chat', nome: 'Chat' },
  { id: 'impostazioni', nome: 'Impostazioni' },
]

/** Su iPad vengono prima le schermate di lettura e decisione. */
const ORDINE_IPAD: Schermata[] = [
  'cruscotto',
  'scrittura',
  'biblioteca',
  'revisione',
  'chat',
  'glossario',
  'corso',
  'ricerca',
  'impostazioni',
]

/**
 * Il corpus del corso vive in IndexedDB, separato dal progetto: all'avvio si
 * confrontano i due, e i file il cui testo non c'è più vanno ricaricati.
 */
async function sincronizzaCorpus() {
  const attendi = new Promise<void>((resolve) => {
    if (useStudio.persist.hasHydrated()) resolve()
    else useStudio.persist.onFinishHydration(() => resolve())
  })
  const [presenti] = await Promise.all([caricaCorpus().catch(() => new Set<string>()), attendi])
  const s = useStudio.getState()
  const files = s.progetto.courseFiles
  let mancanti = 0
  for (const f of files) {
    if (f.status === 'pronto' && !presenti.has(f.id)) {
      mancanti += 1
      s.aggiornaCourseFile(f.id, { status: 'errore', errore: 'Il testo estratto non è più sul dispositivo: togli il file e ricaricalo.' })
    }
    if (f.status === 'lettura' || f.status === 'estrazione') {
      s.aggiornaCourseFile(f.id, { status: 'errore', errore: 'Lettura interrotta: togli il file e ricaricalo.' })
    }
  }
  const inElenco = new Set(files.map((f) => f.id))
  for (const id of presenti) if (!inElenco.has(id)) await rimuoviDalCorpus(id)
  if (mancanti > 0) logAvviso(null, `${mancanti} file del corso vanno ricaricati.`)
  useStudio.getState().setCorpusSincronizzato(true)
}

function Schermo({ s }: { s: Schermata }) {
  switch (s) {
    case 'cruscotto':
      return <Cruscotto />
    case 'scrittura':
      return <Scrittura />
    case 'biblioteca':
      return <Biblioteca />
    case 'ricerca':
      return <Ricerca />
    case 'corso':
      return <Corso />
    case 'revisione':
      return <Revisione />
    case 'glossario':
      return <Glossario />
    case 'chat':
      return <Chat />
    case 'impostazioni':
      return <Impostazioni />
  }
}

export default function App() {
  const modo = useModoUso()
  const schermata = useStudio((s) => s.schermata)
  const vai = useStudio((s) => s.vai)
  const titolo = useStudio((s) => s.progetto.titolo)

  useEffect(() => installaHookControllore(), [])
  useEffect(() => {
    void sincronizzaCorpus()
    avviaCopieAutomatiche()
    avviaSincronizzazione()
  }, [])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [schermata])

  const voci = modo === 'ipad' ? ORDINE_IPAD.map((id) => VOCI.find((v) => v.id === id)!) : VOCI

  return (
    <div className={`app modo-${modo}`}>
      <header className="testata">
        <div className="marchio">
          <span className="marchio-segno" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28">
              <ellipse cx="13" cy="17" rx="7" ry="10" fill="#6b7d2e" transform="rotate(-25 13 17)" />
              <ellipse cx="21" cy="14" rx="5" ry="8" fill="#c9a43a" transform="rotate(30 21 14)" />
            </svg>
          </span>
          <div>
            <p className="marchio-nome">Studio tesi</p>
            <p className="marchio-titolo" title={titolo}>
              {titolo}
            </p>
          </div>
        </div>
        <nav className="navigazione" aria-label="Schermate">
          {voci.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`nav-voce ${schermata === v.id ? 'nav-attiva' : ''}`}
              aria-current={schermata === v.id ? 'page' : undefined}
              onClick={() => vai(v.id)}
            >
              {v.nome}
            </button>
          ))}
        </nav>
        <ChipSincronizzazione onApri={() => vai('impostazioni')} />
      </header>

      <AvvisoSincronizzazione />

      <AgentiBar />

      <div className="contenuto">
        <Schermo s={schermata} />
      </div>

      <ModalitaCarta />
      <PonteClaude />
    </div>
  )
}
