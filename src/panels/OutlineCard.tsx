import { useMemo, useState } from 'react'
import { useStudioStore } from '../store'

/**
 * Scaletta del capitolo: lo Scrittore la propone, io la approvo o la rimando
 * indietro con un motivo. Le tre opzioni partono solo dopo l'approvazione.
 */
export function OutlineCard({ variante = 'in_linea' }: { variante?: 'in_linea' | 'ancorata' }) {
  const scaletta = useStudioStore((s) => s.scaletta)
  const approvazione = useStudioStore((s) => s.approvazioneScaletta)
  const giro = useStudioStore((s) => s.giroScaletta)
  const storico = useStudioStore((s) => s.storicoScaletta)
  const prefisso = useStudioStore((s) => s.prefissoScrittore)
  const approva = useStudioStore((s) => s.approvaScaletta)
  const rifiuta = useStudioStore((s) => s.rifiutaScaletta)
  const [motivo, setMotivo] = useState('')

  const titoli = useMemo(
    () => new Map((prefisso?.riferimenti ?? []).map((r) => [r.etichetta, `${r.titolo} — ${r.collocazione}`])),
    [prefisso],
  )

  if (!scaletta) return null
  const inAttesa = approvazione === 'in_attesa'

  return (
    <section
      className={`pannello scaletta ${inAttesa ? 'approvazione' : ''} ${variante === 'ancorata' ? 'approvazione-ancorata' : ''}`}
      aria-live="polite"
    >
      <h2 className="pannello-titolo filetto-doppio">
        {inAttesa ? 'Approva la scaletta' : 'Scaletta del capitolo'}
        <span className={`distintivo ${inAttesa ? 'distintivo-caldo' : ''}`}>
          {inAttesa ? `proposta ${giro}` : approvazione === 'approvata' ? 'approvata' : `proposta ${giro}`}
        </span>
      </h2>

      <h3 className="scaletta-titolo">{scaletta.titolo_capitolo}</h3>
      <ol className="scaletta-sezioni">
        {scaletta.sezioni.map((sez, i) => (
          <li key={i}>
            <strong>{sez.titoletto}</strong>
            <p className="fonte-testo">{sez.obiettivo}</p>
            <ul className="elenco-semplice">
              {sez.punti.map((p, j) => (
                <li key={j}>{p}</li>
              ))}
            </ul>
            {sez.riferimenti.length > 0 && (
              <div className="riferimenti-previsti">
                {sez.riferimenti.map((r) => (
                  <span key={r} className="rif-etichetta" title={titoli.get(r) ?? r}>
                    {r}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      {scaletta.nota_metodo && <p className="nota">Più stagioni: {scaletta.nota_metodo}</p>}

      {inAttesa && (
        <>
          <label className="campo-blocco">
            <span className="campo-etichetta">Cosa cambieresti (facoltativo)</span>
            <textarea
              className="campo area"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="es. unisci le sezioni 2 e 3, e dedica una sezione al confronto fra stagioni"
            />
          </label>
          <div className="azioni">
            <button
              type="button"
              className="bottone bottone-primario bottone-largo"
              onClick={() => {
                approva()
                setMotivo('')
              }}
            >
              Approvo la scaletta
            </button>
            <button
              type="button"
              className="bottone bottone-pericolo bottone-largo"
              onClick={() => {
                rifiuta(motivo)
                setMotivo('')
              }}
            >
              Rifalla
            </button>
          </div>
        </>
      )}

      {storico.length > 0 && (
        <ul className="storico">
          {storico.map((voce, i) => (
            <li key={i}>{voce}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
