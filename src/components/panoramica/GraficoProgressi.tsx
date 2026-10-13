import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { dataDi, giorniFra, giornoDi, giornoLeggibile, numeroPagine, type Ritmo } from '../../domain/ritmo'
import type { GiornoScritto } from '../../types'

/**
 * Pagine scritte nel tempo, in SVG puro: l'area verde sono le tue pagine, la
 * linea tratteggiata oro il ritmo regolare fino alla consegna. Toccando o
 * passando sopra un giorno compare il dettaglio; con le frecce si va di giorno
 * in giorno.
 */

interface Punto {
  giorno: string
  pagine: number
  parole: number
}

const ALTEZZA = 240
const MARGINE = { su: 18, destra: 18, giu: 30, sinistra: 40 }

/** Larghezza del contenitore, aggiornata quando cambia (iPad in verticale e orizzontale). */
function useLarghezza<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [larghezza, setLarghezza] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const misura = () => setLarghezza(Math.max(260, Math.round(el.getBoundingClientRect().width)))
    misura()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(misura)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, larghezza] as const
}

/** Tacche "belle" sull'asse delle pagine. */
function tacche(max: number): number[] {
  const passi = [1, 2, 5, 10, 15, 20, 25, 50, 100]
  const passo = passi.find((p) => max / p <= 5) ?? Math.ceil(max / 5)
  const out: number[] = []
  for (let v = 0; v <= max + 0.001; v += passo) out.push(v)
  return out
}

const breve = (giorno: string) => dataDi(giorno).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

export function GraficoProgressi({
  diario,
  parolePerPagina,
  paroleAdesso,
  ritmo,
  obiettivo,
}: {
  diario: GiornoScritto[]
  parolePerPagina: number
  paroleAdesso: number
  ritmo: Ritmo | null
  obiettivo: number
}) {
  const id = useId().replace(/:/g, '')
  const [contenitore, larghezza] = useLarghezza<HTMLDivElement>()
  const [scelto, setScelto] = useState<number | null>(null)
  const oggi = giornoDi()
  const ppp = Math.max(1, parolePerPagina)

  // I punti veri del diario, più oggi con le parole di adesso.
  const punti = useMemo<Punto[]>(() => {
    const elenco = diario.filter((g) => g.giorno <= oggi).map((g) => ({ giorno: g.giorno, parole: g.parole, pagine: g.parole / ppp }))
    const ultimo = elenco[elenco.length - 1]
    if (!ultimo || ultimo.giorno !== oggi) elenco.push({ giorno: oggi, parole: paroleAdesso, pagine: paroleAdesso / ppp })
    else elenco[elenco.length - 1] = { ...ultimo, parole: paroleAdesso, pagine: paroleAdesso / ppp }
    // Con un solo punto si parte dal giorno prima a zero, così si vede una linea.
    if (elenco.length === 1 && elenco[0].parole > 0 && !ritmo) {
      const ieri = new Date(dataDi(oggi).getTime() - 86_400_000)
      elenco.unshift({ giorno: giornoDi(ieri), parole: 0, pagine: 0 })
    }
    return elenco
  }, [diario, oggi, paroleAdesso, ppp, ritmo])

  const inizio = [punti[0]?.giorno ?? oggi, ritmo?.inizio.giorno ?? oggi].sort()[0]
  const fine = ritmo && ritmo.consegna > oggi ? ritmo.consegna : oggi
  const giorni = Math.max(1, giorniFra(inizio, fine))
  const maxPagine = Math.max(obiettivo * 1.08, ...punti.map((p) => p.pagine * 1.1), 5)
  const assey = tacche(maxPagine)
  const cima = assey[assey.length - 1] < maxPagine ? maxPagine : assey[assey.length - 1]

  const w = larghezza
  const h = ALTEZZA
  const larghezzaUtile = w - MARGINE.sinistra - MARGINE.destra
  const altezzaUtile = h - MARGINE.su - MARGINE.giu
  const x = (giorno: string) => MARGINE.sinistra + (giorniFra(inizio, giorno) / giorni) * larghezzaUtile
  const y = (pagine: number) => MARGINE.su + altezzaUtile - (Math.min(pagine, cima) / cima) * altezzaUtile

  const linea = punti.map((p, i) => `${i ? 'L' : 'M'}${x(p.giorno).toFixed(1)},${y(p.pagine).toFixed(1)}`).join(' ')
  const area = punti.length
    ? `${linea} L${x(punti[punti.length - 1].giorno).toFixed(1)},${y(0)} L${x(punti[0].giorno).toFixed(1)},${y(0)} Z`
    : ''

  // Etichette dei giorni sull'asse: 3–6 secondo la larghezza.
  const quante = Math.max(2, Math.min(6, Math.floor(larghezzaUtile / 110)))
  const etichetteX = Array.from({ length: quante + 1 }, (_, i) => {
    const d = new Date(dataDi(inizio).getTime() + Math.round((giorni * i) / quante) * 86_400_000)
    return giornoDi(d)
  }).filter((g, i, a) => a.indexOf(g) === i)

  const ideale = (giorno: string): number | null => {
    if (!ritmo) return null
    const durata = Math.max(1, giorniFra(ritmo.inizio.giorno, ritmo.consegna))
    const t = giorniFra(ritmo.inizio.giorno, giorno)
    if (t < 0 || t > durata) return null
    return ritmo.inizio.pagine + ((ritmo.pagineObiettivo - ritmo.inizio.pagine) * t) / durata
  }

  const vicino = (px: number) => {
    let migliore = 0
    let distanza = Infinity
    punti.forEach((p, i) => {
      const d = Math.abs(x(p.giorno) - px)
      if (d < distanza) {
        distanza = d
        migliore = i
      }
    })
    return migliore
  }

  const muovi = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setScelto(vicino(((e.clientX - r.left) / r.width) * w))
  }

  const tasti = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const ultimo = punti.length - 1
    setScelto((s) => {
      const da = s ?? ultimo
      if (e.key === 'Home') return 0
      if (e.key === 'End') return ultimo
      return Math.max(0, Math.min(ultimo, da + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const punto = scelto !== null ? punti[scelto] : null
  const idealePunto = punto ? ideale(punto.giorno) : null
  const ultimo = punti[punti.length - 1]
  const riassunto = `Grafico delle pagine scritte dal ${giornoLeggibile(inizio)} a oggi: ${numeroPagine(ultimo?.pagine ?? 0)} pagine${
    ritmo ? `; con un ritmo regolare oggi saresti a ${numeroPagine(ritmo.pagineIdeali)} pagine, obiettivo ${ritmo.pagineObiettivo} pagine per il ${giornoLeggibile(ritmo.consegna)}` : ''
  }.`

  // Il fumetto sta sopra il punto, senza uscire dal riquadro.
  const fumettoX = punto ? Math.min(w - 4 - 200, Math.max(4, x(punto.giorno) - 100)) : 0
  const cimaPunto = punto ? Math.min(y(punto.pagine), y(idealePunto ?? punto.pagine)) : 0
  const fondoPunto = punto ? Math.max(y(punto.pagine), y(idealePunto ?? punto.pagine)) : 0
  const fumettoY = cimaPunto >= 96 ? cimaPunto - 92 : Math.min(h - 92, fondoPunto + 14)

  return (
    <div className="ritmo-grafico" ref={contenitore}>
      <svg
        className="ritmo-svg"
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={riassunto}
        tabIndex={0}
        onPointerMove={muovi}
        onPointerDown={muovi}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setScelto(null)}
        onKeyDown={tasti}
        onBlur={() => setScelto(null)}
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--oliva)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--oliva)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* griglia e asse delle pagine */}
        {assey.map((v) => (
          <g key={v}>
            <line className="ritmo-griglia" x1={MARGINE.sinistra} x2={w - MARGINE.destra} y1={y(v)} y2={y(v)} />
            <text className="ritmo-asse" x={MARGINE.sinistra - 8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {etichetteX.map((g, i) => (
          <text
            key={g}
            className="ritmo-asse"
            x={x(g)}
            y={h - 8}
            textAnchor={i === 0 ? 'start' : i === etichetteX.length - 1 ? 'end' : 'middle'}
          >
            {breve(g)}
          </text>
        ))}

        {/* obiettivo */}
        <line className="ritmo-obiettivo" x1={MARGINE.sinistra} x2={w - MARGINE.destra} y1={y(obiettivo)} y2={y(obiettivo)} />
        <text className="ritmo-obiettivo-testo" x={MARGINE.sinistra + 6} y={y(obiettivo) - 6}>
          obiettivo {obiettivo} pagine
        </text>

        {/* ritmo regolare fino alla consegna */}
        {ritmo && (
          <>
            <line
              className="ritmo-ideale"
              x1={x(ritmo.inizio.giorno)}
              y1={y(ritmo.inizio.pagine)}
              x2={x(ritmo.consegna)}
              y2={y(ritmo.pagineObiettivo)}
            />
            {ritmo.consegna >= inizio && (
              <g className="ritmo-consegna">
                <line x1={x(ritmo.consegna)} x2={x(ritmo.consegna)} y1={MARGINE.su} y2={y(0)} />
                <circle cx={x(ritmo.consegna)} cy={y(ritmo.pagineObiettivo)} r={5} />
              </g>
            )}
          </>
        )}

        {/* oggi */}
        <line className="ritmo-linea-oggi" x1={x(oggi)} x2={x(oggi)} y1={MARGINE.su} y2={y(0)} />

        {/* le tue pagine */}
        <path className="ritmo-area" d={area} fill={`url(#area-${id})`} />
        <path className="ritmo-linea" d={linea} />
        {punti.length <= 40 &&
          punti.map((p, i) => <circle key={p.giorno} className="ritmo-punto" cx={x(p.giorno)} cy={y(p.pagine)} r={i === punti.length - 1 ? 4.5 : 3} />)}

        {punto && (
          <g className="ritmo-scelto" pointerEvents="none">
            <line x1={x(punto.giorno)} x2={x(punto.giorno)} y1={MARGINE.su} y2={y(0)} />
            {idealePunto !== null && <circle className="ritmo-scelto-ideale" cx={x(punto.giorno)} cy={y(idealePunto)} r={4.5} />}
            <circle cx={x(punto.giorno)} cy={y(punto.pagine)} r={6} />
            <foreignObject x={fumettoX} y={fumettoY} width={200} height={88}>
              <div className="ritmo-fumetto">
                <strong>{punto.giorno === oggi ? 'Oggi' : giornoLeggibile(punto.giorno)}</strong>
                <span>
                  {numeroPagine(punto.pagine)} pagine · {punto.parole.toLocaleString('it-IT')} parole
                </span>
                {idealePunto !== null && <span className="ritmo-fumetto-ideale">ritmo regolare: {numeroPagine(idealePunto)} pagine</span>}
              </div>
            </foreignObject>
          </g>
        )}
      </svg>
      <ul className="ritmo-legenda" aria-hidden>
        <li>
          <span className="ritmo-legenda-segno ritmo-legenda-tue" /> le tue pagine
        </li>
        {ritmo && (
          <li>
            <span className="ritmo-legenda-segno ritmo-legenda-ideale" /> ritmo regolare fino alla consegna
          </li>
        )}
        <li>
          <span className="ritmo-legenda-segno ritmo-legenda-oggi" /> oggi
        </li>
      </ul>
    </div>
  )
}
