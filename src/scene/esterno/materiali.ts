import * as THREE from 'three'
import { LUCE, RUMORE } from './glsl'
import { uniformiCielo } from './atmosfera'
import { FACCIATA_Z, FINE_GIARDINO } from './terreno'

/**
 * Materiali dell'esterno: tutti illuminati dal sole/luna e dal cielo (non
 * dalle lampade della sala) e immersi nella foschia della distanza.
 */

const tonemap = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

export function materialeTerreno(erba: THREE.Texture, oliviFino: number, stagione = 3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'TerrenoEsterno',
    uniforms: { ...uniformiCielo, uErba: { value: erba }, uOliviFino: { value: oliviFino } },
    defines: { STAGIONE: stagione },
    vertexShader: /* glsl */ `
      attribute vec4 aTipo;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec4 vTipo;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normal;
        vTipo = aTipo;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uErba;
      uniform float uOliviFino;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec4 vTipo;
      ${LUCE}
      ${RUMORE}
      // chiome degli uliveti lontani, oltre gli alberi veri: puntini in filari che
      // da lontano si fondono nella loro media (niente sfarfallio)
      float filari(vec2 p) {
        vec2 q = p / 7.2;
        vec2 c = fract(q) - 0.5;
        float w = max(fwidth(q.x), fwidth(q.y));
        float punto = 1.0 - smoothstep(0.3 - w, 0.3 + w, length(c));
        return mix(punto, 0.28, clamp(w * 1.4, 0.0, 1.0));
      }
      float stradaX(float d) { return -16.0 - 0.22 * d + 20.0 * sin(d / 65.0 + 0.4); }
      void main() {
        vec3 n = normalize(vNormal);
        float d = ${FACCIATA_Z.toFixed(1)} - vWorld.z;
        float dist = length(vWorld - cameraPosition);
        vec3 t1 = texture2D(uErba, vWorld.xz / 5.0).rgb;
        vec3 t2 = texture2D(uErba, vWorld.xz / 31.0).rgb;
        float l1 = dot(t1, vec3(0.3, 0.59, 0.11));
        float l2 = dot(t2, vec3(0.3, 0.59, 0.11));
        float dett = mix(l1, l2, smoothstep(30.0, 160.0, dist));
        dett = mix(dett, 0.38, smoothstep(250.0, 900.0, dist));
        float macchie = fbm(vWorld.xz / 23.0);
        float grandi = fbm(vWorld.xz / 160.0 + 3.0);

        // erba secca d'autunno, a chiazze verdi; terra rossastra sotto gli ulivi
        vec3 secca = mix(vec3(0.33, 0.28, 0.16), vec3(0.42, 0.36, 0.22), macchie);
        vec3 verde = mix(vec3(0.14, 0.17, 0.07), vec3(0.22, 0.24, 0.11), macchie);
        vec3 terra = mix(vec3(0.27, 0.18, 0.11), vec3(0.34, 0.25, 0.16), macchie);
        vec3 arato = mix(vec3(0.24, 0.16, 0.10), vec3(0.30, 0.21, 0.13), fbm(vWorld.xz / 6.0));
        #if STAGIONE == 0
          // inverno: dopo le piogge l'erba torna verde
          secca = mix(secca, verde * 1.2, 0.55);
        #elif STAGIONE == 1
          // primavera: prati verdi e pieni
          secca = mix(secca, verde * 1.45, 0.75);
          verde *= 1.15;
        #elif STAGIONE == 2
          // estate: erba secca e dorata
          secca = mix(vec3(0.46, 0.38, 0.19), vec3(0.58, 0.48, 0.26), macchie);
          verde = mix(verde, secca, 0.7);
        #endif
        // sotto gli ulivi: terra con erba rada
        vec3 uliveto = mix(terra, mix(secca, verde, 0.35), smoothstep(0.35, 0.75, macchie) * 0.8);
        vec3 alb = uliveto * vTipo.x + secca * vTipo.y + mix(verde, secca, 0.35) * vTipo.z + arato * vTipo.w;
        alb = mix(alb, alb * vec3(1.08, 1.0, 0.85), grandi);
        // macchia mediterranea: cespugli scuri sparsi fuori dagli uliveti, più fitti sui pendii
        float cespugli = smoothstep(0.58, 0.72, fbm(vWorld.xz / 9.0 + grandi * 3.0)) * (1.0 - vTipo.x * 0.7) * smoothstep(20.0, 80.0, d);
        alb = mix(alb, vec3(0.08, 0.1, 0.05), cespugli * 0.8);
        // uliveti lontani
        float bosco = vTipo.x * smoothstep(uOliviFino - 140.0, uOliviFino - 20.0, d) * filari(vWorld.xz);
        alb = mix(alb, vec3(0.11, 0.13, 0.08), bosco * 0.9);

        // giardino: prato curato ma non irrigato
        float giardino = 1.0 - smoothstep(${(FINE_GIARDINO - 0.6).toFixed(1)}, ${FINE_GIARDINO.toFixed(1)}, d);
        vec3 prato = mix(vec3(0.15, 0.18, 0.08), vec3(0.27, 0.26, 0.13), smoothstep(0.3, 0.8, macchie));
        #if STAGIONE == 0
          prato = mix(prato, vec3(0.13, 0.19, 0.08), 0.5);
        #elif STAGIONE == 1
          prato = mix(vec3(0.13, 0.21, 0.06), vec3(0.2, 0.27, 0.09), smoothstep(0.3, 0.8, macchie));
        #elif STAGIONE == 2
          prato = mix(prato, vec3(0.44, 0.37, 0.2), 0.65);
        #endif
        alb = mix(alb, prato, giardino);
        #if STAGIONE == 1
          // fiori di campo: puntini gialli, bianchi e rossi, solo vicino
          vec2 qf = vWorld.xz * 8.0;
          float hf = hash12(floor(qf));
          float fiore = step(0.885, hf) * (1.0 - smoothstep(0.16, 0.3, length(fract(qf) - 0.5)));
          fiore *= (1.0 - smoothstep(30.0, 70.0, dist)) * (1.0 - vTipo.w) * (1.0 - smoothstep(0.5, 0.8, 1.0 - n.y));
          vec3 colFiore = hf > 0.965 ? vec3(0.8, 0.12, 0.08) : hf > 0.93 ? vec3(0.95, 0.93, 0.86) : vec3(0.98, 0.8, 0.16);
          alb = mix(alb, colFiore * 1.25, fiore);
        #endif
        // vialetto in ghiaia lungo la facciata
        float vialetto = (1.0 - smoothstep(1.4, 1.7, d)) * step(0.0, d);
        alb = mix(alb, vec3(0.55, 0.50, 0.42) * (0.8 + 0.4 * hash12(floor(vWorld.xz * 40.0))), vialetto);

        // strada sterrata con i solchi delle ruote
        float sx = stradaX(d);
        float off = abs(vWorld.x - sx);
        float strada = (1.0 - smoothstep(1.5, 2.3, off)) * step(13.0, d) * (1.0 - step(760.0, d));
        float solchi = smoothstep(0.25, 0.0, abs(off - 0.8)) * 0.25;
        alb = mix(alb, vec3(0.42, 0.35, 0.26) * (1.0 - solchi), strada);

        // pendii ripidi (salti delle terrazze): terra e pietra a vista
        float ripido = smoothstep(0.55, 0.8, 1.0 - n.y);
        alb = mix(alb, vec3(0.33, 0.27, 0.2), ripido * (1.0 - giardino));

        alb *= 0.62 + 0.9 * dett;
        // piccole ombre di occlusione tra i cespugli
        float ao = 0.75 + 0.25 * smoothstep(0.2, 0.7, macchie);
        vec3 col = illumina(alb, n, ao);
        #if STAGIONE == 0
          col *= vec3(0.93, 0.98, 1.07); // luce d'inverno, più fredda
        #endif
        col = foschia(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${tonemap}
      }
    `,
  })
}

/** Corteccia e foglie degli ulivi, con il vento: chioma che ondeggia e foglie che fremono. */
const VENTO = /* glsl */ `
  uniform float uTempo;
  uniform float uVento;
  vec3 vento(vec3 p, vec3 radice, float altezzaAlbero, float foglia) {
    float fase = radice.x * 0.21 + radice.z * 0.17;
    float k = clamp(p.y / altezzaAlbero, 0.0, 1.5);
    k = k * k;
    float s = sin(uTempo * 0.9 + fase) * 0.6 + sin(uTempo * 1.7 + fase * 1.3) * 0.3;
    vec3 off = vec3(s, 0.0, s * 0.6) * 0.07 * k * uVento;
    off += foglia * vec3(sin(uTempo * 5.3 + p.x * 3.1 + p.y * 2.0), 0.0, cos(uTempo * 4.7 + p.z * 3.3)) * 0.025 * uVento;
    return off;
  }
`

export function materialeCorteccia(mappa: THREE.Texture, normali: THREE.Texture | null): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'CortecciaOlivo',
    uniforms: { ...uniformiCielo, uMappa: { value: mappa }, uNormali: { value: normali } },
    defines: normali ? { USA_NORMALI: '' } : {},
    vertexShader: /* glsl */ `
      ${VENTO}
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 radice = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        wp.xyz += vento(position, radice.xyz, 5.0, 0.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vUv = uv * vec2(1.0, 0.35);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMappa;
      uniform sampler2D uNormali;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${LUCE}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 alb = texture2D(uMappa, vUv).rgb;
        #ifdef USA_NORMALI
          vec3 tn = texture2D(uNormali, vUv).xyz * 2.0 - 1.0;
          n = normalize(n + (tn.x * 0.6) * normalize(cross(n, vec3(0.0, 1.0, 0.0)) + vec3(1e-4)));
        #endif
        alb *= 0.85;
        vec3 col = illumina(alb, n, 0.75);
        col = foschia(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${tonemap}
      }
    `,
  })
}

export function materialeFoglie(mappa: THREE.Texture, stagione = 3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'FoglieOlivo',
    uniforms: { ...uniformiCielo, uMappa: { value: mappa } },
    defines: { STAGIONE: stagione },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${VENTO}
      attribute vec3 aChioma;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vInterno;
      varying vec3 vSeme;
      void main() {
        vec4 radice = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // punto fisso sulla chioma (il vento non lo sposta): fiori e olive restano attaccati
        vSeme = position + radice.xyz * 0.37;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        wp.xyz += vento(position, radice.xyz, 5.0, uv.y);
        vWorld = wp.xyz;
        // normale "a cupola" dal centro della chioma: luce morbida e piena
        vNormal = normalize(mat3(modelMatrix * instanceMatrix) * aChioma);
        vInterno = clamp(length(position.xz) / 3.0, 0.0, 1.0);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMappa;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vInterno;
      varying vec3 vSeme;
      ${LUCE}
      void main() {
        vec4 t = texture2D(uMappa, vUv);
        if (t.a < 0.5) discard;
        vec3 n = normalize(vNormal);
        vec3 alb = t.rgb * vec3(0.78, 0.84, 0.74);
        #if STAGIONE == 1 || STAGIONE == 3
          // primavera: fiorellini color crema; autunno: olive verdi e nere tra le foglie
          vec3 qs = vSeme * (STAGIONE == 1 ? 15.0 : 11.0);
          vec3 cs = floor(qs);
          float hs = fract(sin(dot(cs, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float vicino = 1.0 - smoothstep(32.0, 60.0, length(vWorld - cameraPosition));
          #if STAGIONE == 1
            float macchia = step(0.78, hs) * (1.0 - smoothstep(0.2, 0.36, length(fract(qs) - 0.5))) * vicino;
            alb = mix(alb, vec3(0.95, 0.92, 0.74), macchia);
          #else
            float macchia = step(0.8, hs) * (1.0 - smoothstep(0.24, 0.36, length(fract(qs) - 0.5))) * vicino;
            vec3 oliva = hs > 0.92 ? vec3(0.42, 0.46, 0.12) : hs > 0.86 ? vec3(0.2, 0.06, 0.12) : vec3(0.05, 0.03, 0.05);
            alb = mix(alb, oliva, macchia);
          #endif
        #endif
        float ao = mix(0.55, 1.0, vInterno) * mix(0.7, 1.0, n.y * 0.5 + 0.5);
        vec3 col = illumina(alb, n, ao);
        // luce che passa attraverso le foglie in controluce
        vec3 v = normalize(cameraPosition - vWorld);
        float trasl = pow(max(dot(-v, uSoleDir), 0.0), 4.0);
        col += alb * uSoleColore * trasl * 0.45 * vec3(0.9, 1.0, 0.6);
        #if STAGIONE == 0
          col *= vec3(0.93, 0.98, 1.07);
        #endif
        col = foschia(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${tonemap}
      }
    `,
  })
}

/** Ulivi lontani: un quadrato sempre rivolto verso chi guarda, con l'immagine dell'albero. */
export function materialeImpostori(atlante: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'OliviLontani',
    uniforms: { ...uniformiCielo, uAtlante: { value: atlante } },
    vertexShader: /* glsl */ `
      attribute float aVariante;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vec3 centro = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float s = length((instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vec3 aCam = cameraPosition - centro;
        vec3 destra = normalize(vec3(aCam.z, 0.0, -aCam.x));
        vec3 wp = centro + destra * position.x * 6.4 * s + vec3(0.0, (position.y * 6.4 - 0.4) * s, 0.0);
        vWorld = wp;
        vUv = vec2((uv.x + aVariante) / 3.0, uv.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlante;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${LUCE}
      void main() {
        vec4 t = texture2D(uAtlante, vUv);
        if (t.a < 0.45) discard;
        // l'immagine è già illuminata da una luce bianca: la riporto alla luce del momento
        vec3 alb = mix(vec3(dot(t.rgb, vec3(0.3, 0.59, 0.11))), t.rgb, 0.8) * 0.8;
        vec3 col = alb * (uSoleColore * (0.35 + 0.35 * max(uSoleDir.y, 0.0)) + uAmbCielo * 0.95);
        col = foschia(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${tonemap}
      }
    `,
  })
}

/** Muretti, case: colore per vertice, pietra per i muri, finestre accese di notte. */
export function materialeCostruito(pietra: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'CostruitoEsterno',
    uniforms: { ...uniformiCielo, uPietra: { value: pietra } },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aLuce;
      attribute float aPietra;
      varying vec3 vColore;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vLuce;
      varying float vPietra;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vColore = color;
        vLuce = aLuce;
        vPietra = aPietra;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uPietra;
      varying vec3 vColore;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vLuce;
      varying float vPietra;
      ${LUCE}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 alb = vColore;
        if (vPietra > 0.5) {
          vec2 uv = abs(n.x) > abs(n.z) ? vWorld.zy : vWorld.xy;
          if (abs(n.y) > 0.7) uv = vWorld.xz;
          alb *= texture2D(uPietra, uv / 1.3).rgb * 1.15;
        }
        vec3 col = illumina(alb, n, 0.9);
        // finestre: di notte calde e accese, di giorno vetro scuro
        col = mix(col, vec3(1.0, 0.62, 0.28) * 2.2, vLuce * smoothstep(0.3, 0.8, uNotte));
        col = foschia(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${tonemap}
      }
    `,
  })
}

/** Lucine lontane (paesi, casolari) di notte: punti caldi con alone. */
export function materialeLucine(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'LucineNotte',
    uniforms: { ...uniformiCielo, uScala: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aDim;
      uniform float uScala;
      uniform float uTempo;
      varying float vF;
      void main() {
        vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
        float d = -mv.z;
        gl_PointSize = clamp(aDim * uScala * 900.0 / d, 1.5, 22.0);
        vF = 0.85 + 0.15 * sin(uTempo * 2.0 + position.x);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNotte;
      varying float vF;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        float a = exp(-r * r * 9.0) + exp(-r * 3.5) * 0.25;
        gl_FragColor = vec4(vec3(1.0, 0.66, 0.32) * a * vF * 1.6 * smoothstep(0.3, 0.8, uNotte), 1.0);
      }
    `,
  })
}

/**
 * Reti, cassette e scala della raccolta delle olive: colori per vertice
 * (reti: trama a maglie e olive cadute), con la stessa luce dell'esterno.
 */
export function materialeRaccolta(rete: boolean): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    name: rete ? 'ReteOlive' : 'AttrezziRaccolta',
    uniforms: { ...uniformiCielo },
    vertexColors: true,
    defines: rete ? { RETE: '' } : {},
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vColore;
      varying vec2 vUv;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vColore = color;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vColore;
      varying vec2 vUv;
      ${LUCE}
      ${RUMORE}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 alb = vColore;
        #ifdef RETE
          // bordo irregolare, maglie fitte che da lontano si fondono, olive cadute sopra
          vec2 c = vUv - 0.5;
          float bordo = 0.5 - 0.035 * rumore(vUv * 9.0);
          if (length(c) > bordo) discard;
          vec2 g = abs(fract(vWorld.xz * 22.0) - 0.5);
          float w = max(fwidth(vWorld.x), fwidth(vWorld.z)) * 22.0;
          float filo = smoothstep(0.5 - 0.12 - w, 0.5 - 0.12, max(g.x, g.y));
          filo = mix(filo, 0.45, clamp(w * 1.5, 0.0, 1.0));
          alb *= 0.72 + 0.4 * filo;
          vec2 qo = vWorld.xz * 11.0;
          float ho = hash12(floor(qo));
          float oliva = step(0.8, ho) * (1.0 - smoothstep(0.18, 0.3, length(fract(qo) - 0.5))) * (1.0 - smoothstep(0.15, 0.42, length(c)));
          alb = mix(alb, ho > 0.94 ? vec3(0.28, 0.33, 0.1) : vec3(0.06, 0.04, 0.06), oliva);
        #endif
        vec3 col = illumina(alb, n, 0.85);
        col = foschia(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${tonemap}
      }
    `,
  })
  if (rete) {
    m.polygonOffset = true
    m.polygonOffsetFactor = -3
    m.polygonOffsetUnits = -3
  }
  return m
}
