import { useEffect, useState } from 'react'

function legge(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query).matches
}

/** true quando lo schermo è abbastanza largo per le colonne affiancate. */
export function useLargo(minimo = 1100): boolean {
  const query = `(min-width: ${minimo}px)`
  const [largo, setLargo] = useState(() => legge(query))
  useEffect(() => {
    const lista = window.matchMedia?.(query)
    const aggiorna = () => setLargo(legge(query))
    lista?.addEventListener('change', aggiorna)
    return () => lista?.removeEventListener('change', aggiorna)
  }, [query])
  return largo
}

export function useMovimentoRidotto(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [ridotto, setRidotto] = useState(() => legge(query))
  useEffect(() => {
    const lista = window.matchMedia?.(query)
    const aggiorna = () => setRidotto(legge(query))
    lista?.addEventListener('change', aggiorna)
    return () => lista?.removeEventListener('change', aggiorna)
  }, [])
  return ridotto
}
