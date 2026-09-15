import { useState } from 'react'
import { useStudioStore } from '../store'

export function ApiKeyPanel() {
  const apiKey = useStudioStore((s) => s.apiKey)
  const setApiKey = useStudioStore((s) => s.setApiKey)
  const clearApiKey = useStudioStore((s) => s.clearApiKey)
  const [visible, setVisible] = useState(false)

  const masked = apiKey ? `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}` : ''

  return (
    <section className="panel">
      <h2 className="panel-title">Chiave API Anthropic</h2>

      <div className="field-row">
        <input
          className="input"
          type={visible ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Chiave API Anthropic"
        />
        <button type="button" className="btn btn-ghost" onClick={() => setVisible((v) => !v)}>
          {visible ? 'Nascondi' : 'Mostra'}
        </button>
        {apiKey && (
          <button type="button" className="btn btn-ghost" onClick={clearApiKey}>
            Rimuovi
          </button>
        )}
      </div>

      {apiKey && !visible && <p className="hint">Chiave salvata: {masked}</p>}

      <p className="warning">
        <strong>Attenzione.</strong> Questa chiave resta nel tuo browser e viene inviata direttamente
        all'API Anthropic da questo client. Va bene per uso personale, ma non distribuire l'app ad
        altri utenti con la chiave dentro. Per un uso condiviso serve un backend che la nasconda.
      </p>
    </section>
  )
}
