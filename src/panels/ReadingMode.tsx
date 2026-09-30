import { useEffect, useState } from 'react'
import { useStudioStore } from '../store'
import { ChapterView, RiepilogoCitazioni } from './ChapterView'
import { testoPerCopia } from './citazioniUi'

/**
 * Modalità "carta": il capitolo a tutto schermo su fondo chiaro, con una
 * tipografia da lettura. Le citazioni restano cliccabili e ogni paragrafo si
 * può rifinire o riportare alla versione precedente.
 */
export function ReadingMode() {
  const aperta = useStudioStore((s) => s.letturaAperta)
  const apri = useStudioStore((s) => s.apriLettura)
  const opzioni = useStudioStore((s) => s.opzioni)
  const setAttiva = useStudioStore((s) => s.setOpzioneAttiva)
  const prefisso = useStudioStore((s) => s.prefissoScrittore)
  const [copiato, setCopiato] = useState(false)

  useEffect(() => {
    if (!aperta) return
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') apri(null)
    }
    window.addEventListener('keydown', suTasto)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', suTasto)
      document.body.style.overflow = overflow
    }
  }, [aperta, apri])

  if (!aperta) return null
  const opzione = opzioni.find((o) => o.impianto === aperta)
  if (!opzione?.risultato) return null

  const copia = async () => {
    try {
      await navigator.clipboard?.writeText(testoPerCopia(opzione, prefisso?.riferimenti ?? []))
      setCopiato(true)
      window.setTimeout(() => setCopiato(false), 2000)
    } catch {
      // Copia non disponibile.
    }
  }

  return (
    <div className="carta-sfondo" role="dialog" aria-modal="true" aria-label="Lettura del capitolo">
      <header className="carta-barra">
        <div className="schede">
          {opzioni
            .filter((o) => o.risultato)
            .map((o) => (
              <button
                key={o.impianto}
                type="button"
                className={`scheda ${o.impianto === aperta ? 'scheda-attiva' : ''}`}
                onClick={() => {
                  apri(o.impianto)
                  setAttiva(o.impianto)
                }}
              >
                Opzione {o.impianto}
              </button>
            ))}
        </div>
        <span className="carta-info">
          {opzione.etichetta} · {opzione.parole} parole · <RiepilogoCitazioni opzione={opzione} />
        </span>
        <div className="azioni">
          <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={() => void copia()}>
            {copiato ? 'Copiato ✓' : 'Copia'}
          </button>
          <button type="button" className="bottone bottone-primario bottone-piccolo" onClick={() => apri(null)}>
            Chiudi
          </button>
        </div>
      </header>

      <div className="carta-scorrimento">
        <div className="carta-foglio">
          <ChapterView opzione={opzione} />
          <p className="carta-legenda">
            Apici: <span className="marcatore marcatore-ok">F1</span> citazione verificata ·{' '}
            <span className="marcatore marcatore-avviso">F2</span> quasi letterale o sostegno parziale ·{' '}
            <span className="marcatore marcatore-errore">F3</span> non ritrovata nella fonte o non supportata.
            Tocca un apice per leggere l'estratto.
          </p>
        </div>
      </div>
    </div>
  )
}
