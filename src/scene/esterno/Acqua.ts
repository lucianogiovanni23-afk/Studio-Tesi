import * as THREE from 'three'
import { LUCE } from './glsl'
import { uniformiCielo } from './atmosfera'

/**
 * Il mare: adattamento di Water.js di three.js (licenza MIT; specchio piano
 * di Slayvin, shader dell'acqua di Stemkoski e 29a.ch). Differenze:
 * - lo specchio ridisegna solo il livello LIVELLO_RIFLESSO (cielo, nuvole,
 *   luna), non la sala: costa poco;
 * - con `specchio: false` (qualità ridotta) niente seconda passata: il
 *   riflesso è il colore del cielo calcolato;
 * - luce, foschia e riflesso della luna seguono le uniform dell'esterno.
 */
export const LIVELLO_RIFLESSO = 3

const vertexShader = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 mirrorCoord;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  mirrorCoord = textureMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D mirrorSampler;
uniform sampler2D normalSampler;
uniform float specchio;
uniform float distortionScale;
uniform vec3 waterColor;
uniform vec3 uZenit;
uniform vec3 uLunaDir;
varying vec4 mirrorCoord;
varying vec3 vWorld;
${LUCE}

vec4 getNoise(vec2 uv) {
  float time = uTempo * 0.55;
  vec2 uv0 = (uv / 103.0) + vec2(time / 17.0, time / 29.0);
  vec2 uv1 = uv / 107.0 - vec2(time / -19.0, time / 31.0);
  vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(time / 101.0, time / 97.0);
  vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(time / 109.0, time / -113.0);
  vec4 noise = texture2D(normalSampler, uv0) + texture2D(normalSampler, uv1) + texture2D(normalSampler, uv2) + texture2D(normalSampler, uv3);
  return noise * 0.5 - 1.0;
}

void main() {
  vec3 worldToEye = cameraPosition - vWorld;
  float distance = length(worldToEye);
  vec3 eyeDirection = worldToEye / distance;
  // onde più fitte vicino, lisce verso l'orizzonte (evita lo sfarfallio)
  vec4 noise = getNoise(vWorld.xz * 0.35);
  float liscio = smoothstep(1500.0, 9000.0, distance);
  vec3 surfaceNormal = normalize(mix(noise.xzy * vec3(1.5, 1.0, 1.5), vec3(0.0, 1.0, 0.0), liscio * 0.75));

  // riflesso del sole (di giorno) o della luna (di notte): una scia sul mare
  vec3 luceDir = normalize(mix(uSoleDir, uLunaDir, step(0.5, uNotte)));
  vec3 riflessa = normalize(reflect(-luceDir, surfaceNormal));
  float dirR = max(0.0, dot(eyeDirection, riflessa));
  vec3 luceCol = uNotte > 0.5 ? vec3(0.9, 0.88, 0.8) * 1.4 : uSoleColore;
  vec3 speculare = (pow(dirR, 260.0) * 6.0 + pow(dirR, 40.0) * 0.35) * luceCol;

  float theta = max(dot(eyeDirection, surfaceNormal), 0.0);
  float reflectance = 0.02 + 0.98 * pow(1.0 - theta, 5.0);
  vec3 cielo;
  if (specchio > 0.5) {
    vec2 distortion = surfaceNormal.xz * (0.001 + 1.0 / distance) * distortionScale;
    cielo = texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion).rgb;
  } else {
    vec3 r = reflect(-eyeDirection, surfaceNormal);
    cielo = mix(uFoschia, uZenit, pow(clamp(r.y, 0.0, 1.0), 0.6));
  }
  vec3 diffusa = waterColor * (uAmbCielo * 0.9 + uSoleColore * max(dot(luceDir, vec3(0.0, 1.0, 0.0)), 0.0) * 0.25);
  vec3 col = mix(diffusa, cielo, clamp(reflectance + 0.12, 0.0, 1.0)) + speculare;
  col = foschia(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export class Acqua extends THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  readonly renderTarget: THREE.WebGLRenderTarget | null

  constructor(geometry: THREE.BufferGeometry, opzioni: { normali: THREE.Texture; specchio: boolean; risoluzione?: number }) {
    const specchio = opzioni.specchio
    const renderTarget = specchio ? new THREE.WebGLRenderTarget(opzioni.risoluzione ?? 512, opzioni.risoluzione ?? 512, { type: THREE.HalfFloatType }) : null
    const textureMatrix = new THREE.Matrix4()
    const material = new THREE.ShaderMaterial({
      name: 'MareShader',
      uniforms: {
        ...uniformiCielo,
        mirrorSampler: { value: renderTarget?.texture ?? null },
        normalSampler: { value: opzioni.normali },
        specchio: { value: specchio ? 1 : 0 },
        distortionScale: { value: 3.2 },
        textureMatrix: { value: textureMatrix },
        waterColor: { value: new THREE.Color(0.012, 0.05, 0.075) },
        uZenit: { value: new THREE.Color() },
      },
      vertexShader,
      fragmentShader,
      fog: false,
    })
    super(geometry, material)
    this.renderTarget = renderTarget
    if (!renderTarget) return

    const mirrorPlane = new THREE.Plane()
    const normal = new THREE.Vector3()
    const mirrorWorldPosition = new THREE.Vector3()
    const cameraWorldPosition = new THREE.Vector3()
    const rotationMatrix = new THREE.Matrix4()
    const lookAtPosition = new THREE.Vector3(0, 0, -1)
    const clipPlane = new THREE.Vector4()
    const view = new THREE.Vector3()
    const target = new THREE.Vector3()
    const q = new THREE.Vector4()
    const mirrorCamera = new THREE.PerspectiveCamera()
    mirrorCamera.layers.set(LIVELLO_RIFLESSO)

    this.onBeforeRender = (renderer, scene, camera) => {
      mirrorWorldPosition.setFromMatrixPosition(this.matrixWorld)
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld)
      rotationMatrix.extractRotation(this.matrixWorld)
      normal.set(0, 0, 1).applyMatrix4(rotationMatrix)
      view.subVectors(mirrorWorldPosition, cameraWorldPosition)
      if (view.dot(normal) > 0) return
      view.reflect(normal).negate().add(mirrorWorldPosition)
      rotationMatrix.extractRotation(camera.matrixWorld)
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition)
      target.subVectors(mirrorWorldPosition, lookAtPosition).reflect(normal).negate().add(mirrorWorldPosition)
      mirrorCamera.position.copy(view)
      mirrorCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal)
      mirrorCamera.lookAt(target)
      mirrorCamera.far = (camera as THREE.PerspectiveCamera).far
      mirrorCamera.updateMatrixWorld()
      mirrorCamera.projectionMatrix.copy(camera.projectionMatrix)
      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      textureMatrix.multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse)
      mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition).applyMatrix4(mirrorCamera.matrixWorldInverse)
      clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant)
      const pm = mirrorCamera.projectionMatrix
      q.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0]
      q.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5]
      q.z = -1
      q.w = (1 + pm.elements[10]) / pm.elements[14]
      clipPlane.multiplyScalar(2 / clipPlane.dot(q))
      pm.elements[2] = clipPlane.x
      pm.elements[6] = clipPlane.y
      pm.elements[10] = clipPlane.z + 1
      pm.elements[14] = clipPlane.w

      const current = renderer.getRenderTarget()
      const xr = renderer.xr.enabled
      const ombre = renderer.shadowMap.autoUpdate
      this.visible = false
      renderer.xr.enabled = false
      renderer.shadowMap.autoUpdate = false
      renderer.setRenderTarget(renderTarget)
      renderer.state.buffers.depth.setMask(true)
      if (renderer.autoClear === false) renderer.clear()
      renderer.render(scene, mirrorCamera)
      this.visible = true
      renderer.xr.enabled = xr
      renderer.shadowMap.autoUpdate = ombre
      renderer.setRenderTarget(current)
      const viewport = (camera as THREE.Camera & { viewport?: THREE.Vector4 }).viewport
      if (viewport !== undefined) renderer.state.viewport(viewport)
    }
  }

  dispose() {
    this.renderTarget?.dispose()
    this.material.dispose()
  }
}
