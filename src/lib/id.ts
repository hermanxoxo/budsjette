/**
 * ID-generering. Bruker crypto.randomUUID når den finnes,
 * med en tidsbasert reserveløsning for eldre nettlesere og testmiljø.
 */
let counter = 0;

export function createId(prefix: string): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `${prefix}_${cryptoObj.randomUUID().replace(/-/gu, '').slice(0, 16)}`;
  }
  counter = (counter + 1) % 100000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
