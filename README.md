# Studio tesi

Web app React + Vite che mostra **cinque agenti AI stilizzati in un ufficio 3D low-poly** mentre
lavorano in sequenza al capitolo di una tesi di laurea in **Finanza Aziendale**: leggono il
materiale del corso, cercano davvero fonti su internet, le selezionano, si fermano ad aspettare la
tua approvazione e solo dopo scrivono tre bozze del capitolo. Non c'è nessun backend: le chiamate
partono direttamente dal browser.

## Stack

- **Vite + React 18 + TypeScript**
- **[@react-three/fiber](https://github.com/pmndrs/react-three-fiber) + [@react-three/drei](https://github.com/pmndrs/drei)** per la scena 3D (componenti dichiarativi, non Three.js imperativo)
- **[Zustand](https://github.com/pmndrs/zustand)** per lo stato globale
- Nessun backend, nessuna dipendenza server

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build di produzione
npm run lint
```

## ⚠️ Chiave API: leggi prima di usare

> Questa chiave resta nel tuo browser e viene inviata direttamente all'API Anthropic da questo
> client. Va bene per uso personale, ma non distribuire l'app ad altri utenti con la chiave dentro.
> Per un uso condiviso serve un backend che la nasconda.

- la chiave **non è mai hardcodata** né committata: si inserisce solo a runtime nel campo dedicato;
- viene salvata in `localStorage` con la chiave `studio-tesi.anthropic-api-key`, e il bottone
  "Rimuovi" la cancella anche da lì;
- l'unica destinazione delle richieste è `https://api.anthropic.com/v1/messages`, con gli header
  `x-api-key`, `anthropic-version: 2023-06-01` e `anthropic-dangerous-direct-browser-access: true`;
- modello `claude-sonnet-4-6`, `max_tokens: 2000` (8000 per lo Scrittore, che produce tre bozze).

## Passo preliminare: il materiale del corso

Prima che qualunque agente possa partire serve una sezione dedicata, separata dal resto:

- **caricamento con barra di progresso reale**: la percentuale è calcolata sui byte letti da
  `FileReader.onprogress`, con il nome del file in corso e la spunta verde a completamento;
- **PDF** inviati all'API come blocchi `{ type: "document", source: { type: "base64", … } }`,
  **.txt/.md** letti come testo e concatenati;
- **argomento della tesi** e **capitolo o sezione da scrivere**, scritti da te: nessun agente li
  propone, li ricevono come dato di partenza;
- il bottone **"Avvia la squadra"** resta disabilitato finché il caricamento non è al 100% e finché
  argomento e capitolo non sono stati scritti.

Il materiale resta **contesto condiviso per tutti e cinque gli agenti** lungo l'intera pipeline: è
allegato a ogni chiamata (`buildUserMessage` in `agents/prompts.ts`). Se il testo è molto lungo
viene ridotto a un estratto testa-e-coda, e i PDF sono allegati entro un tetto complessivo, per non
sforare i limiti di contesto.

## I cinque agenti

| # | Agente | Colore | Compito |
|---|--------|--------|---------|
| 1 | Lettore | verde acqua | Estrae concetti chiave, terminologia, collegamenti e lacune dal materiale del corso |
| 2 | Ricercatore | ambra | Cerca **davvero** su internet fonti, paper, dataset e dati aggiornati |
| 3 | Selettore | rosa antico | Tiene solo le fonti pertinenti e motiva ogni scelta |
| 4 | Scrittore | viola | Scrive il capitolo in **tre opzioni** con tagli diversi |
| 5 | Controllore | indaco | Sorveglia tutto il processo, dall'inizio alla fine |

Ogni agente risponde in italiano in due sezioni etichettate `RAGIONAMENTO:` e `RISULTATO:`; il
Controllore aggiunge anche una riga `STATO: OK` / `STATO: PROBLEMA`.

### Ricerca web reale

La chiamata del Ricercatore include il tool nativo di Anthropic
(`tools: [{ type: "web_search_20250305", name: "web_search" }]`). `agents/webSearch.ts` analizza i
blocchi della risposta (`server_tool_use`, `web_search_tool_result`, citazioni nei blocchi di testo)
e raccoglie gli **URL realmente restituiti** dal motore di ricerca. Le fonti dichiarate dall'agente
vengono confrontate con quell'elenco: quelle il cui URL non compare fra i risultati reali sono
marcate come non confermate e il Controllore segnala il problema. Gli errori del tool (rate limit,
nessun risultato, query troppo lunga, servizio non disponibile) diventano messaggi espliciti invece
di far fallire silenziosamente l'agente.

### Punto di approvazione umana

Dopo la selezione il flusso **si ferma**: compare una card con le fonti selezionate e due scelte,
**"Approvo"** oppure **"Non mi convince"** (con motivo facoltativo). Se rifiuti, il Selettore rivede
la selezione tenendo conto del motivo, e se ritiene che le fonti pertinenti non bastino può
chiedere al Ricercatore un nuovo giro di ricerca (`[NUOVA RICERCA]`). Il ciclo si ripete finché non
approvi. **Lo Scrittore non parte in nessun caso prima dell'approvazione.**

### Il Controllore

Attivo dall'inizio, non solo alla fine:

- valida il formato di ogni risposta (sezioni mancanti, contenuto troppo breve, blocchi assenti) e
  ripete la richiesta con istruzioni più rigide, fino a 3 tentativi;
- su errore di rete o API ritentabile riprova con attesa progressiva (2s, 4s, 8s);
- intercetta `console.error`, `console.warn`, `window.onerror` e `unhandledrejection`, li registra e
  riabilita i controlli se l'interfaccia resta bloccata;
- verifica che gli URL del Ricercatore siano reali;
- alla fine valuta le tre opzioni dello Scrittore una per una: se una ha problemi lo segnala
  accanto a quell'opzione, senza bloccare le altre.

Tutto questo finisce in una **console a tendina** (chiusa di default, con il contatore di eventi e
di errori visibile anche da chiusa), con righe timestampate e icone distinte per esito positivo ✓,
avviso ⚠, riparazione in corso ⟳ e fallimento ✕.

## La scena 3D

Un ufficio credibile con cinque postazioni disposte su due file sfalsate, così la lavagna resta
visibile. Ogni postazione ha scrivania con piano e gambe, monitor su supporto con schermo emissivo
che si accende del colore dell'agente quando lavora, tastiera con griglia di tasti, mouse con
tappetino, sedia da ufficio con base a cinque razze, e sul piano tazza, pila di fogli, portapenne e
targhetta con nome e ruolo. L'ambiente ha pavimento a doghe, parete di fondo con due finestre e
lavagna, plafoniere, piante e un armadietto basso; le ombre sono attive e ogni postazione ha una
piccola luce del colore dell'agente, accesa solo mentre lavora.

I personaggi hanno arti separati e animabili (spalla → gomito → mano, anca → ginocchio → piede) e un
dettaglio caratterizzante ciascuno: occhiali, cuffie, sciarpa, cravatta, cartellino. Gli stati sono
animati in `useFrame`:

- **idle** — in piedi nella zona di attesa, respiro leggero;
- **walking** — cammina davvero fino alla propria postazione, gambe e braccia che oscillano, corpo
  orientato nella direzione di marcia;
- **working** — si siede sulla sedia davanti al monitor, mani che digitano, testa china verso lo
  schermo e la destra che ogni tanto si sposta sul mouse;
- **waiting** — seduto ma girato verso di te, si guarda in giro (è lo stato del Selettore durante
  l'approvazione);
- **done** — si alza dalla sedia, posa rilassata.

La chiamata API di un agente parte **solo quando il personaggio è arrivato** alla postazione.

### Nuvolette di ragionamento

Ogni agente ha una nuvoletta ancorata sopra la testa (`<Html>` di drei con `distanceFactor`) che
mostra la sezione `RAGIONAMENTO:` spezzata in passaggi discreti, uno alla volta, con frecce `‹ ›`
(area di tocco 44×44 px) e un contatore "passaggio 2 di 5". **Può essere aperta una sola nuvoletta
alla volta**: lo store tiene un unico campo `openBubbleAgent`, quindi toccare un agente apre la sua
e chiude quella di chiunque altro. La micro-etichetta di stato sempre visibile ("Cerco fonti
online…", "Attendo la tua approvazione…") è separata e non conta come nuvoletta aperta.

### Telecamera

`OrbitControls` con rotazione e zoom limitati e pan disattivato, più i bottoni "vai alla postazione
di X" che spostano la telecamera con una transizione fluida (`CameraRig`, interpolazione con
ease-in-out); finita l'animazione i controlli tornano liberi. Sui dispositivi a tocco i limiti sono
più stretti.

## Due interfacce distinte

`useLayoutMode()` legge `window.matchMedia` ed è reattivo a resize e cambio di orientamento.

- **Desktop (≥ 1024px)** — scena a sinistra, pannelli affiancati a destra in una colonna scorrevole:
  materiale del corso, argomento/capitolo, card di approvazione, output dei cinque agenti, console a
  tendina e chat, tutti visibili insieme.
- **Tablet/iPad (< 1024px)** — scena a tutta larghezza in alto (~45% dell'altezza) e sotto una barra
  a schede grande e toccabile: **Materiale · Agenti · Console · Chat**, una sezione alla volta. La
  card di approvazione diventa un pannello fisso in basso, sopra tutto, quando serve una decisione.
  Aree di tocco minime 44×44 px, testo minimo 15px, e il canvas non cattura lo scroll della pagina.

La soglia è sulla sola larghezza: così un iPad in landscape (≥ 1024px) usa la disposizione
affiancata del desktop, mentre in portrait passa alle schede.

## Chat sul progetto

Risponde a tre famiglie di domande: **merito della tesi** (di cosa parla il materiale, se le fonti
reggono, che taglio dare al capitolo, quale opzione è più solida, che obiezioni farebbe un
relatore), **stato dell'esecuzione** (cosa sta facendo ogni agente, perché il Selettore ha rifatto
la scelta) e **processi tecnici** (cosa dice la console, perché una chiamata è stata ritentata).

A ogni messaggio viene allegata una fotografia dello stato: argomento e capitolo, estratto del
materiale, fonti trovate e selezionate con URL, le tre opzioni dello Scrittore se disponibili e le
ultime righe della console. La cronologia della conversazione viene inviata per intero a ogni
chiamata.

## Vincoli rispettati

- nessun `alert()` / `confirm()`: tutti i messaggi passano dallo stato React;
- la chiave API non è mai hardcodata;
- l'interfaccia non resta mai bloccata dopo un errore — la pipeline riabilita sempre i controlli nel
  `finally`, l'attesa dell'arrivo di un personaggio ha un timeout di sicurezza e la console offre un
  bottone "Sblocca l'interfaccia".

## Struttura

```
src/
  types.ts                 tipi condivisi
  store.ts                 store Zustand: materiale, stato dei 5 agenti, fonti, log, approvazione
  hooks/
    useLayoutMode.ts       'desktop' | 'tablet', reattivo a resize e orientamento
  layouts/
    DesktopLayout.tsx      scena + colonna di pannelli affiancata
    TabletLayout.tsx       scena in alto + barra a schede + card di approvazione fissa in basso
  scene/
    Scene.tsx              Canvas, luci, OrbitControls limitato, bottoni di inquadratura
    Office.tsx             pavimento, pareti, finestre, lavagna, plafoniere, piante, armadietto
    Workstation.tsx        scrivania, monitor, tastiera, mouse, sedia, targhetta, luce di postazione
    Worker.tsx             personaggio low-poly con arti separati e le cinque pose animate
    ReasoningBubble.tsx    nuvoletta con i passaggi del ragionamento, una alla volta
    CameraRig.tsx          transizione fluida verso la postazione scelta
    layout.ts              posizioni di postazioni, sedie, percorsi e telecamera
  panels/
    ApiKeyPanel.tsx        campo chiave + avviso di sicurezza
    CourseMaterialPanel.tsx  caricamento con barra di progresso reale, argomento, capitolo, avvio
    ApprovalCard.tsx       punto di approvazione umana
    AgentsPanel.tsx        card dei 5 agenti, elenco fonti, tre opzioni dello Scrittore
    Console.tsx            console a tendina del Controllore
    ChatPanel.tsx          chat sul progetto
  agents/
    definitions.ts         nome, ruolo, colore e dettaglio di ogni agente
    prompts.ts             system prompt, contesto condiviso, istruzioni per ogni passo
    api.ts                 client dell'API, errori leggibili, parsing di RAGIONAMENTO/RISULTATO
    webSearch.ts           tool di ricerca, raccolta degli URL reali, parsing di fonti e selezione
    supervisor.ts          Controllore: hook globali, validazione, retry con backoff
    pipeline.ts            orchestrazione sequenziale con il ciclo di approvazione, e la chat
```
