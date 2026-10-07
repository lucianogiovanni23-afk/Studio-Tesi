import { useEffect, useRef, useState } from 'react'
import { nomeChi } from '../agents/agenti'
import { controllaSchema, estraiJson, usePonte, type RichiestaPonte } from '../agents/ponte'

const CLAUDE_AI = 'https://claude.ai/new'

/**
 * Finestra della modalità gratuita: copia la richiesta, incollala su
 * Claude.ai, riporta qui la risposta. La risposta si accetta solo quando il
 * JSON è leggibile e completo, così gli agenti ricevono sempre dati validi.
 */
export function PonteClaude() {
  const coda = usePonte((s) => s.coda)
  const r = coda[0]
  if (!r) return null
  // La chiave azzera lo stato interno a ogni nuova richiesta.
  return <Finestra key={r.id} r={r} inCoda={coda.length - 1} />
}

function Finestra({ r, inCoda }: { r: RichiestaPonte; inCoda: number }) {
  const [risposta, setRisposta] = useState('')
  const [errore, setErrore] = useState('')
  const [copiata, setCopiata] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const titolo = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    titolo.current?.focus()
  }, [])

  const copia = async () => {
    try {
      await navigator.clipboard.writeText(r.testo)
      setCopiata(true)
    } catch {
      // Appunti non disponibili: si seleziona il testo da copiare a mano.
      const t = document.getElementById(`richiesta-${r.id}`) as HTMLTextAreaElement | null
      t?.closest('details')?.setAttribute('open', '')
      t?.select()
    }
  }

  const incolla = async () => {
    try {
      const testo = await navigator.clipboard.readText()
      // Un secondo incolla si aggiunge al primo: serve quando la risposta è arrivata in due pezzi.
      setRisposta((attuale) => (attuale ? `${attuale}\n${testo}` : testo))
      setErrore('')
    } catch {
      area.current?.focus()
      setErrore('Il browser non mi fa leggere quello che hai copiato: tieni premuto nel riquadro e scegli Incolla.')
    }
  }

  const usa = () => {
    if (!risposta.trim()) return setErrore('Incolla prima la risposta di Claude.')
    if (!r.schema) return r.risolvi(risposta)
    try {
      const dati = estraiJson(risposta)
      const problema = controllaSchema(dati, r.schema)
      if (problema) return setErrore(problema)
      r.risolvi(JSON.stringify(dati))
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Non riesco a leggere la risposta.')
    }
  }

  const caratteri = r.testo.length.toLocaleString('it-IT')

  return (
    <div className="ponte-sfondo" role="dialog" aria-modal="true" aria-labelledby={`ponte-titolo-${r.id}`}>
      <div className="ponte">
        <p className="ponte-chi">
          {r.chi ? nomeChi(r.chi) : 'Collega'} · gratis con Claude.ai{inCoda > 0 ? ` · dopo ce ne sono altre ${inCoda}` : ''}
        </p>
        <h2 id={`ponte-titolo-${r.id}`} ref={titolo} tabIndex={-1}>
          {r.azione.charAt(0).toUpperCase() + r.azione.slice(1)}
        </h2>

        {r.avviso && (
          <p className="allerta" role="status">
            <strong>Rifacciamo un passaggio:</strong> la risposta di prima non andava bene ({r.avviso}). Ho aggiornato la
            richiesta qui sotto e lo spiego a Claude: copiala di nuovo, anche nella stessa chat va bene.
          </p>
        )}
        <ol className="ponte-passi">
          <li>
            <div className="riga-editor">
              <button type="button" className="bottone bottone-primario" onClick={() => void copia()}>
                {copiata ? 'Copiata ✓' : 'Copia la richiesta'}
              </button>
              <span className="nota">{caratteri} caratteri</span>
            </div>
          </li>
          <li>
            <a className="bottone" href={CLAUDE_AI} target="_blank" rel="noreferrer">
              Apri Claude.ai
            </a>
            <p className="nota">
              Apri una <strong>chat nuova</strong>, incolla e invia. Se il testo è lungo, Claude.ai lo mette come allegato: va
              bene così.
            </p>
          </li>
          <li>
            <p className="nota">
              Quando Claude ha finito, copia la sua risposta (c'è il tasto "Copia" sotto il messaggio) e incollala qui.
            </p>
            <textarea
              ref={area}
              className="campo ponte-risposta"
              rows={6}
              placeholder={r.schema ? 'Incolla qui la risposta di Claude (inizia con { )' : 'Incolla qui la risposta di Claude'}
              value={risposta}
              onChange={(e) => {
                setRisposta(e.target.value)
                setErrore('')
              }}
              aria-label="Risposta di Claude"
            />
            <div className="riga-editor">
              <button type="button" className="bottone" onClick={() => void incolla()}>
                {risposta ? 'Incolla il resto' : 'Incolla la risposta'}
              </button>
              <button type="button" className="bottone bottone-primario" onClick={usa}>
                Usa questa risposta
              </button>
            </div>
          </li>
        </ol>

        {errore && (
          <p className="allerta allerta-errore" role="alert">
            {errore}
          </p>
        )}
        <p className="nota">
          Se la risposta di Claude si ferma a metà, scrivigli <strong>continua</strong> e incolla anche il resto, sotto il
          primo pezzo. L'app controlla da sola che ci sia tutta.
        </p>

        <details className="ponte-dettagli">
          <summary>Vedi la richiesta</summary>
          <textarea id={`richiesta-${r.id}`} className="campo" rows={8} readOnly value={r.testo} aria-label="Richiesta da copiare" />
        </details>

        <div className="ponte-piede">
          <button type="button" className="bottone bottone-vuoto" onClick={r.annulla}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
