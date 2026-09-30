import { useEffect } from 'react'
import { caricaCorpus, rimuoviDalCorpus } from './agents/corpus'
import { NOME_SOCIETA } from './agents/definitions'
import { installaHookControllore, logAvviso } from './agents/supervisor'
import { useLayoutMode } from './hooks/useLayoutMode'
import { DesktopLayout } from './layouts/DesktopLayout'
import { TabletLayout } from './layouts/TabletLayout'
import { ReadingMode } from './panels/ReadingMode'
import { Ticker } from './panels/Ticker'
import { useQualitaScena } from './scene/qualita'
import { useStudioStore } from './store'

/**
 * Il corpus del corso vive in IndexedDB, separato dalla sessione: all'avvio
 * si confrontano i due, e i file il cui testo non c'è più vanno ricaricati.
 */
async function sincronizzaCorpus() {
  const attendiSessione = new Promise<void>((resolve) => {
    if (useStudioStore.persist.hasHydrated()) resolve()
    else useStudioStore.persist.onFinishHydration(() => resolve())
  })
  const [presenti] = await Promise.all([caricaCorpus().catch(() => new Set<string>()), attendiSessione])

  const s = useStudioStore.getState()
  const mancanti = s.courseFiles.filter((f) => f.status === 'pronto' && !f.scansionato && !presenti.has(f.id))
  for (const f of mancanti) {
    s.aggiornaCourseFile(f.id, {
      status: 'errore',
      errore: 'Il testo estratto non è più sul dispositivo: rimuovi il file e ricaricalo.',
    })
  }
  // File rimasti a metà lettura quando la pagina è stata chiusa.
  for (const f of s.courseFiles.filter((f) => f.status === 'lettura' || f.status === 'estrazione')) {
    s.aggiornaCourseFile(f.id, { status: 'errore', errore: 'Lettura interrotta: rimuovi il file e ricaricalo.' })
  }
  // Testi di file non più in elenco (per esempio dopo un aggiornamento dell'app).
  const inElenco = new Set(s.courseFiles.map((f) => f.id))
  for (const id of presenti) if (!inElenco.has(id)) await rimuoviDalCorpus(id)

  if (mancanti.length > 0) logAvviso(null, `${mancanti.length} file del corso vanno ricaricati.`)
  useStudioStore.getState().setCorpusSincronizzato(true)
}

export default function App() {
  const modalita = useLayoutMode()
  const qualita = useQualitaScena()
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)
  const inAttesa = useStudioStore((s) => s.approvazione === 'in_attesa' || s.approvazioneScaletta === 'in_attesa')

  // Il Controllore sorveglia console ed errori di runtime fin dall'avvio.
  useEffect(() => installaHookControllore(), [])
  useEffect(() => {
    void sincronizzaCorpus()
  }, [])

  const fase = inAttesa ? 'in attesa della tua approvazione' : inEsecuzione ? 'seduta in corso' : 'seduta ferma'

  return (
    <div className={`app app-${modalita}`}>
      <Ticker />

      <header className="intestazione">
        <div>
          <h1>Studio tesi</h1>
          <p>
            Cinque agenti lavorano come broker nella sala operativa di {NOME_SOCIETA} al tuo capitolo
            di tesi in Finanza Aziendale: ricerca reale, citazioni verificate e la tua approvazione su
            fonti e scaletta.
          </p>
        </div>
        <span className={`fase ${inEsecuzione ? 'fase-attiva' : ''} ${inAttesa ? 'fase-attesa' : ''}`}>{fase}</span>
      </header>

      {modalita === 'desktop' ? <DesktopLayout qualita={qualita} /> : <TabletLayout qualita={qualita} />}

      <ReadingMode />
    </div>
  )
}
