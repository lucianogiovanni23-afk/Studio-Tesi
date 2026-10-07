import '../styles/corso.css'
import { useMemo, useState } from 'react'
import { Conferma } from '../components/Conferma'
import { useStudio } from '../store'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'

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
    <div className="glossario-pagina glossario">
      <div className="glossario-testa">
        <h2>
          Glossario
          <Info>
            Gli assistenti usano queste parole e non i sinonimi. Se un capitolo usa una parola in modo diverso, il revisore te lo segnala. Le
            spiegazioni restano sulla finanza.
          </Info>
        </h2>
        <span className="nota">{voci.length} parole · lo usano tutti gli assistenti</span>
      </div>

      <div className="corso-cerca glossario-cerca" role="search">
        <Icona nome="cerca" dimensione={20} className="corso-cerca-lente" />
        <input
          className="corso-cerca-campo"
          type="search"
          placeholder="Cerca una parola"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          aria-label="Cerca nel glossario"
        />
      </div>

      {visibili.length === 0 && <p className="nota corso-vuoto">Nessuna parola trovata.</p>}

      <ul className="glossario-voci elenco-glossario">
        {visibili.map((v) => (
          <li key={v.id} className="glossario-voce">
            <div className="glossario-voce-testa">
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
        className="pannello glossario-nuova nuova-voce"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nuovo.termine.trim()) return
          st().aggiungiVoce({ termine: nuovo.termine.trim(), definizione: nuovo.definizione.trim(), varianti: [], nota: '' })
          setNuovo({ termine: '', definizione: '' })
        }}
      >
        <h3 className="glossario-nuova-titolo">
          <Icona nome="piu" /> Aggiungi una parola
        </h3>
        <input className="campo" placeholder="Parola" value={nuovo.termine} onChange={(e) => setNuovo({ ...nuovo, termine: e.target.value })} aria-label="Nuovo termine" />
        <textarea
          className="campo"
          rows={2}
          placeholder="Cosa vuol dire"
          value={nuovo.definizione}
          onChange={(e) => setNuovo({ ...nuovo, definizione: e.target.value })}
          aria-label="Definizione del nuovo termine"
        />
        <button type="submit" className="bottone bottone-primario">
          Aggiungi al glossario
        </button>
      </form>
    </div>
  )
}
