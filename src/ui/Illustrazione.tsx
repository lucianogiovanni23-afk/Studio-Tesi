/**
 * Illustrazioni delle intestazioni di pagina, disegnate a mano in SVG:
 * uliveto (Corso), scaffali (Fonti), scrivania (Scrittura), lente
 * (Revisione), ingranaggi (Impostazioni). Usano il colore del collega
 * della pagina (--colore-agente) e l'oro.
 */
export type TipoIllustrazione = 'uliveto' | 'scaffali' | 'scrivania' | 'lente' | 'ingranaggi' | 'chat'

const A = 'var(--colore-agente, var(--oliva))'
const O = 'var(--oro)'

function Uliveto() {
  return (
    <>
      <circle cx="232" cy="38" r="20" fill={O} opacity="0.55" />
      <path d="M0 128 C60 100 120 112 170 98 S260 84 300 96 V160 H0z" fill={A} opacity="0.18" />
      <path d="M0 140 C70 120 140 130 200 118 S270 112 300 120 V160 H0z" fill={A} opacity="0.28" />
      {[
        [70, 112, 1],
        [140, 104, 1.25],
        [215, 100, 0.95],
      ].map(([x, y, s]) => (
        <g key={x} transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M0 18 C-2 8 3 2 0 -6" stroke="#6b5440" strokeWidth="4" fill="none" strokeLinecap="round" />
          <ellipse cx="-10" cy="-14" rx="16" ry="11" fill={A} opacity="0.75" />
          <ellipse cx="10" cy="-18" rx="17" ry="12" fill={A} opacity="0.9" />
          <ellipse cx="0" cy="-27" rx="13" ry="9" fill={A} />
          <circle cx="-6" cy="-12" r="2.4" fill="#2a2e22" opacity="0.7" />
          <circle cx="12" cy="-20" r="2.4" fill="#2a2e22" opacity="0.7" />
        </g>
      ))}
    </>
  )
}

function Scaffali() {
  const libri = [14, 10, 16, 12, 9, 15, 11, 13, 10, 16, 12]
  return (
    <>
      {[44, 92, 140].map((y, r) => (
        <g key={y}>
          <rect x="60" y={y} width="200" height="5" rx="2" fill={A} opacity="0.55" />
          {libri.map((w, i) => {
            const x = 66 + libri.slice(0, i).reduce((a, b) => a + b + 3, 0)
            const h = 30 + ((i * 7 + r * 5) % 12)
            return x + w < 258 ? (
              <rect key={i} x={x} y={y - h} width={w} height={h} rx="2" fill={i % 3 === 0 ? O : A} opacity={0.35 + ((i + r) % 3) * 0.22} transform={i === 6 && r === 1 ? `rotate(-12 ${x} ${y})` : undefined} />
            ) : null
          })}
        </g>
      ))}
    </>
  )
}

function ScrivaniaIll() {
  return (
    <>
      <rect x="40" y="118" width="230" height="8" rx="4" fill={A} opacity="0.5" />
      <rect x="150" y="56" width="96" height="58" rx="6" fill={A} opacity="0.85" />
      <rect x="156" y="62" width="84" height="46" rx="3" fill="#fffdf6" opacity="0.92" />
      {[70, 78, 86, 94].map((y, i) => (
        <rect key={y} x="162" y={y} width={[60, 70, 52, 66][i]} height="3" rx="1.5" fill={A} opacity="0.5" />
      ))}
      <rect x="194" y="114" width="8" height="6" fill={A} opacity="0.7" />
      <path d="M70 116 L84 70 L112 70 L100 116z" fill={O} opacity="0.55" />
      <rect x="62" y="98" width="46" height="18" rx="3" fill="#fffdf6" opacity="0.85" transform="rotate(-6 62 98)" />
      <path d="M120 112 l34 -40" stroke="#2a2e22" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
      <path d="M150 76 l6 -6" stroke={O} strokeWidth="4" strokeLinecap="round" />
      <circle cx="252" cy="104" r="9" fill={O} opacity="0.7" />
      <path d="M248 88 c2 -6 -2 -8 0 -12 M254 88 c2 -6 -2 -8 0 -12" stroke={A} strokeWidth="2" fill="none" opacity="0.5" />
    </>
  )
}

function Lente() {
  return (
    <>
      <rect x="70" y="24" width="120" height="120" rx="8" fill="#fffdf6" opacity="0.9" stroke={A} strokeOpacity="0.4" />
      {[44, 56, 68, 80, 92, 104, 116].map((y, i) => (
        <rect key={y} x="84" y={y} width={[80, 92, 70, 88, 60, 84, 74][i]} height="4" rx="2" fill={i === 3 ? O : A} opacity={i === 3 ? 0.9 : 0.35} />
      ))}
      <circle cx="200" cy="82" r="38" fill={A} opacity="0.12" stroke={A} strokeWidth="9" />
      <path d="M228 110 l34 34" stroke={A} strokeWidth="13" strokeLinecap="round" />
      <path d="M186 64 a20 20 0 0 1 22 -4" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.7" />
      <circle cx="96" cy="140" r="14" fill={O} />
      <path d="m89 140 5 5 9 -10" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

function Ingranaggi() {
  const dente = (cx: number, cy: number, r: number, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return <rect key={i} x={cx - 5} y={cy - r - 9} width="10" height="14" rx="2" transform={`rotate(${(a * 180) / Math.PI} ${cx} ${cy})`} />
    })
  return (
    <>
      <g fill={A} opacity="0.7">
        {dente(150, 80, 34, 10)}
        <circle cx="150" cy="80" r="36" />
      </g>
      <circle cx="150" cy="80" r="13" fill="var(--carta)" />
      <g fill={O} opacity="0.8">
        {dente(222, 112, 20, 8)}
        <circle cx="222" cy="112" r="22" />
      </g>
      <circle cx="222" cy="112" r="8" fill="var(--carta)" />
    </>
  )
}

function Chat() {
  return (
    <>
      <rect x="70" y="30" width="130" height="56" rx="18" fill={A} opacity="0.8" />
      <path d="M96 86 l-8 18 24 -18z" fill={A} opacity="0.8" />
      <rect x="130" y="84" width="120" height="48" rx="16" fill={O} opacity="0.7" />
      <path d="M226 132 l8 16 -22 -16z" fill={O} opacity="0.7" />
      {[50, 62].map((y) => (
        <rect key={y} x="88" y={y} width="90" height="5" rx="2.5" fill="#fff" opacity="0.8" />
      ))}
    </>
  )
}

export function Illustrazione({ tipo }: { tipo: TipoIllustrazione }) {
  return (
    <svg className="illustrazione-pagina" viewBox="0 0 300 160" aria-hidden>
      {tipo === 'uliveto' && <Uliveto />}
      {tipo === 'scaffali' && <Scaffali />}
      {tipo === 'scrivania' && <ScrivaniaIll />}
      {tipo === 'lente' && <Lente />}
      {tipo === 'ingranaggi' && <Ingranaggi />}
      {tipo === 'chat' && <Chat />}
    </svg>
  )
}
