import { useEffect } from 'react'
import { installaHookControllore } from './agents/supervisor'
import { NOME_SOCIETA } from './agents/definitions'
import { useLayoutMode } from './hooks/useLayoutMode'
import { DesktopLayout } from './layouts/DesktopLayout'
import { TabletLayout } from './layouts/TabletLayout'
import { Ticker } from './panels/Ticker'
import { useStudioStore } from './store'

export default function App() {
  const modalita = useLayoutMode()
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)
  const inAttesa = useStudioStore((s) => s.approvazione === 'in_attesa')

  // Il Controllore sorveglia console ed errori di runtime fin dall'avvio.
  useEffect(() => installaHookControllore(), [])

  const fase = inAttesa
    ? 'in attesa della tua approvazione'
    : inEsecuzione
      ? 'seduta in corso'
      : 'seduta ferma'

  return (
    <div className={`app app-${modalita}`}>
      <Ticker />

      <header className="intestazione">
        <div>
          <h1>Studio tesi</h1>
          <p>
            Cinque agenti lavorano come broker nella sala operativa di {NOME_SOCIETA} al tuo capitolo
            di tesi in Finanza Aziendale: ricerca reale, verifica delle fonti e la tua approvazione
            nel mezzo.
          </p>
        </div>
        <span className={`fase ${inEsecuzione ? 'fase-attiva' : ''}`}>{fase}</span>
      </header>

      {modalita === 'desktop' ? <DesktopLayout /> : <TabletLayout />}
    </div>
  )
}
