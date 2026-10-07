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
        <span className="nota">{voci.length} parole · lo usano tutti gli assistenti</span>
      </div>
      <p className="nota">
        Gli assistenti usano queste parole e non i sinonimi. Se un capitolo usa una parola in modo diverso, la revisora te lo
        segnala. Le spiegazioni restano sulla finanza.
      </p>
      <input className="campo" placeholder="Cerca una parola" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Cerca nel glossario" />

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
                domanda={`Elimino "${v.termine}"?`}
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
              <span className="etichetta">Sinonimi da non usare (separati da una virgola)</span>
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
        <h3>Aggiungi una parola</h3>
        <input className="campo" placeholder="Parola" value={nuovo.termine} onChange={(e) => setNuovo({ ...nuovo, termine: e.target.value })} aria-label="Nuovo termine" />
        <textarea
          className="campo"
          rows={2}
          placeholder="Cosa vuol dire"
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
