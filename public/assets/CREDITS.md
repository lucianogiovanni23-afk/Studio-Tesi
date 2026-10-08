
## Materiali dell'ufficio (`materiali/`)

- `rovere_colore.jpg`, `rovere_colore_512.jpg`, `rovere_ruvidezza.jpg`, `rovere_normale.jpg`:
  ricavati da `examples/textures/hardwood2_diffuse.jpg`, `hardwood2_roughness.jpg` e
  `hardwood2_bump.jpg` del repository three.js (https://github.com/mrdoob/three.js),
  licenza MIT. Ridimensionati a 1024×512 / 512×256; la normal map è calcolata dalla bump.
- `resina_*`, `pelle_*`, `tessuto_*`, `metallo_*`: texture procedurali generate per questo
  progetto (rumore periodico e Voronoi), nessuna licenza di terzi.
- `lut_contrasto_caldo.png` (warm-contrast): LUT dal repository pmndrs/drei-assets (https://github.com/pmndrs/drei-assets, cartella `lut/`),
  che le attribuisce a RocketStock "35 Free LUTs for Color Grading" (gratuite, anche per
  uso commerciale).

## Persone dell'ufficio (`persone/`)

- `lettore.glb`, `bibliotecario.glb`, `scrittore.glb`, `revisore.glb` (e le varianti
  `-ridotta.glb` con texture a 512 px): avatar **Microsoft Rocketbox**
  (https://github.com/microsoft/Microsoft-Rocketbox), licenza **MIT**, © Microsoft Corporation.
  Modelli usati: `Professions/Business_Female_02` (Lettrice), `Business_Male_02` (Bibliotecario),
  `Business_Male_05` (Scrittore), `Business_Female_01` (Revisore), versione `_facial.fbx`
  con blendshape. Convertiti con `scripts/avatar.mjs` (FBX2glTF, glTF-Transform, sharp):
  texture ridotte a 1024/512 px in WebP, ruvidezza ricavata dalla mappa speculare,
  12 blendshape tenute su 175, geometria compressa con meshopt.
- `lettore.webp`, `bibliotecario.webp`, `scrittore.webp`, `revisore.webp`: ritratti resi
  offline con three.js dagli stessi avatar (stessa licenza MIT).

## Campagna fuori dalla vetrata (`esterno/`)

- `erba-1024.jpg`, `erba-512.jpg`: `examples/textures/terrain/grasslight-big.jpg` del repository
  three.js (https://github.com/mrdoob/three.js), da OpenGameArt ("Dark grass",
  https://opengameart.org/content/dark-grass), licenza **CC BY 3.0**. Ridimensionata; nello
  shader se ne usa soprattutto la luminanza come dettaglio.
- `acqua-normali.jpg`: `examples/textures/waternormals.jpg` di three.js, licenza MIT (512 px).
- `luna.jpg`: `examples/textures/planets/moon_1024.jpg` di three.js, licenza MIT (512×256).
- `corteccia.jpg`, `corteccia-n.jpg`: corteccia "willow" di **@dgreenheck/ez-tree**
  (https://github.com/dgreenheck/ez-tree, licenza MIT; in origine Poly Haven
  `bark_willow_02`, CC0), resa grigia come quella dell'ulivo e ridotta a 512/256 px.
- `olivi-vicini.glb`, `olivi-medi.glb`: ulivi generati offline con **@dgreenheck/ez-tree**
  (MIT) con parametri da ulivo (tronco corto e contorto, chioma larga), compressi con meshopt
  (glTF-Transform). `olivi-lontani.webp`: immagini degli stessi alberi rese con three.js.
- `foglie.webp` (rametto d'ulivo), `pietra.jpg` (muretto a secco), `nuvole.webp` (rumore
  frattale per le nuvole): generate proceduralmente per questo progetto, nessuna licenza di terzi.
- Codice: il cielo usa `Sky.js` di three.js (modello di Preetham, MIT); il mare
  (`src/scene/esterno/Acqua.ts`) è un adattamento di `Water.js` di three.js (MIT).

## Intestazioni di pagina (`intestazioni/`)

- `uliveto.webp`, `scaffali.webp`, `scrivania.webp`, `lente.webp`, `ingranaggi.webp`, `chat.webp`:
  render della scena 3D dell'ufficio di questa stessa app (avatar, materiali e campagna
  descritti sopra), catturati nel browser e convertiti in WebP con sharp. Nessuna licenza di terzi
  oltre a quelle dei materiali già elencati.
