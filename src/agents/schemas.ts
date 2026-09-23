/**
 * Schemi JSON degli output strutturati.
 *
 * Vincoli della documentazione (structured outputs): ogni oggetto deve avere
 * `additionalProperties: false` e l'elenco `required`; non sono supportati
 * minLength/maxLength, minimum/maximum, schemi ricorsivi; `minItems` accetta
 * solo 0 oppure 1. Le lunghezze minime le verifica quindi il Controllore in
 * codice, non lo schema.
 */

export type JsonSchema = Record<string, unknown>

const stringa = { type: 'string' } as const
const elencoStringhe = { type: 'array', minItems: 1, items: { type: 'string' } } as const

function oggetto(properties: Record<string, unknown>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

/** Involucro comune: passaggi del ragionamento + risultato specifico. */
function consegna(risultato: JsonSchema): JsonSchema {
  return oggetto({
    passaggi: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
      description:
        'Il metodo che hai seguito, diviso in passaggi brevi e autonomi, scritti per lo studente. Da 3 a 6 passaggi.',
    },
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
          description: 'Punto del materiale del corso da cui viene il concetto.',
        },
      }),
    },
    collegamenti_argomento: elencoStringhe,
    metriche_applicabili: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
      description:
        'Metriche di Finanza Aziendale viste nel corso (per esempio grado di leva operativa, leva finanziaria, misure di rischio e rendimento). Non indici contabili.',
    },
    sintesi_dati_caso: {
      type: 'string',
      description:
        'Che cosa mostrano i dati del caso sulle stagioni disponibili. Se non sono stati caricati dati, dillo esplicitamente.',
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
          description:
            'Perché è stata scartata: per esempio perché riguarda prevalentemente Ragioneria, principi contabili o Diritto.',
        },
      }),
    },
  }),
)

export const SCHEMA_SELETTORE = consegna(
  oggetto({
    selezionate: {
      type: 'array',
      minItems: 0,
      items: oggetto({ url: stringa, motivo: stringa }),
    },
    scartate: {
      type: 'array',
      minItems: 0,
      items: oggetto({ url: stringa, motivo: stringa }),
    },
    copertura_sufficiente: {
      type: 'boolean',
      description:
        'false se le fonti pertinenti disponibili non bastano a scrivere il capitolo: il Ricercatore farà un nuovo giro.',
    },
  }),
)

export const SCHEMA_SCRITTORE = consegna(
  oggetto({
    titolo: stringa,
    paragrafi: {
      type: 'array',
      minItems: 1,
      items: oggetto({ titoletto: stringa, testo: stringa }),
    },
    fonti_citate: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
      description: 'Solo URL presenti fra le fonti approvate.',
    },
    parole: { type: 'integer', description: 'Numero di parole complessivo del testo prodotto.' },
  }),
)

export const SCHEMA_CONTROLLORE = consegna(
  oggetto({
    checklist: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        id: {
          type: 'string',
          enum: ['fonti_verificate', 'perimetro_materia', 'coerenza_fonti', 'piu_stagioni'],
        },
        voce: stringa,
        esito: { type: 'string', enum: ['ok', 'problema', 'non_applicabile'] },
        dettaglio: stringa,
        agente: {
          type: 'string',
          enum: ['lettore', 'ricercatore', 'selettore', 'scrittore', 'controllore', 'nessuno'],
        },
      }),
    },
    valutazioni: {
      type: 'array',
      minItems: 1,
      items: oggetto({
        opzione: { type: 'string', enum: ['A', 'B', 'C'] },
        punti_di_forza: elencoStringhe,
        criticita: { type: 'array', minItems: 0, items: { type: 'string' } },
      }),
    },
  }),
)

/** Tool di consegna del Ricercatore: serve perché usa prima la ricerca web. */
export const TOOL_CONSEGNA_RICERCATORE = {
  name: 'submit_ricercatore',
  description:
    'Consegna l\'elenco definitivo delle fonti trovate. Chiamalo una sola volta, alla fine, dopo aver eseguito le ricerche web.',
  input_schema: SCHEMA_RICERCATORE,
  strict: true,
} as const
