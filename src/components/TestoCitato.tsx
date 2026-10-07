import { Fragment, useState } from 'react'
import { autoreAnno } from '../domain/bibliografia'
import { coloreCitazione, coloreMarcatore, paginaPerMarcatore, paragrafi, segmenti } from '../domain/citazioniTesto'
import { useStudio } from '../store'
import type { Citazione, Fonte } from '../types'
import { Esito } from './Esito'

const GIUDIZIO = {
  supportata: 'per la revisora la fonte lo dice davvero',
  parziale: 'per la revisora la fonte lo dice solo in parte',
  non_supportata: 'per la revisora la fonte non lo dice',
}

function etichetta(rif: string, citazioni: Citazione[], fonti: Fonte[], stile: boolean, paragrafo: string): string {
  if (!stile) return rif
  if (rif.startsWith('C')) {
    const p = citazioni.find((c) => c.rif === rif && c.passaggio)?.passaggio
    return p ? `(corso, p. ${p.pagine[0]})` : '(corso)'
  }
  const f = fonti.find((x) => x.numero === Number(rif.slice(1)))
  if (!f) return `(${rif}?)`
  const pagina = paginaPerMarcatore(rif, paragrafo, citazioni)
  return pagina ? `(${autoreAnno(f, false)}, p. ${pagina})` : autoreAnno(f)
}

/** Scheda di una citazione: estratto letterale, esito del controllo in codice, giudizio e fonte. */
export function DettaglioCitazioni({ rif, citazioni }: { rif: string; citazioni: Citazione[] }) {
  const fonti = useStudio((s) => s.progetto.fonti)
  const proprie = citazioni.filter((c) => c.rif === rif)
  const fonte = rif.startsWith('F') ? fonti.find((f) => f.numero === Number(rif.slice(1))) : undefined
  return (
    <div className="dettaglio-citazione" role="note">
      <p className="dettaglio-fonte-titolo">
        <strong>[{rif}]</strong>{' '}
        {fonte ? (
          <>
            {autoreAnno(fonte)} {fonte.titolo}
          </>
        ) : rif.startsWith('C') ? (
          (() => {
            const p = proprie.find((c) => c.passaggio)?.passaggio
            return p ? `Materiale del corso: ${p.file}, ${p.pagine[0] === p.pagine[1] ? `p. ${p.pagine[0]}` : `pp. ${p.pagine[0]}–${p.pagine[1]}`}` : 'Materiale del corso'
          })()
        ) : (
          'questa fonte non è in biblioteca'
        )}
      </p>
      {proprie.length === 0 ? (
        <p className="testo-errore">Per questo rimando non c'è nessuna citazione: la frase non ha un pezzo di fonte che la confermi.</p>
      ) : (
        proprie.map((c, i) => (
          <div key={i} className={`citazione-voce colore-${coloreCitazione(c)}`}>
            <p className="affermazione">{c.affermazione}</p>
            <blockquote className="estratto">«{c.estratto}»</blockquote>
            <p className="nota">
              {c.testuale && <Esito esito={c.testuale} />} {c.pagina && <strong>p. {c.pagina}</strong>} {c.giudizio && <span>{GIUDIZIO[c.giudizio]}</span>}
              {c.motivo && <span> — {c.motivo}</span>}
            </p>
          </div>
        ))
      )}
    </div>
  )
}

/**
 * Testo di una sezione con i marcatori colorati: verde verificato, ambra quasi
 * letterale o parziale, rosso non ritrovato o non supportato. Toccando un
 * marcatore si apre il dettaglio. Con `stile` i marcatori mostrano il rimando "(Rossi, 2021)".
 */
export function TestoCitato({ testo, citazioni, stile = false, classe = '' }: { testo: string; citazioni: Citazione[]; stile?: boolean; classe?: string }) {
  const fonti = useStudio((s) => s.progetto.fonti)
  const [aperto, setAperto] = useState<{ p: number; k: number; rif: string } | null>(null)

  return (
    <div className={`testo-citato ${classe}`}>
      {paragrafi(testo).map((par, p) => (
        <Fragment key={p}>
          <p>
            {segmenti(par).map((seg, k) =>
              seg.tipo === 'testo' ? (
                <Fragment key={k}>{seg.testo}</Fragment>
              ) : (
                <button
                  key={k}
                  type="button"
                  className={`marcatore-cit cit-${coloreMarcatore(seg.rif, citazioni)} ${stile ? 'marcatore-stile' : ''}`}
                  aria-expanded={aperto?.p === p && aperto.k === k}
                  onClick={() => setAperto(aperto?.p === p && aperto.k === k ? null : { p, k, rif: seg.rif })}
                >
                  {etichetta(seg.rif, citazioni, fonti, stile, par)}
                </button>
              ),
            )}
          </p>
          {aperto?.p === p && <DettaglioCitazioni rif={aperto.rif} citazioni={citazioni} />}
        </Fragment>
      ))}
    </div>
  )
}
