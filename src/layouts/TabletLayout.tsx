import { useState } from 'react'
import { AgentsPanel } from '../panels/AgentsPanel'
import { ApprovalCard } from '../panels/ApprovalCard'
import { ChatPanel } from '../panels/ChatPanel'
import { Console } from '../panels/Console'
import { SettingsPanel } from '../panels/SettingsPanel'
import { UploadPanel } from '../panels/UploadPanel'
import { WriterOptions } from '../panels/WriterOptions'
import { Scene } from '../scene/Scene'
import { useStudioStore } from '../store'

type Scheda = 'materiale' | 'agenti' | 'console' | 'chat'

const SCHEDE: { id: Scheda; etichetta: string }[] = [
  { id: 'materiale', etichetta: 'Materiale' },
  { id: 'agenti', etichetta: 'Agenti' },
  { id: 'console', etichetta: 'Console' },
  { id: 'chat', etichetta: 'Chat' },
]

/**
 * iPad: scena a tutta larghezza in alto (~45%), sotto una barra a schede
 * grande. La card di approvazione diventa un pannello fisso in basso.
 */
export function TabletLayout() {
  const [scheda, setScheda] = useState<Scheda>('materiale')
  const nonVisti = useStudioStore((s) => s.logNonVisti)
  const erroriNonVisti = useStudioStore((s) => s.erroriNonVisti)
  const serveDecisione = useStudioStore((s) => s.approvazione === 'in_attesa')

  return (
    <div className="layout-tablet">
      <div className="palco palco-tablet">
        <Scene />
      </div>

      <nav className="barra-schede" role="tablist" aria-label="Sezioni">
        {SCHEDE.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={scheda === s.id}
            className={`scheda-barra ${scheda === s.id ? 'scheda-barra-attiva' : ''}`}
            onClick={() => setScheda(s.id)}
          >
            {s.etichetta}
            {s.id === 'console' && nonVisti > 0 && (
              <span className={`pastiglia ${erroriNonVisti > 0 ? 'pastiglia-errore' : ''}`}>{nonVisti}</span>
            )}
          </button>
        ))}
      </nav>

      <div className={`sezione ${serveDecisione ? 'sezione-con-ancora' : ''}`}>
        {scheda === 'materiale' && (
          <>
            <SettingsPanel />
            <UploadPanel />
          </>
        )}
        {scheda === 'agenti' && (
          <>
            <AgentsPanel />
            <WriterOptions />
          </>
        )}
        {scheda === 'console' && <Console />}
        {scheda === 'chat' && <ChatPanel />}
      </div>

      {serveDecisione && (
        <div className="ancora">
          <ApprovalCard variante="ancorata" />
        </div>
      )}
    </div>
  )
}
