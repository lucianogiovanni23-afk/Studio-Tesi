import { useMemo } from 'react'
import { statisticheCorpus } from '../agents/corpus'
import { useStudioStore } from '../store'

/**
 * Statistiche del corpus del corso. Il corpus vive fuori dallo store: si
 * ricalcolano quando cambia l'elenco dei file, che viene aggiornato solo dopo
 * che i passaggi di un file sono stati salvati.
 */
export function useStatisticheCorpus() {
  // Firma primitiva dell'elenco: cambia quando un file entra, esce o finisce di essere letto.
  const firma = useStudioStore(
    (s) => `${s.corpusSincronizzato}:${s.courseFiles.map((f) => `${f.id}=${f.status}`).join('|')}`,
  )
  return useMemo(() => {
    void firma // serve solo da segnale di ricalcolo
    return statisticheCorpus()
  }, [firma])
}

export function useCaratteriCorpus(): number {
  return useStatisticheCorpus().caratteri
}
