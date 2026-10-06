import { useRef, useState } from 'react'
import { ETICHETTE_SLOT } from '../agents/agenti'
import { MODELLI_DISPONIBILI } from '../agents/api'
import { AvvisoChiave } from '../components/AvvisoChiave'
import { Conferma } from '../components/Conferma'
import { Costi } from '../components/Costi'
import { MODELLI_PREDEFINITI } from '../domain/progettoIniziale'
import { apriProgetto, leggiFileProgetto, salvaProgetto, type AnteprimaFile } from '../io/fileProgetto'
import { useModoUso } from '../hooks/useModoUso'
import { useStudio } from '../store'
import type { ModalitaScena, ModelSlot, ModoUso, StileCitazione } from '../types'

function Chiave() {
  const apiKey = useStudio((s) => s.apiKey)
  const setApiKey = useStudio((s) => s.setApiKey)
  const [bozza, setBozza] = useState('')
  const [mostra, setMostra] = useState(false)

  return (
    <section className="pannello">
      <h2>Chiave API Anthropic</h2>
      <AvvisoChiave />
      {apiKey ? (
        <div className="riga-editor">
          <span className="nota nota-ok">Chiave salvata in questo browser (termina con …{apiKey.slice(-4)}).</span>
          <Conferma
            classe="bottone bottone-vuoto"
            etichetta="Rimuovi la chiave"
            domanda="Rimuovere la chiave da questo browser?"
            conferma="Rimuovi"
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
        Il progetto vive in questo browser. Per spostarlo fra computer e iPad salvalo in un file e mettilo in iCloud o
        Drive; dall'altro dispositivo aprilo da qui. Il file contiene indice, testi con versioni, biblioteca, glossario,
        osservazioni, costi e il testo estratto dei PDF. Non contiene la chiave API.
      </p>
      <div className="riga-editor">
        <button
          type="button"
          className="bottone bottone-primario"
          onClick={() => {
            try {
              const nome = salvaProgetto()
              setMessaggio({ tono: 'ok', testo: `Salvato come "${nome}" nella cartella dei download.` })
            } catch (err) {
              setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Salvataggio non riuscito.' })
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
              setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'File non leggibile.' })
            }
          }}
        />
      </div>
      {salvatoIl && <p className="nota">Ultima copia su file: {new Date(salvatoIl).toLocaleString('it-IT')}.</p>}

      {anteprima && (
        <div className="banda banda-attesa">
          <p>
            <strong>{anteprima.titolo}</strong>
            <br />
            salvato il {new Date(anteprima.salvatoIl).toLocaleString('it-IT')} · {anteprima.capitoli} capitoli ·{' '}
            {anteprima.parole} parole · {anteprima.fonti} fonti · {anteprima.fileCorso} file del corso
          </p>
          <p>Aprendolo, il progetto attuale in questo browser verrà sostituito. Se ti serve, salvalo prima.</p>
          <div className="riga-editor">
            <button
              type="button"
              className="bottone bottone-pericolo"
              onClick={async () => {
                try {
                  await apriProgetto(anteprima)
                  setMessaggio({ tono: 'ok', testo: 'Progetto aperto.' })
                } catch (err) {
                  setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Apertura non riuscita.' })
                }
                setAnteprima(null)
              }}
            >
              Sostituisci il progetto attuale
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
  note: 'Nel testo: un numero in apice. Riferimento completo in nota a piè di pagina.',
}

function Tesi() {
  const stile = useStudio((s) => s.progetto.stileCitazione)
  const caso = useStudio((s) => s.progetto.casoAziendale)
  const setStile = useStudio((s) => s.setStileCitazione)
  const setCaso = useStudio((s) => s.setCaso)

  return (
    <section className="pannello">
      <h2>Tesi</h2>
      <label className="campo-blocco">
        <span className="etichetta">Stile di citazione</span>
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
          <span className="etichetta">Descrizione del caso, anonimizzata</span>
          <textarea
            className="campo"
            rows={3}
            value={caso.descrizione}
            placeholder="Per esempio: frantoio della Piana di Gioia Tauro, molitura conto terzi, dati di cinque campagne."
            onChange={(e) => setCaso({ descrizione: e.target.value })}
          />
          <span className="nota">Non usare il nome reale dell'azienda: gli agenti lo riceveranno nei loro prompt.</span>
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
        <span className="etichetta">Modo d'uso</span>
        <select className="campo" value={preferenze.modoUso} onChange={(e) => setPreferenze({ modoUso: e.target.value as ModoUso })}>
          <option value="auto">Automatico (ora: {modo === 'ipad' ? 'iPad' : 'computer'})</option>
          <option value="computer">Computer — postazione completa</option>
          <option value="ipad">iPad — lettura e decisioni</option>
        </select>
        <span className="nota">
          Computer: editor a tre colonne, ricerca, revisione, gestione dei file. iPad: rilettura in modalità carta,
          approvazioni, schede, osservazioni, chat e scrittura leggera, con tocchi più grandi e scena ridotta.
        </span>
      </label>
      <label className="campo-blocco">
        <span className="etichetta">Scena 3D</span>
        <select
          className="campo"
          value={preferenze.modalitaScena}
          onChange={(e) => setPreferenze({ modalitaScena: e.target.value as ModalitaScena })}
        >
          <option value="auto">Automatica (ridotta su iPad e sui dispositivi meno potenti)</option>
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
      <h2>Modelli degli agenti</h2>
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

function Registro() {
  const log = useStudio((s) => s.log)
  return (
    <section className="pannello">
      <details>
        <summary>Registro degli eventi ({log.length})</summary>
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
        <FileProgetto />
        <Tesi />
      </div>
      <div>
        <Dispositivo />
        <Modelli />
        <Costi />
        <Registro />
      </div>
    </div>
  )
}
