/// <reference lib="webworker" />
/**
 * Lavoratore in sottofondo: indice e ricerca nel materiale del corso, controllo
 * delle frasi simili. Riceve { id, richiesta } e risponde { id, esito } oppure
 * { id, errore }; durante i lavori lunghi manda { id, avanzamento, fase }.
 */
import { esegui, ferma, type Richiesta } from './lavori'

const ambito = self as unknown as DedicatedWorkerGlobalScope

const cede = () => new Promise<void>((r) => setTimeout(r, 0))

ambito.onmessage = (e: MessageEvent<{ id: number; richiesta?: Richiesta; ferma?: boolean }>) => {
  const { id, richiesta } = e.data
  if (e.data.ferma) {
    ferma(id)
    return
  }
  if (!richiesta) return
  esegui(id, richiesta, (avanzamento, fase) => ambito.postMessage({ id, avanzamento, fase }), cede).then(
    (esito) => {
      // Le classifiche viaggiano senza copie.
      const trasferibili = Array.isArray(esito) ? esito.filter((x): x is Uint32Array => x instanceof Uint32Array).map((x) => x.buffer) : []
      ambito.postMessage({ id, esito }, trasferibili)
    },
    (err: unknown) => {
      const nome = err instanceof Error ? err.name : 'Error'
      ambito.postMessage({ id, errore: { nome, messaggio: err instanceof Error ? err.message : String(err) } })
    },
  )
}

ambito.postMessage({ pronto: true })
