/**
 * Schemi JSON degli output strutturati.
 *
 * Vincoli della documentazione: ogni oggetto ha `additionalProperties: false` e
 * l'elenco `required`; niente minLength/maxLength, minimum/maximum o schemi
 * ricorsivi; `minItems` accetta solo 0 oppure 1. Lunghezze e coerenze le
 * verifica quindi il Controllore in codice.
 */

export type JsonSchema = Record<string, unknown>

const stringa = { type: 'string' } as const
const elenco = (minItems: 0 | 1 = 1, descrizione?: string) => ({
  type: 'array',
  minItems,
  items: { type: 'string' },
  ...(descrizione ? { description: descrizione } : {}),
})

function oggetto(properties: Record<string, unknown>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

function consegna(risultato: JsonSchema): JsonSchema {
  return oggetto({
    passaggi: elenco(
      1,
      'Il metodo che hai seguito, diviso in passaggi brevi e autonomi, scritti per lo studente. Da 3 a 6 passaggi.',
    ),
    risultato,
  })
}

export const SCHEMA_LETTORE = consegna(
  oggetto({
    concetti_chiave: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        termine: stringa,
        definizione: stringa,
        lezione_di_riferimento: {
          type: 'string',
          description: 'File e pagine del materiale del corso da cui viene il concetto, come indicati nei passaggi.',
        },
      }),
    },
    collegamenti_argomento: elenco(),
    metriche_applicabili: elenco(
      1,
      'Metriche di Finanza Aziendale viste nel corso (per esempio grado di leva operativa, leva finanziaria, misure di rischio e rendimento). Non indici contabili.',
    ),
    sintesi_dati_caso: {
      type: 'string',
      description: 'Che cosa mostrano i dati del caso sulle stagioni disponibili. Se non sono stati caricati, dillo.',
    },
  }),
)

export const SCHEMA_RICERCATORE = consegna(
  oggetto({
    fonti: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        titolo: stringa,
        url: { type: 'string', description: 'URL completo, esattamente come restituito dalla ricerca web.' },
        tipo: { type: 'string', enum: ['paper', 'dataset', 'articolo', 'report'] },
        descrizione: stringa,
        perche_rilevante: stringa,
        estratti: elenco(
          0,
          'Da 2 a 5 citazioni LETTERALI copiate carattere per carattere dal testo della pagina letta con web_fetch: dati, definizioni, risultati. Nessuna parafrasi.',
        ),
      }),
    },
    fonti_scartate: {
      type: 'array',
      minItems: 0,
      items: oggetto({
        titolo: stringa,
        url: stringa,
        motivo: {
          type: 'string',
          description: 'Perché è stata scartata: per esempio perché riguarda Ragioneria, principi contabili o Diritto.',
        },
      }),
    },
  }),
)

export const SCHEMA_SELETTORE = consegna(
  oggetto({
    selezionate: { type: 'array', minItems: 0, items: oggetto({ url: stringa, motivo: stringa }) },
    scartate: { type: 'array', minItems: 0, items: oggetto({ url: stringa, motivo: stringa }) },
    copertura_sufficiente: {
      type: 'boolean',
      description: 'false se le fonti pertinenti non bastano a scrivere il capitolo: il Ricercatore farà un nuovo giro.',
    },
  }),
)

export const SCHEMA_SCALETTA = consegna(
  oggetto({
    titolo_capitolo: stringa,
    sezioni: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        titoletto: stringa,
        obiettivo: { type: 'string', description: 'Che cosa deve dimostrare o spiegare la sezione, in una frase.' },
        punti: elenco(1, 'Punti da sviluppare nella sezione.'),
        riferimenti: elenco(0, 'Etichette dei riferimenti previsti: F1, F2… per le fonti, C1, C2… per il corso.'),
      }),
    },
    nota_metodo: { type: 'string', description: 'Come la scaletta tiene conto dell\'analisi su più stagioni.' },
  }),
)

const citazione = oggetto({
  rif: { type: 'string', description: 'Etichetta del riferimento: F1, F2… oppure C1, C2…' },
  affermazione: { type: 'string', description: 'La frase del testo che questa citazione sostiene.' },
  estratto: {
    type: 'string',
    description: 'Passo copiato ALLA LETTERA dal testo del riferimento indicato: nessuna parafrasi, nessuna traduzione.',
  },
})

const paragrafo = oggetto({
  titoletto: stringa,
  testo: {
    type: 'string',
    description: 'Testo del paragrafo, con i marcatori [F1], [C3]… subito dopo le affermazioni che derivano da una fonte.',
  },
  citazioni: { type: 'array', minItems: 0, items: citazione },
})

export const SCHEMA_SCRITTORE = consegna(
  oggetto({
    titolo: stringa,
    paragrafi: { type: 'array', minItems: 1, items: paragrafo },
  }),
)

/** Rifinitura di un solo paragrafo. */
export const SCHEMA_PARAGRAFO = consegna(paragrafo)

const giudizio = oggetto({
  id: { type: 'string', description: 'Identificativo della citazione, nel formato indicato (per esempio A.2.1).' },
  giudizio: { type: 'string', enum: ['supportata', 'parziale', 'non_supportata'] },
  nota: { type: 'string', description: 'Motivo in una frase, obbligatorio se il giudizio non è "supportata".' },
})

export const SCHEMA_CONTROLLORE = consegna(
  oggetto({
    checklist: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        id: { type: 'string', enum: ['fonti_verificate', 'perimetro_materia', 'coerenza_fonti', 'piu_stagioni'] },
        voce: stringa,
        esito: { type: 'string', enum: ['ok', 'problema', 'non_applicabile'] },
        dettaglio: stringa,
        agente: { type: 'string', enum: ['lettore', 'ricercatore', 'selettore', 'scrittore', 'controllore', 'nessuno'] },
      }),
    },
    valutazioni: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        opzione: { type: 'string', enum: ['A', 'B', 'C'] },
        punti_di_forza: elenco(),
        criticita: elenco(0),
      }),
    },
    giudizi: { type: 'array', minItems: 0, items: giudizio },
  }),
)

/** Verifica rapida delle citazioni di un paragrafo rifinito. */
export const SCHEMA_GIUDIZI = consegna(oggetto({ giudizi: { type: 'array', minItems: 0, items: giudizio } }))

/** Tool di consegna del Ricercatore: serve perché prima deve cercare e leggere. */
export const TOOL_CONSEGNA_RICERCATORE = {
  name: 'submit_ricercatore',
  description:
    "Consegna l'elenco definitivo delle fonti, con gli estratti letterali. Chiamalo una sola volta, alla fine, dopo aver cercato e letto le pagine.",
  input_schema: SCHEMA_RICERCATORE,
  strict: true,
} as const
