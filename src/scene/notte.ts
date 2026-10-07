import { useCallback, useEffect, useState } from 'react'
import * as THREE from 'three'

/**
 * Giorno e notte nella sala. Di base segue l'orologio (notte dalle 20 alle 7);
 * se scegli tu, la scelta resta salvata in questo browser.
 */
export type PreferenzaNotte = 'auto' | 'giorno' | 'notte'

const CHIAVE = 'studio-tesi.notte'

function leggiPreferenza(): PreferenzaNotte {
  try {
    const v = localStorage.getItem(CHIAVE)
    if (v === 'giorno' || v === 'notte' || v === 'auto') return v
  } catch {
    /* storage non disponibile */
  }
  return 'auto'
}

export function notteDellOrologio(d = new Date()): boolean {
  const h = d.getHours()
  return h >= 20 || h < 7
}

export function useNotteScena(): { notte: boolean; preferenza: PreferenzaNotte; alterna: () => void } {
  const [preferenza, setPreferenza] = useState<PreferenzaNotte>(leggiPreferenza)
  const [orologio, setOrologio] = useState(() => notteDellOrologio())
  useEffect(() => {
    const id = window.setInterval(() => setOrologio(notteDellOrologio()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const notte = preferenza === 'auto' ? orologio : preferenza === 'notte'
  const alterna = useCallback(() => {
    const voluta = !notte
    // Se la scelta coincide con l'orologio torni a seguirlo.
    const nuova: PreferenzaNotte = voluta === notteDellOrologio() ? 'auto' : voluta ? 'notte' : 'giorno'
    setPreferenza(nuova)
    setOrologio(notteDellOrologio())
    try {
      localStorage.setItem(CHIAVE, nuova)
    } catch {
      /* storage non disponibile */
    }
  }, [notte])
  return { notte, preferenza, alterna }
}

/** Numeri pseudo-casuali ripetibili: le stelle restano sempre al loro posto. */
function generatore(seme: number) {
  let s = seme
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Cielo stellato sulla campagna calabrese, con la luna e i paesi accesi sulle colline. */
export function disegnaPanoramaNotte(g: CanvasRenderingContext2D, w: number, h: number) {
  const cielo = g.createLinearGradient(0, 0, 0, 215)
  cielo.addColorStop(0, '#050817')
  cielo.addColorStop(0.45, '#0f1a3d')
  cielo.addColorStop(0.8, '#2c2d5c')
  cielo.addColorStop(1, '#6b4a66')
  g.fillStyle = cielo
  g.fillRect(0, 0, w, h)
  // ultimo chiarore del tramonto
  const chiarore = g.createRadialGradient(260, 215, 10, 260, 215, 360)
  chiarore.addColorStop(0, 'rgba(255,150,100,0.42)')
  chiarore.addColorStop(1, 'rgba(255,150,100,0)')
  g.fillStyle = chiarore
  g.fillRect(0, 0, w, 230)
  // stelle
  const r = generatore(7)
  for (let i = 0; i < 260; i++) {
    const x = r() * w
    const y = Math.pow(r(), 1.6) * 190
    const grande = r() > 0.93
    g.globalAlpha = 0.35 + r() * 0.65 * (1 - y / 230)
    g.fillStyle = r() > 0.85 ? '#ffe7c2' : '#ffffff'
    g.beginPath()
    g.arc(x, y, grande ? 1.6 : 0.8, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  // luna con alone
  const alone = g.createRadialGradient(790, 64, 8, 790, 64, 90)
  alone.addColorStop(0, 'rgba(255,248,225,0.55)')
  alone.addColorStop(1, 'rgba(255,248,225,0)')
  g.fillStyle = alone
  g.fillRect(690, 0, 200, 170)
  g.fillStyle = '#fff6dc'
  g.beginPath()
  g.arc(790, 64, 20, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(200,190,160,0.35)'
  for (const [x, y, rr] of [[783, 58, 4], [797, 70, 3], [786, 73, 2.5]]) {
    g.beginPath()
    g.arc(x, y, rr, 0, Math.PI * 2)
    g.fill()
  }
  // mare con il riflesso della luna
  g.fillStyle = '#18213f'
  g.fillRect(0, 200, w, 18)
  g.fillStyle = 'rgba(255,240,200,0.55)'
  for (let i = 0; i < 6; i++) g.fillRect(770 - i * 3 + (i % 2) * 8, 202 + i * 2.6, 36 - i * 4, 1.4)
  // colline scure
  const collina = (base: number, ampiezza: number, colore: string, fase: number) => {
    g.fillStyle = colore
    g.beginPath()
    g.moveTo(0, h)
    for (let x = 0; x <= w; x += 8) g.lineTo(x, base + Math.sin(x / 140 + fase) * ampiezza + Math.sin(x / 47 + fase) * (ampiezza / 4))
    g.lineTo(w, h)
    g.fill()
  }
  collina(222, 10, '#1a2233', 0)
  // paesi sulle colline lontane: lucine calde
  const luci = generatore(42)
  for (const [cx, cy, n] of [[150, 226, 14], [470, 230, 9], [640, 224, 18], [930, 232, 8]]) {
    for (let i = 0; i < n; i++) {
      const x = cx + (luci() - 0.5) * 70
      const y = cy + luci() * 12
      g.fillStyle = 'rgba(255,190,110,0.28)'
      g.beginPath()
      g.arc(x, y, 3.2, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = luci() > 0.3 ? '#ffd28a' : '#fff1c9'
      g.fillRect(x - 0.8, y - 0.8, 1.7, 1.7)
    }
  }
  collina(250, 14, '#131a26', 2)
  collina(290, 8, '#0e141d', 4)
  for (let fila = 0; fila < 4; fila++) {
    for (let x = (fila % 2) * 18; x < w; x += 36) {
      g.fillStyle = fila > 1 ? '#080c12' : '#0b1018'
      g.beginPath()
      g.arc(x, 286 + fila * 26, 9 + fila * 2.5, 0, Math.PI * 2)
      g.fill()
    }
  }
  // qualche casolare acceso sulla collina: sagoma con tetto e finestre calde
  for (const [x, y] of [[330, 262], [720, 270]]) {
    const luce = g.createRadialGradient(x, y, 1, x, y, 16)
    luce.addColorStop(0, 'rgba(255,190,100,0.35)')
    luce.addColorStop(1, 'rgba(255,190,100,0)')
    g.fillStyle = luce
    g.fillRect(x - 16, y - 16, 32, 32)
    g.fillStyle = '#0b0f16'
    g.fillRect(x - 12, y - 3, 24, 8)
    g.beginPath()
    g.moveTo(x - 14, y - 3)
    g.lineTo(x - 4, y - 9)
    g.lineTo(x + 14, y - 3)
    g.fill()
    g.fillStyle = '#ffcf80'
    g.fillRect(x - 8, y, 2, 2)
    g.fillRect(x + 5, y, 2, 2)
  }
}

let alone: THREE.CanvasTexture | null = null

/** Sfumatura radiale bianca → trasparente, condivisa da tutti i bagliori. */
export function textureAlone(): THREE.CanvasTexture | null {
  if (alone) return alone
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (!g) return null
  const s = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  s.addColorStop(0, 'rgba(255,255,255,1)')
  s.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  s.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = s
  g.fillRect(0, 0, 64, 64)
  alone = new THREE.CanvasTexture(c)
  return alone
}
