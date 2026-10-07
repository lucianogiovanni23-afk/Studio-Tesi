import { useMemo, useState } from 'react'
import { Conferma } from '../components/Conferma'
import { useStudio } from '../store'

/** Glossario condiviso da tutti gli agenti: entra nei loro prompt. */
export function Glossario() {
  const voci = useStudio((s) => s.progetto.glossario)
  const st = useStudio.getState
  const [filtro, setFiltro] = useState('')
  const [nuovo, setNuovo] = useState({ termine: '', definizione: '' })

  const visibili = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    const ordinate = [...voci].sort((a, b) => a.termine.localeCompare(b.termine, 'it'))
    return f ? ordinate.filter((v) => `${v.termine} ${v.definizione} ${v.varianti.join(' ')}`.toLowerCase().includes(f)) : ordinate
  }, [voci, filtro])

  return (
    <section className="pannello glossario">
      <div className="pannello-testa">
        <h2>Glossario</h2>
        <span className="nota">{voci.length} termini · condiviso da tutti gli agenti</span>
      </div>
      <p className="nota">
        Gli agenti usano questi termini e non le varianti: il Revisore segnalerà i capitoli che usano un termine in modo
        diverso. Le definizioni restano sul piano finanziario.
      </p>
      <input className="campo" placeholder="Cerca un termine" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Cerca nel glossario" />

      <ul className="elenco-glossario">
        {visibili.map((v) => (
          <li key={v.id}>
            <div className="riga-editor">
              <input
                className="campo campo-termine"
                value={v.termine}
                onChange={(e) => st().aggiornaVoce(v.id, { termine: e.target.value })}
                aria-label="Termine"
              />
              {v.origine === 'corso' && (
                <span className="pastiglia-origine" title={v.collocazione}>
                  dal corso · {v.occorrenze} volte
                </span>
              )}
              <Conferma
                classe="icona"
                etichetta="✕"
                domanda={`Eliminare "${v.termine}"?`}
                conferma="Elimina"
                pericolosa
                onConferma={() => st().rimuoviVoce(v.id)}
              />
            </div>
            <textarea
              className="campo"
              rows={3}
              value={v.definizione}
              onChange={(e) => st().aggiornaVoce(v.id, { definizione: e.target.value })}
              aria-label={`Definizione di ${v.termine}`}
            />
            <label className="campo-blocco">
              <span className="etichetta">Varianti da uniformare (separate da virgola)</span>
              <input
                className="campo"
                defaultValue={v.varianti.join(', ')}
                onBlur={(e) => st().aggiornaVoce(v.id, { varianti: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
              />
            </label>
          </li>
        ))}
      </ul>

      <form
        className="nuova-voce"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nuovo.termine.trim()) return
          st().aggiungiVoce({ termine: nuovo.termine.trim(), definizione: nuovo.definizione.trim(), varianti: [], nota: '' })
          setNuovo({ termine: '', definizione: '' })
        }}
      >
        <h3>Nuovo termine</h3>
        <input className="campo" placeholder="Termine" value={nuovo.termine} onChange={(e) => setNuovo({ ...nuovo, termine: e.target.value })} aria-label="Nuovo termine" />
        <textarea
          className="campo"
          rows={2}
          placeholder="Definizione"
          value={nuovo.definizione}
          onChange={(e) => setNuovo({ ...nuovo, definizione: e.target.value })}
          aria-label="Definizione del nuovo termine"
        />
        <button type="submit" className="bottone">
          Aggiungi al glossario
        </button>
      </form>
    </section>
  )
}
