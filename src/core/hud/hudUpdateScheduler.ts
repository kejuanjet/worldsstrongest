interface ConfigLike {
  performance?: { hudUpdateHz?: number };
  ui: { hudUpdateHz?: number };
}

export function getHudUpdateStep(config: ConfigLike): number {
  return 1 / Math.max(1, config.performance?.hudUpdateHz ?? config.ui.hudUpdateHz ?? 20);
}

export interface HudUpdateResult {
  shouldRunHeavyUi: boolean;
  accumulator: number;
}

export function advanceHudUpdateAccumulator(
  accumulator: number,
  delta: number,
  hudStep: number,
): HudUpdateResult {
  const nextAccumulator = accumulator + delta;
  const shouldRunHeavyUi = nextAccumulator >= hudStep;
  return {
    shouldRunHeavyUi,
    accumulator: shouldRunHeavyUi ? nextAccumulator % hudStep : nextAccumulator,
  };
}
