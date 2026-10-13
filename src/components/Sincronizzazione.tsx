import { useEffect, useState } from 'react'
import { attivaCopieGitHub, copiaDelGiorno, elencoCopieGitHub, ripristinaCopiaGitHub, useCopieGitHub } from '../io/copieGitHub'
import { dataDi, giornoDi } from '../domain/ritmo'
import { collega, nomeDispositivo, preposizione, scollega, sincronizza, useSync, type StatoSync } from '../io/sincronizzazione'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'
import { Conferma } from './Conferma'

const ETICHETTA: Record<StatoSync, string> = {
  spenta: '',
  ok: 'sincronizzato',
  in_corso: 'sincronizzo…',
  attesa: 'in attesa',
  offline: 'offline',
  errore: 'non si sincronizza',
  conflitto: 'scegli la versione',
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Indicatore nella testata: si vede da ogni schermata se i dati sono allineati. */
export function ChipSincronizzazione({ onApri }: { onApri: () => void }) {
  const stato = useSync((s) => s.stato)
  if (stato === 'spenta') return null
  return (
    <button type="button" className={`sync-chip sync-${stato}`} onClick={onApri} title={`Sincronizzazione: ${ETICHETTA[stato]}`}>
      <span className="sync-pallino" aria-hidden />
      <span className="sync-testo">{ETICHETTA[stato]}</span>
    </button>
  )
}

/** Avviso sotto la testata quando serve una scelta o qualcosa non va. */
export function AvvisoSincronizzazione() {
  const { stato, messaggio, conflitto } = useSync()
  const [lavoro, setLavoro] = useState(false)
  if (stato === 'conflitto' && conflitto) {
    const scegli = async (verso: 'invia' | 'ricevi') => {
      setLavoro(true)
      await sincronizza(verso)
      setLavoro(false)
    }
    return (
      <div className="banda banda-attesa avviso-sync" role="alert">
        <p>
          <strong>Hai fatto modifiche diverse su due dispositivi.</strong> Su GitHub c'è una versione salvata{' '}
          {preposizione('da', conflitto.da)} {conflitto.il ? `(${quando(conflitto.il)})` : ''}, ma su questo {nomeDispositivo()}{' '}
          hai modifiche non ancora inviate. Quale tieni?
        </p>
        <div className="riga-editor">
          <button type="button" className="bottone bottone-primario" disabled={lavoro} onClick={() => void scegli('ricevi')}>
            Prendi quella {preposizione('di', conflitto.da)}
          </button>
          <button type="button" className="bottone" disabled={lavoro} onClick={() => void scegli('invia')}>
            Tieni quella di questo {nomeDispositivo()}
          </button>
        </div>
        <p className="nota">
          Non perdi niente: la versione di questo dispositivo resta tra le copie di sicurezza, quella dell'altro resta
          salvata su GitHub.
        </p>
      </div>
    )
  }
  if (stato === 'errore') {
    return (
      <div className="allerta allerta-errore avviso-sync" role="alert">
        La sincronizzazione si è fermata: {messaggio}{' '}
        <button type="button" className="bottone bottone-vuoto" onClick={() => void sincronizza()}>
          Riprova
        </button>
      </div>
    )
  }
  return null
}

/** "oggi alle 9:12", "ieri alle 18:40", "il 3 ottobre alle 9:12". */
function quandoRelativo(iso: string): string {
  const d = new Date(iso)
  const ora = d.toLocaleTimeString('it-IT', { hour: 'numeric', minute: '2-digit' })
  const giorno = giornoDi(d)
  const oggi = giornoDi()
  const ieri = giornoDi(new Date(Date.now() - 86_400_000))
  if (giorno === oggi) return `oggi alle ${ora}`
  if (giorno === ieri) return `ieri alle ${ora}`
  return `il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} alle ${ora}`
}

function giornoCopia(giorno: string): string {
  if (giorno === giornoDi()) return 'Oggi'
  if (giorno === giornoDi(new Date(Date.now() - 86_400_000))) return 'Ieri'
  const d = dataDi(giorno)
  const anno = d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}
  const testo = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', ...anno })
  return testo.charAt(0).toUpperCase() + testo.slice(1)
}

const QUANTE_SUBITO = 5

/** Copie datate su GitHub: interruttore, ultima copia ed elenco con "Ripristina". */
function CopieGitHub() {
  const { attive, ultima, giorno, lavoro, messaggio, errore, elenco } = useCopieGitHub()
  const [tutte, setTutte] = useState(false)
  const [esito, setEsito] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)
  const [carico, setCarico] = useState(true)

  useEffect(() => {
    let attivo = true
    elencoCopieGitHub()
      .catch(() => [])
      .finally(() => attivo && setCarico(false))
    return () => {
      attivo = false
    }
  }, [])

  const ultimaTesto = ultima
    ? `Ultima copia: ${quandoRelativo(ultima)}.`
    : giorno
      ? `Ultima copia: ${giornoCopia(giorno).toLowerCase()} (da un altro dispositivo).`
      : elenco?.length
        ? `Ultima copia: ${giornoCopia(elenco[0].giorno).toLowerCase()}.`
        : 'Ancora nessuna copia su GitHub.'
  const mostrate = elenco ? (tutte ? elenco : elenco.slice(0, QUANTE_SUBITO)) : []

  return (
    <div className="imp-copie-github">
      <h3>
        <Icona nome="versioni" dimensione={18} /> Copia di sicurezza su GitHub
        <Info>
          Una volta al giorno, la prima volta che apri l'app, salvo una copia datata della tesi nel tuo repository privato
          (cartella <code>studio-tesi/copie</code>). Tengo le ultime 30. Il testo delle lezioni non c'è: resta quello che hai.
          Se torni a una copia, prima salvo quello che hai adesso fra le copie di questo browser.
        </Info>
      </h3>
      <label className="interruttore imp-interruttore imp-riga-interruttore">
        <span>Una copia al giorno, in automatico</span>
        <input type="checkbox" checked={attive} onChange={(e) => attivaCopieGitHub(e.target.checked)} />
      </label>
      <p className={errore ? 'allerta allerta-errore' : 'nota nota-ok'} role="status">
        {lavoro ? 'Faccio la copia…' : errore ? `L'ultima copia non è riuscita: ${messaggio}` : attive ? ultimaTesto : 'Copie automatiche spente su questo dispositivo.'}
      </p>
      <div className="riga-editor">
        <button
          type="button"
          className="bottone bottone-secondario"
          disabled={lavoro}
          onClick={async () => {
            setEsito(null)
            const fatta = await copiaDelGiorno(true)
            if (fatta) setEsito({ tono: 'ok', testo: 'Copia di oggi salvata su GitHub.' })
          }}
        >
          <Icona nome="copia" dimensione={16} /> Fai una copia adesso
        </button>
      </div>

      {carico && !elenco && <p className="nota">Guardo le copie su GitHub…</p>}
      {elenco && elenco.length > 0 && (
        <ul className="imp-copie-github-elenco" aria-label="Copie su GitHub">
          {mostrate.map((c) => (
            <li key={c.sha}>
              <span>
                <strong>{giornoCopia(c.giorno)}</strong>
                <span className="nota"> · {Math.max(1, Math.round(c.dimensione / 1024)).toLocaleString('it-IT')} KB</span>
              </span>
              <Conferma
                classe="bottone bottone-piccolo bottone-secondario"
                etichetta="Ripristina"
                domanda="Torni a questa copia? Prima salvo quello che hai adesso."
                conferma="Ripristina"
                onConferma={async () => {
                  setEsito(null)
                  try {
                    await ripristinaCopiaGitHub(c)
                    setEsito({ tono: 'ok', testo: `Fatto, sei tornato alla copia di ${giornoCopia(c.giorno).toLowerCase()}. Quello che avevi prima è fra le copie di sicurezza (scheda Sicurezza).` })
                  } catch (err) {
                    setEsito({ tono: 'errore', testo: err instanceof Error ? err.message : 'Non sono riuscito a tornare a quella copia.' })
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {elenco && elenco.length > QUANTE_SUBITO && (
        <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={() => setTutte((t) => !t)}>
          {tutte ? 'Mostra meno' : `Mostra tutte (${elenco.length})`}
        </button>
      )}
      {esito && (
        <p className={esito.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'} role="status">
          {esito.testo}
        </p>
      )}
    </div>
  )
}

/** Pannello delle Impostazioni: collegamento al repository privato e stato. */
export function PannelloSincronizzazione() {
  const { stato, messaggio, repo, ultima } = useSync()
  const [bozzaRepo, setBozzaRepo] = useState('')
  const [token, setToken] = useState('')
  const [errore, setErrore] = useState('')
  const [lavoro, setLavoro] = useState(false)

  const collegato = Boolean(repo)
  const statoBreve = !collegato ? 'Spenta' : stato === 'errore' ? 'Ferma' : stato === 'conflitto' ? 'Da scegliere' : stato === 'offline' ? 'Offline' : 'Attiva'

  return (
    <section className="pannello imp-carta imp-sync" id="sincronizzazione">
      <div className="imp-testa">
        <span className="imp-testa-icona" aria-hidden>
          <Icona nome="aggiorna" dimensione={20} />
        </span>
        <div className="imp-testa-titoli">
          <div className="imp-testa-riga">
            <h2>Sincronizzazione fra dispositivi</h2>
            <Info>
              {collegato ? (
                <>
                  Le modifiche partono da sole pochi secondi dopo che smetti di scrivere e quando chiudi l'app. Quelle fatte
                  sull'altro dispositivo arrivano quando riapri l'app, e ogni due minuti mentre è aperta.
                </>
              ) : (
                <>
                  Senza sincronizzazione ogni dispositivo ha la sua copia della tesi. Se colleghi iPhone, iPad e computer allo
                  stesso repository GitHub privato, testi, fonti e lezioni si aggiornano da soli su tutti.
                </>
              )}
            </Info>
          </div>
          <p className="imp-testa-sotto">La stessa tesi su iPhone, iPad e computer.</p>
        </div>
        <div className="imp-testa-azioni">
          <span className={`imp-stato ${collegato && (stato === 'ok' || stato === 'in_corso' || stato === 'attesa') ? 'imp-stato-ok' : ''} ${stato === 'errore' || stato === 'conflitto' ? 'imp-stato-errore' : ''}`}>
            <span className="imp-stato-pallino" aria-hidden />
            {statoBreve}
          </span>
        </div>
      </div>

      <div className="imp-sync-dispositivi" aria-hidden>
        <span className="imp-sync-tile">
          <Icona nome="dispositivi" dimensione={22} />
        </span>
        <span className={`imp-sync-filo ${collegato ? 'imp-sync-filo-acceso' : ''}`} />
        <span className="imp-sync-tile imp-sync-centro">
          <Icona nome={collegato ? 'link' : 'scudo'} dimensione={22} />
        </span>
        <span className={`imp-sync-filo ${collegato ? 'imp-sync-filo-acceso' : ''}`} />
        <span className="imp-sync-tile">
          <Icona nome="dispositivi" dimensione={22} />
        </span>
      </div>

      {repo ? (
        <>
          <p className="nota imp-sync-repo">
            Questo {nomeDispositivo()} è collegato al tuo repository privato <strong>{repo}</strong>.
          </p>
          <p className={stato === 'errore' ? 'allerta allerta-errore' : 'nota nota-ok'} role="status">
            {stato === 'in_corso'
              ? 'Sincronizzo…'
              : stato === 'errore' || stato === 'offline' || stato === 'attesa'
                ? messaggio
                : stato === 'conflitto'
                  ? 'Scegli quale versione tenere nel messaggio in alto.'
                  : messaggio || (ultima ? `Ultima sincronizzazione: ${quando(ultima)}.` : 'Collegato.')}
          </p>
          <div className="riga-editor imp-azioni">
            <button
              type="button"
              className="bottone bottone-primario"
              disabled={stato === 'in_corso' || stato === 'conflitto'}
              onClick={() => void sincronizza()}
            >
              <Icona nome="aggiorna" dimensione={16} />
              Sincronizza adesso
            </button>
            <Conferma
              classe="bottone bottone-vuoto"
              etichetta="Scollega questo dispositivo"
              domanda="Vuoi scollegarlo? I dati restano qui e su GitHub, ma non si aggiornano più tra i dispositivi."
              conferma="Scollega"
              pericolosa
              onConferma={scollega}
            />
          </div>
          <CopieGitHub />
        </>
      ) : (
        <>
          <details className="istruzioni-sync">
            <summary>Come si fa (una volta sola, 3 minuti)</summary>
            <ol>
              <li>
                Su GitHub crea un repository <strong>privato</strong> vuoto, per esempio <code>studio-tesi-dati</code>:{' '}
                <a href="https://github.com/new" target="_blank" rel="noreferrer">
                  github.com/new
                </a>
                .
              </li>
              <li>
                Crea un token "fine-grained" (è una specie di password):{' '}
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                  nuovo token
                </a>
                . In <em>Repository access</em> scegli <em>Only select repositories</em> e poi quel repository; in{' '}
                <em>Permissions → Repository permissions</em> metti <em>Contents</em> su <em>Read and write</em>. Come scadenza
                va bene un anno.
              </li>
              <li>Su ogni dispositivo incolla qui sotto il nome del repository e lo stesso token.</li>
            </ol>
          </details>
          <form
            className="campi-sync"
            onSubmit={async (e) => {
              e.preventDefault()
              setErrore('')
              setLavoro(true)
              try {
                await collega(bozzaRepo, token)
                setToken('')
              } catch (err) {
                setErrore(err instanceof Error ? err.message : 'Collegamento non riuscito, riprova.')
              }
              setLavoro(false)
            }}
          >
            <label className="campo-blocco">
              <span className="etichetta">Repository</span>
              <input
                className="campo"
                placeholder="nome-utente/studio-tesi-dati"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={bozzaRepo}
                onChange={(e) => setBozzaRepo(e.target.value)}
              />
            </label>
            <label className="campo-blocco">
              <span className="etichetta">Token di GitHub</span>
              <input
                className="campo"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="github_pat_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <button type="submit" className="bottone bottone-primario" disabled={lavoro || !bozzaRepo.trim() || !token.trim()}>
              <Icona nome="link" dimensione={16} />
              {lavoro ? 'Collego…' : 'Collega'}
            </button>
          </form>
          {errore && (
            <p className="allerta allerta-errore" role="status">
              {errore}
            </p>
          )}
        </>
      )}
      <p className="avviso-chiave">
        Il token resta solo in questo browser e lo mando solo a GitHub: non finisce nella tesi né nei file salvati. Funziona
        solo per il repository che hai scelto. Il repository deve essere privato: quelli pubblici l'app non li accetta.
      </p>
    </section>
  )
}
