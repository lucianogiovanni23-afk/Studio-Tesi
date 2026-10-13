import '../revisione/revisione-nuove.css'
import { useState } from 'react'
import { costoStimato } from '../agents/api'
import { CollegaAlLavoro } from '../components/CollegaPensa'
import { Conferma } from '../components/Conferma'
import { useStudio } from '../store'
import type { DomandaDiscussione, PreparazioneDiscussione } from '../types'
import { Icona } from '../ui/Icona'
import { Info } from '../ui/Info'
import { vaiAlParagrafo } from '../revisione/vaiAlParagrafo'
import { cambiaRisposta, cancellaDiscussione, discussioneInTesto, preparaDiscussione, scaricaTesto, segnaPronta, stimaDiscussione } from './discussione'

function useEtichetta() {
  const capitoli = useStudio((s) => s.progetto.capitoli)
  return (capId: string | null, sezId: string | null) => {
    const i = capitoli.findIndex((c) => c.id === capId)
    if (i < 0) return null
    const j = capitoli[i].sezioni.findIndex((s) => s.id === sezId)
    return j < 0 ? `Capitolo ${i + 1}` : `${i + 1}.${j + 1} ${capitoli[i].sezioni[j].titolo}`
  }
}

function CartaDomanda({ q, n }: { q: DomandaDiscussione; n: number }) {
  const [aperta, setAperta] = useState(false)
  const [modifica, setModifica] = useState(false)
  const etichetta = useEtichetta()
  const dove = etichetta(q.capitoloId, q.sezioneId)
  return (
    <li className={`dis-domanda ${q.pronta ? 'dis-pronta' : ''}`}>
      <button type="button" className="dis-domanda-testa" aria-expanded={aperta} onClick={() => setAperta((a) => !a)}>
        <span className="dis-numero">{n}</span>
        <span className="dis-testo-domanda">{q.domanda}</span>
        {q.pronta && (
          <span className="dis-pronta-segno" aria-label="la sai">
            <Icona nome="spunta" dimensione={16} />
          </span>
        )}
        <Icona nome="giu" className="fisarmonica-freccia" />
      </button>
      {aperta && (
        <div className="dis-domanda-corpo">
          {modifica ? (
            <textarea
              className="campo"
              rows={5}
              value={q.risposta}
              onChange={(e) => cambiaRisposta(q.id, e.target.value)}
              aria-label="La tua risposta"
              autoFocus
            />
          ) : (
            <p className="dis-risposta">{q.risposta}</p>
          )}
          <div className="riga-editor dis-azioni">
            <label className="interruttore">
              <input type="checkbox" checked={q.pronta} onChange={(e) => segnaPronta(q.id, e.target.checked)} />
              <span>La so rispondere</span>
            </label>
            <button type="button" className="bottone bottone-vuoto bottone-piccolo" onClick={() => setModifica((m) => !m)}>
              <Icona nome={modifica ? 'spunta' : 'matita'} dimensione={16} />
              {modifica ? 'Fatto' : 'Scrivila a modo tuo'}
            </button>
            {dove && q.capitoloId && (
              <button type="button" className="link" onClick={() => vaiAlParagrafo(q.capitoloId!, q.sezioneId, null, '')}>
                {dove} →
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

function Esporta({ d }: { d: PreparazioneDiscussione }) {
  const titolo = useStudio((s) => s.progetto.titolo)
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="dis-esporta">
      <button
        type="button"
        className="bottone bottone-secondario"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(discussioneInTesto(d, titolo, 'txt'))
            setMsg('Copiato: incollalo dove vuoi.')
          } catch {
            setMsg('Il browser non mi ha fatto copiare: usa "Scarica".')
          }
        }}
      >
        <Icona nome="copia" dimensione={16} />
        Copia tutto
      </button>
      <button type="button" className="bottone bottone-secondario" onClick={() => scaricaTesto('discussione-tesi.md', discussioneInTesto(d, titolo, 'md'), 'text/markdown')}>
        <Icona nome="scarica" dimensione={16} />
        Scarica (.md)
      </button>
      <button type="button" className="bottone bottone-vuoto" onClick={() => scaricaTesto('discussione-tesi.txt', discussioneInTesto(d, titolo, 'txt'), 'text/plain')}>
        <Icona nome="scarica" dimensione={16} />
        Scarica (.txt)
      </button>
      {msg && (
        <span className="nota nota-ok" role="status">
          {msg}
        </span>
      )}
    </div>
  )
}

/** Domande probabili della commissione e scaletta delle slide. */
export function Discussione() {
  const d = useStudio((s) => s.progetto.discussione) ?? null
  const [lavoro, setLavoro] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [vista, setVista] = useState<'domande' | 'slide'>('domande')
  const pronte = d?.domande.filter((q) => q.pronta).length ?? 0

  const genera = (
    <Conferma
      classe={d ? 'bottone bottone-vuoto' : 'bottone bottone-primario'}
      etichetta={
        <>
          <Icona nome={d ? 'aggiorna' : 'scintille'} dimensione={18} /> {d ? 'Rifai domande e slide' : 'Prepara domande e slide'}
        </>
      }
      domanda={`${costoStimato(stimaDiscussione())}${d ? '; quelle di adesso verranno sostituite' : ''}. Procedo?`}
      conferma="Procedi"
      onConferma={async () => {
        setLavoro(true)
        setErrore(null)
        try {
          await preparaDiscussione()
        } catch (err) {
          if (!(err instanceof DOMException && err.name === 'AbortError')) setErrore(err instanceof Error ? err.message : 'Qualcosa è andato storto.')
        } finally {
          setLavoro(false)
        }
      }}
    />
  )

  return (
    <section className="pannello rev-carta dis">
      <div className="rev-testa">
        <h2 className="rev-titolo">
          <Icona nome="bandiera" dimensione={20} /> Prepararsi alla discussione
        </h2>
        <Info etichetta="Come funziona">
          Il revisore legge la tesi e fa finta di essere la commissione: ti prepara le domande più probabili, con una risposta
          breve presa dal tuo testo, e la scaletta delle slide. Tutto resta salvato nel progetto.
        </Info>
      </div>

      {lavoro ? (
        <CollegaAlLavoro k="revisore" frase="Faccio finta di essere la commissione…" />
      ) : !d ? (
        <div className="rev-vuoto dis-vuoto">
          <Icona nome="bandiera" dimensione={30} />
          <p>Ti preparo 10-15 domande che la commissione potrebbe farti, con una risposta breve, e la scaletta di 8-12 slide.</p>
          {genera}
        </div>
      ) : (
        <>
          <div className="dis-riepilogo">
            <div className="cor-avanzamento" aria-label={`${pronte} domande pronte su ${d.domande.length}`}>
              <div className="cor-barra" aria-hidden>
                <span style={{ width: `${d.domande.length ? Math.round((pronte / d.domande.length) * 100) : 0}%` }} />
              </div>
              <strong>
                {pronte} di {d.domande.length}
              </strong>
              <span className="nota">domande che sai già</span>
            </div>
            <span className="nota">preparate il {new Date(d.data).toLocaleDateString('it-IT')}</span>
          </div>
          <div className="filtri-tipo" role="tablist" aria-label="Cosa vedere">
            <button type="button" role="tab" aria-selected={vista === 'domande'} className={`tema ${vista === 'domande' ? 'tema-attivo' : 'tema-spento'}`} onClick={() => setVista('domande')}>
              Domande ({d.domande.length})
            </button>
            <button type="button" role="tab" aria-selected={vista === 'slide'} className={`tema ${vista === 'slide' ? 'tema-attivo' : 'tema-spento'}`} onClick={() => setVista('slide')}>
              Slide ({d.slide.length})
            </button>
          </div>
          {vista === 'domande' ? (
            <>
              <p className="nota">Prova a rispondere ad alta voce, poi tocca la domanda e confronta con la risposta suggerita.</p>
              <ol className="dis-domande">
                {d.domande.map((q, i) => (
                  <CartaDomanda key={q.id} q={q} n={i + 1} />
                ))}
              </ol>
            </>
          ) : (
            <ol className="dis-slide">
              {d.slide.map((x, i) => (
                <li key={i} className="dis-slide-carta">
                  <span className="dis-slide-numero">{i + 1}</span>
                  <h3>{x.titolo}</h3>
                  <ul>
                    {x.punti.map((p, k) => (
                      <li key={k}>{p}</li>
                    ))}
                  </ul>
                  {x.immagine && !/^nessun/i.test(x.immagine) && (
                    <p className="dis-slide-immagine">
                      <Icona nome="grafico" dimensione={16} /> {x.immagine}
                    </p>
                  )}
                  {x.aVoce && <p className="nota dis-slide-voce">A voce: {x.aVoce}</p>}
                </li>
              ))}
            </ol>
          )}
          <Esporta d={d} />
          <div className="riga-editor dis-rifai">
            {genera}
            <Conferma classe="bottone bottone-vuoto" etichetta="Cancella" domanda="Cancello domande e slide?" conferma="Cancella" pericolosa onConferma={cancellaDiscussione} />
          </div>
        </>
      )}
      {errore && <p className="allerta allerta-errore">{errore}</p>}
    </section>
  )
}
