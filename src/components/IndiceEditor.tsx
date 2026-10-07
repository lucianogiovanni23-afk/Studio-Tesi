import { useState } from 'react'
import { useStudio } from '../store'
import { Conferma } from './Conferma'

/** Modifica dell'indice: capitoli e sezioni, con obiettivo di ciascuna sezione. */
export function IndiceEditor() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  const st = useStudio.getState
  const [nuovoCap, setNuovoCap] = useState('')
  const [nuoveSez, setNuoveSez] = useState<Record<string, string>>({})

  return (
    <div className="indice-editor">
      {capitoli.map((c, i) => (
        <fieldset key={c.id} className="cap-editor">
          <legend>Capitolo {i + 1}</legend>
          <div className="riga-editor">
            <input
              className="campo"
              value={c.titolo}
              onChange={(e) => st().rinominaCapitolo(c.id, e.target.value)}
              aria-label={`Titolo del capitolo ${i + 1}`}
            />
            <button type="button" className="icona" onClick={() => st().spostaCapitolo(c.id, -1)} disabled={i === 0} aria-label="Sposta su">
              ↑
            </button>
            <button
              type="button"
              className="icona"
              onClick={() => st().spostaCapitolo(c.id, 1)}
              disabled={i === capitoli.length - 1}
              aria-label="Sposta giù"
            >
              ↓
            </button>
            <Conferma
              classe="icona"
              etichetta="✕"
              domanda={c.sezioni.some((s) => s.testo.trim()) ? 'Nel capitolo c\'è del testo. Lo cancello?' : 'Cancello il capitolo?'}
              conferma="Elimina"
              pericolosa
              onConferma={() => st().rimuoviCapitolo(c.id)}
            />
          </div>
          <ol className="sez-editor">
            {c.sezioni.map((s, j) => (
              <li key={s.id}>
                <div className="riga-editor">
                  <span className="numero-sez">
                    {i + 1}.{j + 1}
                  </span>
                  <input
                    className="campo"
                    value={s.titolo}
                    onChange={(e) => st().aggiornaSezione(c.id, s.id, { titolo: e.target.value })}
                    aria-label={`Titolo della sezione ${i + 1}.${j + 1}`}
                  />
                  <button type="button" className="icona" onClick={() => st().spostaSezione(c.id, s.id, -1)} disabled={j === 0} aria-label="Sposta su">
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icona"
                    onClick={() => st().spostaSezione(c.id, s.id, 1)}
                    disabled={j === c.sezioni.length - 1}
                    aria-label="Sposta giù"
                  >
                    ↓
                  </button>
                  <Conferma
                    classe="icona"
                    etichetta="✕"
                    domanda={s.testo.trim() ? 'Nella sezione c\'è del testo. La cancello?' : 'Cancello la sezione?'}
                    conferma="Elimina"
                    pericolosa
                    onConferma={() => st().rimuoviSezione(c.id, s.id)}
                  />
                </div>
                <textarea
                  className="campo campo-obiettivo"
                  rows={2}
                  value={s.obiettivo}
                  placeholder="A cosa serve questa sezione? Cosa deve dimostrare?"
                  onChange={(e) => st().aggiornaSezione(c.id, s.id, { obiettivo: e.target.value })}
                  aria-label={`Obiettivo della sezione ${i + 1}.${j + 1}`}
                />
              </li>
            ))}
          </ol>
          <form
            className="riga-editor"
            onSubmit={(e) => {
              e.preventDefault()
              const t = (nuoveSez[c.id] ?? '').trim()
              if (!t) return
              st().aggiungiSezione(c.id, t)
              setNuoveSez((x) => ({ ...x, [c.id]: '' }))
            }}
          >
            <input
              className="campo"
              placeholder="Nuova sezione"
              value={nuoveSez[c.id] ?? ''}
              onChange={(e) => setNuoveSez((x) => ({ ...x, [c.id]: e.target.value }))}
              aria-label={`Nuova sezione nel capitolo ${i + 1}`}
            />
            <button type="submit" className="bottone">
              Aggiungi sezione
            </button>
          </form>
        </fieldset>
      ))}
      <form
        className="riga-editor"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nuovoCap.trim()) return
          st().aggiungiCapitolo(nuovoCap.trim())
          setNuovoCap('')
        }}
      >
        <input
          className="campo"
          placeholder="Nuovo capitolo"
          value={nuovoCap}
          onChange={(e) => setNuovoCap(e.target.value)}
          aria-label="Titolo del nuovo capitolo"
        />
        <button type="submit" className="bottone">
          Aggiungi capitolo
        </button>
      </form>
    </div>
  )
}
