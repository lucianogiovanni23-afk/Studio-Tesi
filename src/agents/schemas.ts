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
