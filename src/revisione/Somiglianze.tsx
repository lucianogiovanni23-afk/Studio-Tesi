import './revisione-nuove.css'
import { useMemo, useState, type ReactNode } from 'react'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'
import { controllaSomiglianze, fermaSomiglianze, PAROLE_PEZZO, useSomiglianze, type FraseSimile } from './somiglianze'
import { vaiAlParagrafo } from './vaiAlParagrafo'

/** Il testo con le parti uguali evidenziate. */
function Evidenziato({ testo, parti }: { testo: string; parti: [number, number][] }) {
  const pezzi: ReactNode[] = []
  let da = 0
  parti.forEach(([a, b], i) => {
    if (a > da) pezzi.push(testo.slice(da, a))
    pezzi.push(<mark key={i}>{testo.slice(a, b)}</mark>)
    da = b
  })
  if (da < testo.length) pezzi.push(testo.slice(da))
  return <>{pezzi}</>
}

const NOME_LIVELLO = { alta: 'molto simile', media: 'simile', bassa: 'un po\' simile' } as const

function CartaSimile({ s }: { s: FraseSimile }) {
  const quota = Math.round(s.punteggio * 100)
  return (
    <li className={`sim-voce sim-${s.citata ? 'citata' : s.livello}`}>
      <div className="sim-testa">
        <span className="sim-punteggio" aria-label={`${quota} per cento di parole uguali`}>
          {quota}%
        </span>
        <span className="sim-livello">{s.citata ? 'citata tra virgolette' : NOME_LIVELLO[s.livello]}</span>
        <button type="button" className="link sim-sezione" onClick={() => vaiAlParagrafo(s.capitoloId, s.sezioneId, null, s.frase)}>
          {s.sezione}
          <Icona nome="freccia" dimensione={14} />
        </button>
      </div>
      <div className="sim-confronto">
        <div>
          <span className="etichetta">Nella tua tesi</span>
          <p className="sim-frase">
            <Evidenziato testo={s.frase} parti={s.uguali} />
          </p>
        </div>
        <div>
          <span className="etichetta">
            {s.tipoFonte === 'corso' ? 'Nel materiale del corso' : 'Nella fonte'} · {s.fonte}
          </span>
          <p className="sim-passo">
            <Evidenziato testo={s.passo} parti={s.passoUguali} />
          </p>
        </div>
      </div>
      <p className={`nota sim-consiglio ${s.citata ? 'nota-ok' : ''}`}>
        <Icona nome={s.citata ? 'spunta' : 'matita'} dimensione={16} />
        {s.citata
          ? 'È tra virgolette e c\'è il rimando alla fonte: va bene così.'
          : 'Riscrivila con parole tue o mettila tra virgolette con la citazione.'}
      </p>
    </li>
  )
}

type Filtro = 'da_sistemare' | 'tutte' | 'citate'

/** Frasi troppo simili alle fonti: controllo locale, gratis e senza internet. */
export function Somiglianze() {
  const { inCorso, avanzamento, fase, esito, errore } = useSomiglianze()
  const [filtro, setFiltro] = useState<Filtro>('da_sistemare')
  const voci = useMemo(() => {
    const tutte = esito?.simili ?? []
    if (filtro === 'tutte') return tutte
    return tutte.filter((s) => (filtro === 'citate' ? s.citata : !s.citata))
  }, [esito, filtro])
  const conta = useMemo(() => {
    const t = esito?.simili ?? []
    return { daSistemare: t.filter((s) => !s.citata).length, citate: t.filter((s) => s.citata).length, alte: t.filter((s) => !s.citata && s.livello === 'alta').length }
  }, [esito])

  return (
    <section className="pannello rev-carta sim">
      <div className="rev-testa">
        <h2 className="rev-titolo">
          <Icona nome="copia" dimensione={20} /> Frasi troppo simili alle fonti
        </h2>
        <Info etichetta="Come funziona">
          Confronto ogni frase della tesi con il materiale del corso e con le fonti della biblioteca (testo dei PDF, abstract,
          estratti), a gruppi di {PAROLE_PEZZO} parole di fila. Lo faccio qui sul tuo dispositivo: è gratis e non manda niente a
          nessuno.
        </Info>
      </div>
      <div className="sim-avviso">
        <Icona nome="info" dimensione={18} />
        <p>
          È un aiuto per sistemare le frasi copiate per sbaglio. <strong>Non sostituisce il controllo antiplagio dell'università</strong>
          : quello confronta con milioni di testi, io solo con quelli che hai qui.
        </p>
      </div>

      {inCorso ? (
        <div className="sim-lavoro" role="status">
          <div className="cor-barra sim-barra" aria-hidden>
            <span style={{ width: `${Math.round(avanzamento * 100)}%` }} />
          </div>
          <span className="nota">{fase || 'Controllo…'}</span>
          <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={fermaSomiglianze}>
            Ferma
          </button>
        </div>
      ) : (
        <div className="sim-bottoni">
          <button type="button" className="bottone bottone-primario" onClick={() => void controllaSomiglianze()}>
            <Icona nome="lente" dimensione={18} />
            {esito ? 'Controlla di nuovo (gratis)' : 'Controlla le frasi (gratis)'}
          </button>
          {esito && (
            <button type="button" className="bottone bottone-secondario" onClick={() => void controllaSomiglianze(true)}>
              <Icona nome="aggiorna" dimensione={18} />
              Ricontrolla tutto
            </button>
          )}
        </div>
      )}
      {errore && <p className="allerta allerta-errore">{errore}</p>}

      {esito && (
        <>
          <p className="nota rev-ultimo">
            <Icona nome="orologio" dimensione={16} /> {new Date(esito.data).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} ·{' '}
            {esito.frasi} frasi della tesi confrontate con {esito.fonti} {esito.fonti === 1 ? 'testo' : 'testi'} del corso e della biblioteca
          </p>
          {esito.ricontrollati < esito.paragrafi && (
            <p className="nota sim-memoria">
              {esito.ricontrollati === 0
                ? 'Niente è cambiato dall\'ultimo controllo: ho riusato i risultati.'
                : `Ho ricontrollato solo ${esito.ricontrollati === 1 ? 'il paragrafo cambiato' : `i ${esito.ricontrollati} paragrafi cambiati`}; gli altri ${esito.paragrafi - esito.ricontrollati} non sono cambiati.`}{' '}
              Se vuoi, usa "Ricontrolla tutto".
            </p>
          )}
          {esito.simili.length === 0 ? (
            <p className="nota nota-ok">Nessuna frase troppo simile alle fonti. Bel lavoro!</p>
          ) : (
            <>
              <div className="filtri-tipo" role="group" aria-label="Quali frasi vedere">
                <button type="button" className={`tema ${filtro === 'da_sistemare' ? 'tema-attivo' : 'tema-spento'}`} onClick={() => setFiltro('da_sistemare')}>
                  da sistemare ({conta.daSistemare})
                </button>
                <button type="button" className={`tema ${filtro === 'citate' ? 'tema-attivo' : 'tema-spento'}`} onClick={() => setFiltro('citate')}>
                  già tra virgolette ({conta.citate})
                </button>
                <button type="button" className={`tema ${filtro === 'tutte' ? 'tema-attivo' : 'tema-spento'}`} onClick={() => setFiltro('tutte')}>
                  tutte ({esito.simili.length})
                </button>
              </div>
              {conta.alte > 0 && filtro !== 'citate' && (
                <p className="allerta">
                  {conta.alte === 1 ? 'Una frase è' : `${conta.alte} frasi sono`} quasi uguali alla fonte: parti da {conta.alte === 1 ? 'quella' : 'quelle'}.
                </p>
              )}
              {voci.length === 0 ? (
                <p className="nota nota-ok">Niente in questo gruppo.</p>
              ) : (
                <ul className="sim-elenco">
                  {voci.map((s) => (
                    <CartaSimile key={s.id} s={s} />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
