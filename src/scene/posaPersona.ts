import * as THREE from 'three'

/**
 * Posa e animazione procedurale degli avatar Rocketbox (scheletro Biped "Bip01").
 * Niente clip di animazione: la posa seduta si calcola una volta con un po' di
 * cinematica inversa (gambe, braccia verso la tastiera, mani a palmo in giù),
 * poi ogni fotogramma aggiunge piccole rotazioni (respiro, sguardo, battitura,
 * saluto) e muove le blendshape del viso (labiale, battito di ciglia, sorriso).
 *
 * Spazio di lavoro: quello del modello (y in alto, la persona guarda +z, piedi
 * a y = 0), cioè la scena del GLB prima di essere agganciata alla sala.
 * In three.js gli spazi nei nomi dei nodi diventano "_": "Bip01_L_UpperArm".
 */

/** Dove stanno le cose rispetto alla persona (origine sotto la seduta). */
export const MISURE = {
  /** Articolazione dell'anca da seduta (la seduta è a ~0,5 m). */
  anca: new THREE.Vector3(0, 0.585, -0.03),
  /** Polsi sulla tastiera (tasti a z ≈ 0,43–0,53, altezza ≈ 0,80). */
  polso: new THREE.Vector3(0.12, 0.85, 0.345),
  /** Caviglie: piedi appoggiati a terra, un po' in avanti. */
  caviglia: new THREE.Vector3(0.12, 0, 0.36),
  /** Centro del monitor laterale, che si guarda mentre si lavora. */
  monitor: new THREE.Vector3(0.5, 1.08, 0.6),
}

const LATI = ['L', 'R'] as const
type Lato = (typeof LATI)[number]

const DITA = [1, 2, 3, 4] as const

// temporanei condivisi (niente allocazioni nei fotogrammi)
const _a = new THREE.Vector3()
const _c = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

function posa(o: THREE.Object3D, out: THREE.Vector3) {
  return o.getWorldPosition(out)
}

/** Imposta l'orientamento "di mondo" (= del modello) di un osso. */
function orienta(o: THREE.Object3D, qMondo: THREE.Quaternion) {
  if (o.parent) o.parent.getWorldQuaternion(_q2).invert()
  else _q2.identity()
  o.quaternion.copy(_q2.multiply(qMondo))
  o.updateMatrixWorld(true)
}

function ruotaMondo(o: THREE.Object3D, asse: THREE.Vector3, angolo: number) {
  const qw = o.getWorldQuaternion(new THREE.Quaternion())
  qw.premultiply(_q.setFromAxisAngle(asse, angolo))
  orienta(o, qw)
}

/** Ruota l'osso (al minimo) perché la direzione osso→figlio diventi `dir`. */
function punta(o: THREE.Object3D, figlio: THREE.Object3D, dir: THREE.Vector3) {
  const a = posa(o, new THREE.Vector3())
  const d0 = posa(figlio, new THREE.Vector3()).sub(a).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(d0, dir.clone().normalize())
  const qw = o.getWorldQuaternion(new THREE.Quaternion()).premultiply(q)
  orienta(o, qw)
}

/** IK a due ossa: porta `fine` su `bersaglio`, con il gomito/ginocchio verso `polo`. */
function ik(alto: THREE.Object3D, medio: THREE.Object3D, fine: THREE.Object3D, bersaglio: THREE.Vector3, polo: THREE.Vector3) {
  const A = posa(alto, new THREE.Vector3())
  const B = posa(medio, new THREE.Vector3())
  const C = posa(fine, new THREE.Vector3())
  const l1 = A.distanceTo(B)
  const l2 = B.distanceTo(C)
  const verso = bersaglio.clone().sub(A)
  const d = THREE.MathUtils.clamp(verso.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3)
  const n = verso.normalize()
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
  const perp = polo.clone().sub(n.clone().multiplyScalar(polo.dot(n))).normalize()
  const gomito = A.clone()
    .addScaledVector(n, l1 * cos)
    .addScaledVector(perp, l1 * Math.sqrt(Math.max(0, 1 - cos * cos)))
  punta(alto, medio, gomito.clone().sub(A))
  const fineVoluta = A.clone().addScaledVector(n, d)
  punta(medio, fine, fineVoluta.sub(gomito))
}

/** Orienta un osso con due direzioni: `avanti` (verso `figlio`) e `normale` (calcolata da `normaleOra`). */
function allinea(o: THREE.Object3D, avantiOra: THREE.Vector3, normaleOra: THREE.Vector3, avanti: THREE.Vector3, normale: THREE.Vector3) {
  const base = (f: THREE.Vector3, n: THREE.Vector3, m: THREE.Matrix4) => {
    const ff = f.clone().normalize()
    const nn = n.clone().sub(ff.clone().multiplyScalar(n.dot(ff))).normalize()
    const ll = new THREE.Vector3().crossVectors(ff, nn)
    return m.makeBasis(ff, nn, ll)
  }
  const ora = base(avantiOra, normaleOra, new THREE.Matrix4())
  const voluta = base(avanti, normale, new THREE.Matrix4())
  const r = new THREE.Quaternion().setFromRotationMatrix(voluta.multiply(ora.transpose()))
  const qw = o.getWorldQuaternion(new THREE.Quaternion()).premultiply(r)
  orienta(o, qw)
}

/** Direzioni della mano: avanti (verso il medio), laterale (mignolo→indice), normale del palmo. */
function assiMano(ossa: Ossa, lato: Lato) {
  const h = posa(ossa.get(`${lato}_Hand`), new THREE.Vector3())
  const medio = posa(ossa.get(`${lato}_Finger2`), new THREE.Vector3())
  const indice = posa(ossa.get(`${lato}_Finger1`), new THREE.Vector3())
  const mignolo = posa(ossa.get(`${lato}_Finger4`), new THREE.Vector3())
  const avanti = medio.sub(h).normalize()
  const laterale = indice.sub(mignolo).normalize()
  const palmo = lato === 'L' ? new THREE.Vector3().crossVectors(avanti, laterale) : new THREE.Vector3().crossVectors(laterale, avanti)
  return { avanti, laterale, palmo: palmo.normalize() }
}

class Ossa {
  private mappa = new Map<string, THREE.Object3D>()
  constructor(radice: THREE.Object3D) {
    radice.traverse((o) => {
      if (o.name.startsWith('Bip01')) this.mappa.set(o.name.replace(/^Bip01_?/, '') || 'Bip01', o)
    })
  }
  get(nome: string): THREE.Object3D {
    const o = this.mappa.get(nome)
    if (!o) throw new Error(`Osso mancante: ${nome}`)
    return o
  }
  ha(nome: string) {
    return this.mappa.has(nome)
  }
}

/** Una rotazione aggiuntiva calcolabile ogni fotogramma: asse nel sistema del genitore. */
interface Snodo {
  osso: THREE.Object3D
  base: THREE.Quaternion
  saluto: THREE.Quaternion | null
  /** Assi X, Y, Z del modello espressi nel sistema del genitore (nella posa base). */
  x: THREE.Vector3
  y: THREE.Vector3
  z: THREE.Vector3
  /** Asse di flessione delle dita (solo falangi). */
  flessione: THREE.Vector3 | null
}

const MORFI = ['PP', 'FF', 'aa', 'E', 'O', 'U', 'browInnerUp', 'eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthSmileLeft', 'mouthSmileRight'] as const
type Morfo = (typeof MORFI)[number]

export interface StatoPersona {
  /** Tempo in secondi (già sfasato per persona). */
  t: number
  dt: number
  /** 0..1: quanto sta scrivendo. */
  lavora: number
  /** Punto da guardare, nello spazio del modello (o null: si guarda intorno). */
  guarda: THREE.Vector3 | null
  parla: boolean
  /** 0..1: peso del saluto, e da quanto è iniziato. */
  saluto: number
  salutoDa: number
  /** Rotazione del busto verso la telecamera durante il saluto (rad). */
  girata: number
  sorriso: number
}

export class RigPersona {
  readonly snodi = new Map<string, Snodo>()
  private morfi: Record<Morfo, { inf: number[]; i: number }[]>
  private valori: Record<Morfo, number>
  private testaBase = new THREE.Vector3()
  private prossimoBattito = 2
  private battito = -1
  private sillaba = -1
  private bersagliBocca = { jaw: 0, aa: 0, O: 0, E: 0, PP: 0, U: 0 }
  private sguardo = { yaw: 0, pitch: 0 }
  private occhi = { yaw: 0, pitch: 0 }

  constructor(radice: THREE.Object3D) {
    radice.updateMatrixWorld(true)
    const ossa = new Ossa(radice)
    // dita della mano destra distese (prima di piegarle sui tasti): servono per il saluto
    const ditaDistese = new Map<string, THREE.Quaternion>()
    for (const f of [0, ...DITA]) for (const seg of ['', '1', '2']) {
      const n = `R_Finger${f}${seg}`
      if (ossa.ha(n)) ditaDistese.set(n, ossa.get(n).quaternion.clone())
    }
    posaSeduta(ossa)
    const saluto = posaSaluto(ossa)
    for (const [n, q] of ditaDistese) saluto.set(n, q)

    const nomi = [
      'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LEye', 'REye',
      ...LATI.flatMap((l) => [`${l}_Clavicle`, `${l}_UpperArm`, `${l}_Forearm`, `${l}_Hand`]),
      ...LATI.flatMap((l) => [0, ...DITA].flatMap((f) => [`${l}_Finger${f}`, `${l}_Finger${f}1`, `${l}_Finger${f}2`])),
    ]
    const qp = new THREE.Quaternion()
    for (const nome of nomi) {
      if (!ossa.ha(nome)) continue
      const osso = ossa.get(nome)
      osso.parent?.getWorldQuaternion(qp)
      qp.invert()
      const ass = (v: THREE.Vector3) => v.clone().applyQuaternion(qp)
      let flessione: THREE.Vector3 | null = null
      const m = /^([LR])_Finger(\d)/.exec(nome)
      if (m) {
        const { avanti, palmo } = assiMano(ossa, m[1] as Lato)
        flessione = ass(new THREE.Vector3().crossVectors(avanti, palmo).normalize())
      }
      this.snodi.set(nome, {
        osso,
        base: osso.quaternion.clone(),
        saluto: saluto.get(nome) ?? null,
        x: ass(X),
        y: ass(Y),
        z: ass(Z),
        flessione,
      })
    }
    radice.updateMatrixWorld(true)
    posa(ossa.get('Head'), this.testaBase)
    this.testaBase.y += 0.08

    // blendshape: per ogni nome, tutte le mesh che ce l'hanno
    this.morfi = {} as Record<Morfo, { inf: number[]; i: number }[]>
    this.valori = {} as Record<Morfo, number>
    for (const n of MORFI) {
      this.morfi[n] = []
      this.valori[n] = 0
    }
    radice.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return
      for (const n of MORFI) {
        const i = mesh.morphTargetDictionary[n]
        if (i !== undefined) this.morfi[n].push({ inf: mesh.morphTargetInfluences, i })
      }
    })
  }

  private imposta(n: Morfo, v: number) {
    this.valori[n] = v
    for (const c of this.morfi[n]) c.inf[c.i] = v
  }

  private avvicina(n: Morfo, v: number, k: number) {
    this.imposta(n, this.valori[n] + (v - this.valori[n]) * k)
  }

  /** Aggiunge al quaternione corrente dell'osso una rotazione attorno a un asse del modello. */
  private gira(s: Snodo | undefined, asse: 'x' | 'y' | 'z' | 'flessione', angolo: number) {
    if (!s || angolo === 0) return
    const a = s[asse]
    if (!a) return
    s.osso.quaternion.premultiply(_q.setFromAxisAngle(a, angolo))
  }

  aggiorna(st: StatoPersona) {
    const { t, dt } = st
    const k = 1 - Math.exp(-dt * 5)
    const s = this.snodi
    // 1. si riparte dalla posa base (con il braccio del saluto mescolato)
    for (const n of s.values()) {
      n.osso.quaternion.copy(n.base)
      if (n.saluto && st.saluto > 0.001) n.osso.quaternion.slerp(n.saluto, st.saluto)
    }

    // 2. respiro e busto
    const respiro = Math.sin(t * 1.7)
    this.gira(s.get('Spine1'), 'x', -respiro * 0.012)
    this.gira(s.get('Spine2'), 'x', -respiro * 0.01)
    this.gira(s.get('L_Clavicle'), 'z', respiro * 0.012)
    this.gira(s.get('R_Clavicle'), 'z', -respiro * 0.012)
    const busto = st.girata * st.saluto
    this.gira(s.get('Spine1'), 'y', busto * 0.5)
    this.gira(s.get('Spine2'), 'y', busto * 0.5)
    // un po' di dondolio mentre scrive
    this.gira(s.get('Spine2'), 'z', Math.sin(t * 0.9) * 0.012 * (0.3 + st.lavora))

    // 3. sguardo: testa, collo e occhi
    let yaw: number
    let pitch: number
    if (st.guarda) {
      _a.copy(st.guarda).sub(this.testaBase)
      yaw = Math.atan2(_a.x, _a.z) - busto
      pitch = -Math.atan2(_a.y, Math.hypot(_a.x, _a.z))
    } else {
      yaw = Math.sin(t * 0.35) * 0.35 + Math.sin(t * 0.13) * 0.12
      pitch = Math.sin(t * 0.5) * 0.04 + 0.02
    }
    const yawTesta = THREE.MathUtils.clamp(yaw, -0.85, 0.85)
    const pitchTesta = THREE.MathUtils.clamp(pitch, -0.35, 0.45)
    this.sguardo.yaw += (yawTesta * 0.85 - this.sguardo.yaw) * k
    this.sguardo.pitch += (pitchTesta * 0.8 - this.sguardo.pitch) * k
    const g = this.sguardo
    // (nel Biped le clavicole sono figlie del collo: si gira solo la testa)
    this.gira(s.get('Head'), 'x', g.pitch)
    this.gira(s.get('Head'), 'y', g.yaw)
    // gli occhi fanno il resto (e qualche piccola saccade)
    const sacc = Math.sin(t * 2.3) > 0.97 ? 0.04 : 0
    const ko = 1 - Math.exp(-dt * 18)
    this.occhi.yaw += (THREE.MathUtils.clamp(yaw - g.yaw, -0.4, 0.4) + sacc - this.occhi.yaw) * ko
    this.occhi.pitch += (THREE.MathUtils.clamp(pitch - g.pitch, -0.3, 0.3) - this.occhi.pitch) * ko
    for (const e of ['LEye', 'REye']) {
      this.gira(s.get(e), 'x', this.occhi.pitch)
      this.gira(s.get(e), 'y', this.occhi.yaw)
    }

    // 4. battitura: mani che si alzano appena, dita che picchiettano
    const lav = st.lavora
    if (lav > 0.001) {
      for (const lato of LATI) {
        const sg = lato === 'L' ? 1 : -1
        const fase = lato === 'L' ? 0 : 1.7
        this.gira(s.get(`${lato}_Hand`), 'x', -Math.max(0, Math.sin(t * 7.3 + fase)) * 0.05 * lav)
        this.gira(s.get(`${lato}_Forearm`), 'y', Math.sin(t * 2.1 + fase) * 0.025 * sg * lav)
        DITA.forEach((f, i) => {
          const p = Math.sin(t * (10 + i * 1.9) + fase * 2 + i * 1.3)
          const colpo = p > 0.55 ? (p - 0.55) * 2.2 : 0
          this.gira(s.get(`${lato}_Finger${f}`), 'flessione', -0.28 * lav + colpo * 0.42 * lav)
        })
      }
    }

    // 5. saluto: avambraccio che oscilla
    if (st.saluto > 0.001) {
      this.gira(s.get('R_Forearm'), 'z', Math.sin(st.salutoDa * 11) * 0.3 * st.saluto)
      this.gira(s.get('R_Hand'), 'z', Math.sin(st.salutoDa * 11 - 0.6) * 0.15 * st.saluto)
    }

    // 6. viso: battito di ciglia, sorriso, labiale
    if (t > this.prossimoBattito) {
      this.battito = t
      this.prossimoBattito = t + 2.2 + ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) % 1 * 4
    }
    const fb = this.battito < 0 ? 1 : (t - this.battito) / 0.17
    const chiuso = fb < 1 ? Math.sin(fb * Math.PI) : 0
    this.imposta('eyeBlinkLeft', chiuso)
    this.imposta('eyeBlinkRight', chiuso)
    const ks = 1 - Math.exp(-dt * 6)
    this.avvicina('mouthSmileLeft', st.sorriso, ks)
    this.avvicina('mouthSmileRight', st.sorriso, ks)
    this.avvicina('browInnerUp', st.parla ? 0.25 + Math.max(0, Math.sin(t * 2.7)) * 0.25 : 0, ks)

    const b = this.bersagliBocca
    if (st.parla) {
      const n = Math.floor(t / 0.11)
      if (n !== this.sillaba) {
        this.sillaba = n
        const r = (((Math.sin(n * 78.233) * 43758.5453) % 1) + 1) % 1
        const pausa = r < 0.12
        b.jaw = pausa ? 0.02 : 0.06 + r * 0.2
        b.aa = r > 0.6 ? 0.32 : 0
        b.O = r > 0.35 && r <= 0.6 ? 0.38 : 0
        b.E = r > 0.12 && r <= 0.35 ? 0.4 : 0
        b.PP = pausa ? 0.5 : 0
        b.U = r > 0.9 ? 0.3 : 0
      }
    } else {
      b.jaw = b.aa = b.O = b.E = b.PP = b.U = 0
    }
    const kb = 1 - Math.exp(-dt * 22)
    this.avvicina('jawOpen', b.jaw, kb)
    this.avvicina('aa', b.aa, kb)
    this.avvicina('O', b.O, kb)
    this.avvicina('E', b.E, kb)
    this.avvicina('PP', b.PP, kb)
    this.avvicina('U', b.U, kb)
  }
}

/** Calcola una volta la posa seduta alla scrivania, con le mani sulla tastiera. */
function posaSeduta(o: Ossa) {
  const radiceBip = o.get('Bip01')
  const testaRiposo = o.get('Head').getWorldQuaternion(new THREE.Quaternion())
  const colloRiposo = o.get('Neck').getWorldQuaternion(new THREE.Quaternion())
  const piedi = LATI.map((l) => o.get(`${l}_Foot`).getWorldQuaternion(new THREE.Quaternion()))
  const altezzaCaviglia = posa(o.get('L_Foot'), new THREE.Vector3()).y

  // 1. bacino giù sulla seduta
  const anche = posa(o.get('L_Thigh'), new THREE.Vector3()).add(posa(o.get('R_Thigh'), new THREE.Vector3())).multiplyScalar(0.5)
  const sposta = MISURE.anca.clone().sub(anche)
  const pb = posa(radiceBip, new THREE.Vector3()).add(sposta)
  radiceBip.parent?.worldToLocal(pb)
  radiceBip.position.copy(pb)
  radiceBip.updateMatrixWorld(true)
  // bacino appena ruotato all'indietro, come chi si appoggia
  ruotaMondo(o.get('Pelvis'), X, -0.03)

  // 2. busto leggermente in avanti verso la scrivania; testa dritta.
  // Nel Biped le cosce sono figlie di "Spine": la Spine si piega prima delle gambe e
  // l'inclinazione si compensa sulle cosce (che poi l'IK riorienta comunque).
  ruotaMondo(o.get('Spine'), X, 0.14)
  ruotaMondo(o.get('Spine1'), X, 0.08)
  ruotaMondo(o.get('Spine2'), X, 0.04)
  orienta(o.get('Neck'), colloRiposo)
  ruotaMondo(o.get('Neck'), X, 0.06)
  orienta(o.get('Head'), testaRiposo)
  ruotaMondo(o.get('Head'), X, 0.05)

  // 3. gambe: cosce orizzontali, ginocchia a ~90°, piedi a terra
  for (const [i, l] of LATI.entries()) {
    const sg = l === 'L' ? 1 : -1
    const anca = posa(o.get(`${l}_Thigh`), new THREE.Vector3())
    const bersaglio = new THREE.Vector3(anca.x + sg * 0.03, altezzaCaviglia, MISURE.caviglia.z)
    ik(o.get(`${l}_Thigh`), o.get(`${l}_Calf`), o.get(`${l}_Foot`), bersaglio, new THREE.Vector3(sg * 0.15, 0.6, 1))
    orienta(o.get(`${l}_Foot`), piedi[i])
    // punte appena aperte verso l'esterno
    ruotaMondo(o.get(`${l}_Foot`), Y, sg * 0.12)
  }


  // 4. braccia: spalle appena in avanti, polsi sulla tastiera, gomiti larghi e bassi
  for (const l of LATI) {
    const sg = l === 'L' ? 1 : -1
    ruotaMondo(o.get(`${l}_Clavicle`), Y, -sg * 0.12)
    ruotaMondo(o.get(`${l}_Clavicle`), Z, sg * -0.04)
    const polso = new THREE.Vector3(sg * MISURE.polso.x, MISURE.polso.y, MISURE.polso.z)
    ik(o.get(`${l}_UpperArm`), o.get(`${l}_Forearm`), o.get(`${l}_Hand`), polso, new THREE.Vector3(sg * 0.7, -0.6, -0.5))
    mani(o, l, new THREE.Vector3(-sg * 0.12, -0.26, 1), new THREE.Vector3(-sg * 0.35, -1, 0.1))
    // dita morbide, leggermente piegate sui tasti
    const { avanti, palmo } = assiMano(o, l)
    const asse = new THREE.Vector3().crossVectors(avanti, palmo).normalize()
    for (const f of DITA) {
      ruotaMondo(o.get(`${l}_Finger${f}`), asse, 0.3)
      ruotaMondo(o.get(`${l}_Finger${f}1`), asse, 0.42)
      ruotaMondo(o.get(`${l}_Finger${f}2`), asse, 0.3)
    }
    if (o.ha(`${l}_Finger0`)) ruotaMondo(o.get(`${l}_Finger0`), asse, 0.15)
  }
}

/** Orienta la mano (avanti e palmo) e passa metà della torsione all'avambraccio. */
function mani(o: Ossa, l: Lato, avanti: THREE.Vector3, palmo: THREE.Vector3) {
  const mano = o.get(`${l}_Hand`)
  const avambraccio = o.get(`${l}_Forearm`)
  const ora = assiMano(o, l)
  // torsione attorno all'asse dell'avambraccio: metà all'avambraccio, il resto al polso
  const asse = posa(mano, new THREE.Vector3()).sub(posa(avambraccio, new THREE.Vector3())).normalize()
  const proietta = (v: THREE.Vector3) => v.clone().sub(asse.clone().multiplyScalar(v.dot(asse))).normalize()
  const da = proietta(ora.palmo)
  const a = proietta(palmo.clone().normalize())
  const angolo = Math.atan2(_c.crossVectors(da, a).dot(asse), da.dot(a))
  ruotaMondo(avambraccio, asse, angolo * 0.5)
  const dopo = assiMano(o, l)
  allinea(mano, dopo.avanti, dopo.palmo, avanti, palmo)
}

/** Posa del braccio destro alzato per salutare (si mescola con la base). */
function posaSaluto(o: Ossa): Map<string, THREE.Quaternion> {
  const catena = ['R_Clavicle', 'R_UpperArm', 'R_Forearm', 'R_Hand']
  const salva = catena.map((n) => o.get(n).quaternion.clone())
  ruotaMondo(o.get('R_Clavicle'), Z, 0.12)
  ik(o.get('R_UpperArm'), o.get('R_Forearm'), o.get('R_Hand'), new THREE.Vector3(-0.27, 1.3, 0.2), new THREE.Vector3(-1, -0.8, -0.1))
  mani(o, 'R', new THREE.Vector3(0, 1, 0.12), new THREE.Vector3(0.1, 0, 1))
  const out = new Map<string, THREE.Quaternion>()
  catena.forEach((n, i) => {
    out.set(n, o.get(n).quaternion.clone())
    o.get(n).quaternion.copy(salva[i])
  })
  o.get('R_Clavicle').updateMatrixWorld(true)
  return out
}
