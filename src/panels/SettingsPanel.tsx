import { useState } from 'react'
import { MODELLI_DISPONIBILI, type ModelSlot } from '../agents/api'
import { useStudioStore } from '../store'

const ETICHETTE: { slot: ModelSlot; nome: string; nota: string }[] = [
  { slot: 'lettore', nome: 'Lettore', nota: 'Legge il materiale e prepara il dossier' },
  { slot: 'ricercatore', nome: 'Ricercatore', nota: 'Cerca le fonti online' },
  { slot: 'selettore', nome: 'Selettore', nota: 'Vaglia le fonti trovate' },
  { slot: 'scrittore', nome: 'Scrittore', nota: 'Scrive le tre opzioni del capitolo' },
  { slot: 'controllore', nome: 'Controllore', nota: 'Valida e sorveglia il processo' },
  { slot: 'chat', nome: 'Chat', nota: 'Risponde alle tue domande sul progetto' },
]

export function SettingsPanel() {
  const apiKey = useStudioStore((s) => s.apiKey)
  const setApiKey = useStudioStore((s) => s.setApiKey)
  const modelli = useStudioStore((s) => s.modelli)
  const setModello = useStudioStore((s) => s.setModello)
  const ripristinaModelli = useStudioStore((s) => s.ripristinaModelli)
  const audioAttivo = useStudioStore((s) => s.audioAttivo)
  const setAudioAttivo = useStudioStore((s) => s.setAudioAttivo)
  const nuovaSessione = useStudioStore((s) => s.nuovaSessione)

  const [visibile, setVisibile] = useState(false)
  const [modelliAperti, setModelliAperti] = useState(false)
  const [confermaNuova, setConfermaNuova] = useState(false)

  const mascherata = apiKey ? `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}` : ''

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">Chiave API e modelli</h2>

      <div className="riga-campi">
        <input
          className="campo"
          type={visibile ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Chiave API Anthropic"
        />
        <button type="button" className="bottone bottone-vuoto" onClick={() => setVisibile((v) => !v)}>
          {visibile ? 'Nascondi' : 'Mostra'}
        </button>
        {apiKey && (
          <button type="button" className="bottone bottone-vuoto" onClick={() => setApiKey('')}>
            Rimuovi
          </button>
        )}
      </div>

      {apiKey && !visibile && <p className="nota">Chiave salvata: {mascherata}</p>}

      <p className="avviso">
        <strong>Attenzione.</strong> Questa chiave resta nel tuo browser e viene inviata direttamente
        all'API Anthropic. Va bene per uso personale; non distribuire l'app ad altri con la chiave
        dentro. Per un uso condiviso serve un backend che la nasconda.
      </p>

      <button
        type="button"
        className="riga-espandibile"
        onClick={() => setModelliAperti((v) => !v)}
        aria-expanded={modelliAperti}
      >
        <span aria-hidden>{modelliAperti ? '▾' : '▸'}</span> Modello per agente
        <span className="nota-inline">{modelli.scrittore} per lo Scrittore</span>
      </button>

      {modelliAperti && (
        <>
          <div className="griglia-modelli">
            {ETICHETTE.map(({ slot, nome, nota }) => (
              <label key={slot} className="campo-blocco">
                <span className="campo-etichetta">
                  {nome}
                  <em>{nota}</em>
                </span>
                <select
                  className="campo"
                  value={modelli[slot]}
                  onChange={(e) => setModello(slot, e.target.value)}
                >
                  {MODELLI_DISPONIBILI.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} — {m.nota}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="azioni">
            <button type="button" className="bottone bottone-piccolo" onClick={ripristinaModelli}>
              Ripristina i valori predefiniti
            </button>
          </div>
        </>
      )}

      <div className="azioni">
        <label className="interruttore">
          <input
            type="checkbox"
            checked={audioAttivo}
            onChange={(e) => setAudioAttivo(e.target.checked)}
          />
          Campanella di chiusura con suono
        </label>
      </div>

      <div className="azioni">
        {confermaNuova ? (
          <>
            <span className="nota">Cancello materiale, fonti, opzioni e cronologia. Sicuro?</span>
            <button
              type="button"
              className="bottone bottone-pericolo bottone-piccolo"
              onClick={() => {
                nuovaSessione()
                setConfermaNuova(false)
              }}
            >
              Sì, azzera tutto
            </button>
            <button
              type="button"
              className="bottone bottone-vuoto bottone-piccolo"
              onClick={() => setConfermaNuova(false)}
            >
              Annulla
            </button>
          </>
        ) : (
          <button
            type="button"
            className="bottone bottone-vuoto bottone-piccolo"
            onClick={() => setConfermaNuova(true)}
          >
            Nuova sessione
          </button>
        )}
      </div>
    </section>
  )
}
