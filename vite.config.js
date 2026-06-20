import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Keep the existing hand-written public/manifest.json (already linked in index.html).
      manifest: false,
      workbox: {
        // Precache the built app shell so it loads with zero connectivity
        // (out on the links). Firestore traffic is cross-origin and is NOT
        // cached here — offline data is served by Firestore's own IndexedDB cache.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: { host: true },
});
