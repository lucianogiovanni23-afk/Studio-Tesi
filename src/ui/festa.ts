/**
 * Coriandoli leggeri per i traguardi (capitolo approvato, indice approvato…).
 * Niente librerie: un canvas temporaneo che si toglie da solo. Con
 * "movimento ridotto" non fa niente.
 */
export function coriandoli(origine?: { x: number; y: number }) {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const c = document.createElement('canvas')
  c.className = 'coriandoli'
  c.width = window.innerWidth
  c.height = window.innerHeight
  document.body.appendChild(c)
  const g = c.getContext('2d')
  if (!g) return c.remove()
  const colori = ['#5f7128', '#c9a43a', '#4f8fbf', '#a4553a', '#93c66a', '#f2d16b']
  const ox = origine?.x ?? c.width / 2
  const oy = origine?.y ?? c.height / 3
  const pezzi = Array.from({ length: 110 }, () => {
    const a = Math.random() * Math.PI * 2
    const v = 4 + Math.random() * 7
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: colori[Math.floor(Math.random() * colori.length)] }
  })
  let fotogramma = 0
  const passo = () => {
    fotogramma++
    g.clearRect(0, 0, c.width, c.height)
    for (const p of pezzi) {
      p.vy += 0.22
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.r += p.vr
      g.save()
      g.translate(p.x, p.y)
      g.rotate(p.r)
      g.globalAlpha = Math.max(0, 1 - fotogramma / 110)
      g.fillStyle = p.c
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      g.restore()
    }
    if (fotogramma < 110) requestAnimationFrame(passo)
    else c.remove()
  }
  requestAnimationFrame(passo)
}
