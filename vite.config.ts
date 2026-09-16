import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Percorsi relativi: il sito funziona sia su localhost sia in una
  // sottocartella come quella di GitHub Pages (/Studio-Tesi/).
  base: './',
})
