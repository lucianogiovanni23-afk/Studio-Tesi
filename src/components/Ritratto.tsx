import { useState } from 'react'
import { AGENTE } from '../agents/agenti'
import type { AgentKey } from '../types'

/**
 * Ritratto a mezzo busto della persona dell'ufficio 3D: la foto "da studio"
 * dell'avatar (public/assets/persone/<chiave>.webp, resa offline dal GLB) su
 * un fondo tondo nel colore dell'agente. Se l'immagine non arriva si torna al
 * disegno vettoriale.
 */
export function Ritratto({ k, dimensione = 44 }: { k: AgentKey; dimensione?: number }) {
  const [errore, setErrore] = useState(false)
  const { nome } = AGENTE[k].persona
  const colore = AGENTE[k].colore
  if (errore) return <RitrattoDisegnato k={k} dimensione={dimensione} />
  return (
    <span
      className="ritratto"
      role="img"
      aria-label={nome}
      style={{
        width: dimensione,
        height: dimensione,
        flex: 'none',
        overflow: 'hidden',
        background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${colore} 16%, #fbf8f3), color-mix(in srgb, ${colore} 46%, #cfc6ba))`,
      }}
    >
      <img
        src={`${import.meta.env.BASE_URL}assets/persone/${k}.webp`}
        alt=""
        width={dimensione}
        height={dimensione}
        decoding="async"
        draggable={false}
        onError={() => setErrore(true)}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </span>
  )
}

/** Il ritratto disegnato, con gli stessi colori della persona semplice: riserva se manca la foto. */
function RitrattoDisegnato({ k, dimensione }: { k: AgentKey; dimensione: number }) {
  const { aspetto: a, nome } = AGENTE[k].persona
  const fondo = AGENTE[k].colore
  return (
    <svg className="ritratto" viewBox="0 0 64 64" width={dimensione} height={dimensione} role="img" aria-label={nome}>
      <defs>
        <clipPath id={`ritratto-${k}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#ritratto-${k})`}>
        <rect width="64" height="64" fill={fondo} opacity="0.22" />
        {/* giacca, camicia, cravatta */}
        <path d="M6 64 C8 48 18 43 32 43 C46 43 56 48 58 64 Z" fill={a.abito} />
        <path d="M25 43 L32 56 L39 43 Z" fill="#f7f7f4" />
        <path d="M30.4 45 L33.6 45 L34.4 58 L32 61 L29.6 58 Z" fill={a.cravatta} />
        <path d="M25 43 L32 56 L28 45 Z M39 43 L32 56 L36 45 Z" fill="#000" opacity="0.18" />
        {/* collo e testa */}
        <rect x="27.5" y="36" width="9" height="9" rx="3" fill={a.pelle} />
        {a.taglio === 'caschetto' && <path d="M17 28 C17 14 47 14 47 28 L48 42 L41 42 L41 28 L23 28 L23 42 L16 42 Z" fill={a.capelli} />}
        <ellipse cx="32" cy="27" rx="11" ry="13" fill={a.pelle} />
        {a.barba && <path d="M22 28 C23 41 41 41 42 28 C40 36 24 36 22 28 Z" fill={a.capelli} />}
        {/* capelli */}
        {a.taglio === 'ricci' ? (
          <g fill={a.capelli}>
            <circle cx="24" cy="17" r="5" />
            <circle cx="31" cy="14" r="5.5" />
            <circle cx="38" cy="16" r="5" />
            <path d="M21 22 C21 12 43 12 43 22 L43 20 C40 17 24 17 21 21 Z" />
          </g>
        ) : (
          <path d="M20.5 25 C20 11 44 11 43.5 25 C41 19 34 17 24 19 C22 20 21 22 20.5 25 Z" fill={a.capelli} />
        )}
        {a.taglio === 'raccolti' && <circle cx="32" cy="12" r="4.5" fill={a.capelli} />}
        {/* viso */}
        <circle cx="27.8" cy="27" r="1.3" fill="#2a211c" />
        <circle cx="36.2" cy="27" r="1.3" fill="#2a211c" />
        <path d="M28.5 33.5 Q32 35.6 35.5 33.5" stroke="#8d4a45" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {a.occhiali && (
          <g stroke="#1a1a1a" strokeWidth="1" fill="none">
            <circle cx="27.8" cy="27" r="3.2" />
            <circle cx="36.2" cy="27" r="3.2" />
            <path d="M31 27 L33 27" />
          </g>
        )}
      </g>
    </svg>
  )
}
