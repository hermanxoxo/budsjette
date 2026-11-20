import { useCallback, useEffect, useState } from 'react';

/**
 * Enkel hash-basert ruting. Hash brukes bevisst: da fungerer direktelenker
 * og oppdatering av siden på GitHub Pages uten serverkonfigurasjon.
 */

export const ROUTES = ['oversikt', 'historikk', 'analyse', 'budsjett', 'innstillinger'] as const;
export type Route = (typeof ROUTES)[number];

const DEFAULT_ROUTE: Route = 'oversikt';

function parseHash(hash: string): { route: Route; isNew: boolean } {
  const clean = hash.replace(/^#\/?/u, '').split('?')[0];
  if (clean === 'ny') return { route: DEFAULT_ROUTE, isNew: true };
  const match = ROUTES.find((r) => r === clean);
  return { route: match ?? DEFAULT_ROUTE, isNew: false };
}

export function useHashRoute(): {
  route: Route;
  navigate: (route: Route) => void;
  /** true når appen ble åpnet via snarveien «Ny utgift». */
  openNewOnLoad: boolean;
} {
  const [state, setState] = useState(() => parseHash(window.location.hash));
  const [openNewOnLoad] = useState(() => parseHash(window.location.hash).isNew);

  useEffect(() => {
    const handler = () => setState(parseHash(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((route: Route) => {
    if (window.location.hash === `#/${route}`) return;
    window.location.hash = `#/${route}`;
  }, []);

  useEffect(() => {
    if (!window.location.hash || state.isNew) {
      window.history.replaceState(null, '', `#/${state.route}`);
    }
  }, [state]);

  return { route: state.route, navigate, openNewOnLoad };
}
