import { useEffect, useState } from 'react'
import { useStudio } from '../store'

export type ModoEffettivo = 'computer' | 'ipad'

/** iPad (anche con iPadOS che si presenta come Mac), tablet e telefoni. */
export function dispositivoTattile(): boolean {
  if (typeof window === 'undefined') return false
  const grossolano = window.matchMedia?.('(pointer: coarse)').matches === true
  const ipadOs = /Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1
  return grossolano || ipadOs
}

/**
 * Due modi d'uso nella stessa app: "computer" è la postazione completa,
 * "ipad" è pensato per lettura e decisioni. La scelta automatica guarda il
 * dispositivo; lo studente può cambiarla a mano dalle impostazioni.
 */
export function useModoUso(): ModoEffettivo {
  const scelta = useStudio((s) => s.preferenze.modoUso)
  const [tattile, setTattile] = useState(dispositivoTattile)

  useEffect(() => {
    const query = window.matchMedia?.('(pointer: coarse)')
    const aggiorna = () => setTattile(dispositivoTattile())
    query?.addEventListener('change', aggiorna)
    return () => query?.removeEventListener('change', aggiorna)
  }, [])

  if (scelta === 'auto') return tattile ? 'ipad' : 'computer'
  return scelta
}
