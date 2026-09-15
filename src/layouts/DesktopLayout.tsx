import { AgentsPanel } from '../panels/AgentsPanel'
import { ApiKeyPanel } from '../panels/ApiKeyPanel'
import { ApprovalCard } from '../panels/ApprovalCard'
import { ChatPanel } from '../panels/ChatPanel'
import { Console } from '../panels/Console'
import { CourseMaterialPanel } from '../panels/CourseMaterialPanel'
import { Scene } from '../scene/Scene'

/** Desktop: scena a sinistra, tutti i pannelli affiancati in una colonna scorrevole. */
export function DesktopLayout() {
  return (
    <div className="layout-desktop">
      <div className="stage">
        <Scene />
      </div>
      <aside className="sidebar">
        <ApiKeyPanel />
        <CourseMaterialPanel />
        <ApprovalCard />
        <AgentsPanel />
        <Console />
        <ChatPanel />
      </aside>
    </div>
  )
}
