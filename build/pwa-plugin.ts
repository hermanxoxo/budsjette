import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Minimal, avhengighetsfri PWA-plugin:
 *  - genererer en service worker med presise precache-filnavn (hashede assets)
 *  - skriver 404.html som kopi av index.html slik at direkte URL-er fungerer på GitHub Pages
 *
 * Service workeren bruker:
 *  - network-first for navigasjon (med offline-fallback til cachet app-shell)
 *  - cache-first for statiske byggede assets (de har innholdshash i filnavnet)
 */
export function pwaPlugin(): Plugin {
  let base = '/';
  let outDir = 'dist';

  return {
    name: 'budsjette-pwa',
    apply: 'build',
    configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`;
      outDir = resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map'))
        .filter((name) => name !== 'sw.js');

      const precache = Array.from(
        new Set([
          base,
          ...files.map((name) => `${base}${name}`),
          `${base}manifest.webmanifest`,
          `${base}icons/icon-192.png`,
          `${base}icons/icon-512.png`,
        ]),
      );

      const version = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(version, base, precache),
      });

    },
    // index.html ferdigstilles etter generateBundle, derfor kopieres 404.html her.
    closeBundle() {
      const index = resolve(outDir, 'index.html');
      if (existsSync(index)) copyFileSync(index, resolve(outDir, '404.html'));
    },
  };
}

function serviceWorkerSource(version: string, base: string, precache: string[]): string {
  return `/* Autogenerert av build/pwa-plugin.ts - ikke rediger manuelt. */
const VERSION = '${version}';
const CACHE = 'budsjette-' + VERSION;
const BASE = '${base}';
const SHELL = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('budsjette-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigasjon: prøv nett, fall tilbake til cachet app-shell (offline-støtte).
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(BASE, fresh.clone());
          return fresh;
        } catch (err) {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(BASE)) ||
            (await cache.match(BASE + 'index.html')) ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }
      })(),
    );
    return;
  }

  // Statiske assets: cache-first (filnavn inneholder innholdshash).
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && (res.type === 'basic' || res.type === 'default')) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response('', { status: 504 });
      }
    })(),
  );
});
`;
}
