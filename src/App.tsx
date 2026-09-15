import { useEffect } from 'react'
import { installSupervisorHooks } from './agents/supervisor'
import { useLayoutMode } from './hooks/useLayoutMode'
import { DesktopLayout } from './layouts/DesktopLayout'
import { TabletLayout } from './layouts/TabletLayout'
import { useStudioStore } from './store'

export default function App() {
  const mode = useLayoutMode()
  const running = useStudioStore((s) => s.running)
  const approvalPending = useStudioStore((s) => s.approvalStatus === 'pending')

  // Il Controllore sorveglia console ed errori di runtime dall'avvio dell'app.
  useEffect(() => installSupervisorHooks(), [])

  const phase = approvalPending
    ? 'in attesa della tua approvazione'
    : running
      ? 'squadra al lavoro'
      : 'in attesa di istruzioni'

  return (
    <div className={`app app-${mode}`}>
      <header className="app-head">
        <div>
          <h1>Studio tesi</h1>
          <p>
            Cinque agenti AI in un ufficio 3D lavorano in sequenza al tuo capitolo di tesi in Finanza
            Aziendale, con ricerca reale su internet e la tua approvazione nel mezzo.
          </p>
        </div>
        <span className={`phase phase-${running ? 'on' : 'off'}`}>{phase}</span>
      </header>

      {mode === 'desktop' ? <DesktopLayout /> : <TabletLayout />}
    </div>
  )
}
