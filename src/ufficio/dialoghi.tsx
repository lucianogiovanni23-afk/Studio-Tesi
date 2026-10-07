import type { ReactNode } from 'react'
import { modalitaGratuita } from '../agents/api'
import { annullaRicerca, avviaRicerca, useRicerca } from '../agents/bibliotecario'
import { ricavaLessico } from '../agents/lessico'
import { generaQuadro } from '../agents/lettoreCorso'
import { proponiPerOsservazione, controlloConRevisore, controlloSoloCodice } from '../agents/revisore'
import { fontiSenzaScheda, gruppiSchede, preparaSchedeInBlocco } from '../agents/schede'
import { proponiBozza, useScrittore } from '../agents/scrittore'
import { puòAvereTestoCompleto, recuperaTuttiNelBrowser } from '../agents/testoCompleto'
import { verificaCitazioniSezione } from './azioni'
import { PassoFonti } from '../components/scrittura/PassoFonti'
import { PassoScaletta } from '../components/scrittura/PassoScaletta'
import { PannelloProposta } from '../components/scrittura/ComandiScrittore'
import { copertura, domandaPerSezione } from '../domain/copertura'
import { ACCETTA_CORSO, caricaFileCorso } from '../io/fileCorso'
import { aggiungiPdfInBiblioteca } from '../io/aggiungiPdf'
import { esportaWord } from '../io/esportaWord'
import { CartaOsservazione } from '../screens/Revisione'
import { InAttesa } from '../screens/Ricerca'
import { contaParoleTesto, quadroObsoleto, useStudio } from '../store'
import type { AgentKey, Capitolo, Progetto, Schermata, Sezione } from '../types'
import { segnaAvanzamento } from './statoUfficio'

/**
 * Che cosa dice e propone ogni persona dell'ufficio, calcolato dallo stato
 * della tesi: una frase, a volte una scheda da guardare (risultati, scaletta,
 * bozza) e le risposte possibili. Le azioni chiamano le stesse funzioni delle
 * pagine di dettaglio, quindi controlli e verifiche restano identici.
 */

export interface Azione {
  id: string
  etichetta: string
  principale?: boolean
  /** Che cosa sta facendo la persona mentre esegue (per l'indicatore "sta lavorando"). */
  lavoro?: string
  esegui?: () => Promise<string | void>
  vai?: Schermata
  file?: { accept: string; multiplo: boolean; carica: (f: File[]) => Promise<string | void> }
  /** Passa il campo di testo alla modalità speciale del turno (per esempio "su cosa cerco"). */
  speciale?: boolean
}

export interface Turno {
  testo: string
  scheda?: ReactNode
  azioni: Azione[]
  /** Uso speciale del campo di testo: se c'è, `avvio` dice se è già attivo. */
  speciale?: { placeholder: string; invio: string; avvio: boolean; lavoro: string; invia: (testo: string) => Promise<string | void> }
}

const pagineDi = (parole: number, ppp: number) => (parole / ppp).toLocaleString('it-IT', { maximumFractionDigits: 1 })

// ---------------------------------------------------------------------------
// Giulia Romano, lettrice del corso
// ---------------------------------------------------------------------------

function turnoLettrice(p: Progetto): Turno {
  const pronti = p.courseFiles.filter((f) => f.status === 'pronto').length
  const inLettura = p.courseFiles.filter((f) => f.status === 'lettura' || f.status === 'estrazione')
  const daRicaricare = p.courseFiles.filter((f) => f.status === 'errore').length
  const lessico = p.glossario.filter((g) => g.origine === 'corso').length
  const carica: Azione = {
    id: 'carica-lezioni',
    etichetta: pronti ? 'Carica altre lezioni' : 'Carica le lezioni',
    principale: pronti === 0,
    lavoro: 'leggo le lezioni…',
    file: {
      accept: ACCETTA_CORSO,
      multiplo: true,
      carica: async (files) => {
        let scartati: string[] = []
        const r = await caricaFileCorso(files, (s) => (scartati = s))
        return [
          r.letti ? `Ricevute, grazie: ${r.letti === 1 ? 'una lezione letta' : `${r.letti} lezioni lette`}.` : 'Non sono riuscita a leggere niente.',
          r.errori ? `${r.errori} non sono riuscita a leggerle: le trovi nella pagina Corso con il motivo.` : '',
          scartati.length ? `Non ho preso ${scartati.join(', ')}: accetto PDF e testo.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      },
    },
  }
  const apri: Azione = { id: 'apri-corso', etichetta: 'Mostrami il quadro', vai: 'corso' }

  if (inLettura.length) {
    const f = inLettura[0]
    return { testo: `Sto leggendo «${f.name}»${f.pagine ? `: pagina ${f.paginaCorrente ?? 0} di ${f.pagine}` : ''}. Un attimo e ti dico.`, azioni: [] }
  }
  if (pronti === 0) {
    return {
      testo: `Mandami le lezioni del corso: PDF o appunti in testo, anche 25 insieme. Le leggo io e ne ricavo i concetti e il lessico che la tesi dovrà usare.${daRicaricare ? ` ${daRicaricare} file sono da ricaricare.` : ''}`,
      azioni: [carica],
    }
  }
  const generaAzione = (aggiorna: boolean): Azione => ({
    id: 'quadro',
    etichetta: aggiorna ? 'Aggiorna il quadro teorico' : 'Prepara il quadro teorico',
    principale: true,
    lavoro: 'preparo il quadro teorico…',
    esegui: async () => {
      await generaQuadro()
      const q = useStudio.getState().progetto.quadro
      if (!q) return
      const verdi = q.concetti.filter((c) => c.esito === 'verificato').length
      return `Fatto: ${q.concetti.length} concetti, ${verdi} con la frase ritrovata alla lettera nelle lezioni.${q.lacune.length ? ` Non trattati dal corso (quindi da non sviluppare): ${q.lacune.slice(0, 3).join('; ')}.` : ''} Ora ricavo il lessico?`
    },
  })
  if (!p.quadro || quadroObsoleto(p)) {
    return {
      testo: p.quadro
        ? `Da quando ho preparato il quadro hai cambiato le lezioni (ora sono ${pronti}): conviene aggiornarlo.`
        : `Ho letto ${pronti} ${pronti === 1 ? 'file' : 'file'}. Preparo il quadro teorico: i concetti del corso, ognuno con una frase copiata dalle lezioni.`,
      azioni: [generaAzione(Boolean(p.quadro)), carica],
    }
  }
  const lessicoAzione: Azione = {
    id: 'lessico',
    etichetta: lessico ? 'Aggiorna il lessico' : 'Ricava il lessico del corso',
    principale: lessico === 0,
    lavoro: 'ricavo il lessico…',
    esegui: async () => {
      const r = await ricavaLessico()
      return `Fatto: ${r.nuove} termini nuovi e ${r.aggiornate} aggiornati nel glossario${r.scartati.length ? `; ne ho scartati ${r.scartati.length} perché non compaiono nelle lezioni` : ''}. Luca li userà scrivendo, e il controllo segnala le varianti.`
    },
  }
  if (lessico === 0) {
    return {
      testo: `Il quadro è pronto: ${p.quadro.concetti.length} concetti. Ora ricavo il lessico, cioè i termini tecnici come li scrive il corso: lo Scrittore sarà obbligato a usarli.`,
      azioni: [lessicoAzione, apri, carica],
    }
  }
  return {
    testo: `Il corso è a posto: ${pronti} lezioni, ${p.quadro.concetti.length} concetti, ${lessico} termini nel lessico. Se aggiungi lezioni aggiorno tutto. Puoi anche chiedermi che cosa dice il corso su un argomento.`,
    azioni: [apri, carica, lessicoAzione],
  }
}

// ---------------------------------------------------------------------------
// Marco Ferrara, bibliotecario
// ---------------------------------------------------------------------------

async function cerca(domanda: string): Promise<string> {
  const gratuita = modalitaGratuita()
  const prima = useStudio.getState().progetto.inAttesa.length
  await avviaRicerca(domanda, { cataloghi: true, istituzionali: !gratuita, web: !gratuita })
  const errore = useRicerca.getState().errore
  if (errore) throw new Error(errore)
  const nuovi = useStudio.getState().progetto.inAttesa.length - prima
  return nuovi > 0
    ? `Ho trovato ${nuovi} risultati con metadati veri dai cataloghi. Te li mostro qui sotto: approvi tu quelli che entrano in biblioteca.`
    : 'Non ho trovato niente di nuovo con questa domanda. Prova a riformularla o a renderla più ampia.'
}

function turnoBibliotecario(p: Progetto, ricercaInCorso: boolean): Turno {
  const gratuita = modalitaGratuita()
  const cop = copertura(p)
  const primaScoperta = cop.sezioni.find((s) => s.livello === 'scoperta') ?? cop.sezioni.find((s) => s.livello === 'debole')
  const speciale: Turno['speciale'] = {
    placeholder: 'Su cosa cerco? Per esempio: costi fissi dei frantoi nelle annate di scarica',
    invio: 'Cerca',
    avvio: p.fonti.length === 0,
    lavoro: 'consulto i cataloghi…',
    invia: (testo) => cerca(testo),
  }
  const pdf: Azione = {
    id: 'pdf',
    etichetta: 'Aggiungi PDF di articoli',
    lavoro: 'leggo i PDF…',
    file: {
      accept: '.pdf,application/pdf',
      multiplo: true,
      carica: async (files) => {
        const r = await aggiungiPdfInBiblioteca(files, (t) => segnaAvanzamento('bibliotecario', t))
        return `${r.aggiunte.length ? `Ho aggiunto ${r.aggiunte.length} ${r.aggiunte.length === 1 ? 'articolo' : 'articoli'} alla biblioteca. ` : ''}${r.note.join(' ')}`
      },
    },
  }
  const altro: Azione = { id: 'altro', etichetta: 'Cerca su un altro argomento', speciale: true }
  const perSezione = primaScoperta
    ? [
        {
          id: 'per-sezione',
          etichetta: `Cerca fonti per la ${primaScoperta.numero}`,
          principale: p.fonti.length > 0,
          lavoro: 'consulto i cataloghi…',
          esegui: () => cerca(domandaPerSezione(primaScoperta)),
        } satisfies Azione,
      ]
    : []

  if (ricercaInCorso) {
    return {
      testo: 'Sto consultando i cataloghi e selezionando i risultati…',
      azioni: [{ id: 'ferma', etichetta: 'Ferma la ricerca', esegui: async () => annullaRicerca() }],
    }
  }
  if (p.inAttesa.length > 0) {
    const consigliati = p.inAttesa.filter((c) => c.consiglio?.decisione === 'tenere').length
    return {
      testo: `Ci sono ${p.inAttesa.length} risultati da valutare${consigliati ? `; ${consigliati} li consiglio io` : ''}. Decidi tu quali entrano in biblioteca: per ognuno ti ho scritto il motivo.`,
      scheda: <InAttesa />,
      azioni: [altro, { id: 'apri-ricerca', etichetta: 'Apri la pagina della ricerca', vai: 'ricerca' }],
      speciale,
    }
  }
  if (p.fonti.length === 0) {
    return {
      testo: `Dimmi su cosa cercare e consulto i cataloghi accademici${gratuita ? ' (sono gratuiti)' : ''}: scrivilo qui sotto. Oppure parto da una sezione dell'indice, o mi dai tu dei PDF.`,
      azioni: [...perSezione, pdf],
      speciale,
    }
  }
  const senza = fontiSenzaScheda(p.fonti)
  const testoCompleto = p.fonti.filter(puòAvereTestoCompleto).length
  const azioni: Azione[] = []
  let testo = `In biblioteca ci sono ${p.fonti.length} fonti.`
  if (senza.length) {
    const gruppi = gruppiSchede(senza).length
    testo += ` ${senza.length} non hanno ancora la scheda di lettura: le preparo${gratuita ? ` (${gruppi} ${gruppi === 1 ? 'passaggio' : 'passaggi'} su Claude.ai)` : ''}?`
    azioni.push({
      id: 'schede',
      etichetta: `Prepara le ${senza.length} schede`,
      principale: true,
      lavoro: 'leggo e preparo le schede…',
      esegui: async () => {
        const r = await preparaSchedeInBlocco(
          senza.map((f) => f.id),
          (g, tot) => segnaAvanzamento('bibliotecario', `schede: gruppo ${g} di ${tot}…`),
        )
        return `Ho preparato ${r.fatte} schede${r.frasiScartate ? `; ho tolto ${r.frasiScartate} frasi chiave perché non le ritrovavo alla lettera nel testo` : ''}. Le trovi in Biblioteca.`
      },
    })
  } else if (testoCompleto) {
    testo += ` Per ${testoCompleto} potrebbe esistere il testo completo gratuito: lo cerco? Con il testo completo le citazioni hanno anche il numero di pagina.`
    azioni.push({
      id: 'testi',
      etichetta: 'Cerca i testi completi',
      principale: true,
      lavoro: 'scarico i testi completi…',
      esegui: async () => {
        const r = await recuperaTuttiNelBrowser((f, tot) => segnaAvanzamento('bibliotecario', `testi completi: ${f} di ${tot}…`))
        return `Ho scaricato ${r.riusciti} testi completi.${r.daApi.length ? ` ${r.daApi.length} sono gratuiti ma il sito non li fa scaricare: aprili dalla Biblioteca, scarica il PDF e allegalo.` : ''}`
      },
    })
  }
  if (primaScoperta) {
    testo += ` ${cop.conteggio.scoperta} sezioni non hanno ancora fonti: la prima è la ${primaScoperta.numero} «${primaScoperta.titolo}».`
  }
  azioni.push(...perSezione, altro, pdf, { id: 'biblioteca', etichetta: 'Apri la biblioteca', vai: 'biblioteca' }, { id: 'copertura', etichetta: 'Mappa di copertura', vai: 'copertura' })
  return { testo, azioni, speciale }
}

// ---------------------------------------------------------------------------
// Luca Esposito, scrittore
// ---------------------------------------------------------------------------

export function sezioneDiLavoro(p: Progetto, capId: string | null, sezId: string | null): { cap: Capitolo; sez: Sezione } | null {
  const aperta = p.capitoli.find((c) => c.id === capId)?.sezioni.find((s) => s.id === sezId)
  if (aperta) return { cap: p.capitoli.find((c) => c.id === capId)!, sez: aperta }
  for (const c of p.capitoli) for (const s of c.sezioni) if (!s.testo.trim()) return { cap: c, sez: s }
  const c = p.capitoli[0]
  return c?.sezioni[0] ? { cap: c, sez: c.sezioni[0] } : null
}

function prossimaSezione(p: Progetto, sezId: string): { cap: Capitolo; sez: Sezione } | null {
  const tutte = p.capitoli.flatMap((c) => c.sezioni.map((s) => ({ cap: c, sez: s })))
  const i = tutte.findIndex((x) => x.sez.id === sezId)
  return tutte.slice(i + 1).find((x) => !x.sez.testo.trim()) ?? tutte[i + 1] ?? null
}

function turnoScrittore(p: Progetto, capId: string | null, sezId: string | null, proposta: boolean, scrive: boolean): Turno {
  const st = useStudio.getState
  if (!p.indiceApprovato) {
    return {
      testo: `Prima di scrivere fissiamo l'indice: è la base su cui lavoriamo tutti. Ha ${p.capitoli.length} capitoli e ${p.capitoli.reduce((n, c) => n + c.sezioni.length, 0)} sezioni. Se ti va bene così approvalo, altrimenti modificalo nella Panoramica.`,
      scheda: (
        <ol className="indice-breve">
          {p.capitoli.map((c) => (
            <li key={c.id}>{c.titolo}</li>
          ))}
        </ol>
      ),
      azioni: [
        { id: 'approva-indice', etichetta: "Approvo l'indice", principale: true, esegui: async () => (st().approvaIndice(), 'Perfetto, indice approvato. Da quale sezione cominciamo? Io ti propongo la prima.') },
        { id: 'modifica-indice', etichetta: 'Voglio modificarlo', vai: 'cruscotto' },
      ],
    }
  }
  const lavoro = sezioneDiLavoro(p, capId, sezId)
  if (!lavoro) return { testo: "L'indice è vuoto: aggiungi un capitolo dalla Panoramica.", azioni: [{ id: 'panoramica', etichetta: 'Apri la Panoramica', vai: 'cruscotto' }] }
  const { cap, sez } = lavoro
  const numero = `${p.capitoli.indexOf(cap) + 1}.${cap.sezioni.indexOf(sez) + 1}`
  const ppp = p.obiettivo.parolePerPagina
  const scegli = (
    <label className="campo-blocco scegli-sezione">
      <span className="etichetta">Sezione su cui lavoriamo</span>
      <select className="campo" value={`${cap.id}|${sez.id}`} onChange={(e) => {
        const [c, s] = e.target.value.split('|')
        useStudio.setState({ capitoloAperto: c, sezioneAperta: s })
      }}>
        {p.capitoli.map((c, i) => (
          <optgroup key={c.id} label={`${i + 1}. ${c.titolo}`}>
            {c.sezioni.map((s, j) => (
              <option key={s.id} value={`${c.id}|${s.id}`}>
                {i + 1}.{j + 1} {s.titolo}
                {s.testo.trim() ? ` · ${contaParoleTesto(s.testo)} parole` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
  const apriFoglio: Azione = { id: 'foglio', etichetta: 'Apri il foglio della sezione', esegui: async () => st().apriSezione(cap.id, sez.id) }
  const titolo = `la ${numero} «${sez.titolo}»`

  if (scrive) return { testo: `Sto scrivendo ${titolo}…`, azioni: [] }
  if (proposta) {
    return {
      testo: `Ecco la mia proposta per ${titolo}. Le citazioni sono colorate: verde se l'estratto c'è alla lettera nella fonte, rosso se no. Usala, oppure scartala e la rifaccio.`,
      scheda: <PannelloProposta sez={sez} />,
      azioni: [apriFoglio],
    }
  }
  if (!sez.fontiConfermate) {
    return {
      testo: `Lavoriamo su ${titolo}. Prima scegliamo le fonti da usare: spunta quelle giuste e approva. Se mancano, chiedi a Marco.`,
      scheda: (
        <>
          {scegli}
          <PassoFonti cap={cap} sez={sez} />
        </>
      ),
      azioni: [{ id: 'chiedi-marco', etichetta: 'Chiedi fonti a Marco', esegui: async () => st().scegliAgente('bibliotecario') }],
    }
  }
  if (!sez.scalettaApprovata) {
    return {
      testo: `Per ${titolo} ora serve la scaletta: i punti in ordine, con le fonti da usare. La propongo io e tu la correggi o la approvi.`,
      scheda: (
        <>
          {scegli}
          <PassoScaletta cap={cap} sez={sez} />
        </>
      ),
      azioni: [],
    }
  }
  if (!sez.testo.trim()) {
    return {
      testo: `Fonti e scaletta di ${titolo} sono pronte. Scrivo la bozza? Userò il lessico del corso e citerò solo le fonti approvate, con estratti verificati.`,
      scheda: scegli,
      azioni: [
        {
          id: 'bozza',
          etichetta: 'Scrivi la bozza',
          principale: true,
          lavoro: 'scrivo la bozza…',
          esegui: async () => {
            await proponiBozza(cap.id, sez.id)
            return useScrittore.getState().proposte[sez.id] ? 'Ho finito la bozza: la vedi qui sotto.' : undefined
          },
        },
        apriFoglio,
      ],
    }
  }
  const parole = contaParoleTesto(sez.testo)
  const prossima = prossimaSezione(p, sez.id)
  return {
    testo: `${titolo.charAt(0).toUpperCase()}${titolo.slice(1)} ha ${parole} parole, circa ${pagineDi(parole, ppp)} pagine. Vuoi lavorarci nel foglio, che controlli le citazioni, o passiamo alla prossima?`,
    scheda: scegli,
    azioni: [
      apriFoglio,
      ...(prossima
        ? [
            {
              id: 'prossima',
              etichetta: `Passiamo alla ${p.capitoli.indexOf(prossima.cap) + 1}.${prossima.cap.sezioni.indexOf(prossima.sez) + 1}`,
              principale: true,
              esegui: async () => {
                useStudio.setState({ capitoloAperto: prossima.cap.id, sezioneAperta: prossima.sez.id })
                return `D'accordo, passiamo a «${prossima.sez.titolo}».`
              },
            } satisfies Azione,
          ]
        : []),
      { id: 'verifica', etichetta: 'Controlla le citazioni', lavoro: 'controllo le citazioni…', esegui: async () => verificaCitazioniSezione(cap.id, sez.id) },
    ],
  }
}

// ---------------------------------------------------------------------------
// Elena Conti, revisora
// ---------------------------------------------------------------------------

function turnoRevisora(p: Progetto): Turno {
  const aperte = p.osservazioni.filter((o) => o.stato === 'aperta')
  const parole = p.capitoli.reduce((n, c) => n + c.sezioni.reduce((m, s) => m + contaParoleTesto(s.testo), 0), 0)
  const speciale: Turno['speciale'] = {
    placeholder: "Incolla qui un'osservazione del relatore",
    invio: 'Aggiungi',
    avvio: false,
    lavoro: "leggo l'osservazione…",
    invia: async (testo) => {
      const id = useStudio.getState().aggiungiOsservazione(testo, null)
      if (parole === 0) return 'Ho annotato l\'osservazione. Quando ci sarà del testo ti proporrò le modifiche.'
      const r = await proponiPerOsservazione(id)
      const o = useStudio.getState().progetto.osservazioni.find((x) => x.id === id)
      return `Ho annotato l'osservazione e preparato ${o?.proposte.length ?? 0} proposte di modifica${r.scartate ? ` (ne ho scartate ${r.scartate} che citavano passi inesistenti)` : ''}. Le vedi qui sotto: accetta quelle che ti convincono.`
    },
  }
  const osservazione: Azione = { id: 'osservazione', etichetta: "Incolla un'osservazione del relatore", speciale: true }
  const controllo: Azione = {
    id: 'controllo',
    etichetta: 'Controlla tutta la tesi',
    principale: parole > 0 && aperte.length === 0,
    lavoro: 'controllo la tesi…',
    esegui: async () => {
      controlloSoloCodice()
      const c = useStudio.getState().progetto.controllo
      const n = c?.rilievi.length ?? 0
      return n
        ? `Ho trovato ${n} punti da guardare (citazioni, lessico, frasi da IA, ripetizioni). Li trovi nella pagina Revisione, sezione per sezione. Se vuoi faccio anche un controllo approfondito.`
        : 'Non ho trovato problemi nel controllo in codice. Se vuoi faccio anche un controllo approfondito.'
    },
  }
  const approfondito: Azione = {
    id: 'approfondito',
    etichetta: 'Controllo approfondito',
    lavoro: 'leggo tutta la tesi…',
    esegui: async () => {
      await controlloConRevisore()
      const c = useStudio.getState().progetto.controllo
      return `Ho letto tutta la tesi: ${c?.rilievi.length ?? 0} rilievi${c?.scartati ? ` (${c.scartati} scartati perché citavano passi che non ci sono)` : ''}. Li trovi nella pagina Revisione.`
    },
  }
  const word: Azione = {
    id: 'word',
    etichetta: 'Prepara il file Word',
    lavoro: 'preparo il file Word…',
    esegui: async () => {
      const nome = await esportaWord({ capitoloId: null, conBibliografia: true, conFrontespizio: true })
      return `Ecco il file «${nome}»: lo trovi fra i download. Times 12, interlinea 1,5, ${p.stileCitazione === 'note' ? 'note a piè di pagina' : 'citazioni autore-anno'} e bibliografia in fondo.`
    },
  }
  if (aperte.length) {
    return {
      testo: `Ci sono ${aperte.length} ${aperte.length === 1 ? 'osservazione' : 'osservazioni'} del relatore ancora aperte. Partiamo da questa:`,
      scheda: <CartaOsservazione o={aperte[0]} />,
      azioni: [osservazione, controllo, { id: 'revisione', etichetta: 'Apri la revisione', vai: 'revisione' }],
      speciale,
    }
  }
  if (parole === 0) {
    return {
      testo: 'Quando ci sarà del testo controllerò citazioni, coerenza fra capitoli e lessico del corso. Intanto, se il relatore ti ha già dato indicazioni, incollamele qui.',
      azioni: [osservazione],
      speciale,
    }
  }
  return {
    testo: `La tesi ha ${parole.toLocaleString('it-IT')} parole, circa ${pagineDi(parole, p.obiettivo.parolePerPagina)} pagine su ${p.obiettivo.pagineMin}–${p.obiettivo.pagineMax}. Posso controllarla tutta, gratis e in pochi secondi, oppure prepararti il file Word.`,
    azioni: [controllo, approfondito, osservazione, word, { id: 'revisione', etichetta: 'Apri la revisione', vai: 'revisione' }],
    speciale,
  }
}

/** Il turno attuale della persona scelta. */
export function useTurno(k: AgentKey): Turno {
  const p = useStudio((s) => s.progetto)
  const capId = useStudio((s) => s.capitoloAperto)
  const sezId = useStudio((s) => s.sezioneAperta)
  const ricerca = useRicerca((s) => s.inCorso)
  const proposte = useScrittore((s) => s.proposte)
  const scrive = useScrittore((s) => s.inCorso !== null)
  switch (k) {
    case 'lettore':
      return turnoLettrice(p)
    case 'bibliotecario':
      return turnoBibliotecario(p, ricerca)
    case 'scrittore': {
      const lavoro = sezioneDiLavoro(p, capId, sezId)
      return turnoScrittore(p, capId, sezId, Boolean(lavoro && proposte[lavoro.sez.id]), scrive)
    }
    case 'revisore':
      return turnoRevisora(p)
  }
}

