import { useState } from 'react'
import { formattaDollari } from '../../agents/costs'
import { controllaInCodice, giudicaCitazioni, stimaGiudizio, type EsitoControllo } from '../../agents/revisoreCitazioni'
import {
  accettaProposta,
  collegaAlCorso,
  dueAlternative,
  proponiBozza,
  riscriviParagrafo,
  scartaProposta,
  stimaComando,
  useScrittore,
  type Comando,
} from '../../agents/scrittore'
import { coloreCitazione, paragrafi } from '../../domain/citazioniTesto'
import { useStudio } from '../../store'
import type { Capitolo, Citazione, Sezione } from '../../types'
import { Conferma } from '../Conferma'
import { TestoCitato } from '../TestoCitato'

const NOME: Record<Comando, string> = {
  scaletta: 'Proponi una scaletta',
  bozza: 'Proponi una bozza della sezione',
  riscrivi: 'Riscrivi questo paragrafo',
  alternative: 'Dammi due alternative',
  corso: 'Collega al corso',
}

function conteggio(citazioni: Citazione[]) {
  const colori = citazioni.map(coloreCitazione)
  return {
    verdi: colori.filter((c) => c === 'verde').length,
    ambra: colori.filter((c) => c === 'ambra').length,
    rosse: colori.filter((c) => c === 'rosso').length,
  }
}

function Bollini({ citazioni }: { citazioni: Citazione[] }) {
  const n = conteggio(citazioni)
  return (
    <span className="bollini">
      <span className="esito esito-verde">{n.verdi} verificate</span>
      {n.ambra > 0 && <span className="esito esito-ambra">{n.ambra} da controllare</span>}
      {n.rosse > 0 && <span className="esito esito-rosso">{n.rosse} non ritrovate</span>}
    </span>
  )
}

/** Proposta dello Scrittore: si accetta (il testo attuale resta fra le versioni) o si scarta. */
function PannelloProposta({ sez }: { sez: Sezione }) {
  const proposta = useScrittore((s) => s.proposte[sez.id])
  if (!proposta) return null
  const sostituisce = proposta.indice === null ? sez.testo.trim().length > 0 : true
  return (
    <section className="proposta" aria-label="Proposta dello Scrittore">
      <h3>
        {proposta.indice === null ? 'Bozza proposta' : `Proposta per il paragrafo ${proposta.indice + 1}`}
      </h3>
      {proposta.indice !== null && (
        <details>
          <summary>Paragrafo attuale</summary>
          <TestoCitato testo={paragrafi(sez.testo)[proposta.indice] ?? ''} citazioni={sez.citazioni} classe="testo-originale" />
        </details>
      )}
      {proposta.opzioni.map((o, i) => (
        <div key={i} className="opzione">
          <div className="opzione-testa">
            <strong>{o.etichetta}</strong>
            <Bollini citazioni={o.citazioni} />
          </div>
          <TestoCitato testo={o.paragrafi.join('\n\n')} citazioni={o.citazioni} />
          <Conferma
            classe="bottone bottone-primario"
            etichetta={proposta.opzioni.length > 1 ? 'Usa questa' : 'Usa la proposta'}
            domanda={sostituisce ? 'Il testo attuale resterà fra le versioni. Procedo?' : 'Inserisco la proposta nel testo?'}
            conferma="Sì, usala"
            onConferma={() => accettaProposta(sez.id, i)}
          />
        </div>
      ))}
      <button type="button" className="bottone bottone-vuoto" onClick={() => scartaProposta(sez.id)}>
        Scarta la proposta
      </button>
    </section>
  )
}

export function ComandiScrittore({ cap, sez, paragrafo }: { cap: Capitolo; sez: Sezione; paragrafo: number | null }) {
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const inCorso = useScrittore((s) => s.inCorso)
  const [richiesta, setRichiesta] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [controllo, setControllo] = useState<EsitoControllo | null>(null)
  const [giudizioInCorso, setGiudizioInCorso] = useState(false)
  const pars = paragrafi(sez.testo)
  const scelto = paragrafo !== null && paragrafo < pars.length ? paragrafo : null

  const esegui = async (fn: () => Promise<void>) => {
    setErrore(null)
    try {
      await fn()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore.')
    }
  }

  const comando = (c: Exclude<Comando, 'scaletta'>, abilitato: boolean, motivo: string, azione: () => Promise<void>) => {
    const stima = haChiave && abilitato ? stimaComando(cap, sez, c) : null
    return (
      <Conferma
        key={c}
        classe="bottone bottone-piccolo"
        etichetta={NOME[c]}
        disabilitato={!haChiave || !abilitato || inCorso !== null}
        domanda={
          stima
            ? `${NOME[c]}: costo stimato ${formattaDollari(stima.minimo)} – ${formattaDollari(stima.massimo)}${stima.cache ? ', materiale già in cache' : ''}. Procedo?`
            : motivo
        }
        conferma="Procedi"
        onConferma={() => void esegui(azione)}
      />
    )
  }

  const prontaBozza = sez.fontiConfermate && sez.scalettaApprovata
  const prontoParagrafo = sez.fontiConfermate && scelto !== null
  const stimaG = sez.citazioni.length ? stimaGiudizio(sez) : null

  return (
    <div className="comandi-scrittore-box">
      <div className="comandi-scrittore" role="toolbar" aria-label="Comandi dello Scrittore">
        {comando('bozza', prontaBozza, 'Prima approva fonti e scaletta.', () => proponiBozza(cap.id, sez.id))}
        {comando('riscrivi', prontoParagrafo, 'Tocca un paragrafo del testo.', () => riscriviParagrafo(cap.id, sez.id, scelto!, richiesta))}
        {comando('alternative', prontoParagrafo, 'Tocca un paragrafo del testo.', () => dueAlternative(cap.id, sez.id, scelto!))}
        {comando('corso', prontoParagrafo, 'Tocca un paragrafo del testo.', () => collegaAlCorso(cap.id, sez.id, scelto!))}
        <button
          type="button"
          className="bottone bottone-piccolo"
          disabled={sez.citazioni.length === 0 && !/\[[FC]\d+\]/.test(sez.testo)}
          onClick={() => setControllo(controllaInCodice(cap.id, sez.id))}
        >
          Verifica le citazioni
        </button>
      </div>

      {!haChiave && <p className="nota">Per i comandi dello Scrittore serve la chiave API (Impostazioni).</p>}
      {!sez.fontiConfermate && <p className="nota">I comandi si attivano dopo l'approvazione delle fonti della sezione; la bozza anche dopo la scaletta.</p>}
      {sez.fontiConfermate && (
        <p className="nota paragrafo-scelto">
          {scelto !== null ? (
            <>
              Paragrafo selezionato: <strong>{scelto + 1}</strong> — «{pars[scelto].slice(0, 90)}
              {pars[scelto].length > 90 ? '…' : ''}»
            </>
          ) : (
            'Tocca un paragrafo del testo per riscriverlo, avere due alternative o collegarlo al corso.'
          )}
        </p>
      )}
      {sez.fontiConfermate && (
        <input
          disabled={scelto === null}
          className="campo"
          placeholder="Indicazione per la riscrittura (facoltativa): per esempio «più sintetico», «separa raccolta e frantoio»"
          value={richiesta}
          onChange={(e) => setRichiesta(e.target.value)}
          aria-label="Indicazione per la riscrittura"
        />
      )}
      {inCorso && inCorso.sezioneId === sez.id && inCorso.comando !== 'scaletta' && (
        <p className="in-corso">Lo Scrittore sta lavorando: {NOME[inCorso.comando].toLowerCase()}…</p>
      )}
      {errore && <p className="allerta allerta-errore">{errore}</p>}

      {controllo && (
        <div className="esito-controllo" role="status">
          <p>
            <strong>Controllo in codice:</strong> {controllo.citazioni} citazioni — {controllo.verdi} verdi, {controllo.ambra} ambra,{' '}
            {controllo.rosse} rosse.
            {controllo.senzaCitazione.length > 0 && (
              <span className="testo-errore"> Marcatori senza citazione: {controllo.senzaCitazione.join(', ')}.</span>
            )}
          </p>
          {sez.citazioni.length > 0 && (
            <div className="riga-editor">
              {giudizioInCorso ? (
                <span className="in-corso">Il Revisore sta giudicando le citazioni…</span>
              ) : (
                <Conferma
                  classe="bottone bottone-piccolo"
                  etichetta="Chiedi il giudizio del Revisore"
                  disabilitato={!haChiave}
                  domanda={stimaG ? `Il Revisore giudica se ogni estratto sostiene davvero l'affermazione. Costo stimato ${formattaDollari(stimaG.minimo)} – ${formattaDollari(stimaG.massimo)}. Procedo?` : 'Procedo?'}
                  conferma="Procedi"
                  onConferma={async () => {
                    setGiudizioInCorso(true)
                    await esegui(() => giudicaCitazioni(cap.id, sez.id))
                    setGiudizioInCorso(false)
                    setControllo(controllaInCodice(cap.id, sez.id))
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      <PannelloProposta sez={sez} />
    </div>
  )
}
