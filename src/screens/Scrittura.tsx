import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENTE } from '../agents/agenti'
import { Conferma } from '../components/Conferma'
import { TestoCitato } from '../components/TestoCitato'
import { ComandiScrittore } from '../components/scrittura/ComandiScrittore'
import { PassoFonti } from '../components/scrittura/PassoFonti'
import { PassoScaletta } from '../components/scrittura/PassoScaletta'
import { DettaglioStile } from '../components/scrittura/PannelloStile'
import { etichettaStile, useStile } from '../components/scrittura/stile'
import { StrumentiSezione } from '../components/scrittura/StrumentiSezione'
import { apriStrumenti, usePaginaScrittura } from '../components/scrittura/statoPagina'
import { esaminaCitazioni } from '../agents/citations'
import { selezionaParagrafo, useScrittore } from '../agents/scrittore'
import { esportaTesto, paragrafoAlCursore } from '../domain/citazioniTesto'
import { ETICHETTA_STATO } from '../domain/etichette'
import { useLargo } from '../hooks/useLayoutMode'
import { contaParoleTesto, useStudio } from '../store'
import type { Autore, Capitolo, Sezione } from '../types'
import { Cassetto } from '../ui/Cassetto'
import { Icona } from '../ui/Icona'
import '../styles/scrittura.css'

function nomeAutore(a: Autore): string {
  if (a === 'studente') return 'tu'
  if (a === 'sistema') return 'automatico'
  return AGENTE[a].nome
}

function dataBreve(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

type StatoSez = 'vuota' | 'pronta' | 'scritta'

function statoSezione(s: Sezione): StatoSez {
  if (s.testo.trim()) return 'scritta'
  if (s.fontiConfermate && s.scalettaApprovata) return 'pronta'
  return 'vuota'
}

const NOME_STATO_SEZ: Record<StatoSez, string> = { vuota: 'da cominciare', pronta: 'fonti e scaletta pronte', scritta: 'con del testo' }

/** Colonna sinistra: indice navigabile, un gruppo per capitolo. */
function IndiceLaterale({ capitoli, capId, sezId }: { capitoli: Capitolo[]; capId: string | null; sezId: string | null }) {
  const apri = useStudio((s) => s.apriSezione)
  const totale = capitoli.reduce((t, c) => t + c.sezioni.reduce((u, s) => u + contaParoleTesto(s.testo), 0), 0)
  return (
    <nav className="indice-laterale sc-indice" aria-label="Indice">
      <div className="sc-indice-testa">
        <span>
          <Icona nome="elenco" /> Indice
        </span>
        <small>{totale.toLocaleString('it-IT')} parole</small>
      </div>
      {capitoli.map((c, i) => {
        const parole = c.sezioni.reduce((u, s) => u + contaParoleTesto(s.testo), 0)
        return (
          <div key={c.id} className={`il-capitolo sc-cap stato-cap-${c.stato} ${c.id === capId ? 'sc-cap-aperto' : ''}`}>
            <p className="il-titolo sc-cap-titolo">
              <span className="sc-cap-numero" title={ETICHETTA_STATO[c.stato]}>
                {i + 1}
              </span>
              <span className="sc-cap-nome">{c.titolo}</span>
              {parole > 0 && <small className="sc-cap-parole">{parole.toLocaleString('it-IT')}</small>}
            </p>
            <ul>
              {c.sezioni.map((s, j) => {
                const stato = statoSezione(s)
                const attiva = c.id === capId && s.id === sezId
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`il-sezione sc-sez ${attiva ? 'il-attiva' : ''}`}
                      aria-current={attiva ? 'page' : undefined}
                      onClick={() => apri(c.id, s.id)}
                    >
                      <span className={`sc-punto sc-punto-${stato}`} title={NOME_STATO_SEZ[stato]} aria-hidden />
                      <span className="sc-sez-numero">
                        {i + 1}.{j + 1}
                      </span>
                      <span className="sc-sez-titolo">{s.titolo}</span>
                      {s.testo.trim() ? <small>{contaParoleTesto(s.testo)} parole</small> : <small>vuota</small>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      <p className="sc-legenda" aria-hidden>
        <span>
          <span className="sc-punto sc-punto-vuota" /> da fare
        </span>
        <span>
          <span className="sc-punto sc-punto-pronta" /> pronta
        </span>
        <span>
          <span className="sc-punto sc-punto-scritta" /> scritta
        </span>
      </p>
    </nav>
  )
}

/** Su telefono e tablet l'indice diventa un menu "Capitoli". */
function SelettoreCapitoli({ capitoli, cap, sez }: { capitoli: Capitolo[]; cap: Capitolo; sez: Sezione | undefined }) {
  const apri = useStudio((s) => s.apriSezione)
  return (
    <label className="selettore-sezione sc-capitoli">
      <span className="sc-capitoli-etichetta">
        <Icona nome="elenco" /> Capitoli
      </span>
      <select
        className="campo"
        aria-label="Sezione"
        value={`${cap.id}|${sez?.id ?? ''}`}
        onChange={(e) => {
          const [c, s] = e.target.value.split('|')
          apri(c, s || null)
        }}
      >
        {capitoli.map((c, i) => (
          <optgroup key={c.id} label={`${i + 1}. ${c.titolo}`}>
            {c.sezioni.map((s, j) => (
              <option key={s.id} value={`${c.id}|${s.id}`}>
                {i + 1}.{j + 1} {s.titolo}
                {s.testo.trim() ? ` · ${contaParoleTesto(s.testo)} parole` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Icona nome="giu" className="sc-capitoli-freccia" />
    </label>
  )
}

/** Testo della sezione: modificabile direttamente; si salva nello store con un breve ritardo. */
function Editor({ cap, sez, onCursore }: { cap: Capitolo; sez: Sezione; onCursore: (paragrafo: number) => void }) {
  const setTesto = useStudio((s) => s.setTestoSezione)
  const [testo, setTestoLocale] = useState(sez.testo)
  const [sezioneMostrata, setSezioneMostrata] = useState(sez.id)
  const timer = useRef<number | null>(null)
  const inSospeso = useRef<{ cap: string; sez: string; testo: string } | null>(null)

  // Cambio di sezione o ripristino di una versione: si riparte dal testo salvato.
  if (sezioneMostrata !== sez.id) {
    setSezioneMostrata(sez.id)
    setTestoLocale(sez.testo)
  }
  useEffect(() => {
    if (!inSospeso.current) setTestoLocale(sez.testo)
  }, [sez.testo])

  const scrivi = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    const p = inSospeso.current
    inSospeso.current = null
    if (p) setTesto(p.cap, p.sez, p.testo)
  }

  // Alla chiusura o al cambio di sezione il testo in sospeso non va perso.
  useEffect(() => () => scrivi(), [sez.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <textarea
      className="editor-testo"
      value={testo}
      placeholder={'Comincia a scrivere qui…\n\nOppure, dopo aver scelto fonti e scaletta, chiedi una bozza allo Scrittore: puoi sempre cambiarla tu. I segni tipo [F12] o [C3] dicono da quale fonte viene una frase.'}
      onSelect={(e) => onCursore(paragrafoAlCursore(e.currentTarget.value, e.currentTarget.selectionStart))}
      onChange={(e) => {
        setTestoLocale(e.target.value)
        inSospeso.current = { cap: cap.id, sez: sez.id, testo: e.target.value }
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(scrivi, 600)
      }}
      onBlur={scrivi}
      aria-label={`Testo della sezione ${sez.titolo}`}
      spellCheck
      lang="it"
    />
  )
}

function Versioni({ cap, sez }: { cap: Capitolo; sez: Sezione }) {
  const salva = useStudio((s) => s.salvaVersione)
  const ripristina = useStudio((s) => s.ripristinaVersione)
  const [nota, setNota] = useState('')
  const [esito, setEsito] = useState<string | null>(null)
  const [aperta, setAperta] = useState<string | null>(null)
  const versioni = useMemo(() => [...sez.versioni].reverse(), [sez.versioni])

  return (
    <section className="versioni sc-versioni">
      <h3>
        <Icona nome="versioni" /> Versioni
      </h3>
      <form
        className="riga-editor"
        onSubmit={(e) => {
          e.preventDefault()
          // Il testo in modifica viene scritto nello store prima di salvarne la versione.
          ;(document.activeElement as HTMLElement | null)?.blur()
          setTimeout(() => {
            const ok = salva(cap.id, sez.id, nota.trim() || 'Versione salvata da te')
            setEsito(ok ? 'Versione salvata.' : 'Non hai cambiato niente dall\'ultima versione.')
            if (ok) setNota('')
          }, 0)
        }}
      >
        <input className="campo" placeholder="Nota (se vuoi)" value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota della versione" />
        <button type="submit" className="bottone bottone-secondario">
          <Icona nome="spunta" /> Salva versione
        </button>
      </form>
      {esito && <p className="nota" role="status">{esito}</p>}
      {versioni.length === 0 ? (
        <p className="nota">Ancora nessuna versione salvata.</p>
      ) : (
        <ul className="elenco-versioni">
          {versioni.map((v) => (
            <li key={v.id}>
              <div className="versione-riga">
                <button type="button" className="link" onClick={() => setAperta(aperta === v.id ? null : v.id)} aria-expanded={aperta === v.id}>
                  {dataBreve(v.data)} · {nomeAutore(v.autore)} · {contaParoleTesto(v.testo)} parole
                </button>
                <Conferma
                  classe="bottone bottone-piccolo bottone-vuoto"
                  etichetta="Ripristina"
                  domanda="Vuoi tornare a questa versione? Il testo di adesso resta salvato."
                  conferma="Ripristina"
                  onConferma={() => {
                    ripristina(cap.id, sez.id, v.id)
                    setEsito('Fatto, sei tornato a questa versione. Il testo di prima è salvato fra le versioni.')
                  }}
                />
              </div>
              {v.nota && <p className="nota">{v.nota}</p>}
              {aperta === v.id && <pre className="anteprima-versione">{v.testo || '(vuota)'}</pre>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type Passo = 'fonti' | 'scaletta' | 'testo'
type StatoPasso = 'fatto' | 'corrente' | 'dopo'

/** Il passo da aprire quando arrivi su una sezione: il primo che manca, o il testo se c'è già. */
function passoIniziale(sez: Sezione): Passo {
  if (sez.testo.trim()) return 'testo'
  if (!sez.fontiConfermate) return 'fonti'
  if (!sez.scalettaApprovata) return 'scaletta'
  return 'testo'
}

/** I tre passi in una barra: fatto, a cui sei, o dopo. Si apre uno alla volta. */
function BarraPassi({ sez, aperto, onApri }: { sez: Sezione; aperto: Passo; onApri: (p: Passo) => void }) {
  const fonti = sez.fontiApprovate.length
  const punti = sez.scaletta.filter((p) => p.trim()).length
  const parole = contaParoleTesto(sez.testo)
  const passi: { id: Passo; nome: string; stato: StatoPasso; riassunto: string }[] = [
    {
      id: 'fonti',
      nome: 'Fonti',
      stato: sez.fontiConfermate ? 'fatto' : 'corrente',
      riassunto: sez.fontiConfermate ? (fonti ? `${fonti} ${fonti === 1 ? 'fonte' : 'fonti'}` : 'solo il corso') : 'da scegliere',
    },
    {
      id: 'scaletta',
      nome: 'Scaletta',
      stato: sez.scalettaApprovata ? 'fatto' : sez.fontiConfermate ? 'corrente' : 'dopo',
      riassunto: sez.scalettaApprovata ? `${punti} ${punti === 1 ? 'punto' : 'punti'}` : sez.fontiConfermate ? 'da approvare' : 'dopo le fonti',
    },
    {
      id: 'testo',
      nome: 'Testo',
      stato: sez.fontiConfermate && sez.scalettaApprovata ? (parole > 0 ? 'fatto' : 'corrente') : parole > 0 ? 'corrente' : 'dopo',
      riassunto: parole > 0 ? `${parole} parole` : 'da scrivere',
    },
  ]
  const NOME_STATO: Record<StatoPasso, string> = { fatto: 'fatto', corrente: 'da fare adesso', dopo: 'più avanti' }
  return (
    <ol className="sc-passi" aria-label="Passi della sezione">
      {passi.map((p, i) => (
        <li key={p.id} className={`sc-passo sc-passo-${p.stato} ${aperto === p.id ? 'sc-passo-aperto' : ''}`}>
          <button
            type="button"
            className="sc-passo-bottone"
            aria-expanded={aperto === p.id}
            aria-controls={`sc-pannello-${p.id}`}
            aria-label={`${i + 1}. ${p.nome}: ${NOME_STATO[p.stato]}, ${p.riassunto}`}
            onClick={() => onApri(p.id)}
          >
            <span className="sc-passo-cerchio">{p.stato === 'fatto' ? <Icona nome="spunta" dimensione={16} /> : i + 1}</span>
            <span className="sc-passo-testi">
              <span className="sc-passo-nome">{p.nome}</span>
              <span className="sc-passo-riassunto">{p.riassunto}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

type Piede = 'citazioni' | 'stile' | 'versioni' | null

/** Barra sottile sotto il foglio: conteggio, citazioni, copia, frasi da IA e versioni. */
function PiedeFoglio({ cap, sez }: { cap: Capitolo; sez: Sezione }) {
  const fonti = useStudio((s) => s.progetto.fonti)
  const stile = useStudio((s) => s.progetto.stileCitazione)
  const parolePerPagina = useStudio((s) => s.progetto.obiettivo.parolePerPagina)
  const [aperto, setAperto] = useState<Piede>(null)
  const [copiato, setCopiato] = useState<string | null>(null)
  const [sezioneMostrata, setSezioneMostrata] = useState(sez.id)
  if (sezioneMostrata !== sez.id) {
    setSezioneMostrata(sez.id)
    setCopiato(null)
    if (aperto === 'citazioni') setAperto(null)
  }
  const esame = useMemo(() => esaminaCitazioni(sez.testo, sez.citazioni), [sez.testo, sez.citazioni])
  const { ia, lessico, segnalazioni } = useStile(sez)
  // I bottoni restano sempre al loro posto: se comparissero al primo salvataggio, si sposterebbero sotto il dito.
  const vuoto = !sez.testo.trim()
  const parole = contaParoleTesto(sez.testo)
  const alterna = (p: Piede) => setAperto((a) => (a === p ? null : p))

  return (
    <>
      <div className="sc-piede">
        <p className="nota conteggio sc-conteggio">
          <strong>{parole.toLocaleString('it-IT')}</strong> parole · circa {(parole / parolePerPagina).toLocaleString('it-IT', { maximumFractionDigits: 1 })} pagine ·
          ultima modifica {dataBreve(sez.aggiornataIl)}
        </p>
        <div className="sc-piede-bottoni">
          <button type="button" className="sc-mini" onClick={() => alterna('citazioni')} aria-expanded={aperto === 'citazioni'} disabled={vuoto}>
            <Icona nome="occhio" dimensione={15} />
            {aperto === 'citazioni' ? 'Nascondi le citazioni' : `Mostra le citazioni (${esame.totali})`}
          </button>
          <button
            type="button"
            className="sc-mini"
            disabled={vuoto}
            onClick={async () => {
              const testo = esportaTesto(sez.testo, sez.citazioni, fonti, stile)
              try {
                await navigator.clipboard.writeText(testo)
                setCopiato(`Testo copiato, con le citazioni ${stile === 'note' ? 'in nota a piè di pagina' : 'autore-anno'}.`)
              } catch {
                setCopiato(testo)
              }
            }}
          >
            <Icona nome="copia" dimensione={15} />
            Copia il testo ({stile === 'note' ? 'note' : 'autore-anno'})
          </button>
          <button
            type="button"
            className={`sc-mini ${!vuoto && segnalazioni.length ? 'sc-mini-avviso' : !vuoto ? 'sc-mini-ok' : ''}`}
            onClick={() => alterna('stile')}
            aria-expanded={aperto === 'stile'}
            disabled={vuoto}
          >
            <Icona nome="scintille" dimensione={15} />
            {etichettaStile(sez, ia, lessico)}
          </button>
          <button type="button" className="sc-mini" onClick={() => alterna('versioni')} aria-expanded={aperto === 'versioni'}>
            <Icona nome="versioni" dimensione={15} />
            Versioni ({sez.versioni.length})
          </button>
        </div>
      </div>
      {copiato &&
        (copiato.startsWith('Testo copiato') ? (
          <p className="nota nota-ok sc-esito" role="status">
            <Icona nome="spunta" dimensione={15} /> {copiato}
          </p>
        ) : (
          <label className="campo-blocco sc-esito">
            <span className="etichetta">Copia da qui (il browser non mi ha fatto copiare da solo)</span>
            <textarea className="campo" rows={6} readOnly value={copiato} />
          </label>
        ))}
      {esame.incoerenze.length > 0 && <p className="allerta sc-esito">Da sistemare: {esame.incoerenze.join('; ')}.</p>}
      {aperto && (
        <div className="sc-piede-pannello">
          {aperto === 'citazioni' && !vuoto && <TestoCitato testo={sez.testo} citazioni={sez.citazioni} classe="testo-anteprima" />}
          {aperto === 'stile' && !vuoto && <DettaglioStile sez={sez} />}
          {aperto === 'versioni' && <Versioni cap={cap} sez={sez} />}
        </div>
      )}
    </>
  )
}

/** In concentrazione resta solo il testo: una barra sottile dice dove sei e come uscire. */
function BarraConcentrazione({ titolo, parole }: { titolo: string; parole: number }) {
  const esci = useStudio((s) => s.setConcentrazione)
  const parolePerPagina = useStudio((s) => s.progetto.obiettivo.parolePerPagina)
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') esci(false)
    }
    window.addEventListener('keydown', suTasto)
    return () => {
      window.removeEventListener('keydown', suTasto)
      esci(false)
    }
  }, [esci])
  return (
    <div className="barra-concentrazione" role="region" aria-label="Modalità concentrazione">
      <span className="barra-concentrazione-titolo">{titolo}</span>
      <span className="nota">
        {parole} parole · circa {(parole / parolePerPagina).toLocaleString('it-IT', { maximumFractionDigits: 1 })} pagine
      </span>
      <button type="button" className="bottone bottone-piccolo bottone-secondario" onClick={() => esci(false)}>
        Esci <span className="tasto">Esc</span>
      </button>
    </div>
  )
}

/** Il lavoro su una sezione: passi, barra dello Scrittore, foglio e piede. */
function LavoroSezione({ cap, sez, numero }: { cap: Capitolo; sez: Sezione; numero: string }) {
  const setCarta = useStudio((s) => s.setCarta)
  const concentrazione = useStudio((s) => s.concentrazione)
  const setConcentrazione = useStudio((s) => s.setConcentrazione)
  const selezione = useScrittore((s) => s.selezione)
  const strumenti = usePaginaScrittura((s) => s.strumenti)
  const [aperto, setAperto] = useState<Passo>(() => passoIniziale(sez))
  const [visto, setVisto] = useState({ id: sez.id, fonti: sez.fontiConfermate, scaletta: sez.scalettaApprovata })

  // Cambio di sezione: si riparte dal passo giusto. Approvando un passo si va al successivo.
  if (visto.id !== sez.id) {
    setVisto({ id: sez.id, fonti: sez.fontiConfermate, scaletta: sez.scalettaApprovata })
    setAperto(passoIniziale(sez))
  } else if (visto.fonti !== sez.fontiConfermate || visto.scaletta !== sez.scalettaApprovata) {
    setVisto({ id: sez.id, fonti: sez.fontiConfermate, scaletta: sez.scalettaApprovata })
    if (!visto.fonti && sez.fontiConfermate && aperto === 'fonti') setAperto(sez.scalettaApprovata ? 'testo' : 'scaletta')
    if (!visto.scaletta && sez.scalettaApprovata && aperto === 'scaletta') setAperto('testo')
  }
  const mostra: Passo = concentrazione ? 'testo' : aperto
  const approvate = sez.fontiApprovate.length

  return (
    <>
      <BarraPassi sez={sez} aperto={mostra} onApri={setAperto} />

      {mostra === 'fonti' && (
        <div className="sc-pannello-passo" id="sc-pannello-fonti">
          <PassoFonti cap={cap} sez={sez} />
          {sez.fontiConfermate && (
            <button type="button" className="bottone bottone-vuoto sc-avanti" onClick={() => setAperto(sez.scalettaApprovata ? 'testo' : 'scaletta')}>
              {sez.scalettaApprovata ? 'Vai al testo' : 'Vai alla scaletta'} <Icona nome="freccia" />
            </button>
          )}
        </div>
      )}
      {mostra === 'scaletta' && (
        <div className="sc-pannello-passo" id="sc-pannello-scaletta">
          <PassoScaletta cap={cap} sez={sez} />
          {sez.scalettaApprovata && (
            <button type="button" className="bottone bottone-vuoto sc-avanti" onClick={() => setAperto('testo')}>
              Vai al testo <Icona nome="freccia" />
            </button>
          )}
        </div>
      )}

      {mostra === 'testo' && (
        <section className="sc-pannello-testo" id="sc-pannello-testo" aria-label="Scrivi il testo">
          {concentrazione && <BarraConcentrazione titolo={`${numero} ${sez.titolo}`} parole={contaParoleTesto(sez.testo)} />}
          <ComandiScrittore
            cap={cap}
            sez={sez}
            paragrafo={selezione?.sezioneId === sez.id ? selezione.n : null}
            strumenti={
              <>
                <button type="button" className="bottone bottone-secondario sc-bottone-strumenti" onClick={() => apriStrumenti(true)} aria-label="Fonti e appunti">
                  <Icona nome="cassetto" />
                  <span className="sc-solo-largo">Fonti e appunti</span>
                  {approvate > 0 && <span className="sc-contatore">{approvate}</span>}
                </button>
                <span className="sc-separatore" aria-hidden />
                <button type="button" className="sc-icona-bottone" onClick={() => setConcentrazione(true)} aria-label="Concentrazione" title="Concentrazione: solo il testo (Esc per uscire)">
                  <Icona nome="concentrazione" dimensione={20} />
                </button>
                <button type="button" className="sc-icona-bottone" onClick={() => setCarta(true)} aria-label="Modalità carta" title="Modalità carta: rileggi il capitolo come su carta">
                  <Icona nome="carta" dimensione={20} />
                </button>
              </>
            }
          />
          <div className="sc-foglio">
            <Editor cap={cap} sez={sez} onCursore={(n) => selezionaParagrafo(sez.id, n)} />
            <PiedeFoglio cap={cap} sez={sez} />
          </div>
        </section>
      )}

      <Cassetto aperto={strumenti} onChiudi={() => apriStrumenti(false)} titolo="Fonti e appunti" larghezza={460}>
        <StrumentiSezione sez={sez} />
      </Cassetto>
    </>
  )
}

export function Scrittura() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const capId = useStudio((s) => s.capitoloAperto)
  const sezId = useStudio((s) => s.sezioneAperta)
  const largo = useLargo(1000)

  const cap = capitoli.find((c) => c.id === capId) ?? capitoli[0]
  const sez = cap?.sezioni.find((s) => s.id === sezId) ?? cap?.sezioni[0]

  if (!cap) {
    return (
      <section className="pannello">
        <p>L'indice è vuoto: aggiungi un capitolo dalla Panoramica.</p>
      </section>
    )
  }

  const indiceCap = capitoli.indexOf(cap)
  const numero = sez ? `${indiceCap + 1}.${cap.sezioni.indexOf(sez) + 1}` : ''

  return (
    <div className={`scrittura sc ${largo ? 'sc-due' : 'sc-una'}`}>
      {largo ? <IndiceLaterale capitoli={capitoli} capId={cap.id} sezId={sez?.id ?? null} /> : <SelettoreCapitoli capitoli={capitoli} cap={cap} sez={sez} />}

      <main className="sc-lavoro">
        <header className="testa-sezione sc-testa">
          <p className="sopratitolo sc-sopratitolo">
            <span>Capitolo {indiceCap + 1}</span>
            <span className="sc-sopratitolo-cap">{cap.titolo}</span>
            <span className={`stato-cap-${cap.stato} pastiglia sc-stato`}>{ETICHETTA_STATO[cap.stato]}</span>
          </p>
          <h2>{sez ? `${numero} ${sez.titolo}` : 'Nessuna sezione'}</h2>
          {sez?.obiettivo && <p className="obiettivo">{sez.obiettivo}</p>}
        </header>

        {sez ? (
          <LavoroSezione cap={cap} sez={sez} numero={numero} />
        ) : (
          <p className="nota">Questo capitolo non ha sezioni: aggiungile dall'indice nella Panoramica.</p>
        )}
      </main>
    </div>
  )
}
