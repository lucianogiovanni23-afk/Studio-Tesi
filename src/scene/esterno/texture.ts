import * as THREE from 'three'

/** Imposta ripetizione e spazio colore appena la texture è caricata. */
export function prepara(colore: boolean, ripeti = true, anisotropia = 1) {
  return (t: THREE.Texture | THREE.Texture[]) => {
    for (const x of Array.isArray(t) ? t : [t]) {
      if (ripeti) x.wrapS = x.wrapT = THREE.RepeatWrapping
      if (colore) x.colorSpace = THREE.SRGBColorSpace
      x.anisotropy = anisotropia
    }
  }
}
