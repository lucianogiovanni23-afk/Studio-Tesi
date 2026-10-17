import react from '@vitejs/plugin-react'
import { createReadStream, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Lettura delle immagini (OCR) dei PDF scansionati: lavoratore e motore di
 * tesseract.js e le lingue italiano e inglese (modelli "best_int") presi dai
 * pacchetti npm e serviti dall'app in assets/ocr/, senza CDN: dopo la prima
 * lettura funziona anche offline. Non si copiano in public/ (16 MB nel
 * repository): li aggiunge la build e, in sviluppo, li serve Vite.
 */
function risorseOcr(): Plugin {
  const richiedi = createRequire(import.meta.url)
  const pacchetto = (nome: string) => dirname(richiedi.resolve(`${nome}/package.json`))
  const core = pacchetto('tesseract.js-core')
  const file: [string, string][] = [
    ['worker.min.js', join(pacchetto('tesseract.js'), 'dist/worker.min.js')],
    // Il lavoratore sceglie da solo la versione del motore adatta al dispositivo (solo LSTM).
    ['tesseract-core-relaxedsimd-lstm.wasm.js', join(core, 'tesseract-core-relaxedsimd-lstm.wasm.js')],
    ['tesseract-core-simd-lstm.wasm.js', join(core, 'tesseract-core-simd-lstm.wasm.js')],
    ['tesseract-core-lstm.wasm.js', join(core, 'tesseract-core-lstm.wasm.js')],
    ['lang/ita.traineddata.gz', join(pacchetto('@tesseract.js-data/ita'), '4.0.0_best_int/ita.traineddata.gz')],
    ['lang/eng.traineddata.gz', join(pacchetto('@tesseract.js-data/eng'), '4.0.0_best_int/eng.traineddata.gz')],
  ]
  return {
    name: 'studio-tesi-ocr',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const voce = file.find(([nome]) => req.url?.split('?')[0].endsWith(`/assets/ocr/${nome}`))
        if (!voce) return next()
        res.setHeader('Content-Type', voce[0].endsWith('.gz') ? 'application/gzip' : 'text/javascript')
        createReadStream(voce[1]).pipe(res)
      })
    },
    generateBundle() {
      for (const [nome, sorgente] of file) this.emitFile({ type: 'asset', fileName: `assets/ocr/${nome}`, source: readFileSync(sorgente) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    risorseOcr(),
    // App installabile (iPad: Condividi › Aggiungi alla schermata Home) e
    // utilizzabile anche senza rete dopo la prima visita.
    VitePWA({
      registerType: 'prompt',
      // La registrazione la fa il componente AvvisoAggiornamento.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Studio tesi',
        short_name: 'Studio tesi',
        description: 'Ricerca e stesura della tesi: olio e meteo in Calabria.',
        lang: 'it',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#fffdf8',
        background_color: '#f7f2e6',
        icons: [
          { src: 'icona-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icona-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icona-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icona-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Guscio dell'app e tutto il codice (anche le schermate caricate dopo e
        // il worker di pdf.js), così l'app si apre anche senza rete.
        globPatterns: ['**/*.{js,mjs,css,html}', '*.{svg,png}'],
        // I file dell'OCR (circa 16 MB) non si scaricano in anticipo: si salvano la prima volta che servono.
        globIgnores: ['assets/**/*.{png,jpg,jpeg,webp,glb,gltf,hdr,ktx2}', 'assets/ocr/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Modelli 3D, texture, ritratti e illustrazioni: si salvano alla
            // prima visita e poi arrivano dal dispositivo.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\/assets\/.+\.(?:glb|gltf|bin|png|jpe?g|webp|avif|hdr|exr|ktx2|basis|svg|mp3|ogg|wav)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'studio-risorse',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Lettura delle immagini (OCR): lavoratore, motore e lingue, salvati al primo uso.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/ocr\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'studio-ocr',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'studio-caratteri',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Claude, GitHub e i cataloghi accademici: sempre dalla rete, mai dalla cache.
            urlPattern: ({ url }) =>
              /(^|\.)(anthropic\.com|github\.com|githubusercontent\.com|crossref\.org|openalex\.org|semanticscholar\.org)$/.test(url.hostname),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  // Percorsi relativi: il sito funziona sia su localhost sia in una
  // sottocartella come quella di GitHub Pages (/Studio-Tesi/).
  base: './',
  worker: { format: 'es' },
  build: {
    // Il pezzo più grande è three.js (~360 kB gzip): si scarica solo con l'ufficio 3D
    // e resta in cache; tutto il resto dell'app sta sotto i 500 kB.
    chunkSizeWarningLimit: 1300,
    rolldownOptions: {
      output: {
        // Librerie in pezzi separati: restano in cache fra un aggiornamento e l'altro.
        codeSplitting: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler|zustand|idb-keyval)[\\/]/, priority: 20 },
            {
              name: 'three',
              test: /[\\/]node_modules[\\/](three|three-stdlib|@react-three|postprocessing|@monogrid|three-mesh-bvh|troika-[^\\/]+|camera-controls|maath|meshline|stats-gl|its-fine|react-reconciler|suspend-react|@use-gesture|fflate|@dgreenheck)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
