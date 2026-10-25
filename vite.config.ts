import { fileURLToPath } from 'node:url'
import {existsSync} from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define:{'import.meta.env.VITE_PERK_ART':JSON.stringify(existsSync(fileURLToPath(new URL('./public/perks/perks.png',import.meta.url)))?'true':'false')},
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5741,
    strictPort: true,
    // The attestation server (npm run server:build, then node server-dist/attest.mjs) when it runs locally.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  preview: {
    host: '0.0.0.0',
    port: 5741,
  },
})
