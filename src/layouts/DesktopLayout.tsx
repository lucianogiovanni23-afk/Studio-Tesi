import { AgentsPanel } from '../panels/AgentsPanel'
import { ApprovalCard } from '../panels/ApprovalCard'
import { ChatPanel } from '../panels/ChatPanel'
import { Console } from '../panels/Console'
import { SettingsPanel } from '../panels/SettingsPanel'
import { UploadPanel } from '../panels/UploadPanel'
import { WriterOptions } from '../panels/WriterOptions'
import { Scene } from '../scene/Scene'

/** Desktop: scena a sinistra (~62%), colonna scorrevole a destra. */
export function DesktopLayout() {
  return (
    <div className="layout-desktop">
      <div className="palco">
        <Scene />
      </div>
      <aside className="colonna">
        <SettingsPanel />
        <UploadPanel />
        <ApprovalCard />
        <AgentsPanel />
        <WriterOptions />
        <Console />
        <ChatPanel />
      </aside>
    </div>
  )
}
