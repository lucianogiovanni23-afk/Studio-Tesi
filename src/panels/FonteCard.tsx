import { useState } from 'react'
import type { Fonte } from '../types'

/** Scheda di una fonte web: URL verificato, pagina letta, estratti confermati in codice. */
export function FonteCard({
  fonte,
  etichetta,
  motivo,
  selezionata,
}: {
  fonte: Fonte
  /** F1, F2… quando la fonte è già fra i riferimenti dello Scrittore. */
  etichetta?: string
  motivo?: string
  selezionata?: boolean
}) {
  const [estrattiAperti, setEstrattiAperti] = useState(false)

  return (
    <li className="fonte">
      <div className="fonte-testa">
        {etichetta && <span className="rif-etichetta">{etichetta}</span>}
        <strong>{fonte.titolo}</strong>
        <span className="etichetta-tipo">{fonte.tipo}</span>
        {fonte.verificata && <span className="etichetta etichetta-ok">URL verificato</span>}
        {fonte.letta ? (
          <span className="etichetta etichetta-ok">pagina letta</span>
        ) : (
          <span className="etichetta etichetta-tenue">non letta</span>
        )}
        {selezionata && <span className="etichetta etichetta-ok">selezionata</span>}
      </div>
      <a className="fonte-url" href={fonte.url} target="_blank" rel="noreferrer noopener">
        {fonte.url}
      </a>
      {fonte.descrizione && <p className="fonte-testo">{fonte.descrizione}</p>}
      {motivo && <p className="fonte-testo fonte-motivo">Tenuta perché: {motivo}</p>}

      {fonte.estratti.length > 0 ? (
        <>
          <button
            type="button"
            className="bottone bottone-minuscolo"
            onClick={() => setEstrattiAperti((v) => !v)}
            aria-expanded={estrattiAperti}
          >
            {estrattiAperti ? 'Nascondi' : 'Mostra'} {fonte.estratti.length} estratti verificati
          </button>
          {estrattiAperti && (
            <ul className="estratti">
              {fonte.estratti.map((e, i) => (
                <li key={i}>“{e}”</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="fonte-testo fonte-avviso">
          Nessun estratto confermato sul testo della pagina: questa fonte non potrà essere citata.
        </p>
      )}
    </li>
  )
}
