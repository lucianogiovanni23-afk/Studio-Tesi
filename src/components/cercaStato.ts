import { create } from 'zustand'

/** Se la finestra "Cerca in tutta la tesi" è aperta. */
export const useCerca = create<{ aperta: boolean }>(() => ({ aperta: false }))

export const apriCerca = () => useCerca.setState({ aperta: true })
export const chiudiCerca = () => useCerca.setState({ aperta: false })
