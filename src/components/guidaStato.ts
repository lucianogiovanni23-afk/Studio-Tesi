import { create } from 'zustand'

/** Se la guida è già stata vista su questo dispositivo, e se la finestra è aperta. */
const CHIAVE = 'studio-tesi.guida-vista'

function letta(): boolean {
  try {
    return localStorage.getItem(CHIAVE) === '1'
  } catch {
    return false
  }
}

export const useGuida = create<{ vista: boolean; aperta: boolean }>(() => ({ vista: letta(), aperta: false }))

export function segnaGuidaVista() {
  try {
    localStorage.setItem(CHIAVE, '1')
  } catch {
    // Senza storage la guida ricomparirà al prossimo avvio: nessun danno.
  }
  useGuida.setState({ vista: true, aperta: false })
}
