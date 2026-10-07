import '../styles/corso.css'
import { costoStimato, modalitaGratuita } from '../agents/api'
import { useMemo, useRef, useState } from 'react'
import { collocazione, cercaPassaggi, rimuoviDalCorpus } from '../agents/corpus'
import { annullaQuadro, generaQuadro, stimaQuadro } from '../agents/lettoreCorso'
import { ricavaLessico, stimaLessico } from '../agents/lessico'
import { Conferma } from '../components/Conferma'
import { Esito } from '../components/Esito'
import { ACCETTA_CORSO as ACCETTA, caricaFileCorso } from '../io/fileCorso'
import { estrazioneInCorso, quadroObsoleto, useStudio } from '../store'
import type { CourseFile, Passaggio } from '../types'
import { Fisarmonica } from '../ui/Fisarmonica'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'

function formatta(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} KB`
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`
}

function avanzamento(f: CourseFile): number {
  if (f.status === 'pronto' || f.status === 'errore') return 100
  if (f.status === 'lettura') return Math.round(f.progress / 2)
  return 50 + Math.round(((f.paginaCorrente ?? 0) / Math.max(1, f.pagine ?? 1)) * 50)
}

/** Pastiglia a destra del titolo: "fatto" o "da fare". */
function Stato({ fatto, testo }: { fatto: boolean; testo?: string }) {
  return (
    <span className={`corso-stato ${fatto ? 'corso-stato-fatto' : 'corso-stato-dafare'}`}>
      {fatto && <Icona nome="spunta" dimensione={14} />}
      {testo ?? (fatto ? 'fatto' : 'da fare')}
    </span>
  )
}

// ---------------------------------------------------------------------------
// File del corso
// ---------------------------------------------------------------------------

function Caricamento() {
  const courseFiles = useStudio((s) => s.progetto.courseFiles)
  const occupato = useStudio((s) => estrazioneInCorso(s.progetto))
  const rimuovi = useStudio((s) => s.rimuoviCourseFile)
  const input = useRef<HTMLInputElement>(null)
  const [trascina, setTrascina] = useState(false)
  const [scartati, setScartati] = useState<string[]>([])

  const pronti = courseFiles.filter((f) => f.status === 'pronto')
  const passaggi = pronti.reduce((n, f) => n + (f.passaggi ?? 0), 0)
  const complessivo = courseFiles.length
    ? Math.round(courseFiles.reduce((s, f) => s + avanzamento(f), 0) / courseFiles.length)
    : 0

  return (
    <>
      <div
        className={`zona-rilascio corso-rilascio ${trascina ? 'zona-attiva' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setTrascina(true)
        }}
        onDragLeave={() => setTrascina(false)}
        onDrop={(e) => {
          e.preventDefault()
          setTrascina(false)
          if (e.dataTransfer.files.length) void caricaFileCorso(e.dataTransfer.files, setScartati)
        }}
      >
        <span className="corso-rilascio-icona" aria-hidden>
          <Icona nome="carica" dimensione={26} />
        </span>
        <span className="corso-rilascio-testo">
          <strong>Trascina qui le lezioni</strong>
          <span className="nota">PDF, dispense o appunti (.txt, .md), anche tanti insieme.</span>
        </span>
        <button type="button" className="bottone bottone-primario" onClick={() => input.current?.click()}>
          <Icona nome="piu" />
          Aggiungi PDF o appunti
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCETTA}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void caricaFileCorso(e.target.files, setScartati)
            e.target.value = ''
          }}
        />
      </div>

      {scartati.length > 0 && <p className="allerta">Questi file non riesco a leggerli, li ho saltati: {scartati.join(', ')}.</p>}

      {courseFiles.length > 0 && (
        <>
          <div className="corso-progresso">
            <div className="testa-progresso">
              <span>
                {occupato ? 'Sto leggendo i file' : 'Materiale pronto'}: <strong>{complessivo}%</strong>
              </span>
              <span className="nota">
                {pronti.length} file pronti · {passaggi} passaggi da citare
              </span>
            </div>
            <span className="progresso">
              <span className="progresso-barra" style={{ width: `${complessivo}%` }} />
            </span>
          </div>
          <ul className="corso-file">
            {courseFiles.map((f) => (
              <li key={f.id} className={`corso-file-riga riga-${f.status}`}>
                <span className="corso-file-icona" aria-hidden>
                  <Icona nome={f.status === 'pronto' ? 'spunta' : f.status === 'errore' ? 'avviso' : 'orologio'} dimensione={18} />
                </span>
                <span className="corso-file-testo">
                  <span className="nome-file" title={f.name}>
                    {f.name}
                  </span>
                  <span className="nota">
                    {f.status === 'estrazione'
                      ? `pagina ${f.paginaCorrente ?? 0} di ${f.pagine ?? '…'}`
                      : f.status === 'pronto'
                        ? `${f.pagine} ${f.pagine === 1 ? 'pagina' : 'pagine'} · ${f.passaggi} ${f.passaggi === 1 ? 'passaggio' : 'passaggi'}`
                        : formatta(f.size)}
                  </span>
                  {f.errore && <span className="errore-file">{f.errore}</span>}
                </span>
                <Conferma
                  classe="icona"
                  etichetta="✕"
                  domanda={`Tolgo "${f.name}"?`}
                  conferma="Togli"
                  pericolosa
                  disabilitato={f.status === 'lettura' || f.status === 'estrazione'}
                  onConferma={() => {
                    void rimuoviDalCorpus(f.id)
                    rimuovi(f.id)
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Idee principali
// ---------------------------------------------------------------------------

function Quadro() {
  const quadro = useStudio((s) => s.progetto.quadro)
  const obsoleto = useStudio((s) => quadroObsoleto(s.progetto))
  const pronti = useStudio((s) => s.progetto.courseFiles.filter((f) => f.status === 'pronto').length)
  const occupato = useStudio((s) => estrazioneInCorso(s.progetto))
  const lettore = useStudio((s) => s.agenti.lettore)
  const modello = useStudio((s) => s.preferenze.modelli.lettore)
  const [errore, setErrore] = useState<string | null>(null)
  const [aperto, setAperto] = useState<string | null>(null)

  const inCorso = lettore.status === 'lavoro'
  // Si ricalcola quando cambiano i file del corso pronti.
  const stima = useMemo(() => (pronti > 0 ? stimaQuadro(modello) : null), [pronti, modello])

  const avvia = async () => {
    setErrore(null)
    try {
      await generaQuadro()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Qualcosa è andato storto.')
    }
  }

  return (
    <>
      {obsoleto && (
        <p className="allerta">
          <Icona nome="avviso" /> Hai cambiato i file del corso: conviene aggiornare le idee principali.
        </p>
      )}

      <div className="corso-azioni">
        {pronti === 0 ? (
          <p className="nota corso-vuoto">
            <Icona nome="file" /> Carica almeno un file del corso e poi le preparo.
          </p>
        ) : inCorso ? (
          <>
            <span className="in-corso">Il Lettore sta leggendo il materiale…</span>
            <button type="button" className="bottone bottone-vuoto" onClick={annullaQuadro}>
              Ferma
            </button>
          </>
        ) : (
          <Conferma
            classe={`bottone ${quadro && !obsoleto ? 'bottone-secondario' : 'bottone-primario'}`}
            etichetta={
              <>
                <Icona nome={quadro ? 'aggiorna' : 'scintille'} />
                {quadro ? 'Aggiorna le idee' : 'Trova le idee principali'}
              </>
            }
            domanda={stima ? `${costoStimato(stima)}${modalitaGratuita() ? '' : ` con ${modello}`}. Procedo?` : 'Procedo?'}
            conferma="Vai"
            disabilitato={occupato}
            onConferma={() => void avvia()}
          />
        )}
        {quadro && <span className="nota">fatto il {new Date(quadro.generatoIl).toLocaleDateString('it-IT')}</span>}
      </div>

      {errore && <p className="allerta allerta-errore">{errore}</p>}

      {quadro && (
        <>
          <ul className="corso-concetti">
            {quadro.concetti.map((c) => (
              <li key={c.termine} className="corso-concetto">
                <div className="concetto-testa">
                  <strong>{c.termine}</strong>
                  <button
                    type="button"
                    className="marcatore"
                    onClick={() => setAperto(aperto === c.termine ? null : c.termine)}
                    aria-expanded={aperto === c.termine}
                  >
                    <Esito esito={c.esito} />
                  </button>
                </div>
                <p>{c.definizione}</p>
                <p className="applicazione">{c.applicazione}</p>
                {aperto === c.termine && (
                  <blockquote className="estratto">
                    «{c.estratto}»<cite>{c.collocazione}</cite>
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
          <div className="corso-sotto">
            {quadro.collegamenti.length > 0 && (
              <div className="corso-sotto-blocco">
                <h3>
                  <Icona nome="link" /> Come si collegano ai capitoli
                </h3>
                <ul className="corso-collegamenti">
                  {quadro.collegamenti.map((c, i) => (
                    <li key={i}>
                      <strong>{c.capitolo}</strong>
                      <span>{c.collegamento}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="corso-sotto-blocco">
              <h3>
                <Icona nome="bandiera" /> Cose che il corso non tratta
                {quadro.lacune.length > 0 && <Info>La tesi deve restare sugli argomenti del corso, quindi questi temi meglio lasciarli fuori.</Info>}
              </h3>
              {quadro.lacune.length === 0 ? (
                <p className="nota">Niente da segnalare.</p>
              ) : (
                <ul className="corso-lacune">
                  {quadro.lacune.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Ricerca nei file (barra in cima)
// ---------------------------------------------------------------------------

function CercaNelCorso() {
  const firma = useStudio((s) => s.progetto.courseFiles.map((f) => `${f.id}:${f.status}`).join('|'))
  const pronti = useStudio((s) => s.progetto.courseFiles.some((f) => f.status === 'pronto'))
  const [domanda, setDomanda] = useState('')
  const [risultati, setRisultati] = useState<Passaggio[] | null>(null)

  return (
    <div className="corso-ricerca">
      <form
        className="corso-cerca"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          void firma
          setRisultati(domanda.trim() ? cercaPassaggi(domanda, 6) : null)
        }}
      >
        <Icona nome="cerca" dimensione={20} className="corso-cerca-lente" />
        <input
          className="corso-cerca-campo"
          type="search"
          placeholder={pronti ? 'Cerca nei file del corso, per esempio: leva operativa' : 'Cerca nei file del corso (prima caricane uno)'}
          value={domanda}
          onChange={(e) => {
            setDomanda(e.target.value)
            if (!e.target.value) setRisultati(null)
          }}
          aria-label="Cerca nel materiale del corso"
        />
        <button type="submit" className="bottone bottone-secondario">
          Cerca
        </button>
      </form>
      {risultati && (
        <div className="corso-risultati pannello">
          <div className="corso-risultati-testa">
            <strong>
              {risultati.length === 0 ? 'Non ho trovato niente su questo.' : `${risultati.length} ${risultati.length === 1 ? 'passaggio trovato' : 'passaggi trovati'}`}
            </strong>
            <button type="button" className="bottone-icona" aria-label="Chiudi i risultati" onClick={() => setRisultati(null)}>
              <Icona nome="chiudi" dimensione={16} />
            </button>
          </div>
          {risultati.length > 0 && (
            <ul className="elenco-passaggi corso-passaggi">
              {risultati.map((p) => (
                <li key={p.id}>
                  <cite>
                    <Icona nome="file" dimensione={14} /> {collocazione(p)}
                  </cite>
                  <p>{p.testo.length > 600 ? `${p.testo.slice(0, 600)}…` : p.testo}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Parole del corso
// ---------------------------------------------------------------------------

function Lessico() {
  const glossario = useStudio((s) => s.progetto.glossario)
  const pronti = useStudio((s) => s.progetto.courseFiles.filter((f) => f.status === 'pronto').length)
  const occupato = useStudio((s) => estrazioneInCorso(s.progetto))
  const modello = useStudio((s) => s.preferenze.modelli.lettore)
  const lettore = useStudio((s) => s.agenti.lettore)
  const vai = useStudio((s) => s.vai)
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)
  const delCorso = useMemo(() => glossario.filter((v) => v.origine === 'corso').sort((a, b) => (b.occorrenze ?? 0) - (a.occorrenze ?? 0)), [glossario])
  const stima = useMemo(() => (pronti > 0 ? stimaLessico(modello) : null), [pronti, modello])

  return (
    <>
      <div className="corso-azioni">
        {lettore.status === 'lavoro' && lettore.etichetta.includes('lessico') ? (
          <p className="in-corso">Il Lettore sta cercando le parole…</p>
        ) : (
          <Conferma
            classe={`bottone ${delCorso.length ? 'bottone-secondario' : 'bottone-primario'}`}
            etichetta={
              <>
                <Icona nome={delCorso.length ? 'aggiorna' : 'parola'} />
                {delCorso.length ? 'Aggiorna le parole' : 'Trova le parole'}
              </>
            }
            disabilitato={pronti === 0 || occupato}
            domanda={stima ? `${costoStimato(stima)}. Procedo?` : 'Procedo?'}
            conferma="Vai"
            onConferma={async () => {
              setMessaggio(null)
              try {
                const e = await ricavaLessico()
                setMessaggio({
                  tono: 'ok',
                  testo: `${e.nuove} parole nuove e ${e.aggiornate} aggiornate nel glossario.${e.scartati.length ? ` Queste le ho tolte perché non sono nei tuoi file: ${e.scartati.join(', ')}.` : ''}${e.variantiTolte ? ` ${e.variantiTolte} sinonimi li lascio passare perché li usa anche il corso.` : ''}`,
                })
              } catch (err) {
                setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Qualcosa è andato storto.' })
              }
            }}
          />
        )}
        {delCorso.length > 0 && (
          <button type="button" className="bottone bottone-vuoto" onClick={() => vai('glossario')}>
            <Icona nome="matita" />
            Cambiale nel glossario
          </button>
        )}
      </div>
      {pronti === 0 && delCorso.length === 0 && (
        <p className="nota corso-vuoto">
          <Icona nome="file" /> Prima carica almeno un file del corso.
        </p>
      )}
      {messaggio && <p className={messaggio.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'}>{messaggio.testo}</p>}
      {delCorso.length > 0 && (
        <ul className="corso-parole">
          {delCorso.map((v) => (
            <li key={v.id} title={v.collocazione || undefined}>
              <strong>{v.termine}</strong>
              <small className="nota">
                {v.occorrenze} volte nei file{v.collocazione ? ` · ${v.collocazione}` : ''}
              </small>
              {v.varianti.length > 0 && <span className="corso-varianti">non usare: {v.varianti.join(', ')}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Schermata
// ---------------------------------------------------------------------------

type Parte = 'file' | 'idee' | 'parole'

export function Corso() {
  const files = useStudio((s) => s.progetto.courseFiles)
  const occupato = useStudio((s) => estrazioneInCorso(s.progetto))
  const quadro = useStudio((s) => s.progetto.quadro)
  const obsoleto = useStudio((s) => quadroObsoleto(s.progetto))
  const parole = useStudio((s) => s.progetto.glossario.filter((v) => v.origine === 'corso').length)

  const pronti = files.filter((f) => f.status === 'pronto').length
  const errori = files.filter((f) => f.status === 'errore').length
  const fileOk = pronti > 0 && !occupato && errori === 0
  const ideeOk = Boolean(quadro) && !obsoleto
  const paroleOk = parole > 0

  // Si apre la prima parte che ha ancora bisogno di lavoro (calcolato una volta, all'arrivo).
  const [daAprire] = useState<Parte>(() => (!fileOk ? 'file' : !ideeOk ? 'idee' : !paroleOk ? 'parole' : 'idee'))

  const riassuntoFile =
    files.length === 0
      ? 'Ancora nessun file: inizia da qui'
      : occupato
        ? `${files.length} file · sto leggendo…`
        : `${files.length} file · ${pronti === files.length ? (files.length === 1 ? 'pronto' : 'pronti') : `${pronti} pronti`}${errori ? ` · ${errori} da ricaricare` : ''}`
  const riassuntoIdee = quadro
    ? `${quadro.concetti.length} idee · fatte il ${new Date(quadro.generatoIl).toLocaleDateString('it-IT')}${obsoleto ? ' · da aggiornare' : ''}`
    : pronti > 0
      ? 'Pronte da trovare nei tuoi file'
      : 'Prima carica le lezioni'
  const riassuntoParole = parole ? `${parole} parole nel glossario` : pronti > 0 ? 'Pronte da trovare nei tuoi file' : 'Prima carica le lezioni'

  return (
    <div className="corso">
      <CercaNelCorso />

      <Fisarmonica
        titolo="File del corso"
        icona="file"
        riassunto={riassuntoFile}
        aperta={daAprire === 'file'}
        azioni={
          <>
            <Info>
              Metti qui i PDF delle lezioni, le dispense o i tuoi appunti (.txt o .md), anche tanti insieme. Leggo il testo qui nel browser e lo salvo
              su questo dispositivo, con file e pagina. Mentre leggo, la scena 3D si ferma un attimo.
            </Info>
            <Stato fatto={fileOk} testo={occupato ? 'in lettura' : errori ? 'da sistemare' : undefined} />
          </>
        }
      >
        <Caricamento />
      </Fisarmonica>

      <Fisarmonica
        titolo="Le idee principali del corso"
        icona="scintille"
        riassunto={riassuntoIdee}
        aperta={daAprire === 'idee'}
        azioni={
          <>
            <Info>
              Il Lettore legge il tuo materiale e tira fuori i concetti che userai in ogni capitolo (rischio operativo, leva operativa, liquidità,
              volatilità dei flussi…). Per ogni concetto c'è una frase presa dal corso, controllata sul testo: verde se è uguale, ambra se è quasi
              uguale, rosso se non si trova.
            </Info>
            <Stato fatto={ideeOk} testo={obsoleto ? 'da aggiornare' : undefined} />
          </>
        }
      >
        <Quadro />
      </Fisarmonica>

      <Fisarmonica
        titolo="Le parole del corso"
        icona="parola"
        riassunto={riassuntoParole}
        aperta={daAprire === 'parole'}
        azioni={
          <>
            <Info>
              Il Lettore trova nelle lezioni le parole tecniche, scritte come le usa il tuo corso, e le mette nel glossario. Chi scrive e chi rilegge
              la tesi deve usare proprio quelle, e mentre scrivi ti segnalo ogni sinonimo. Tengo solo le parole che ci sono davvero nei tuoi file.
            </Info>
            <Stato fatto={paroleOk} />
          </>
        }
      >
        <Lessico />
      </Fisarmonica>
    </div>
  )
}
