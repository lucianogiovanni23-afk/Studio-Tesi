import { useState } from 'react'
import { useStudioStore } from '../store'

/**
 * Punto di approvazione umana: la pipeline si ferma qui e lo Scrittore non
 * parte in nessun caso prima che io abbia approvato.
 */
export function ApprovalCard({ variante = 'in_linea' }: { variante?: 'in_linea' | 'ancorata' }) {
  const approvazione = useStudioStore((s) => s.approvazione)
  const giro = useStudioStore((s) => s.giroApprovazione)
  const fonti = useStudioStore((s) => s.fonti)
  const selezionate = useStudioStore((s) => s.selezionate)
  const scartate = useStudioStore((s) => s.scartateDalSelettore)
  const storico = useStudioStore((s) => s.storicoApprovazioni)
  const approva = useStudioStore((s) => s.approva)
  const rifiuta = useStudioStore((s) => s.rifiuta)

  const [motivo, setMotivo] = useState('')
  const [mostraScartate, setMostraScartate] = useState(false)

  if (approvazione !== 'in_attesa') return null

  const perUrl = new Map(fonti.map((f) => [f.url, f]))

  return (
    <section
      className={`pannello approvazione ${variante === 'ancorata' ? 'approvazione-ancorata' : ''}`}
      aria-live="polite"
    >
      <h2 className="pannello-titolo filetto-doppio">
        Serve la tua approvazione
        <span className="distintivo distintivo-caldo">giro {giro}</span>
      </h2>

      <p className="nota">
        Il Selettore ha tenuto {selezionate.length} fonti su {fonti.length}. Lo Scrittore parte solo
        dopo la tua approvazione.
      </p>

      <ul className="elenco-fonti">
        {selezionate.map((scelta) => {
          const fonte = perUrl.get(scelta.url)
          return (
            <li key={scelta.url} className="fonte">
              <div className="fonte-testa">
                <strong>{fonte?.titolo ?? scelta.url}</strong>
                {fonte && <span className="etichetta-tipo">{fonte.tipo}</span>}
                <span className="etichetta etichetta-ok">URL verificato</span>
              </div>
              <a className="fonte-url" href={scelta.url} target="_blank" rel="noreferrer noopener">
                {scelta.url}
              </a>
              {fonte?.descrizione && <p className="fonte-testo">{fonte.descrizione}</p>}
              <p className="fonte-testo fonte-motivo">Tenuta perché: {scelta.motivo}</p>
            </li>
          )
        })}
      </ul>

      {scartate.length > 0 && (
        <>
          <button
            type="button"
            className="bottone bottone-vuoto bottone-piccolo"
            onClick={() => setMostraScartate((v) => !v)}
          >
            {mostraScartate ? 'Nascondi' : 'Mostra'} le {scartate.length} fonti scartate
          </button>
          {mostraScartate && (
            <ul className="elenco-fonti elenco-fonti-tenue">
              {scartate.map((s) => {
                const fonte = perUrl.get(s.url)
                return (
                  <li key={s.url} className="fonte">
                    <strong>{fonte?.titolo ?? s.url}</strong>
                    <a className="fonte-url" href={s.url} target="_blank" rel="noreferrer noopener">
                      {s.url}
                    </a>
                    <p className="fonte-testo">Scartata perché: {s.motivo}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <label className="campo-blocco">
        <span className="campo-etichetta">Motivo (facoltativo, se non ti convince)</span>
        <textarea
          className="campo area"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="es. servono più paper accademici e meno articoli divulgativi"
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
          Approvo
        </button>
        <button
          type="button"
          className="bottone bottone-pericolo bottone-largo"
          onClick={() => {
            rifiuta(motivo)
            setMotivo('')
          }}
        >
          Non mi convince
        </button>
      </div>

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
