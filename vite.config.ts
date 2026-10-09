import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { port: 5173, proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } } },
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
    manifest: {
      name: 'Scarlet Seal', short_name: 'Scarlet Seal',
      description: 'A quick game of deduction, risk, and royal intrigue.',
      theme_color: '#a51d35', background_color: '#f3e6d0', display: 'standalone',
      orientation: 'portrait-primary', start_url: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    },
    workbox: { navigateFallbackDenylist: [/^\/socket\.io/] }
  })]
});
