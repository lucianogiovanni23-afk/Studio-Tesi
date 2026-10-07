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

  if (p.budgetMensile !== null) {
    const mese = new Date().toISOString().slice(0, 7)
    const speso = p.usi.filter((u) => u.data.startsWith(mese)).reduce((s, u) => s + u.costo, 0)
    if (speso >= p.budgetMensile * 0.8) {
      fuori.push({
        id: 'budget',
        testo:
          speso >= p.budgetMensile
            ? 'Hai finito i soldi che avevi messo per questo mese: gli agenti sono fermi finché non alzi il limite.'
            : `Hai già speso il ${Math.round((speso / p.budgetMensile) * 100)}% di quello che avevi messo per questo mese.`,
        tono: speso >= p.budgetMensile ? 'urgente' : 'normale',
        vai: 'impostazioni',
        etichetta: 'Spesa del mese',
      })
    }
  }
  if (!haChiave) {
    fuori.push({
      id: 'chiave',
      testo: 'Stai usando l\'app gratis: ogni cosa che chiedi agli agenti passa da Claude.ai, con un copia e incolla. Con una chiave API farebbero tutto da soli.',
      tono: 'info',
      vai: 'impostazioni',
      etichetta: 'Come funziona',
    })
  }
  if (!p.indiceApprovato) {
    fuori.push({
      id: 'indice',
      testo: "Dai un'occhiata all'indice e approvalo: tutti gli agenti partono da lì.",
      tono: 'urgente',
      vai: 'cruscotto',
      etichetta: "Vai all'indice",
    })
  }

  const aperte = p.osservazioni.filter((o) => o.stato === 'aperta').length
  if (aperte > 0) {
    fuori.push({
      id: 'osservazioni',
      testo: `Hai ancora ${aperte} not${aperte === 1 ? 'a' : 'e'} del relatore da sistemare.`,
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
      testo: `${deboli} citazion${deboli === 1 ? 'e' : 'i'} da sistemare (quelle gialle o rosse).`,
      tono: 'normale',
      vai: 'scrittura',
      etichetta: 'Scrittura',
    })
  }

  if (p.inAttesa.length > 0) {
    fuori.push({
      id: 'in-attesa',
      testo: `${p.inAttesa.length} risultat${p.inAttesa.length === 1 ? 'o' : 'i'} della ricerca da guardare: decidi tu cosa entra in biblioteca.`,
      tono: 'urgente',
      vai: 'ricerca',
      etichetta: 'Ricerca',
    })
  }

  const daLeggere = p.fonti.filter((f) => f.stato === 'da_leggere').length
  if (daLeggere > 0) {
    fuori.push({
      id: 'fonti',
      testo: `Hai ${daLeggere} font${daLeggere === 1 ? 'e' : 'i'} in biblioteca ancora da leggere.`,
      tono: 'normale',
      vai: 'biblioteca',
      etichetta: 'Biblioteca',
    })
  }

  const pronti = p.courseFiles.filter((f) => f.status === 'pronto').length
  if (pronti === 0) {
    fuori.push({
      id: 'corso',
      testo: 'Carica le lezioni del corso: servono a capire di cosa puoi parlare nella tesi.',
      tono: 'normale',
      vai: 'corso',
      etichetta: 'Lezioni del corso',
    })
  } else if (!p.quadro) {
    fuori.push({
      id: 'quadro',
      testo: 'Fai trovare alla lettrice le idee principali del corso: servono a tutti i capitoli.',
      tono: 'normale',
      vai: 'corso',
      etichetta: 'Lezioni del corso',
    })
  } else if (quadroObsoleto(p)) {
    fuori.push({
      id: 'quadro-vecchio',
      testo: 'Hai cambiato i file del corso: fai riguardare le idee principali.',
      tono: 'normale',
      vai: 'corso',
      etichetta: 'Lezioni del corso',
    })
  }

  const daRicaricare = p.courseFiles.filter((f) => f.status === 'errore').length
  if (daRicaricare > 0) {
    fuori.push({
      id: 'ricarica',
      testo: `${daRicaricare} file del corso da caricare di nuovo.`,
      tono: 'normale',
      vai: 'corso',
      etichetta: 'Lezioni del corso',
    })
  }

  const ultimaCopia = p.salvatoSuFileIl ? new Date(p.salvatoSuFileIl).getTime() : 0
  const scritto = p.capitoli.some((c) => c.sezioni.some((s) => s.testo.trim()))
  if (scritto && Date.now() - ultimaCopia > GIORNI_SENZA_COPIA * 86_400_000) {
    fuori.push({
      id: 'copia',
      testo: ultimaCopia
        ? `Non salvi una copia del progetto da più di ${GIORNI_SENZA_COPIA} giorni: fallo adesso.`
        : 'Non hai ancora salvato una copia del progetto sul tuo dispositivo.',
      tono: 'info',
      vai: 'impostazioni',
      etichetta: 'Salva progetto',
    })
  }

  if (fuori.length === 0) {
    fuori.push({
      id: 'tutto-bene',
      testo: 'Tutto a posto: vai avanti con la prossima sezione.',
      tono: 'info',
      vai: 'scrittura',
      etichetta: 'Scrittura',
    })
  }
  return fuori
}
