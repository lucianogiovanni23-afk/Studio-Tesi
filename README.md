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
| 3. Scrittura | scaletta da approvare, bozze, riscritture, alternative, citazioni verificate | **fatta** |
| 4. Revisione | osservazioni del relatore, coerenza fra capitoli, bibliografia, chat | **fatta** |
| 5. Sincronizzazione | iPhone, iPad e computer allineati tramite un repository GitHub privato | **fatta** |

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

## Cosa c'è nella fase 3

- **Tre passi per ogni sezione**, una sezione alla volta:
  1. **fonti della sezione**: scegli dalla biblioteca (in cima le più pertinenti) e approvi;
     si può approvare anche "nessuna fonte, solo il corso". Lo Scrittore potrà citare solo queste;
  2. **scaletta**: proposta dallo Scrittore (con le lacune delle fonti) o scritta da te,
     modificabile punto per punto e da approvare;
  3. **testo**: solo dopo le due approvazioni si può chiedere la bozza.
- **Comandi dello Scrittore** (Opus 5.5), ciascuno con stima del costo e conferma in linea:
  proponi una bozza della sezione, riscrivi questo paragrafo (con un'indicazione facoltativa),
  dammi due alternative, collega al corso. Il paragrafo è quello in cui hai il cursore. Ogni
  risultato arriva come **proposta**: la leggi con le citazioni colorate e scegli se usarla o
  scartarla. Il testo resta sempre modificabile da te.
- **Citazioni controllate in codice**: ogni affermazione presa da una fonte o dal corso ha un
  marcatore (`[F12]` per la fonte numero 12 della biblioteca, `[C3]` per un passaggio del corso)
  e un estratto letterale, che il codice cerca nel testo di quel riferimento:
  verde = verificato, ambra = quasi letterale o sostegno parziale, rosso = non ritrovato, non
  supportato o fonte non approvata per la sezione. **"Verifica le citazioni"** rifà il controllo in
  codice (gratuito) e segnala i marcatori senza citazione; poi si può chiedere il **giudizio del
  Revisore** sul merito di ogni citazione. Toccando un marcatore si vedono estratto, fonte e giudizio.
- **Copia del testo nello stile scelto**: autore-anno, con i rimandi consecutivi uniti
  "(Rossi, 2021; Verdi, 2020)", oppure note a piè di pagina numerate con il riferimento completo.
- **Versioni**: ogni proposta accettata lascia una versione; il testo che sostituisce resta
  recuperabile. La **modalità carta** mostra le citazioni in stile autore-anno, toccabili.
- **Prompt caching**: il materiale comune della sezione (progetto, glossario, quadro teorico,
  scaletta, testo delle fonti approvate, passaggi del corso) è costruito una volta e inviato
  identico al byte con `cache_control`; le istruzioni variabili stanno in fondo. Le stime lo
  dicono quando il materiale è già in cache; i costi mostrano il risparmio.
- Lo Scrittore lavora su una sezione e un comando alla volta.

### Verifiche sulla documentazione (fase 3)

- Lo Scrittore usa gli output strutturati in streaming (`messages.stream` + `output_config.format`)
  per non incorrere nei timeout con testi lunghi; effort `high` per la bozza, `medium` per il resto
  (su Opus 5.5 il predefinito è `medium`, quindi va indicato).
- Il prompt caching è un confronto di prefisso: basta un carattere diverso prima del punto in cache
  per perderlo. Per questo il materiale comune viene costruito una sola volta per sezione e
  ricostruito solo quando cambiano fonti, scaletta o corso.

## Cosa c'è nella fase 4

- **Osservazioni del relatore**: le incolli e le colleghi a un capitolo (o a tutta la tesi). Il
  Revisore riceve il testo a paragrafi etichettati ("1.2 §3"), spiega come ha letto
  l'osservazione e propone modifiche puntuali (un paragrafo alla volta, con prima e dopo) o
  consigli. Il codice controlla che il paragrafo "prima" esista davvero in quella posizione,
  altrimenti la proposta viene scartata e contata; i marcatori nuovi senza citazione vengono
  tolti e segnalati. Accetti o rifiuti **una per una**: la modifica accettata entra nel testo e il
  testo precedente resta fra le versioni. L'osservazione si chiude quando decidi tu.
- **Controllo di tutta la tesi**:
  - in codice, gratuito: varianti del glossario usate al posto del termine scelto, frasi
    ripetute fra sezioni, parole spia di sconfinamenti di materia, citazioni rosse e marcatori
    senza citazione;
  - con il Revisore, su richiesta e con stima: coerenza fra capitoli, punti di vista raccolta e
    frantoio mescolati, analisi su una sola campagna, termini e materia. Ogni rilievo deve citare
    un passo che esiste davvero nella tesi, altrimenti viene scartato.
  Ogni rilievo porta alla sezione interessata.
- **Bibliografia** generata dai metadati veri delle fonti effettivamente citate nel testo, in
  ordine alfabetico, nello stile scelto (autore-anno: "Rossi, P. e Bianchi, S. (2023). Titolo.
  Rivista. DOI"; note: "P. Rossi, S. Bianchi, Titolo, in «Rivista», 2023, DOI"), più il materiale
  del corso citato. Segnala i marcatori senza fonte e le fonti mai citate; si copia o si scarica;
  un bottone segna come "usate" le fonti citate, con i capitoli.
- **Chat sulla tesi** (Sonnet 5.5, effort basso, in streaming): conosce capitoli e testi,
  biblioteca con le schede, quadro teorico, osservazioni, risultati da approvare, stato degli
  agenti e costi, con lo stesso vincolo di materia. La parte stabile del contesto (tesi e
  biblioteca) è in cache e resta identica fra i messaggi; quella che cambia spesso (osservazioni,
  agenti, costi) sta dopo. La conversazione è salvata nel progetto; stima del costo per messaggio.

## Miglioramenti dopo la fase 4

**Stesura meno "da intelligenza artificiale"**
- **Lessico del corso**: dalla schermata Corso il Lettore ricava i termini tecnici come li
  scrivono le lezioni (anche con 25 o più file) e li mette nel glossario, con le varianti da
  evitare. In codice si tengono solo i termini che compaiono davvero nei file, e non si vietano
  le varianti che il corso stesso usa spesso. Scrittore e Revisore ricevono il lessico come
  obbligatorio; il rilevatore segnala ogni variante usata al posto del termine del corso.
- **Rilevatore di frasi tipiche dell'IA**, in codice e gratuito: formule di enfasi vuota ("è
  fondamentale sottolineare"), metafore logore ("gioca un ruolo cruciale"), aperture generiche,
  parole enfatiche ripetute, connettivi ripetuti a inizio frase, chiusure riassuntive di
  paragrafo, ritmo monotono, trattino lungo. Compare sotto il testo di ogni sezione (con
  "Sistema questo paragrafo", che prepara la riscrittura), su ogni proposta dello Scrittore prima
  di accettarla e nel controllo di tutta la tesi. Le stesse regole sono nelle istruzioni dello
  Scrittore e del Revisore.

**Affidabilità e uso quotidiano**
- **Diagnostica con la tua chiave** (Impostazioni): una prova reale e quasi gratuita di ogni
  modello configurato, dello streaming dello Scrittore, della ricerca web e dei cataloghi.
- **Budget mensile**: raggiunto il tetto, nessuna chiamata parte (il controllo è nel punto unico
  da cui partono tutte le chiamate); il cruscotto avvisa all'80%.
- **Copie di sicurezza automatiche** nel browser: all'avvio e ogni 15 minuti se qualcosa è
  cambiato, le ultime 10, ripristinabili (lo stato attuale viene conservato prima).
- **Esportazione in Word** (Revisione → Esporta in Word): tutta la tesi o un capitolo, titoli con
  gli stili di Word, Times New Roman 12 e interlinea 1,5, note a piè di pagina vere nello stile
  note o rimandi autore-anno, bibliografia in fondo.
- **Avvio più leggero**: le librerie per i PDF e per Word si scaricano solo quando servono; il
  file principale passa da 916 a 577 KB.

**Ricerca: testo completo e pagine**
- **Testo completo dei paper open access** (Biblioteca): i cataloghi indicano se un articolo ha
  una versione gratuita (etichetta "open access"). Con "Cerca il testo completo" il browser prova
  a scaricarla gratis; il codice controlla che il documento sia proprio quel paper (le parole del
  titolo devono comparire all'inizio) e scarta le pagine troppo corte. Se il sito dell'editore non
  lo fa scaricare al browser, puoi farlo leggere tramite l'API (strumento web_fetch nella versione
  base, sul modello più economico, una lettura per fonte) dopo aver visto la stima. Con il testo
  completo le schede, lo Scrittore e le verifiche lavorano sull'intero articolo e non sul solo
  abstract; allo Scrittore vanno i pezzi più pertinenti, etichettati con la pagina.
- **Numero di pagina nelle citazioni**: per i PDF (caricati, scaricati o letti via API) l'app
  ricorda dove inizia ogni pagina e trova in codice la pagina dell'estratto citato. La pagina
  compare nelle frasi chiave, nel dettaglio della citazione, nella copia ("(Rossi e Bianchi,
  2023, p. 246)"), nella modalità carta e nelle note di Word. La numerazione segue quella della
  rivista: la prima pagina stampata arriva dai cataloghi e si può correggere nei dati della
  fonte; "Verifica le citazioni" ricalcola le pagine.

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

## Modalità gratuita (senza chiave API)

Senza chiave l'app è gratuita: ogni comando degli agenti passa da **Claude.ai** con un copia e
incolla, al posto dell'API.

- Tutte le chiamate partono da un solo punto (`agents/api.ts`); senza chiave vengono deviate su
  `agents/ponte.ts`, che compone la richiesta completa: istruzioni, materiale, schema JSON della
  risposta. Una finestra guida lo studente: **Copia la richiesta → Apri Claude.ai → incolla la
  risposta**. Il resto non cambia: il JSON viene letto e controllato, le citazioni e gli estratti
  verificati in codice, i passi non validi ripetuti dal Controllore.
- La finestra accetta la risposta solo se il JSON è completo. Toglie i blocchi di codice e il testo
  intorno, e accetta anche una risposta arrivata in più pezzi ("continua"). Quando il Controllore
  scarta una risposta, spiega il motivo e la nuova richiesta lo dice anche a Claude.
- Al posto del costo stimato compare "Gratis tramite Claude.ai"; budget e consuntivo non servono.
- **Più efficiente**: le schede di lettura si possono preparare **in blocco** (fino a 6 fonti e
  90.000 caratteri per passaggio). Funziona anche con la chiave API e riduce le chiamate.
- **Cosa non c'è** senza chiave: la ricerca web e quella sui siti istituzionali (servono gli
  strumenti di ricerca dell'API, i cui risultati l'app verifica). Restano i cataloghi accademici,
  gratuiti, e i PDF caricati dallo studente; quando un editore blocca il download, l'app mostra il
  link alla versione gratuita da scaricare e allegare.
- Claude.ai gratuito ha un limite di messaggi al giorno.

## Sincronizzazione fra dispositivi

Senza un server, i dati passano da un **repository GitHub privato** dello studente, letto e
scritto dal browser con l'API di GitHub (Impostazioni → Sincronizzazione fra dispositivi).

- **Preparazione, una volta**: un repository privato vuoto (per esempio `studio-tesi-dati`) e un
  token *fine-grained* limitato a quel repository, con *Contents* in lettura e scrittura. Su ogni
  dispositivo si incollano nome del repository e token. L'app rifiuta i repository pubblici.
- **Cosa va su GitHub**: `studio-tesi/progetto.json` (tutto il progetto) e
  `studio-tesi/corpus.json` (il testo dei file del corso, inviato solo quando cambia). Ogni invio
  è un commit "Aggiornamento da iPhone/iPad/computer", quindi resta anche la storia delle versioni.
- **Quando**: 15 secondi dopo l'ultima modifica, quando si esce dall'app o si torna a usarla,
  all'avvio e ogni due minuti mentre è aperta. Mentre un file del corso è in lettura si aspetta.
  Ricevendo, si resta sulla schermata in cui si è.
- **Conflitti**: se entrambi i dispositivi hanno cambiato qualcosa dall'ultima volta, nulla parte
  da solo; un avviso chiede quale versione tenere. Lo stato di questo dispositivo finisce prima fra
  le copie di sicurezza, quello dell'altro resta nella storia del repository. Un dispositivo nuovo
  e vuoto riceve il progetto senza domande.
- **Sicurezza**: il token sta solo in `localStorage` (`studio-tesi.github-token`), viene inviato
  solo ad `api.github.com` e non entra mai nel progetto né nei file; l'invio si blocca se nei dati
  compare qualcosa che somiglia a una chiave Anthropic o a un token GitHub. La chiave API
  Anthropic non si sincronizza: va inserita su ogni dispositivo.

## Avvio e collaudo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build (percorsi relativi, funziona sotto /Studio-Tesi/)
npm run lint
```

Il collaudo della modalità gratuita aggiunge 32 controlli senza chiave e senza nessuna chiamata
all'API: quadro teorico con una risposta senza JSON (spiegata), una in due pezzi con il blocco di
codice, uno scarto del Controllore con il motivo mostrato e una risposta valida (estratti
verificati); annullamento; ricerca con i soli cataloghi; chat; bozza dello Scrittore con un
estratto vero (verde) e uno inventato (rosso); quattro schede in un passaggio con una mancante
richiesta di nuovo e una frase inventata scartata; finestra a tutto schermo su iPhone.

Il collaudo della sincronizzazione aggiunge 26 controlli con GitHub simulato e due dispositivi
(un iPhone e un computer) sullo stesso repository: repository pubblico rifiutato, token sbagliato
spiegato, primo invio, file del corso caricato dall'iPhone che arriva da solo dopo la pausa e si
legge dal computer senza ricaricarlo, modifiche nei due versi, conflitto con le due scelte (copia
di sicurezza e allineamento dell'altro dispositivo), token mai nei dati inviati né nel file,
scollegamento.

Il collaudo del testo completo e delle pagine aggiunge 19 controlli: quattro fonti dai cataloghi
(una scaricabile, una bloccata dall'editore e letta via API con web_fetch base su Haiku, una
senza versione gratuita, una che rimanda a un altro articolo e viene scartata), frasi chiave con
la pagina della rivista, testo allo Scrittore con le pagine, copia, dettaglio, modalità carta e
Word con la pagina, ricalcolo dopo il cambio della prima pagina. I collaudi precedenti passano
ancora tutti (quello della fase 3 ora vede anche la pagina nelle citazioni).

Il collaudo della fase 4 aggiunge 36 controlli: progetto aperto da file con testi, citazioni e
fonti; osservazione del relatore con una proposta valida, una con paragrafo inventato (scartata),
un marcatore nuovo (tolto) e un consiglio; accettazione con versione; controllo in codice
(termini, materia, citazioni) e del Revisore (un rilievo con passo inventato scartato);
bibliografia nei due stili, materiale del corso, fonti non citate; chat in streaming con contesto
in cache identico fra i messaggi; iPad.

Il collaudo della fase 3 aggiunge 38 controlli con lo Scrittore simulato in streaming: blocchi
prima delle approvazioni, scaletta corretta e approvata, bozza con citazioni verdi e rosse (un
estratto parafrasato e una fonte non approvata), prefisso identico al byte fra i comandi,
riscrittura del solo paragrafo con il cursore, due alternative, collegamento al corso con
rinumerazione dei passaggi, controllo in codice e giudizio del Revisore, copia in autore-anno e in
note, versioni, modalità carta e iPad. Durante il collaudo sono emersi e sono stati corretti due
difetti: le citazioni di un paragrafo sostituito restavano nella sezione, e la barra delle
citazioni compariva al primo salvataggio spostando i bottoni proprio mentre si cliccava.

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
               prompt, schemi, Lettore del corso, cataloghi, Bibliotecario, schede,
               Scrittore, controllo delle citazioni, Revisore, chat
  io/          Salva/Apri progetto, PDF dei paper
  scene/       scena 3D (ambiente, uliveto, scaffale, capitoli, agenti, telecamera)
  screens/     cruscotto, scrittura, ricerca, biblioteca, corso, revisione, glossario, chat,
               impostazioni
  components/  conferme in linea, nuvolette, barra degli agenti, costi, modalità carta
  store.ts     Zustand + IndexedDB
```
