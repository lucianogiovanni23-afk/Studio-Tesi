import '../../styles/ritmo.css'
import { useMemo, useState, type FormEvent } from 'react'
import {
  calcolaRitmo,
  giornoDi,
  giornoLeggibile,
  impostaObiettivo,
  numeroPagine,
  paroleTotali,
  quantitaLeggibile,
  type Ritmo,
} from '../../domain/ritmo'
import { useStudio } from '../../store'
import type { ObiettivoPagine } from '../../types'
import { Icona } from '../../ui/Icona'
import { Info } from '../../ui/Info'
import { GraficoProgressi } from './GraficoProgressi'

/** Quantità in pagine o in parole, come preferisci vederla. */
function quanto(pagine: number, o: ObiettivoPagine): string {
  if (o.misura === 'parole') {
    const parole = Math.round((pagine * o.parolePerPagina) / 10) * 10
    return parole <= 0 ? 'niente' : `circa ${parole.toLocaleString('it-IT')} parole`
  }
  return quantitaLeggibile(pagine, o.parolePerPagina)
}

const giorniTesto = (n: number) => (n === 1 ? '1 giorno' : `${n} giorni`)
const pagineTesto = (n: number) => (n === 1 ? '1 pagina' : `${n} pagine`)

function frase(r: Ritmo): { titolo: string; tono: 'ok' | 'pari' | 'attenzione' } {
  const scarto = Math.round(Math.abs(r.scarto))
  switch (r.stato) {
    case 'fatto':
      return { titolo: 'Hai raggiunto le pagine che volevi', tono: 'ok' }
    case 'scaduta':
      return { titolo: `La consegna era ${giornoLeggibile(r.consegna)}`, tono: 'attenzione' }
    case 'anticipo':
      return { titolo: `Sei in anticipo di ${pagineTesto(Math.max(1, scarto))}`, tono: 'ok' }
    case 'pari':
      return { titolo: 'Sei in pari', tono: 'pari' }
    case 'ritardo':
      return { titolo: `Sei in ritardo di ${pagineTesto(Math.max(1, scarto))}`, tono: 'attenzione' }
  }
}

/** Data e pagine: lo stesso piccolo modulo serve in Panoramica e nelle Impostazioni. */
export function ModuloConsegna({ onFatto, compatto = false }: { onFatto?: () => void; compatto?: boolean }) {
  const obiettivo = useStudio((s) => s.progetto.obiettivo)
  const [data, setData] = useState(obiettivo.consegna ?? '')
  const parole = obiettivo.misura === 'parole'
  const [quantita, setQuantita] = useState(String(parole ? obiettivo.pagineMin * obiettivo.parolePerPagina : obiettivo.pagineMin))
  const oggi = giornoDi()

  const salva = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(quantita)
    const pagine = Number.isFinite(n) && n > 0 ? Math.round(parole ? n / obiettivo.parolePerPagina : n) : obiettivo.pagineMin
    const pagineMin = Math.min(300, Math.max(5, pagine))
    impostaObiettivo({ consegna: data || null, pagineMin, pagineMax: Math.max(obiettivo.pagineMax, pagineMin) })
    onFatto?.()
  }

  return (
    <form className={`ritmo-modulo ${compatto ? 'ritmo-modulo-compatto' : ''}`} onSubmit={salva}>
      <label className="campo-blocco">
        <span className="etichetta">Quando consegni?</span>
        <input className="campo" type="date" min={oggi} value={data} onChange={(e) => setData(e.target.value)} />
      </label>
      <label className="campo-blocco">
        <span className="etichetta">{parole ? 'Quante parole, almeno?' : 'Quante pagine, almeno?'}</span>
        <input
          className="campo"
          type="number"
          inputMode="numeric"
          min={parole ? 1500 : 5}
          max={parole ? 90000 : 300}
          step={parole ? 100 : 1}
          value={quantita}
          onChange={(e) => setQuantita(e.target.value)}
        />
      </label>
      <div className="ritmo-modulo-azioni">
        <button type="submit" className="bottone bottone-primario">
          <Icona nome="spunta" dimensione={16} /> Salva
        </button>
        {onFatto && (
          <button type="button" className="bottone bottone-vuoto" onClick={onFatto}>
            Annulla
          </button>
        )}
      </div>
    </form>
  )
}

/** Barra delle pagine con il segno di dove saresti con un ritmo regolare. */
function BarraPagine({ r, misuraParole, ppp }: { r: Ritmo; misuraParole: boolean; ppp: number }) {
  const q = Math.min(1, r.pagineScritte / Math.max(1, r.pagineObiettivo))
  const ideale = Math.min(1, r.pagineIdeali / Math.max(1, r.pagineObiettivo))
  const fatto = misuraParole
    ? `${Math.round(r.pagineScritte * ppp).toLocaleString('it-IT')} di ${(r.pagineObiettivo * ppp).toLocaleString('it-IT')} parole`
    : `${numeroPagine(r.pagineScritte)} di ${r.pagineObiettivo} pagine`
  return (
    <div className="ritmo-barra-blocco">
      <div
        className="ritmo-barra"
        role="meter"
        aria-label="Pagine scritte rispetto all'obiettivo"
        aria-valuemin={0}
        aria-valuemax={r.pagineObiettivo}
        aria-valuenow={Math.round(r.pagineScritte * 10) / 10}
      >
        <span className={`ritmo-barra-pieno ritmo-barra-${r.stato}`} style={{ width: `${Math.max(1.5, q * 100)}%` }} />
        {r.stato !== 'fatto' && r.stato !== 'scaduta' && (
          <span className="ritmo-barra-ideale" style={{ left: `${ideale * 100}%` }} title="Dove saresti oggi con un ritmo regolare" />
        )}
      </div>
      <p className="ritmo-barra-testo">
        <strong>{fatto}</strong>
        <span>{Math.round(q * 100)}%</span>
      </p>
    </div>
  )
}

export function ConsegnaRitmo() {
  const progetto = useStudio((s) => s.progetto)
  const o = progetto.obiettivo
  const [modifica, setModifica] = useState(false)
  const r = useMemo(() => calcolaRitmo(progetto), [progetto])
  const parole = useMemo(() => paroleTotali(progetto), [progetto])
  const diario = progetto.diario ?? []
  const misuraParole = o.misura === 'parole'

  return (
    <section className="pannello pan-carta ritmo" aria-labelledby="titolo-ritmo">
      <div className="ritmo-dati">
        <div className="ritmo-testa">
          <span className="ritmo-testa-icona" aria-hidden>
            <Icona nome="bandiera" dimensione={20} />
          </span>
          <h2 id="titolo-ritmo">Consegna e ritmo</h2>
          <Info etichetta="Come calcolo il ritmo">
            Divido le pagine che mancano per i giorni che restano, oggi compreso. "In pari" vuol dire che sei dove saresti
            scrivendo ogni giorno lo stesso numero di pagine, dal giorno in cui hai fissato la consegna. Conto le pagine con{' '}
            {o.parolePerPagina} parole l'una.
          </Info>
          {r && !modifica && (
            <button type="button" className="bottone bottone-vuoto bottone-piccolo ritmo-cambia" onClick={() => setModifica(true)}>
              <Icona nome="matita" dimensione={15} /> Cambia
            </button>
          )}
        </div>

        {!r || modifica ? (
          <div className="ritmo-vuoto">
            {!r && (
              <p className="ritmo-invito">
                Dimmi quando consegni e quante pagine vuoi scrivere: ti dico quanto scrivere ogni giorno e se sei in tempo.
              </p>
            )}
            <ModuloConsegna onFatto={r ? () => setModifica(false) : undefined} compatto />
          </div>
        ) : (
          <>
            <p className="ritmo-consegna-data">
              <Icona nome="orologio" dimensione={16} />
              <span>
                Consegna <strong>{giornoLeggibile(r.consegna, true)}</strong>
              </span>
              <span className={`ritmo-giorni ${r.giorniRimasti < 0 ? 'ritmo-giorni-passati' : r.giorniRimasti <= 14 ? 'ritmo-giorni-pochi' : ''}`}>
                {r.giorniRimasti > 0
                  ? `mancano ${giorniTesto(r.giorniRimasti)}`
                  : r.giorniRimasti === 0
                    ? 'è oggi'
                    : `passata da ${giorniTesto(-r.giorniRimasti)}`}
              </span>
            </p>

            {r.stato === 'fatto' ? (
              <p className="ritmo-oggi">
                <span className="ritmo-oggi-etichetta">Obiettivo</span>
                <strong>raggiunto</strong>
              </p>
            ) : r.stato === 'scaduta' ? (
              <p className="ritmo-oggi">
                <span className="ritmo-oggi-etichetta">Mancano</span>
                <strong>{quanto(r.pagineMancanti, o).replace('circa ', '')}</strong>
              </p>
            ) : (
              <p className="ritmo-oggi">
                <span className="ritmo-oggi-etichetta">Oggi</span>
                <strong>{quanto(r.perGiorno, o)}</strong>
              </p>
            )}
            {r.stato !== 'fatto' && r.stato !== 'scaduta' && (
              <p className="nota ritmo-oggi-sotto">
                {r.scritteOggi >= 0.05
                  ? r.scritteOggi >= r.perGiorno
                    ? `Oggi hai già scritto ${quanto(r.scritteOggi, o)}: per oggi sei a posto.`
                    : `Oggi hai già scritto ${quanto(r.scritteOggi, o)}. Continua così.`
                  : 'Al giorno, da qui alla consegna.'}
              </p>
            )}

            <p className={`ritmo-stato ritmo-stato-${frase(r).tono}`}>
              <span className="ritmo-stato-pallino" aria-hidden />
              {frase(r).titolo}
            </p>

            <BarraPagine r={r} misuraParole={misuraParole} ppp={o.parolePerPagina} />
            {r.stato === 'scaduta' && (
              <p className="nota">Se il relatore ti ha dato più tempo, sposta la data con "Cambia".</p>
            )}
          </>
        )}
      </div>

      <div className="ritmo-colonna-grafico">
        <h3 className="ritmo-sottotitolo">
          <Icona nome="grafico" dimensione={16} /> I tuoi progressi
        </h3>
        <GraficoProgressi diario={diario} parolePerPagina={o.parolePerPagina} paroleAdesso={parole} ritmo={r} obiettivo={o.pagineMin} />
        {diario.length < 2 && (
          <p className="nota ritmo-nota-grafico">Il grafico si riempie giorno dopo giorno: ogni giorno in cui scrivi aggiungo un punto.</p>
        )}
      </div>
    </section>
  )
}
