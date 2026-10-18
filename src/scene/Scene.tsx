import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { AGENTE, AGENTI } from '../agents/agenti'
import { useMovimentoRidotto } from '../hooks/useLayoutMode'
import { useModoUso } from '../hooks/useModoUso'
import { estrazioneInCorso, useStudio } from '../store'
import type { AgentKey } from '../types'
import { Sala } from './Arredamento'
import { Scrivania } from './Scrivania'
import { CameraRig, type ControlliOrbita, type Ingresso } from './CameraRig'
import { CAMERA_BERSAGLIO, CAMERA_CASA, DIETRO_SCRIVANIA, POSTAZIONI } from './layout'
import { Persona3D } from './Persona3D'
import { ContestoEtichette, ContestoGrafica, ContestoNotte, useGrafica, type Grafica } from './qualita'
import { Etichetta } from './Etichetta'
import { EVENTO_PRONTO, Effetti } from './Effetti'
import { segnalaIngresso } from './sguardi'
import { introDaSaltare, passaggio } from '../ufficio/passaggio'
import { useNotteScena } from './notte'
import { AmbienteCielo, LuceVetrata } from './esterno/AmbienteCielo'
import { Icona } from '../ui/Icona'
import { apriMenuGrafica, useGraficaStore, useValoriGrafica } from '../grafica/grafica'
import { Motore, Precompila, prestazioni, segnalaAttivita } from './Motore'
import { LIVELLO_ORIGINALI, Statico, useCotturaOmbre } from './Statico'
import '../styles/grafica.css'
import '../styles/scena.css'

/** A ogni apertura dell'app si entra dalla porta a vetri; mai con meno animazioni o se l'hai spenta nel menu Grafica. */
function scegliIngresso(ridotto: boolean, entrata: boolean): Ingresso {
  if (ridotto || !entrata) return null
  if (!passaggio.introFatta && !introDaSaltare()) return { tipo: 'intro' }
  return null
}

/**
 * La sala si disegna solo quando la guardi: si ferma se l'app va in
 * background (scheda nascosta) o se il canvas esce dallo schermo.
 */
function useVisibile(el: React.RefObject<HTMLElement | null>): boolean {
  const [nascosta, setNascosta] = useState(() => typeof document !== 'undefined' && document.hidden)
  const [fuori, setFuori] = useState(false)
  useEffect(() => {
    const cambia = () => setNascosta(document.hidden)
    document.addEventListener('visibilitychange', cambia)
    return () => document.removeEventListener('visibilitychange', cambia)
  }, [])
  useEffect(() => {
    const nodo = el.current
    if (!nodo || typeof IntersectionObserver === 'undefined') return
    const oss = new IntersectionObserver(([v]) => setFuori(!v.isIntersecting))
    oss.observe(nodo)
    return () => oss.disconnect()
  }, [el])
  return !nascosta && !fuori
}

/** Tornando visibile ridisegna subito (serve con frameloop "demand"). */
function Risveglio({ visibile }: { visibile: boolean }) {
  const invalida = useThree((s) => s.invalidate)
  useEffect(() => {
    if (visibile) invalida()
  }, [visibile, invalida])
  return null
}

/** Dopo che la scena è pronta (evento di Effetti), il tempo perché la schermata di caricamento sparisca. */
const ATTESA_CARICAMENTO = 620

const STATO = {
  riposo: '',
  lavoro: 'sta lavorando…',
  attesa: 'aspetta te',
  fatto: 'ha finito',
  errore: 'ha un problema',
}

/** Una postazione: scrivania, persona, cartellino con nome e ruolo. */
function Postazione({ k, scelta, primoPiano, onScegli }: { k: AgentKey; scelta: boolean; primoPiano: boolean; onScegli: (k: AgentKey) => void }) {
  const def = AGENTE[k]
  const runtime = useStudio((s) => s.agenti[k])
  const ombre = useGrafica().ombre > 0
  const { scrivania, rotazione } = POSTAZIONI[k]
  const lavora = runtime.status === 'lavoro'
  const [sopra, setSopra] = useState(false)
  const cursore = (attivo: boolean) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    setSopra(attivo)
    document.body.style.cursor = attivo ? 'pointer' : ''
  }

  return (
    <group position={[scrivania[0], 0, scrivania[1]]} rotation={[0, rotazione, 0]}>
      <group
        onClick={(e) => {
          e.stopPropagation()
          onScegli(k)
        }}
        onPointerOver={cursore(true)}
        onPointerOut={cursore(false)}
      >
        <Scrivania colore={def.colore} schermoAcceso={lavora || scelta} lavora={lavora} sfasamento={scrivania[0] / 10} />
        <group position={[0, 0, DIETRO_SCRIVANIA]}>
          <Persona3D persona={def.persona} lavora={lavora} status={runtime.status} scelta={scelta} parla={scelta} sfasamento={scrivania[0]} ombre={ombre} vicino={primoPiano || scelta} />
        </group>
        {/* alone a terra per chi stai ascoltando */}
        {(scelta || sopra) && (
          <mesh position={[0, 0.012, DIETRO_SCRIVANIA + 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.95, 1.08, 48]} />
            <meshBasicMaterial color={def.colore} transparent opacity={scelta ? 0.85 : 0.45} />
          </mesh>
        )}
      </group>
      {!primoPiano && (
      <Etichetta position={[0, 1.8, DIETRO_SCRIVANIA]} distanceFactor={9} zIndexRange={[30, 10]} pointerEvents="none">
        <button
          type="button"
          className={`etichetta-scena cartellino ${scelta ? 'cartellino-scelto' : ''} stato-${runtime.status}`}
          style={{ borderColor: def.colore }}
          onClick={() => onScegli(k)}
          aria-pressed={scelta}
        >
          <strong>{def.persona.nome}</strong>
          <span>{def.persona.titolo}</span>
          {STATO[runtime.status] && <em>{runtime.etichetta || STATO[runtime.status]}</em>}
        </button>
      </Etichetta>
      )}
    </group>
  )
}

/**
 * L'ufficio: quattro scrivanie con le persone che interpretano gli agenti.
 * Toccando una persona la scegli e la telecamera si avvicina; la
 * conversazione con lei sta nel pannello accanto.
 */
/**
 * Sposta il centro ottico verso sinistra quando a destra c'è il pannello
 * della conversazione: la sala resta centrata nello spazio libero.
 */
function CentroOttico({ spostamento, campo }: { spostamento: number; campo: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalida = useThree((s) => s.invalidate)
  useEffect(() => {
    const offset = spostamento > 0 && size.width > spostamento * 1.6
    // L'aspetto va calcolato sulla vista intera (canvas + pannello), altrimenti
    // la porzione visibile risulta stirata in orizzontale.
    Object.assign(camera, { manual: true, aspect: (offset ? size.width + spostamento : size.width) / Math.max(1, size.height) })
    if (offset) camera.setViewOffset(size.width + spostamento, size.height, spostamento, 0, size.width, size.height)
    else camera.clearViewOffset()
    // Se lo spazio libero è stretto (barra laterale, finestra piccola) allarga il campo
    // visivo quel tanto che basta perché tutte e quattro le scrivanie restino nell'inquadratura.
    const libera = (offset ? size.width - spostamento : size.width) / Math.max(1, size.height)
    // Il "Campo visivo" del menu Grafica sposta tutto di quanto si discosta dai 44° di partenza.
    const base = THREE.MathUtils.clamp((2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(27.5)) / libera) * 180) / Math.PI, 44, 56)
    const fov = THREE.MathUtils.clamp(base + campo - 44, 35, 85)
    if (Math.abs(camera.fov - fov) > 0.01) Object.assign(camera, { fov })
    camera.updateProjectionMatrix()
    invalida()
    return () => camera.clearViewOffset()
  }, [camera, size.width, size.height, spostamento, campo, invalida])
  return null
}

const LATO_OMBRE = [0, 512, 1024, 2048, 4096]

/**
 * Luci, cielo e riflessi: di giorno luce naturale, di notte lampade calde e bagliori.
 * Le ombre dell'arredo sono "cotte": la mappa delle ombre si ricalcola solo
 * quando cambia qualcosa di fermo (giorno/notte, impostazioni, arredo) e, per
 * le persone che respirano e si girano, una decina di volte al secondo. Con le
 * ombre "Epiche" si ricalcola a ogni fotogramma.
 */
function Luci({ notte, g }: { notte: boolean; g: Grafica }) {
  const pieno = g.luci
  const sfondo = notte ? '#121828' : '#eef0ee'
  const sole = useRef<THREE.DirectionalLight>(null)
  const lato = LATO_OMBRE[g.ombre]
  const cuoci = useCotturaOmbre()
  useLayoutEffect(() => {
    const l = sole.current
    if (!l || !lato) return
    if (l.shadow.mapSize.x !== lato) {
      l.shadow.mapSize.set(lato, lato)
      l.shadow.map?.dispose()
      Object.assign(l.shadow, { map: null })
    }
    cuoci()
  }, [lato, notte, cuoci])
  useEffect(() => () => sole.current?.shadow.map?.dispose(), [])
  const ultimo = useRef(0)
  useFrame(() => {
    const l = sole.current
    if (!l || !l.castShadow) return
    l.shadow.autoUpdate = g.ombre === 4
    if (g.ombre === 4) return
    const ora = performance.now()
    if (cuoci.sporche() || (!g.fermo && ora - ultimo.current > 100)) {
      l.shadow.needsUpdate = true
      ultimo.current = ora
    }
  })
  return (
    <>
      <color attach="background" args={[sfondo]} />
      <fog attach="fog" args={[sfondo, 26, 48]} />
      {/* luce d'ambiente generata in locale: riflessi morbidi senza scaricare niente */}
      <Environment key={notte ? 'notte' : 'giorno'} resolution={256} frames={1}>
        {/* fuori dalla vetrata: il cielo vero del momento (esterno 3D) */}
        <AmbienteCielo />
        {notte ? (
          <>
            <Lightformer form="rect" intensity={0.75} color="#ffd9a6" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 8, 1]} />
            <Lightformer form="rect" intensity={0.25} color="#ffcf9a" position={[-10, 3, 2]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
            <Lightformer form="rect" intensity={0.25} color="#ffcf9a" position={[10, 3, 2]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
          </>
        ) : (
          <>
            <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 8, 1]} />
            <Lightformer form="rect" intensity={0.6} color="#dfe7ee" position={[-10, 3, 2]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
            <Lightformer form="rect" intensity={0.6} color="#fff0dc" position={[10, 3, 2]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
          </>
        )}
      </Environment>
      <hemisphereLight args={notte ? ['#ffdcb0', '#2b2638', pieno ? 0.28 : 0.62] : ['#ffffff', '#b9ae9c', pieno ? 0.34 : 0.72]} />
      <directionalLight
        ref={sole}
        position={[4, 9, 9]}
        intensity={notte ? (pieno ? 0.5 : 0.7) : pieno ? 1.25 : 1.1}
        color={notte ? '#ffcf96' : '#fff4e6'}
        castShadow={g.ombre > 0}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={35}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      {/* luce dalla vetrata, alle spalle delle persone: segue il sole (e la luna di notte) */}
      <LuceVetrata />
    </>
  )
}

/** Contatore FPS nell'angolo (menu Grafica › Mostra FPS). */
function ContatoreFps() {
  const [, setGiro] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setGiro((x) => x + 1), 500)
    return () => window.clearInterval(t)
  }, [])
  const reale = prestazioni.fpsReale
  const potenziale = Math.round(prestazioni.fpsPotenziale)
  return (
    <div className="contatore-fps" role="status" aria-label={`${reale} fotogrammi al secondo`}>
      {reale} FPS
      {prestazioni.aRiposo && potenziale > reale && <small>a riposo · regge {potenziale}</small>}
    </div>
  )
}

/** "Ho abbassato un po' la grafica": la modalità automatica lo dice, una volta, con il link al menu. */
function AvvisoAuto() {
  const avviso = useGraficaStore((s) => s.avvisoAuto)
  const chiudi = useGraficaStore((s) => s.chiudiAvviso)
  useEffect(() => {
    if (!avviso) return
    const t = window.setTimeout(chiudi, 14000)
    return () => window.clearTimeout(t)
  }, [avviso, chiudi])
  if (!avviso) return null
  return (
    <span className="avviso-grafica" role="status">
      Ho abbassato un po’ la grafica per tenerla fluida.
      <button
        type="button"
        className="link-scuro"
        onClick={() => {
          chiudi()
          apriMenuGrafica('grafica')
        }}
      >
        Apri il menu Grafica
      </button>
      <button type="button" className="avviso-chiudi" aria-label="Chiudi l’avviso" onClick={chiudi}>
        <Icona nome="chiudi" dimensione={14} />
      </button>
    </span>
  )
}

/** Le impostazioni grafiche effettive, con le animazioni che seguono anche "riduci movimento". */
function useGraficaScena(): Grafica {
  const valori = useValoriGrafica()
  const extra = useGraficaStore((s) => s.extra)
  const ridotto = useMovimentoRidotto()
  return useMemo(() => ({ ...valori, extra, fermo: extra.animazioni === null ? ridotto : !extra.animazioni }), [valori, extra, ridotto])
}

export function Scene({ spazioDestra = 0 }: { spazioDestra?: number }) {
  const g = useGraficaScena()
  const controlli = useRef<ControlliOrbita | null>(null)
  const contenitore = useRef<HTMLDivElement>(null)
  const visibile = useVisibile(contenitore)
  const modo = useModoUso()
  const ridotto = useMovimentoRidotto()
  const scelto = useStudio((s) => s.agenteUfficio)
  const scegli = useStudio((s) => s.scegliAgente)
  const inquadratura = useStudio((s) => s.inquadratura)
  const estrazione = useStudio((s) => estrazioneInCorso(s.progetto))
  const firmaLibri = useStudio((s) => s.progetto.fonti.map((f) => f.stato[0]).join(''))
  // All'avvio si vede tutta la sala; quando scegli una persona la telecamera la raggiunge.
  const [vista, setVista] = useState<AgentKey | null>(null)
  const [token, setToken] = useState(0)
  const [inquadraturaPrima, setInquadraturaPrima] = useState(inquadratura)
  const { notte, preferenza, alterna } = useNotteScena()
  const [ingresso] = useState(() => scegliIngresso(ridotto, g.extra.entrata))
  const [intro, setIntro] = useState(ingresso !== null)
  const [partenza, setPartenza] = useState(false)
  const [salta, setSalta] = useState(0)
  const fineIntro = useCallback(() => {
    setIntro(false)
    segnalaIngresso()
  }, [])

  // L'entrata vale per questa apertura: tornando da una pagina non si ripete.
  useEffect(() => {
    passaggio.introFatta = true
  }, [])

  // Via all'entrata quando la scena è pronta e la schermata di caricamento è sparita;
  // senza entrata, i colleghi alzano lo sguardo appena la sala si vede.
  useEffect(() => {
    let t = 0
    const via = () => {
      prestazioni.prontaDa = performance.now()
      t = window.setTimeout(() => {
        if (ingresso) setPartenza(true)
        else segnalaIngresso()
      }, ATTESA_CARICAMENTO)
    }
    if (document.documentElement.dataset.ufficioPronto === '1') via()
    else window.addEventListener(EVENTO_PRONTO, via, { once: true })
    return () => {
      window.removeEventListener(EVENTO_PRONTO, via)
      window.clearTimeout(t)
      prestazioni.prontaDa = 0
    }
  }, [ingresso])

  // Tocco, clic o Esc saltano l'entrata.
  useEffect(() => {
    if (!intro) return
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSalta((x) => x + 1)
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [intro])

  if (inquadraturaPrima !== inquadratura) {
    setInquadraturaPrima(inquadratura)
    setVista(scelto)
    setToken((t) => t + 1)
  }

  useEffect(() => () => {
    document.body.style.cursor = ''
  }, [])

  const inPausa = estrazione || (g.extra.pausa && !visibile)
  // Statico rifà l'unione dei mobili quando cambia qualcosa che si vede su di loro.
  const chiaveStatico = `${notte}|${g.ombre > 0}|${g.texture}|${g.luci}|${firmaLibri}`
  const attivita = () => segnalaAttivita(1200)

  return (
    <div className="scena scena-ufficio" ref={contenitore} onPointerMove={attivita} onPointerDown={attivita} onWheel={attivita}>
      <Canvas
        frameloop={inPausa ? 'never' : 'demand'}
        shadows={g.ombre >= 3 ? 'soft' : g.ombre > 0 ? 'percentage' : false}
        dpr={THREE.MathUtils.clamp((Math.min(window.devicePixelRatio || 1, g.tettoDpr) * g.scala) / 100, 0.5, 3)}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ position: CAMERA_CASA, fov: 44, near: 0.1, far: 120 }}
        style={{ touchAction: modo === 'ipad' ? 'none' : 'pan-y' }}
        onCreated={({ camera, raycaster }) => {
          camera.lookAt(...CAMERA_BERSAGLIO)
          // i mobili uniti da Statico restano cliccabili sul loro livello
          raycaster.layers.enable(LIVELLO_ORIGINALI)
        }}
      >
        <ContestoGrafica.Provider value={g}>
          <ContestoNotte.Provider value={notte}>
            <Luci notte={notte} g={g} />
            <ContestoEtichette.Provider value={{ spazioDestra, nascoste: intro }}>
              <Suspense fallback={null}>
                <Statico chiave={chiaveStatico}>
                  <Sala etichette={vista === null} />
                  {AGENTI.map((a) => (
                    <Postazione key={a.key} k={a.key} scelta={scelto === a.key} primoPiano={vista === a.key} onScegli={scegli} />
                  ))}
                </Statico>
                <OmbreContatto notte={notte} accese={g.ombre >= 3} />
                <Precompila />
                <Effetti g={g} notte={notte} />
              </Suspense>
            </ContestoEtichette.Provider>
          </ContestoNotte.Provider>
          <Motore inPausa={inPausa} forzaAttivo={intro && partenza} />
        </ContestoGrafica.Provider>

        <CentroOttico spostamento={spazioDestra} campo={g.extra.fov} />
        <Risveglio visibile={visibile} />
        <CameraRig controlli={controlli} fuoco={vista} token={token} ingresso={ingresso} partenza={partenza} salta={salta} onFineIntro={fineIntro} />
        {(modo === 'computer' || modo === 'ipad') && (
          <OrbitControls
            ref={controlli as never}
            target={CAMERA_BERSAGLIO}
            enablePan={false}
            enableZoom={false}
            enableDamping={!ridotto}
            dampingFactor={0.08}
            minPolarAngle={1.3}
            maxPolarAngle={Math.PI / 2.15}
            minAzimuthAngle={-Math.PI / 5}
            maxAzimuthAngle={Math.PI / 5}
          />
        )}
      </Canvas>

      {g.extra.mostraFps && <ContatoreFps />}

      {intro && partenza && (
        <button type="button" className="salta-intro" style={{ left: `calc((100% - ${spazioDestra}px) / 2)` }} onClick={() => setSalta((x) => x + 1)}>
          Tocca per saltare
        </button>
      )}
      {intro && (
        // durante l'entrata un tocco ovunque sulla sala la salta
        <div className="salta-velo" aria-hidden onPointerDown={() => setSalta((x) => x + 1)} />
      )}

      <div className="scena-comandi" role="toolbar" aria-label="Inquadrature">
        <button
          type="button"
          className={`gettone gettone-tondo gettone-notte ${notte ? 'gettone-notte-attivo' : ''}`}
          aria-label="Giorno o notte"
          aria-pressed={notte}
          title={`${notte ? 'Notte' : 'Giorno'}${preferenza === 'auto' ? ' (segue l’orologio)' : ''}: tocca per cambiare`}
          onClick={alterna}
        >
          <Icona nome={notte ? 'luna' : 'sole'} dimensione={18} />
        </button>
        <button
          type="button"
          className={`gettone gettone-tondo gettone-grafica ${notte ? 'gettone-notte-attivo' : ''}`}
          aria-label="Impostazioni grafiche"
          title="Impostazioni grafiche: qualità, ombre, FPS…"
          onClick={() => apriMenuGrafica()}
        >
          <Icona nome="monitor" dimensione={18} />
        </button>
        {vista !== null && (
          <button
            type="button"
            className="gettone gettone-sala"
            onClick={() => {
              setVista(null)
              setToken((t) => t + 1)
            }}
          >
            ← Tutta la sala
          </button>
        )}
        <AvvisoAuto />
      </div>
    </div>
  )
}

/**
 * Ombre a contatto sul pavimento sotto mobili e persone: si calcolano una
 * volta sola (cotte) e si rifanno quando l'arredo cambia.
 */
function OmbreContatto({ notte, accese }: { notte: boolean; accese: boolean }) {
  // ContactShadows ridisegna la sua mappa (una volta) a ogni nuovo render: la versione dell'arredo lo provoca.
  // Resta sempre montato (spegnerlo lo smonterebbe senza liberare i suoi buffer): si nasconde e basta.
  const versione = useCotturaOmbre().versione
  return (
    <group visible={accese}>
      <ContactShadows userData={{ versione }} position={[0, 0.01, 0]} scale={30} resolution={1024} blur={2.4} opacity={notte ? 0.5 : 0.38} far={3} frames={1} />
    </group>
  )
}
