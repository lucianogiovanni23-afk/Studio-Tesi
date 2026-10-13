import './revisione-nuove.css'
import { useMemo, useRef, useState } from 'react'
import { costoStimato } from '../agents/api'
import { CollegaAlLavoro } from '../components/CollegaPensa'
import { Conferma } from '../components/Conferma'
import { useStudio } from '../store'
import type { CompitoCorrezione, NoteCorrezioni } from '../types'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'
import { creaCorrezioni, rimuoviNote, segnaCompito, stimaCorrezioni } from './correzioni'
import { ACCETTA_NOTE, testoDaFile } from './leggiFile'
import { vaiAlParagrafo } from './vaiAlParagrafo'

interface Gruppo {
  chiave: string
  ordine: number
  titolo: string
  sotto: string
  capitoloId: string | null
  sezioneId: string | null
  paragrafo: number | null
  passo: string
  compiti: CompitoCorrezione[]
}

/** Raggruppa i compiti per paragrafo (o sezione, o capitolo), nell'ordine della tesi. */
function useGruppi(compiti: CompitoCorrezione[]): Gruppo[] {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  return useMemo(() => {
    const mappa = new Map<string, Gruppo>()
    for (const c of compiti) {
      const i = capitoli.findIndex((x) => x.id === c.capitoloId)
      const j = i >= 0 ? capitoli[i].sezioni.findIndex((x) => x.id === c.sezioneId) : -1
      const chiave = `${i}|${j}|${c.paragrafo ?? 0}`
      let g = mappa.get(chiave)
      if (!g) {
        const titolo =
          i < 0
            ? 'Tutta la tesi'
            : j < 0
              ? `Capitolo ${i + 1} · ${capitoli[i].titolo}`
              : `${i + 1}.${j + 1} ${capitoli[i].sezioni[j].titolo}`
        g = {
          chiave,
          // Prima la tesi intera, poi capitolo per capitolo, sezione per sezione, paragrafo per paragrafo.
          ordine: i < 0 ? -1 : i * 1_000_000 + (j + 1) * 1000 + (c.paragrafo ?? 0),
          titolo,
          sotto: c.paragrafo ? `paragrafo ${c.paragrafo}` : j >= 0 ? 'tutta la sezione' : i >= 0 ? 'tutto il capitolo' : '',
          capitoloId: i >= 0 ? capitoli[i].id : null,
          sezioneId: j >= 0 ? capitoli[i].sezioni[j].id : null,
          paragrafo: c.paragrafo,
          passo: c.passo,
          compiti: [],
        }
        mappa.set(chiave, g)
      }
      g.compiti.push(c)
    }
    return [...mappa.values()].sort((a, b) => a.ordine - b.ordine)
  }, [compiti, capitoli])
}

function Avanzamento({ fatti, totale }: { fatti: number; totale: number }) {
  const quota = totale ? Math.round((fatti / totale) * 100) : 0
  return (
    <div className="cor-avanzamento" aria-label={`${fatti} correzioni fatte su ${totale}`}>
      <div className="cor-barra" aria-hidden>
        <span style={{ width: `${quota}%` }} />
      </div>
      <strong>
        {fatti} di {totale}
      </strong>
      <span className="nota">{fatti === totale && totale > 0 ? 'tutto fatto!' : 'fatte'}</span>
    </div>
  )
}

function CartaNote({ n, nascondiFatte }: { n: NoteCorrezioni; nascondiFatte: boolean }) {
  const gruppi = useGruppi(n.compiti)
  const fatti = n.compiti.filter((c) => c.fatto).length
  return (
    <li className="pannello rev-carta cor-carta">
      <div className="cor-testa">
        <div>
          <h3 className="cor-titolo">
            Note del {new Date(n.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
            {n.origine && <span className="pastiglia-origine">{n.origine}</span>}
          </h3>
          <Avanzamento fatti={fatti} totale={n.compiti.length} />
        </div>
        <Conferma classe="icona" etichetta="✕" domanda="Cancello questa lista?" conferma="Elimina" pericolosa onConferma={() => rimuoviNote(n.id)} />
      </div>
      {n.spostati > 0 && (
        <p className="nota">
          {n.spostati === 1 ? 'Una correzione parlava' : `${n.spostati} correzioni parlavano`} di un paragrafo che non c'è: le ho legate alla sezione.
        </p>
      )}
      <details className="rev-dettagli">
        <summary>Le note come le hai incollate</summary>
        <blockquote className="testo-osservazione">{n.testo}</blockquote>
      </details>
      <ul className="cor-gruppi">
        {gruppi.map((g) => {
          const visibili = nascondiFatte ? g.compiti.filter((c) => !c.fatto) : g.compiti
          if (!visibili.length) return null
          const fattiGruppo = g.compiti.filter((c) => c.fatto).length
          return (
            <li key={g.chiave} className={`cor-gruppo ${fattiGruppo === g.compiti.length ? 'cor-gruppo-fatto' : ''}`}>
              <div className="cor-gruppo-testa">
                <span className="cor-gruppo-titoli">
                  <strong>{g.titolo}</strong>
                  {g.sotto && <span className="nota"> · {g.sotto}</span>}
                  {g.passo && <span className="cor-passo">«{g.passo.slice(0, 90)}…»</span>}
                </span>
                {g.capitoloId && (
                  <button type="button" className="bottone bottone-vuoto bottone-piccolo cor-vai" onClick={() => vaiAlParagrafo(g.capitoloId!, g.sezioneId, g.paragrafo, g.passo)}>
                    {g.paragrafo ? 'Vai al paragrafo' : 'Vai alla sezione'}
                    <Icona nome="freccia" dimensione={16} />
                  </button>
                )}
              </div>
              <ul className="cor-compiti">
                {visibili.map((c) => (
                  <li key={c.id} className={c.fatto ? 'cor-fatto' : ''}>
                    <label className="cor-spunta">
                      <input type="checkbox" checked={c.fatto} onChange={(e) => segnaCompito(n.id, c.id, e.target.checked)} />
                      <span className="cor-casella" aria-hidden>
                        <Icona nome="spunta" dimensione={16} />
                      </span>
                      <span className="cor-compito">
                        {c.compito}
                        {c.nota && <q className="cor-nota">{c.nota}</q>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </li>
  )
}

/** Note del relatore → lista di cose da fare, paragrafo per paragrafo. */
export function Correzioni() {
  const elenco = useStudio((s) => s.progetto.correzioni) ?? []
  const [testo, setTesto] = useState('')
  const [origine, setOrigine] = useState('')
  const [lavoro, setLavoro] = useState(false)
  const [messaggio, setMessaggio] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)
  const [nascondiFatte, setNascondiFatte] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const daFare = elenco.reduce((n, x) => n + x.compiti.filter((c) => !c.fatto).length, 0)

  const carica = async (f: File) => {
    setMessaggio(null)
    try {
      const t = await testoDaFile(f)
      if (!t.trim()) throw new Error('Nel file non ho trovato testo.')
      setTesto(t.trim())
      setOrigine(f.name)
      setMessaggio({ tono: 'ok', testo: `Ho letto "${f.name}". Controlla il testo qui sopra e poi chiedi la lista.` })
    } catch (err) {
      setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Non sono riuscito a leggere il file.' })
    }
  }

  return (
    <div className="rev-griglia cor">
      <section className="pannello rev-carta rev-nuova">
        <div className="rev-testa">
          <h2 className="rev-titolo">
            <Icona nome="spunta" dimensione={20} /> Correzioni del relatore
          </h2>
          <Info etichetta="Come funziona">
            Incolla le note del relatore (o carica il file che ti ha mandato). Il revisore le trasforma in una lista di cose da
            fare, ognuna legata al paragrafo giusto. Tu le spunti man mano: la lista resta salvata nel progetto.
          </Info>
        </div>
        <label className="campo-blocco">
          <span className="etichetta">Le note del relatore</span>
          <textarea
            className="campo"
            rows={6}
            value={testo}
            placeholder={'Incolla qui le note, anche tutte insieme.\nPer esempio: «Nel 2.1 manca un dato sui costi della raccolta. Il cap. 3 è troppo descrittivo.»'}
            onChange={(e) => {
              setTesto(e.target.value)
              if (!e.target.value) setOrigine('')
            }}
          />
        </label>
        <div className="riga-editor cor-azioni">
          <button type="button" className="bottone bottone-vuoto" onClick={() => file.current?.click()} disabled={lavoro}>
            <Icona nome="carica" dimensione={18} />
            Carica un file
          </button>
          <input
            ref={file}
            type="file"
            accept={ACCETTA_NOTE}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void carica(f)
            }}
          />
          <span className="nota">.txt, .docx o .pdf</span>
        </div>
        {lavoro ? (
          <CollegaAlLavoro k="revisore" frase="Sto leggendo le note e preparo la lista…" />
        ) : (
          <Conferma
            classe="bottone bottone-primario"
            etichetta={
              <>
                <Icona nome="elenco" dimensione={18} /> Fammi la lista delle correzioni
              </>
            }
            disabilitato={!testo.trim()}
            domanda={`${costoStimato(stimaCorrezioni(testo))}. Procedo?`}
            conferma="Procedi"
            onConferma={async () => {
              setLavoro(true)
              setMessaggio(null)
              try {
                const nuove = await creaCorrezioni(testo, origine)
                setTesto('')
                setOrigine('')
                setMessaggio({ tono: 'ok', testo: `Fatto: ${nuove.compiti.length} cose da sistemare. Le trovi qui accanto, paragrafo per paragrafo.` })
              } catch (err) {
                if (!(err instanceof DOMException && err.name === 'AbortError')) {
                  setMessaggio({ tono: 'errore', testo: err instanceof Error ? err.message : 'Qualcosa è andato storto.' })
                }
              } finally {
                setLavoro(false)
              }
            }}
          />
        )}
        {messaggio && (
          <p className={messaggio.tono === 'ok' ? 'nota nota-ok' : 'allerta allerta-errore'} role="status">
            {messaggio.testo}
          </p>
        )}
      </section>

      <section className="cor-elenco">
        <div className="rev-testa cor-elenco-testa">
          <h2 className="rev-titolo">
            <Icona nome="elenco" dimensione={20} /> Da sistemare ({daFare})
          </h2>
          {elenco.length > 0 && (
            <label className="interruttore">
              <input type="checkbox" checked={nascondiFatte} onChange={(e) => setNascondiFatte(e.target.checked)} />
              <span>Nascondi quelle fatte</span>
            </label>
          )}
        </div>
        {elenco.length === 0 ? (
          <div className="pannello rev-carta rev-vuoto">
            <Icona nome="spunta" dimensione={30} />
            <p>Ancora nessuna lista. Quando il relatore ti manda le correzioni, incollale qui accanto: le trasformo in cose semplici da spuntare.</p>
          </div>
        ) : (
          <ul className="cor-liste">
            {elenco.map((n) => (
              <CartaNote key={n.id} n={n} nascondiFatte={nascondiFatte} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
