# Studio tesi

Web app React + Vite + TypeScript: una **sala operativa di una società di intermediazione
finanziaria di fine anni '80** in 3D, dove cinque agenti AI lavorano come broker al capitolo di una
tesi di laurea triennale in **Finanza Aziendale**. Leggono il materiale del corso, cercano davvero
fonti online, le verificano, si fermano ad attendere l'approvazione umana e solo dopo scrivono tre
versioni del capitolo. Nessun backend: le chiamate partono dal browser.

## Verifiche sulla documentazione ufficiale

Il codice è stato adeguato a `docs.claude.com`. Quattro punti divergono dalle specifiche iniziali:

| Punto | Specifica iniziale | Documentazione | Scelta |
|---|---|---|---|
| Tool di ricerca web | `web_search_20250305` | Esistono tre versioni: `20250305` (base), `20260209` (filtro dinamico), `20260318` (controllo dell'inclusione) | Si usa **`web_search_20260318`** con `allowed_callers: ['direct']` |
| Output strutturato | `tool_choice: {type:"tool"}` forzato per ogni agente | Su `claude-opus-5-5` il `tool_choice` forzato `any`/`tool` **restituisce 400** | Si usano gli **output strutturati** (`output_config.format`), tranne il Ricercatore |
| Ricerca web | "va abilitata dall'amministratore" | È **attiva per impostazione predefinita**; fallisce solo se un amministratore l'ha disattivata in Console → Privacy | Il messaggio d'errore lo dice correttamente |
| Turni lunghi | non previsto | La ricerca può restituire `stop_reason: "pause_turn"`, da proseguire rimandando il messaggio invariato | Gestito in `agents/api.ts` |

Perché `allowed_callers: ['direct']`: dalla versione `20260209` il tool esegue per impostazione
predefinita un filtro dinamico dentro code execution. Il filtro risparmia token, ma la verifica
deterministica degli URL si basa sui blocchi `web_search_tool_result`: la chiamata diretta li
garantisce tutti, ed è la condizione perché nessuna fonte inventata superi il controllo.

Altri dettagli allineati alla documentazione: `budget_tokens` è rimosso su Sonnet 5 e Opus 5.5
(si usa `output_config.effort`), il prefill dell'assistente non è più ammesso, e gli errori del tool
di ricerca arrivano con HTTP 200 dentro un blocco `web_search_tool_result` — non come eccezione.

## Stack

- **Vite + React 18 + TypeScript**
- **@react-three/fiber + @react-three/drei** per la scena 3D (dichiarativo, non Three.js imperativo)
- **Zustand** con middleware `persist` su **IndexedDB** (`idb-keyval`)
- **@anthropic-ai/sdk** ufficiale, in modalità browser: è l'SDK a mettere gli header richiesti
  (`x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access`), e in
  cambio si ottengono le classi d'errore tipizzate
- **papaparse** per i CSV, **xlsx** (SheetJS) per gli Excel

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build di produzione
npm run lint
```

## Cosa devi configurare tu

1. **Chiave API Anthropic** — si incolla nel pannello impostazioni. Resta solo in `localStorage`,
   non è mai nel codice né nei commit, e non entra nello stato salvato in IndexedDB.
2. **Ricerca web** — è attiva per impostazione predefinita sulle organizzazioni. Se qualcuno l'ha
   disattivata, si riattiva dalla Console Anthropic in *Settings → Privacy*; l'app mostra un
   messaggio esplicito quando l'API risponde che il tool non è abilitato.
3. **Nient'altro.** Modelli, argomento e capitolo sono già precompilati e modificabili
   dall'interfaccia.

> **Avviso sulla chiave.** Resta nel tuo browser e viene inviata direttamente all'API Anthropic. Va
> bene per uso personale; non distribuire l'app ad altri con la chiave dentro. Per un uso condiviso
> serve un backend che la nasconda.

## Vincolo di materia

`SUBJECT_GUARDRAIL` in `agents/prompts.ts` è inserito nel system prompt di **tutti e cinque** gli
agenti e della chat: si resta nella Finanza Aziendale come definita dal materiale del corso, senza
sconfinare in Ragioneria (bilancio contabile, principi contabili) né in Diritto Commerciale o
Privato. Il Ricercatore scarta le fonti prevalentemente contabili o giuridiche dichiarandone il
motivo, il Selettore usa l'aderenza alla materia come criterio esplicito, e il Controllore ha una
voce di checklist dedicata più un controllo lessicale di supporto che segnala i termini sospetti in
console.

Un secondo vincolo, `VINCOLO_STAGIONI`, impone che l'analisi si basi su **serie pluriennali** e non
su una sola stagione.

## Output strutturato, niente parsing fragile

Nessun agente risponde con etichette testuali da cercare nella risposta. Ognuno consegna dati
conformi a uno schema JSON (`agents/schemas.ts`), nella forma `{ passaggi: string[], risultato: … }`:
i `passaggi` alimentano le nuvolette, il `risultato` alimenta l'interfaccia.

- **Lettore, Selettore, Scrittore, Controllore** → `output_config.format` (output strutturato GA).
- **Ricercatore** → deve prima cercare, quindi `tool_choice` resta implicito e il prompt gli chiede
  di chiudere chiamando `submit_ricercatore`. Se non lo fa, parte una seconda chiamata che glielo
  impone, rimandando la cronologia invariata (gli `encrypted_content` dei risultati vanno rispediti
  intatti, altrimenti l'API risponde 400).

Ogni risposta è poi validata **in codice**: campi obbligatori, elenchi non vuoti, lunghezze minime,
conteggio parole, e per lo Scrittore il controllo che non citi URL fuori dalle fonti approvate.

## I cinque agenti

| # | Agente | Colore | Compito |
|---|--------|--------|---------|
| 1 | Lettore | verde acqua | Legge materiale e dati e produce il **dossier del corso** |
| 2 | Ricercatore | ambra | Cerca **davvero** online; ogni URL viene verificato in codice |
| 3 | Selettore | rosa antico | Tiene solo le fonti pertinenti e aderenti alla materia |
| 4 | Scrittore | viola | Tre opzioni del capitolo, generate **in parallelo** |
| 5 | Controllore | indaco | Si siede per primo e sorveglia tutto il processo |

### Verifica deterministica degli URL

`agents/verifyUrls.ts` raccoglie ogni URL realmente presente nei blocchi `web_search_tool_result`
(e nelle citazioni, che la ricerca web produce sempre). Le fonti dichiarate dal Ricercatore vengono
confrontate con quell'elenco: **quelle il cui URL non compare non passano al Selettore**, e ogni
esclusione finisce in console con il titolo e l'URL sospetto. Il giudizio non è mai affidato al
modello.

### Gestione del contesto

I PDF non vengono rispediti a ogni agente. Il Lettore li legge una volta e produce il dossier, che
viaggia verso tutti gli altri; i PDF originali tornano **solo allo Scrittore**, che ha bisogno della
terminologia esatta, e viaggiano con `cache_control: { type: 'ephemeral' }` sull'ultimo blocco, così
il reinvio costa molto meno. Se il materiale supera la finestra di contesto l'app lo dice e chiede di
ridurre i file, invece di troncare in silenzio.

### Punto di approvazione umana

Dopo la selezione il flusso **si ferma**. La card mostra le fonti tenute con titolo, tipo, link
cliccabile e motivo, e due scelte: **Approvo** o **Non mi convince** (con motivo facoltativo). Se
rifiuti, il Selettore rivede la scelta sull'elenco originale tenendo conto del motivo; se giudica la
copertura insufficiente fa ripartire il Ricercatore per un giro mirato. **Lo Scrittore non parte in
nessun caso prima dell'approvazione.**

### Il Controllore

- Output non valido → ripete con istruzioni più rigide, fino a 3 tentativi.
- Rete, 5xx, 529 → backoff esponenziale (2s, 4s, 8s). 429 → rispetta l'header `retry-after`.
- **401 e 400 → non ritenta**: l'errore è definitivo e il messaggio è specifico.
- Intercetta `console.error`, `console.warn`, `window.onerror` e `unhandledrejection`, li registra e
  riabilita i controlli se l'interfaccia resta bloccata (solo quando non ci sono richieste in volo).
- Checklist a quattro voci con esito per voce: fonti verificate, perimetro di materia, coerenza con
  le fonti approvate, analisi su più stagioni. Una voce con problema indica l'agente responsabile.
- Valuta le tre opzioni **separatamente**: un rilievo su una non blocca le altre.
- Tutto nella **console a tendina** (chiusa di default, contatore eventi ed errori visibile anche da
  chiusa), con orario, icone distinte (✓ ⚠ ⟳ ✕ ·) e un bottone **copia log**.

## La scena 3D

Sala con pannellature in legno scuro, lesene, moquette verde, grandi finestre sul fondo con skyline
notturno (sagome generiche, finestre accese disegnate in un solo `instancedMesh`), tabellone a LED
ambra che mostra lo stato reale della pipeline, lavagna con le fonti approvate o un estratto
dell'opzione scelta, plafoniere e campanella di contrattazione che oscilla e suona a capitolo
completato (Web Audio, disattivabile).

Ogni postazione ha scrivania massiccia con piano in pelle, **monitor CRT color panna** con schermo a
fosfori che si illumina del colore dell'agente quando lavora, tastiera con tasti in `instancedMesh`,
mouse con tappetino, poltrona in pelle a cinque razze, telefono con filo a spirale, **lampada da
banchiere con paralume verde** e targhetta in ottone.

I broker hanno completo scuro, camicia, bretelle e cravatta nel colore dell'agente, più un dettaglio
distintivo (occhiali, auricolare, fazzoletto, orologio, cartellino). Sei stati animati in `useFrame`:
**idle** (respiro, ogni tanto si sistema la cravatta), **walking**, **working** (seduto, digita, ogni
tanto il mouse; il Ricercatore alterna con il telefono all'orecchio), **waiting** (girato verso di te,
guarda l'orologio), **done** (in piedi, si sistema la giacca), **error** (mano alla fronte).

`prefers-reduced-motion` riduce le animazioni e salta la transizione di camera.

### Proprietà intellettuale

L'ambientazione evoca l'epoca in modo generico e originale. Nessun titolo, logo, locandina o
fotogramma di film; nessun nome di personaggio o società reale o di finzione; nessuna somiglianza con
attori; nessuna citazione. La società è inventata: **Harrow & Vance Securities**.

## Nuvolette di ragionamento

Ancorate sopra ogni broker (`<Html>` con `distanceFactor`), mostrano i `passaggi` **uno alla volta**
con frecce `‹ ›` (area di tocco 44×44 px) e contatore "passaggio 2 di 5". **Una sola nuvoletta aperta
per volta**: lo store tiene un unico campo `nuvolettaAperta`. La micro-etichetta di stato sempre
visibile è separata e non conta come nuvoletta.

## Due interfacce

`useLayoutMode()` legge `window.matchMedia` ed è reattivo a resize e orientamento.

- **Desktop (≥ 1024px)** — scena a sinistra (~62%), colonna scorrevole a destra con impostazioni,
  caricamenti, card di approvazione, agenti, opzioni, console e chat.
- **Tablet/iPad (< 1024px)** — scena a tutta larghezza in alto (~45%), barra a schede grande
  **Materiale · Agenti · Console · Chat**, una sezione per volta; la card di approvazione diventa un
  pannello fisso in basso. Tocchi ≥ 44×44 px, testo ≥ 15px, `safe-area-inset` rispettati, il canvas
  non cattura lo scroll. In landscape (≥ 1024px) torna la disposizione affiancata.

## Persistenza

Lo stato della sessione (output, fonti, approvazioni, opzioni, chat, log) è salvato in **IndexedDB**:
`localStorage` è troppo piccolo per i capitoli. I PDF originali **non** vengono salvati — dopo un
ricaricamento l'app segnala quali file vanno ricaricati. "Nuova sessione" ha conferma in linea, senza
`confirm()`.

## Struttura

```
src/
  types.ts                 tipi condivisi
  store.ts                 Zustand + persist su IndexedDB
  theme/tokens.css         palette anni '80-'90 e tipografia
  hooks/useLayoutMode.ts   'desktop' | 'tablet'
  layouts/                 DesktopLayout.tsx, TabletLayout.tsx
  scene/
    Scene.tsx              Canvas, luci, OrbitControls limitato
    TradingFloor.tsx       sala, pannellature, finestre, lavagna, insegna
    Workstation.tsx        scrivania, CRT, lampada da banchiere, telefono, targhetta
    Broker.tsx             broker low-poly con sei pose animate
    Skyline.tsx            skyline notturno con instancedMesh
    QuoteBoard.tsx         tabellone a LED con lo stato della pipeline
    TradingBell.tsx        campanella con Web Audio
    ReasoningBubble.tsx    nuvoletta a passaggi, una alla volta
    CameraRig.tsx          transizione verso la postazione scelta
    layout.ts              posizioni di sala, postazioni e telecamera
  panels/
    SettingsPanel.tsx      chiave API, modello per agente, nuova sessione
    UploadPanel.tsx        due caricamenti con progresso reale, argomento, capitolo, avvio
    ApprovalCard.tsx       punto di approvazione umana
    AgentsPanel.tsx        squadra, dossier, fonti, checklist del Controllore
    WriterOptions.tsx      le tre opzioni con conteggio parole, copia e rigenera
    Console.tsx            console a tendina con copia log
    ChatPanel.tsx          chat sul progetto, in streaming
    Ticker.tsx             banda scorrevole alimentata dagli eventi reali
  agents/
    definitions.ts         nome, ruolo, colore e dettaglio di ogni agente
    prompts.ts             SUBJECT_GUARDRAIL, system prompt, contesto condiviso
    schemas.ts             schemi JSON degli output strutturati
    api.ts                 client SDK, errori tipizzati, pause_turn, streaming
    verifyUrls.ts          verifica deterministica degli URL
    webSearch.ts           turno del Ricercatore con tool di consegna
    supervisor.ts          validazione, ritentativi, backoff, hook di runtime
    pipeline.ts            orchestrazione, approvazione, tre scritture parallele, chat
    caseData.ts            lettura CSV ed Excel con riepilogo e anteprima
```

## Collaudo eseguito

Flusso completo guidato in un browser reale con l'API simulata (output strutturati, tool use con
ricerca web, streaming SSE): caricamento materiale e dati → Lettore → Ricercatore con **una fonte
inventata correttamente esclusa** dalla verifica degli URL → Selettore → **rifiuto** con motivo →
secondo giro → approvazione → tre opzioni in parallelo → checklist del Controllore con un rilievo
sulla sola opzione C. Verificati inoltre: nuvoletta singola con contatore e frecce, console chiusa di
default con icone distinte, chat in streaming, **errore 401 con interfaccia che si riabilita**,
layout iPad con tutti i tocchi ≥ 44×44 px e landscape affiancato.
