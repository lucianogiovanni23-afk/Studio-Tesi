import { useStudioStore } from '../store'
import type { Vista } from '../types'
import { ApprovalCard } from './ApprovalCard'
import { ChatPanel } from './ChatPanel'
import { ChecklistPanel } from './ChecklistPanel'
import { Console } from './Console'
import { CostPanel } from './CostPanel'
import { OutlineCard } from './OutlineCard'
import { FontiApprovate, ResearchStep } from './ResearchStep'
import { RunBar } from './RunBar'
import { SettingsPanel } from './SettingsPanel'
import { StepBar } from './StepBar'
import { TeamStrip } from './TeamStrip'
import { UploadPanel } from './UploadPanel'
import { WriterOptions } from './WriterOptions'

const VISTE: { id: Vista; etichetta: string }[] = [
  { id: 'lavoro', etichetta: 'Lavoro' },
  { id: 'console', etichetta: 'Console' },
  { id: 'chat', etichetta: 'Chat' },
  { id: 'costi', etichetta: 'Costi' },
]

function Segnaposto({ testo }: { testo: string }) {
  return (
    <section className="pannello">
      <p className="nota">{testo}</p>
    </section>
  )
}

/** Contenuto del passo selezionato nella barra dei passi. */
function ContenutoPasso({ approvazioniAncorate }: { approvazioniAncorate: boolean }) {
  const passo = useStudioStore((s) => s.passoAttivo)
  const attesaFonti = useStudioStore((s) => s.approvazione === 'in_attesa')
  const attesaScaletta = useStudioStore((s) => s.approvazioneScaletta === 'in_attesa')
  const scaletta = useStudioStore((s) => s.scaletta)
  const opzioni = useStudioStore((s) => s.opzioni.length)
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)
  const senzaChiave = useStudioStore((s) => !s.apiKey.trim())

  switch (passo) {
    case 'materiale':
      // Senza chiave le impostazioni vengono prima: è la prima cosa da fare.
      return senzaChiave ? (
        <>
          <SettingsPanel />
          <UploadPanel />
        </>
      ) : (
        <>
          <UploadPanel />
          <SettingsPanel />
        </>
      )
    case 'ricerca':
      return <ResearchStep />
    case 'fonti':
      if (attesaFonti) {
        return approvazioniAncorate ? (
          <Segnaposto testo="Le fonti da approvare sono nel pannello in basso." />
        ) : (
          <ApprovalCard />
        )
      }
      return <FontiApprovate />
    case 'scaletta':
      if (attesaScaletta && approvazioniAncorate) {
        return <Segnaposto testo="La scaletta da approvare è nel pannello in basso." />
      }
      return scaletta ? (
        <OutlineCard />
      ) : (
        <Segnaposto
          testo={
            inEsecuzione
              ? 'Dopo l’approvazione delle fonti, lo Scrittore propone qui la scaletta del capitolo.'
              : 'Qui comparirà la scaletta proposta dallo Scrittore, da approvare prima della stesura.'
          }
        />
      )
    case 'capitolo':
      return opzioni > 0 ? (
        <>
          <WriterOptions />
          <ChecklistPanel />
        </>
      ) : (
        <Segnaposto testo="Dopo l’approvazione della scaletta, lo Scrittore scrive qui tre opzioni del capitolo, con le citazioni verificate." />
      )
  }
}

/**
 * Area di lavoro: la squadra in una riga, le schede Lavoro/Console/Chat/Costi
 * e, in Lavoro, la barra dei passi al posto della lunga colonna di pannelli.
 */
export function Workspace({ approvazioniAncorate = false }: { approvazioniAncorate?: boolean }) {
  const vista = useStudioStore((s) => s.vista)
  const setVista = useStudioStore((s) => s.setVista)
  const nonVisti = useStudioStore((s) => s.logNonVisti)
  const erroriNonVisti = useStudioStore((s) => s.erroriNonVisti)
  const serveDecisione = useStudioStore(
    (s) => s.approvazione === 'in_attesa' || s.approvazioneScaletta === 'in_attesa',
  )

  return (
    <div className="spazio-lavoro">
      <TeamStrip />

      <nav className="barra-schede" role="tablist" aria-label="Sezioni">
        {VISTE.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={vista === v.id}
            className={`scheda-barra ${vista === v.id ? 'scheda-barra-attiva' : ''}`}
            onClick={() => setVista(v.id)}
          >
            {v.etichetta}
            {v.id === 'console' && nonVisti > 0 && (
              <span className={`pastiglia ${erroriNonVisti > 0 ? 'pastiglia-errore' : ''}`}>{nonVisti}</span>
            )}
            {v.id === 'lavoro' && serveDecisione && vista !== 'lavoro' && <span className="pastiglia">!</span>}
          </button>
        ))}
      </nav>

      <div className={`sezione ${approvazioniAncorate && serveDecisione ? 'sezione-con-ancora' : ''}`}>
        {vista === 'lavoro' && (
          <>
            <StepBar />
            <RunBar />
            <ContenutoPasso approvazioniAncorate={approvazioniAncorate} />
          </>
        )}
        {vista === 'console' && <Console />}
        {vista === 'chat' && <ChatPanel />}
        {vista === 'costi' && <CostPanel />}
      </div>
    </div>
  )
}
