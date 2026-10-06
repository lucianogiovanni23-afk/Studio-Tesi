import { Html } from '@react-three/drei'
import type { AgentKey } from '../types'
import { PassaggiRagionamento } from '../components/PassaggiRagionamento'

/** Nuvoletta ancorata sopra l'agente: una sola aperta alla volta. */
export function ReasoningBubble({ agentKey }: { agentKey: AgentKey }) {
  return (
    <Html position={[0, 3.3, -0.75]} center distanceFactor={7.5} zIndexRange={[60, 40]}>
      <div onPointerDown={(e) => e.stopPropagation()}>
        <PassaggiRagionamento agentKey={agentKey} />
      </div>
    </Html>
  )
}
