import { useCallback, useEffect, useRef, useState, type KeyboardEvent as TastoReact, type ReactNode } from 'react'
import { useModoUso } from '../hooks/useModoUso'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { useStudio } from '../store'
import { Icona } from '../ui/Icona'
import {
  NOMI_PRESET,
  SPIEGA_PRESET,
  useGraficaStore,
  useValoriGrafica,
  type ExtraGrafica,
  type NomePreset,
  type ValoriGrafica,
} from './grafica'
import '../styles/grafica.css'

/**
 * Il menu "Grafica", in stile videogioco: tre schede (Schermo, Grafica,
 * Avanzate), righe con ◀ valore ▶ o un cursore, la spiegazione della riga
 * su cui sei e "Ripristina predefiniti". Ogni modifica vale subito: la sala
 * dietro cambia mentre scegli. Esc o × per chiudere.
 */

type Scheda = 'schermo' | 'grafica' | 'avanzate'

interface Opzione<T> {
  v: T
  n: string
}

interface RigaScelta<T> {
  tipo: 'scelta'
  id: string
  nome: string
  spiega: string
  opzioni: Opzione<T>[]
  valore: T
  imposta: (v: T) => void
}

interface RigaCursore {
  tipo: 'cursore'
  id: string
  nome: string
  spiega: string
  min: number
  max: number
  passo: number
  unita: string
  valore: number
  imposta: (v: number) => void
}

type Riga = RigaScelta<unknown> | RigaCursore

const SI_NO: Opzione<boolean>[] = [
  { v: false, n: 'No' },
  { v: true, n: 'Sì' },
]

function scelta<T>(r: Omit<RigaScelta<T>, 'tipo'>): Riga {
  return { tipo: 'scelta', ...r } as unknown as Riga
}

function useRighe(scheda: Scheda): Riga[] {
  const v = useValoriGrafica()
  const extra = useGraficaStore((s) => s.extra)
  const cambia = useGraficaStore((s) => s.cambia)
  const cambiaExtra = useGraficaStore((s) => s.cambiaExtra)
  const spenta = useStudio((s) => s.preferenze.modalitaScena === 'spenta')
  const setPreferenze = useStudio((s) => s.setPreferenze)
  const ridotto = useMovimentoRidotto()
  const g = <K extends keyof ValoriGrafica>(k: K) => (x: ValoriGrafica[K]) => cambia({ [k]: x } as Partial<ValoriGrafica>)
  const e = <K extends keyof ExtraGrafica>(k: K) => (x: ExtraGrafica[K]) => cambiaExtra({ [k]: x } as Partial<ExtraGrafica>)

  if (scheda === 'schermo')
    return [
      { tipo: 'cursore', id: 'scala', nome: 'Scala di rendering', spiega: 'Quanti pixel disegna la sala rispetto allo schermo: meno di 100% è più sfocato ma più veloce, più di 100% è più nitido ma pesa.', min: 50, max: 200, passo: 5, unita: '%', valore: v.scala, imposta: g('scala') },
      scelta({ id: 'dinamica', nome: 'Risoluzione dinamica', spiega: 'Mentre la visuale si muove o la sala rallenta, abbassa un po’ la risoluzione; da ferma torna nitida.', opzioni: SI_NO, valore: v.dinamica, imposta: g('dinamica') }),
      scelta({
        id: 'fps',
        nome: 'Limite FPS',
        spiega: 'Quanti fotogrammi al secondo al massimo. Meno fotogrammi = meno batteria e meno calore. Da ferma la sala si ridisegna comunque più piano.',
        opzioni: [
          { v: 30, n: '30' },
          { v: 60, n: '60' },
          { v: 120, n: '120' },
          { v: 0, n: 'Illimitato' },
        ],
        valore: extra.fps,
        imposta: e('fps'),
      }),
      scelta({ id: 'mostraFps', nome: 'Mostra FPS', spiega: 'Un piccolo contatore dei fotogrammi al secondo nell’angolo della sala.', opzioni: SI_NO, valore: extra.mostraFps, imposta: e('mostraFps') }),
      { tipo: 'cursore', id: 'fov', nome: 'Campo visivo', spiega: 'Quanto è larga l’inquadratura: più alto vedi più sala, più basso è come uno zoom.', min: 40, max: 75, passo: 1, unita: '°', valore: extra.fov, imposta: e('fov') },
    ]

  if (scheda === 'grafica')
    return [
      scelta({
        id: 'ombre',
        nome: 'Ombre',
        spiega: 'Le ombre dei mobili e delle persone. Più alte sono più nitide; da Alte in su sono anche morbide.',
        opzioni: [
          { v: 0, n: 'Off' },
          { v: 1, n: 'Basse' },
          { v: 2, n: 'Medie' },
          { v: 3, n: 'Alte' },
          { v: 4, n: 'Epiche' },
        ],
        valore: v.ombre,
        imposta: g('ombre'),
      }),
      scelta({
        id: 'ao',
        nome: 'Occlusione ambientale',
        spiega: 'Le ombre leggere negli angoli e dove gli oggetti si toccano: danno profondità alla sala.',
        opzioni: [
          { v: 0, n: 'Off' },
          { v: 1, n: 'Media' },
          { v: 2, n: 'Alta' },
        ],
        valore: v.ao,
        imposta: g('ao'),
      }),
      scelta({
        id: 'aa',
        nome: 'Antialiasing',
        spiega: 'Toglie le scalette sui bordi. FXAA e SMAA costano poco; MSAA è il più pulito ma pesa di più.',
        opzioni: [
          { v: 'off', n: 'Off' },
          { v: 'fxaa', n: 'FXAA' },
          { v: 'smaa', n: 'SMAA' },
          { v: 'msaa2', n: 'MSAA 2x' },
          { v: 'msaa4', n: 'MSAA 4x' },
        ],
        valore: v.aa,
        imposta: g('aa'),
      }),
      scelta({ id: 'bagliore', nome: 'Bagliore', spiega: 'Le luci forti (LED, lampade) brillano con un alone morbido.', opzioni: SI_NO, valore: v.bagliore, imposta: g('bagliore') }),
      scelta({
        id: 'texture',
        nome: 'Qualità texture',
        spiega: 'Quanto sono definiti legno, pelle, metallo e prato. Alta usa le immagini grandi con il rilievo.',
        opzioni: [
          { v: 0, n: 'Bassa' },
          { v: 1, n: 'Media' },
          { v: 2, n: 'Alta' },
        ],
        valore: v.texture,
        imposta: g('texture'),
      }),
      scelta({
        id: 'persone',
        nome: 'Qualità persone',
        spiega: 'Semplice usa modelli leggeri. Realistica mette il dettaglio pieno quando ti avvicini a un collega; Massima sempre.',
        opzioni: [
          { v: 0, n: 'Semplice' },
          { v: 1, n: 'Realistica' },
          { v: 2, n: 'Massima' },
        ],
        valore: v.persone,
        imposta: g('persone'),
      }),
      scelta({
        id: 'mare',
        nome: 'Riflessi del mare',
        spiega: 'Semplici: il mare prende il colore del cielo. Specchio: riflette davvero cielo, nuvole e luna.',
        opzioni: [
          { v: 0, n: 'Off' },
          { v: 1, n: 'Semplici' },
          { v: 2, n: 'Specchio' },
        ],
        valore: v.mare,
        imposta: g('mare'),
      }),
      scelta({
        id: 'alberi',
        nome: 'Distanza visiva alberi',
        spiega: 'Fin dove si vedono gli ulivi e quanti sono disegnati in pieno dettaglio.',
        opzioni: [
          { v: 0, n: 'Vicina' },
          { v: 1, n: 'Media' },
          { v: 2, n: 'Lontana' },
        ],
        valore: v.alberi,
        imposta: g('alberi'),
      }),
      { tipo: 'cursore', id: 'vegetazione', nome: 'Densità vegetazione', spiega: 'Quanti ulivi ci sono sulle colline lontane.', min: 20, max: 100, passo: 5, unita: '%', valore: v.vegetazione, imposta: g('vegetazione') },
      scelta({ id: 'cielo', nome: 'Nuvole e uccelli', spiega: 'Le nuvole che passano e gli stormi davanti alla vetrata.', opzioni: SI_NO, valore: v.cielo, imposta: g('cielo') }),
      scelta({ id: 'cinema', nome: 'Effetti cinema', spiega: 'Bordi un po’ più scuri e colori caldi da film.', opzioni: SI_NO, valore: v.cinema, imposta: g('cinema') }),
      scelta({
        id: 'luci',
        nome: 'Luci della sala',
        spiega: 'Realistiche: lampade e PC illuminano davvero mobili e persone. Semplici: una luce unica, più leggera.',
        opzioni: [
          { v: false, n: 'Semplici' },
          { v: true, n: 'Realistiche' },
        ],
        valore: v.luci,
        imposta: g('luci'),
      }),
    ]

  return [
    scelta({
      id: 'ufficio',
      nome: 'Ufficio 3D',
      spiega: 'Spento: al posto della sala restano solo i pannelli con i colleghi. Utile se il dispositivo fa fatica.',
      opzioni: [
        { v: false, n: 'Spento' },
        { v: true, n: 'Acceso' },
      ],
      valore: !spenta,
      imposta: (x: boolean) => setPreferenze({ modalitaScena: x ? 'auto' : 'spenta' }),
    }),
    scelta({
      id: 'animazioni',
      nome: 'Animazioni',
      spiega: 'Colleghi che respirano e si guardano intorno, ventole, luci che cambiano colore, vento. ' + (ridotto ? 'Il sistema chiede meno movimento: di partenza sono spente.' : ''),
      opzioni: SI_NO,
      valore: extra.animazioni ?? !ridotto,
      imposta: e('animazioni'),
    }),
    scelta({ id: 'entrata', nome: 'Entrata dalla porta', spiega: 'All’apertura la telecamera entra dalla porta a vetri e plana sulla sala.', opzioni: SI_NO, valore: extra.entrata, imposta: e('entrata') }),
    scelta({ id: 'pausa', nome: 'Pausa quando non guardi', spiega: 'La sala si ferma quando passi a un’altra app o la scorri fuori dallo schermo: risparmi batteria.', opzioni: SI_NO, valore: extra.pausa, imposta: e('pausa') }),
    scelta({ id: 'precompila', nome: 'Precompila gli shader all’avvio', spiega: 'Prepara in anticipo tutti i materiali (anche quelli della notte): l’avvio dura un attimo di più ma poi niente scatti.', opzioni: SI_NO, valore: extra.precompila, imposta: e('precompila') }),
  ]
}

const PRESET_ORDINE: NomePreset[] = ['automatica', 'bassa', 'media', 'alta', 'epica', 'personalizzata']

/** Una riga con ◀ valore ▶ (e le tacche sotto), oppure con il cursore. */
function RigaMenu({ r, attiva, onFuoco, rif }: { r: Riga; attiva: boolean; onFuoco: () => void; rif: (el: HTMLDivElement | null) => void }) {
  const idValore = `mg-valore-${r.id}`
  if (r.tipo === 'cursore') {
    const sposta = (d: number) => r.imposta(Math.min(r.max, Math.max(r.min, r.valore + d * r.passo)))
    return (
      <div
        ref={rif}
        className={`mg-riga ${attiva ? 'mg-riga-attiva' : ''}`}
        role="group"
        aria-label={r.nome}
        data-riga={r.id}
        tabIndex={-1}
        onFocus={onFuoco}
        onPointerEnter={onFuoco}
      >
        <span className="mg-nome">{r.nome}</span>
        <div className="mg-controllo mg-controllo-cursore">
          <button type="button" className="mg-freccia" tabIndex={-1} aria-label={`${r.nome}: meno`} disabled={r.valore <= r.min} onClick={() => sposta(-1)}>
            ◀
          </button>
          <input
            type="range"
            className="mg-cursore"
            min={r.min}
            max={r.max}
            step={r.passo}
            value={r.valore}
            aria-label={r.nome}
            aria-valuetext={`${r.valore}${r.unita}`}
            onChange={(ev) => r.imposta(Number(ev.target.value))}
            style={{ ['--quota' as string]: `${((r.valore - r.min) / (r.max - r.min)) * 100}%` }}
          />
          <output id={idValore} className="mg-numero">
            {r.valore}
            {r.unita}
          </output>
          <button type="button" className="mg-freccia" tabIndex={-1} aria-label={`${r.nome}: più`} disabled={r.valore >= r.max} onClick={() => sposta(1)}>
            ▶
          </button>
        </div>
      </div>
    )
  }
  const i = Math.max(
    0,
    r.opzioni.findIndex((o) => o.v === r.valore),
  )
  const vai = (d: number) => {
    const j = i + d
    if (j >= 0 && j < r.opzioni.length) r.imposta(r.opzioni[j].v)
  }
  const tasto = (ev: TastoReact) => {
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault()
      vai(-1)
    } else if (ev.key === 'ArrowRight' || ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      if (ev.key !== 'ArrowRight' && i === r.opzioni.length - 1) r.imposta(r.opzioni[0].v)
      else vai(1)
    }
  }
  return (
    <div
      ref={rif}
      className={`mg-riga ${attiva ? 'mg-riga-attiva' : ''}`}
      role="group"
      aria-label={r.nome}
      data-riga={r.id}
      tabIndex={0}
      onKeyDown={tasto}
      onFocus={onFuoco}
      onPointerEnter={onFuoco}
      aria-describedby={idValore}
    >
      <span className="mg-nome">{r.nome}</span>
      <div className="mg-controllo">
        <button type="button" className="mg-freccia" tabIndex={-1} aria-label={`${r.nome}: precedente`} disabled={i === 0} onClick={() => vai(-1)}>
          ◀
        </button>
        <span className="mg-valore">
          <output id={idValore} aria-live="polite">
            {r.opzioni[i].n}
          </output>
          <span className="mg-tacche" aria-hidden>
            {r.opzioni.map((_, k) => (
              <span key={k} className={k === i ? 'mg-tacca-su' : ''} />
            ))}
          </span>
        </span>
        <button type="button" className="mg-freccia" tabIndex={-1} aria-label={`${r.nome}: successivo`} disabled={i === r.opzioni.length - 1} onClick={() => vai(1)}>
          ▶
        </button>
      </div>
    </div>
  )
}

function RigaPreset({ attiva, onFuoco, rif }: { attiva: boolean; onFuoco: () => void; rif: (el: HTMLDivElement | null) => void }) {
  const preset = useGraficaStore((s) => s.preset)
  const scegli = useGraficaStore((s) => s.scegliPreset)
  const r: RigaScelta<NomePreset> = {
    tipo: 'scelta',
    id: 'preset',
    nome: 'Qualità',
    spiega: SPIEGA_PRESET[preset],
    opzioni: PRESET_ORDINE.map((p) => ({ v: p, n: NOMI_PRESET[p] })),
    valore: preset,
    imposta: scegli,
  }
  return (
    <div className="mg-preset">
      <RigaMenu r={r as unknown as Riga} attiva={attiva} onFuoco={onFuoco} rif={rif} />
    </div>
  )
}

const SCHEDE: { id: Scheda; nome: string }[] = [
  { id: 'schermo', nome: 'Schermo' },
  { id: 'grafica', nome: 'Grafica' },
  { id: 'avanzate', nome: 'Avanzate' },
]

export function MenuGrafica() {
  const menu = useGraficaStore((s) => s.menu)
  if (!menu) return null
  return <Pannello scheda={menu} />
}

function Pannello({ scheda }: { scheda: Scheda }) {
  const chiudi = useGraficaStore((s) => s.chiudi)
  const apri = useGraficaStore((s) => s.apri)
  const ripristina = useGraficaStore((s) => s.ripristina)
  const preset = useGraficaStore((s) => s.preset)
  const setPreferenze = useStudio((s) => s.setPreferenze)
  const conScena = useStudio((s) => s.schermata === 'ufficio')
  const modo = useModoUso()
  const righe = useRighe(scheda)
  const [fuoco, setFuoco] = useState<string>('preset')
  const [ripristinato, setRipristinato] = useState(false)
  const nodi = useRef(new Map<string, HTMLDivElement>())

  // Al momento dell'apertura il fuoco va sulla prima riga; alla chiusura torna dov'era.
  useEffect(() => {
    const prima = document.activeElement as HTMLElement | null
    nodi.current.get('preset')?.focus()
    return () => prima?.focus?.()
  }, [])

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        chiudi()
      }
    }
    window.addEventListener('keydown', tasto, true)
    return () => window.removeEventListener('keydown', tasto, true)
  }, [chiudi])

  const ordine = ['preset', ...righe.map((r) => r.id)]
  const fuocoSu = (id: string) => {
    const el = nodi.current.get(id)
    if (!el) return
    const cursore = el.querySelector('input') as HTMLElement | null
    ;(cursore ?? el).focus()
  }
  // Su e giù passano da una riga all'altra (anche dal cursore, che altrimenti le userebbe per il valore).
  const navigazione = (e: TastoReact) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const dentro = (e.target as HTMLElement).closest('[data-riga]') as HTMLElement | null
    if (!dentro) return
    e.preventDefault()
    const i = ordine.indexOf(dentro.dataset.riga ?? '')
    const j = Math.max(0, Math.min(ordine.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
    fuocoSu(ordine[j])
  }

  const tutte = [{ id: 'preset', spiega: SPIEGA_PRESET[preset] }, ...righe]
  const spiegazione = tutte.find((r) => r.id === fuoco)?.spiega ?? ''
  const rif = (id: string) => (el: HTMLDivElement | null) => {
    if (el) nodi.current.set(id, el)
    else nodi.current.delete(id)
  }
  const fuocoCallback = useCallback((id: string) => () => setFuoco(id), [])

  const corpo: ReactNode = righe.map((r) => <RigaMenu key={r.id} r={r} attiva={fuoco === r.id} onFuoco={fuocoCallback(r.id)} rif={rif(r.id)} />)

  return (
    <div className={`mg-velo ${modo === 'ipad' ? 'mg-ipad' : ''}`}>
      <div className="menu-grafica" role="dialog" aria-modal="false" aria-labelledby="mg-titolo" onKeyDown={navigazione}>
        <header className="mg-testa">
          <span className="mg-icona" aria-hidden>
            <Icona nome="monitor" dimensione={22} />
          </span>
          <h2 id="mg-titolo">Grafica</h2>
          <button type="button" className="mg-chiudi" aria-label="Chiudi le impostazioni grafiche" onClick={chiudi}>
            <Icona nome="chiudi" />
          </button>
        </header>

        <RigaPreset attiva={fuoco === 'preset'} onFuoco={fuocoCallback('preset')} rif={rif('preset')} />

        <div className="mg-schede" role="tablist" aria-label="Sezioni della grafica">
          {SCHEDE.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`mg-scheda-${s.id}`}
              aria-selected={scheda === s.id}
              aria-controls="mg-righe"
              className={`mg-scheda ${scheda === s.id ? 'mg-scheda-attiva' : ''}`}
              onClick={() => {
                apri(s.id)
                setFuoco('preset')
              }}
            >
              {s.nome}
            </button>
          ))}
        </div>

        <div id="mg-righe" className="mg-righe" role="tabpanel" aria-labelledby={`mg-scheda-${scheda}`}>
          {corpo}
        </div>

        <footer className="mg-piede">
          <p className="mg-spiega" aria-live="polite">
            {spiegazione}
          </p>
          {!conScena && <p className="mg-nota">Le modifiche si vedono nell’Ufficio 3D.</p>}
          <div className="mg-bottoni">
            <button
              type="button"
              className="mg-bottone"
              onClick={() => {
                ripristina()
                setPreferenze({ modalitaScena: 'auto' })
                setRipristinato(true)
                window.setTimeout(() => setRipristinato(false), 2500)
              }}
            >
              {ripristinato ? 'Fatto: predefiniti ripristinati' : 'Ripristina predefiniti'}
            </button>
            <button type="button" className="mg-bottone mg-bottone-primario" onClick={chiudi}>
              Fatto
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
