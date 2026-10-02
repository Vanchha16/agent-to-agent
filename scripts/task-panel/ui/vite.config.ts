import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = fileURLToPath(new URL('.', import.meta.url))

// Builds the AI Studio into scripts/task-panel/dist. The panel server serves only files listed in the
// generated manifest (dist/.vite/manifest.json), so nothing else under dist/ is reachable.
export default defineConfig({
  root: here,
  base: '/',
  cacheDir: fileURLToPath(new URL('../../../.tmp/vite-cache', import.meta.url)),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
    manifest: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    target: 'es2022',
  },
})
