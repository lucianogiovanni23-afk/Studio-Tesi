import { ApiKeyInput } from './components/ApiKeyInput'
import { ControlRoom } from './components/ControlRoom'
import { Scene } from './scene/Scene'
import { cancelPipeline, runPipeline } from './lib/pipeline'
import { usePipelineStore } from './store'

const TESTO_ESEMPIO = `Il 14 marzo 2024 la startup torinese Velaria ha annunciato la chiusura di un round di finanziamento da 12 milioni di euro, guidato dal fondo Northbridge con la partecipazione di tre investitori privati. La società, fondata nel 2019 da Marta Ferri e Luca Ponti, sviluppa sensori per il monitoraggio delle reti idriche e dichiara oggi 48 dipendenti e 130 comuni serviti in Italia e Spagna. "Non ci interessa crescere in fretta, ci interessa crescere bene", ha commentato Ferri durante la conferenza stampa. Il piano prevede l'apertura di una sede a Valencia entro la fine del 2025 e il raddoppio del reparto ricerca e sviluppo.`

export default function App() {
  const sourceText = usePipelineStore((s) => s.sourceText)
  const setSourceText = usePipelineStore((s) => s.setSourceText)
  const running = usePipelineStore((s) => s.running)
  const finalReport = usePipelineStore((s) => s.finalReport)
  const resetPipeline = usePipelineStore((s) => s.resetPipeline)

  return (
    <div className="app">
      <header className="app-head">
        <h1>Studio degli agenti</h1>
        <p>
          Quattro agenti AI in una stanza low-poly analizzano il tuo testo in sequenza, passandosi il
          testimone da una scrivania all'altra.
        </p>
      </header>

      <main className="app-main">
        <div className="column">
          <ApiKeyInput />

          <section className="panel">
            <h2 className="panel-title">Testo da analizzare</h2>
            <textarea
              className="textarea"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Incolla qui il testo che vuoi far analizzare ai quattro agenti…"
              rows={9}
              aria-label="Testo da analizzare"
            />
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void runPipeline()}
                disabled={running}
              >
                {running ? 'Pipeline in corso…' : 'Avvia pipeline'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  cancelPipeline()
                  resetPipeline()
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSourceText(TESTO_ESEMPIO)}
                disabled={running}
              >
                Testo di esempio
              </button>
              <span className="counter">{sourceText.length} caratteri</span>
            </div>
          </section>
        </div>

        <Scene />
      </main>

      <ControlRoom />

      {finalReport && (
        <section className="panel">
          <h2 className="panel-title">Report finale</h2>
          <pre className="result final">{finalReport}</pre>
        </section>
      )}

      <footer className="app-foot">
        Nessun backend: le richieste partono dal browser verso l'API Anthropic. La chiave resta solo
        sul tuo dispositivo.
      </footer>
    </div>
  )
}
