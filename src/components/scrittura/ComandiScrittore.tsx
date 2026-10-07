import { costoStimato, modalitaGratuita } from '../../agents/api'
import { useState, type ReactNode } from 'react'
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
import { analizzaStile } from '../../domain/stileTesto'
import { useStudio } from '../../store'
import type { Capitolo, Citazione, Sezione } from '../../types'
import { Conferma } from '../Conferma'
import { TestoCitato } from '../TestoCitato'
import { Icona } from '../../ui/Icona'
import { MenuTendina } from '../../ui/MenuTendina'
import { scegliVoce, usePaginaScrittura, type VoceScrittore } from './statoPagina'

const NOME: Record<Comando, string> = {
  scaletta: 'Proponi una scaletta',
  bozza: 'Proponi una bozza',
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
      {n.rosse > 0 && <span className="esito esito-rosso">{n.rosse} non trovate</span>}
    </span>
  )
}

/** Proposta dello Scrittore: si accetta (il testo attuale resta fra le versioni) o si scarta. */
function StileProposta({ testo }: { testo: string }) {
  const glossario = useStudio((s) => s.progetto.glossario)
  const segnalazioni = analizzaStile(testo, glossario)
  const lessico = segnalazioni.filter((s) => s.tipo === 'lessico')
  const ia = segnalazioni.filter((s) => s.tipo !== 'lessico')
  if (segnalazioni.length === 0) return <span className="esito esito-verde">niente frasi da IA</span>
  return (
    <span className="bollini" title={segnalazioni.map((s) => `«${s.testo}»: ${s.spiegazione}`).join('\n')}>
      {ia.length > 0 && <span className="esito esito-ambra">{ia.length} frasi da IA: {[...new Set(ia.map((s) => s.testo))].slice(0, 3).join(', ')}</span>}
      {lessico.length > 0 && <span className="esito esito-ambra">parole del corso: {lessico.map((s) => s.spiegazione).join('; ')}</span>}
    </span>
  )
}

export function PannelloProposta({ sez }: { sez: Sezione }) {
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
          <div className="stile-proposta">
            <StileProposta testo={o.paragrafi.join('\n\n')} />
          </div>
          <TestoCitato testo={o.paragrafi.join('\n\n')} citazioni={o.citazioni} />
          <Conferma
            classe="bottone bottone-primario"
            etichetta={proposta.opzioni.length > 1 ? 'Usa questa' : 'Usa la proposta'}
            domanda={sostituisce ? 'Il testo di adesso resta fra le versioni. Procedo?' : 'Metto la proposta nel testo?'}
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

const ICONA: Record<VoceScrittore, string> = {
  bozza: 'matita',
  riscrivi: 'aggiorna',
  alternative: 'copia',
  corso: 'libro',
  revisore: 'lente',
}

/**
 * Barra di lavoro sopra il foglio: il menu "Chiedi allo scrittore" (una voce
 * alla volta, con la conferma e il costo subito sotto la barra) e, a destra,
 * gli strumenti passati da fuori (fonti e appunti, concentrazione, carta).
 */
export function ComandiScrittore({ cap, sez, paragrafo, strumenti }: { cap: Capitolo; sez: Sezione; paragrafo: number | null; strumenti?: ReactNode }) {
  const inCorso = useScrittore((s) => s.inCorso)
  const richiesta = useScrittore((s) => s.richiesta)
  const setRichiesta = (r: string) => useScrittore.setState({ richiesta: r })
  const scelta = usePaginaScrittura((s) => s.scelta)
  const [errore, setErrore] = useState<string | null>(null)
  const [controllo, setControllo] = useState<EsitoControllo | null>(null)
  const [giudizioInCorso, setGiudizioInCorso] = useState(false)
  const [sezioneMostrata, setSezioneMostrata] = useState(sez.id)
  if (sezioneMostrata !== sez.id) {
    // Cambiando sezione si chiude la conferma lasciata a metà.
    setSezioneMostrata(sez.id)
    setControllo(null)
    setErrore(null)
    scegliVoce(null)
  }
  const pars = paragrafi(sez.testo)
  const scelto = paragrafo !== null && paragrafo < pars.length ? paragrafo : null
  const occupato = inCorso !== null

  const esegui = async (fn: () => Promise<void>) => {
    setErrore(null)
    try {
      await fn()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Qualcosa è andato storto.')
    }
  }

  const prontaBozza = sez.fontiConfermate && sez.scalettaApprovata
  const prontoParagrafo = sez.fontiConfermate && scelto !== null
  const controllabile = sez.citazioni.length > 0 || /\[[FC]\d+\]/.test(sez.testo)
  const stimaG = sez.citazioni.length ? stimaGiudizio(sez) : null

  const chiediRevisore = async () => {
    setGiudizioInCorso(true)
    await esegui(() => giudicaCitazioni(cap.id, sez.id))
    setGiudizioInCorso(false)
    setControllo(controllaInCodice(cap.id, sez.id))
  }

  /** Per ogni voce: se si può usare adesso, perché no, la domanda di conferma e l'azione. */
  const voce = (v: VoceScrittore): { ok: boolean; motivo: string; domanda: string; azione: () => Promise<void> } => {
    if (v === 'revisore') {
      return {
        ok: sez.citazioni.length > 0 && !giudizioInCorso,
        motivo: 'Prima servono delle citazioni nel testo.',
        domanda: stimaG ? `Il revisore controlla se ogni pezzo citato dice davvero quello che scrivi. ${costoStimato(stimaG)}. Procedo?` : 'Procedo?',
        azione: chiediRevisore,
      }
    }
    const ok = !occupato && (v === 'bozza' ? prontaBozza : prontoParagrafo)
    const motivo = v === 'bozza' ? 'Prima approva fonti e scaletta.' : sez.fontiConfermate ? 'Tocca un paragrafo del testo.' : 'Prima approva le fonti.'
    const stima = ok ? stimaComando(cap, sez, v) : null
    const domanda = stima
      ? `${costoStimato(stima)}${stima.cache && !modalitaGratuita() ? ', in parte già in memoria (costa meno)' : ''}. Procedo?`
      : motivo
    const azione =
      v === 'bozza'
        ? () => proponiBozza(cap.id, sez.id)
        : v === 'riscrivi'
          ? () => riscriviParagrafo(cap.id, sez.id, scelto!, richiesta)
          : v === 'alternative'
            ? () => dueAlternative(cap.id, sez.id, scelto!)
            : () => collegaAlCorso(cap.id, sez.id, scelto!)
    return { ok, motivo, domanda, azione }
  }

  const voci = (['bozza', 'riscrivi', 'alternative', 'corso'] as const).map((v) => ({
    id: v,
    etichetta: NOME[v],
    icona: ICONA[v],
    disabilitata: !voce(v).ok,
    onClick: () => scegliVoce(v),
  }))

  const attesa = scelta ? voce(scelta) : null
  const mostraRichiesta = sez.fontiConfermate && (scelta === 'riscrivi' || richiesta.trim().length > 0)

  return (
    <div className="comandi-scrittore-box">
      <div className="sc-barra" role="toolbar" aria-label="Comandi dello Scrittore">
        <MenuTendina
          etichetta="Chiedi allo scrittore"
          icona="bacchetta"
          voci={[
            ...voci,
            {
              id: 'controlla',
              etichetta: 'Controlla le citazioni',
              icona: 'spunta',
              disabilitata: !controllabile,
              onClick: () => {
                scegliVoce(null)
                setControllo(controllaInCodice(cap.id, sez.id))
              },
            },
            { id: 'revisore', etichetta: 'Chiedi al revisore…', icona: ICONA.revisore, disabilitata: !voce('revisore').ok, onClick: () => scegliVoce('revisore') },
          ]}
        />
        {sez.fontiConfermate && scelto !== null && (
          <span className="sc-paragrafo-chip" title={pars[scelto].slice(0, 200)}>
            <Icona nome="parola" dimensione={15} /> § {scelto + 1}
          </span>
        )}
        <span className="sc-barra-spazio" />
        {strumenti}
      </div>

      {scelta && attesa && (
        <div className="sc-conferma" role="group" aria-label={scelta === 'revisore' ? 'Chiedi al revisore' : NOME[scelta]}>
          <span className="sc-conferma-icona">
            <Icona nome={ICONA[scelta]} />
          </span>
          <div className="sc-conferma-corpo">
            <strong>{scelta === 'revisore' ? 'Chiedi al revisore' : NOME[scelta]}</strong>
            <span className="conferma-domanda">{attesa.ok ? attesa.domanda : attesa.motivo}</span>
          </div>
          <div className="sc-conferma-bottoni">
            {attesa.ok && (
              <button
                type="button"
                className="bottone bottone-primario"
                onClick={() => {
                  scegliVoce(null)
                  void esegui(attesa.azione)
                }}
              >
                Procedi
              </button>
            )}
            <button type="button" className="bottone bottone-vuoto" onClick={() => scegliVoce(null)}>
              Annulla
            </button>
          </div>
          {mostraRichiesta && (
            <label className="sc-richiesta">
              <span className="etichetta">Come lo vuoi? (se vuoi)</span>
              <input
                disabled={scelto === null}
                className="campo"
                placeholder="Per esempio «più corto» o «separa raccolta e frantoio»"
                value={richiesta}
                onChange={(e) => setRichiesta(e.target.value)}
                aria-label="Indicazione per la riscrittura"
              />
            </label>
          )}
        </div>
      )}
      {!scelta && mostraRichiesta && (
        <label className="sc-richiesta sc-richiesta-sola">
          <span className="etichetta">Indicazione per «Riscrivi questo paragrafo»</span>
          <input
            disabled={scelto === null}
            className="campo"
            placeholder="Per esempio «più corto» o «separa raccolta e frantoio»"
            value={richiesta}
            onChange={(e) => setRichiesta(e.target.value)}
            aria-label="Indicazione per la riscrittura"
          />
        </label>
      )}

      {!sez.fontiConfermate ? (
        <p className="nota sc-suggerimento">
          <Icona nome="info" dimensione={15} /> I comandi dello Scrittore funzionano dopo che approvi le fonti. Per la bozza serve anche la scaletta.
        </p>
      ) : (
        <p className="nota sc-suggerimento paragrafo-scelto">
          <Icona nome="info" dimensione={15} />
          {scelto !== null ? (
            <span>
              Paragrafo scelto: <strong>{scelto + 1}</strong> — «{pars[scelto].slice(0, 90)}
              {pars[scelto].length > 90 ? '…' : ''}»
            </span>
          ) : (
            <span>Tocca un paragrafo per riscriverlo, avere due alternative o collegarlo al corso.</span>
          )}
        </p>
      )}

      {inCorso && inCorso.sezioneId === sez.id && inCorso.comando !== 'scaletta' && (
        <p className="in-corso sc-in-corso">Lo Scrittore ci sta lavorando: {NOME[inCorso.comando].toLowerCase()}…</p>
      )}
      {giudizioInCorso && <p className="in-corso sc-in-corso">Il revisore sta controllando le citazioni…</p>}
      {errore && <p className="allerta allerta-errore">{errore}</p>}

      {controllo && (
        <div className="esito-controllo sc-controllo" role="status">
          <p>
            <strong>Controllo veloce:</strong> {controllo.citazioni} citazioni — {controllo.verdi} verdi, {controllo.ambra} ambra,{' '}
            {controllo.rosse} rosse.
            {controllo.senzaCitazione.length > 0 && (
              <span className="testo-errore"> Rimandi senza citazione: {controllo.senzaCitazione.join(', ')}.</span>
            )}
          </p>
          <div className="riga-editor">
            {sez.citazioni.length > 0 && !giudizioInCorso && (
              <Conferma
                classe="bottone bottone-piccolo bottone-secondario"
                etichetta="Chiedi al revisore"
                domanda={stimaG ? `Il revisore controlla se ogni pezzo citato dice davvero quello che scrivi. ${costoStimato(stimaG)}. Procedo?` : 'Procedo?'}
                conferma="Procedi"
                onConferma={() => void chiediRevisore()}
              />
            )}
            <button type="button" className="bottone bottone-piccolo bottone-vuoto" onClick={() => setControllo(null)}>
              Chiudi
            </button>
          </div>
        </div>
      )}

      <PannelloProposta sez={sez} />
    </div>
  )
}
