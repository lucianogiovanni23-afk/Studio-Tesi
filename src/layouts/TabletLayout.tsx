import { ApprovalCard } from '../panels/ApprovalCard'
import { OutlineCard } from '../panels/OutlineCard'
import { Workspace } from '../panels/Workspace'
import { Scene } from '../scene/Scene'
import type { QualitaScena } from '../scene/qualita'
import { useStudioStore } from '../store'

/**
 * iPad in verticale: scena in alto, sotto l'area di lavoro a schede. Le
 * decisioni (fonti e scaletta) diventano un pannello fisso in basso, sempre a
 * portata di dito qualunque scheda sia aperta.
 */
export function TabletLayout({ qualita }: { qualita: QualitaScena }) {
  const attesaFonti = useStudioStore((s) => s.approvazione === 'in_attesa')
  const attesaScaletta = useStudioStore((s) => s.approvazioneScaletta === 'in_attesa')

  return (
    <div className="layout-tablet">
      {qualita !== 'spenta' && (
        <div className={`palco palco-tablet ${qualita === 'ridotta' ? 'palco-basso' : ''}`}>
          <Scene key={qualita} qualita={qualita} />
        </div>
      )}

      <Workspace approvazioniAncorate />

      {(attesaFonti || attesaScaletta) && (
        <div className="ancora">
          {attesaFonti ? <ApprovalCard variante="ancorata" /> : <OutlineCard variante="ancorata" />}
        </div>
      )}
    </div>
  )
}
