import '../styles/ponte.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENTE, nomeChi } from '../agents/agenti'
import { controllaSchema, estraiJson, riconosciRisposta, usePonte, type RichiestaPonte } from '../agents/ponte'
import type { AgentKey } from '../types'
import { Icona } from '../ui/Icona'
import { Ritratto } from './Ritratto'

const CLAUDE_AI = 'https://claude.ai/new'

/**
 * Finestra della modalità gratuita: copia la richiesta, incollala su
 * Claude.ai, riporta qui la risposta. La risposta si accetta solo quando il
 * JSON è leggibile e completo, così gli agenti ricevono sempre dati validi.
 *
 * Quando torni nell'app la finestra guarda negli appunti (se il browser lo
 * permette) e, se trova la risposta giusta, la propone: la usa solo dopo il tuo sì.
 */
export function PonteClaude() {
  const coda = usePonte((s) => s.coda)
  const r = coda[0]
  if (!r) return null
  // La chiave azzera lo stato interno a ogni nuova richiesta.
  return <Finestra key={r.id} r={r} inCoda={coda.length - 1} />
}

/** Copia in modo sincrono, dentro il tocco: così si può aprire Claude.ai subito dopo senza blocchi. */
function copiaSubito(testo: string): boolean {
  const area = document.createElement('textarea')
  area.value = testo
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  const attivo = document.activeElement as HTMLElement | null
  try {
    area.focus()
    area.select()
    area.setSelectionRange(0, testo.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
    attivo?.focus?.({ preventScroll: true })
  }
}

/** Il browser ci lascia leggere gli appunti senza chiedere? (Solo Chrome ed Edge, dopo il primo permesso.) */
async function letturaPermessa(): Promise<boolean> {
  try {
    const stato = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName })
    return stato?.state === 'granted'
  } catch {
    return false
  }
}

type Trovata = { testo: string; tipo: 'codice' | 'json' }

function Finestra({ r, inCoda }: { r: RichiestaPonte; inCoda: number }) {
  const [risposta, setRisposta] = useState('')
  const [errore, setErrore] = useState('')
  const [copiata, setCopiata] = useState(false)
  const [tornato, setTornato] = useState(false)
  const [trovata, setTrovata] = useState<Trovata | null>(null)
  const [suggerimento, setSuggerimento] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const titolo = useRef<HTMLHeadingElement>(null)
  const uscito = useRef(false)
  const ignorate = useRef(new Set<string>())
  const rispostaRef = useRef('')
  useEffect(() => {
    rispostaRef.current = risposta
  }, [risposta])

  useEffect(() => {
    titolo.current?.focus()
  }, [])

  const k = r.chi && r.chi in AGENTE ? (r.chi as AgentKey) : null

  /** Usa il testo come risposta (dopo i controlli sul formato). */
  const usaTesto = useCallback(
    (testo: string) => {
      if (!testo.trim()) return setErrore('Incolla prima la risposta di Claude.')
      if (!r.schema) return r.risolvi(testo)
      try {
        const dati = estraiJson(testo)
        const problema = controllaSchema(dati, r.schema)
        if (problema) return setErrore(problema)
        r.risolvi(JSON.stringify(dati))
      } catch (err) {
        setErrore(err instanceof Error ? err.message : 'Non riesco a leggere la risposta.')
      }
    },
    [r],
  )

  /**
   * Legge gli appunti e guarda se c'è la risposta di questa richiesta.
   * `daTocco`: lo studente ha toccato "Incolla" (allora si incolla comunque).
   */
  const guardaAppunti = useCallback(
    async (daTocco: boolean) => {
      if (!navigator.clipboard?.readText) {
        if (daTocco) {
          area.current?.focus()
          setErrore('Il browser non mi fa leggere quello che hai copiato: tieni premuto nel riquadro e scegli Incolla.')
        }
        return
      }
      if (!daTocco && !(await letturaPermessa())) return
      let testo = ''
      try {
        testo = await navigator.clipboard.readText()
      } catch {
        if (daTocco) {
          area.current?.focus()
          setErrore('Il browser non mi fa leggere quello che hai copiato: tieni premuto nel riquadro e scegli Incolla.')
        }
        return
      }
      setErrore('')
      const attuale = rispostaRef.current
      // Un secondo incolla si aggiunge al primo: serve quando la risposta è arrivata in due pezzi.
      const unito = daTocco && attuale.trim() && !attuale.includes(testo.trim()) ? `${attuale}\n${testo}` : testo
      const tipo = riconosciRisposta(unito, r)
      if (tipo === 'codice' || tipo === 'json') {
        if (!daTocco && ignorate.current.has(unito)) return
        setRisposta(unito)
        setTrovata({ testo: unito, tipo })
        setSuggerimento('')
        return
      }
      if (tipo === 'richiesta') {
        setSuggerimento(
          'Negli appunti c\'è ancora la richiesta, non la risposta. Su Claude.ai tocca "Copia" sotto la risposta di Claude e torna qui.',
        )
        return
      }
      if (tipo === 'altra') {
        setSuggerimento('Negli appunti c\'è la risposta a un\'altra richiesta (il codice è diverso). Copia la risposta giusta, quella con il codice ' + r.codice + '.')
        return
      }
      if (daTocco) {
        setRisposta(unito)
        setSuggerimento('')
      }
    },
    [r],
  )

  // Quando torni dall'altra scheda (o dall'app di Claude), guardo negli appunti.
  useEffect(() => {
    const via = () => {
      uscito.current = true
    }
    const ritorno = () => {
      if (document.visibilityState !== 'visible' || !uscito.current) return
      uscito.current = false
      setTornato(true)
      if (!rispostaRef.current.trim()) void guardaAppunti(false)
    }
    const suVisibilita = () => (document.visibilityState === 'hidden' ? via() : ritorno())
    window.addEventListener('blur', via)
    window.addEventListener('focus', ritorno)
    document.addEventListener('visibilitychange', suVisibilita)
    return () => {
      window.removeEventListener('blur', via)
      window.removeEventListener('focus', ritorno)
      document.removeEventListener('visibilitychange', suVisibilita)
    }
  }, [guardaAppunti])

  const copiaEApri = async () => {
    // La copia sincrona tiene il "tocco" valido per aprire la nuova scheda.
    const ok = copiaSubito(r.testo)
    if (ok) {
      setCopiata(true)
      window.open(CLAUDE_AI, '_blank', 'noopener')
      return
    }
    try {
      await navigator.clipboard.writeText(r.testo)
      setCopiata(true)
      window.open(CLAUDE_AI, '_blank', 'noopener')
    } catch {
      mostraDaCopiare()
    }
  }

  const soloCopia = async () => {
    if (copiaSubito(r.testo)) return setCopiata(true)
    try {
      await navigator.clipboard.writeText(r.testo)
      setCopiata(true)
    } catch {
      mostraDaCopiare()
    }
  }

  const mostraDaCopiare = () => {
    // Appunti non disponibili: si seleziona il testo da copiare a mano.
    const t = document.getElementById(`richiesta-${r.id}`) as HTMLTextAreaElement | null
    t?.closest('details')?.setAttribute('open', '')
    t?.select()
    setErrore('Non riesco a copiare da solo: ho selezionato la richiesta qui sotto, copiala tu (tieni premuto → Copia).')
  }

  const scarta = () => {
    if (trovata) ignorate.current.add(trovata.testo)
    setTrovata(null)
    setRisposta('')
    setSuggerimento('Va bene, non la uso. Copia la risposta giusta e tocca "Incolla la risposta".')
  }

  const caratteri = r.testo.length.toLocaleString('it-IT')
  const anteprima = trovata ? trovata.testo.replace(/\s+/g, ' ').trim().slice(0, 180) : ''
  const grandeIncolla = tornato && !risposta.trim() && !trovata

  return (
    <div className="ponte-sfondo" role="dialog" aria-modal="true" aria-labelledby={`ponte-titolo-${r.id}`}>
      <div className="ponte" style={k ? { ['--colore-agente' as string]: AGENTE[k].colore } : undefined}>
        <div className="ponte-testa">
          {k && <Ritratto k={k} dimensione={48} />}
          <div>
            <p className="ponte-chi">
              {r.chi ? nomeChi(r.chi) : 'Collega'} · gratis con Claude.ai{inCoda > 0 ? ` · dopo ce ne sono altre ${inCoda}` : ''}
            </p>
            <h2 id={`ponte-titolo-${r.id}`} ref={titolo} tabIndex={-1}>
              {r.azione.charAt(0).toUpperCase() + r.azione.slice(1)}
            </h2>
          </div>
          <span className="ponte-codice" title="Claude lo ripete nella risposta: così la riconosco">
            {r.codice}
          </span>
        </div>

        {r.avviso && (
          <p className="allerta" role="status">
            <strong>Rifacciamo un passaggio:</strong> la risposta di prima non andava bene ({r.avviso}). Ho aggiornato la
            richiesta qui sotto e lo spiego a Claude: copiala di nuovo, anche nella stessa chat va bene.
          </p>
        )}

        {trovata && (
          <div className="ponte-trovata" role="alertdialog" aria-live="assertive" aria-label="Risposta trovata">
            <span className="ponte-trovata-icona" aria-hidden>
              <Icona nome="spunta" dimensione={22} />
            </span>
            <div className="ponte-trovata-testo">
              <strong>Ho trovato la risposta di Claude: la uso?</strong>
              <span className="nota">
                {trovata.tipo === 'codice' ? `Ha il codice ${r.codice}, quindi è proprio quella giusta.` : 'È nel formato giusto, ma senza il codice: controlla che sia quella giusta.'}
              </span>
              <q className="ponte-anteprima">{anteprima}…</q>
            </div>
            <div className="ponte-trovata-azioni">
              <button type="button" className="bottone bottone-vuoto" onClick={scarta}>
                No
              </button>
              <button type="button" className="bottone bottone-primario" onClick={() => usaTesto(trovata.testo)} autoFocus>
                Sì, usala
              </button>
            </div>
          </div>
        )}

        {grandeIncolla && (
          <div className="ponte-ritorno">
            <p>
              <strong>Bentornato!</strong> Hai copiato la risposta di Claude? Tocca qui e la prendo io.
            </p>
            <button type="button" className="bottone bottone-primario ponte-incolla-grande" onClick={() => void guardaAppunti(true)}>
              <Icona nome="copia" dimensione={22} />
              Incolla la risposta
            </button>
          </div>
        )}

        {suggerimento && (
          <p className="allerta" role="status">
            {suggerimento}
          </p>
        )}

        <ol className="ponte-passi">
          <li>
            <div className="riga-editor">
              <button type="button" className="bottone bottone-primario ponte-copia-apri" onClick={() => void copiaEApri()}>
                <Icona nome={copiata ? 'spunta' : 'link'} dimensione={18} />
                {copiata ? 'Copiata · riapri Claude.ai' : 'Copia e apri Claude.ai'}
              </button>
              <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={() => void soloCopia()}>
                Solo copia
              </button>
              <span className="nota">{caratteri} caratteri</span>
            </div>
            <p className="nota">
              Con un tocco copio la richiesta e apro una <strong>chat nuova</strong> di Claude.ai: tu incolla e invia. Se il
              testo è lungo, Claude.ai lo mette come allegato: va bene così.
            </p>
          </li>
          <li>
            <p className="nota">
              Quando Claude ha finito, tocca <strong>"Copia"</strong> sotto la sua risposta e torna qui: la cerco io negli appunti,
              oppure incollala nel riquadro.
            </p>
            <textarea
              ref={area}
              className="campo ponte-risposta"
              rows={5}
              placeholder={r.schema ? `Incolla qui la risposta di Claude (inizia con ${r.codice} o con { )` : 'Incolla qui la risposta di Claude'}
              value={risposta}
              onChange={(e) => {
                setRisposta(e.target.value)
                setTrovata(null)
                setErrore('')
              }}
              aria-label="Risposta di Claude"
            />
            <div className="riga-editor">
              <button type="button" className="bottone" onClick={() => void guardaAppunti(true)}>
                <Icona nome="copia" dimensione={16} />
                {risposta ? 'Incolla il resto' : grandeIncolla ? 'Incolla' : 'Incolla la risposta'}
              </button>
              <button type="button" className="bottone bottone-primario" onClick={() => usaTesto(risposta)}>
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
          <a className="link" href={CLAUDE_AI} target="_blank" rel="noreferrer">
            Apri Claude.ai senza copiare
          </a>
          <button type="button" className="bottone bottone-vuoto" onClick={r.annulla}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
