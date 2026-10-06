/**
 * Conoscenza di dominio della tesi: impatto finanziario del meteo sulle
 * imprese olearie in Calabria, nella raccolta e nella produzione.
 *
 * Questi testi entrano nei prompt di tutti gli agenti e della chat, nel
 * glossario e nell'indice di partenza. Sono la "memoria" condivisa del progetto.
 */

export const TITOLO_PREDEFINITO =
  "L'impatto finanziario del meteo sulle imprese olearie calabresi: raccolta e produzione"

export const DOMANDA_PREDEFINITA =
  "In che modo la variabilità meteorologica, osservata su più campagne olearie, incide su ricavi, costi e liquidità degli olivicoltori e dei frantoi calabresi, e quali strumenti finanziari di gestione del rischio possono attenuarne gli effetti?"

/** Vincolo di materia: identico in ogni prompt di ogni agente e della chat. */
export const VINCOLO_MATERIA = `VINCOLO DI MATERIA (vale sempre, senza eccezioni)
Si resta nella Finanza Aziendale come definita dal materiale del corso dello studente. Sono esclusi:
- Ragioneria: bilancio in senso contabile, principi contabili, scritture;
- Diritto: commerciale, privato, agrario, normativa PAC e normativa assicurativa;
- agronomia e biologia: tecniche colturali, biologia della mosca olearia, fisiologia dell'olivo.
Questi temi possono comparire SOLO come causa di un effetto finanziario, in una sola frase, senza svilupparli.
Se un tema non è nel materiale del corso, non va trattato, nemmeno come sfondo.
Le fonti prevalentemente contabili, giuridiche o agronomiche vanno scartate dichiarandone il motivo.`

export const PUNTI_DI_VISTA = `DUE PUNTI DI VISTA DA TENERE SEMPRE SEPARATI
- RACCOLTA (olivicoltore): il meteo incide su quantità e qualità delle olive, quindi i ricavi sono incerti mentre i costi di raccolta restano.
- PRODUZIONE (frantoio): con meno olive lavorate i costi fissi pesano di più (leva operativa); cambiano il fabbisogno di liquidità e i rapporti con i fornitori.
Non mescolare i due piani nella stessa argomentazione senza dichiararlo.`

export const TEMI = `TEMI DA COPRIRE
- Analisi su PIÙ campagne olearie (ottobre–gennaio), mai su una sola.
- Annate di carica e scarica: l'olivo alterna naturalmente annate abbondanti e scarse, quindi non ogni calo dipende dal meteo.
- Legame prezzo-quantità: quando la produzione crolla il prezzo spesso sale (campagna 2023/24); la protezione dei ricavi è parziale e vale solo se il calo è generale e non locale.
- Eventi critici per fase: siccità e caldo in fioritura (aprile–maggio), gelate, grandine, autunni umidi che favoriscono la mosca olearia.
- Strumenti di gestione del rischio, visti dal lato finanziario: assicurazioni agevolate e polizze parametriche, fondi mutualistici, derivati meteo, credito e liquidità per la campagna, diversificazione.`

export const ZONE = ['Piana di Gioia Tauro', 'Sibaritide', 'Lametino', 'Crotonese']
export const VARIETA = ['Carolea', 'Ottobratica', 'Dolce di Rossano']

export const TERRITORIO = `TERRITORIO E VARIETÀ DA USARE NELLE RICERCHE
- Zone: ${ZONE.join(', ')}.
- Varietà: ${VARIETA.join(', ')}.`

export const FONTI_PRIORITARIE = [
  { nome: 'ISMEA', cosa: 'prezzi, costi, andamento delle campagne' },
  { nome: 'ISTAT', cosa: 'produzione e superfici per provincia' },
  { nome: 'CREA – RICA', cosa: 'dati economici delle aziende agricole' },
  { nome: 'ARPACAL', cosa: 'serie meteo storiche della Calabria' },
  { nome: 'Copernicus', cosa: 'serie climatiche e meteo storiche' },
  { nome: 'Letteratura accademica', cosa: 'in italiano, inglese e spagnolo (la Spagna ha molti studi su clima e olio)' },
]

export const FONTI = `FONTI DA CERCARE PER PRIME
${FONTI_PRIORITARIE.map((f) => `- ${f.nome}: ${f.cosa}.`).join('\n')}`

/** Blocco di dominio comune a tutti i prompt. */
export const BLOCCO_DOMINIO = [PUNTI_DI_VISTA, TEMI, TERRITORIO, FONTI].join('\n\n')

/** Temi che il Lettore cerca nel materiale del corso per il quadro teorico. */
export const DOMANDE_CORSO = [
  'rischio operativo e rischio di impresa',
  'leva operativa costi fissi costi variabili',
  'grado di leva operativa margine di contribuzione punto di pareggio',
  'liquidità fabbisogno finanziario capitale circolante',
  'volatilità dei flussi di cassa rischio e rendimento',
  'gestione del rischio copertura assicurazione derivati',
  'diversificazione del rischio',
  'ciclo finanziario stagionalità crediti debiti fornitori',
]

// ---------------------------------------------------------------------------
// Glossario iniziale
// ---------------------------------------------------------------------------

export const GLOSSARIO_INIZIALE: { termine: string; definizione: string; varianti: string[] }[] = [
  {
    termine: 'campagna olearia',
    definizione:
      "Periodo di raccolta e molitura delle olive, in Calabria indicativamente da ottobre a gennaio. È l'unità di tempo su cui si leggono ricavi, costi e fabbisogno di liquidità del settore; l'analisi va sempre condotta su più campagne.",
    varianti: ['stagione olearia', 'annata olearia'],
  },
  {
    termine: 'resa in olio',
    definizione:
      "Quantità di olio ottenuta da 100 kg di olive, espressa in percentuale. Varia con varietà, maturazione e andamento dell'annata e determina quanto ricavo si ottiene da ogni chilo di olive lavorate.",
    varianti: ['rendimento in olio', 'resa'],
  },
  {
    termine: 'molitura',
    definizione:
      "Lavorazione delle olive in frantoio per estrarne l'olio. Per il frantoio è il volume di attività su cui si ripartiscono i costi fissi: meno molitura significa più costo fisso per chilo lavorato.",
    varianti: ['frangitura', 'lavorazione'],
  },
  {
    termine: 'frantoio',
    definizione:
      "Impresa di trasformazione che molisce le olive, per conto proprio o per conto terzi. Ha una struttura con costi fissi rilevanti, quindi è esposta alla leva operativa quando le quantità calano.",
    varianti: ['oleificio'],
  },
  {
    termine: 'annata di carica e scarica',
    definizione:
      "Alternanza naturale della produzione dell'olivo fra annate abbondanti (carica) e scarse (scarica). Va distinta dagli effetti del meteo: non ogni calo produttivo è un evento climatico.",
    varianti: ['alternanza di produzione', 'alternanza produttiva'],
  },
  {
    termine: 'olio extravergine',
    definizione:
      "Categoria merceologica dell'olio di oliva di qualità superiore, con prezzo più elevato. La quota di extravergine sul totale prodotto risente delle condizioni dell'annata e quindi incide sul ricavo medio.",
    varianti: ['EVO', 'extra vergine'],
  },
  {
    termine: 'IGP Olio di Calabria',
    definizione:
      "Indicazione geografica protetta dell'olio calabrese. Nella tesi rileva solo come leva di prezzo e di differenziazione del ricavo, senza sviluppare gli aspetti giuridici.",
    varianti: ['IGP Calabria'],
  },
  {
    termine: 'costi fissi e variabili del frantoio',
    definizione:
      "Costi fissi: quelli che restano anche se si lavorano meno olive (impianti, personale stabile, manutenzione, oneri finanziari). Costi variabili: quelli che crescono con le quantità lavorate (energia di lavorazione, manodopera stagionale, smaltimento dei sottoprodotti). Il loro rapporto determina la leva operativa.",
    varianti: ['struttura dei costi del frantoio'],
  },
]

// ---------------------------------------------------------------------------
// Indice di partenza (da far approvare allo studente)
// ---------------------------------------------------------------------------

export interface SezioneIniziale {
  titolo: string
  obiettivo: string
}

export interface CapitoloIniziale {
  titolo: string
  sezioni: SezioneIniziale[]
}

export const INDICE_INIZIALE: CapitoloIniziale[] = [
  {
    titolo: "Rischio climatico e rischio d'impresa: il quadro teorico del corso",
    sezioni: [
      {
        titolo: 'Rischio operativo e volatilità dei flussi di cassa',
        obiettivo: "Definire il rischio operativo con il linguaggio del corso e mostrare perché la variabilità dei flussi di cassa è il punto d'arrivo dell'analisi.",
      },
      {
        titolo: 'Struttura dei costi e leva operativa',
        obiettivo: 'Richiamare costi fissi e variabili, margine di contribuzione e grado di leva operativa come strumenti per leggere gli effetti di un calo delle quantità.',
      },
      {
        titolo: 'Liquidità e fabbisogno finanziario stagionale',
        obiettivo: 'Collegare la stagionalità del ciclo produttivo al fabbisogno di liquidità e ai rapporti con fornitori e banche.',
      },
      {
        titolo: "Il meteo come fonte di rischio d'impresa",
        obiettivo: 'Inquadrare il rischio meteorologico come rischio operativo che si trasmette a ricavi, costi e liquidità.',
      },
    ],
  },
  {
    titolo: 'Il settore olivicolo-oleario calabrese',
    sezioni: [
      {
        titolo: 'Olivicoltori e frantoi: due modelli economici',
        obiettivo: 'Distinguere il punto di vista della raccolta da quello della produzione, con le rispettive fonti di ricavo e strutture di costo.',
      },
      {
        titolo: 'Territori e varietà',
        obiettivo: 'Presentare Piana di Gioia Tauro, Sibaritide, Lametino e Crotonese e le varietà Carolea, Ottobratica e Dolce di Rossano solo per quanto serve all\'analisi finanziaria.',
      },
      {
        titolo: 'La campagna olearia e il ciclo finanziario',
        obiettivo: 'Descrivere la campagna (ottobre–gennaio) come ciclo di entrate e uscite.',
      },
    ],
  },
  {
    titolo: 'Meteo, rese e prezzi su più campagne',
    sezioni: [
      {
        titolo: 'Eventi meteo critici per fase',
        obiettivo: 'Siccità e caldo in fioritura, gelate, grandine, autunni umidi: per ciascuno, una frase sulla causa e lo sviluppo del solo effetto finanziario.',
      },
      {
        titolo: 'Annate di carica e scarica: separare il meteo dall\'alternanza',
        obiettivo: 'Mostrare perché non ogni calo produttivo dipende dal meteo e come tenerne conto leggendo più campagne.',
      },
      {
        titolo: 'Il legame prezzo-quantità',
        obiettivo: 'Analizzare la protezione parziale dei ricavi quando il calo è generale (campagna 2023/24) e i suoi limiti quando il calo è locale.',
      },
    ],
  },
  {
    titolo: 'Effetti su ricavi, costi e liquidità di olivicoltori e frantoi',
    sezioni: [
      {
        titolo: 'Raccolta: ricavi incerti e costi che restano',
        obiettivo: "Effetto del meteo sui ricavi dell'olivicoltore e sui costi di raccolta che non si riducono in proporzione.",
      },
      {
        titolo: 'Frantoio: meno olive, più peso dei costi fissi',
        obiettivo: 'Applicare la leva operativa al frantoio quando cala la molitura.',
      },
      {
        titolo: 'Liquidità, fornitori e credito di campagna',
        obiettivo: 'Effetti sul fabbisogno di liquidità e sui rapporti con fornitori e banche, distinti per olivicoltore e frantoio.',
      },
    ],
  },
  {
    titolo: 'Strumenti di copertura del rischio',
    sezioni: [
      {
        titolo: 'Assicurazioni agevolate e polizze parametriche',
        obiettivo: 'Valutarle dal lato finanziario (costo, base risk, effetto sulla variabilità dei flussi), senza sviluppare la normativa.',
      },
      {
        titolo: 'Fondi mutualistici',
        obiettivo: 'Ruolo nella stabilizzazione dei ricavi, dal punto di vista finanziario.',
      },
      {
        titolo: 'Derivati meteo',
        obiettivo: 'Funzionamento e limiti come copertura, solo se presenti nel materiale del corso.',
      },
      {
        titolo: 'Credito, liquidità e diversificazione',
        obiettivo: 'Strumenti di gestione della liquidità per la campagna e diversificazione come riduzione del rischio.',
      },
    ],
  },
  {
    titolo: 'Conclusioni',
    sezioni: [
      {
        titolo: 'Risultati, limiti e sviluppi',
        obiettivo: 'Rispondere alla domanda di ricerca, dichiarare i limiti (dati, alternanza, perimetro) e indicare sviluppi.',
      },
    ],
  },
]

/** Siti istituzionali in cui il Bibliotecario cerca prima del web generico. */
export const DOMINI_ISTITUZIONALI = [
  'ismea.it',
  'ismeamercati.it',
  'istat.it',
  'crea.gov.it',
  'arpacal.it',
  'cfd.calabria.it',
  'regione.calabria.it',
  'copernicus.eu',
  'ec.europa.eu',
  'eea.europa.eu',
  'masaf.gov.it',
  'internationaloliveoil.org',
  'fao.org',
  'bancaditalia.it',
]

export const ETICHETTA_TEMA = {
  raccolta: 'raccolta',
  frantoio: 'frantoio',
  prezzi: 'prezzi',
  eventi_meteo: 'eventi meteo',
  strumenti_copertura: 'strumenti di copertura',
} as const
