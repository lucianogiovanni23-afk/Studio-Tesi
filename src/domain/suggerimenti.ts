import { quadroObsoleto } from '../store'
import type { Progetto, Schermata } from '../types'

export interface Suggerimento {
  id: string
  testo: string
  tono: 'urgente' | 'normale' | 'info'
  vai: Schermata
  etichetta: string
}

const GIORNI_SENZA_COPIA = 7

/** "Cosa fare adesso": le prossime azioni utili, in ordine di priorità. */
export function suggerimenti(p: Progetto, haChiave: boolean): Suggerimento[] {
  const fuori: Suggerimento[] = []

  if (!haChiave) {
    fuori.push({
      id: 'chiave',
      testo: 'Inserisci la chiave API Anthropic: senza, gli agenti non possono lavorare.',
      tono: 'urgente',
      vai: 'impostazioni',
      etichetta: 'Impostazioni',
    })
  }
  if (!p.indiceApprovato) {
    fuori.push({
      id: 'indice',
      testo: "Rivedi e approva l'indice: è la base su cui lavorano tutti gli agenti.",
      tono: 'urgente',
      vai: 'cruscotto',
      etichetta: "Vai all'indice",
    })
  }

  const aperte = p.osservazioni.filter((o) => o.stato === 'aperta').length
  if (aperte > 0) {
    fuori.push({
      id: 'osservazioni',
      testo: `${aperte} osservazion${aperte === 1 ? 'e' : 'i'} del relatore ancora apert${aperte === 1 ? 'a' : 'e'}.`,
      tono: 'urgente',
      vai: 'revisione',
      etichetta: 'Revisione',
    })
  }

  const deboli = p.capitoli
    .flatMap((c) => c.sezioni)
    .flatMap((s) => s.citazioni)
    .filter((c) => c.testuale === 'non_trovato' || c.testuale === 'rif_sconosciuto' || c.giudizio === 'non_supportata' || c.giudizio === 'parziale' || c.testuale === 'approssimato').length
  if (deboli > 0) {
    fuori.push({
      id: 'citazioni',
      testo: `${deboli} citazion${deboli === 1 ? 'e debole' : 'i deboli'} da sistemare (ambra o rosse).`,
      tono: 'normale',
      vai: 'scrittura',
      etichetta: 'Scrittura',
    })
  }

  const daLeggere = p.fonti.filter((f) => f.stato === 'da_leggere').length
  if (daLeggere > 0) {
    fuori.push({
      id: 'fonti',
      testo: `${daLeggere} font${daLeggere === 1 ? 'e' : 'i'} in biblioteca da leggere.`,
      tono: 'normale',
      vai: 'biblioteca',
      etichetta: 'Biblioteca',
    })
  }

  const pronti = p.courseFiles.filter((f) => f.status === 'pronto').length
  if (pronti === 0) {
    fuori.push({
      id: 'corso',
      testo: 'Carica il materiale del corso: definisce che cosa si può trattare nella tesi.',
      tono: 'normale',
      vai: 'corso',
      etichetta: 'Materiale del corso',
    })
  } else if (!p.quadro) {
    fuori.push({
      id: 'quadro',
      testo: 'Genera il quadro teorico del corso: lo useranno tutti i capitoli.',
      tono: 'normale',
      vai: 'corso',
      etichetta: 'Materiale del corso',
    })
  } else if (quadroObsoleto(p)) {
    fuori.push({
      id: 'quadro-vecchio',
      testo: 'Hai cambiato i file del corso: aggiorna il quadro teorico.',
      tono: 'normale',
      vai: 'corso',
      etichetta: 'Materiale del corso',
    })
  }

  const daRicaricare = p.courseFiles.filter((f) => f.status === 'errore').length
  if (daRicaricare > 0) {
    fuori.push({
      id: 'ricarica',
      testo: `${daRicaricare} file del corso da ricaricare.`,
      tono: 'normale',
      vai: 'corso',
      etichetta: 'Materiale del corso',
    })
  }

  const ultimaCopia = p.salvatoSuFileIl ? new Date(p.salvatoSuFileIl).getTime() : 0
  const scritto = p.capitoli.some((c) => c.sezioni.some((s) => s.testo.trim()))
  if (scritto && Date.now() - ultimaCopia > GIORNI_SENZA_COPIA * 86_400_000) {
    fuori.push({
      id: 'copia',
      testo: ultimaCopia
        ? `L'ultima copia su file risale a più di ${GIORNI_SENZA_COPIA} giorni fa: salva il progetto.`
        : 'Non hai ancora salvato una copia del progetto su file.',
      tono: 'info',
      vai: 'impostazioni',
      etichetta: 'Salva progetto',
    })
  }

  if (fuori.length === 0) {
    fuori.push({
      id: 'tutto-bene',
      testo: 'Nessuna urgenza: continua a scrivere la prossima sezione.',
      tono: 'info',
      vai: 'scrittura',
      etichetta: 'Scrittura',
    })
  }
  return fuori
}
