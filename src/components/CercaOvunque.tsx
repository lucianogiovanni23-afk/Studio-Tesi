import { useEffect, useMemo, useRef, useState } from 'react'
import { cercaPassaggi } from '../agents/corpus'
import { NOME_GRUPPO, cercaOvunque, type GruppoRisultati, type Risultato } from '../domain/ricercaGlobale'
import { useStudio } from '../store'
import { apriCerca, chiudiCerca, useCerca } from './cercaStato'

const ORDINE: GruppoRisultati[] = ['sezioni', 'fonti', 'corso', 'glossario', 'osservazioni', 'chat']
const PER_GRUPPO = 6

/** Tasto nella testata; Ctrl+K (o ⌘K) apre la ricerca da qualunque pagina. */
export function BottoneCerca() {
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        apriCerca()
      }
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [])
  return (
    <button type="button" className="bottone-testata" onClick={apriCerca} aria-label="Cerca in tutta la tesi" title="Cerca in tutta la tesi (Ctrl+K)">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="m15 15 5 5" />
      </svg>
      <span className="testata-etichetta">Cerca</span>
    </button>
  )
}

/** Il riquadro di ricerca: in tutta la tesi, gratis, mentre scrivi. */
export function CercaOvunque() {
  const aperta = useCerca((s) => s.aperta)
  if (!aperta) return null
  return <Riquadro />
}

function Riquadro() {
  const progetto = useStudio((s) => s.progetto)
  const apriSezione = useStudio((s) => s.apriSezione)
  const apriFonte = useStudio((s) => s.apriFonte)
  const vai = useStudio((s) => s.vai)
  const [domanda, setDomanda] = useState('')
  const [rinviata, setRinviata] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campo.current?.focus()
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') chiudiCerca()
    }
    window.addEventListener('keydown', suTasto)
    document.body.classList.add('senza-scroll')
    return () => {
      window.removeEventListener('keydown', suTasto)
      document.body.classList.remove('senza-scroll')
    }
  }, [])

  // Si cerca quando smetti di scrivere per un attimo: con testi lunghi resta fluido.
  useEffect(() => {
    const t = setTimeout(() => setRinviata(domanda), 150)
    return () => clearTimeout(t)
  }, [domanda])

  const risultati = useMemo(() => cercaOvunque(progetto, rinviata, (d) => cercaPassaggi(d, 6)), [progetto, rinviata])
  const gruppi = ORDINE.map((g) => ({ g, voci: risultati.filter((r) => r.gruppo === g) })).filter((x) => x.voci.length > 0)

  const apri = (r: Risultato) => {
    chiudiCerca()
    if (r.apri.tipo === 'sezione') apriSezione(r.apri.capitoloId, r.apri.sezioneId)
    else if (r.apri.tipo === 'fonte') apriFonte(r.apri.fonteId)
    else vai(r.apri.schermata)
  }

  return (
    <div className="ponte-sfondo cerca-sfondo" role="dialog" aria-modal="true" aria-label="Cerca in tutta la tesi" onClick={(e) => e.target === e.currentTarget && chiudiCerca()}>
      <div className="ponte cerca">
        <form
          className="cerca-campo"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            const primo = gruppi[0]?.voci[0]
            if (primo) apri(primo)
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="m15 15 5 5" />
          </svg>
          <input
            ref={campo}
            type="search"
            className="campo"
            placeholder="Cerca in testi, fonti, lezioni, glossario…"
            value={domanda}
            onChange={(e) => setDomanda(e.target.value)}
            aria-label="Cerca in tutta la tesi"
            autoComplete="off"
          />
          <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={chiudiCerca}>
            Chiudi
          </button>
        </form>

        <div className="cerca-risultati" aria-live="polite">
          {!rinviata.trim() ? (
            <p className="nota">
              Scrivi una o più parole: cerco nel testo della tesi, nelle fonti (anche nel testo completo e nelle schede), nelle
              lezioni del corso, nel glossario, nelle osservazioni e nella chat. È gratis e non usa gli agenti.
            </p>
          ) : gruppi.length === 0 ? (
            <p className="nota">Nessun risultato per «{rinviata.trim()}».</p>
          ) : (
            gruppi.map(({ g, voci }) => (
              <section key={g} className="cerca-gruppo">
                <h3>
                  {NOME_GRUPPO[g]} <span className="nota">{voci.length}</span>
                </h3>
                <ul>
                  {voci.slice(0, PER_GRUPPO).map((r) => (
                    <li key={r.id}>
                      <button type="button" className="cerca-voce" onClick={() => apri(r)}>
                        <strong>{r.titolo}</strong>
                        <span className="cerca-estratto">
                          {r.estratto.map((p, i) => (p.trovato ? <mark key={i}>{p.testo}</mark> : <span key={i}>{p.testo}</span>))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {voci.length > PER_GRUPPO && <p className="nota">e altri {voci.length - PER_GRUPPO}: aggiungi una parola per restringere.</p>}
              </section>
            ))
          )}
        </div>
        <p className="nota cerca-piede">Invio apre il primo risultato · Esc chiude · Ctrl+K la riapre da qualunque pagina</p>
      </div>
    </div>
  )
}
