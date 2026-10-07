import { useState } from 'react'
import { autoreAnno } from '../../domain/bibliografia'
import { useStudio } from '../../store'
import type { Capitolo, Sezione } from '../../types'
import { TemiChips } from '../TemiChips'
import { fontiPertinenti } from './pertinenza'

/** Passo 1: lo studente sceglie e approva le fonti della sezione prima della stesura. */
export function PassoFonti({ cap, sez }: { cap: Capitolo; sez: Sezione }) {
  const fonti = useStudio((s) => s.progetto.fonti)
  const setFonti = useStudio((s) => s.setFontiSezione)
  const conferma = useStudio((s) => s.confermaFontiSezione)
  const vai = useStudio((s) => s.vai)
  const [scelte, setScelte] = useState<string[]>(sez.fontiApprovate)
  const [sezioneMostrata, setSezioneMostrata] = useState(sez.id)
  if (sezioneMostrata !== sez.id) {
    setSezioneMostrata(sez.id)
    setScelte(sez.fontiApprovate)
  }

  const approvate = fonti.filter((f) => sez.fontiApprovate.includes(f.id))

  if (sez.fontiConfermate) {
    return (
      <section className="passo-scrittura passo-fatto">
        <div className="passo-testa">
          <h3>
            <span className="passo-numero">1</span> Fonti scelte
          </h3>
          <button type="button" className="bottone bottone-piccolo bottone-vuoto" onClick={() => conferma(cap.id, sez.id, false)}>
            Modifica
          </button>
        </div>
        {approvate.length === 0 ? (
          <p className="nota">Nessuna fonte: qui usi solo il materiale del corso.</p>
        ) : (
          <ul className="fonti-approvate">
            {approvate.map((f) => (
              <li key={f.id}>
                <code>[F{f.numero}]</code> {autoreAnno(f)} {f.titolo}
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  const ordinate = fontiPertinenti(fonti, sez)
  return (
    <section className="passo-scrittura passo-attivo">
      <h3>
        <span className="passo-numero">1</span> Scegli le fonti
      </h3>
      <p className="nota">
        Lo Scrittore userà solo queste fonti, più il materiale del corso. In alto trovi quelle che c'entrano di più con
        questa parte.
      </p>
      {fonti.length === 0 ? (
        <p className="nota">
          La biblioteca è vuota.{' '}
          <button type="button" className="link" onClick={() => vai('ricerca')}>
            Fai una ricerca
          </button>{' '}
          oppure vai avanti solo con il materiale del corso.
        </p>
      ) : (
        <ul className="scelta-fonti">
          {ordinate.map(({ f, peso }) => (
            <li key={f.id}>
              <label className="interruttore">
                <input
                  type="checkbox"
                  checked={scelte.includes(f.id)}
                  onChange={(e) => setScelte(e.target.checked ? [...scelte, f.id] : scelte.filter((x) => x !== f.id))}
                />
                <span>
                  <code>[F{f.numero}]</code> <strong>{autoreAnno(f, false)}</strong> {f.titolo}
                  {peso > 0 && <small className="nota-ok"> · c'entra</small>}
                  {!f.testoCompleto && <small className="nota"> · solo il riassunto</small>}
                  {f.temi.length > 0 && <TemiChips temi={f.temi} sola />}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="bottone bottone-primario"
        onClick={() => {
          setFonti(cap.id, sez.id, scelte)
          conferma(cap.id, sez.id, true)
        }}
      >
        {scelte.length ? `Uso queste ${scelte.length} fonti` : 'Solo il corso, niente fonti'}
      </button>
    </section>
  )
}
