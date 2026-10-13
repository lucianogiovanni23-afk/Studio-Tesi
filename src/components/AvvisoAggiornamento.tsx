/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Registra il service worker (app installabile e utilizzabile senza rete) e,
 * quando è pronta una versione nuova dell'app, lo dice con una riga discreta.
 * Si aggiorna solo quando lo chiedi tu: così non perdi quello che stai scrivendo.
 */
export function AvvisoAggiornamento() {
  const {
    needRefresh: [daAggiornare, setDaAggiornare],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registrazione) {
      // Controlla se c'è una versione nuova ogni ora, se l'app resta aperta a lungo.
      if (registrazione) setInterval(() => void registrazione.update().catch(() => {}), 60 * 60 * 1000)
    },
  })

  if (!daAggiornare) return null
  return (
    <div className="banda banda-attesa avviso-sync avviso-aggiornamento" role="status">
      <p>C'è una versione nuova</p>
      <div className="riga-editor">
        <button type="button" className="bottone bottone-primario" onClick={() => void updateServiceWorker(true)}>
          Aggiorna
        </button>
        <button type="button" className="bottone bottone-vuoto" onClick={() => setDaAggiornare(false)}>
          Più tardi
        </button>
      </div>
    </div>
  )
}
