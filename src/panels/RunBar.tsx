import { useMemo, useState } from 'react'
import { formattaDollari, stimaEsecuzione } from '../agents/costs'
import { AGENTE } from '../agents/definitions'
import { annullaEsecuzione, avviaSquadra } from '../agents/pipeline'
import { costoTotale, materialePronto, siPuoAvviare, useStudioStore } from '../store'
import { useCaratteriCorpus } from './useCorpus'

/** Comandi della seduta: avvio con stima dei costi, interruzione, ripresa, errori. */
export function RunBar() {
  const inEsecuzione = useStudioStore((s) => s.inEsecuzione)
  const puoAvviare = useStudioStore(siPuoAvviare)
  const pronto = useStudioStore(materialePronto)
  const apiKey = useStudioStore((s) => s.apiKey)
  const argomento = useStudioStore((s) => s.argomento)
  const capitolo = useStudioStore((s) => s.capitolo)
  const ripresaDa = useStudioStore((s) => s.ripresaDa)
  const erroreGlobale = useStudioStore((s) => s.erroreGlobale)
  const setErrore = useStudioStore((s) => s.setErroreGlobale)
  const modelli = useStudioStore((s) => s.modelli)
  const profondita = useStudioStore((s) => s.profondita)
  const usi = useStudioStore((s) => s.usi)
  const esecuzione = useStudioStore((s) => s.esecuzione)
  const attesaFonti = useStudioStore((s) => s.approvazione === 'in_attesa')
  const attesaScaletta = useStudioStore((s) => s.approvazioneScaletta === 'in_attesa')
  const setPasso = useStudioStore((s) => s.setPassoAttivo)
  const caratteriCorso = useCaratteriCorpus()
  const haLavoro = useStudioStore((s) => s.dossier !== null || s.opzioni.length > 0)
  const [conferma, setConferma] = useState(false)

  const stima = useMemo(
    () => stimaEsecuzione({ modelli, caratteriCorso, profondita }),
    [modelli, caratteriCorso, profondita],
  )
  const speso = costoTotale(usi, esecuzione)

  const mancano: string[] = []
  if (!apiKey.trim()) mancano.push('la chiave API')
  if (!pronto) mancano.push('il materiale del corso letto al 100%')
  if (!argomento.trim()) mancano.push("l'argomento della tesi")
  if (!capitolo.trim()) mancano.push('il capitolo da scrivere')

  return (
    <div className="comandi-seduta">
      <div className="azioni">
        {inEsecuzione ? (
          <>
            <button type="button" className="bottone bottone-vuoto" onClick={annullaEsecuzione}>
              Interrompi
            </button>
            {attesaFonti || attesaScaletta ? (
              <button
                type="button"
                className="bottone bottone-primario"
                onClick={() => setPasso(attesaFonti ? 'fonti' : 'scaletta')}
              >
                {attesaFonti ? 'Decidi sulle fonti' : 'Decidi sulla scaletta'}
              </button>
            ) : (
              <span className="nota in-corso">Seduta in corso…</span>
            )}
            <span className="contatore">speso finora {formattaDollari(speso)}</span>
          </>
        ) : (
          <>
            {conferma ? (
              <>
                <span className="nota">Ricominciare da capo? Dossier, fonti, scaletta e opzioni attuali verranno sostituiti.</span>
                <button
                  type="button"
                  className="bottone bottone-pericolo"
                  onClick={() => {
                    setConferma(false)
                    void avviaSquadra()
                  }}
                >
                  Sì, ricomincia
                </button>
                <button type="button" className="bottone bottone-vuoto" onClick={() => setConferma(false)}>
                  Annulla
                </button>
              </>
            ) : (
              <button
                type="button"
                className="bottone bottone-primario bottone-largo"
                onClick={() => (haLavoro ? setConferma(true) : void avviaSquadra())}
                disabled={!puoAvviare}
              >
                {haLavoro ? 'Nuova esecuzione' : 'Avvia la squadra'}
              </button>
            )}
            {ripresaDa && (
              <button type="button" className="bottone bottone-vuoto" onClick={() => void avviaSquadra(ripresaDa)}>
                Riprendi dal {AGENTE[ripresaDa].nome}
              </button>
            )}
            <span className="contatore" title="Stima indicativa: il consuntivo è nella scheda Costi">
              stima {formattaDollari(stima.minimo)} – {formattaDollari(stima.massimo)}
            </span>
          </>
        )}
      </div>

      {!inEsecuzione && mancano.length > 0 && (
        <p className="nota">Per avviare la squadra manca: {mancano.join(', ')}.</p>
      )}

      {erroreGlobale && (
        <p className="allerta allerta-errore" role="alert">
          {erroreGlobale}
          <button type="button" className="bottone bottone-minuscolo chiudi-allerta" onClick={() => setErrore(null)}>
            ✕
          </button>
        </p>
      )}
    </div>
  )
}
