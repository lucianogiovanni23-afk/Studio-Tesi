import { contestoAudio, suoniAccesi } from './suoni'

/**
 * Sottofondo dell'ufficio: un brusio lievissimo (rumore filtrato che
 * "respira" piano, come l'aria condizionata e la sala lontana) e il ronzio
 * basso delle macchine. Tutto sintetizzato con Web Audio, niente file.
 * Suona solo se l'utente ha acceso i suoni e solo mentre l'ufficio è
 * visibile; sfuma in entrata e in uscita.
 */

interface Ambiente {
  uscita: GainNode
  sorgenti: AudioScheduledSourceNode[]
}

const VOLUME = 0.05
let attivo: Ambiente | null = null
let spegnimento: number | undefined

/** Rumore rosa (Paul Kellet), 4 secondi in loop: abbastanza lungo da non sentire la ripetizione. */
function rumoreRosa(a: AudioContext): AudioBuffer {
  const durata = 4
  const b = a.createBuffer(1, a.sampleRate * durata, a.sampleRate)
  const d = b.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  // raccordo morbido fra fine e inizio del loop
  const raccordo = Math.floor(a.sampleRate * 0.05)
  for (let i = 0; i < raccordo; i++) {
    const t = i / raccordo
    d[d.length - raccordo + i] = d[d.length - raccordo + i] * (1 - t) + d[i] * t
  }
  return b
}

function crea(a: AudioContext): Ambiente {
  const uscita = a.createGain()
  uscita.gain.value = 0
  uscita.connect(a.destination)

  // brusio d'aria: rumore rosa passa-basso, con un respiro lentissimo
  const rumore = a.createBufferSource()
  rumore.buffer = rumoreRosa(a)
  rumore.loop = true
  const filtro = a.createBiquadFilter()
  filtro.type = 'lowpass'
  filtro.frequency.value = 520
  filtro.Q.value = 0.4
  const aria = a.createGain()
  aria.gain.value = 0.9
  const respiro = a.createOscillator()
  respiro.frequency.value = 0.07
  const ampiezza = a.createGain()
  ampiezza.gain.value = 0.18
  respiro.connect(ampiezza).connect(aria.gain)
  rumore.connect(filtro).connect(aria).connect(uscita)

  // ronzio basso delle macchine (50 Hz e armonica), appena percettibile
  const ronzio = a.createGain()
  ronzio.gain.value = 0.05
  const toni = [50, 100, 150].map((f, i) => {
    const o = a.createOscillator()
    o.frequency.value = f
    const g = a.createGain()
    g.gain.value = [1, 0.45, 0.15][i]
    o.connect(g).connect(ronzio)
    return o
  })
  ronzio.connect(uscita)

  const sorgenti: AudioScheduledSourceNode[] = [rumore, respiro, ...toni]
  sorgenti.forEach((s) => s.start())
  return { uscita, sorgenti }
}

function sfuma(a: AudioContext, g: GainNode, valore: number, secondi: number) {
  const t = a.currentTime
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(g.gain.value, t)
  g.gain.linearRampToValueAtTime(valore, t + secondi)
}

/** Accende il sottofondo (se i suoni sono accesi). Idempotente. */
export function avviaAmbiente() {
  if (!suoniAccesi()) return
  const a = contestoAudio()
  if (!a) return
  window.clearTimeout(spegnimento)
  attivo ??= crea(a)
  sfuma(a, attivo.uscita, VOLUME, 2)
}

/** Spegne il sottofondo con una sfumatura breve e libera le risorse. */
export function fermaAmbiente() {
  const amb = attivo
  if (!amb) return
  const a = amb.uscita.context as AudioContext
  sfuma(a, amb.uscita, 0, 0.6)
  window.clearTimeout(spegnimento)
  spegnimento = window.setTimeout(() => {
    amb.sorgenti.forEach((s) => {
      try {
        s.stop()
      } catch {
        /* già ferma */
      }
    })
    amb.uscita.disconnect()
    if (attivo === amb) attivo = null
  }, 700)
}

/**
 * Tiene il sottofondo allineato a: preferenza suoni, pagina visibile.
 * Restituisce la funzione per smettere (da chiamare quando l'ufficio si chiude).
 */
export function seguiAmbiente(): () => void {
  const aggiorna = () => {
    if (suoniAccesi() && document.visibilityState === 'visible') avviaAmbiente()
    else fermaAmbiente()
  }
  // Il browser sblocca l'audio solo dopo un gesto: al primo tocco si riprova.
  const gesto = () => aggiorna()
  aggiorna()
  window.addEventListener('studio-tesi-suoni', aggiorna)
  document.addEventListener('visibilitychange', aggiorna)
  window.addEventListener('pointerdown', gesto, { once: true })
  window.addEventListener('keydown', gesto, { once: true })
  return () => {
    window.removeEventListener('studio-tesi-suoni', aggiorna)
    document.removeEventListener('visibilitychange', aggiorna)
    window.removeEventListener('pointerdown', gesto)
    window.removeEventListener('keydown', gesto)
    fermaAmbiente()
  }
}
