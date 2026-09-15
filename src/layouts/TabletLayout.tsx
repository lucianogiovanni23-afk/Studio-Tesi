import { useState } from 'react'
import { AgentsPanel } from '../panels/AgentsPanel'
import { ApiKeyPanel } from '../panels/ApiKeyPanel'
import { ApprovalCard } from '../panels/ApprovalCard'
import { ChatPanel } from '../panels/ChatPanel'
import { Console } from '../panels/Console'
import { CourseMaterialPanel } from '../panels/CourseMaterialPanel'
import { Scene } from '../scene/Scene'
import { useStudioStore } from '../store'

type Tab = 'materiale' | 'agenti' | 'console' | 'chat'

const TABS: { id: Tab; label: string }[] = [
  { id: 'materiale', label: 'Materiale' },
  { id: 'agenti', label: 'Agenti' },
  { id: 'console', label: 'Console' },
  { id: 'chat', label: 'Chat' },
]

/**
 * Tablet/iPad: scena a tutta larghezza in alto, sotto una barra a schede grande.
 * La card di approvazione resta fissa in basso sopra tutto quando serve decidere.
 */
export function TabletLayout() {
  const [tab, setTab] = useState<Tab>('materiale')
  const unseenLogs = useStudioStore((s) => s.unseenLogs)
  const unseenErrors = useStudioStore((s) => s.unseenErrors)
  const needsApproval = useStudioStore((s) => s.approvalStatus === 'pending')

  return (
    <div className="layout-tablet">
      <div className="stage stage-tablet">
        <Scene />
      </div>

      <nav className="tabbar" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`tab ${tab === item.id ? 'tab-on' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === 'console' && unseenLogs > 0 && (
              <span className={`tab-badge ${unseenErrors > 0 ? 'tab-badge-error' : ''}`}>
                {unseenLogs}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className={`tab-panel ${needsApproval ? 'tab-panel-docked' : ''}`}>
        {tab === 'materiale' && (
          <>
            <ApiKeyPanel />
            <CourseMaterialPanel />
          </>
        )}
        {tab === 'agenti' && <AgentsPanel />}
        {tab === 'console' && <Console />}
        {tab === 'chat' && <ChatPanel />}
      </div>

      {needsApproval && (
        <div className="dock">
          <ApprovalCard variant="docked" />
        </div>
      )}
    </div>
  )
}
