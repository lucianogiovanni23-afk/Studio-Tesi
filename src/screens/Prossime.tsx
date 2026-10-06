import { InArrivo } from '../components/InArrivo'

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
