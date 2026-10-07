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
    titolo: 'Corso · Lettrice del corso',
    testo: 'Le passi i PDF delle lezioni: lei trova le idee principali del corso e si segna le parole del corso da usare nella tesi.',
  },
  {
    numero: '2',
    titolo: 'Fonti · Bibliotecario',
    testo: 'Gli dici cosa cercare e lui trova gli articoli. Tu scegli quali tenere, lui te li riassume.',
  },
  {
    numero: '3',
    titolo: 'Scrittura · Scrittore',
    testo: 'Un paragrafo alla volta: scegliete le fonti, dai l’ok alla scaletta e lui scrive la bozza con citazioni controllate.',
  },
  {
    numero: '4',
    titolo: 'Revisione · Revisore',
    testo: 'Gli incolli le note del relatore. Lui controlla tutta la tesi e ti prepara il file Word.',
  },
]

function Contenuto({ chiudi }: { chiudi: () => void }) {
  const scegliAgente = useStudio((s) => s.scegliAgente)
  const gratuita = useStudio((s) => !s.apiKey.trim())
  return (
    <>
      <p className="guida-idea">
        Nell'<strong>Ufficio</strong> hai quattro colleghi: tocca uno di loro e parlaci. Ognuno ti dice cosa fare, e tu
        rispondi con un tocco o scrivendo. <strong>Decidi sempre tu</strong>: nella tesi non entra niente senza il tuo
        ok, e ogni citazione viene controllata sulla fonte.
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
          <i className="pallino-verde" /> c'è uguale nella fonte
        </span>
        <span>
          <i className="pallino-ambra" /> quasi uguale, o vera solo in parte
        </span>
        <span>
          <i className="pallino-rosso" /> non c'è: da sistemare
        </span>
      </div>
      <p className="nota">
        {gratuita
          ? 'Stai usando la versione gratis: quando chiedi qualcosa ai colleghi si apre una finestra, copi la richiesta su Claude.ai e incolli qui la risposta.'
          : 'Con la chiave API i colleghi lavorano da soli, e prima di ogni richiesta vedi quanto costa più o meno.'}{' '}
        Per avere la tesi su iPhone, iPad e computer: vai in Impostazioni → Sincronizzazione.
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
          Comincia dalla lettrice
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
      <h2 id="guida-titolo">Come funziona</h2>
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
          Come funziona
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
