import { create } from 'zustand'
import { useMemo } from 'react'
import { useStudio } from '../store'

/**
 * Impostazioni grafiche dell'ufficio 3D, come nei menu dei videogiochi.
 * Valgono solo su questo dispositivo: stanno in localStorage
 * (`studio-tesi.grafica`, JSON con versione) e non entrano nel progetto.
 *
 * Il preset sceglie in blocco i valori di "Schermo" e "Grafica"; toccare a
 * mano uno di questi valori passa a "Personalizzata". Limite FPS, contatore,
 * campo visivo e le voci di "Avanzate" sono preferenze a parte e non
 * cambiano il preset.
 */

export type NomePreset = 'automatica' | 'bassa' | 'media' | 'alta' | 'epica' | 'personalizzata'
export type Antialiasing = 'off' | 'fxaa' | 'smaa' | 'msaa2' | 'msaa4'

/** I valori che il preset decide. */
export interface ValoriGrafica {
  /** Scala di rendering, in % della densità di pixel del dispositivo (50–200). */
  scala: number
  /** Densità di pixel massima di partenza (1 = come un monitor normale, 2 = retina). Non è nel menu. */
  tettoDpr: number
  dinamica: boolean
  /** 0 spente, 1 basse (512), 2 medie (1024), 3 alte (2048, morbide), 4 epiche (4096, morbide, in tempo reale). */
  ombre: 0 | 1 | 2 | 3 | 4
  /** Occlusione ambientale: 0 spenta, 1 media (metà risoluzione), 2 alta. */
  ao: 0 | 1 | 2
  aa: Antialiasing
  bagliore: boolean
  /** 0 bassa (texture piccole), 1 media, 2 alta (texture grandi con rilievo). */
  texture: 0 | 1 | 2
  /** 0 semplice (modello leggero), 1 realistica (dettaglio pieno da vicino), 2 massima (sempre pieno). */
  persone: 0 | 1 | 2
  /** 0 niente riflessi, 1 riflessi semplici (colore del cielo), 2 specchio vero. */
  mare: 0 | 1 | 2
  /** Lato della texture dello specchio del mare. Non è nel menu: lo decide il preset. */
  risSpecchio: number
  /** Fin dove arrivano gli ulivi e quanto dettaglio hanno: 0 vicina, 1 media, 2 lontana. */
  alberi: 0 | 1 | 2
  /** Densità della vegetazione lontana, in % (20–100). */
  vegetazione: number
  cielo: boolean
  cinema: boolean
  /** Luci realistiche: lampade e PC illuminano davvero la sala, i LED superano il bianco e brillano. */
  luci: boolean
}

/** Preferenze che non dipendono dal preset. */
export interface ExtraGrafica {
  /** 0 = illimitato. */
  fps: 0 | 30 | 60 | 120
  mostraFps: boolean
  /** Campo visivo verticale di base, in gradi (40–75). */
  fov: number
  /** null = come il sistema (spente con "riduci movimento"). */
  animazioni: boolean | null
  entrata: boolean
  pausa: boolean
  precompila: boolean
}

export const PRESET: Record<'bassa' | 'media' | 'alta' | 'epica', ValoriGrafica> = {
  bassa: { scala: 85, tettoDpr: 1, dinamica: false, ombre: 0, ao: 0, aa: 'fxaa', bagliore: false, texture: 0, persone: 0, mare: 0, risSpecchio: 256, alberi: 0, vegetazione: 40, cielo: false, cinema: false, luci: false },
  media: { scala: 100, tettoDpr: 1, dinamica: true, ombre: 0, ao: 0, aa: 'msaa2', bagliore: true, texture: 1, persone: 0, mare: 1, risSpecchio: 256, alberi: 1, vegetazione: 60, cielo: true, cinema: true, luci: false },
  alta: { scala: 100, tettoDpr: 2, dinamica: true, ombre: 3, ao: 1, aa: 'msaa4', bagliore: true, texture: 2, persone: 1, mare: 2, risSpecchio: 384, alberi: 2, vegetazione: 100, cielo: true, cinema: true, luci: true },
  epica: { scala: 100, tettoDpr: 2, dinamica: false, ombre: 4, ao: 2, aa: 'msaa4', bagliore: true, texture: 2, persone: 2, mare: 2, risSpecchio: 768, alberi: 2, vegetazione: 100, cielo: true, cinema: true, luci: true },
}

/**
 * La modalità automatica parte da "Alta" e, se la sala non resta fluida,
 * scende un gradino alla volta: prima la risoluzione, poi ombre,
 * occlusione, mare, vegetazione. Mai sopra "Alta".
 */
export const GRADINI_AUTO: Partial<ValoriGrafica>[] = [
  { scala: 85 },
  { scala: 70 },
  { ombre: 2 },
  { ombre: 0 },
  { ao: 0 },
  { mare: 1 },
  { vegetazione: 70, alberi: 1 },
  { luci: false, texture: 1 },
  { vegetazione: 45, alberi: 0, aa: 'msaa2' },
  { cielo: false, persone: 0 },
]

export function valoriAuto(livello: number): ValoriGrafica {
  let v = { ...PRESET.alta }
  for (let i = 0; i < Math.min(livello, GRADINI_AUTO.length); i++) v = { ...v, ...GRADINI_AUTO[i] }
  return v
}

export function extraPredefinite(): ExtraGrafica {
  return { fps: 60, mostraFps: false, fov: 44, animazioni: null, entrata: true, pausa: true, precompila: true }
}

interface Salvato {
  versione: 1
  preset: NomePreset
  valori: ValoriGrafica
  extra: ExtraGrafica
  autoLivello: number
}

const CHIAVE = 'studio-tesi.grafica'
/** Solo per le prove automatiche: un nome di preset ("Alta", "Bassa"…) che vince su tutto. */
const CHIAVE_PROVA = 'studio-tesi.grafica-prova'
const PRESET_VALIDI: NomePreset[] = ['automatica', 'bassa', 'media', 'alta', 'epica', 'personalizzata']

function leggi(chiave: string): string | null {
  try {
    return localStorage.getItem(chiave)
  } catch {
    return null
  }
}

function presetDiProva(): NomePreset | null {
  const v = leggi(CHIAVE_PROVA)?.trim().toLowerCase()
  return v && (PRESET_VALIDI as string[]).includes(v) ? (v as NomePreset) : null
}

function carica(): (Salvato & { trovato: boolean }) {
  const base: Salvato = { versione: 1, preset: 'automatica', valori: { ...PRESET.alta }, extra: extraPredefinite(), autoLivello: 0 }
  let trovato = false
  try {
    const grezzo = leggi(CHIAVE)
    if (grezzo) {
      const s = JSON.parse(grezzo) as Partial<Salvato>
      if (s && s.versione === 1) {
        trovato = true
        if (s.preset && PRESET_VALIDI.includes(s.preset)) base.preset = s.preset
        base.valori = { ...base.valori, ...(s.valori ?? {}) }
        base.extra = { ...base.extra, ...(s.extra ?? {}) }
        base.autoLivello = Math.max(0, Math.min(GRADINI_AUTO.length, Number(s.autoLivello) || 0))
      }
    }
  } catch {
    /* dati rovinati: si riparte dai predefiniti */
  }
  const prova = presetDiProva()
  if (prova) {
    base.preset = prova
    base.autoLivello = 0
  }
  return { ...base, trovato }
}

export interface StatoGrafica extends Salvato {
  /** Il menu è aperto (e su quale scheda). */
  menu: null | 'schermo' | 'grafica' | 'avanzate'
  /** Avviso "ho abbassato un po' la grafica" (modalità automatica). */
  avvisoAuto: number
  scegliPreset: (p: NomePreset) => void
  cambia: (parz: Partial<ValoriGrafica>) => void
  cambiaExtra: (parz: Partial<ExtraGrafica>) => void
  ripristina: () => void
  impostaAuto: (livello: number, abbassato: boolean) => void
  chiudiAvviso: () => void
  apri: (scheda?: 'schermo' | 'grafica' | 'avanzate') => void
  chiudi: () => void
}

const iniziale = carica()

export const useGraficaStore = create<StatoGrafica>((set, get) => ({
  versione: 1,
  preset: iniziale.preset,
  valori: iniziale.valori,
  extra: iniziale.extra,
  autoLivello: iniziale.autoLivello,
  menu: null,
  avvisoAuto: 0,
  scegliPreset: (p) =>
    set((s) => {
      if (p === 'personalizzata') return { preset: p, valori: valoriEffettivi(s) }
      if (p === 'automatica') return { preset: p, autoLivello: 0 }
      return { preset: p, valori: { ...PRESET[p] } }
    }),
  cambia: (parz) => set((s) => ({ preset: 'personalizzata', valori: { ...valoriEffettivi(s), ...parz } })),
  cambiaExtra: (parz) => set((s) => ({ extra: { ...s.extra, ...parz } })),
  ripristina: () => set({ preset: 'automatica', valori: { ...PRESET.alta }, extra: extraPredefinite(), autoLivello: 0, avvisoAuto: 0 }),
  impostaAuto: (livello, abbassato) => {
    if (get().preset !== 'automatica') return
    set((s) => ({ autoLivello: livello, avvisoAuto: abbassato ? s.avvisoAuto + 1 : s.avvisoAuto }))
  },
  chiudiAvviso: () => set({ avvisoAuto: 0 }),
  apri: (scheda = 'schermo') => set({ menu: scheda }),
  chiudi: () => set({ menu: null }),
}))

/** I valori che la scena usa davvero adesso. */
export function valoriEffettivi(s: Pick<Salvato, 'preset' | 'valori' | 'autoLivello'>): ValoriGrafica {
  if (s.preset === 'automatica') return valoriAuto(s.autoLivello)
  if (s.preset === 'personalizzata') return s.valori
  return PRESET[s.preset]
}

export function useValoriGrafica(): ValoriGrafica {
  const preset = useGraficaStore((s) => s.preset)
  const valori = useGraficaStore((s) => s.valori)
  const autoLivello = useGraficaStore((s) => s.autoLivello)
  return useMemo(() => valoriEffettivi({ preset, valori, autoLivello }), [preset, valori, autoLivello])
}

export function apriMenuGrafica(scheda?: 'schermo' | 'grafica' | 'avanzate') {
  useGraficaStore.getState().apri(scheda)
}

// Ogni cambiamento resta su questo dispositivo.
useGraficaStore.subscribe((s, prima) => {
  if (s.preset === prima.preset && s.valori === prima.valori && s.extra === prima.extra && s.autoLivello === prima.autoLivello) return
  try {
    const dati: Salvato = { versione: 1, preset: s.preset, valori: s.valori, extra: s.extra, autoLivello: s.autoLivello }
    localStorage.setItem(CHIAVE, JSON.stringify(dati))
  } catch {
    /* storage pieno o bloccato: vale fino alla chiusura */
  }
})

/**
 * Migrazione dalla vecchia "Scena 3D" (preferenze del progetto, in IndexedDB):
 * ridotta → Media, completa → Alta. "Spenta" resta lì: è l'interruttore
 * "Ufficio 3D" delle Avanzate.
 */
function migra() {
  const m = useStudio.getState().preferenze.modalitaScena
  if (m !== 'ridotta' && m !== 'completa') return
  if (!iniziale.trovato && !presetDiProva()) useGraficaStore.getState().scegliPreset(m === 'ridotta' ? 'media' : 'alta')
  useStudio.getState().setPreferenze({ modalitaScena: 'auto' })
}
try {
  const persistenza = (useStudio as unknown as { persist?: { hasHydrated: () => boolean; onFinishHydration: (f: () => void) => void } }).persist
  if (persistenza?.hasHydrated()) migra()
  else persistenza?.onFinishHydration(migra)
} catch {
  /* senza archivio non c'è niente da migrare */
}

/* ------------------------------------------------------------------ */
/* Descrizione delle voci per il menu                                   */
/* ------------------------------------------------------------------ */

export const NOMI_PRESET: Record<NomePreset, string> = {
  automatica: 'Automatica',
  bassa: 'Bassa',
  media: 'Media',
  alta: 'Alta',
  epica: 'Epica',
  personalizzata: 'Personalizzata',
}

export const SPIEGA_PRESET: Record<NomePreset, string> = {
  automatica: 'Parte da Alta e, se la sala rallenta, abbassa da sola un po’ alla volta quello che pesa di più.',
  bassa: 'La più leggera: niente ombre né effetti, alberi vicini. Per computer e tablet datati.',
  media: 'Leggera ma bella: texture semplici, mare senza specchio, niente ombre.',
  alta: 'Ombre morbide, mare a specchio, luci vere e alberi fino all’orizzonte.',
  epica: 'Tutto al massimo: ombre nitidissime, antialiasing pieno, occlusione alta. Serve un computer potente.',
  personalizzata: 'Hai cambiato tu qualcosa: valgono le tue scelte.',
}

export function riassuntoGrafica(preset: NomePreset, livello: number): string {
  if (preset === 'automatica') return livello === 0 ? 'Automatica (ora: Alta)' : `Automatica (ora: un po’ più leggera di Alta, gradino ${livello})`
  return NOMI_PRESET[preset]
}
