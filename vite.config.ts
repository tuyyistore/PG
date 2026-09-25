import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// Vite config — https://vitejs.dev/config/
// Siap deploy ke Vercel (dan tetap kompatibel dengan preview lokal / Figma Make).
export default defineConfig(({ mode }) => {
  // Sourcemap hanya untuk build `--mode development` (preview Figma).
  const emitSourcemaps = mode === 'development'

  // Di Vercel base HARUS '/'. FIGMA_PUBLIC_URL hanya dipakai di luar Vercel.
  const base =
    !process.env.VERCEL && process.env.FIGMA_PUBLIC_URL ? `${process.env.FIGMA_PUBLIC_URL}/` : '/'

  return {
    base,
    build: {
      outDir: 'dist',
      sourcemap: emitSourcemaps ? 'inline' : false,
      minify: !emitSourcemaps,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
      strictPort: true,
    },
    preview: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
    },
  }
})
