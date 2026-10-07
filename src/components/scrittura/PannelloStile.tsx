import { useMemo, useState } from 'react'
import { selezionaParagrafo } from '../../agents/scrittore'
import { analizzaStile, type Segnalazione, type TipoSegnalazione } from '../../domain/stileTesto'
import { useStudio } from '../../store'
import type { Sezione } from '../../types'

const NOME: Record<TipoSegnalazione, string> = {
  formula: 'frase da IA',
  parola_jolly: 'parola ripetuta',
  connettivo: 'collegamento ripetuto',
  chiusura: 'chiusura che riassume',
  ritmo: 'ritmo',
  lessico: 'parole del corso',
}

/** Rilevatore di frasi tipiche dell'IA e di termini diversi dal lessico del corso, calcolato in codice. */
export function PannelloStile({ sez }: { sez: Sezione }) {
  const glossario = useStudio((s) => s.progetto.glossario)
  const [aperto, setAperto] = useState(false)
  const segnalazioni = useMemo(() => analizzaStile(sez.testo, glossario), [sez.testo, glossario])
  const parole = sez.testo.split(/\s+/).filter(Boolean).length
  const lessico = segnalazioni.filter((s) => s.tipo === 'lessico').length
  const ia = segnalazioni.length - lessico

  // Il pannello resta sempre al suo posto: comparire al primo salvataggio sposterebbe i bottoni sottostanti.
  if (!sez.testo.trim()) {
    return (
      <section className="pannello-stile">
        <button type="button" className="bottone bottone-piccolo" disabled>
          Frasi da IA: —
        </button>
      </section>
    )
  }

  const prepara = (s: Segnalazione) => {
    const delParagrafo = segnalazioni.filter((x) => x.paragrafo === s.paragrafo)
    const indicazione = [
      ...new Set(
        delParagrafo.map((x) => (x.tipo === 'lessico' ? `usa "${x.suggerimento.split('"')[1]}" invece di "${x.testo}"` : `togli "${x.testo}" (${x.spiegazione})`)),
      ),
    ].join('; ')
    selezionaParagrafo(sez.id, s.paragrafo, `Scrivi in modo diretto, senza formule da IA: ${indicazione}. Non cambiare il contenuto né le citazioni.`)
    document.querySelector('.comandi-scrittore-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <section className={`pannello-stile ${segnalazioni.length ? 'con-segnalazioni' : 'pulito'}`}>
      <button type="button" className="bottone bottone-piccolo" onClick={() => setAperto((a) => !a)} aria-expanded={aperto}>
        Frasi da IA: {ia} · parole del corso: {lessico === 0 ? 'ok' : `${lessico} da sistemare`}
      </button>
      {aperto && (
        <div className="stile-dettaglio">
          {segnalazioni.length === 0 ? (
            <p className="nota nota-ok">Tutto a posto: in {parole} parole niente frasi da IA e i termini del corso sono giusti.</p>
          ) : (
            <>
              <p className="nota">
                Controllo veloce e gratis. Da sole non sono errori, ma tutte insieme fanno sembrare il testo scritto da un'IA. Premi
                "Sistema questo paragrafo", poi "Riscrivi questo paragrafo" fra i comandi dello Scrittore. Oppure correggi tu.
              </p>
              <ul className="elenco-stile">
                {segnalazioni.map((s, i) => (
                  <li key={i} className={`stile-${s.tipo}`}>
                    <span className="pastiglia-origine">{NOME[s.tipo]}</span> <strong>§{s.paragrafo + 1}</strong> «{s.testo}» — {s.spiegazione}.
                    <span className="nota"> {s.suggerimento}</span>
                    <button type="button" className="bottone bottone-piccolo bottone-vuoto" onClick={() => prepara(s)}>
                      Sistema questo paragrafo
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
