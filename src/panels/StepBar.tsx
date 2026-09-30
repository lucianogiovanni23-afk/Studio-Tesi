import { materialePronto, useStudioStore, type StudioState } from '../store'
import type { Passo } from '../types'

const PASSI: { id: Passo; etichetta: string }[] = [
  { id: 'materiale', etichetta: 'Materiale' },
  { id: 'ricerca', etichetta: 'Ricerca' },
  { id: 'fonti', etichetta: 'Fonti' },
  { id: 'scaletta', etichetta: 'Scaletta' },
  { id: 'capitolo', etichetta: 'Capitolo' },
]

type StatoPasso = 'fatto' | 'attesa' | 'in_corso' | 'futuro'

/** Solo valori primitivi: il selettore non crea oggetti nuovi a ogni render. */
function statoPasso(s: StudioState, passo: Passo): StatoPasso {
  const lavora = (agenti: string[]) => s.inEsecuzione && s.agenteAttivo !== null && agenti.includes(s.agenteAttivo)
  switch (passo) {
    case 'materiale':
      return materialePronto(s) ? 'fatto' : 'futuro'
    case 'ricerca':
      if (lavora(['lettore', 'ricercatore', 'selettore']) && s.approvazione !== 'in_attesa') return 'in_corso'
      return s.fonti.length > 0 ? 'fatto' : 'futuro'
    case 'fonti':
      if (s.approvazione === 'in_attesa') return 'attesa'
      return s.approvazione === 'approvata' ? 'fatto' : 'futuro'
    case 'scaletta':
      if (s.approvazioneScaletta === 'in_attesa') return 'attesa'
      if (s.approvazioneScaletta === 'approvata') return 'fatto'
      return lavora(['scrittore']) ? 'in_corso' : 'futuro'
    case 'capitolo':
      if (s.approvazioneScaletta === 'approvata' && lavora(['scrittore', 'controllore'])) return 'in_corso'
      return s.opzioni.some((o) => o.stato === 'ok') ? 'fatto' : 'futuro'
  }
}

function PassoBottone({ id, etichetta, numero }: { id: Passo; etichetta: string; numero: number }) {
  const stato = useStudioStore((s) => statoPasso(s, id))
  const attivo = useStudioStore((s) => s.passoAttivo === id)
  const setPasso = useStudioStore((s) => s.setPassoAttivo)

  const simbolo = stato === 'fatto' ? '✓' : stato === 'attesa' ? '!' : String(numero)
  const descrizione =
    stato === 'fatto' ? 'completato' : stato === 'attesa' ? 'serve la tua decisione' : stato === 'in_corso' ? 'in corso' : 'da fare'

  return (
    <li className={`passo passo-${stato} ${attivo ? 'passo-attivo' : ''}`}>
      <button
        type="button"
        onClick={() => setPasso(id)}
        aria-current={attivo ? 'step' : undefined}
        title={`${etichetta}: ${descrizione}`}
      >
        <span className="passo-numero" aria-hidden>
          {simbolo}
        </span>
        <span className="passo-nome">{etichetta}</span>
      </button>
    </li>
  )
}

/** Barra dei passi: Materiale → Ricerca → Fonti → Scaletta → Capitolo. */
export function StepBar() {
  return (
    <nav aria-label="Passi del lavoro">
      <ol className="barra-passi">
        {PASSI.map((p, i) => (
          <PassoBottone key={p.id} id={p.id} etichetta={p.etichetta} numero={i + 1} />
        ))}
      </ol>
    </nav>
  )
}
