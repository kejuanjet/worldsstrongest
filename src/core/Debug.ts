/**
 * Conditional debug logger. Respects the global CONFIG.debug.enabled flag.
 */
export function dlog(...args: unknown[]): void {
  const cfg = (globalThis as unknown as { CONFIG?: { debug?: { enabled?: boolean } } }).CONFIG;
  if (cfg?.debug?.enabled) console.log(...args);
}
