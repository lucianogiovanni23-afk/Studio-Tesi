/**
 * Schemi JSON degli output strutturati (`output_config.format`).
 *
 * Vincoli della documentazione: ogni oggetto ha `additionalProperties: false` e
 * l'elenco `required`; niente minLength/maxLength, minimum/maximum o schemi
 * ricorsivi; `minItems` accetta solo 0 oppure 1. Lunghezze e coerenze si
 * verificano quindi in codice.
 */

export type JsonSchema = Record<string, unknown>

export const stringa = { type: 'string' } as const

export function elenco(minItems: 0 | 1 = 1, descrizione?: string): JsonSchema {
  return {
    type: 'array',
    minItems,
    items: { type: 'string' },
    ...(descrizione ? { description: descrizione } : {}),
  }
}

export function oggetto(properties: Record<string, unknown>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

/** Ogni agente consegna il ragionamento in passaggi, mostrati una nuvoletta alla volta. */
export function consegna(risultato: JsonSchema): JsonSchema {
  return oggetto({
    passaggi: elenco(
      1,
      'Il metodo che hai seguito, diviso in passaggi brevi e autonomi, scritti per lo studente. Da 3 a 6 passaggi.',
    ),
    risultato,
  })
}

export const SCHEMA_QUADRO = consegna(
  oggetto({
    concetti: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        termine: stringa,
        definizione: { type: 'string', description: 'Definizione come la dà il materiale del corso, con parole tue.' },
        applicazione: {
          type: 'string',
          description:
            "Come il concetto si applica alla tesi, dichiarando se riguarda la raccolta (olivicoltore), la produzione (frantoio) o entrambe.",
        },
        rif: { type: 'string', description: 'Etichetta del passaggio del corso da cui viene il concetto, per esempio "C4".' },
        estratto: {
          type: 'string',
          description: 'Frase COPIATA ALLA LETTERA da quel passaggio, che sostiene la definizione. Nessuna parafrasi.',
        },
      }),
    },
    collegamenti: {
      type: 'array',
      minItems: 0,
      items: oggetto({
        capitolo: { type: 'string', description: "Numero e titolo del capitolo dell'indice." },
        collegamento: stringa,
      }),
    },
    lacune: elenco(
      0,
      'Temi utili alla tesi che il materiale del corso NON tratta: per il vincolo di materia non andranno sviluppati.',
    ),
  }),
)

const TEMI = ['raccolta', 'frantoio', 'prezzi', 'eventi_meteo', 'strumenti_copertura']

export const SCHEMA_PIANO = consegna(
  oggetto({
    query_cataloghi: elenco(
      1,
      'Da 4 a 6 query brevi (3-6 parole) per i cataloghi accademici, in inglese, italiano e spagnolo, senza operatori booleani.',
    ),
    query_web: elenco(1, 'Da 2 a 4 query per la ricerca web, in italiano, con zone o varietà quando utile.'),
  }),
)

/**
 * Tool di consegna del Bibliotecario. Con `strict: true` gli argomenti
 * rispettano lo schema; la chiamata non viene forzata (tool_choice "auto"),
 * perché i modelli più recenti rifiutano il tool_choice forzato.
 */
export const TOOL_CONSEGNA_FONTI = {
  name: 'consegna_fonti',
  description:
    'Consegna le fonti trovate e lette. Chiamalo una volta sola, alla fine, dopo aver letto le pagine con web_fetch.',
  strict: true,
  input_schema: oggetto({
    passaggi: elenco(1, 'Il metodo seguito, in 3-6 passaggi brevi per lo studente.'),
    fonti: {
      type: 'array',
      minItems: 0,
      items: oggetto({
        titolo: stringa,
        url: { type: 'string', description: 'URL copiato esattamente da un risultato di ricerca o da una pagina letta.' },
        ente_o_autori: { type: 'string', description: 'Ente che pubblica (per esempio ISMEA) o autori, come compaiono nella pagina.' },
        anno: { type: 'string', description: 'Anno di pubblicazione se indicato nella pagina, altrimenti stringa vuota.' },
        descrizione: stringa,
        perche_rilevante: stringa,
        estratti: elenco(0, 'Da 2 a 4 frasi COPIATE ALLA LETTERA dal testo della pagina letta. Nessuna parafrasi.'),
      }),
    },
    fonti_scartate: {
      type: 'array',
      minItems: 0,
      items: oggetto({ titolo: stringa, url: stringa, motivo: stringa }),
    },
  }),
} as const

export const SCHEMA_SELEZIONE = consegna(
  oggetto({
    valutazioni: {
      type: 'array',
      minItems: 0,
      items: oggetto({
        id: { type: 'string', description: 'Identificativo del candidato, per esempio "R7".' },
        decisione: { type: 'string', enum: ['tenere', 'scartare'] },
        pertinenza: { type: 'string', enum: ['alta', 'media', 'bassa'] },
        temi: { type: 'array', minItems: 0, items: { type: 'string', enum: TEMI } },
        motivo: { type: 'string', description: 'Una frase. Se scarti per materia, di\' quale ambito (contabile, giuridico, agronomico).' },
      }),
    },
  }),
)

export const SCHEMA_SCHEDA = consegna(
  oggetto({
    domanda: { type: 'string', description: 'La domanda di ricerca della fonte.' },
    metodo: { type: 'string', description: 'Dati e metodo usati, in breve.' },
    risultati: { type: 'string', description: 'I risultati principali, con i numeri quando ci sono.' },
    rilevanza: {
      type: 'string',
      description: 'Perché serve alla tesi: punto di vista (raccolta o frantoio) e capitolo in cui usarla.',
    },
    frasi_chiave: elenco(0, 'Da 2 a 5 frasi COPIATE ALLA LETTERA dal testo della fonte. Nessuna parafrasi.'),
  }),
)

/** Più schede in una sola consegna: ogni scheda porta l'etichetta della fonte (S1, S2…). */
export const SCHEMA_SCHEDE = consegna(
  oggetto({
    schede: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        id: { type: 'string', description: 'Etichetta della fonte, per esempio "S1".' },
        ...((SCHEMA_SCHEDA.properties as { risultato: { properties: Record<string, unknown> } }).risultato.properties),
      }),
    },
  }),
)

const CITAZIONE = oggetto({
  rif: { type: 'string', description: 'Etichetta del riferimento usata nel testo, per esempio "F12" o "C3".' },
  affermazione: { type: 'string', description: 'La frase del testo che questa citazione sostiene.' },
  estratto: {
    type: 'string',
    description: 'Passo COPIATO ALLA LETTERA dal testo di quel riferimento, così come appare nel materiale fornito.',
  },
})

const PARAGRAFO = oggetto({
  testo: {
    type: 'string',
    description: 'Il paragrafo, con i marcatori [F..] e [C..] subito dopo le affermazioni prese dai riferimenti.',
  },
  citazioni: { type: 'array', minItems: 0, items: CITAZIONE },
})

export const SCHEMA_SCALETTA = consegna(
  oggetto({
    punti: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        titolo: stringa,
        contenuto: { type: 'string', description: 'Che cosa dice questo punto, in una o due frasi.' },
        riferimenti: elenco(0, 'Etichette dei riferimenti da usare, per esempio "F12", "C3".'),
      }),
    },
    lacune: elenco(0, 'Che cosa manca nelle fonti approvate per sostenere bene la sezione.'),
  }),
)

export const SCHEMA_BOZZA = consegna(
  oggetto({ paragrafi: { type: 'array', minItems: 1, items: PARAGRAFO } }),
)

export const SCHEMA_PARAGRAFO = consegna(oggetto({ paragrafo: PARAGRAFO }))

export const SCHEMA_ALTERNATIVE = consegna(
  oggetto({
    alternative: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        approccio: { type: 'string', description: 'In poche parole, che cosa cambia rispetto all\'originale.' },
        paragrafo: PARAGRAFO,
      }),
    },
  }),
)

export const SCHEMA_GIUDIZI = consegna(
  oggetto({
    giudizi: {
      type: 'array',
      minItems: 0,
      items: oggetto({
        n: { type: 'string', description: 'Numero della citazione nell\'elenco, per esempio "3".' },
        giudizio: { type: 'string', enum: ['supportata', 'parziale', 'non_supportata'] },
        motivo: { type: 'string', description: 'Una frase: perché.' },
      }),
    },
  }),
)

export const SCHEMA_OSSERVAZIONE = consegna(
  oggetto({
    lettura: { type: 'string', description: 'Come hai interpretato l\'osservazione del relatore, in una o due frasi.' },
    proposte: {
      type: 'array',
      minItems: 0,
      items: oggetto({
        posizione: { type: 'string', description: 'Sezione e paragrafo, esattamente come etichettati: per esempio "1.2 §3".' },
        tipo: { type: 'string', enum: ['modifica', 'commento'] },
        originale: { type: 'string', description: 'Per una modifica: il paragrafo attuale COPIATO ALLA LETTERA. Per un commento: stringa vuota.' },
        proposta: { type: 'string', description: 'Per una modifica: il paragrafo riscritto, con gli stessi marcatori [F..] [C..]. Per un commento: il consiglio.' },
        motivo: { type: 'string', description: 'Perché questa modifica risponde all\'osservazione.' },
      }),
    },
  }),
)

export const SCHEMA_CONTROLLO = consegna(
  oggetto({
    rilievi: {
      type: 'array',
      minItems: 0,
      items: oggetto({
        tipo: { type: 'string', enum: ['terminologia', 'ripetizione', 'materia', 'coerenza'] },
        sezione: { type: 'string', description: 'Etichetta della sezione, per esempio "3.2".' },
        passo: { type: 'string', description: 'Il passo interessato, COPIATO ALLA LETTERA dal testo della tesi (una frase o parte di frase).' },
        problema: stringa,
        suggerimento: stringa,
      }),
    },
  }),
)

export const SCHEMA_LESSICO = consegna(
  oggetto({
    termini: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        termine: { type: 'string', description: 'Il termine ESATTAMENTE come lo scrive il materiale del corso (minuscolo, al singolare).' },
        definizione: { type: 'string', description: 'Definizione breve, con le parole del corso.' },
        varianti_da_evitare: elenco(0, 'Sinonimi o formule generiche che un testo potrebbe usare al posto del termine del corso.'),
        rif: { type: 'string', description: 'Passaggio del corso in cui il termine è definito, per esempio "C4".' },
        estratto: { type: 'string', description: 'Frase COPIATA ALLA LETTERA da quel passaggio, che contiene il termine.' },
      }),
    },
  }),
)
