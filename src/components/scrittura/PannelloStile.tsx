import { selezionaParagrafo } from '../../agents/scrittore'
import { type Segnalazione, type TipoSegnalazione } from '../../domain/stileTesto'
import type { Sezione } from '../../types'
import { scegliVoce } from './statoPagina'
import { useStile } from './stile'

const NOME: Record<TipoSegnalazione, string> = {
  formula: 'frase da IA',
  parola_jolly: 'parola ripetuta',
  connettivo: 'collegamento ripetuto',
  chiusura: 'chiusura che riassume',
  ritmo: 'ritmo',
  lessico: 'parole del corso',
}

/** Elenco delle segnalazioni, aperto dalla barra sotto il foglio. */
export function DettaglioStile({ sez }: { sez: Sezione }) {
  const { segnalazioni } = useStile(sez)
  const parole = sez.testo.split(/\s+/).filter(Boolean).length

  const prepara = (s: Segnalazione) => {
    const delParagrafo = segnalazioni.filter((x) => x.paragrafo === s.paragrafo)
    const indicazione = [
      ...new Set(
        delParagrafo.map((x) => (x.tipo === 'lessico' ? `usa "${x.suggerimento.split('"')[1]}" invece di "${x.testo}"` : `togli "${x.testo}" (${x.spiegazione})`)),
      ),
    ].join('; ')
    selezionaParagrafo(sez.id, s.paragrafo, `Scrivi in modo diretto, senza formule da IA: ${indicazione}. Non cambiare il contenuto né le citazioni.`)
    // Si apre subito la conferma di "Riscrivi questo paragrafo", con l'indicazione già scritta.
    scegliVoce('riscrivi')
    document.querySelector('.comandi-scrittore-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <section className={`pannello-stile stile-dettaglio ${segnalazioni.length ? 'con-segnalazioni' : 'pulito'}`}>
      {segnalazioni.length === 0 ? (
        <p className="nota nota-ok">Tutto a posto: in {parole} parole niente frasi da IA e i termini del corso sono giusti.</p>
      ) : (
        <>
          <p className="nota">
            Controllo veloce e gratis. Da sole non sono errori, ma tutte insieme fanno sembrare il testo scritto da un'IA. Premi "Sistema questo
            paragrafo": si apre "Riscrivi questo paragrafo" con l'indicazione già pronta. Oppure correggi tu.
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
    </section>
  )
}
