import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  root: 'dev',
  publicDir: '../public',
  resolve: {
    alias: {
      $components: resolve(__dirname, 'src/components'),
      $tokens: resolve(__dirname, 'src/tokens'),
      'next-themes': resolve(__dirname, 'playwright/mocks/next-themes.tsx'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: resolve(__dirname, 'tailwind.config.ts') }), autoprefixer()],
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
