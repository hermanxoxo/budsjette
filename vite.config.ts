import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { pwaPlugin } from './build/pwa-plugin';

/**
 * GitHub Pages serves prosjektsider under /<repo>/, derfor må base settes.
 * Overstyr med miljøvariabelen VITE_BASE (settes automatisk av GitHub Actions).
 */
const base = process.env.VITE_BASE ?? '/budsjette/';

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : base,
  plugins: [react(), pwaPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
        },
      },
    },
  },
  server: { host: true, port: 5173 },
}));
