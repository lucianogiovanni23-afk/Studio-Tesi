import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { rifinisciParagrafo } from '../agents/pipeline'
import { useStudioStore } from '../store'
import type { Citazione, Opzione, Paragrafo, Riferimento } from '../types'
import { PEGGIORE, semaforo, type Semaforo } from './citazioniUi'

const TESTUALE: Record<string, string> = {
  verificato: 'estratto trovato alla lettera nella fonte',
  approssimato: 'estratto quasi letterale (piccole differenze)',
  non_trovato: 'estratto NON trovato nel testo della fonte',
  rif_sconosciuto: 'riferimento inesistente',
}

const GIUDIZIO: Record<string, string> = {
  supportata: 'il Controllore conferma che sostiene l’affermazione',
  parziale: 'per il Controllore la sostiene solo in parte',
  non_supportata: 'per il Controllore NON sostiene l’affermazione',
}

const SUGGERIMENTI_RIFINITURA = [
  'Più sintetico',
  'Registro più formale',
  'Collega meglio ai concetti del corso',
  'Aggiungi il confronto fra stagioni',
  'Rendi più chiaro il passaggio logico',
]

const MARCATORE = /\s*\[((?:F|C)\d+)\]/gi

function Marcatore({
  rif,
  citazioni,
  aperto,
  onApri,
}: {
  rif: string
  citazioni: Citazione[]
  aperto: boolean
  onApri: () => void
}) {
  const stato = citazioni.reduce<Semaforo>(
    (peggio, c) => (PEGGIORE[semaforo(c)] > PEGGIORE[peggio] ? semaforo(c) : peggio),
    citazioni.length === 0 ? 'errore' : 'ok',
  )
  return (
    <sup>
      <button
        type="button"
        className={`marcatore marcatore-${stato} ${aperto ? 'marcatore-aperto' : ''}`}
        onClick={onApri}
        aria-expanded={aperto}
        title={citazioni.length === 0 ? 'Marcatore senza citazione' : 'Mostra la citazione'}
      >
        {rif}
      </button>
    </sup>
  )
}

function DettaglioCitazioni({
  rif,
  citazioni,
  riferimento,
}: {
  rif: string
  citazioni: Citazione[]
  riferimento: Riferimento | undefined
}) {
  return (
    <div className="citazioni-dettaglio">
      <p className="citazioni-fonte">
        <strong>[{rif}]</strong> {riferimento ? riferimento.titolo : 'riferimento inesistente'}
        {riferimento &&
          (riferimento.tipo === 'fonte' ? (
            <>
              {' '}
              —{' '}
              <a href={riferimento.collocazione} target="_blank" rel="noreferrer noopener">
                apri la fonte
              </a>
            </>
          ) : (
            <> — {riferimento.collocazione}</>
          ))}
      </p>
      {citazioni.length === 0 && <p className="fonte-testo">Il marcatore non ha una citazione corrispondente.</p>}
      {citazioni.map((c, i) => {
        const s = semaforo(c)
        return (
          <div key={i} className={`citazione citazione-${s}`}>
            <p className="citazione-estratto">“{c.estratto}”</p>
            <p className="fonte-testo">Sostiene: {c.affermazione}</p>
            <p className="citazione-esito">
              {TESTUALE[c.verifica?.testuale ?? ''] ?? 'non verificata'}
              {c.verifica?.giudizio && <> · {GIUDIZIO[c.verifica.giudizio]}</>}
            </p>
            {c.verifica?.nota && <p className="citazione-nota">{c.verifica.nota}</p>}
          </div>
        )
      })}
    </div>
  )
}

/** Testo del paragrafo con i marcatori trasformati in apici cliccabili. */
function TestoConMarcatori({
  paragrafo,
  aperto,
  onApri,
}: {
  paragrafo: Paragrafo
  aperto: string | null
  onApri: (rif: string) => void
}) {
  const parti: ReactNode[] = []
  let ultimo = 0
  let chiave = 0
  for (const m of paragrafo.testo.matchAll(MARCATORE)) {
    const rif = m[1].toUpperCase()
    parti.push(<Fragment key={chiave++}>{paragrafo.testo.slice(ultimo, m.index)}</Fragment>)
    parti.push(
      <Marcatore
        key={chiave++}
        rif={rif}
        citazioni={paragrafo.citazioni.filter((c) => c.rif === rif)}
        aperto={aperto === rif}
        onApri={() => onApri(rif)}
      />,
    )
    ultimo = (m.index ?? 0) + m[0].length
  }
  parti.push(<Fragment key={chiave++}>{paragrafo.testo.slice(ultimo)}</Fragment>)
  return <p className="capitolo-testo">{parti}</p>
}

function BloccoParagrafo({
  opzione,
  indice,
  paragrafo,
  riferimenti,
  modificabile,
}: {
  opzione: Opzione
  indice: number
  paragrafo: Paragrafo
  riferimenti: Map<string, Riferimento>
  modificabile: boolean
}) {
  const [aperto, setAperto] = useState<string | null>(null)
  const [richiedi, setRichiedi] = useState(false)
  const [richiesta, setRichiesta] = useState('')
  const annulla = useStudioStore((s) => s.annullaParagrafo)
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)

  const inRifinitura = opzione.rifinisce === indice
  const altraRifinitura = opzione.rifinisce !== null && !inRifinitura
  const versioni = opzione.storico[indice]?.length ?? 0

  // Citazioni presenti nell'elenco ma senza marcatore nel testo: si mostrano comunque.
  const senzaMarcatore = useMemo(() => {
    const nelTesto = new Set([...paragrafo.testo.matchAll(MARCATORE)].map((m) => m[1].toUpperCase()))
    return [...new Set(paragrafo.citazioni.map((c) => c.rif))].filter((r) => !nelTesto.has(r))
  }, [paragrafo])

  const invia = () => {
    const testo = richiesta.trim()
    if (!testo) return
    setRichiedi(false)
    setRichiesta('')
    void rifinisciParagrafo(opzione.impianto, indice, testo)
  }

  return (
    <section className={`capitolo-paragrafo ${inRifinitura ? 'in-rifinitura' : ''}`}>
      <h4 className="capitolo-sottotitolo">
        <span className="numero-paragrafo">§{indice + 1}</span> {paragrafo.titoletto}
      </h4>
      <TestoConMarcatori
        paragrafo={paragrafo}
        aperto={aperto}
        onApri={(r) => setAperto((v) => (v === r ? null : r))}
      />
      {senzaMarcatore.length > 0 && (
        <p className="nota">
          Citazioni senza marcatore nel testo:{' '}
          {senzaMarcatore.map((r) => (
            <button key={r} type="button" className="bottone-collegamento" onClick={() => setAperto(r)}>
              [{r}]
            </button>
          ))}
        </p>
      )}
      {aperto && (
        <DettaglioCitazioni
          rif={aperto}
          citazioni={paragrafo.citazioni.filter((c) => c.rif === aperto)}
          riferimento={riferimenti.get(aperto)}
        />
      )}

      {modificabile && (
        <div className="azioni azioni-paragrafo">
          {inRifinitura ? (
            <span className="nota in-corso">Lo Scrittore sta riscrivendo questo paragrafo…</span>
          ) : (
            <>
              <button
                type="button"
                className="bottone bottone-minuscolo"
                onClick={() => setRichiedi((v) => !v)}
                disabled={inEsecuzione || altraRifinitura}
              >
                {richiedi ? 'Chiudi' : 'Rifinisci'}
              </button>
              {versioni > 0 && (
                <button
                  type="button"
                  className="bottone bottone-minuscolo"
                  onClick={() => annulla(opzione.impianto, indice)}
                  disabled={altraRifinitura}
                  title="Torna alla versione precedente di questo paragrafo"
                >
                  Annulla rifinitura ({versioni})
                </button>
              )}
            </>
          )}
        </div>
      )}

      {richiedi && !inRifinitura && (
        <div className="rifinitura">
          <div className="suggerimenti">
            {SUGGERIMENTI_RIFINITURA.map((s) => (
              <button key={s} type="button" className="gettone" onClick={() => setRichiesta(s)}>
                {s}
              </button>
            ))}
          </div>
          <textarea
            className="campo area"
            rows={2}
            value={richiesta}
            onChange={(e) => setRichiesta(e.target.value)}
            placeholder="Cosa vuoi cambiare in questo paragrafo?"
            aria-label={`Richiesta di rifinitura del paragrafo ${indice + 1}`}
          />
          <div className="azioni">
            <button
              type="button"
              className="bottone bottone-primario bottone-piccolo"
              onClick={invia}
              disabled={!richiesta.trim()}
            >
              Riscrivi solo questo paragrafo
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** Il capitolo di un'opzione, condiviso fra il pannello e la modalità carta. */
export function ChapterView({ opzione, modificabile = true }: { opzione: Opzione; modificabile?: boolean }) {
  const prefisso = useStudioStore((s) => s.prefissoScrittore)
  const riferimenti = useMemo(
    () => new Map((prefisso?.riferimenti ?? []).map((r) => [r.etichetta, r])),
    [prefisso],
  )

  const usati = useMemo(() => {
    const insieme = new Set<string>()
    for (const p of opzione.risultato?.paragrafi ?? []) for (const c of p.citazioni) insieme.add(c.rif)
    return [...insieme].sort((a, b) => a.localeCompare(b, 'it', { numeric: true }))
  }, [opzione])

  if (!opzione.risultato) return null

  return (
    <article className="capitolo">
      <h3 className="capitolo-titolo">{opzione.risultato.titolo}</h3>
      {opzione.risultato.paragrafi.map((p, i) => (
        <BloccoParagrafo
          key={i}
          opzione={opzione}
          indice={i}
          paragrafo={p}
          riferimenti={riferimenti}
          modificabile={modificabile}
        />
      ))}

      {usati.length > 0 && (
        <section className="riferimenti">
          <h4 className="capitolo-sottotitolo">Riferimenti</h4>
          <ol className="elenco-riferimenti">
            {usati.map((r) => {
              const rif = riferimenti.get(r)
              return (
                <li key={r}>
                  <span className="rif-etichetta">{r}</span>{' '}
                  {rif ? (
                    rif.tipo === 'fonte' ? (
                      <>
                        {rif.titolo} —{' '}
                        <a href={rif.collocazione} target="_blank" rel="noreferrer noopener">
                          {rif.collocazione}
                        </a>
                      </>
                    ) : (
                      <>Materiale del corso: {rif.collocazione}</>
                    )
                  ) : (
                    <em>riferimento inesistente</em>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </article>
  )
}

/** Riepilogo delle verifiche sulle citazioni di un'opzione. */
export function RiepilogoCitazioni({ opzione }: { opzione: Opzione }) {
  const conteggi = useMemo(() => {
    const c = { ok: 0, avviso: 0, errore: 0 }
    for (const p of opzione.risultato?.paragrafi ?? []) for (const x of p.citazioni) c[semaforo(x)] += 1
    return c
  }, [opzione])
  const totale = conteggi.ok + conteggi.avviso + conteggi.errore
  if (totale === 0) return <span className="contatore">nessuna citazione</span>
  return (
    <span className="riepilogo-citazioni" title="Verde: verificata · Ambra: parziale o quasi letterale · Rosso: non ritrovata o non supportata">
      <span className="punto-ok">{conteggi.ok}</span>
      <span className="punto-avviso">{conteggi.avviso}</span>
      <span className="punto-errore">{conteggi.errore}</span>
      <span className="contatore">citazioni</span>
    </span>
  )
}
