# Studio tesi — olio e meteo in Calabria

Web app (React + Vite + TypeScript) che accompagna la **ricerca e la stesura di una tesi triennale in
Finanza Aziendale** per tutta la sua durata. Tema: *l'impatto finanziario del meteo sulle imprese
olearie in Calabria, nella raccolta (olivicoltore) e nella produzione (frantoio)*.

Nessun backend: le chiamate all'API Anthropic partono dal browser con l'SDK ufficiale
(`dangerouslyAllowBrowser: true`). Pubblicata su GitHub Pages:
https://lucianogiovanni23-afk.github.io/Studio-Tesi/

## Stato delle fasi

| Fase | Contenuto | Stato |
|---|---|---|
| 1. Fondamenta | indice, capitoli, versioni, glossario; dominio olio/Calabria; scena 3D moderna; modi computer/iPad; Salva/Apri progetto; materiale del corso e quadro teorico | **fatta** |
| 2. Biblioteca e ricerca | cataloghi accademici, fonti istituzionali, web verificato, schede di lettura, tabella della letteratura | **fatta** |
| 3. Scrittura | scaletta da approvare, bozze, riscritture, alternative, citazioni verificate | da fare |
| 4. Revisione | osservazioni del relatore, coerenza fra capitoli, bibliografia, chat | da fare |
| 5. Sincronizzazione | facoltativa, opzioni da proporre prima | da fare |

## Cosa c'è nella fase 1

- **Cruscotto**: titolo e domanda di ricerca modificabili; indice con lo stato di ogni capitolo (da
  fare / bozza / rivisto / approvato dal relatore); "cosa fare adesso"; fonti, parole, file del corso
  e costi del mese. L'indice di partenza (6 capitoli, 18 sezioni con obiettivo) va **approvato**:
  ogni modifica successiva richiede una nuova approvazione.
- **Scena 3D** (cruscotto e navigazione): uno studio luminoso in rovere affacciato su un uliveto,
  con la biblioteca come scaffale (un libro per fonte, colorato per tema), i capitoli come volumi
  sul tavolo (colore per stato, altezza per parole scritte) e le postazioni dei quattro agenti.
  Toccando un agente si apre il suo ragionamento, una nuvoletta alla volta; toccando scaffale,
  volumi o scrivanie si va alla schermata corrispondente. Modalità completa / ridotta / spenta;
  "automatica" sceglie la ridotta su iPad e sui dispositivi meno potenti; si ferma mentre si estrae
  il testo dei PDF; rispetta `prefers-reduced-motion`. Le etichette usano `Html` di drei (non `Text`,
  che scarica un font da CDN).
- **Scrittura**: indice a sinistra, testo modificabile al centro, materiale utile a destra (su
  computer); colonna unica su iPad. Versioni di ogni sezione con ripristino reversibile; modalità
  **carta** a tutto schermo. I comandi dello Scrittore sono visibili ma attivi dalla fase 3.
- **Materiale del corso**: molti PDF e appunti, testo estratto nel browser con pdf.js (un solo
  worker condiviso), diviso in passaggi con file e pagina, salvato in IndexedDB, ricercabile (BM25).
  Il **Lettore del corso** ne ricava il quadro teorico: ogni concetto ha una frase copiata dal corso
  che il codice confronta con il passaggio (verde / ambra / rosso). I temi assenti dal corso sono
  elencati come lacune da non sviluppare.
- **Glossario** condiviso (8 termini iniziali, con varianti da uniformare): entra nei prompt.
- **Impostazioni**: chiave API, Salva/Apri progetto, stile di citazione (autore-anno predefinito),
  caso aziendale facoltativo, modo d'uso, scena, modelli, costi per mese / agente / azione con il
  risparmio della cache, registro degli eventi.
- Biblioteca, Ricerca, Revisione e Chat mostrano cosa arriverà nelle fasi successive.

## Cosa c'è nella fase 2

- **Ricerca**: scrivi una domanda; il Bibliotecario prepara le query (italiano, inglese, spagnolo) e
  cerca, nell'ordine:
  1. nei **cataloghi accademici gratuiti** — OpenAlex, Crossref, Semantic Scholar — chiamati
     direttamente dal browser, senza costi: autori, anno, rivista, DOI e abstract arrivano dai
     cataloghi e non possono essere inventati; i doppioni (stesso DOI o titolo) si uniscono;
  2. nei **siti istituzionali** (ISMEA, ISTAT, CREA, ARPACAL e Centro funzionale della Calabria,
     Copernicus, Commissione europea, EEA, MASAF, Consiglio oleicolo internazionale, FAO, Banca
     d'Italia) con `web_search` limitato a quei domini;
  3. sul **web generico**, anche in spagnolo e inglese.

  Poi la **selezione** (Haiku 4.5) consiglia cosa tenere, assegna i temi e scarta con il motivo
  le fonti prevalentemente contabili, giuridiche o agronomiche. Prima della ricerca l'app mostra
  la stima del costo; durante, l'avanzamento passo per passo. **Nulla entra in biblioteca senza la
  tua approvazione**, una per una o "approva i consigliati".
- **Controlli in codice sulle fonti web**: ogni URL deve comparire fra i risultati reali della
  ricerca o fra le pagine lette con `web_fetch`, altrimenti la fonte è esclusa e segnalata; ogni
  estratto viene confrontato con il testo scaricato e quelli non ritrovati sono scartati e contati.
  Lo storico delle ricerche elenca query, risposte dei cataloghi, esclusi e motivi.
- **Prova dei cataloghi**: un bottone verifica dal browser che ciascun catalogo risponda; se uno
  non risponde (rete, CORS, 429) la ricerca continua con gli altri e lo dice.
- **Biblioteca** che si accumula nel tempo: fonti dalle ricerche e **PDF di paper** caricati da te
  (se il PDF contiene un DOI, i metadati arrivano da Crossref). Per ogni fonte: stato (da leggere,
  letta, usata), tag per tema (raccolta, frantoio, prezzi, eventi meteo, strumenti di copertura),
  capitoli in cui è usata, metadati modificabili, PDF allegabile per avere il testo completo.
- **Schede di lettura** preparate dal Bibliotecario (domanda, metodo, risultati, rilevanza, frasi
  chiave) e correggibili da te. Le frasi chiave sono verificate in codice sul testo della fonte:
  quelle non ritrovate vengono scartate; anche quelle aggiunte a mano ricevono il bollino verde,
  ambra o rosso. Se c'è solo l'abstract, la scheda lo dichiara.
- **Tabella della letteratura** con fonte in stile autore-anno, temi, metodo, risultati e stato,
  scaricabile in CSV per Excel.
- La colonna "Fonti utili" della scrittura propone le fonti della biblioteca più vicine alla
  sezione; il cruscotto segnala i risultati da approvare; lo scaffale 3D mostra un libro per fonte.

### Verifiche sulla documentazione (fase 2)

- `web_search_20260318` e `web_fetch_20260318` esistono e accettano `allowed_callers: ["direct"]`:
  senza questa impostazione la ricerca passerebbe dal filtro dinamico e i risultati non
  tornerebbero tutti nella risposta, quindi non sarebbero verificabili in codice.
- `web_fetch` legge solo URL già comparsi nella conversazione (messaggi, risultati di ricerca):
  è una protezione in più contro gli URL inventati.
- Il vecchio Ricercatore forzava la consegna con `tool_choice: {type: "tool"}`, che su Sonnet 5.5
  e Opus 5.5 dà 400. Ora il tool di consegna ha `strict: true`, `tool_choice` resta automatico e,
  se il modello non consegna, l'app glielo chiede con un messaggio esplicito.
- Dall'ambiente cloud in cui ho sviluppato, i cataloghi sono bloccati dalla rete: sono stati
  collaudati con risposte simulate. Nel tuo browser usa "Prova i cataloghi" per la verifica reale.

## Computer e iPad: una sola app con due modi

Ho scelto **una sola app che si adatta**, con due modi rilevati in automatico e modificabili a mano:
un solo indirizzo, un solo file di progetto e nessun codice duplicato. Il modo *computer* ha
l'editor a tre colonne e la scena ruotabile; il modo *iPad* mette prima lettura e decisioni, usa la
scena ridotta senza controlli che catturano il dito (lo scorrimento resta alla pagina), tocchi di
almeno 44×44 px, testo di almeno 15 px e rispetta le safe area.

## Agenti e modelli

| Agente | Compito | Modello predefinito |
|---|---|---|
| Bibliotecario | ricerca, selezione, schede (fase 2) | `claude-sonnet-5-5`; selezione `claude-haiku-4-5` |
| Lettore del corso | quadro teorico dal materiale del corso | `claude-sonnet-5-5` |
| Scrittore | una sezione alla volta (fase 3) | `claude-opus-5-5` |
| Revisore | citazioni, coerenza, materia, relatore (fase 4) | `claude-sonnet-5-5` |

Tutti modificabili dalle impostazioni. Ogni prompt contiene il dominio (due punti di vista separati,
più campagne, carica e scarica, prezzo-quantità, eventi per fase, strumenti di copertura, zone,
varietà, fonti prioritarie) e il **vincolo di materia** (niente Ragioneria, Diritto, agronomia e
biologia, se non come causa di un effetto finanziario in una frase).

## Verifiche sulla documentazione ufficiale

- È uscito **`claude-sonnet-5-5`**, il Sonnet più recente allo stesso prezzo di `claude-sonnet-5`
  (2 $ / 10 $ per milione di token): su richiesta dello studente è il predefinito; `claude-sonnet-5`
  resta selezionabile.
- `claude-opus-5-5` e `claude-sonnet-5-5` rifiutano il `tool_choice` forzato (`any`/`tool`) con un
  400: si usano gli **output strutturati** (`output_config.format`). Il vecchio wrapper della
  ricerca web lo forzava e verrà riscritto nella fase 2.
- `budget_tokens` dà 400 su Sonnet 5/5.5 e Opus 5.5: si usa `output_config.effort`; su Haiku 4.5
  `effort` è omesso. Su Opus 5.5 l'effort predefinito è `medium`, quindi va sempre indicato.
- La risposta `stop_reason: "refusal"` è gestita con un messaggio chiaro. Non è attivo il parametro
  beta `fallbacks` (ripiego automatico su un altro modello in caso di rifiuto): non è collaudabile
  senza una chiave reale e per questo argomento i rifiuti sono improbabili.

## Dati, chiave e file di progetto

- Il progetto (indice, testi con versioni, biblioteca, schede, glossario, osservazioni, costi) è in
  **IndexedDB**; il testo del corso è in un archivio IndexedDB separato.
- **Salva progetto** scarica un file `.studiotesi.json` (su iPad finisce in File, da spostare su
  iCloud o Drive); **Apri progetto** mostra un'anteprima e chiede conferma in linea prima di
  sostituire. Il file include il testo estratto dei PDF; non include mai la chiave API (il
  salvataggio si blocca se trova qualcosa che le somiglia) né le preferenze del dispositivo.
- La chiave API sta solo in `localStorage` (`studio-tesi.anthropic-api-key`). Avviso mostrato
  sempre: *"Questa chiave resta nel tuo browser e viene inviata direttamente all'API Anthropic. Va
  bene per uso personale; non distribuire l'app ad altri con la chiave dentro. Per un uso condiviso
  serve un backend che la nasconda."*
- Niente `alert`, `confirm`, `prompt`: tutte le conferme sono in linea.

## Avvio e collaudo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build (percorsi relativi, funziona sotto /Studio-Tesi/)
npm run lint
```

Il collaudo della fase 2 aggiunge 39 controlli con cataloghi e API simulati: un catalogo che
risponde 429, una fonte con URL inventato, un estratto che non c'è nella pagina, un turno sospeso
con `pause_turn`, una consegna dimenticata al primo tentativo, una fonte contabile da scartare,
schede con frasi inventate, un PDF con DOI, la tabella e il CSV, iPad.

Il collaudo della fase 1 è stato fatto con Playwright sulla build servita in locale sotto
`/Studio-Tesi/`, con l'API Anthropic simulata: 46 controlli fra cruscotto, approvazione
dell'indice, chiave, estrazione di PDF e appunti, quadro teorico (header, modello, output
strutturato, estratti verdi e rossi), nuvolette, versioni e ripristino, modalità carta, costi,
Salva/Apri progetto, persistenza, scena spenta, iPad (tocchi, testo, scorrimento) e movimento
ridotto, senza errori in console.

## Struttura

```
src/
  domain/      dominio della tesi, progetto iniziale, suggerimenti, etichette
  agents/      api, costi, corpus (pdf.js + BM25), citazioni, verifica URL, supervisore,
               prompt, schemi, Lettore del corso, cataloghi, Bibliotecario, schede
  io/          Salva/Apri progetto, PDF dei paper
  scene/       scena 3D (ambiente, uliveto, scaffale, capitoli, agenti, telecamera)
  screens/     cruscotto, scrittura, ricerca, biblioteca, corso, glossario, impostazioni, in arrivo
  components/  conferme in linea, nuvolette, barra degli agenti, costi, modalità carta
  store.ts     Zustand + IndexedDB
```
