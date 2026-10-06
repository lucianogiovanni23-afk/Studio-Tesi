import { InArrivo } from '../components/InArrivo'
import { FONTI_PRIORITARIE, VARIETA, ZONE } from '../domain/dominio'
import { useStudio } from '../store'

export function Biblioteca() {
  const fonti = useStudio((s) => s.progetto.fonti.length)
  return (
    <InArrivo titolo="Biblioteca" fase={2}>
      <p>
        La biblioteca si accumula nel tempo: PDF di paper che carichi tu, fonti web, fonti dai cataloghi accademici e
        fonti istituzionali. Ogni fonte avrà una scheda di lettura correggibile (domanda, metodo, risultati, rilevanza,
        frasi chiave verificate), i tag per tema (raccolta, frantoio, prezzi, eventi meteo, strumenti di copertura), lo
        stato (da leggere, letta, usata nel capitolo) e una tabella della letteratura.
      </p>
      <p className="nota">Fonti attualmente in biblioteca: {fonti}.</p>
    </InArrivo>
  )
}

export function Ricerca() {
  return (
    <InArrivo titolo="Ricerca" fase={2}>
      <p>
        Scriverai una domanda di ricerca; il Bibliotecario cercherà prima nei cataloghi accademici gratuiti (OpenAlex,
        Crossref, Semantic Scholar), poi nei siti istituzionali, poi sul web. Ogni URL sarà controllato in codice contro
        i risultati reali e gli estratti contro il testo scaricato. Approverai tu i risultati prima che entrino in
        biblioteca.
      </p>
      <p>Fonti da cercare per prime:</p>
      <ul className="elenco-semplice">
        {FONTI_PRIORITARIE.map((f) => (
          <li key={f.nome}>
            <strong>{f.nome}</strong>: {f.cosa}
          </li>
        ))}
      </ul>
      <p className="nota">
        Zone: {ZONE.join(', ')}. Varietà: {VARIETA.join(', ')}.
      </p>
    </InArrivo>
  )
}

export function Revisione() {
  return (
    <InArrivo titolo="Revisione" fase={4}>
      <p>
        Incollerai le osservazioni del relatore e le collegherai a un capitolo: il Revisore proporrà le modifiche e le
        accetterai o rifiuterai una per una. Ci sarà anche il controllo di tutta la tesi: termini usati in modo diverso
        fra capitoli, ripetizioni, sconfinamenti di materia, e la bibliografia nello stile scelto.
      </p>
    </InArrivo>
  )
}

export function Chat() {
  return (
    <InArrivo titolo="Chat" fase={4}>
      <p>
        Una chat che conosce tutta la tesi: capitoli, biblioteca, osservazioni del relatore, stato degli agenti e costi.
        Avrà lo stesso vincolo di materia degli agenti.
      </p>
    </InArrivo>
  )
}
