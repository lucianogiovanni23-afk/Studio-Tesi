# Studio tesi

Web app React + Vite + TypeScript: una **sala operativa di una società di intermediazione
finanziaria di fine anni '80** in 3D, dove cinque agenti AI lavorano come broker al capitolo di una
tesi di laurea triennale in **Finanza Aziendale**. Leggono il materiale del corso (anche decine di
PDF), cercano e leggono davvero fonti online, le verificano, si fermano due volte per la tua
approvazione (fonti e scaletta) e solo dopo scrivono tre versioni del capitolo, con **ogni citazione
verificata parola per parola**. Nessun backend: le chiamate partono dal browser.

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
- **pdf.js** (`pdfjs-dist`, build *legacy* per i Safari di iPad meno recenti) per estrarre il testo
  dei PDF nel browser
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
3. **Nient'altro.** Modelli, argomento, capitolo e profondità di lettura sono già precompilati e
   modificabili dall'interfaccia.

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

- **Lettore, Selettore, Scrittore (scaletta, opzioni, rifiniture), Controllore** →
  `output_config.format` (output strutturato GA).
- **Ricercatore** → deve prima cercare e leggere, quindi `tool_choice` resta implicito e il prompt
  gli chiede di chiudere chiamando `submit_ricercatore`. Se non lo fa, parte una seconda chiamata che glielo
  impone, rimandando la cronologia invariata (gli `encrypted_content` dei risultati vanno rispediti
  intatti, altrimenti l'API risponde 400).

Ogni risposta è poi validata **in codice**: campi obbligatori, elenchi non vuoti, lunghezze minime,
conteggio parole e, per lo Scrittore, la verifica testuale delle citazioni descritta sotto.

## I cinque agenti

| # | Agente | Colore | Modello predefinito | Compito |
|---|--------|--------|---------------------|---------|
| 1 | Lettore | verde acqua | Sonnet 5 | Legge i passaggi più pertinenti del corso e produce il **dossier** |
| 2 | Ricercatore | ambra | Sonnet 5 | Cerca **e legge** le pagine online; URL ed estratti verificati in codice |
| 3 | Selettore | rosa antico | **Haiku 4.5** | Tiene solo le fonti pertinenti e aderenti alla materia |
| 4 | Scrittore | viola | Opus 5.5 | Scaletta, tre opzioni **in parallelo**, rifiniture di singoli paragrafi |
| 5 | Controllore | indaco | Sonnet 5 | Sorveglia il processo e giudica **ogni citazione** |

### Molti PDF: estrazione, passaggi, recupero

Il materiale del corso non viene più spedito intero a ogni chiamata. Al caricamento (`agents/corpus.ts`):

1. **Estrazione nel browser** con pdf.js, pagina per pagina, con avanzamento reale ("pagina 12 di 80").
   Un solo worker condiviso per tutti i file; la scena 3D si ferma durante l'estrazione.
2. **Passaggi** di circa 1600 caratteri, sovrapposti di 200 e tagliati a fine frase, ognuno con
   **file e pagine** di provenienza.
3. **Corpus in IndexedDB**, separato dalla sessione: sopravvive al ricaricamento della pagina.
4. **Recupero BM25** (radici approssimate, stopword italiane): a ogni chiamata si inviano solo i
   passaggi più pertinenti, entro un budget che scegli con la **profondità di lettura**
   (sintetica / standard / estesa). Con più domande — argomento, capitolo, concetti del dossier — i
   risultati si alternano, così ogni tema ha il suo materiale. Se tutto il corso sta nel budget, si
   manda tutto.

I PDF **scansionati** (senza testo selezionabile) vengono riconosciuti e allegati interi come
documento, così il modello li legge dalle immagini; non si salvano su disco e dopo un ricaricamento
l'app chiede di ricaricarli.

### Fonti lette per intero e verificate

Il Ricercatore ha due strumenti server: `web_search_20260318` per trovare e **`web_fetch_20260318`**
per leggere le pagine (entrambi con `allowed_callers: ['direct']`, `max_content_tokens` per limitare
le pagine lunghe). Per ogni fonte consegna da 2 a 5 **estratti letterali**. In codice
(`agents/verifyUrls.ts`):

- l'URL deve comparire fra i risultati reali della ricerca o fra le pagine lette, altrimenti la
  fonte è esclusa e l'esclusione finisce in console;
- ogni estratto deve comparire nel **testo della pagina scaricata** (i PDF letti da `web_fetch`
  arrivano in base64 e si estraggono con pdf.js): quelli non ritrovati vengono scartati.

Una fonte senza estratti verificati resta visibile ma **non può essere citata**.

### Citazioni verificate a livello di affermazione

Lo Scrittore cita con marcatori `[F1]` (fonti approvate) e `[C3]` (passaggi del corso) e, per ogni
marcatore, dichiara l'affermazione sostenuta e l'**estratto copiato alla lettera**. Poi:

1. **Controllo testuale in codice** (`agents/citations.ts`): l'estratto deve comparire nel testo di
   quel riferimento, a meno di maiuscole, accenti, punteggiatura e spazi → *verificato*; se almeno
   l'80% dei suoi trigrammi di parole compare → *quasi letterale*; altrimenti → *non ritrovato*.
   Se più di un quarto delle citazioni di un'opzione non si ritrova, l'opzione viene **riscritta**
   con l'elenco degli estratti sbagliati.
2. **Giudizio del Controllore** su ogni citazione, con un id (`A.2.1` = opzione A, paragrafo 2,
   citazione 1): *supportata*, *parziale*, *non supportata*, con una nota.

Nel testo gli apici sono colorati: **verde** verificata, **ambra** quasi letterale o sostegno
parziale, **rosso** non ritrovata o non supportata. Toccando un apice si leggono estratto, fonte ed
esito. In fondo al capitolo c'è l'elenco dei riferimenti usati.

### Due punti di approvazione umana

1. **Fonti.** Dopo la selezione il flusso **si ferma**. La card mostra le fonti tenute con titolo,
   tipo, link, pagina letta, estratti verificati e motivo, e due scelte: **Approvo** o **Non mi
   convince** (con motivo facoltativo). Se rifiuti, il Selettore rivede la scelta tenendo conto del
   motivo; se giudica la copertura insufficiente fa ripartire il Ricercatore.
2. **Scaletta.** Lo Scrittore propone titolo, sezioni, obiettivi, punti e riferimenti previsti. Puoi
   approvarla o chiedere di rifarla dicendo cosa cambiare. **Le tre opzioni partono solo dopo.**

### Rifinitura di un solo paragrafo

Sotto ogni paragrafo c'è **Rifinisci**: scrivi cosa cambiare (o scegli un suggerimento: più sintetico,
più formale, collega meglio al corso, aggiungi il confronto fra stagioni…) e lo Scrittore riscrive
**solo quel paragrafo**, vedendo il resto del capitolo. Le citazioni nuove passano lo stesso controllo
testuale e il giudizio del Controllore. **Annulla rifinitura** riporta alla versione precedente, anche
più volte.

### Il Controllore

- Output non valido → ripete con istruzioni più rigide, fino a 3 tentativi.
- Rete, 5xx, 529 → backoff esponenziale (2s, 4s, 8s). 429 → rispetta l'header `retry-after`.
- **401 e 400 → non ritenta**: l'errore è definitivo e il messaggio è specifico.
- Intercetta `console.error`, `console.warn`, `window.onerror` e `unhandledrejection`, li registra e
  riabilita i controlli se l'interfaccia resta bloccata (solo quando non ci sono richieste in volo).
- Checklist a quattro voci con esito per voce: fonti verificate, perimetro di materia, coerenza con
  le fonti approvate, analisi su più stagioni. Una voce con problema indica l'agente responsabile.
- Valuta le tre opzioni **separatamente**: un rilievo su una non blocca le altre.
- Giudica una per una le citazioni delle opzioni (e dei paragrafi rifiniti).
- Tutto nella **scheda Console** (con il contatore di eventi ed errori non visti sulla linguetta),
  con orario, icone distinte (✓ ⚠ ⟳ ✕ ·) e un bottone **copia log**.

## Costi ed efficienza

- **Stima prima dell'avvio**, accanto al bottone, calcolata su modelli scelti, dimensione del corso e
  profondità di lettura.
- **Consuntivo reale** nella scheda *Costi*: ogni risposta registra i campi `usage` (input, output,
  scrittura e lettura della cache, ricerche, pagine lette) e il costo a listino, per agente e per
  esecuzione, con il risparmio ottenuto dalla cache. Sono stime da listino, non la fattura.
- **Prompt caching** sullo Scrittore: dossier, fonti con estratti e passaggi del corso formano un
  prefisso identico byte per byte (`cache_control` sul blocco), riusato da scaletta, tre opzioni e
  rifiniture. L'opzione A scrive la cache; B e C partono appena A ha cominciato a generare, così la
  leggono invece di riscriverla. I suggerimenti di correzione vanno in fondo al messaggio, mai nel
  system, per non invalidare il prefisso.
- **Selettore su Haiku 4.5**: la selezione è un compito semplice (su Haiku il parametro `effort` non
  è supportato e viene omesso).

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
tanto il mouse; il Ricercatore alterna con il telefono all'orecchio, il Lettore annuisce leggendo, il
Controllore si appoggia allo schienale a braccia conserte), **waiting** (girato verso di te, guarda
l'orologio), **done** (in piedi, si sistema la giacca e ogni tanto alza il pugno), **error** (mano
alla fronte, scuote la testa).

Il viso cambia con lo stato: **sopracciglia** (aggrottate quando lavora, alzate in attesa, a tetto
quando c'è un errore), **bocca** che si curva (sorriso a lavoro chiuso, all'ingiù in errore) e
**battito di ciglia** a intervalli diversi per ogni broker.

### Scena regolabile

Nelle impostazioni, *Sala 3D*: **Automatica** (ridotta su tablet, dispositivi con poca memoria o con
movimento ridotto), **Completa**, **Ridotta** (niente ombre, risoluzione 1×, niente luci delle
plafoniere e delle lampade) o **Spenta** (l'area di lavoro occupa tutto lo schermo).

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

L'area di lavoro è la stessa nelle due interfacce:

- **La squadra in una riga**: stato di ogni agente con un punto che pulsa quando lavora; toccandolo
  si aprono modello, micro-stato, tentativi, errori e il ragionamento passo per passo.
- **Schede Lavoro · Console · Chat · Costi**, con i contatori sulle linguette.
- In *Lavoro*, una **barra dei passi** al posto della lunga colonna:
  **Materiale → Ricerca → Fonti → Scaletta → Capitolo**. Ogni passo mostra se è fatto, in corso o in
  attesa di una tua decisione (pulsa in ambra), e si apre con un tocco. Sotto, i comandi della
  seduta: avvio con stima dei costi, interruzione con speso finora, ripresa dall'agente fallito,
  conferma prima di ricominciare da capo.
- **Modalità carta**: *Leggi su carta* apre il capitolo a tutto schermo su un foglio chiaro, con
  tipografia da lettura, apici delle citazioni cliccabili, rifinitura e annullamento per paragrafo,
  cambio di opzione e copia. Si chiude con *Chiudi* o con Esc.

- **Desktop (≥ 1024px)** — scena a sinistra, area di lavoro a destra; con la scena spenta, l'area
  di lavoro al centro.
- **Tablet/iPad (< 1024px)** — scena in alto (più bassa nella versione ridotta), area di lavoro sotto;
  le decisioni su fonti e scaletta diventano un pannello fisso in basso, raggiungibile da qualunque
  scheda. Tocchi ≥ 44×44 px, testo ≥ 15px, `safe-area-inset` rispettati, il canvas non cattura lo
  scroll. In landscape (≥ 1024px) torna la disposizione affiancata.

## Persistenza

Lo stato della sessione (output, fonti, scaletta, approvazioni, opzioni con le versioni precedenti
dei paragrafi, costi, chat, log) è salvato in **IndexedDB**: `localStorage` è troppo piccolo per i
capitoli. Il **testo estratto** dal corso sta in un secondo archivio IndexedDB e all'avvio viene
confrontato con l'elenco dei file; i PDF originali non si salvano, tranne che come testo. Le sessioni
salvate con la versione precedente vengono migrate tenendo argomento, capitolo, modelli e dati del
caso. "Nuova sessione" ha conferma in linea, senza `confirm()`, e svuota anche il corpus.

## Struttura

```
src/
  types.ts                 tipi condivisi
  store.ts                 Zustand + persist su IndexedDB, registro dei costi
  theme/tokens.css         palette anni '80-'90 e tipografia
  hooks/useLayoutMode.ts   'desktop' | 'tablet'
  layouts/                 DesktopLayout.tsx, TabletLayout.tsx
  scene/
    Scene.tsx              Canvas, luci, OrbitControls limitato
    qualita.ts             scena completa / ridotta / spenta
    TradingFloor.tsx       sala, pannellature, finestre, lavagna, insegna
    Workstation.tsx        scrivania, CRT, lampada da banchiere, telefono, targhetta
    Broker.tsx             broker low-poly: sei pose, espressioni del viso, gesti
    Skyline.tsx            skyline notturno con instancedMesh
    QuoteBoard.tsx         tabellone a LED con lo stato della pipeline
    TradingBell.tsx        campanella con Web Audio
    ReasoningBubble.tsx    nuvoletta a passaggi, una alla volta
    CameraRig.tsx          transizione verso la postazione scelta
    layout.ts              posizioni di sala, postazioni e telecamera
  panels/
    Workspace.tsx          squadra, schede, barra dei passi e contenuto del passo
    TeamStrip.tsx          la squadra in una riga, con il ragionamento di ciascuno
    StepBar.tsx            Materiale → Ricerca → Fonti → Scaletta → Capitolo
    RunBar.tsx             avvio con stima, interruzione, ripresa, errori
    UploadPanel.tsx        molti PDF con estrazione del testo, dati del caso, argomento
    SettingsPanel.tsx      chiave API, modelli, profondità di lettura, scena 3D
    ResearchStep.tsx       dossier, fonti lette con estratti, fonti approvate
    FonteCard.tsx          scheda di una fonte con i suoi estratti verificati
    ApprovalCard.tsx       approvazione delle fonti
    OutlineCard.tsx        scaletta da approvare
    WriterOptions.tsx      le tre opzioni, copia, rigenera, lettura su carta
    ChapterView.tsx        capitolo con apici delle citazioni, rifinitura e annullamento
    ReadingMode.tsx        modalità carta a tutto schermo
    ChecklistPanel.tsx     checklist del Controllore
    CostPanel.tsx          stima e consuntivo dei costi
    Console.tsx            console del Controllore con copia log
    ChatPanel.tsx          chat sul progetto, in streaming
    Ticker.tsx             banda scorrevole alimentata dagli eventi reali
  agents/
    definitions.ts         nome, ruolo, colore e dettaglio di ogni agente
    prompts.ts             SUBJECT_GUARDRAIL, system prompt, prefisso dello Scrittore
    schemas.ts             schemi JSON degli output strutturati
    api.ts                 client SDK, errori tipizzati, pause_turn, streaming, consumi
    corpus.ts              estrazione PDF, passaggi, IndexedDB, recupero BM25
    citations.ts           verifica testuale delle citazioni
    costs.ts               listino, costo dei consumi, stima di un'esecuzione
    verifyUrls.ts          verifica deterministica di URL e pagine lette
    webSearch.ts           turno del Ricercatore: ricerca, lettura, consegna
    supervisor.ts          validazione, ritentativi, backoff, hook di runtime
    pipeline.ts            orchestrazione, approvazioni, scaletta, opzioni, rifinitura, chat
    caseData.ts            lettura CSV ed Excel con riepilogo e anteprima
```

## Collaudo eseguito

Flusso completo guidato in un browser reale con l'API simulata (output strutturati, ricerca e
lettura web, streaming SSE):

- **14 file** caricati insieme (12 PDF di lezioni generati apposta, una scansione, appunti in
  Markdown): testo estratto in circa 4 secondi, 182 passaggi, scansione riconosciuta e allegata come
  documento; con profondità *sintetica* il Lettore riceve i 52 passaggi più pertinenti.
- Ricercatore con ricerca e lettura di tre pagine: **una fonte con URL inventato esclusa** e **tre
  estratti inventati scartati** perché assenti dal testo delle pagine.
- Selettore su Haiku (senza `effort`), **rifiuto** delle fonti con motivo, secondo giro, approvazione.
- Scaletta: riferimento inesistente rimosso, **rifiuto con motivo** (ricevuto dallo Scrittore),
  seconda proposta, approvazione.
- Tre opzioni con il prefisso in cache (scritto da A, letto da B e C); l'opzione B con **tutte le
  citazioni inventate viene rifiutata e riscritta**; l'opzione C con una citazione inventata su sei
  resta, con quell'apice in rosso. Il Controllore giudica 18 citazioni, una *parziale* (in ambra).
- **Rifinitura** del primo paragrafo, giudizio sulle citazioni nuove, **annullamento** che ripristina
  il testo originale; modalità carta aperta e chiusa con Esc.
- Costi per agente con lettura e scrittura della cache e risparmio calcolato; console; chat con
  scaletta e costi nel contesto.
- Scena **spenta** (nessun canvas, lavoro al centro) e **ridotta**; ricaricamento della pagina con
  capitolo e corpus ancora presenti e la sola scansione da ricaricare.
- iPad in verticale: layout a schede con la scena ridotta, tutti i bottoni ≥ 44×44 px.
