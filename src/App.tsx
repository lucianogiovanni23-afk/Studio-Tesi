import { useEffect } from 'react'
import { caricaCorpus, rimuoviDalCorpus } from './agents/corpus'
import { installaHookControllore, logAvviso } from './agents/supervisor'
import { AgentiBar } from './components/AgentiBar'
import { ModalitaCarta } from './components/ModalitaCarta'
import { PonteClaude } from './components/PonteClaude'
import { useModoUso } from './hooks/useModoUso'
import { BottoneGuida, GuidaFinestra } from './components/Guida'
import { BottoneCerca, CercaOvunque } from './components/CercaOvunque'
import { NavigazionePrincipale, TestaSchermata } from './components/Navigazione'
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
import { Copertura } from './screens/Copertura'
import { Scrittura } from './screens/Scrittura'
import { useStudio } from './store'
import type { Schermata } from './types'

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
    case 'copertura':
      return <Copertura />
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

  const tema = useStudio((s) => s.preferenze.tema)
  const concentrazione = useStudio((s) => s.concentrazione)
  useEffect(() => {
    document.documentElement.dataset.tema = tema
  }, [tema])
  useEffect(() => installaHookControllore(), [])
  useEffect(() => {
    void sincronizzaCorpus()
    avviaCopieAutomatiche()
    avviaSincronizzazione()
  }, [])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [schermata])

  return (
    <div className={`app modo-${modo} schermata-${schermata} ${concentrazione && schermata === 'scrittura' ? 'concentrazione' : ''}`}>
      <header className="testata">
        <button type="button" className="marchio" onClick={() => vai('cruscotto')} aria-label="Studio tesi: vai all'inizio">
          <span className="marchio-segno" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28">
              <ellipse cx="13" cy="17" rx="7" ry="10" fill="#6b7d2e" transform="rotate(-25 13 17)" />
              <ellipse cx="21" cy="14" rx="5" ry="8" fill="#c9a43a" transform="rotate(30 21 14)" />
            </svg>
          </span>
          <span className="marchio-testi">
            <span className="marchio-nome">Studio tesi</span>
            <span className="marchio-titolo" title={titolo}>
              {titolo}
            </span>
          </span>
        </button>
        <NavigazionePrincipale />
        <div className="testata-azioni">
          <ChipSincronizzazione onApri={() => vai('impostazioni')} />
          <BottoneCerca />
          <BottoneGuida />
          <button
            type="button"
            className={`bottone-testata nav-voce ${schermata === 'impostazioni' ? 'nav-attiva' : ''}`}
            aria-current={schermata === 'impostazioni' ? 'page' : undefined}
            onClick={() => vai('impostazioni')}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
            </svg>
            <span className="testata-etichetta">Impostazioni</span>
          </button>
        </div>
      </header>

      <AvvisoSincronizzazione />

      <AgentiBar />

      <div className="contenuto">
        <TestaSchermata />
        <Schermo s={schermata} />
      </div>

      <ModalitaCarta />
      <PonteClaude />
      <GuidaFinestra />
      <CercaOvunque />
    </div>
  )
}
