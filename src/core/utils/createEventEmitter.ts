 
type AnyFn = (...args: any[]) => void;

export interface EventEmitter<TEvents extends Record<string, AnyFn>> {
  on<K extends keyof TEvents>(eventName: K, handler: TEvents[K]): () => void;
  off<K extends keyof TEvents>(eventName: K, handler: TEvents[K]): void;
  emit<K extends keyof TEvents>(eventName: K, ...args: Parameters<TEvents[K]>): void;
  clear(eventName?: keyof TEvents | null): void;
}

export function createEventEmitter<TEvents extends Record<string, AnyFn>>(
  eventNames: ReadonlyArray<keyof TEvents> = [],
): EventEmitter<TEvents> {
  const listeners = new Map<keyof TEvents, AnyFn[]>(
    eventNames.map((name) => [name, []]),
  );

  return {
    on<K extends keyof TEvents>(eventName: K, handler: TEvents[K]): () => void {
      const handlers = listeners.get(eventName) ?? [];
      handlers.push(handler);
      listeners.set(eventName, handlers);
      return () => this.off(eventName, handler);
    },

    off<K extends keyof TEvents>(eventName: K, handler: TEvents[K]): void {
      const handlers = listeners.get(eventName) ?? [];
      listeners.set(
        eventName,
        handlers.filter((existing) => existing !== handler),
      );
    },

    emit<K extends keyof TEvents>(eventName: K, ...args: Parameters<TEvents[K]>): void {
      const handlers = listeners.get(eventName) ?? [];
      handlers.forEach((handler) => handler(...args));
    },

    clear(eventName: keyof TEvents | null = null): void {
      if (eventName == null) {
        listeners.forEach((_, key) => listeners.set(key, []));
        return;
      }
      listeners.set(eventName, []);
    },
  };
}
