import { useEffect, useState } from 'react'

export type LayoutMode = 'desktop' | 'tablet'

const DESKTOP_QUERY = '(min-width: 1024px)'
const COARSE_QUERY = '(pointer: coarse)'

function read(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query).matches
}

function subscribe(query: string, onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const list = window.matchMedia(query)
  list.addEventListener('change', onChange)
  window.addEventListener('resize', onChange)
  window.addEventListener('orientationchange', onChange)
  return () => {
    list.removeEventListener('change', onChange)
    window.removeEventListener('resize', onChange)
    window.removeEventListener('orientationchange', onChange)
  }
}

/**
 * 'desktop' da 1024px in su, 'tablet' sotto.
 * La soglia è solo sulla larghezza, così un iPad in landscape (≥1024px) usa la
 * disposizione affiancata del desktop mentre in portrait passa alle schede.
 */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() => (read(DESKTOP_QUERY) ? 'desktop' : 'tablet'))

  useEffect(
    () => subscribe(DESKTOP_QUERY, () => setMode(read(DESKTOP_QUERY) ? 'desktop' : 'tablet')),
    [],
  )

  return mode
}

/** true sui dispositivi a tocco: serve per stringere i limiti della telecamera. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState<boolean>(() => read(COARSE_QUERY))
  useEffect(() => subscribe(COARSE_QUERY, () => setCoarse(read(COARSE_QUERY))), [])
  return coarse
}
