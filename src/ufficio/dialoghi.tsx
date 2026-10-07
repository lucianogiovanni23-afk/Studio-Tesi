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
// Lettrice del corso
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
          r.letti ? `Fatto, grazie! ${r.letti === 1 ? 'Ho letto una lezione' : `Ho letto ${r.letti} lezioni`}.` : 'Non sono riuscita ad aprire nessun file.',
          r.errori ? `${r.errori} non riesco ad aprirle: le vedi nella pagina Corso, con il perché.` : '',
          scartati.length ? `Questi non li ho presi: ${scartati.join(', ')}. Mi servono PDF o file di testo.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      },
    },
  }
  const apri: Azione = { id: 'apri-corso', etichetta: 'Fammi vedere le idee del corso', vai: 'corso' }

  if (inLettura.length) {
    const f = inLettura[0]
    return { testo: `Sto leggendo «${f.name}»${f.pagine ? `: pagina ${f.paginaCorrente ?? 0} di ${f.pagine}` : ''}. Un attimo e ti dico.`, azioni: [] }
  }
  if (pronti === 0) {
    return {
      testo: `Mandami le lezioni del corso, in PDF o in testo (anche 25 insieme). Le leggo io e mi segno i concetti e le parole che usa il prof, così la tesi parla come il corso.${daRicaricare ? ` Ci sono ${daRicaricare} file da ricaricare.` : ''}`,
      azioni: [carica],
    }
  }
  const generaAzione = (aggiorna: boolean): Azione => ({
    id: 'quadro',
    etichetta: aggiorna ? 'Aggiorna le idee del corso' : 'Trova le idee del corso',
    principale: true,
    lavoro: 'riassumo il corso…',
    esegui: async () => {
      await generaQuadro()
      const q = useStudio.getState().progetto.quadro
      if (!q) return
      const verdi = q.concetti.filter((c) => c.esito === 'verificato').length
      return `Fatto! Ho trovato ${q.concetti.length} concetti, e per ${verdi} ho ritrovato la frase precisa nelle lezioni.${q.lacune.length ? ` Il corso invece non parla di: ${q.lacune.slice(0, 3).join('; ')}. Meglio non approfondirli nella tesi.` : ''} Adesso mi segno le parole del corso del corso?`
    },
  })
  if (!p.quadro || quadroObsoleto(p)) {
    return {
      testo: p.quadro
        ? `Hai cambiato le lezioni da quando le ho studiate (ora sono ${pronti}): meglio che le riguardi.`
        : `Ho letto ${pronti} ${pronti === 1 ? 'file' : 'file'}. Adesso riassumo il corso: per ogni concetto ti metto una frase presa dalle lezioni.`,
      azioni: [generaAzione(Boolean(p.quadro)), carica],
    }
  }
  const lessicoAzione: Azione = {
    id: 'lessico',
    etichetta: lessico ? 'Aggiorna le parole del corso' : 'Trova le parole del corso',
    principale: lessico === 0,
    lavoro: 'cerco le parole del corso…',
    esegui: async () => {
      const r = await ricavaLessico()
      return `Fatto: ${r.nuove} parole nuove e ${r.aggiornate} aggiornate nel glossario${r.scartati.length ? `; ne ho tolte ${r.scartati.length} perché nelle lezioni non ci sono` : ''}. Lo scrittore userà queste, e il revisore ti avvisa se ne scrivi una diversa.`
    },
  }
  if (lessico === 0) {
    return {
      testo: `Le idee principali sono pronte: ${p.quadro.concetti.length} concetti. Adesso mi segno le parole del corso, cioè i termini tecnici scritti come li scrive il corso. Lo scrittore dovrà usare proprio quelli.`,
      azioni: [lessicoAzione, apri, carica],
    }
  }
  return {
    testo: `Il corso è a posto: ${pronti} lezioni, ${p.quadro.concetti.length} concetti e ${lessico} parole del corso. Se aggiungi lezioni aggiorno tutto io. E se vuoi sapere cosa dice il corso su un argomento, chiedimelo pure.`,
    azioni: [apri, carica, lessicoAzione],
  }
}

// ---------------------------------------------------------------------------
// Bibliotecario
// ---------------------------------------------------------------------------

async function cerca(domanda: string): Promise<string> {
  const gratuita = modalitaGratuita()
  const prima = useStudio.getState().progetto.inAttesa.length
  await avviaRicerca(domanda, { cataloghi: true, istituzionali: !gratuita, web: !gratuita })
  const errore = useRicerca.getState().errore
  if (errore) throw new Error(errore)
  const nuovi = useStudio.getState().progetto.inAttesa.length - prima
  return nuovi > 0
    ? `Ho trovato ${nuovi} risultati nei cataloghi, con dati veri. Te li metto qui sotto: scegli tu quali tenere.`
    : 'Con questa ricerca non ho trovato niente di nuovo. Prova a dirmelo con altre parole, o più in generale.'
}

function turnoBibliotecario(p: Progetto, ricercaInCorso: boolean): Turno {
  const gratuita = modalitaGratuita()
  const cop = copertura(p)
  const primaScoperta = cop.sezioni.find((s) => s.livello === 'scoperta') ?? cop.sezioni.find((s) => s.livello === 'debole')
  const speciale: Turno['speciale'] = {
    placeholder: 'Scrivi cosa cerco: per esempio i costi dei frantoi negli anni di poca raccolta',
    invio: 'Cerca',
    avvio: p.fonti.length === 0,
    lavoro: 'cerco gli articoli…',
    invia: (testo) => cerca(testo),
  }
  const pdf: Azione = {
    id: 'pdf',
    etichetta: 'Aggiungi i tuoi PDF',
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
  const altro: Azione = { id: 'altro', etichetta: 'Cerca altro', speciale: true }
  const perSezione = primaScoperta
    ? [
        {
          id: 'per-sezione',
          etichetta: `Cerca articoli per la ${primaScoperta.numero}`,
          principale: p.fonti.length > 0,
          lavoro: 'cerco gli articoli…',
          esegui: () => cerca(domandaPerSezione(primaScoperta)),
        } satisfies Azione,
      ]
    : []

  if (ricercaInCorso) {
    return {
      testo: 'Sto cercando gli articoli e scelgo i migliori…',
      azioni: [{ id: 'ferma', etichetta: 'Ferma la ricerca', esegui: async () => annullaRicerca() }],
    }
  }
  if (p.inAttesa.length > 0) {
    const consigliati = p.inAttesa.filter((c) => c.consiglio?.decisione === 'tenere').length
    return {
      testo: `Ho ${p.inAttesa.length} risultati da guardare${consigliati ? `; ${consigliati} te li consiglio io` : ''}. Scegli tu quali tenere: per ognuno ti ho scritto perché.`,
      scheda: <InAttesa />,
      azioni: [altro, { id: 'apri-ricerca', etichetta: 'Vai a Nuove fonti', vai: 'ricerca' }],
      speciale,
    }
  }
  if (p.fonti.length === 0) {
    return {
      testo: `Dimmi cosa cerco e guardo nei cataloghi delle università${gratuita ? ' (sono gratis)' : ''}: scrivilo qui sotto. Oppure parto da un paragrafo dell'indice, o mi passi tu dei PDF.`,
      azioni: [...perSezione, pdf],
      speciale,
    }
  }
  const senza = fontiSenzaScheda(p.fonti)
  const testoCompleto = p.fonti.filter(puòAvereTestoCompleto).length
  const azioni: Azione[] = []
  let testo = `In biblioteca hai ${p.fonti.length} fonti.`
  if (senza.length) {
    const gruppi = gruppiSchede(senza).length
    testo += ` ${senza.length} non hanno ancora il riassunto: li faccio io${gratuita ? ` (ci vogliono ${gruppi} ${gruppi === 1 ? 'passaggio' : 'passaggi'} su Claude.ai)` : ''}?`
    azioni.push({
      id: 'schede',
      etichetta: `Riassumi le ${senza.length} fonti`,
      principale: true,
      lavoro: 'leggo e riassumo…',
      esegui: async () => {
        const r = await preparaSchedeInBlocco(
          senza.map((f) => f.id),
          (g, tot) => segnaAvanzamento('bibliotecario', `riassunti: gruppo ${g} di ${tot}…`),
        )
        return `Ho fatto ${r.fatte} riassunti${r.frasiScartate ? `; ho tolto ${r.frasiScartate} frasi chiave perché nel testo non le ritrovavo uguali` : ''}. Li trovi in Biblioteca.`
      },
    })
  } else if (testoCompleto) {
    testo += ` Per ${testoCompleto} forse c'è il testo intero gratis: lo cerco? Con il testo intero nelle citazioni metto anche la pagina.`
    azioni.push({
      id: 'testi',
      etichetta: 'Cerca i testi interi',
      principale: true,
      lavoro: 'scarico i testi…',
      esegui: async () => {
        const r = await recuperaTuttiNelBrowser((f, tot) => segnaAvanzamento('bibliotecario', `testi: ${f} di ${tot}…`))
        return `Ho scaricato ${r.riusciti} testi interi.${r.daApi.length ? ` ${r.daApi.length} sono gratis ma il sito non me li fa scaricare: aprili dalla Biblioteca, scarica il PDF e caricalo tu.` : ''}`
      },
    })
  }
  if (primaScoperta) {
    testo += ` ${cop.conteggio.scoperta} paragrafi non hanno ancora fonti: il primo è il ${primaScoperta.numero} «${primaScoperta.titolo}».`
  }
  azioni.push(...perSezione, altro, pdf, { id: 'biblioteca', etichetta: 'Apri la biblioteca', vai: 'biblioteca' }, { id: 'copertura', etichetta: 'Vedi cosa manca', vai: 'copertura' })
  return { testo, azioni, speciale }
}

// ---------------------------------------------------------------------------
// Scrittore
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
      testo: `Prima di scrivere sistemiamo l'indice: è la base per tutti noi. Ora ha ${p.capitoli.length} capitoli e ${p.capitoli.reduce((n, c) => n + c.sezioni.length, 0)} paragrafi. Se ti va bene approvalo, se no cambialo nella Panoramica.`,
      scheda: (
        <ol className="indice-breve">
          {p.capitoli.map((c) => (
            <li key={c.id}>{c.titolo}</li>
          ))}
        </ol>
      ),
      azioni: [
        { id: 'approva-indice', etichetta: 'Va bene così', principale: true, esegui: async () => (st().approvaIndice(), "Perfetto, l'indice è approvato. Da dove partiamo? Io direi dal primo paragrafo.") },
        { id: 'modifica-indice', etichetta: 'Voglio cambiarlo', vai: 'cruscotto' },
      ],
    }
  }
  const lavoro = sezioneDiLavoro(p, capId, sezId)
  if (!lavoro) return { testo: "L'indice è ancora vuoto: aggiungi un capitolo dalla Panoramica.", azioni: [{ id: 'panoramica', etichetta: 'Apri la Panoramica', vai: 'cruscotto' }] }
  const { cap, sez } = lavoro
  const numero = `${p.capitoli.indexOf(cap) + 1}.${cap.sezioni.indexOf(sez) + 1}`
  const ppp = p.obiettivo.parolePerPagina
  const scegli = (
    <label className="campo-blocco scegli-sezione">
      <span className="etichetta">Su che paragrafo lavoriamo</span>
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
  const apriFoglio: Azione = { id: 'foglio', etichetta: 'Apri il foglio', esegui: async () => st().apriSezione(cap.id, sez.id) }
  const titolo = `la ${numero} «${sez.titolo}»`

  if (scrive) return { testo: `Sto scrivendo ${titolo}…`, azioni: [] }
  if (proposta) {
    return {
      testo: `Ecco cosa ti propongo per ${titolo}. Le citazioni sono colorate: verdi se la frase c'è uguale nella fonte, rosse se no. Se ti piace usala, se no scartala e la rifaccio.`,
      scheda: <PannelloProposta sez={sez} />,
      azioni: [apriFoglio],
    }
  }
  if (!sez.fontiConfermate) {
    return {
      testo: `Lavoriamo su ${titolo}. Prima scegliamo le fonti: spunta quelle giuste e dai l'ok. Se ne mancano, chiedile al bibliotecario.`,
      scheda: (
        <>
          {scegli}
          <PassoFonti cap={cap} sez={sez} />
        </>
      ),
      azioni: [{ id: 'chiedi-marco', etichetta: 'Chiedi al bibliotecario', esegui: async () => st().scegliAgente('bibliotecario') }],
    }
  }
  if (!sez.scalettaApprovata) {
    return {
      testo: `Per ${titolo} adesso serve la scaletta: i punti in ordine, con le fonti per ognuno. Te la propongo io, poi tu la cambi o le dai l'ok.`,
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
      testo: `Fonti e scaletta di ${titolo} sono pronte. Scrivo la bozza? Uso le parole del corso e cito solo le fonti che hai scelto, con frasi controllate.`,
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
    testo: `${titolo.charAt(0).toUpperCase()}${titolo.slice(1)} ha ${parole} parole, più o meno ${pagineDi(parole, ppp)} pagine. Vuoi lavorarci nel foglio, controllo le citazioni o passiamo alla prossima?`,
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
                return `Ok, passiamo a «${prossima.sez.titolo}».`
              },
            } satisfies Azione,
          ]
        : []),
      { id: 'verifica', etichetta: 'Controlla le citazioni', lavoro: 'controllo le citazioni…', esegui: async () => verificaCitazioniSezione(cap.id, sez.id) },
    ],
  }
}

// ---------------------------------------------------------------------------
// Revisore
// ---------------------------------------------------------------------------

function turnoRevisore(p: Progetto): Turno {
  const aperte = p.osservazioni.filter((o) => o.stato === 'aperta')
  const parole = p.capitoli.reduce((n, c) => n + c.sezioni.reduce((m, s) => m + contaParoleTesto(s.testo), 0), 0)
  const speciale: Turno['speciale'] = {
    placeholder: 'Incolla qui cosa ti ha detto il relatore',
    invio: 'Aggiungi',
    avvio: false,
    lavoro: 'leggo la nota…',
    invia: async (testo) => {
      const id = useStudio.getState().aggiungiOsservazione(testo, null)
      if (parole === 0) return 'Me lo sono segnato. Quando avrai scritto qualcosa ti dico cosa cambiare.'
      const r = await proponiPerOsservazione(id)
      const o = useStudio.getState().progetto.osservazioni.find((x) => x.id === id)
      return `Me lo sono segnato e ti propongo ${o?.proposte.length ?? 0} modifiche${r.scartate ? ` (ne ho tolte ${r.scartate} perché citavano frasi che non esistono)` : ''}. Le vedi qui sotto: accetta quelle che ti piacciono.`
    },
  }
  const osservazione: Azione = { id: 'osservazione', etichetta: 'Incolla la nota del relatore', speciale: true }
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
        ? `Ho trovato ${n} cose da guardare (citazioni, parole del corso, frasi che sembrano scritte da un'IA, ripetizioni). Le trovi in Revisione, paragrafo per paragrafo. Se vuoi faccio anche un controllo più a fondo.`
        : 'Il controllo veloce non ha trovato problemi. Se vuoi faccio anche un controllo più a fondo.'
    },
  }
  const approfondito: Azione = {
    id: 'approfondito',
    etichetta: 'Controllo più a fondo',
    lavoro: 'leggo tutta la tesi…',
    esegui: async () => {
      await controlloConRevisore()
      const c = useStudio.getState().progetto.controllo
      return `Ho letto tutta la tesi: ${c?.rilievi.length ?? 0} cose da sistemare${c?.scartati ? ` (${c.scartati} le ho tolte perché citavano frasi che non ci sono)` : ''}. Le trovi in Revisione.`
    },
  }
  const word: Azione = {
    id: 'word',
    etichetta: 'Prepara il file Word',
    lavoro: 'preparo il file Word…',
    esegui: async () => {
      const nome = await esportaWord({ capitoloId: null, conBibliografia: true, conFrontespizio: true })
      return `Ecco il file «${nome}»: lo trovi nei download. Times 12, interlinea 1,5, ${p.stileCitazione === 'note' ? 'note a piè di pagina' : 'citazioni autore-anno'} e bibliografia in fondo.`
    },
  }
  if (aperte.length) {
    return {
      testo: `Il relatore ti ha lasciato ${aperte.length === 1 ? 'una nota' : `${aperte.length} note`} ancora da sistemare. Partiamo da questo:`,
      scheda: <CartaOsservazione o={aperte[0]} />,
      azioni: [osservazione, controllo, { id: 'revisione', etichetta: 'Apri la revisione', vai: 'revisione' }],
      speciale,
    }
  }
  if (parole === 0) {
    return {
      testo: 'Quando avrai scritto qualcosa controllo le citazioni, che i capitoli tornino tra loro e le parole del corso. Intanto, se il relatore ti ha già detto qualcosa, incollalo qui.',
      azioni: [osservazione],
      speciale,
    }
  }
  return {
    testo: `La tesi ha ${parole.toLocaleString('it-IT')} parole, più o meno ${pagineDi(parole, p.obiettivo.parolePerPagina)} pagine (l'obiettivo è ${p.obiettivo.pagineMin}–${p.obiettivo.pagineMax}). Posso controllarla tutta in pochi secondi, gratis, o prepararti il file Word.`,
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
      return turnoRevisore(p)
  }
}

