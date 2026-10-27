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
  volumi o scrivanie si va alla schermata corrispondente. La qualità si regola dal menu Grafica
  (vedi "Menu grafica"); si ferma mentre si estrae
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
  caso aziendale facoltativo, modo d'uso, impostazioni grafiche, modelli, costi per mese / agente / azione con il
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

## L'Ufficio: si lavora parlando con gli agenti

All'apertura l'app mostra l'**Ufficio**: un open space moderno in 3D con quattro persone in
giacca e cravatta che interpretano gli agenti. Il nome di ognuno è la funzione che svolge, e
l'ordine delle linguette è lo stesso delle scrivanie, da sinistra a destra:
- **Lettrice del corso**: studia le tue lezioni;
- **Bibliotecario**: ti trova gli articoli;
- **Scrittore**: scrive la tesi con te;
- **Revisora**: controlla che sia tutto giusto.

- **Sala unica**: vetrata a tutta parete sulla campagna calabrese, soffitto a doppia altezza
  (6,6 m) con lamelle acustiche in rovere e tagli di luce, così girando la visuale non si finisce
  mai sopra il tetto (la rotazione verticale è anche limitata),
  parete a listelli verde oliva, libreria con un libro per ogni fonte, schermo con l'avanzamento
  dei capitoli, zona relax e tavolo riunioni. All'avvio la telecamera mostra tutta la sala; quando
  scegli una persona si avvicina a lei con un movimento fluido, e "Tutta la sala" la riporta
  indietro. Illuminazione morbida con luce d'ambiente generata in locale e ombre a contatto.
- **Postazioni da setup di ultima generazione**: scrivania grafite regolabile con striscia LED,
  PC con vetro temperato, ventole RGB che girano e luci che scorrono fra i colori, monitor curvo
  ultrawide su braccio in alluminio, tastiera meccanica retroilluminata, tappetino XXL, supporto
  per le cuffie. Sedie ergonomiche con schienale alto avvolgente, poggiatesta, cuscino lombare,
  braccioli regolabili e base a cinque razze, con inserti nel colore di ogni persona. Con
  "movimento ridotto" del sistema luci e ventole restano ferme.
- **Conversazione**: sul computer è un pannello semitrasparente sopra la scena (il centro ottico
  si sposta perché il pannello non copra le persone). Ogni persona si presenta, dice che cosa fare
  in base allo stato della tesi e offre le risposte possibili come pulsanti: al massimo tre
  subito, le altre dietro "Altre opzioni". Le schede da guardare (risultati di ricerca, fonti
  della sezione, scaletta, bozza, osservazione) compaiono dentro la conversazione. Le azioni
  chiamano le stesse funzioni delle pagine di dettaglio, quindi controlli e verifiche restano
  identici.
- **Che cosa fa ogni persona**:
  - **Lettrice**: lezioni (anche 25 file), idee principali del corso, parole del corso.
  - **Bibliotecario**: ricerca dal campo di testo o per la prima sezione scoperta, approvazione dei
    risultati, schede in blocco, testi completi, PDF.
  - **Scrittore**: approvazione dell'indice, scelta della sezione, fonti, scaletta, bozza, foglio,
    controllo delle citazioni.
  - **Revisora**: note del relatore, controllo della tesi, controllo approfondito, file Word.
- **Domande libere**: scrivendo a una persona le si fa una domanda; risponde dal suo ruolo e
  conosce tutta la tesi, con lo stesso contesto in cache della vecchia chat (in modalità gratuita
  passa da Claude.ai). Lo storico di ogni persona si salva nel progetto e si sincronizza.
- **Telefono e iPad in verticale**: niente 3D, i ritratti delle quattro persone e la conversazione
  a tutta larghezza.
- Le pagine di dettaglio restano nel menu: Panoramica, Corso, Fonti, Scrittura, Revisione.

## Linguaggio semplice e ripristino

- Tutti i testi dell'app (pagine, dialoghi dei colleghi, messaggi di errore, stati di lavoro)
  sono scritti in modo semplice e alla mano, dando del tu: niente parole tecniche come "quadro
  teorico", "corpus" o "metadati". Restano invariati i testi che l'app manda al modello.
- **Ricomincia da capo** (Impostazioni): il pulsante "Ripristina" cancella fonti, testo scritto,
  ricerche, note del relatore, glossario e conversazioni, e tiene solo le lezioni del corso (con
  le idee principali che la lettrice ne ha ricavato). Prima di confermare mostra cosa sparisce;
  prima di cancellare fa una copia di sicurezza ("Prima del ripristino"), recuperabile dallo
  stesso pannello delle copie. Chiave API, collegamento fra dispositivi e preferenze restano.

## Grafica e pagine riordinate

- **Barra laterale** sul computer e sull'iPad: icone sempre visibili, nomi al passaggio del mouse
  (sull'iPad il nome sta sotto l'icona). Sul telefono resta la barra in basso.
- **Intestazioni di pagina** con una foto realistica presa dall'ufficio 3D (vista sugli uliveti,
  bibliotecario, scrittore, revisore, il PC, la squadra; se l'immagine non si carica torna il
  disegno), il passo del percorso e il collega che se ne occupa ("Chiedi a lui/lei").
- **Kit comune** (`src/ui/`): icone, "i" con la spiegazione lunga, sezioni a fisarmonica,
  cassetti che scorrono da destra, menu a tendina, coriandoli per i traguardi, suoni leggeri
  (spenti di default, pulsante in testata e in Impostazioni). Un solo pulsante verde per sezione.
- **Panoramica**: in alto copertina della tesi, anello delle pagine che si riempie e "Cosa fare
  adesso"; i quattro passi in fila con percentuali; indice compatto, e l'indice completo si
  modifica in un cassetto. La guida "Come funziona" si apre da sola solo al primo avvio, poi dal "?".
- **Corso**: una colonna sola con ricerca in cima e tre sezioni a fisarmonica (file, idee
  principali, parole del corso).
- **Fonti**: biblioteca a copertine con pallino di stato, filtri dietro "Filtra", dettagli della
  fonte in un cassetto; Copertura come mappa a colori dei paragrafi (Elenco e Griglia restano).
- **Scrittura**: due colonne (indice e foglio), barra a tre tappe Fonti → Scaletta → Testo,
  comandi raccolti in "Chiedi allo scrittore", fonti e appunti in un cassetto, versioni e frasi da
  IA in una barretta sotto il foglio.
- **Revisione**: riepilogo in cima (note aperte, citazioni rosse, problemi) con "Scarica la tesi
  in Word".
- **Impostazioni** in quattro schede: Account e dispositivi, La tesi, Sicurezza, Avanzate.
- **Tema scuro** nero caldo con dettagli oro; caratteri più ariosi.
- **Ufficio**: interruttore giorno/notte (in automatico segue l'ora vera: alba, giorno, tramonto
  e notte con il sole nella posizione giusta per la Calabria), entrata in sala dalla porta di vetro al
  primo avvio, colleghi che salutano con la mano quando finiscono un lavoro e monitor con il testo
  che scorre mentre lavorano.

## Ufficio realistico

- **Persone vere**: i quattro colleghi sono avatar realistici (Microsoft Rocketbox, licenza MIT)
  seduti alla scrivania, con respiro, sguardo e saluto; i loro volti compaiono anche nelle
  linguette della chat. Se il modello non si carica resta il personaggio semplice.
- **Fuori dalla vetrata** un paesaggio 3D calabrese: cielo che segue l'ora (sole reale per
  38,9° N), mar Tirreno con riflessi, terrazze di ulivi con muretti a secco, casolari, un paese
  con il campanile sulla costa, nuvole che si muovono e stormi di uccelli. Di notte luna sul mare,
  stelle e finestre accese. Il paesaggio si carica solo quando serve.
- **Luce ed effetti**: materiali con texture vere (legno, pelle, metallo), riflessi presi dal cielo
  di fuori, profondità di campo, bagliore, ombre morbide e colore da cinema. Schermata di
  caricamento all'ingresso e volo della telecamera verso il monitor quando apri un collega.
- **Qualità**: si regola dal menu **Grafica** (vedi sotto). Con "riduci movimento" vento, uccelli e
  nuvole stanno fermi.
- Crediti delle risorse in `public/assets/CREDITS.md`.

## Menu grafica

Come nei videogiochi: si apre dal bottone con il monitor nella sala (in basso a sinistra, accanto a
giorno/notte) o da Impostazioni › Account e dispositivi › **Impostazioni grafiche**. Pannello scuro
sopra la sala, che cambia mentre scegli; Esc o × per chiudere, frecce ◀ ▶ (o cursori), su/giù per
passare da una riga all'altra, una riga di spiegazione in fondo, **Ripristina predefiniti**.

- **Qualità**: Automatica (predefinita), Bassa, Media, Alta, Epica; toccando una voce si passa a
  Personalizzata. *Automatica* parte da Alta su ogni dispositivo, iPad compreso, misura la
  fluidità e, se resta sotto ~45 fotogrammi al secondo, scende un gradino alla volta (prima la
  risoluzione, poi ombre, occlusione, mare, vegetazione) e lo dice ("Ho abbassato un po' la
  grafica…" con il link al menu); se torna fluida può risalire, mai sopra Alta. Bassa ≈ la vecchia
  "ridotta" senza extra, Media ≈ la vecchia "ridotta", Alta ≈ la vecchia "completa".
- **Schermo**: scala di rendering 50–200%, risoluzione dinamica, limite FPS (30/60/120/illimitato),
  contatore FPS, campo visivo 40–75°.
- **Grafica**: ombre (Off → Epiche, 512–4096 px, morbide da Alte), occlusione ambientale,
  antialiasing (FXAA, SMAA, MSAA 2x/4x), bagliore, qualità texture, qualità persone (Semplice,
  Realistica = dettaglio pieno in primo piano, Massima), riflessi del mare (Off, Semplici,
  Specchio), distanza degli alberi, densità della vegetazione, nuvole e uccelli, effetti cinema,
  luci della sala.
- **Avanzate**: Ufficio 3D acceso/spento (era "Scena 3D: spenta"), animazioni (spente di partenza
  con "riduci movimento"), entrata dalla porta, pausa quando non guardi, precompila gli shader.
- Le scelte valgono solo su questo dispositivo (`localStorage`, `studio-tesi.grafica`, JSON con
  versione); la vecchia "ridotta" diventa Media e la "completa" Alta. Per le prove automatiche
  `studio-tesi.grafica-prova` (per esempio `Alta`) fissa un preset.
- **Più leggera a parità di aspetto**: la sala disegna solo quando serve (a piena velocità mentre
  la visuale si muove o un collega parla, ~12 fotogrammi al secondo da ferma); i mobili fermi sono
  uniti in poche mesh (da ~1900 a ~450 chiamate di disegno in Alta); le ombre dell'arredo si
  calcolano una volta e quelle delle persone una decina di volte al secondo (in Epica sempre); il
  pavimento non fa più lo specchio; il mare aggiorna il riflesso un fotogramma sì e uno no; prima
  si carica la sala, poi il paesaggio, poi le texture grandi; le persone in primo piano passano al
  modello pieno senza "buchi".

## Strumenti per finire la tesi

- **Ponte con Claude.ai in un tocco**: "Copia e apri Claude.ai" copia la richiesta (con un codice tipo
  `ST-C3RQ`) e apre Claude.ai. Quando torni, l'app riconosce la risposta negli appunti e chiede
  "Ho trovato la risposta di Claude: la uso?". Su Safari basta un tocco su "Incolla la risposta".
- **Collega che pensa**: mentre aspetti, il volto del collega respira con una frase su cosa sta facendo.
- **Correzioni del relatore** (Revisione): incolli le note o carichi .txt/.pdf/.docx (anche i commenti
  a margine) e il revisore le trasforma in cose da fare, paragrafo per paragrafo, da spuntare.
- **Frasi simili alle fonti** (Revisione): controllo gratuito e senza internet a sequenze di 8 parole
  contro lezioni e fonti, con percentuale e passaggio originale. Non sostituisce l'antiplagio
  dell'università.
- **Discussione** (Revisione): 10-15 domande probabili della commissione con risposta breve e scaletta
  delle slide; si scaricano in .md o .txt.
- **Consegna e ritmo** (Panoramica): data di consegna, giorni che mancano, quanto scrivere oggi, se sei
  in anticipo o in ritardo. **I tuoi progressi**: grafico delle pagine giorno per giorno con la linea del
  ritmo giusto.
- **Word pronto da consegnare**: frontespizio (dati in Impostazioni › La tesi), indice automatico, numeri
  di pagina, margini 2,5 cm (3 a sinistra), 12 pt, interlinea 1,5, capitoli su pagina nuova.
- **Dettatura a voce** in Scrittura e nelle chat (it-IT; "virgola", "punto", "a capo").
- **Copia automatica su GitHub** una volta al giorno in `studio-tesi/copie/AAAA-MM-GG.json`, ultime 30,
  ripristino da Impostazioni.
- **Ufficio**: niente sfocatura sui colleghi, chi ti parla si gira verso di te, gli altri alzano lo
  sguardo quando entri; entrata dalla porta a ogni apertura (tocca per saltare); fuori la stagione vera
  (raccolta con reti e cassette in autunno, ulivi in fiore in primavera); la scena si ferma quando non
  la guardi.
- **Più veloce e installabile**: ogni pagina si carica solo quando serve (primo caricamento da 218 a
  95 kB compressi); app installabile sull'iPad (Condividi › Aggiungi alla schermata Home) che funziona
  anche senza internet, con avviso "C'è una versione nuova · Aggiorna".

## Tesi più prestante

Migliorie al lavoro sulla tesi, a parità di risultati (dove si va più veloci, i risultati sono
identici a prima: lo controllano i collaudi).

- **Ricerca nel corso con l'indice salvato**: l'indice di ricerca delle lezioni (BM25) si costruisce
  una volta e si salva in IndexedDB (`studio-tesi-indice-corso`, con un numero di formato e
  l'impronta del testo di ogni file). Se aggiungi o togli un file si rifà, rileggendo solo i file
  nuovi; all'avvio si riprende così com'è. Ricerca nel corso, "Cerca in tutta la tesi", la
  Lettrice e lo Scrittore usano lo stesso indice e danno gli stessi passaggi di prima.
- **Lavori pesanti in sottofondo**: indice, ricerca nel corso e controllo delle frasi simili girano
  in un *web worker* (`src/agents/sottofondo.worker.ts`), così la pagina non si blocca. Se il
  worker non parte, la pagina esegue lo stesso codice (`src/agents/lavori.ts`) con lo stesso
  risultato; dove gira lo dice `<html data-sottofondo="lavoratore|pagina">`.
- **Frasi simili: si ricontrolla solo ciò che cambia**: il risultato di ogni paragrafo si ricorda
  (impronta del paragrafo + versione delle fonti, anche dopo la ricarica). "Controlla di nuovo"
  rifà solo i paragrafi cambiati e lo dice; **Ricontrolla tutto** rifà ogni paragrafo.
- **Ricerche negli archivi ricordate per 7 giorni**: le risposte di OpenAlex, Crossref e Semantic
  Scholar si salvano su questo dispositivo (IndexedDB `studio-tesi-cataloghi`), per la stessa
  ricerca scritta allo stesso modo (maiuscole e spazi non contano). Mai gli errori né le risposte
  vuote. Se una ricerca usa la memoria, la pagina lo dice: "Risultati degli archivi di 2 giorni fa
  · **Aggiorna**"; Aggiorna richiede tutto di nuovo e aggiunge i risultati nuovi da guardare.
- **Sincronizzazione a pezzi**: vedi "Sincronizzazione fra dispositivi". Una modifica a una sezione
  manda il suo capitolo e un file principale piccolo, non tutto il progetto.
- **Scrittura fluida anche con 60 pagine**: conteggi delle parole ricordati, niente copie del testo
  per sapere se una sezione è vuota, date e numeri formattati con un formattatore solo, citazioni e
  frasi da IA ricalcolate subito dopo che la pagina ha risposto ai tasti. Si vede la stessa cosa di
  prima.
- **PDF scansionati letti dalle immagini (OCR)**: prima venivano rifiutati. Ora, se un PDF del corso
  è fatto di immagini, l'app disegna ogni pagina a 300 dpi con pdf.js e ne legge il testo con
  tesseract.js (italiano e inglese), tutto sul dispositivo: "Leggo le immagini: pagina 3 di 20",
  con **Ferma**. I passaggi letti così sono segnati ("letto dalle immagini") e le citazioni dicono
  comunque file e pagina. Motore, lavoratore e lingue (modelli `best_int` dai pacchetti
  `@tesseract.js-data/ita` ed `eng`) li aggiunge la build in `assets/ocr/` (circa 16 MB, nessun
  CDN): non entrano nel precache dell'app, si scaricano la prima volta che servono (un motore da
  3,9 MB adatto al dispositivo + 4,6 MB di lingue) e poi il service worker li tiene, quindi l'OCR
  funziona anche offline. Funziona anche su Safari per iPad.

Misure con 50 PDF di lezioni (4.500 passaggi) e una tesi di 60 pagine, processore rallentato 4 volte
come su un iPad: prima ricerca nel corso dopo la ricarica da 1,9 s (pagina ferma 1,8 s) a 0,2 s
(pagina mai ferma); frasi simili, secondo controllo senza modifiche da 12 s a 0,4 s, dopo aver
cambiato un paragrafo da 11,7 s a 1,4 s; scrivendo nell'editor (rallentato 6 volte) il lavoro che
blocca la pagina scende da 1.044 a 262 ms, il blocco più lungo da 165 a 73 ms; una modifica a una
sezione manda a GitHub 44 KB invece di 170 KB (con fonti dal testo completo la differenza cresce).

## Ufficio: visuale su iPad e chat a scomparsa

- Sull'iPad la visuale della sala si gira col dito, come sul computer con il mouse.
- Il pulsante "Nascondi chat" in alto a destra toglie le chat per vedere tutta la sala; lo stesso
  pulsante ("Mostra chat") le riapre. La scelta resta su quel dispositivo.

## Portare la chiave API su un altro dispositivo

In Impostazioni › Account e dispositivi, con la chiave salvata, "Mostra la chiave per copiarla"
la fa vedere per un minuto con "Copia la chiave" e "Condividi" (AirDrop, Note, Messaggi). Sull'altro
dispositivo la incolli e premi "Salva la chiave". La chiave non passa dalla sincronizzazione, così non
finisce mai su GitHub.

## Interfaccia: un percorso in quattro passi

- **Menu**: Inizio · 1 Corso · 2 Fonti · 3 Scrittura · 4 Revisione · Chiedi, con Guida e
  Impostazioni a destra. Biblioteca e "Cerca nuove fonti" sono schede dentro *Fonti*; lezioni e
  glossario sono schede dentro *Corso*. Ogni pagina si apre con il passo e una frase su a cosa serve.
- **Inizio**: il *prossimo passo* in evidenza (le altre cose da fare sono raccolte sotto),
  l'**avanzamento** verso le 50–60 pagine (300 parole a pagina: Word, Times 12, interlinea 1,5;
  obiettivo e parole per pagina si cambiano in Impostazioni → Tesi) con l'obiettivo di ogni
  capitolo in proporzione alle sue sezioni, l'indice, il titolo con la domanda, il **percorso**
  con lo stato dei quattro passi, i numeri essenziali.
- **Guida** al primo avvio dentro l'Inizio (passi, colori delle citazioni, modalità gratuita,
  sincronizzazione), da riaprire in qualunque momento con il tasto *Guida*.
- La **barra degli agenti** compare solo quando un agente lavora, aspetta, ha finito o ha un
  errore. La **scena 3D** è facoltativa: si apre e si carica solo a richiesta, e sul telefono non c'è.
- **Telefono**: i passi stanno in una barra in basso con le icone, Guida e Impostazioni in alto,
  niente scorrimento orizzontale.

## Strumenti per lavorare meglio

- **Cerca in tutta la tesi** (tasto in alto o Ctrl+K / ⌘K): un riquadro che cerca, in codice e
  gratis, nel testo delle sezioni, nelle fonti (anche testo completo e schede), nelle lezioni
  del corso, nel glossario, nelle osservazioni e nella chat. Le parole trovate sono evidenziate;
  un risultato apre la sezione, la fonte o la pagina giusta.
- **Mappa di copertura** (Fonti → Copertura): per ogni sezione conta le fonti scelte e quelle
  citate. Senza fonti è rossa, con una sola ambra, con due o più verde. Suggerisce le fonti della
  biblioteca che sembrano pertinenti e fa partire una ricerca già impostata per le sezioni da
  rinforzare. In più c'è la griglia sezioni × fonti (● citata, ○ scelta, · forse utile) e
  l'elenco delle fonti che nessuna sezione usa.
- **Concentrazione** (Scrittura): restano solo il testo della sezione e una barra con titolo,
  parole e pagine; Esc per uscire.
- **Tema scuro**: automatico come il dispositivo, oppure chiaro o scuro a mano (Impostazioni →
  Questo dispositivo). Tutti i colori sono variabili con una palette per tema; la modalità carta
  resta un foglio chiaro.

## Computer e iPad: una sola app con due modi

Ho scelto **una sola app che si adatta**, con due modi rilevati in automatico e modificabili a mano:
un solo indirizzo, un solo file di progetto e nessun codice duplicato. Il modo *computer* ha
l'editor a tre colonne e la scena ruotabile; il modo *iPad* mette prima lettura e decisioni, usa la
scena senza controlli che catturano il dito (la qualità grafica è la stessa: Automatica) (lo scorrimento resta alla pagina), tocchi di
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
- **Cosa va su GitHub**: `studio-tesi/progetto.json` (file principale), i pezzi del progetto in
  `studio-tesi/pezzi/` (un file per capitolo, le fonti in 8 cassetti, `registro.json` con ricerche
  e costi, `conversazioni.json`) e `studio-tesi/corpus.json` (il testo dei file del corso). Si manda
  solo ciò che è cambiato: i pezzi cambiati, uno per volta, e per ultimo il file principale, che
  elenca lo sha esatto di ogni pezzo (chi riceve legge proprio quelle versioni e scarica solo i
  pezzi che non ha già). Il formato di prima (tutto in `progetto.json`) si legge ancora e al primo
  invio diventa quello a pezzi; una versione vecchia dell'app, davanti al formato nuovo, chiede di
  ricaricare la pagina senza toccare niente. Ogni invio è un commit "Aggiornamento da
  iPhone/iPad/computer", quindi resta anche la storia delle versioni.
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

Il collaudo delle migliorie "tesi più prestante" aggiunge 84 controlli: indice salvato e riusato
dopo la ricarica con risultati identici al BM25 di prima (20 domande su 50 PDF), ricerca nel
lavoratore e ripiego nella pagina con il lavoratore bloccato, frasi simili identiche al controllo
di prima e ricontrollo dei soli paragrafi cambiati, archivi ricordati con "Aggiorna" ed errori mai
ricordati, sincronizzazione a pezzi con GitHub simulato (anche contro la build precedente), editor
con 60 pagine, OCR in Chromium e "come Safari" (senza iteratore dei ReadableStream, anche nel
worker di pdf.js), Ferma e OCR senza internet dopo il primo uso. I collaudi 1, 2, 3, 7 e 8 passano
ancora (il primo ora aspetta il risultato della ricerca nel corso, che arriva dal lavoratore).

Dopo il riordino delle pagine i collaudi sono stati adeguati ai nuovi posti dei comandi (schede,
fisarmoniche, cassetti, menu "Chiedi allo scrittore", barra laterale) senza togliere controlli,
e se ne è aggiunto uno nuovo (48 controlli): ricomincia da capo con le lezioni che restano e la
copia "Prima del ripristino", le quattro schede delle Impostazioni, il pulsante dei suoni, il
cassetto dell'indice, il menu dello scrittore, il cassetto di una fonte, il giorno/notte
dell'ufficio e nessuno scorrimento orizzontale su iPhone in 21 viste. Il collaudo ha trovato due
problemi, corretti: misure da iPad (tocchi 44 px, testo 15 px) nei componenti nuovi e la conferma
dopo il ripristino che non si vedeva. Passano tutti: 409 controlli in 12 collaudi. Dopo le nuove funzioni (ponte in un tocco, correzioni, frasi simili, discussione, consegna e ritmo, Word, dettatura, copie su GitHub, app installabile) i collaudi sono saliti a 507 controlli, tutti verdi. Con il menu grafica, lo studio più leggero e la tesi più prestante (indice salvato, lavori in sottofondo, PDF scansionati, sincronizzazione a pezzi) sono 516 controlli nelle 12 serie, più le prove dedicate a grafica e tesi.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build (percorsi relativi, funziona sotto /Studio-Tesi/)
npm run lint
```

Il collaudo dell'Ufficio aggiunge 28 controlli, tutti in modalità gratuita:
- avvio sull'Ufficio con la sala 3D, le quattro persone e la presentazione della lettrice;
- Lettrice: lezioni caricate dalla conversazione, quadro teorico tramite Claude.ai con le verifiche
  raccontate, proposta del lessico;
- Bibliotecario: ricerca scritta nel campo di testo con piano e selezione, risultati approvati dentro la
  conversazione, passo successivo proposto;
- Scrittore: indice approvato e passaggio alla scelta delle fonti, cambio di sezione;
- Revisora: osservazione del relatore e domanda libera con il suo ruolo e il contesto;
- storico per persona e dopo la ricarica, scelta della persona toccando il cartellino nella
  scena, nessuna chiamata a pagamento, telefono senza 3D e senza scorrimento orizzontale.

I collaudi precedenti sono stati adeguati: la chat è diventata la domanda libera alla revisora, con gli
stessi controlli su streaming, cache e storia; la scena ora sta nell'Ufficio. Passano tutti: 356
controlli in totale.

Il collaudo degli strumenti aggiunge 31 controlli:
- tema: automatico chiaro e scuro, scelto a mano, contrasto del testo, persistenza, carta chiara;
- concentrazione: cosa sparisce, conteggio delle parole, uscita con Esc e con il tasto;
- ricerca: Ctrl+K, testo della tesi con evidenziazione e apertura della sezione, testo completo
  di una fonte, glossario, nessun risultato, Esc;
- copertura: conteggi, fonte della sezione, suggerimenti, fonti non usate, filtro, griglia,
  ricerca impostata e usata una volta sola;
- iPhone: riquadro a tutto schermo, schede su una riga, niente scorrimento orizzontale.

Il collaudo del riordino aggiunge 28 controlli: menu a percorso, barra degli agenti nascosta a
riposo, scena caricata solo a richiesta, guida al primo avvio (chiusa resta chiusa, si riapre dal
tasto, porta al passo 1), schede dentro Corso e Fonti, avanzamento in pagine con obiettivo per
capitolo, obiettivo modificabile, percorso con stato e collegamenti, iPhone con la barra in basso
e senza scorrimento orizzontale. I collaudi precedenti sono stati adeguati ai nuovi nomi del menu
e passano tutti.

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
  scene/       scena 3D (sala, persone realistiche, effetti, telecamera, esterno/ con cielo,
               mare e uliveti)
  screens/     cruscotto, scrittura, ricerca, biblioteca, corso, revisione, glossario, chat,
               impostazioni
  components/  conferme in linea, nuvolette, barra degli agenti, costi, modalità carta
  store.ts     Zustand + IndexedDB
```
