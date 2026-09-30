import { Workspace } from '../panels/Workspace'
import { Scene } from '../scene/Scene'
import type { QualitaScena } from '../scene/qualita'

/** Desktop: scena a sinistra (~60%), area di lavoro a destra; senza scena, lavoro al centro. */
export function DesktopLayout({ qualita }: { qualita: QualitaScena }) {
  if (qualita === 'spenta') {
    return (
      <div className="layout-desktop layout-senza-scena">
        <Workspace />
      </div>
    )
  }
  return (
    <div className="layout-desktop">
      <div className="palco">
        {/* la chiave ricrea il canvas: antialias e dpr si fissano alla creazione */}
        <Scene key={qualita} qualita={qualita} />
      </div>
      <aside className="colonna">
        <Workspace />
      </aside>
    </div>
  )
}
