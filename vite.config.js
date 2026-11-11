import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Vite doesn't put .env into process.env for the config, so load it here.
// WEB_PORT lets local dev avoid port 5000 (taken by macOS AirPlay Receiver).
const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: Number(env.WEB_PORT) || 5000,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Moim — Family',
        short_name: 'Moim',
        description: 'Our family contacts, news and messages.',
        theme_color: '#1f5eea',
        background_color: '#f5f7fb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Push + notification-click handlers live in this file.
        importScripts: ['push-sw.js'],
        // A new build takes over open app windows immediately (the page then reloads onto it).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      devOptions: { enabled: true, type: 'classic' },
    }),
  ],
});
