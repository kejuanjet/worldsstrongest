export interface SaveBackend {
  loadRaw(key: string): Promise<string | null>;
  saveRaw(key: string, payload: string): Promise<void>;
  removeRaw(key: string): Promise<void>;
}

export interface SaveManagerOptions<T> {
  namespace: string;
  backend: SaveBackend;
  fallbackFactory?: (key: string) => T;
  serialize?: (value: T) => string;
  deserialize?: (payload: string) => T;
}

export class LocalStorageBackend implements SaveBackend {
  private readonly _storage: Storage | null;

  public constructor(storage: Storage | null = typeof localStorage !== "undefined" ? localStorage : null) {
    this._storage = storage;
  }

  public async loadRaw(key: string): Promise<string | null> {
    return this._storage?.getItem(key) ?? null;
  }

  public async saveRaw(key: string, payload: string): Promise<void> {
    this._storage?.setItem(key, payload);
  }

  public async removeRaw(key: string): Promise<void> {
    this._storage?.removeItem(key);
  }
}

export class MemorySaveBackend implements SaveBackend {
  private readonly _store = new Map<string, string>();

  public async loadRaw(key: string): Promise<string | null> {
    return this._store.get(key) ?? null;
  }

  public async saveRaw(key: string, payload: string): Promise<void> {
    this._store.set(key, payload);
  }

  public async removeRaw(key: string): Promise<void> {
    this._store.delete(key);
  }
}

export class SaveManager<T> {
  private readonly _namespace: string;
  private readonly _backend: SaveBackend;
  private readonly _fallbackFactory: ((key: string) => T) | undefined;
  private readonly _serialize: (value: T) => string;
  private readonly _deserialize: (payload: string) => T;

  public constructor(options: SaveManagerOptions<T>) {
    this._namespace = options.namespace;
    this._backend = options.backend;
    this._fallbackFactory = options.fallbackFactory;
    this._serialize = options.serialize ?? ((value) => JSON.stringify(value));
    this._deserialize = options.deserialize ?? ((payload) => JSON.parse(payload) as T);
  }

  public async load(key: string): Promise<T | null> {
    const payload = await this._backend.loadRaw(this._resolveKey(key));

    if (payload === null) {
      return this._fallbackFactory ? this._fallbackFactory(key) : null;
    }

    return this._deserialize(payload);
  }

  public async save(key: string, value: T): Promise<void> {
    await this._backend.saveRaw(this._resolveKey(key), this._serialize(value));
  }

  public async remove(key: string): Promise<void> {
    await this._backend.removeRaw(this._resolveKey(key));
  }

  private _resolveKey(key: string): string {
    return `${this._namespace}:${key}`;
  }
}
