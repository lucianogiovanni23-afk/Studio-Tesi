# Studio degli agenti

Web app React + Vite che mostra **4 agenti AI stilizzati in una scena 3D low-poly** mentre eseguono
in sequenza un'analisi testuale usando l'API di Anthropic. Non c'è nessun backend: le chiamate
partono direttamente dal browser.

## Stack

- **Vite + React 18 + TypeScript**
- **[@react-three/fiber](https://github.com/pmndrs/react-three-fiber) + [@react-three/drei](https://github.com/pmndrs/drei)** per la scena 3D (componenti dichiarativi, non Three.js imperativo)
- **[Zustand](https://github.com/pmndrs/zustand)** per lo stato globale della pipeline
- Nessun backend, nessuna dipendenza server

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build di produzione
npm run lint
```

Poi, nell'interfaccia: incolla la tua chiave API Anthropic, incolla un testo (o usa il bottone
"Testo di esempio") e premi **Avvia pipeline**.

## ⚠️ Chiave API: leggi prima di usare

Questa chiave resta nel tuo browser mediante `localStorage` e viene inviata direttamente all'API
Anthropic da questo client — **non usarla in un progetto pubblico/distribuito ad altri utenti**,
perché chiunque potrebbe leggerla dal codice del browser. Per un uso condiviso servirebbe un
backend che la nasconda.

Di conseguenza:

- la chiave **non è mai hardcodata** né committata: si inserisce solo a runtime nel campo dedicato;
- viene salvata in `localStorage` con la chiave `agenti3d.anthropic-api-key` e il bottone
  "Cancella" la rimuove anche da lì;
- l'unica destinazione delle richieste è `https://api.anthropic.com/v1/messages`.

Le chiamate usano gli header `x-api-key`, `anthropic-version: 2023-06-01` e
`anthropic-dangerous-direct-browser-access: true` (necessario per chiamare l'API dal browser),
con modello `claude-sonnet-4-6` e `max_tokens: 1000`.

## La pipeline

Quattro agenti in sequenza, ognuno usa l'output del precedente:

| # | Agente | Colore | Compito |
|---|--------|--------|---------|
| 1 | Estrattore | verde acqua | Isola entità, numeri, date e fatti chiave |
| 2 | Riassuntore | ambra/oro | Riassunto di massimo 4 frasi, usando i dati dell'agente 1 |
| 3 | Analizzatore del tono | rosa antico | Sentiment, registro ed emozioni dominanti |
| 4 | Sintetizzatore finale | indaco | Report finale con sezioni Panoramica / Punti chiave / Tono |

Ogni agente ha un prompt dedicato in italiano che gli chiede di rispondere in due sezioni
etichettate `RAGIONAMENTO:` e `RISULTATO:`, così la sala di controllo può mostrare sia il processo
di pensiero (in corsivo) sia l'output finale (in evidenza).

## La scena 3D

Stanza vista leggermente dall'alto con `OrbitControls` limitato (rotazione e zoom vincolati, pan
disattivato), pavimento in legno low-poly a doghe e lavagna sulla parete di fondo che mostra il
report finale quando è pronto.

Ogni agente ha una scrivania con un laptop che si illumina del suo colore quando lavora, più una
luce puntiforme dedicata; l'illuminazione generale è data da una luce ambientale soffusa, una
emisferica e una direzionale principale che proietta le ombre.

I personaggi sono costruiti con geometrie semplici (testa cubica smussata, busto a blocchi, arti
separati su gruppi-giunto) e passano per cinque stati animati, tutti gestiti in `useFrame`:

- **idle** — respiro e leggera oscillazione;
- **walking** — cammina davvero dalla posizione di riposo alla scrivania seguendo un percorso a
  tappe che aggira le altre scrivanie, con gambe e braccia che oscillano;
- **working** — braccia che digitano, testa china, busto inclinato in avanti;
- **waiting** — si guarda intorno mentre aspetta il turno;
- **done** — braccia alzate.

La chiamata API di un agente parte **solo quando il personaggio è arrivato** alla scrivania: la
scena segnala l'arrivo allo store e la pipeline riprende da lì.

Sopra ogni personaggio c'è un'etichetta HTML ancorata alla posizione 3D con `<Html>` di drei, che
mostra lo stato corrente.

## Gestione degli errori

Errori di rete, chiave sbagliata, rate limit e risposte malformate vengono tradotti in messaggi
leggibili: quelli di validazione compaiono accanto al campo della chiave, quelli di una chiamata
nella card dell'agente coinvolto, insieme al bottone **"Riprova da qui"** che riavvia la pipeline
da quell'agente riusando i risultati già ottenuti — senza ricaricare la pagina. Nessun
`alert()`/`confirm()`: tutti i messaggi passano dallo stato React.

## Struttura

```
src/
  agents.ts              definizione dei 4 agenti, prompt in italiano, costruzione dei messaggi
  store.ts               store Zustand: chiave, testo, fase/output/errore di ogni agente
  lib/anthropic.ts       client dell'API, messaggi d'errore, parsing di RAGIONAMENTO/RISULTATO
  lib/pipeline.ts        orchestrazione sequenziale, attesa dell'arrivo, retry e annullamento
  components/
    ApiKeyInput.tsx      campo chiave + avviso di sicurezza
    ControlRoom.tsx      una card per agente con badge, ragionamento e risultato
  scene/
    Scene.tsx            Canvas, luci, camera e OrbitControls limitato
    Room.tsx             pavimento a doghe, pareti, lavagna con il report finale
    Desk.tsx             scrivania e laptop che si illumina
    Character.tsx        personaggio low-poly e relative animazioni
    layout.ts            posizioni di scrivanie, punti di riposo e percorsi
```
