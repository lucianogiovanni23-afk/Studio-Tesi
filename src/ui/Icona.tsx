import type { ReactNode } from 'react'

/**
 * Icone a tratto, tutte sulla stessa griglia 24x24 e con lo stesso spessore.
 * Uso: <Icona nome="cerca" /> — si colora col colore del testo.
 */
const PERCORSI: Record<string, ReactNode> = {
  cerca: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  piu: <path d="M12 5v14M5 12h14" />,
  chiudi: <path d="M6 6l12 12M18 6 6 18" />,
  freccia: <path d="M5 12h14M13 6l6 6-6 6" />,
  indietro: <path d="M19 12H5M11 6l-6 6 6 6" />,
  giu: <path d="m6 9 6 6 6-6" />,
  su: <path d="m6 15 6-6 6 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  carica: <><path d="M12 15V4M7 9l5-5 5 5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></>,
  scarica: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></>,
  libro: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></>,
  libri: <><path d="M4 4h4v16H4zM10 4h4v16h-4z" /><path d="m16 5 3.5-1 3 15.5-3.5 1z" /></>,
  matita: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  spunta: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lente: <><circle cx="10" cy="10" r="6" /><path d="m20 20-5.6-5.6M7.5 10h5M10 7.5v5" /></>,
  scintille: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6 6 2 2M16 16l2 2M6 18l2-2M16 8l2-2" /></>,
  bacchetta: <><path d="m4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6z" /></>,
  ingranaggio: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  scudo: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />,
  dispositivi: <><rect x="2" y="5" width="14" height="10" rx="1.5" /><path d="M6 19h6M9 15v4" /><rect x="17" y="8" width="5" height="11" rx="1.2" /></>,
  chiave: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></>,
  grafico: <><path d="M4 20V4M4 20h16" /><path d="m7 15 4-5 3 3 5-7" /></>,
  orologio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  filtro: <path d="M4 5h16l-6 8v5l-4 2v-7z" />,
  griglia: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  elenco: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  mappa: <><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  parola: <><path d="M4 7V5h16v2M12 5v14M9 19h6" /></>,
  nota: <><path d="M5 4h14v12l-4 4H5z" /><path d="M15 20v-4h4M9 9h6M9 13h4" /></>,
  cassetto: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  versioni: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5h4" /><path d="M3 12h2" /></>,
  word: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="m8 11 1.5 6 2.5-4.5 2.5 4.5L16 11" /></>,
  avviso: <><path d="M12 4 2.5 20h19z" /><path d="M12 10v4M12 17v.5" /></>,
  cestino: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  copia: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  sole: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  luna: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  suono: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  muto: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="m17 9 5 6M22 9l-5 6" /></>,
  persona: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5" /></>,
  casa: <><path d="m3 11 9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  aggiorna: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  occhio: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  bandiera: <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>,
  concentrazione: <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />,
  carta: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
}

export type NomeIcona = keyof typeof PERCORSI

export function Icona({ nome, dimensione = 18, className = '' }: { nome: string; dimensione?: number; className?: string }) {
  return (
    <svg
      className={`ico ${className}`}
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PERCORSI[nome] ?? PERCORSI.info}
    </svg>
  )
}
