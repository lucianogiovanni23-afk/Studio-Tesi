import { useState } from 'react'
import { collega, nomeDispositivo, preposizione, scollega, sincronizza, useSync, type StatoSync } from '../io/sincronizzazione'
import { Conferma } from './Conferma'

const ETICHETTA: Record<StatoSync, string> = {
  spenta: '',
  ok: 'sincronizzato',
  in_corso: 'sincronizzo…',
  attesa: 'in attesa',
  offline: 'non in linea',
  errore: 'errore di sincronizzazione',
  conflitto: 'da scegliere',
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
          <strong>Ci sono modifiche diverse su due dispositivi.</strong> Su GitHub c'è un progetto salvato {preposizione('da', conflitto.da)}{' '}
          {conflitto.il ? `(${quando(conflitto.il)})` : ''}, e questo {nomeDispositivo()} ha modifiche non ancora inviate. Quale
          versione tieni?
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
          Non si perde niente: la versione di questo dispositivo resta fra le copie di sicurezza, quella dell'altro nella
          storia del repository su GitHub.
        </p>
      </div>
    )
  }
  if (stato === 'errore') {
    return (
      <div className="allerta allerta-errore avviso-sync" role="alert">
        Sincronizzazione ferma: {messaggio}{' '}
        <button type="button" className="bottone bottone-vuoto" onClick={() => void sincronizza()}>
          Riprova
        </button>
      </div>
    )
  }
  return null
}

/** Pannello delle Impostazioni: collegamento al repository privato e stato. */
export function PannelloSincronizzazione() {
  const { stato, messaggio, repo, ultima } = useSync()
  const [bozzaRepo, setBozzaRepo] = useState('')
  const [token, setToken] = useState('')
  const [errore, setErrore] = useState('')
  const [lavoro, setLavoro] = useState(false)

  return (
    <section className="pannello" id="sincronizzazione">
      <h2>Sincronizzazione fra dispositivi</h2>
      {repo ? (
        <>
          <p className="nota">
            Questo {nomeDispositivo()} è collegato al repository privato <strong>{repo}</strong>. Le modifiche partono da sole
            pochi secondi dopo che smetti di scrivere e quando esci dall'app; quelle dell'altro dispositivo arrivano quando
            riapri l'app e ogni due minuti mentre è aperta.
          </p>
          <p className={stato === 'errore' ? 'allerta allerta-errore' : 'nota nota-ok'} role="status">
            {stato === 'in_corso'
              ? 'Sincronizzo…'
              : stato === 'errore' || stato === 'offline' || stato === 'attesa'
                ? messaggio
                : stato === 'conflitto'
                  ? 'Scegli quale versione tenere nell\'avviso in alto.'
                  : messaggio || (ultima ? `Sincronizzato: ${quando(ultima)}.` : 'Collegato.')}
          </p>
          <div className="riga-editor">
            <button
              type="button"
              className="bottone bottone-primario"
              disabled={stato === 'in_corso' || stato === 'conflitto'}
              onClick={() => void sincronizza()}
            >
              Sincronizza adesso
            </button>
            <Conferma
              classe="bottone bottone-vuoto"
              etichetta="Scollega questo dispositivo"
              domanda="Scollegare? I dati restano in questo browser e su GitHub, ma smettono di allinearsi."
              conferma="Scollega"
              pericolosa
              onConferma={scollega}
            />
          </div>
        </>
      ) : (
        <>
          <p className="nota">
            Senza sincronizzazione ogni dispositivo ha il suo progetto. Collegando iPhone, iPad e computer allo stesso
            repository GitHub <strong>privato</strong>, testi, fonti e file del corso si allineano da soli.
          </p>
          <details className="istruzioni-sync">
            <summary>Come si prepara (una volta sola, 3 minuti)</summary>
            <ol>
              <li>
                Su GitHub crea un repository <strong>privato</strong> vuoto, per esempio <code>studio-tesi-dati</code>:{' '}
                <a href="https://github.com/new" target="_blank" rel="noreferrer">
                  github.com/new
                </a>
                .
              </li>
              <li>
                Crea un token "fine-grained":{' '}
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                  nuovo token
                </a>
                . In <em>Repository access</em> scegli <em>Only select repositories</em> e quel repository; in{' '}
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
                setErrore(err instanceof Error ? err.message : 'Collegamento non riuscito.')
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
        Il token resta solo in questo browser e viene inviato solo a GitHub; non entra nel progetto né nei file salvati. Dà
        accesso soltanto al repository che hai scelto. Il repository deve restare privato: l'app rifiuta quelli pubblici.
      </p>
    </section>
  )
}
