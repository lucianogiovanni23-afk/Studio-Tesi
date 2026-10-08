#!/usr/bin/env node
/**
 * avatar.mjs — Microsoft Rocketbox avatar (FBX) → GLB leggero per l'ufficio 3D.
 *
 * Uso:
 *   node scripts/avatar.mjs --rocketbox <cartella Assets/Avatars> [--tools <dir>] [--out public/assets/persone] [--solo lettore,revisore]
 *
 * Dipendenze (non stanno nel package.json del sito, servono solo offline):
 *   npm i --prefix <dir> @gltf-transform/cli fbx2gltf sharp
 *   e poi passa --tools <dir> (oppure AVATAR_TOOLS=<dir>).
 *   I sorgenti: git clone https://github.com/microsoft/Microsoft-Rocketbox (licenza MIT).
 *
 * Cosa fa, per ogni persona della tabella PERSONE:
 *   1. FBX2glTF converte <Avatar>/Export/<Avatar>_facial.fbx (la versione con le blendshape).
 *      Gli FBX Rocketbox sono in METRI, Z-up: FBX2glTF mette sul nodo della mesh una
 *      rotazione di -90° su X, quindi nel GLB la persona è alta ~1,73 m, Y-up, guarda +Z,
 *      con i piedi a y=0. Lo scheletro è il Biped di 3ds Max: "Bip01", "Bip01 Pelvis",
 *      "Bip01 Spine/Spine1/Spine2", "Bip01 Neck", "Bip01 Head", "Bip01 L Clavicle",
 *      "Bip01 L UpperArm/Forearm/Hand", "Bip01 L Finger0..4[1,2]", "Bip01 L Thigh/Calf/Foot/Toe0",
 *      più le ossa del viso ("Bip01 MJaw", "Bip01 LEyeBlinkTop", …). three.js toglie gli spazi
 *      dai nomi dei nodi: a runtime diventano "Bip01_L_UpperArm" ecc.
 *   2. Le texture (TGA 2048 px, non trovate da FBX2glTF) si collegano a mano in base al nome
 *      del materiale: <id>_body e <id>_head → colore + normal + roughness (ricavata dalla
 *      mappa speculare); <id>_opacity (capelli, ciglia) → colore RGBA in alpha test (MASK);
 *      <id>_glasses → RGBA in BLEND. Ridimensionate a --size (1024; 512 per la variante
 *      "-ridotta") e salvate in WebP (EXT_texture_webp).
 *   3. Si buttano COLOR_0 e l'animazione vuota; delle 175 blendshape (in ordine: AA_VI_* visemi,
 *      AK_* ARKit, AU_* FACS, HB_*, SR_*, _Neutral) si tengono solo quelle in MORPH_TENUTE, con
 *      i nomi in mesh.extras.targetNames (three.js → morphTargetDictionary). La primitiva del
 *      corpo, che non ha deformazioni facciali, va in una mesh a parte senza morph target.
 *   4. prune + dedup + weld + meshopt (EXT_meshopt_compression + KHR_mesh_quantization).
 *
 * Uscita: <out>/<chiave>.glb e <out>/<chiave>-ridotta.glb.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PERSONE = {
  lettore: 'Business_Female_02',
  bibliotecario: 'Business_Male_02',
  scrittore: 'Business_Male_05',
  revisore: 'Business_Female_01',
}

/** Indici delle blendshape Rocketbox (ordine dell'FBX) → nome tenuto nel GLB. */
const MORPH_TENUTE = {
  1: 'PP',
  2: 'FF',
  10: 'aa',
  11: 'E',
  13: 'O',
  14: 'U',
  17: 'browInnerUp',
  23: 'eyeBlinkLeft',
  24: 'eyeBlinkRight',
  39: 'jawOpen',
  58: 'mouthSmileLeft',
  59: 'mouthSmileRight',
}
const NUMERO_BLENDSHAPE = 175

// ---------------------------------------------------------------- argomenti
const arg = (nome, base) => {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : base
}
const ROCKETBOX = arg('rocketbox', process.env.ROCKETBOX)
const TOOLS = path.resolve(arg('tools', process.env.AVATAR_TOOLS ?? '.avatar-tools'))
const OUT = path.resolve(arg('out', 'public/assets/persone'))
const SOLO = arg('solo', '')?.split(',').filter(Boolean)
if (!ROCKETBOX) {
  console.error('Manca --rocketbox <cartella Assets/Avatars di Microsoft-Rocketbox>')
  process.exit(1)
}

const richiedi = createRequire(path.join(TOOLS, 'package.json'))
const carica = async (m) => import(pathToFileURL(richiedi.resolve(m)).href)
const { NodeIO } = await carica('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTTextureWebP, EXTMeshoptCompression } = await carica('@gltf-transform/extensions')
const { prune, dedup, weld, meshopt } = await carica('@gltf-transform/functions')
const { MeshoptEncoder, MeshoptDecoder } = await carica('meshoptimizer')
const sharp = (await carica('sharp')).default
const FBX2GLTF = path.join(path.dirname(richiedi.resolve('fbx2gltf/package.json')), 'bin', os.platform() === 'darwin' ? 'Darwin' : 'Linux', 'FBX2glTF')

// ---------------------------------------------------------------- TGA
/** Lettore TGA minimo (truecolor 24/32 bit, anche RLE) → { data RGBA, width, height }. */
function leggiTga(file) {
  const b = fs.readFileSync(file)
  const idLen = b[0]
  const tipo = b[2]
  const w = b.readUInt16LE(12)
  const h = b.readUInt16LE(14)
  const bpp = b[16]
  const desc = b[17]
  if (tipo !== 2 && tipo !== 10) throw new Error(`${file}: TGA tipo ${tipo} non gestito`)
  const px = bpp / 8
  const out = Buffer.alloc(w * h * 4)
  let p = 18 + idLen + (b[1] ? b.readUInt16LE(5) * Math.ceil(b[7] / 8) : 0)
  let i = 0
  const scrivi = (o) => {
    out[i * 4] = b[o + 2]
    out[i * 4 + 1] = b[o + 1]
    out[i * 4 + 2] = b[o]
    out[i * 4 + 3] = px === 4 ? b[o + 3] : 255
    i++
  }
  if (tipo === 2) {
    for (; i < w * h; ) scrivi(p + i * px)
  } else {
    while (i < w * h) {
      const c = b[p++]
      const n = (c & 0x7f) + 1
      if (c & 0x80) {
        for (let k = 0; k < n; k++) scrivi(p)
        p += px
      } else {
        for (let k = 0; k < n; k++) scrivi(p + k * px)
        p += n * px
      }
    }
  }
  // origine in basso a sinistra (bit 5 a zero): capovolgi le righe
  if (!(desc & 0x20)) {
    const riga = w * 4
    const tmp = Buffer.alloc(riga)
    for (let y = 0; y < h / 2; y++) {
      const a = y * riga
      const z = (h - 1 - y) * riga
      out.copy(tmp, 0, a, a + riga)
      out.copy(out, a, z, z + riga)
      tmp.copy(out, z)
    }
  }
  return { data: out, width: w, height: h, alfa: px === 4 }
}

async function webp(file, lato, { alfa = false, qualita = 82, trasforma } = {}) {
  const t = leggiTga(file)
  if (trasforma) trasforma(t.data)
  let img = sharp(t.data, { raw: { width: t.width, height: t.height, channels: 4 } })
  const scala = Math.min(1, lato / Math.max(t.width, t.height))
  img = img.resize(Math.round(t.width * scala), Math.round(t.height * scala), { kernel: 'lanczos3' })
  if (!alfa) img = img.removeAlpha()
  return img.webp({ quality: qualita, alphaQuality: 90, effort: 6 }).toBuffer()
}

/** Speculare (grigio) → texture metallicRoughness glTF: G = ruvidità, B = metallo (0). */
const daSpeculare = (pelle) => (d) => {
  for (let i = 0; i < d.length; i += 4) {
    const s = d[i] / 255
    const r = Math.min(0.95, Math.max(pelle ? 0.38 : 0.45, 0.92 - s * (pelle ? 1.1 : 0.9)))
    d[i] = 255
    d[i + 1] = Math.round(r * 255)
    d[i + 2] = 0
  }
}

// ---------------------------------------------------------------- conversione
async function converti(chiave, avatar, lato, suffisso) {
  const dir = path.join(ROCKETBOX, 'Professions', avatar)
  const dirAlt = fs.existsSync(dir) ? dir : path.join(ROCKETBOX, avatar)
  const fbx = path.join(dirAlt, 'Export', `${avatar}_facial.fbx`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-'))
  execFileSync(FBX2GLTF, ['-b', '-i', fbx, '-o', path.join(tmp, 'grezzo')], { stdio: 'pipe' })
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
  const doc = await io.read(path.join(tmp, 'grezzo.glb'))
  fs.rmSync(tmp, { recursive: true, force: true })
  const root = doc.getRoot()
  const buffer = root.listBuffers()[0]
  doc.createExtension(EXTTextureWebP).setRequired(true)
  const tex = (nome) => path.join(dirAlt, 'Textures', nome)
  const texture = (nome, dati) => doc.createTexture(nome).setImage(dati).setMimeType('image/webp').setURI(`${nome}.webp`)

  // --- materiali e texture
  for (const mat of root.listMaterials()) {
    const nome = mat.getName()
    const id = nome.replace(/_(body|head|opacity|glasses)$/, '')
    const parte = nome.slice(id.length + 1)
    mat.setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setEmissiveFactor([0, 0, 0])
    if (parte === 'body' || parte === 'head') {
      const pelle = parte === 'head'
      mat.setBaseColorTexture(texture(`${parte}_color`, await webp(tex(`${id}_${parte}_color.tga`), lato)))
      mat.setNormalTexture(texture(`${parte}_normal`, await webp(tex(`${id}_${parte}_normal.tga`), lato, { qualita: 88 })))
      if (fs.existsSync(tex(`${id}_${parte}_specular.tga`))) {
        mat.setMetallicRoughnessTexture(
          texture(`${parte}_rough`, await webp(tex(`${id}_${parte}_specular.tga`), lato / 2, { trasforma: daSpeculare(pelle), qualita: 80 })),
        )
        mat.setRoughnessFactor(1)
      } else mat.setRoughnessFactor(pelle ? 0.6 : 0.8)
      mat.setAlphaMode('OPAQUE')
    } else if (parte === 'opacity') {
      mat.setBaseColorTexture(texture('capelli', await webp(tex(`${id}_opacity_color.tga`), lato, { alfa: true })))
      mat.setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true).setRoughnessFactor(0.62)
    } else if (parte === 'glasses') {
      const f = tex(`${id}_glasses_opacity_color.tga`)
      mat.setBaseColorTexture(texture('occhiali', await webp(f, 512, { alfa: true, qualita: 88 })))
      const n = tex(`${id}_glasses_normal.tga`)
      if (fs.existsSync(n)) mat.setNormalTexture(texture('occhiali_normal', await webp(n, 512, { qualita: 88 })))
      mat.setAlphaMode('BLEND').setDoubleSided(true).setRoughnessFactor(0.18)
    }
  }

  // --- mesh: via COLOR_0, morph target ridotti, corpo separato
  const tenuti = Object.keys(MORPH_TENUTE).map(Number)
  const nomi = Object.values(MORPH_TENUTE)
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const corpo = doc.createMesh('corpo')
    for (const prim of mesh.listPrimitives()) {
      prim.setAttribute('COLOR_0', null)
      const targets = prim.listTargets()
      if (targets.length !== NUMERO_BLENDSHAPE) throw new Error(`${avatar}: ${targets.length} blendshape, attese ${NUMERO_BLENDSHAPE}`)
      targets.forEach((t, i) => {
        if (tenuti.includes(i)) t.setName(MORPH_TENUTE[i])
        else prim.removeTarget(t)
      })
      const nomeMat = prim.getMaterial()?.getName() ?? ''
      if (nomeMat.endsWith('_body')) {
        for (const t of prim.listTargets()) prim.removeTarget(t)
        mesh.removePrimitive(prim)
        corpo.addPrimitive(prim)
      }
    }
    mesh.setName('testa').setWeights(nomi.map(() => 0)).setExtras({ targetNames: nomi })
    if (corpo.listPrimitives().length) {
      const n2 = doc
        .createNode('corpo')
        .setMesh(corpo)
        .setSkin(node.getSkin())
        .setTranslation(node.getTranslation())
        .setRotation(node.getRotation())
        .setScale(node.getScale())
      for (const scena of root.listScenes()) if (scena.listChildren().includes(node)) scena.addChild(n2)
      node.listParents().forEach((p) => {
        if (p.propertyType === 'Node') p.addChild(n2)
      })
    }
    node.setName('testa')
  }
  for (const a of root.listAnimations()) a.dispose()
  for (const t of root.listTextures()) if (!t.getImage()) t.dispose()

  await doc.transform(
    prune({ keepAttributes: false }),
    dedup(),
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
  for (const b of root.listBuffers()) if (b !== buffer) b.dispose()
  const file = path.join(OUT, `${chiave}${suffisso}.glb`)
  fs.mkdirSync(OUT, { recursive: true })
  await io.write(file, doc)
  console.log(`${file}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`)
}

for (const [chiave, avatar] of Object.entries(PERSONE)) {
  if (SOLO?.length && !SOLO.includes(chiave)) continue
  await converti(chiave, avatar, 1024, '')
  await converti(chiave, avatar, 512, '-ridotta')
}
