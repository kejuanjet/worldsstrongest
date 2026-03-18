export function normalizeAssetPath(path: string): string {
  if (!path) return "";

  const normalizedSlashes = path.replace(/\\/g, "/");
  const assetsIdx = normalizedSlashes.toLowerCase().indexOf("/assets/");
  if (assetsIdx !== -1) {
    return normalizedSlashes.substring(assetsIdx);
  }

  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return path.startsWith("/") ? path : `/${path}`;
}

export function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export function buildLoadingProgressSnapshot(
  pct: number,
  currentId: string = "",
): { percentText: string; statusText: string } {
  return {
    percentText: `${pct}%`,
    statusText: currentId ? `Loading: ${currentId}` : `Loading: ${pct}%`,
  };
}

export function getAssetUrlCandidates(path: string): string[] {
  const normalized = normalizeAssetPath(path);
  if (!normalized) return [];
  if (/^(https?:|data:|blob:)/i.test(normalized)) return [normalized];

  const candidates: string[] = [];
  const push = (value: string) => {
    if (!value || candidates.includes(value)) return;
    candidates.push(value);
  };

  push(normalized);

  if (normalized.startsWith("/assets/")) {
    push(normalized.replace(/^\/assets\//, "/public/assets/"));
  } else if (normalized.startsWith("/textures/")) {
    push(normalized.replace(/^\/textures\//, "/public/assets/textures/"));
    push(normalized.replace(/^\/textures\//, "/public/textures/"));
  } else if (normalized.startsWith("/sounds/")) {
    push(normalized.replace(/^\/sounds\//, "/public/assets/sounds/"));
    push(normalized.replace(/^\/sounds\//, "/public/sounds/"));
  } else if (normalized.startsWith("/models/")) {
    push(normalized.replace(/^\/models\//, "/public/models/"));
    push(normalized.replace(/^\/models\//, "/public/assets/models/"));
  }

  return candidates;
}
