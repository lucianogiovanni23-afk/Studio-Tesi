import { useState } from 'react'
import { MODELLI_DISPONIBILI, type ModelSlot } from '../agents/api'
import { svuotaCorpus } from '../agents/corpus'
import { useStudioStore } from '../store'
import type { ModalitaScena, Profondita } from '../types'

const PROFONDITA: { id: Profondita; nome: string; nota: string }[] = [
  { id: 'sintetica', nome: 'Sintetica', nota: 'meno materiale per chiamata, costi più bassi' },
  { id: 'standard', nome: 'Standard', nota: 'equilibrio fra copertura e costo' },
  { id: 'estesa', nome: 'Estesa', nota: 'più passaggi del corso, costi più alti' },
]

const SCENA: { id: ModalitaScena; nome: string }[] = [
  { id: 'auto', nome: 'Automatica' },
  { id: 'completa', nome: 'Completa' },
  { id: 'ridotta', nome: 'Ridotta' },
  { id: 'spenta', nome: 'Spenta' },
]

const ETICHETTE: { slot: ModelSlot; nome: string; nota: string }[] = [
  { slot: 'lettore', nome: 'Lettore', nota: 'Legge il materiale e prepara il dossier' },
  { slot: 'ricercatore', nome: 'Ricercatore', nota: 'Cerca e legge le fonti online' },
  { slot: 'selettore', nome: 'Selettore', nota: 'Vaglia le fonti trovate: basta il modello più economico' },
  { slot: 'scrittore', nome: 'Scrittore', nota: 'Scaletta, tre opzioni e rifiniture' },
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
  const profondita = useStudioStore((s) => s.profondita)
  const setProfondita = useStudioStore((s) => s.setProfondita)
  const modalitaScena = useStudioStore((s) => s.modalitaScena)
  const setModalitaScena = useStudioStore((s) => s.setModalitaScena)
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)

  const [visibile, setVisibile] = useState(false)
  const [modelliAperti, setModelliAperti] = useState(false)
  const [confermaNuova, setConfermaNuova] = useState(false)

  const mascherata = apiKey ? `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}` : ''

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">Impostazioni</h2>

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

      <fieldset className="gruppo-scelta">
        <legend className="campo-etichetta">Profondità di lettura del corso</legend>
        <div className="segmenti" role="radiogroup">
          {PROFONDITA.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={profondita === p.id}
              className={`segmento ${profondita === p.id ? 'segmento-attivo' : ''}`}
              onClick={() => setProfondita(p.id)}
              disabled={inEsecuzione}
            >
              {p.nome}
            </button>
          ))}
        </div>
        <p className="nota">{PROFONDITA.find((p) => p.id === profondita)?.nota}</p>
      </fieldset>

      <fieldset className="gruppo-scelta">
        <legend className="campo-etichetta">Sala 3D</legend>
        <div className="segmenti" role="radiogroup">
          {SCENA.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={modalitaScena === m.id}
              className={`segmento ${modalitaScena === m.id ? 'segmento-attivo' : ''}`}
              onClick={() => setModalitaScena(m.id)}
            >
              {m.nome}
            </button>
          ))}
        </div>
        <p className="nota">
          Automatica sceglie la versione ridotta su tablet e dispositivi meno potenti. Spenta lascia
          tutto lo spazio al lavoro.
        </p>
      </fieldset>

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
                void svuotaCorpus()
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
