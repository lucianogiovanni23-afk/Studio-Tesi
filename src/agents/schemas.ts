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
