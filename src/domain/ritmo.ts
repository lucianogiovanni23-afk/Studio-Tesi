import { contaParoleTesto, useStudio } from '../store'
import type { Frontespizio, GiornoScritto, ObiettivoPagine, Progetto } from '../types'

/**
 * Consegna e ritmo: quanti giorni mancano, quante pagine al giorno servono,
 * se sei in anticipo o in ritardo rispetto a un ritmo regolare. Il diario
 * registra le parole scritte una volta al giorno (l'ultimo valore del giorno)
 * e sta nel progetto, così si sincronizza fra i dispositivi.
 */

const GIORNO_MS = 86_400_000
const MAX_DIARIO = 1000

/** "AAAA-MM-GG" nell'ora locale. */
export function giornoDi(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${g}`
}

/** Mezzanotte locale del giorno "AAAA-MM-GG". */
export function dataDi(giorno: string): Date {
  const [a, m, g] = giorno.split('-').map(Number)
  return new Date(a, (m || 1) - 1, g || 1)
}

/** Giorni interi fra due giorni "AAAA-MM-GG" (b - a). */
export function giorniFra(a: string, b: string): number {
  return Math.round((dataDi(b).getTime() - dataDi(a).getTime()) / GIORNO_MS)
}

export function paroleTotali(p: Pick<Progetto, 'capitoli'>): number {
  return p.capitoli.reduce((n, c) => n + c.sezioni.reduce((m, s) => m + contaParoleTesto(s.testo), 0), 0)
}

/** "13 ottobre", con l'anno solo se diverso da quello corrente. */
export function giornoLeggibile(giorno: string, conAnno = false): string {
  const d = dataDi(giorno)
  const anno = conAnno || d.getFullYear() !== new Date().getFullYear()
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', ...(anno ? { year: 'numeric' } : {}) })
}

export const numeroPagine = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 })

/** "circa 2 pagine", "circa mezza pagina", "circa 120 parole". */
export function quantitaLeggibile(pagine: number, parolePerPagina: number): string {
  if (pagine <= 0) return 'niente'
  if (pagine < 0.4) return `circa ${Math.max(10, Math.round((pagine * parolePerPagina) / 10) * 10)} parole`
  if (pagine < 0.75) return 'circa mezza pagina'
  const arrotondato = Math.round(pagine * 2) / 2
  if (arrotondato === 1) return 'circa 1 pagina'
  return `circa ${numeroPagine(arrotondato)} pagine`
}

// ---------------------------------------------------------------------------
// Ritmo
// ---------------------------------------------------------------------------

export type StatoRitmo = 'anticipo' | 'pari' | 'ritardo' | 'scaduta' | 'fatto'

export interface Ritmo {
  oggi: string
  consegna: string
  /** Giorni da oggi alla consegna (0 = è oggi, negativo = passata). */
  giorniRimasti: number
  pagineScritte: number
  pagineObiettivo: number
  pagineMancanti: number
  /** Pagine da scrivere ogni giorno da oggi alla consegna (oggi compreso), contate da come eri a fine ieri. */
  perGiorno: number
  /** Pagine scritte oggi (rispetto all'ultimo giorno registrato prima di oggi). */
  scritteOggi: number
  /** Dove dovresti essere oggi con un ritmo regolare. */
  pagineIdeali: number
  /** Positivo = pagine in anticipo, negativo = in ritardo. */
  scarto: number
  stato: StatoRitmo
  /** Inizio del ritmo ideale. */
  inizio: { giorno: string; pagine: number }
}

/** Il punto da cui parte la linea del ritmo ideale. */
function inizioRitmo(p: Progetto, oggi: string, parole: number): { giorno: string; parole: number } {
  const o = p.obiettivo
  if (o.consegnaDa?.giorno) return o.consegnaDa
  const primo = (p.diario ?? [])[0]
  if (primo) return primo
  return { giorno: p.creatoIl ? giornoDi(new Date(p.creatoIl)) : oggi, parole: p.creatoIl ? 0 : parole }
}

export function calcolaRitmo(p: Progetto, adesso = new Date()): Ritmo | null {
  const o = p.obiettivo
  if (!o.consegna) return null
  const oggi = giornoDi(adesso)
  const ppp = Math.max(1, o.parolePerPagina)
  const parole = paroleTotali(p)
  const pagineScritte = parole / ppp
  const pagineObiettivo = o.pagineMin
  const giorniRimasti = giorniFra(oggi, o.consegna)
  const pagineMancanti = Math.max(0, pagineObiettivo - pagineScritte)

  const avvio = inizioRitmo(p, oggi, parole)
  // Un inizio dopo oggi o dopo la consegna non ha senso: si parte da oggi.
  const giornoInizio = avvio.giorno <= oggi && avvio.giorno < o.consegna ? avvio.giorno : oggi
  const pagineInizio = giornoInizio === avvio.giorno ? Math.min(avvio.parole / ppp, pagineObiettivo) : pagineScritte
  const durata = Math.max(1, giorniFra(giornoInizio, o.consegna))
  const trascorsi = Math.min(durata, Math.max(0, giorniFra(giornoInizio, oggi)))
  const pagineIdeali = pagineInizio + ((pagineObiettivo - pagineInizio) * trascorsi) / durata
  const scarto = pagineScritte - pagineIdeali

  const prima = [...(p.diario ?? [])].reverse().find((g) => g.giorno < oggi)
  // Il conto di oggi parte da come eri a fine ieri: scrivendo, l'obiettivo del giorno non si sposta.
  const baseOggi = prima ? prima.parole / ppp : giornoInizio === oggi ? pagineInizio : pagineScritte
  const scritteOggi = Math.max(0, pagineScritte - baseOggi)

  let stato: StatoRitmo
  if (pagineMancanti <= 0) stato = 'fatto'
  else if (giorniRimasti < 0) stato = 'scaduta'
  else if (scarto >= 0.5) stato = 'anticipo'
  else if (scarto > -0.5) stato = 'pari'
  else stato = 'ritardo'

  return {
    oggi,
    consegna: o.consegna,
    giorniRimasti,
    pagineScritte,
    pagineObiettivo,
    pagineMancanti,
    perGiorno: giorniRimasti >= 0 ? Math.max(0, pagineObiettivo - baseOggi) / (giorniRimasti + 1) : pagineMancanti,
    scritteOggi,
    pagineIdeali,
    scarto,
    stato,
    inizio: { giorno: giornoInizio, pagine: pagineInizio },
  }
}

// ---------------------------------------------------------------------------
// Modifiche al progetto (senza toccare le azioni dello store)
// ---------------------------------------------------------------------------

function patchProgetto(fn: (p: Progetto) => Partial<Progetto>) {
  useStudio.setState((s) => ({ progetto: { ...s.progetto, ...fn(s.progetto) } }))
}

/** Cambia l'obiettivo; se cambia la consegna il ritmo ideale riparte da oggi, con le parole di adesso. */
export function impostaObiettivo(o: Partial<ObiettivoPagine>) {
  patchProgetto((p) => {
    const cambiaConsegna = 'consegna' in o && (o.consegna ?? null) !== (p.obiettivo.consegna ?? null)
    const consegnaDa = o.consegna ? { giorno: giornoDi(), parole: paroleTotali(p) } : null
    return { obiettivo: { ...p.obiettivo, ...o, ...(cambiaConsegna ? { consegnaDa } : {}) } }
  })
}

export const FRONTESPIZIO_VUOTO: Frontespizio = {
  universita: '',
  dipartimento: '',
  corsoDiLaurea: 'Corso di laurea triennale',
  candidato: '',
  matricola: '',
  relatore: '',
  correlatore: '',
  annoAccademico: annoAccademicoCorrente(),
  carattere: 'Times New Roman',
}

/** Da settembre si è nel nuovo anno accademico: "2026/2027". */
export function annoAccademicoCorrente(d = new Date()): string {
  const a = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1
  return `${a}/${a + 1}`
}

export function frontespizioDi(p: Pick<Progetto, 'frontespizio'>): Frontespizio {
  return { ...FRONTESPIZIO_VUOTO, ...(p.frontespizio ?? {}) }
}

export function impostaFrontespizio(f: Partial<Frontespizio>) {
  patchProgetto((p) => ({ frontespizio: { ...frontespizioDi(p), ...f } }))
}

// ---------------------------------------------------------------------------
// Diario: una voce al giorno, aggiornata quando cambiano le parole
// ---------------------------------------------------------------------------

/** Il diario con le parole di oggi: aggiorna la voce di oggi o ne aggiunge una. Restituisce null se non cambia niente. */
export function diarioAggiornato(diario: GiornoScritto[] | undefined, parole: number, oggi = giornoDi()): GiornoScritto[] | null {
  const elenco = diario ?? []
  const ultima = elenco[elenco.length - 1]
  if (ultima && ultima.giorno === oggi) {
    if (ultima.parole === parole) return null
    return [...elenco.slice(0, -1), { giorno: oggi, parole }]
  }
  if (ultima && ultima.parole === parole) return null
  // Il primo giorno senza testo non serve a niente nel grafico.
  if (!ultima && parole === 0) return null
  // Un giorno arrivato da un altro dispositivo può essere "dopo" oggi se gli orologi non sono allineati: si tiene l'ordine.
  if (ultima && ultima.giorno > oggi) return null
  return [...elenco, { giorno: oggi, parole }].slice(-MAX_DIARIO)
}

let diarioAvviato = false
let attesa: ReturnType<typeof setTimeout> | undefined

function registraOggi() {
  const p = useStudio.getState().progetto
  const nuovo = diarioAggiornato(p.diario, paroleTotali(p))
  if (nuovo) patchProgetto(() => ({ diario: nuovo }))
}

/** Tiene aggiornato il diario: qualche secondo dopo ogni cambio di testo, e all'avvio. */
export function avviaDiario() {
  if (diarioAvviato) return
  diarioAvviato = true
  const via = () => {
    registraOggi()
    useStudio.subscribe((s, prima) => {
      if (s.progetto.capitoli === prima.progetto.capitoli) return
      clearTimeout(attesa)
      attesa = setTimeout(registraOggi, 4000)
    })
  }
  if (useStudio.persist.hasHydrated()) via()
  else useStudio.persist.onFinishHydration(via)
}
