import { useMemo } from 'react'
import { autoreAnno } from '../../domain/bibliografia'
import { useStudio } from '../../store'
import type { Sezione } from '../../types'
import { Icona } from '../../ui/Icona'
import { Esito } from '../Esito'
import { fontiPertinenti } from './pertinenza'

/** Contenuto del cassetto "Fonti e appunti": il materiale utile alla sezione aperta. */
export function StrumentiSezione({ sez }: { sez: Sezione }) {
  const quadro = useStudio((s) => s.progetto.quadro)
  const glossario = useStudio((s) => s.progetto.glossario)
  const fonti = useStudio((s) => s.progetto.fonti)
  const vai = useStudio((s) => s.vai)
  const testoMinuscolo = (sez.titolo + ' ' + sez.obiettivo).toLowerCase()

  // Prima le fonti approvate per la sezione, poi le più vicine al suo titolo e obiettivo.
  const approvate = useMemo(() => fonti.filter((f) => sez.fontiApprovate.includes(f.id)), [fonti, sez.fontiApprovate])
  const utili = useMemo(
    () =>
      fontiPertinenti(fonti, sez)
        .filter((x) => x.peso > 0 && !sez.fontiApprovate.includes(x.f.id))
        .slice(0, 5)
        .map((x) => x.f),
    [fonti, sez],
  )

  const concetti = useMemo(() => {
    if (!quadro) return []
    return quadro.concetti
      .map((c) => ({ c, peso: c.termine.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && testoMinuscolo.includes(w)).length }))
      .sort((a, b) => b.peso - a.peso)
      .slice(0, 5)
      .map((x) => x.c)
  }, [quadro, testoMinuscolo])

  return (
    <div className="sc-strumenti" aria-label="Fonti utili per la sezione" role="region">
      <section className="sc-strumenti-gruppo">
        <h3>
          <Icona nome="spunta" /> Fonti della sezione
        </h3>
        {approvate.length === 0 ? (
          <p className="nota">{sez.fontiConfermate ? 'Solo il materiale del corso.' : 'Non le hai ancora scelte.'}</p>
        ) : (
          <ul className="elenco-concetti sc-schede">
            {approvate.map((f) => (
              <li key={f.id}>
                <strong>
                  <code>[F{f.numero}]</code> {autoreAnno(f)}
                </strong>
                <span>{f.titolo}</span>
                {f.scheda && <small>{f.scheda.risultati.slice(0, 160)}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sc-strumenti-gruppo">
        <h3>
          <Icona nome="libri" /> Altre fonti utili
        </h3>
        {fonti.length === 0 ? (
          <p className="nota">
            La biblioteca è vuota.{' '}
            <button type="button" className="link" onClick={() => vai('ricerca')}>
              Fai una ricerca
            </button>
          </p>
        ) : utili.length === 0 ? (
          <p className="nota">Nessun'altra fonte sembra c'entrare con questa parte.</p>
        ) : (
          <ul className="elenco-concetti sc-schede">
            {utili.map((f) => (
              <li key={f.id}>
                <strong>
                  <code>[F{f.numero}]</code> {autoreAnno(f)}
                </strong>
                <span>{f.titolo}</span>
                <small>{f.scheda ? (f.scheda.corretta ? 'scheda controllata' : 'scheda da controllare') : 'senza scheda'}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sc-strumenti-gruppo">
        <h3>
          <Icona nome="libro" /> Dal corso
        </h3>
        {concetti.length === 0 ? (
          <p className="nota">
            {quadro ? 'Nessun concetto del corso c\'entra con questo titolo.' : 'I concetti del corso non sono ancora pronti.'}{' '}
            <button type="button" className="link" onClick={() => vai('corso')}>
              Vai al corso
            </button>
          </p>
        ) : (
          <ul className="elenco-concetti sc-schede">
            {concetti.map((c) => (
              <li key={c.termine}>
                <strong>
                  {c.termine} <Esito esito={c.esito} />
                </strong>
                <span>{c.definizione}</span>
                <small>{c.collocazione}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sc-strumenti-gruppo">
        <h3>
          <Icona nome="parola" /> Glossario
        </h3>
        {glossario.length === 0 ? (
          <p className="nota">Il glossario è ancora vuoto.</p>
        ) : (
          <ul className="elenco-glossario-breve">
            {glossario.slice(0, 12).map((v) => (
              <li key={v.id} title={v.definizione}>
                {v.termine}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
