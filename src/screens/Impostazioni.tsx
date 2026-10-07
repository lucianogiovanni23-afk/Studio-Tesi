import { useEffect, useRef, useState } from 'react'
import { ETICHETTE_SLOT } from '../agents/agenti'
import { MODELLI_DISPONIBILI } from '../agents/api'
import { eseguiDiagnosi, type EsitoDiagnosi } from '../agents/diagnostica'
import { creaCopia, elencoCopie, ripristinaCopia, type CopiaSicurezza } from '../io/copie'
import { cosaSiCancella, ripristinaTenendoIlCorso } from '../io/ripristino'
import { AvvisoChiave } from '../components/AvvisoChiave'
import { Conferma } from '../components/Conferma'
import { Costi } from '../components/Costi'
import { PannelloSincronizzazione } from '../components/Sincronizzazione'
import { useSync } from '../io/sincronizzazione'
import { MODELLI_PREDEFINITI } from '../domain/progettoIniziale'
import { apriProgetto, leggiFileProgetto, salvaProgetto, type AnteprimaFile } from '../io/fileProgetto'
import { useModoUso } from '../hooks/useModoUso'
import { useStudio } from '../store'
import type { ModalitaScena, ModelSlot, ModoUso, StileCitazione, Tema } from '../types'

function Chiave() {
  const apiKey = useStudio((s) => s.apiKey)
  const setApiKey = useStudio((s) => s.setApiKey)
  const [bozza, setBozza] = useState('')
  const [mostra, setMostra] = useState(false)

  return (
    <section className="pannello">
      <h2>Come lavorano gli agenti</h2>
      {apiKey ? (
        <p className="nota">
          <strong>Con la chiave API</strong>: gli agenti lavorano da soli e paghi solo quello che usi. Se togli la chiave torni
          alla versione gratis.
        </p>
      ) : (
        <div className="banda banda-info">
          <p>
            <strong>Stai usando la versione gratis.</strong> Ogni comando ti prepara un messaggio già pronto: lo copi su{' '}
            <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
              claude.ai
            </a>{' '}
            (basta un account gratis), incolli qui la risposta e l'app la controlla come sempre (citazioni, pezzi di fonte, parole del corso).
          </p>
          <p className="nota">
            Funziona tutto tranne la ricerca su internet e sui siti ufficiali (puoi sempre cercare negli archivi universitari e
            caricare i tuoi PDF). Claude.ai gratis ha un limite di messaggi al giorno: se lo finisci, riprendi il giorno dopo.
          </p>
        </div>
      )}
      <h3>Chiave API (non obbligatoria)</h3>
      <AvvisoChiave />
      {apiKey ? (
        <div className="riga-editor">
          <span className="nota nota-ok">Chiave salvata su questo browser (finisce con …{apiKey.slice(-4)}).</span>
          <Conferma
            classe="bottone bottone-vuoto"
            etichetta="Togli la chiave"
            domanda="Tolgo la chiave da questo browser?"
            conferma="Togli"
            pericolosa
            onConferma={() => setApiKey('')}
          />
        </div>
      ) : (
        <form
          className="riga-editor"
          onSubmit={(e) => {
            e.preventDefault()
            if (!bozza.trim()) return
            setApiKey(bozza)
            setBozza('')
          }}
        >
          <input
            className="campo"
            type={mostra ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder="Incolla qui la chiave"
            value={bozza}
            onChange={(e) => setBozza(e.target.value)}
            aria-label="Chiave API Anthropic"
          />
          <button type="button" className="bottone bottone-vuoto" onClick={() => setMostra((m) => !m)}>
            {mostra ? 'Nascondi' : 'Mostra'}
          </button>
          <button type="submit" className="bottone bottone-primario">
            Salva la chiave
          </button>
        </form>
      )}
    </section>
  )
}

function FileProgetto() {
  const salvatoIl = useStudio((s) => s.progetto.salvatoSuFileIl)
  const input = useRef<HTMLInputElement>(null)
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)
  const [anteprima, setAnteprima] = useState<AnteprimaFile | null>(null)

  return (
    <section className="pannello">
      <h2>Salva e apri il progetto</h2>
      <p className="nota">
        Il tuo lavoro è salvato in questo browser. Con la sincronizzazione qui sopra si aggiorna da solo sugli altri dispositivi.
        Se no, salvalo in un file, mettilo su iCloud o Drive e aprilo da qui sull'altro dispositivo. Nel file c'è tutto (indice,
        testi e versioni, fonti, glossario, note del relatore, costi, testo dei PDF) tranne la chiave API.
      </p>
      <div className="riga-editor">
        <button
          type="button"
          className="bottone bottone-primario"
          onClick={() => {
            try {
              const nome = salvaProgetto()
              setMessaggio({ tono: 'ok', testo: `Salvato come "${nome}" nei Download.` })
            } catch (err) {
              setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Non sono riuscito a salvare.' })
            }
          }}
        >
          Salva progetto
        </button>
        <button type="button" className="bottone" onClick={() => input.current?.click()}>
          Apri progetto…
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setMessaggio(null)
            try {
              setAnteprima(await leggiFileProgetto(file))
            } catch (err) {
              setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Non riesco a leggere questo file.' })
            }
          }}
        />
      </div>
      {salvatoIl && <p className="nota">Ultimo salvataggio su file: {new Date(salvatoIl).toLocaleString('it-IT')}.</p>}

      {anteprima && (
        <div className="banda banda-attesa">
          <p>
            <strong>{anteprima.titolo}</strong>
            <br />
            salvato il {new Date(anteprima.salvatoIl).toLocaleString('it-IT')} · {anteprima.capitoli} capitoli ·{' '}
            {anteprima.parole} parole · {anteprima.fonti} fonti · {anteprima.fileCorso} file del corso
          </p>
          <p>Se lo apri, prende il posto del lavoro che hai ora in questo browser. Se ti serve, salvalo prima.</p>
          <div className="riga-editor">
            <button
              type="button"
              className="bottone bottone-pericolo"
              onClick={async () => {
                try {
                  await apriProgetto(anteprima)
                  setMessaggio({ tono: 'ok', testo: 'Progetto aperto.' })
                } catch (err) {
                  setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Non sono riuscito ad aprirlo.' })
                }
                setAnteprima(null)
              }}
            >
              Apri e sostituisci
            </button>
            <button type="button" className="bottone bottone-vuoto" onClick={() => setAnteprima(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}
      {messaggio && (
        <p className={messaggio.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'} role="status">
          {messaggio.testo}
        </p>
      )}
    </section>
  )
}

const ESEMPIO_STILE: Record<StileCitazione, string> = {
  'autore-anno': 'Nel testo: (Rossi, 2021). Bibliografia in ordine alfabetico.',
  note: 'Nel testo: un numerino in alto. Il riferimento completo va in nota a piè di pagina.',
}

function Tesi() {
  const stile = useStudio((s) => s.progetto.stileCitazione)
  const caso = useStudio((s) => s.progetto.casoAziendale)
  const setStile = useStudio((s) => s.setStileCitazione)
  const setCaso = useStudio((s) => s.setCaso)
  const obiettivo = useStudio((s) => s.progetto.obiettivo)
  const setObiettivo = useStudio((s) => s.setObiettivo)
  const numero = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || min)))

  return (
    <section className="pannello">
      <h2>Tesi</h2>
      <fieldset className="campi-obiettivo">
        <legend className="etichetta">Lunghezza della tesi</legend>
        <label className="campo-blocco">
          <span className="etichetta">Pagine, da</span>
          <input className="campo" type="number" inputMode="numeric" min={10} max={300} value={obiettivo.pagineMin} onChange={(e) => setObiettivo({ pagineMin: numero(e.target.value, 10, 300) })} />
        </label>
        <label className="campo-blocco">
          <span className="etichetta">a</span>
          <input className="campo" type="number" inputMode="numeric" min={10} max={300} value={obiettivo.pagineMax} onChange={(e) => setObiettivo({ pagineMax: Math.max(obiettivo.pagineMin, numero(e.target.value, 10, 300)) })} />
        </label>
        <label className="campo-blocco">
          <span className="etichetta">Parole per pagina</span>
          <input className="campo" type="number" inputMode="numeric" min={150} max={600} value={obiettivo.parolePerPagina} onChange={(e) => setObiettivo({ parolePerPagina: numero(e.target.value, 150, 600) })} />
        </label>
        <span className="nota">300 parole sono circa una pagina Word (Times 12, interlinea 1,5). Se il relatore vuole un altro formato, cambia il numero.</span>
      </fieldset>
      <label className="campo-blocco">
        <span className="etichetta">Come citare le fonti</span>
        <select className="campo" value={stile} onChange={(e) => setStile(e.target.value as StileCitazione)}>
          <option value="autore-anno">Autore-anno</option>
          <option value="note">Note a piè di pagina</option>
        </select>
        <span className="nota">{ESEMPIO_STILE[stile]}</span>
      </label>
      <label className="interruttore">
        <input type="checkbox" checked={caso.attivo} onChange={(e) => setCaso({ attivo: e.target.checked })} />
        <span>Aggiungi un caso aziendale (per esempio un frantoio di cui hai i dati)</span>
      </label>
      {caso.attivo && (
        <label className="campo-blocco">
          <span className="etichetta">Descrivi l'azienda (senza il nome vero)</span>
          <textarea
            className="campo"
            rows={3}
            value={caso.descrizione}
            placeholder="Per esempio: frantoio della Piana di Gioia Tauro, molitura conto terzi, dati di cinque campagne."
            onChange={(e) => setCaso({ descrizione: e.target.value })}
          />
          <span className="nota">Non scrivere il nome vero dell'azienda: questo testo viene mandato agli agenti.</span>
        </label>
      )}
    </section>
  )
}

function Dispositivo() {
  const preferenze = useStudio((s) => s.preferenze)
  const setPreferenze = useStudio((s) => s.setPreferenze)
  const modo = useModoUso()

  return (
    <section className="pannello">
      <h2>Questo dispositivo</h2>
      <label className="campo-blocco">
        <span className="etichetta">Tema</span>
        <select className="campo" value={preferenze.tema} onChange={(e) => setPreferenze({ tema: e.target.value as Tema })}>
          <option value="auto">Automatico (come il dispositivo)</option>
          <option value="chiaro">Chiaro</option>
          <option value="scuro">Scuro</option>
        </select>
      </label>
      <label className="campo-blocco">
        <span className="etichetta">Come lo usi</span>
        <select className="campo" value={preferenze.modoUso} onChange={(e) => setPreferenze({ modoUso: e.target.value as ModoUso })}>
          <option value="auto">Automatico (ora: {modo === 'ipad' ? 'iPad' : 'computer'})</option>
          <option value="computer">Computer — tutto</option>
          <option value="ipad">iPad — leggere e decidere</option>
        </select>
        <span className="nota">
          Computer: scrittura completa, ricerca, revisione e file. iPad: rileggere su carta, approvare, schede, note del
          relatore, chat e piccole modifiche, con bottoni più grandi e scena più leggera.
        </span>
      </label>
      <label className="campo-blocco">
        <span className="etichetta">Scena 3D</span>
        <select
          className="campo"
          value={preferenze.modalitaScena}
          onChange={(e) => setPreferenze({ modalitaScena: e.target.value as ModalitaScena })}
        >
          <option value="auto">Automatica (più leggera su iPad e dispositivi lenti)</option>
          <option value="completa">Completa — ombre e uliveto fitto</option>
          <option value="ridotta">Ridotta — più leggera</option>
          <option value="spenta">Spenta — solo pannelli</option>
        </select>
      </label>
    </section>
  )
}

function Modelli() {
  const modelli = useStudio((s) => s.preferenze.modelli)
  const setModello = useStudio((s) => s.setModello)
  return (
    <section className="pannello">
      <h2>Modelli IA degli agenti</h2>
      {(Object.keys(ETICHETTE_SLOT) as ModelSlot[]).map((slot) => (
        <label key={slot} className="campo-blocco">
          <span className="etichetta">{ETICHETTE_SLOT[slot]}</span>
          <select className="campo" value={modelli[slot]} onChange={(e) => setModello(slot, e.target.value)}>
            {MODELLI_DISPONIBILI.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} — {m.nota}
                {m.id === MODELLI_PREDEFINITI[slot] ? ' (predefinito)' : ''}
              </option>
            ))}
          </select>
        </label>
      ))}
    </section>
  )
}

function Diagnostica() {
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const [conWeb, setConWeb] = useState(true)
  const [esiti, setEsiti] = useState<EsitoDiagnosi[]>([])
  const [lavoro, setLavoro] = useState(false)
  return (
    <section className="pannello">
      <h2>Prova la tua chiave</h2>
      <p className="nota">
        Fa una prova vera di tutto quello che usa l'app: ogni modello scelto risponde a una domanda piccolissima, la ricerca su
        internet fa una sola ricerca e gli archivi online una sola richiesta. Costa pochi centesimi.
      </p>
      <label className="interruttore">
        <input type="checkbox" checked={conWeb} onChange={(e) => setConWeb(e.target.checked)} />
        <span>Prova anche la ricerca su internet (1 centesimo)</span>
      </label>
      <button
        type="button"
        className="bottone bottone-primario"
        disabled={!haChiave || lavoro}
        onClick={async () => {
          setLavoro(true)
          setEsiti([])
          await eseguiDiagnosi(conWeb, (e) => setEsiti((x) => [...x, e]))
          setLavoro(false)
        }}
      >
        {lavoro ? 'Prova in corso…' : 'Fai la prova'}
      </button>
      {!haChiave && <p className="nota">Prima salva la chiave API.</p>}
      {esiti.length > 0 && (
        <ul className="elenco-diagnosi">
          {esiti.map((e) => (
            <li key={e.voce} className={e.ok ? 'nota-ok' : 'testo-errore'}>
              {e.ok ? '✓' : '✕'} <strong>{e.voce}</strong>: {e.messaggio}
              {e.millisecondi > 0 && <small className="nota"> · {(e.millisecondi / 1000).toFixed(1)} s</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CopieSicurezza() {
  const [copie, setCopie] = useState<CopiaSicurezza[] | null>(null)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const aggiorna = async () => setCopie(await elencoCopie())
  const ultimaSync = useSync((s) => s.ultima)
  useEffect(() => {
    // Lettura asincrona da IndexedDB: lo stato si aggiorna quando arriva la risposta.
    let attivo = true
    elencoCopie().then((c) => attivo && setCopie(c))
    return () => {
      attivo = false
    }
    // Dopo una sincronizzazione può esserci una copia nuova ("Prima di ricevere…").
  }, [ultimaSync])

  return (
    <section className="pannello">
      <h2>Copie di sicurezza</h2>
      <p className="nota">
        Il browser tiene le ultime 10 copie del tuo lavoro: una quando apri l'app e una ogni 15 minuti se hai cambiato qualcosa.
        Servono per tornare indietro se sbagli. Per non perdere niente, usa la sincronizzazione o il file su iCloud o Drive.
      </p>
      <button
        type="button"
        className="bottone"
        onClick={async () => {
          const fatta = await creaCopia('Creata da te', true)
          setMessaggio(fatta ? 'Copia creata.' : 'Non hai cambiato niente dall\'ultima copia.')
          await aggiorna()
        }}
      >
        Fai una copia adesso
      </button>
      {messaggio && <p className="nota nota-ok">{messaggio}</p>}
      {copie && copie.length === 0 && <p className="nota">Ancora nessuna copia.</p>}
      {copie && copie.length > 0 && (
        <ul className="elenco-copie">
          {copie.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{new Date(c.data).toLocaleString('it-IT')}</strong> · {c.motivo} · {c.parole} parole · {c.fonti} fonti
              </span>
              <Conferma
                classe="bottone bottone-piccolo bottone-vuoto"
                etichetta="Ripristina"
                domanda="Torni a questa copia? Prima salvo quello che hai adesso come copia."
                conferma="Ripristina"
                onConferma={async () => {
                  await ripristinaCopia(c.id)
                  setMessaggio('Fatto, sei tornato a quella copia. Quello che avevi prima è fra le copie.')
                  await aggiorna()
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Ripristino() {
  const [aperto, setAperto] = useState(false)
  const [fatto, setFatto] = useState(false)
  const [lavoro, setLavoro] = useState(false)
  const conta = aperto ? cosaSiCancella() : null
  return (
    <section className="pannello pannello-ripristino">
      <h2>Ricomincia da capo</h2>
      <p className="nota">
        Cancella tutto quello che hai fatto (fonti, testo scritto, ricerche, note del relatore, chat) e riparti pulito. Le lezioni del corso
        che hai caricato restano dove sono.
      </p>
      {!aperto ? (
        <button type="button" className="bottone bottone-pericolo" onClick={() => (setAperto(true), setFatto(false))}>
          Ripristina
        </button>
      ) : (
        conta && (
          <div className="banda banda-attesa" role="group" aria-label="Conferma ripristino">
            <p>
              Sicuro? Se ne vanno <strong>{conta.fonti} fonti</strong>, <strong>{conta.parole} parole</strong> scritte e{' '}
              <strong>{conta.osservazioni} note del relatore</strong>. Restano le tue <strong>{conta.lezioni} lezioni</strong>. Prima
              faccio comunque una copia di sicurezza, così se cambi idea la recuperi qui sotto.
            </p>
            <div className="riga-editor">
              <button
                type="button"
                className="bottone bottone-pericolo"
                disabled={lavoro}
                onClick={async () => {
                  setLavoro(true)
                  await creaCopia('Prima del ripristino', true)
                  await ripristinaTenendoIlCorso()
                  setLavoro(false)
                  setAperto(false)
                  setFatto(true)
                }}
              >
                Sì, cancella tutto tranne le lezioni
              </button>
              <button type="button" className="bottone bottone-vuoto" onClick={() => setAperto(false)}>
                No, lascia stare
              </button>
            </div>
          </div>
        )
      )}
      {fatto && (
        <p className="nota nota-ok" role="status">
          Fatto, si riparte da zero. Le lezioni sono ancora lì.
        </p>
      )}
    </section>
  )
}

function Registro() {
  const log = useStudio((s) => s.log)
  return (
    <section className="pannello">
      <details>
        <summary>Cronologia ({log.length})</summary>
        <ul className="registro">
          {[...log].reverse().map((l) => (
            <li key={l.id} className={`log-${l.kind}`}>
              <time>{l.ora}</time> {l.messaggio}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

export function Impostazioni() {
  return (
    <div className="griglia-due">
      <div>
        <Chiave />
        <PannelloSincronizzazione />
        <FileProgetto />
        <Tesi />
        <Ripristino />
      </div>
      <div>
        <Dispositivo />
        <Diagnostica />
        <Modelli />
        <Costi />
        <CopieSicurezza />
        <Registro />
      </div>
    </div>
  )
}
