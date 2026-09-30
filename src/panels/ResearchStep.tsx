import { useMemo, useState } from 'react'
import { useStudioStore } from '../store'
import { FonteCard } from './FonteCard'

function Dossier() {
  const dossier = useStudioStore((s) => s.dossier)
  const info = useStudioStore((s) => s.infoLettura)
  const [aperto, setAperto] = useState(false)
  if (!dossier) return null

  return (
    <section className="pannello">
      <button
        type="button"
        className="riga-espandibile"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
      >
        <span aria-hidden>{aperto ? '▾' : '▸'}</span> Dossier del corso
        <span className="nota-inline">{dossier.concetti_chiave.length} concetti chiave</span>
      </button>
      {info && (
        <p className="nota">
          Il Lettore ha letto {info.passaggi} passaggi da {info.file} file
          {info.totale > info.caratteri
            ? `, i più pertinenti: ${Math.round((info.caratteri / Math.max(1, info.totale)) * 100)}% del materiale.`
            : ': tutto il materiale.'}
        </p>
      )}

      {aperto && (
        <div className="dossier">
          <h3 className="sotto-titolo">Concetti chiave</h3>
          <ul className="elenco-semplice">
            {dossier.concetti_chiave.map((c, i) => (
              <li key={i}>
                <strong>{c.termine}</strong> — {c.definizione}
                <em className="riferimento"> ({c.lezione_di_riferimento})</em>
              </li>
            ))}
          </ul>

          <h3 className="sotto-titolo">Metriche applicabili</h3>
          <ul className="elenco-semplice">
            {dossier.metriche_applicabili.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>

          <h3 className="sotto-titolo">Collegamenti con l'argomento</h3>
          <ul className="elenco-semplice">
            {dossier.collegamenti_argomento.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>

          <h3 className="sotto-titolo">Sintesi dei dati del caso</h3>
          <p className="paragrafo">{dossier.sintesi_dati_caso}</p>
        </div>
      )}
    </section>
  )
}

function Fonti() {
  const fonti = useStudioStore((s) => s.fonti)
  const scartate = useStudioStore((s) => s.fontiScartate)
  const selezionate = useStudioStore((s) => s.selezionate)
  const avviso = useStudioStore((s) => s.avvisoRicerca)
  const [mostraScartate, setMostraScartate] = useState(false)
  const scelte = useMemo(() => new Set(selezionate.map((s) => s.url)), [selezionate])

  if (fonti.length === 0 && !avviso) return null
  const lette = fonti.filter((f) => f.letta).length
  const citabili = fonti.filter((f) => f.estratti.length > 0).length

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">Fonti dalla ricerca web</h2>
      {avviso && (
        <p className="allerta allerta-avviso" role="alert">
          {avviso}
        </p>
      )}
      <p className="nota">
        {fonti.length} con URL verificato · {lette} lette per intero · {citabili} con estratti confermati ·{' '}
        {selezionate.length} selezionate
      </p>

      <ul className="elenco-fonti">
        {fonti.map((f) => (
          <FonteCard key={f.url} fonte={f} selezionata={scelte.has(f.url)} />
        ))}
      </ul>

      {scartate.length > 0 && (
        <>
          <button
            type="button"
            className="bottone bottone-vuoto bottone-piccolo"
            onClick={() => setMostraScartate((v) => !v)}
          >
            {mostraScartate ? 'Nascondi' : 'Mostra'} le {scartate.length} fonti scartate dal Ricercatore
          </button>
          {mostraScartate && (
            <ul className="elenco-fonti elenco-fonti-tenue">
              {scartate.map((s, i) => (
                <li key={i} className="fonte">
                  <strong>{s.titolo}</strong>
                  <span className="fonte-url">{s.url}</span>
                  <p className="fonte-testo">Scartata perché: {s.motivo}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

export function ResearchStep() {
  const dossier = useStudioStore((s) => s.dossier)
  const fonti = useStudioStore((s) => s.fonti)
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)

  if (!dossier && fonti.length === 0) {
    return (
      <section className="pannello">
        <p className="nota">
          {inEsecuzione
            ? 'Il Lettore sta studiando il materiale: qui compariranno il dossier del corso e le fonti trovate.'
            : 'Qui compariranno il dossier del corso preparato dal Lettore e le fonti che il Ricercatore trova e legge sul web.'}
        </p>
      </section>
    )
  }

  return (
    <>
      <Dossier />
      <Fonti />
    </>
  )
}

/** Fonti già approvate, con l'etichetta con cui lo Scrittore le cita. */
export function FontiApprovate() {
  const fonti = useStudioStore((s) => s.fonti)
  const selezionate = useStudioStore((s) => s.selezionate)
  const approvazione = useStudioStore((s) => s.approvazione)
  const storico = useStudioStore((s) => s.storicoApprovazioni)
  const perScelta = useMemo(() => new Map(selezionate.map((s) => [s.url, s.motivo])), [selezionate])
  const approvate = useMemo(() => fonti.filter((f) => perScelta.has(f.url)), [fonti, perScelta])

  if (approvazione !== 'approvata') {
    return (
      <section className="pannello">
        <p className="nota">
          Quando il Selettore avrà scelto, qui approverai le fonti: nessuna pagina viene scritta prima
          della tua decisione.
        </p>
      </section>
    )
  }

  return (
    <section className="pannello">
      <h2 className="pannello-titolo filetto-doppio">
        Fonti approvate
        <span className="distintivo">{approvate.length}</span>
      </h2>
      <ul className="elenco-fonti">
        {approvate.map((f, i) => (
          <FonteCard key={f.url} fonte={f} etichetta={`F${i + 1}`} motivo={perScelta.get(f.url)} />
        ))}
      </ul>
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
