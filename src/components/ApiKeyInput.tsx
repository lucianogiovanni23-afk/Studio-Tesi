import { useState } from 'react'
import { usePipelineStore } from '../store'
import { ANTHROPIC_MODEL } from '../lib/anthropic'

export function ApiKeyInput() {
  const apiKey = usePipelineStore((s) => s.apiKey)
  const setApiKey = usePipelineStore((s) => s.setApiKey)
  const clearApiKey = usePipelineStore((s) => s.clearApiKey)
  const globalError = usePipelineStore((s) => s.globalError)
  const [visible, setVisible] = useState(false)

  return (
    <section className="panel">
      <h2 className="panel-title">Chiave API Anthropic</h2>

      <p className="warning" role="note">
        <strong>Attenzione:</strong> questa chiave resta nel tuo browser mediante{' '}
        <code>localStorage</code> e viene inviata direttamente all'API Anthropic da questo client —
        non usarla in un progetto pubblico/distribuito ad altri utenti, perché chiunque potrebbe
        leggerla dal codice del browser. Per un uso condiviso servirebbe un backend che la nasconda.
      </p>

      <div className="key-row">
        <input
          className="key-input"
          type={visible ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          spellCheck={false}
          autoComplete="off"
          aria-label="Chiave API Anthropic"
        />
        <button type="button" className="btn btn-ghost" onClick={() => setVisible((v) => !v)}>
          {visible ? 'Nascondi' : 'Mostra'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            clearApiKey()
            setVisible(false)
          }}
          disabled={!apiKey}
        >
          Cancella
        </button>
      </div>

      <p className="hint">
        La chiave non viene mai inviata altrove: le richieste vanno solo a{' '}
        <code>api.anthropic.com/v1/messages</code> con il modello <code>{ANTHROPIC_MODEL}</code>.
        “Cancella” la rimuove anche da <code>localStorage</code>.
      </p>

      {globalError && (
        <p className="alert" role="alert">
          {globalError}
        </p>
      )}
    </section>
  )
}
