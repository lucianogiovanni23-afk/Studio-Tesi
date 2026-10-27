import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import '../styles/impostazioni.css'
import { ETICHETTE_SLOT } from '../agents/agenti'
import { MODELLI_DISPONIBILI } from '../agents/api'
import { eseguiDiagnosi, type EsitoDiagnosi } from '../agents/diagnostica'
import { creaCopia, elencoCopie, ripristinaCopia, type CopiaSicurezza } from '../io/copie'
import { cosaSiCancella, ripristinaTenendoIlCorso } from '../io/ripristino'
import { AvvisoChiave } from '../components/AvvisoChiave'
import { Conferma } from '../components/Conferma'
import { Costi } from '../components/Costi'
import { PannelloSincronizzazione } from '../components/Sincronizzazione'
import { useSync } from '../io/sincronizzazione'
import { MODELLI_PREDEFINITI } from '../domain/progettoIniziale'
import { apriProgetto, leggiFileProgetto, salvaProgetto, type AnteprimaFile } from '../io/fileProgetto'
import { useModoUso } from '../hooks/useModoUso'
import { useStudio } from '../store'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'
import { impostaSuoni, suoniAccesi, suonoRisposta } from '../ui/suoni'
import type { Frontespizio, ModelSlot, ModoUso, StileCitazione, Tema } from '../types'
import { apriMenuGrafica, riassuntoGrafica, useGraficaStore } from '../grafica/grafica'
import { frontespizioDi, giornoLeggibile, impostaFrontespizio, impostaObiettivo } from '../domain/ritmo'

/** Riquadro delle impostazioni: icona, titolo, una riga sotto e la "i" per le spiegazioni lunghe. */
function Carta({
  icona,
  titolo,
  sotto,
  info,
  azioni,
  classe = '',
  children,
}: {
  icona: string
  titolo: ReactNode
  sotto?: ReactNode
  info?: ReactNode
  azioni?: ReactNode
  classe?: string
  children: ReactNode
}) {
  return (
    <section className={`pannello imp-carta ${classe}`}>
      <div className="imp-testa">
        <span className="imp-testa-icona" aria-hidden>
          <Icona nome={icona} dimensione={20} />
        </span>
        <div className="imp-testa-titoli">
          <div className="imp-testa-riga">
            <h2>{titolo}</h2>
            {info && <Info>{info}</Info>}
          </div>
          {sotto && <p className="imp-testa-sotto">{sotto}</p>}
        </div>
        {azioni && <div className="imp-testa-azioni">{azioni}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * Per usare la stessa chiave su un altro dispositivo: la si mostra qui, la si copia
 * o la si manda con Condividi, e la si incolla di là. Non passa mai dalla
 * sincronizzazione, così non finisce su GitHub. Dopo un minuto torna nascosta.
 */
function PortaChiave({ chiave }: { chiave: string }) {
  const [visibile, setVisibile] = useState(false)
  const [esito, setEsito] = useState('')
  useEffect(() => {
    if (!visibile) return
    const t = window.setTimeout(() => setVisibile(false), 60_000)
    return () => window.clearTimeout(t)
  }, [visibile])
  const puoCondividere = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copia = async () => {
    try {
      await navigator.clipboard.writeText(chiave)
      setEsito('Copiata. Sull\'altro dispositivo vai qui in Impostazioni e incollala.')
    } catch {
      setEsito('Non riesco a copiarla da solo: tieni premuto sulla chiave e scegli Copia.')
    }
  }
  const condividi = async () => {
    try {
      await navigator.share({ text: chiave })
      setEsito('Inviata. Sull\'altro dispositivo incollala qui in Impostazioni.')
    } catch {
      // annullato da chi usa l'app: niente da dire
    }
  }

  return (
    <div className="imp-porta-chiave">
      <p className="nota imp-spiega">
        Vuoi la stessa chiave sull'altro dispositivo (per esempio dal tablet al computer)? Mostrala, copiala o mandala con
        Condividi, e incollala di là. Non la passo con la sincronizzazione, così non finisce su GitHub.
      </p>
      {visibile ? (
        <>
          <input className="campo imp-chiave-visibile" readOnly value={chiave} aria-label="La tua chiave API" onFocus={(e) => e.target.select()} />
          <div className="riga-editor">
            <button type="button" className="bottone bottone-primario" onClick={copia}>
              <Icona nome="copia" dimensione={16} />
              Copia la chiave
            </button>
            {puoCondividere && (
              <button type="button" className="bottone bottone-secondario" onClick={condividi}>
                <Icona nome="link" dimensione={16} />
                Condividi
              </button>
            )}
            <button type="button" className="bottone bottone-vuoto" onClick={() => setVisibile(false)}>
              Nascondi
            </button>
          </div>
          <p className="nota imp-piccola">Non mandarla a nessun altro: chi ce l'ha può spendere il tuo credito. Tra un minuto si nasconde da sola.</p>
        </>
      ) : (
        <button
          type="button"
          className="bottone bottone-secondario"
          onClick={() => {
            setEsito('')
            setVisibile(true)
          }}
        >
          <Icona nome="occhio" dimensione={16} />
          Mostra la chiave per copiarla
        </button>
      )}
      {esito && (
        <p className="nota nota-ok" role="status">
          {esito}
        </p>
      )}
    </div>
  )
}

function Chiave() {
  const apiKey = useStudio((s) => s.apiKey)
  const setApiKey = useStudio((s) => s.setApiKey)
  const [bozza, setBozza] = useState('')
  const [mostra, setMostra] = useState(false)

  return (
    <Carta
      icona="chiave"
      titolo="Come lavorano gli agenti"
      sotto={apiKey ? 'Con la tua chiave API: lavorano da soli.' : 'Versione gratis: copi e incolli da claude.ai.'}
      azioni={
        <span className={`imp-stato ${apiKey ? 'imp-stato-ok' : ''}`}>
          <span className="imp-stato-pallino" aria-hidden />
          {apiKey ? 'Chiave attiva' : 'Gratis'}
        </span>
      }
    >
      {apiKey ? (
        <p className="nota imp-spiega">
          <strong>Con la chiave API</strong>: gli agenti lavorano da soli e paghi solo quello che usi. Se togli la chiave torni
          alla versione gratis.
        </p>
      ) : (
        <div className="banda banda-info imp-gratis">
          <p>
            <strong>Stai usando la versione gratis.</strong> Ogni comando ti prepara un messaggio già pronto: lo copi su{' '}
            <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
              claude.ai
            </a>{' '}
            (basta un account gratis), incolli qui la risposta e l'app la controlla come sempre (citazioni, pezzi di fonte, parole del corso).
            <Info etichetta="Cosa non funziona nella versione gratis">
              Funziona tutto tranne la ricerca su internet e sui siti ufficiali (puoi sempre cercare negli archivi universitari e
              caricare i tuoi PDF). Claude.ai gratis ha un limite di messaggi al giorno: se lo finisci, riprendi il giorno dopo.
            </Info>
          </p>
        </div>
      )}
      <div className="imp-chiave">
        <h3 className="imp-sottotitolo">
          <Icona nome="chiave" dimensione={16} />
          Chiave API (non obbligatoria)
        </h3>
        <AvvisoChiave />
        {apiKey ? (
          <div className="riga-editor imp-chiave-salvata">
            <span className="nota nota-ok">
              <Icona nome="spunta" dimensione={16} /> Chiave salvata su questo browser (finisce con …{apiKey.slice(-4)}).
            </span>
            <Conferma
              classe="bottone bottone-vuoto"
              etichetta="Togli la chiave"
              domanda="Tolgo la chiave da questo browser?"
              conferma="Togli"
              pericolosa
              onConferma={() => setApiKey('')}
            />
          </div>
        ) : null}
        {apiKey ? (
          <PortaChiave chiave={apiKey} />
        ) : (
          <form
            className="imp-chiave-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (!bozza.trim()) return
              setApiKey(bozza)
              setBozza('')
            }}
          >
            <div className="imp-campo-con-bottone">
              <input
                className="campo"
                type={mostra ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder="Incolla qui la chiave"
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                aria-label="Chiave API Anthropic"
              />
              <button type="button" className="bottone bottone-secondario" onClick={() => setMostra((m) => !m)}>
                <Icona nome="occhio" dimensione={16} />
                {mostra ? 'Nascondi' : 'Mostra'}
              </button>
            </div>
            <button type="submit" className="bottone bottone-primario">
              <Icona nome="spunta" dimensione={16} />
              Salva la chiave
            </button>
          </form>
        )}
      </div>
    </Carta>
  )
}

function FileProgetto({ onAnteprima }: { onAnteprima: () => void }) {
  const salvatoIl = useStudio((s) => s.progetto.salvatoSuFileIl)
  const input = useRef<HTMLInputElement>(null)
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)
  const [anteprima, setAnteprima] = useState<AnteprimaFile | null>(null)

  return (
    <Carta
      icona="file"
      titolo="Salva e apri il progetto"
      sotto="Un file con tutto il tuo lavoro, da tenere su iCloud o Drive."
      info={
        <>
          Il tuo lavoro è salvato in questo browser. Con la sincronizzazione si aggiorna da solo sugli altri dispositivi. Se no,
          salvalo in un file, mettilo su iCloud o Drive e aprilo da qui sull'altro dispositivo. Nel file c'è tutto (indice, testi
          e versioni, fonti, glossario, note del relatore, costi, testo dei PDF) tranne la chiave API.
        </>
      }
    >
      <div className="imp-azioni">
        <button
          type="button"
          className="bottone bottone-primario"
          onClick={() => {
            try {
              const nome = salvaProgetto()
              setMessaggio({ tono: 'ok', testo: `Salvato come "${nome}" nei Download.` })
            } catch (err) {
              setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Non sono riuscito a salvare.' })
            }
          }}
        >
          <Icona nome="scarica" dimensione={16} />
          Salva progetto
        </button>
        <button type="button" className="bottone bottone-secondario" onClick={() => input.current?.click()}>
          <Icona nome="carica" dimensione={16} />
          Apri progetto…
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setMessaggio(null)
            try {
              setAnteprima(await leggiFileProgetto(file))
              onAnteprima()
            } catch (err) {
              setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Non riesco a leggere questo file.' })
            }
          }}
        />
      </div>
      {salvatoIl && (
        <p className="nota imp-piccola">
          <Icona nome="orologio" dimensione={14} /> Ultimo salvataggio su file: {new Date(salvatoIl).toLocaleString('it-IT')}.
        </p>
      )}

      {anteprima && (
        <div className="banda banda-attesa imp-anteprima">
          <p>
            <strong>{anteprima.titolo}</strong>
            <br />
            salvato il {new Date(anteprima.salvatoIl).toLocaleString('it-IT')} · {anteprima.capitoli} capitoli ·{' '}
            {anteprima.parole} parole · {anteprima.fonti} fonti · {anteprima.fileCorso} file del corso
          </p>
          <p>Se lo apri, prende il posto del lavoro che hai ora in questo browser. Se ti serve, salvalo prima.</p>
          <div className="riga-editor">
            <button
              type="button"
              className="bottone bottone-pericolo"
              onClick={async () => {
                try {
                  await apriProgetto(anteprima)
                  setMessaggio({ tono: 'ok', testo: 'Progetto aperto.' })
                } catch (err) {
                  setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Non sono riuscito ad aprirlo.' })
                }
                setAnteprima(null)
              }}
            >
              Apri e sostituisci
            </button>
            <button type="button" className="bottone bottone-vuoto" onClick={() => setAnteprima(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}
      {messaggio && (
        <p className={messaggio.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'} role="status">
          {messaggio.testo}
        </p>
      )}
    </Carta>
  )
}

const ESEMPIO_STILE: Record<StileCitazione, string> = {
  'autore-anno': 'Nel testo: (Rossi, 2021). Bibliografia in ordine alfabetico.',
  note: 'Nel testo: un numerino in alto. Il riferimento completo va in nota a piè di pagina.',
}

function TitoloDomanda() {
  const titolo = useStudio((s) => s.progetto.titolo)
  const domanda = useStudio((s) => s.progetto.domanda)
  const setTitolo = useStudio((s) => s.setTitolo)
  const setDomanda = useStudio((s) => s.setDomanda)
  return (
    <Carta icona="matita" titolo="Titolo e domanda" sotto="Gli agenti li leggono prima di ogni lavoro.">
      <label className="campo-blocco">
        <span className="etichetta">Titolo</span>
        <textarea className="campo campo-titolo" rows={2} value={titolo} onChange={(e) => setTitolo(e.target.value)} />
      </label>
      <label className="campo-blocco">
        <span className="etichetta">Domanda di ricerca</span>
        <textarea className="campo" rows={4} value={domanda} onChange={(e) => setDomanda(e.target.value)} />
      </label>
    </Carta>
  )
}

function Lunghezza() {
  const obiettivo = useStudio((s) => s.progetto.obiettivo)
  const setObiettivo = useStudio((s) => s.setObiettivo)
  const numero = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || min)))
  const mille = (n: number) => n.toLocaleString('it-IT')
  const parole = obiettivo.misura === 'parole'
  const ppp = obiettivo.parolePerPagina
  // In parole si scrive il numero di parole; dentro resta sempre il numero di pagine.
  const daParole = (v: string) => Math.round(numero(v, 10 * ppp, 300 * ppp) / ppp)

  return (
    <Carta
      icona="grafico"
      titolo="Obiettivo e consegna"
      sotto="Quanto scrivere e per quando: in Panoramica vedi il ritmo."
      info="300 parole sono circa una pagina Word (Times 12, interlinea 1,5). Se il relatore vuole un altro formato, cambia il numero. Con la data di consegna la Panoramica ti dice quanto scrivere ogni giorno e se sei in anticipo o in ritardo."
    >
      <div className="imp-obiettivo">
        <span className="imp-obiettivo-numero">
          {parole
            ? `${mille(obiettivo.pagineMin * ppp)}–${mille(obiettivo.pagineMax * ppp)}`
            : `${obiettivo.pagineMin}–${obiettivo.pagineMax}`}
        </span>
        <span className="imp-obiettivo-unita">
          {parole ? `parole (circa ${obiettivo.pagineMin}–${obiettivo.pagineMax} pagine)` : `pagine (circa ${mille(obiettivo.pagineMin * ppp)}–${mille(obiettivo.pagineMax * ppp)} parole)`}
        </span>
      </div>
      <div className="imp-misura" role="radiogroup" aria-label="Conta in">
        {(['pagine', 'parole'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={(obiettivo.misura ?? 'pagine') === m}
            className={`imp-misura-scelta ${(obiettivo.misura ?? 'pagine') === m ? 'imp-misura-attiva' : ''}`}
            onClick={() => setObiettivo({ misura: m })}
          >
            {m === 'pagine' ? 'Conto in pagine' : 'Conto in parole'}
          </button>
        ))}
      </div>
      <fieldset className="campi-obiettivo imp-campi-obiettivo">
        <legend className="etichetta imp-nascosto">Lunghezza della tesi</legend>
        <label className="campo-blocco">
          <span className="etichetta">{parole ? 'Parole, da' : 'Pagine, da'}</span>
          <input
            key={`min-${parole}-${obiettivo.pagineMin}-${ppp}`}
            className="campo"
            type="number"
            inputMode="numeric"
            min={parole ? 10 * ppp : 10}
            max={parole ? 300 * ppp : 300}
            step={parole ? 100 : 1}
            defaultValue={parole ? obiettivo.pagineMin * ppp : obiettivo.pagineMin}
            onBlur={(e) => {
              const pagineMin = parole ? daParole(e.target.value) : numero(e.target.value, 10, 300)
              setObiettivo({ pagineMin, pagineMax: Math.max(pagineMin, obiettivo.pagineMax) })
            }}
          />
        </label>
        <label className="campo-blocco">
          <span className="etichetta">a</span>
          <input
            key={`max-${parole}-${obiettivo.pagineMax}-${ppp}`}
            className="campo"
            type="number"
            inputMode="numeric"
            min={parole ? 10 * ppp : 10}
            max={parole ? 300 * ppp : 300}
            step={parole ? 100 : 1}
            defaultValue={parole ? obiettivo.pagineMax * ppp : obiettivo.pagineMax}
            onBlur={(e) => setObiettivo({ pagineMax: Math.max(obiettivo.pagineMin, parole ? daParole(e.target.value) : numero(e.target.value, 10, 300)) })}
          />
        </label>
        <label className="campo-blocco">
          <span className="etichetta">Parole per pagina</span>
          <input className="campo" type="number" inputMode="numeric" min={150} max={600} value={ppp} onChange={(e) => setObiettivo({ parolePerPagina: numero(e.target.value, 150, 600) })} />
        </label>
      </fieldset>
      <div className="imp-consegna">
        <label className="campo-blocco">
          <span className="etichetta">Data di consegna</span>
          <input
            className="campo"
            type="date"
            value={obiettivo.consegna ?? ''}
            onChange={(e) => impostaObiettivo({ consegna: e.target.value || null })}
          />
        </label>
        {obiettivo.consegna && (
          <button type="button" className="bottone bottone-vuoto" onClick={() => impostaObiettivo({ consegna: null })}>
            <Icona nome="chiudi" dimensione={16} /> Togli la data
          </button>
        )}
      </div>
      <p className="nota imp-piccola">
        {obiettivo.consegna
          ? `Consegna il ${giornoLeggibile(obiettivo.consegna, true)}. Il ritmo parte dal giorno in cui hai scelto la data.`
          : 'Senza data non posso dirti quanto scrivere al giorno.'}
      </p>
    </Carta>
  )
}

const CAMPI_FRONTESPIZIO: { chiave: Exclude<keyof Frontespizio, 'carattere'>; nome: string; esempio: string }[] = [
  { chiave: 'universita', nome: 'Università', esempio: 'Università della Calabria' },
  { chiave: 'dipartimento', nome: 'Dipartimento', esempio: 'Dipartimento di Scienze aziendali e giuridiche' },
  { chiave: 'corsoDiLaurea', nome: 'Corso di laurea', esempio: 'Corso di laurea in Economia aziendale' },
  { chiave: 'candidato', nome: 'Candidato (nome e cognome)', esempio: 'Mario Rossi' },
  { chiave: 'matricola', nome: 'Matricola', esempio: '123456' },
  { chiave: 'relatore', nome: 'Relatore', esempio: 'Prof. Giuseppe Verdi' },
  { chiave: 'correlatore', nome: 'Correlatore (se c\'è)', esempio: '' },
  { chiave: 'annoAccademico', nome: 'Anno accademico', esempio: '2026/2027' },
]

function DatiFrontespizio() {
  const salvato = useStudio((s) => s.progetto.frontespizio)
  const f = frontespizioDi({ frontespizio: salvato })
  return (
    <Carta
      icona="word"
      titolo="Frontespizio e file Word"
      sotto="Vanno nella prima pagina della tesi in Word."
      info="Il file Word ha il frontespizio, l'indice automatico, i numeri di pagina in basso, margini da tesi (3 cm a sinistra per la rilegatura, 2,5 cm sugli altri lati), carattere 12 con interlinea 1,5, testo giustificato, un capitolo per pagina e la bibliografia in fondo. Quando apri il file, Word ti chiede se aggiornare i campi: rispondi Sì, così l'indice prende i numeri di pagina giusti."
    >
      <div className="imp-frontespizio">
        {CAMPI_FRONTESPIZIO.map((c) => (
          <label key={c.chiave} className={`campo-blocco ${c.chiave === 'universita' || c.chiave === 'dipartimento' || c.chiave === 'corsoDiLaurea' ? 'imp-campo-largo' : ''}`}>
            <span className="etichetta">{c.nome}</span>
            <input
              className="campo"
              value={f[c.chiave]}
              placeholder={c.esempio}
              onChange={(e) => impostaFrontespizio({ [c.chiave]: e.target.value })}
            />
          </label>
        ))}
        <label className="campo-blocco">
          <span className="etichetta">Carattere</span>
          <select className="campo" value={f.carattere} onChange={(e) => impostaFrontespizio({ carattere: e.target.value as Frontespizio['carattere'] })}>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Garamond">Garamond</option>
          </select>
        </label>
      </div>
      <p className="imp-esempio">
        <Icona nome="info" dimensione={16} />
        <span>Quando apri il file, Word ti chiede di aggiornare i campi: rispondi Sì e l'indice si completa con i numeri di pagina.</span>
      </p>
    </Carta>
  )
}

function Tesi() {
  const stile = useStudio((s) => s.progetto.stileCitazione)
  const caso = useStudio((s) => s.progetto.casoAziendale)
  const setStile = useStudio((s) => s.setStileCitazione)
  const setCaso = useStudio((s) => s.setCaso)

  return (
    <Carta icona="libro" titolo="Citazioni e caso aziendale" sotto="Come scrivi le fonti e se c'è un'azienda da studiare.">
      <label className="campo-blocco">
        <span className="etichetta">Come citare le fonti</span>
        <select className="campo" value={stile} onChange={(e) => setStile(e.target.value as StileCitazione)}>
          <option value="autore-anno">Autore-anno</option>
          <option value="note">Note a piè di pagina</option>
        </select>
      </label>
      <p className="imp-esempio">
        <Icona nome="nota" dimensione={16} />
        <span>{ESEMPIO_STILE[stile]}</span>
      </p>
      <label className="interruttore imp-interruttore">
        <input type="checkbox" checked={caso.attivo} onChange={(e) => setCaso({ attivo: e.target.checked })} />
        <span>Aggiungi un caso aziendale (per esempio un frantoio di cui hai i dati)</span>
      </label>
      {caso.attivo && (
        <label className="campo-blocco imp-caso">
          <span className="etichetta">Descrivi l'azienda (senza il nome vero)</span>
          <textarea
            className="campo"
            rows={3}
            value={caso.descrizione}
            placeholder="Per esempio: frantoio della Piana di Gioia Tauro, molitura conto terzi, dati di cinque campagne."
            onChange={(e) => setCaso({ descrizione: e.target.value })}
          />
          <span className="nota">Non scrivere il nome vero dell'azienda: questo testo viene mandato agli agenti.</span>
        </label>
      )}
    </Carta>
  )
}

function Suoni() {
  const [acceso, setAcceso] = useState(suoniAccesi)
  useEffect(() => {
    // La testata può accendere o spegnere i suoni: restiamo allineati.
    const allinea = () => setAcceso(suoniAccesi())
    window.addEventListener('studio-tesi-suoni', allinea)
    return () => window.removeEventListener('studio-tesi-suoni', allinea)
  }, [])
  return (
    <div className="imp-riga">
      <span className="imp-riga-icona" aria-hidden>
        <Icona nome={acceso ? 'suono' : 'muto'} dimensione={18} />
      </span>
      <label className="interruttore imp-interruttore imp-riga-interruttore">
        <span>Suoni leggeri (tic delle risposte, tastiera dello scrittore)</span>
        <input
          type="checkbox"
          checked={acceso}
          onChange={(e) => {
            const v = e.target.checked
            impostaSuoni(v)
            setAcceso(v)
            if (v) suonoRisposta()
          }}
        />
      </label>
    </div>
  )
}

function AppSullIpad() {
  return (
    <Carta icona="dispositivi" titolo="Usala come un'app sull'iPad" sotto="Un'icona sulla schermata Home, a tutto schermo.">
      <p className="nota imp-spiega">
        Apri il sito in Safari, tocca Condividi › Aggiungi alla schermata Home, poi Aggiungi. Dopo la prima apertura funziona
        anche senza internet: l'ufficio 3D, i ritratti e le pagine restano sul dispositivo. Internet serve solo per Claude, la
        ricerca delle fonti e la sincronizzazione con GitHub. Quando c'è una versione nuova compare in alto «C'è una versione
        nuova · Aggiorna»: toccalo quando hai finito di scrivere.
      </p>
    </Carta>
  )
}

function Dispositivo() {
  const preferenze = useStudio((s) => s.preferenze)
  const setPreferenze = useStudio((s) => s.setPreferenze)
  const modo = useModoUso()
  const preset = useGraficaStore((s) => s.preset)
  const livelloAuto = useGraficaStore((s) => s.autoLivello)
  const riassunto = preferenze.modalitaScena === 'spenta' ? 'Ufficio 3D spento: solo i pannelli' : riassuntoGrafica(preset, livelloAuto)

  return (
    <Carta
      icona="dispositivi"
      titolo="Questo dispositivo"
      sotto="Valgono solo qui, non sugli altri dispositivi."
      info={
        <>
          Come lo usi — Computer: scrittura completa, ricerca, revisione e file. iPad: rileggere su carta, approvare, schede, note
          del relatore, chat e piccole modifiche, con bottoni più grandi. La grafica dell’ufficio 3D si regola a parte, come nei
          videogiochi.
        </>
      }
    >
      <div className="imp-righe">
        <div className="imp-riga">
          <span className="imp-riga-icona" aria-hidden>
            <Icona nome={preferenze.tema === 'scuro' ? 'luna' : 'sole'} dimensione={18} />
          </span>
          <label className="imp-riga-campo">
            <span className="imp-riga-nome">Tema</span>
            <select className="campo" value={preferenze.tema} onChange={(e) => setPreferenze({ tema: e.target.value as Tema })}>
              <option value="auto">Automatico (come il dispositivo)</option>
              <option value="chiaro">Chiaro</option>
              <option value="scuro">Scuro</option>
            </select>
          </label>
        </div>
        <div className="imp-riga">
          <span className="imp-riga-icona" aria-hidden>
            <Icona nome="dispositivi" dimensione={18} />
          </span>
          <label className="imp-riga-campo">
            <span className="imp-riga-nome">Come lo usi</span>
            <select className="campo" value={preferenze.modoUso} onChange={(e) => setPreferenze({ modoUso: e.target.value as ModoUso })}>
              <option value="auto">Automatico (ora: {modo === 'ipad' ? 'iPad' : 'computer'})</option>
              <option value="computer">Computer — tutto</option>
              <option value="ipad">iPad — leggere e decidere</option>
            </select>
          </label>
        </div>
        <div className="imp-riga">
          <span className="imp-riga-icona" aria-hidden>
            <Icona nome="monitor" dimensione={18} />
          </span>
          <div className="imp-riga-campo imp-riga-grafica">
            <span>
              <span className="imp-riga-nome">Grafica dell’ufficio 3D</span>
              <span className="imp-riga-sotto">{riassunto}</span>
            </span>
            <button type="button" className="bottone bottone-secondario" onClick={() => apriMenuGrafica()}>
              Impostazioni grafiche
            </button>
          </div>
        </div>
        <Suoni />
      </div>
    </Carta>
  )
}

function Modelli() {
  const modelli = useStudio((s) => s.preferenze.modelli)
  const setModello = useStudio((s) => s.setModello)
  return (
    <Carta icona="scintille" titolo="Modelli IA degli agenti" sotto="Quale modello usa ogni lavoro (serve la chiave API).">
      <div className="imp-modelli">
        {(Object.keys(ETICHETTE_SLOT) as ModelSlot[]).map((slot) => (
          <label key={slot} className="campo-blocco">
            <span className="etichetta">{ETICHETTE_SLOT[slot]}</span>
            <select className="campo" value={modelli[slot]} onChange={(e) => setModello(slot, e.target.value)}>
              {MODELLI_DISPONIBILI.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} — {m.nota}
                  {m.id === MODELLI_PREDEFINITI[slot] ? ' (predefinito)' : ''}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </Carta>
  )
}

function Diagnostica() {
  const haChiave = useStudio((s) => s.apiKey.length > 0)
  const [conWeb, setConWeb] = useState(true)
  const [esiti, setEsiti] = useState<EsitoDiagnosi[]>([])
  const [lavoro, setLavoro] = useState(false)
  return (
    <Carta
      icona="bacchetta"
      titolo="Prova la tua chiave"
      sotto="Controlla che modelli e ricerche rispondano. Costa pochi centesimi."
      info="Fa una prova vera di tutto quello che usa l'app: ogni modello scelto risponde a una domanda piccolissima, la ricerca su internet fa una sola ricerca e gli archivi online una sola richiesta. Costa pochi centesimi."
    >
      <label className="interruttore imp-interruttore">
        <input type="checkbox" checked={conWeb} onChange={(e) => setConWeb(e.target.checked)} />
        <span>Prova anche la ricerca su internet (1 centesimo)</span>
      </label>
      <div className="imp-azioni">
        <button
          type="button"
          className="bottone bottone-primario"
          disabled={!haChiave || lavoro}
          onClick={async () => {
            setLavoro(true)
            setEsiti([])
            await eseguiDiagnosi(conWeb, (e) => setEsiti((x) => [...x, e]))
            setLavoro(false)
          }}
        >
          <Icona nome="bacchetta" dimensione={16} />
          {lavoro ? 'Prova in corso…' : 'Fai la prova'}
        </button>
        {!haChiave && <span className="nota">Prima salva la chiave API.</span>}
      </div>
      {esiti.length > 0 && (
        <ul className="elenco-diagnosi imp-diagnosi">
          {esiti.map((e) => (
            <li key={e.voce} className={e.ok ? 'nota-ok' : 'testo-errore'}>
              {e.ok ? '✓' : '✕'} <strong>{e.voce}</strong>: {e.messaggio}
              {e.millisecondi > 0 && <small className="nota"> · {(e.millisecondi / 1000).toFixed(1)} s</small>}
            </li>
          ))}
        </ul>
      )}
    </Carta>
  )
}

function CopieSicurezza() {
  const [copie, setCopie] = useState<CopiaSicurezza[] | null>(null)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const aggiorna = async () => setCopie(await elencoCopie())
  const ultimaSync = useSync((s) => s.ultima)
  useEffect(() => {
    // Lettura asincrona da IndexedDB: lo stato si aggiorna quando arriva la risposta.
    let attivo = true
    elencoCopie().then((c) => attivo && setCopie(c))
    return () => {
      attivo = false
    }
    // Dopo una sincronizzazione può esserci una copia nuova ("Prima di ricevere…").
  }, [ultimaSync])

  return (
    <Carta
      icona="versioni"
      titolo="Copie di sicurezza"
      sotto={copie ? `${copie.length} di 10 copie in questo browser` : 'Le ultime 10 copie del tuo lavoro.'}
      info="Il browser tiene le ultime 10 copie del tuo lavoro: una quando apri l'app e una ogni 15 minuti se hai cambiato qualcosa. Servono per tornare indietro se sbagli. Per non perdere niente, usa la sincronizzazione o il file su iCloud o Drive."
    >
      <div className="imp-azioni">
        <button
          type="button"
          className="bottone bottone-primario"
          onClick={async () => {
            const fatta = await creaCopia('Creata da te', true)
            setMessaggio(fatta ? 'Copia creata.' : 'Non hai cambiato niente dall\'ultima copia.')
            await aggiorna()
          }}
        >
          <Icona nome="copia" dimensione={16} />
          Fai una copia adesso
        </button>
      </div>
      {messaggio && <p className="nota nota-ok">{messaggio}</p>}
      {copie && copie.length === 0 && <p className="nota imp-vuoto">Ancora nessuna copia.</p>}
      {copie && copie.length > 0 && (
        <ul className="elenco-copie imp-copie">
          {copie.map((c) => (
            <li key={c.id}>
              <span className="imp-copia-punto" aria-hidden />
              <span className="imp-copia-testo">
                <strong>{new Date(c.data).toLocaleString('it-IT')}</strong>
                <span className="nota">
                  {c.motivo} · {c.parole} parole · {c.fonti} fonti
                </span>
              </span>
              <Conferma
                classe="bottone bottone-piccolo bottone-secondario"
                etichetta="Ripristina"
                domanda="Torni a questa copia? Prima salvo quello che hai adesso come copia."
                conferma="Ripristina"
                onConferma={async () => {
                  await ripristinaCopia(c.id)
                  setMessaggio('Fatto, sei tornato a quella copia. Quello che avevi prima è fra le copie.')
                  await aggiorna()
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Carta>
  )
}

function Ripristino() {
  const [aperto, setAperto] = useState(false)
  const [fatto, setFatto] = useState(false)
  const [lavoro, setLavoro] = useState(false)
  const conta = aperto ? cosaSiCancella() : null
  return (
    <Carta
      icona="avviso"
      titolo="Ricomincia da capo"
      classe="pannello-ripristino imp-pericolo"
      sotto="Cancella il tuo lavoro e riparti pulito. Le lezioni del corso restano."
      info="Cancella tutto quello che hai fatto (fonti, testo scritto, ricerche, note del relatore, chat) e riparti pulito. Le lezioni del corso che hai caricato restano dove sono."
    >
      {!aperto ? (
        <div className="imp-azioni">
          <button type="button" className="bottone bottone-pericolo" onClick={() => (setAperto(true), setFatto(false))}>
            <Icona nome="cestino" dimensione={16} />
            Ripristina
          </button>
        </div>
      ) : (
        conta && (
          <div className="banda banda-attesa" role="group" aria-label="Conferma ripristino">
            <p>
              Sicuro? Se ne vanno <strong>{conta.fonti} fonti</strong>, <strong>{conta.parole} parole</strong> scritte e{' '}
              <strong>{conta.osservazioni} note del relatore</strong>. Restano le tue <strong>{conta.lezioni} lezioni</strong>. Prima
              faccio comunque una copia di sicurezza, così se cambi idea la recuperi fra le copie di sicurezza.
            </p>
            <div className="riga-editor">
              <button
                type="button"
                className="bottone bottone-pericolo"
                disabled={lavoro}
                onClick={async () => {
                  setLavoro(true)
                  await creaCopia('Prima del ripristino', true)
                  await ripristinaTenendoIlCorso()
                  setLavoro(false)
                  setAperto(false)
                  setFatto(true)
                }}
              >
                Sì, cancella tutto tranne le lezioni
              </button>
              <button type="button" className="bottone bottone-vuoto" onClick={() => setAperto(false)}>
                No, lascia stare
              </button>
            </div>
          </div>
        )
      )}
      {fatto && (
        <p className="nota nota-ok" role="status">
          Fatto, si riparte da zero. Le lezioni sono ancora lì.
        </p>
      )}
    </Carta>
  )
}

function Registro() {
  const log = useStudio((s) => s.log)
  return (
    <Carta icona="elenco" titolo="Registro" sotto="Tutto quello che è successo, dal più recente.">
      <details className="imp-registro">
        <summary>Cronologia ({log.length})</summary>
        <ul className="registro">
          {[...log].reverse().map((l) => (
            <li key={l.id} className={`log-${l.kind}`}>
              <time>{l.ora}</time> {l.messaggio}
            </li>
          ))}
        </ul>
      </details>
    </Carta>
  )
}

type IdScheda = 'account' | 'tesi' | 'sicurezza' | 'avanzate'

const SCHEDE: { id: IdScheda; nome: string; icona: string; sotto: string }[] = [
  { id: 'account', nome: 'Account e dispositivi', icona: 'persona', sotto: 'Chiave, sincronizzazione, tema' },
  { id: 'tesi', nome: 'La tesi', icona: 'libro', sotto: 'Titolo, consegna, frontespizio' },
  { id: 'sicurezza', nome: 'Sicurezza', icona: 'scudo', sotto: 'File, copie, ripristino' },
  { id: 'avanzate', nome: 'Avanzate', icona: 'ingranaggio', sotto: 'Modelli, costi, prove' },
]

const CHIAVE_SCHEDA = 'studio-tesi.impostazioni-scheda'

function schedaSalvata(): IdScheda {
  try {
    const v = localStorage.getItem(CHIAVE_SCHEDA)
    if (SCHEDE.some((s) => s.id === v)) return v as IdScheda
  } catch {
    /* il browser non legge: si parte dalla prima */
  }
  return 'account'
}

export function Impostazioni() {
  const statoSync = useSync((s) => s.stato)
  // Se la sincronizzazione chiede attenzione (si arriva dal chip in testata) si apre la scheda giusta.
  const [scheda, setScheda] = useState<IdScheda>(() =>
    statoSync === 'errore' || statoSync === 'conflitto' ? 'account' : schedaSalvata(),
  )
  const bottoni = useRef<Record<string, HTMLButtonElement | null>>({})

  const scegli = (id: IdScheda, fuoco = false) => {
    setScheda(id)
    try {
      localStorage.setItem(CHIAVE_SCHEDA, id)
    } catch {
      /* niente: il browser non salva */
    }
    if (fuoco) bottoni.current[id]?.focus()
  }

  const tasti = (e: KeyboardEvent) => {
    const i = SCHEDE.findIndex((s) => s.id === scheda)
    const dove =
      e.key === 'ArrowRight' ? (i + 1) % SCHEDE.length
      : e.key === 'ArrowLeft' ? (i - 1 + SCHEDE.length) % SCHEDE.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? SCHEDE.length - 1
      : -1
    if (dove < 0) return
    e.preventDefault()
    scegli(SCHEDE[dove].id, true)
  }

  useEffect(() => {
    bottoni.current[scheda]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [scheda])

  const pannello = (id: IdScheda, contenuto: ReactNode) => (
    <div
      role="tabpanel"
      id={`imp-pannello-${id}`}
      aria-labelledby={`imp-scheda-nome-${id}`}
      hidden={scheda !== id}
      className={`imp-pannello imp-pannello-${id}`}
    >
      {contenuto}
    </div>
  )

  return (
    <div className="imp">
      <div className="imp-schede" role="tablist" aria-label="Sezioni delle impostazioni" onKeyDown={tasti}>
        {SCHEDE.map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              bottoni.current[s.id] = el
            }}
            type="button"
            role="tab"
            id={`imp-scheda-${s.id}`}
            aria-selected={scheda === s.id}
            aria-controls={`imp-pannello-${s.id}`}
            tabIndex={scheda === s.id ? 0 : -1}
            className="imp-scheda"
            onClick={() => scegli(s.id)}
          >
            <span className="imp-scheda-icona" aria-hidden>
              <Icona nome={s.icona} dimensione={18} />
            </span>
            <span className="imp-scheda-testi">
              <span className="imp-scheda-nome" id={`imp-scheda-nome-${s.id}`}>
                {s.nome}
              </span>
              <span className="imp-scheda-sotto" aria-hidden>
                {s.sotto}
              </span>
            </span>
          </button>
        ))}
      </div>

      {pannello(
        'account',
        <>
          <div className="imp-colonna">
            <Chiave />
            <Dispositivo />
            <AppSullIpad />
          </div>
          <div className="imp-colonna">
            <PannelloSincronizzazione />
          </div>
        </>,
      )}
      {pannello(
        'tesi',
        <>
          <div className="imp-colonna">
            <TitoloDomanda />
            <DatiFrontespizio />
          </div>
          <div className="imp-colonna">
            <Lunghezza />
            <Tesi />
          </div>
        </>,
      )}
      {pannello(
        'sicurezza',
        <>
          <div className="imp-colonna">
            <FileProgetto onAnteprima={() => scegli('sicurezza')} />
            <Ripristino />
          </div>
          <div className="imp-colonna">
            <CopieSicurezza />
          </div>
        </>,
      )}
      {pannello(
        'avanzate',
        <>
          <div className="imp-colonna">
            <Diagnostica />
            <Registro />
          </div>
          <div className="imp-colonna">
            <Modelli />
          </div>
          <div className="imp-largo">
            <Costi />
          </div>
        </>,
      )}
    </div>
  )
}
