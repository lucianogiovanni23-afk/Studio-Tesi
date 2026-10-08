import { RoundedBox } from '@react-three/drei'
import { uvMetriche, useMateriali } from './materiali'

/**
 * Sedia ergonomica da lavoro di fascia alta: schienale alto avvolgente con
 * poggiatesta, supporto lombare, braccioli 4D, imbottitura in pelle nera con
 * inserti nel colore della persona e base a cinque razze in alluminio.
 * Chi siede guarda verso +z; lo schienale sta dietro, verso -z.
 */
export function Sedia({ accento, ombre }: { accento: string; ombre: boolean }) {
  const m = useMateriali()
  const pelle = m.pelle('#1b1c20')
  const pelleAccento = m.pelle(accento)
  const alluminio = m.metallo('#c3c8cf')
  const cromo = m.metallo('#e1e4e8')
  const plastica = m.pelle('#202227')
  /** UV in metri: la grana della pelle ha la stessa scala su ogni cuscino. */
  const g = uvMetriche(0.22)
  return (
    <group position={[0, 0, -0.02]}>
      {/* base a cinque razze con ruote */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 + 0.3
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[0, 0.085, 0.17]} rotation={[0.08, 0, 0]} castShadow={ombre}>
              <boxGeometry args={[0.045, 0.03, 0.34]} />
              <primitive object={alluminio} attach="material" />
            </mesh>
            <mesh position={[0, 0.032, 0.33]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.03, 0.03, 0.04, 16]} />
              <meshStandardMaterial color="#111" roughness={0.4} />
            </mesh>
          </group>
        )
      })}
      {/* pistone a gas e meccanismo */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.06, 20]} />
        <primitive object={alluminio} attach="material" />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.025, 0.032, 0.3, 16]} />
        <primitive object={cromo} attach="material" />
      </mesh>
      <RoundedBox ref={g} args={[0.24, 0.05, 0.26]} radius={0.015} position={[0, 0.405, 0]}>
        <meshStandardMaterial color="#22252a" metalness={0.6} roughness={0.35} />
      </RoundedBox>

      {/* seduta con fianchi rialzati */}
      <RoundedBox ref={g} args={[0.5, 0.09, 0.5]} radius={0.04} smoothness={4} position={[0, 0.46, 0]} castShadow={ombre}>
        <primitive object={pelle} attach="material" />
      </RoundedBox>
      {[-1, 1].map((s) => (
        <RoundedBox ref={g} key={s} args={[0.08, 0.06, 0.5]} radius={0.03} smoothness={3} position={[s * 0.24, 0.5, 0]}>
          <primitive object={pelleAccento} attach="material" />
        </RoundedBox>
      ))}

      {/* braccioli regolabili */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.3, 0, -0.04]}>
          <mesh position={[0, 0.52, 0]}>
            <boxGeometry args={[0.035, 0.22, 0.05]} />
            <meshStandardMaterial color="#202227" metalness={0.5} roughness={0.35} />
          </mesh>
          <RoundedBox ref={g} args={[0.085, 0.035, 0.26]} radius={0.015} position={[0, 0.645, 0.03]} castShadow={ombre}>
            <primitive object={plastica} attach="material" />
          </RoundedBox>
        </group>
      ))}

      {/* schienale alto, leggermente reclinato */}
      <group position={[0, 0.5, -0.28]} rotation={[-0.14, 0, 0]}>
        <RoundedBox ref={g} args={[0.5, 0.82, 0.1]} radius={0.05} smoothness={4} position={[0, 0.45, 0]} castShadow={ombre}>
          <primitive object={pelle} attach="material" />
        </RoundedBox>
        {/* ali avvolgenti nel colore della persona */}
        {[-1, 1].map((s) => (
          <RoundedBox
            key={s}
            args={[0.09, 0.62, 0.12]}
            radius={0.04}
            smoothness={3}
            position={[s * 0.255, 0.4, 0.035]}
            rotation={[0, s * -0.35, 0]}
          >
            <primitive object={pelleAccento} attach="material" />
          </RoundedBox>
        ))}
        {/* spalle e poggiatesta */}
        <RoundedBox ref={g} args={[0.42, 0.12, 0.1]} radius={0.045} smoothness={3} position={[0, 0.86, 0.005]}>
          <primitive object={pelle} attach="material" />
        </RoundedBox>
        <RoundedBox ref={g} args={[0.27, 0.13, 0.09]} radius={0.05} smoothness={4} position={[0, 1.0, 0.04]} castShadow={ombre}>
          <primitive object={pelle} attach="material" />
        </RoundedBox>
        <mesh position={[0, 1.0, 0.087]}>
          <boxGeometry args={[0.16, 0.012, 0.002]} />
          <primitive object={pelleAccento} attach="material" />
        </mesh>
        {/* cuscino lombare */}
        <RoundedBox ref={g} args={[0.3, 0.12, 0.07]} radius={0.035} smoothness={3} position={[0, 0.22, 0.07]}>
          <primitive object={plastica} attach="material" />
        </RoundedBox>
        {/* cuciture verticali visibili dal retro e dai lati */}
        {[-0.08, 0, 0.08].map((x) => (
          <mesh key={x} position={[x, 0.45, -0.052]}>
            <boxGeometry args={[0.006, 0.7, 0.002]} />
            <primitive object={pelleAccento} attach="material" />
          </mesh>
        ))}
      </group>
    </group>
  )
}
