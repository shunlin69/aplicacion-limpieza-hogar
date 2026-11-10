import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// En GitHub Pages la app vive en /aplicacion-limpieza-hogar/
const base = process.env.GITHUB_ACTIONS ? '/aplicacion-limpieza-hogar/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // Service worker propio (src/sw.ts) para poder recibir notificaciones push
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Casa Limpia',
        short_name: 'Casa Limpia',
        description: 'Turnos de limpieza justos y visibles para toda la familia',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF5EC',
        theme_color: '#FAF5EC',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'] },
      devOptions: { enabled: false },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
})
