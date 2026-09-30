import { useStudioStore } from '../store'

const ICONA = { ok: '✓', problema: '✕', non_applicabile: '–' }

/** Checklist finale del Controllore. */
export function ChecklistPanel() {
  const referto = useStudioStore((s) => s.referto)
  const inquadra = useStudioStore((s) => s.inquadra)
  const scenaAttiva = useStudioStore((s) => s.modalitaScena !== 'spenta')
  if (!referto) return null

  const deboli = referto.giudizi.filter((g) => g.giudizio !== 'supportata').length

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">Verifiche del Controllore</h2>
      <ul className="checklist">
        {referto.checklist.map((v) => (
          <li key={v.id} className={`voce-checklist voce-${v.esito}`}>
            <span className="voce-icona" aria-hidden>
              {ICONA[v.esito]}
            </span>
            <div>
              <strong>{v.voce}</strong>
              <p className="fonte-testo">{v.dettaglio}</p>
              {scenaAttiva && v.esito === 'problema' && v.agente && v.agente !== 'controllore' && (
                <button type="button" className="bottone bottone-minuscolo" onClick={() => inquadra(v.agente!)}>
                  Vai al {v.agente}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="nota">
        {referto.giudizi.length} citazioni giudicate una per una
        {deboli > 0 ? `, ${deboli} deboli o non supportate: sono segnate in ambra o in rosso nel testo.` : ', tutte supportate.'}
      </p>
    </section>
  )
}
