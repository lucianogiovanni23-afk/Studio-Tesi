/**
 * Suoni leggeri, sintetizzati al volo con Web Audio (niente file da
 * scaricare). Spenti di default: si accendono in Impostazioni o dalla
 * testata. La scelta resta in questo browser.
 */
const CHIAVE = 'studio-tesi.suoni'
let contesto: AudioContext | null = null

export function suoniAccesi(): boolean {
  try {
    return localStorage.getItem(CHIAVE) === '1'
  } catch {
    return false
  }
}

export function impostaSuoni(acceso: boolean) {
  try {
    localStorage.setItem(CHIAVE, acceso ? '1' : '0')
  } catch {
    /* niente: il browser non salva */
  }
  window.dispatchEvent(new Event('studio-tesi-suoni'))
}

function ctx(): AudioContext | null {
  if (!suoniAccesi()) return null
  try {
    contesto ??= new AudioContext()
    if (contesto.state === 'suspended') void contesto.resume()
    return contesto
  } catch {
    return null
  }
}

function nota(freq: number, inizio: number, durata: number, volume = 0.08, tipo: OscillatorType = 'sine') {
  const a = ctx()
  if (!a) return
  const o = a.createOscillator()
  const v = a.createGain()
  o.type = tipo
  o.frequency.value = freq
  const t = a.currentTime + inizio
  v.gain.setValueAtTime(0, t)
  v.gain.linearRampToValueAtTime(volume, t + 0.01)
  v.gain.exponentialRampToValueAtTime(0.0001, t + durata)
  o.connect(v).connect(a.destination)
  o.start(t)
  o.stop(t + durata + 0.02)
}

/** "Tic" quando arriva una risposta. */
export function suonoRisposta() {
  nota(880, 0, 0.12, 0.06)
  nota(1320, 0.07, 0.16, 0.05)
}

/** Piccolo accordo per un traguardo. */
export function suonoTraguardo() {
  nota(523, 0, 0.3, 0.06, 'triangle')
  nota(659, 0.08, 0.3, 0.06, 'triangle')
  nota(784, 0.16, 0.45, 0.06, 'triangle')
}

/** Ticchettio di tastiera, per quando lo scrittore scrive. */
let ultimoTasto = 0
export function suonoTasto() {
  const ora = performance.now()
  if (ora - ultimoTasto < 70) return
  ultimoTasto = ora
  nota(1800 + Math.random() * 600, 0, 0.03, 0.025, 'square')
}
