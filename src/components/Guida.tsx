import { useEffect, useRef } from 'react'
import { useStudio } from '../store'
import type { Schermata } from '../types'
import { segnaGuidaVista, useGuida } from './guidaStato'

/**
 * Guida in pochi passi: compare nell'Inizio al primo avvio (su ogni
 * dispositivo) e si riapre in qualunque momento dal tasto "Guida".
 */

const PASSI: { numero: string; titolo: string; testo: string; vai?: Schermata }[] = [
  {
    numero: '1',
    titolo: 'Corso · Giulia Romano',
    testo: "Le dai i PDF delle lezioni: ne ricava il quadro teorico e il lessico che la tesi dovrà usare.",
  },
  {
    numero: '2',
    titolo: 'Fonti · Marco Ferrara',
    testo: 'Gli dici su cosa cercare: consulta i cataloghi, tu approvi i risultati, lui prepara le schede di lettura.',
  },
  {
    numero: '3',
    titolo: 'Scrittura · Luca Esposito',
    testo: 'Una sezione alla volta: scegliete le fonti, approvi la scaletta, lui scrive la bozza con citazioni verificate.',
  },
  {
    numero: '4',
    titolo: 'Revisione · Elena Conti',
    testo: 'Le incolli le osservazioni del relatore, controlla tutta la tesi e prepara il file Word.',
  },
]

function Contenuto({ chiudi }: { chiudi: () => void }) {
  const scegliAgente = useStudio((s) => s.scegliAgente)
  const gratuita = useStudio((s) => !s.apiKey.trim())
  return (
    <>
      <p className="guida-idea">
        Nell'<strong>Ufficio</strong> lavori con quattro persone: tocca una di loro e parlale. Ognuna ti dice che cosa
        fare, e tu rispondi con un tocco o scrivendo. <strong>Decidi sempre tu</strong>: niente entra nella tesi senza la
        tua approvazione, e ogni citazione viene controllata sul testo della fonte.
      </p>
      <ol className="guida-passi">
        {PASSI.map((p) => (
          <li key={p.numero}>
            <span className="guida-numero" aria-hidden>
              {p.numero}
            </span>
            <div>
              <strong>{p.titolo}</strong>
              <p>{p.testo}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="guida-colori">
        <strong>I colori delle citazioni</strong>
        <span>
          <i className="pallino-verde" /> trovata alla lettera nella fonte
        </span>
        <span>
          <i className="pallino-ambra" /> quasi uguale o sostenuta solo in parte
        </span>
        <span>
          <i className="pallino-rosso" /> non trovata: da correggere
        </span>
      </div>
      <p className="nota">
        {gratuita
          ? 'Stai usando la modalità gratuita: ogni comando degli agenti apre una finestra con il copia e incolla verso Claude.ai.'
          : 'Con la chiave API gli agenti lavorano da soli; prima di ogni comando vedi il costo stimato.'}{' '}
        Per avere la tesi su iPhone, iPad e computer: Impostazioni → Sincronizzazione.
      </p>
      <div className="riga-editor">
        <button type="button" className="bottone bottone-primario" onClick={chiudi}>
          Ho capito
        </button>
        <button
          type="button"
          className="bottone"
          onClick={() => {
            chiudi()
            scegliAgente('lettore')
          }}
        >
          Comincia da Giulia
        </button>
      </div>
    </>
  )
}

/** La guida dentro l'Inizio, finché non la si chiude la prima volta. */
export function GuidaIniziale() {
  const vista = useGuida((s) => s.vista)
  if (vista) return null
  return (
    <section className="pannello guida" aria-labelledby="guida-titolo">
      <h2 id="guida-titolo">Come funziona Studio tesi</h2>
      <Contenuto chiudi={segnaGuidaVista} />
    </section>
  )
}

/** La stessa guida in una finestra, dal tasto "Guida" nella testata. */
export function GuidaFinestra() {
  const aperta = useGuida((s) => s.aperta)
  const titolo = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (aperta) titolo.current?.focus()
  }, [aperta])
  if (!aperta) return null
  return (
    <div className="ponte-sfondo" role="dialog" aria-modal="true" aria-labelledby="guida-finestra-titolo" onClick={(e) => e.target === e.currentTarget && segnaGuidaVista()}>
      <div className="ponte guida">
        <h2 id="guida-finestra-titolo" ref={titolo} tabIndex={-1}>
          Come funziona Studio tesi
        </h2>
        <Contenuto chiudi={segnaGuidaVista} />
      </div>
    </div>
  )
}

export function BottoneGuida() {
  return (
    <button type="button" className="bottone-testata" onClick={() => useGuida.setState({ aperta: true })} aria-label="Guida">
      <span aria-hidden>?</span>
      <span className="testata-etichetta">Guida</span>
    </button>
  )
}
