export async function loadDesktopWebSocketServer(): Promise<unknown> {
  // Dynamic import through `new Function` so bundlers don't try to inline the
  // Node.js `ws` package into the browser build.
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<{ WebSocketServer?: unknown }>;
  const mod = await dynamicImport("ws");
  return mod.WebSocketServer ?? null;
}
