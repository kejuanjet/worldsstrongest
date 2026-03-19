import {
  CubeTexture,
  SceneLoader,
  Texture,
  TransformNode,
  type AbstractMesh,
  type AssetContainer,
  type AnimationGroup,
  type InstantiatedEntries,
  type Scene,
  type Skeleton,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock } from "@babylonjs/gui";
import "@babylonjs/loaders";
import type { AssetDescriptor, AssetManifest } from "../data/gameData";
import { Logger } from "./Logger";

export interface LoadingProgress {
  loaded: number;
  failed: number;
  total: number;
  percent: number;
  currentAssetId: string;
}

export interface SceneSource {
  resolvedUrl: string;
  rootUrl: string;
  sceneFilename: string;
}

export interface InstantiatedModelAsset {
  root: TransformNode;
  meshes: AbstractMesh[];
  skeletons: Skeleton[];
  animationGroups: AnimationGroup[];
}

interface LoadedModelAsset {
  kind: "model" | "animation";
  descriptor: AssetDescriptor;
  resolvedUrl: string;
  container: AssetContainer;
}

interface LoadedTextureAsset {
  kind: "texture";
  descriptor: AssetDescriptor;
  resolvedUrl: string;
  texture: Texture | CubeTexture;
}

interface LoadedAudioAsset {
  kind: "audio";
  descriptor: AssetDescriptor;
  resolvedUrl: string;
  data: ArrayBuffer;
}

type LoadedAsset = LoadedModelAsset | LoadedTextureAsset | LoadedAudioAsset | ArrayBuffer;

function ensureGltfLoaderRegistered(): void {
  if (
    !SceneLoader.IsPluginForExtensionAvailable(".glb")
    || !SceneLoader.IsPluginForExtensionAvailable(".gltf")
  ) {
    throw new Error("Babylon glTF loader plugin is not registered.");
  }
}

ensureGltfLoaderRegistered();

const availabilityCache = new Map<string, Promise<boolean>>();
const resolutionCache = new Map<string, Promise<string>>();

export function normalizeAssetPath(assetPath: string): string {
  // HACK: Auto-correct absolute Windows/Mac paths that leaked into data.
  // If the path contains "/assets/", strip everything before it.
  const normalizedSlashes = assetPath.replace(/\\/g, "/");
  const assetsIdx = normalizedSlashes.toLowerCase().indexOf("/assets/");
  if (assetsIdx !== -1) {
    return normalizedSlashes.substring(assetsIdx);
  }

  // The game runs in a variety of environments (browser, Electron, etc.).
  // Support web URLs (http/https), data/blob URLs, and file paths.
  if (/^(https?:|file:|data:|blob:)/i.test(assetPath)) {
    return assetPath;
  }

  // Allow Windows absolute paths (e.g. C:\Users\...\idle.glb) in Electron/Node.
  // Convert to a file:// URL for fetch support.
  if (/^[a-zA-Z]:[\\/]/.test(assetPath) || /^\\\\/.test(assetPath)) {
    const normalized = assetPath.replace(/\\/g, "/");
    // Ensure we don’t produce file:////c:/...
    const trimmed = normalized.replace(/^\/+/, "");
    return `file:///${trimmed}`;
  }

  return assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
}

export function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export function getAssetUrlCandidates(assetPath: string): string[] {
  const normalized = normalizeAssetPath(assetPath);
  const candidates: string[] = [];

  const push = (value: string): void => {
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  };

  if (normalized.startsWith("/assets/")) {
    push(normalized);
    push(normalized.replace("/assets/", "/public/assets/"));
  } else if (normalized.startsWith("/models/")) {
    push(normalized);
    push(normalized.replace("/models/", "/public/models/"));
    push(normalized.replace("/models/", "/public/assets/models/"));
  } else if (normalized.startsWith("/textures/")) {
    push(normalized);
    push(normalized.replace("/textures/", "/public/textures/"));
    push(normalized.replace("/textures/", "/public/assets/textures/"));
  } else if (normalized.startsWith("/sounds/")) {
    push(normalized);
    push(normalized.replace("/sounds/", "/public/sounds/"));
    push(normalized.replace("/sounds/", "/public/assets/sounds/"));
  } else {
    push(normalized);
  }

  return candidates;
}

/**
 * Formats a loading progress snapshot into display-friendly strings.
 */
export function buildLoadingProgressSnapshot(
  pct: number,
  currentId: string = "",
): { percentText: string; statusText: string } {
  return {
    percentText: `${pct}%`,
    statusText: currentId ? `Loading: ${currentId}` : `Loading: ${pct}%`,
  };
}

async function probeAsset(assetPath: string): Promise<boolean> {
  if (availabilityCache.has(assetPath)) {
    return availabilityCache.get(assetPath)!;
  }

  const probePromise = (async () => {
    try {
      const headResponse = await fetch(assetPath, { method: "HEAD" });
      if (headResponse.ok) {
        return true;
      }
    } catch {
      // Fall back to a range probe below.
    }

    try {
      const rangedResponse = await fetch(assetPath, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
      });
      return rangedResponse.ok || rangedResponse.status === 206;
    } catch {
      return false;
    }
  })();

  availabilityCache.set(assetPath, probePromise);
  return probePromise;
}

export async function resolveAssetUrl(assetPath: string): Promise<string> {
  const normalized = normalizeAssetPath(assetPath);

  if (/^(https?:|data:|blob:)/i.test(normalized)) {
    return normalized;
  }

  if (resolutionCache.has(normalized)) {
    return resolutionCache.get(normalized)!;
  }

  const resolutionPromise = (async () => {
    for (const candidate of getAssetUrlCandidates(normalized)) {
      const encodedCandidate = encodeURI(decodeURI(candidate));
      if (await probeAsset(encodedCandidate)) {
        return encodedCandidate;
      }
    }

    return normalized;
  })();

  resolutionCache.set(normalized, resolutionPromise);
  return resolutionPromise;
}

export async function resolveSceneSource(assetPath: string): Promise<SceneSource> {
  const resolvedUrl = await resolveAssetUrl(assetPath);
  const baseHref = typeof window !== "undefined" ? window.location.href : "http://localhost/";
  const absoluteUrl = new URL(resolvedUrl, baseHref).href;
  const lastSlashIndex = absoluteUrl.lastIndexOf("/");

  return {
    resolvedUrl,
    rootUrl: withTrailingSlash(absoluteUrl.slice(0, lastSlashIndex + 1)),
    sceneFilename: absoluteUrl.slice(lastSlashIndex + 1),
  };
}

export async function assetExists(assetPath: string): Promise<boolean> {
  for (const candidate of getAssetUrlCandidates(assetPath)) {
    if (await probeAsset(candidate)) {
      return true;
    }
  }

  return false;
}

/**
 * Module-level manifest reference, populated when AssetLoader is constructed.
 * Used by CharacterRegistry.js for weapon/animation lookups.
 */
export let ASSET_MANIFEST: AssetManifest = { models: [], animations: [], textures: [], audio: [] };

function inferAssetType(descriptor: AssetDescriptor): AssetDescriptor["type"] {
  if (descriptor.type) {
    return descriptor.type;
  }

  const extension = descriptor.path.split(".").pop()?.toLowerCase();

  if (extension === "glb" || extension === "gltf" || extension === "fbx" || extension === "obj") {
    return descriptor.id.startsWith("anim_") ? "animation" : "model";
  }

  if (extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "webp" || extension === "ktx") {
    return "texture";
  }

  if (extension === "ogg" || extension === "mp3" || extension === "wav") {
    return "audio";
  }

  return "binary";
}

export class AssetLoader {
  private readonly _scene: Scene;
  private readonly _manifest: AssetManifest;
  private readonly _logger: Logger;
  private readonly _cache = new Map<string, LoadedAsset>();
  private readonly _pending = new Map<string, Promise<LoadedAsset>>();
  private readonly _descriptorById = new Map<string, AssetDescriptor>();
  private readonly _descriptorByPath = new Map<string, AssetDescriptor>();
  private readonly _progressListeners = new Set<(progress: LoadingProgress) => void>();
  private readonly _completeListeners = new Set<() => void>();
  private readonly _errorListeners = new Set<(error: Error, descriptor: AssetDescriptor) => void>();
  private _instanceCounter = 0;
  private _progressTotal = 0;
  private _progressLoaded = 0;
  private _progressFailed = 0;
  private _loadingUi?: {
    texture: AdvancedDynamicTexture;
    root: Rectangle;
    status: TextBlock;
    percent: TextBlock;
    fill: Rectangle;
  };

  public constructor(scene: Scene, manifest: AssetManifest, logger = Logger.scoped("AssetLoader")) {
    this._scene = scene;
    this._manifest = manifest;
    this._logger = logger;
    ASSET_MANIFEST = manifest;
    this._indexManifest();
  }

  public get manifest(): AssetManifest {
    return this._manifest;
  }

  public getDescriptor(id: string): AssetDescriptor | undefined {
    return this._descriptorById.get(id);
  }

  public findModelDescriptorByPath(assetPath: string): AssetDescriptor | undefined {
    return this._descriptorByPath.get(normalizeAssetPath(assetPath));
  }

  public has(id: string): boolean {
    return this._cache.has(id);
  }

  public getOrFallback<TAsset extends LoadedAsset>(id: string, fallback: TAsset | null = null): TAsset | null {
    return (this._cache.get(id) as TAsset | undefined) ?? fallback;
  }

  public onProgress(listener: (progress: LoadingProgress) => void): () => void {
    this._progressListeners.add(listener);
    return () => this._progressListeners.delete(listener);
  }

  public onComplete(listener: () => void): () => void {
    this._completeListeners.add(listener);
    return () => this._completeListeners.delete(listener);
  }

  public onError(listener: (error: Error, descriptor: AssetDescriptor) => void): () => void {
    this._errorListeners.add(listener);
    return () => this._errorListeners.delete(listener);
  }

  public async loadEssentials(): Promise<void> {
    const essentials = [
      ...this._manifest.models.filter((asset) => asset.priority === 1),
      ...this._manifest.animations.filter((asset) => asset.priority === 1),
      ...this._manifest.textures.filter((asset) => asset.priority === 1),
      ...this._manifest.audio.filter((asset) => asset.priority === 1 && !asset.stream),
    ];

    this._setLoadingUiVisible(true);
    this._progressTotal = essentials.length;
    this._progressLoaded = 0;
    this._progressFailed = 0;

    await this._loadBatch(essentials);

    this._setLoadingUiVisible(false);
    for (const listener of this._completeListeners) {
      listener();
    }
  }

  public voidBackgroundLoad(): void {
    const background = [
      ...this._manifest.models.filter((asset) => asset.priority > 1),
      ...this._manifest.animations.filter((asset) => asset.priority > 1),
      ...this._manifest.textures.filter((asset) => asset.priority > 1),
      ...this._manifest.audio.filter((asset) => asset.priority > 1 && !asset.stream),
    ];

    void this._loadBatch(background);
  }

  public async load(descriptorOrId: AssetDescriptor | string): Promise<LoadedAsset> {
    const descriptor = this._resolveDescriptor(descriptorOrId);

    if (this._cache.has(descriptor.id)) {
      return this._cache.get(descriptor.id)!;
    }

    if (this._pending.has(descriptor.id)) {
      return this._pending.get(descriptor.id)!;
    }

    const loadPromise = this._loadOne(descriptor);
    this._pending.set(descriptor.id, loadPromise);

    try {
      const asset = await loadPromise;
      this._cache.set(descriptor.id, asset);
      return asset;
    } finally {
      this._pending.delete(descriptor.id);
    }
  }

  public async instantiateModel(descriptorOrId: AssetDescriptor | string, instanceName?: string): Promise<InstantiatedModelAsset> {
    const descriptor = this._resolveDescriptor(descriptorOrId);
    const asset = await this.load(descriptor);

    if (!("kind" in asset) || (asset.kind !== "model" && asset.kind !== "animation")) {
      throw new Error(`Asset "${descriptor.id}" is not an instantiable model.`);
    }

    const entries = asset.container.instantiateModelsToScene(
      (sourceName: string) => `${instanceName ?? descriptor.id}_${sourceName}_${this._instanceCounter++}`,
      true,
    );

    return this._normalizeInstantiatedEntries(entries, instanceName ?? descriptor.id);
  }

  private _indexManifest(): void {
    const allDescriptors = [
      ...this._manifest.models,
      ...this._manifest.animations,
      ...this._manifest.textures,
      ...this._manifest.audio,
    ];

    for (const descriptor of allDescriptors) {
      this._descriptorById.set(descriptor.id, descriptor);
      this._descriptorByPath.set(normalizeAssetPath(descriptor.path), descriptor);
    }
  }

  private _resolveDescriptor(descriptorOrId: AssetDescriptor | string): AssetDescriptor {
    if (typeof descriptorOrId !== "string") {
      return descriptorOrId;
    }

    const descriptor = this._descriptorById.get(descriptorOrId);
    if (!descriptor) {
      throw new Error(`Unknown asset id "${descriptorOrId}".`);
    }

    return descriptor;
  }

  private async _loadBatch(descriptors: AssetDescriptor[]): Promise<void> {
    const queue = [...descriptors];
    const concurrency = Math.min(6, queue.length);
    const workers: Promise<void>[] = [];

    const runWorker = async (): Promise<void> => {
      while (queue.length > 0) {
        const descriptor = queue.shift();
        if (!descriptor) {
          return;
        }

        try {
          await this.load(descriptor);
          this._progressLoaded += 1;
        } catch (error) {
          this._progressFailed += 1;
          const resolvedError = error instanceof Error ? error : new Error(String(error));
          this._logger.warn("Failed to load asset", descriptor.id, resolvedError.message);
          for (const listener of this._errorListeners) {
            listener(resolvedError, descriptor);
          }
        }

        this._emitProgress(descriptor.id);
      }
    };

    for (let index = 0; index < concurrency; index += 1) {
      workers.push(runWorker());
    }

    await Promise.all(workers);
  }

  private async _loadOne(descriptor: AssetDescriptor): Promise<LoadedAsset> {
    const kind = inferAssetType(descriptor);

    switch (kind) {
      case "model":
      case "animation":
        return this._loadModelLike(descriptor, kind);
      case "texture":
        return this._loadTexture(descriptor);
      case "audio":
        return this._loadAudio(descriptor);
      default:
        return this._loadBinary(descriptor);
    }
  }

  private async _loadModelLike(descriptor: AssetDescriptor, kind: "model" | "animation"): Promise<LoadedModelAsset> {
    const source = await resolveSceneSource(descriptor.path);
    const container = await SceneLoader.LoadAssetContainerAsync(source.rootUrl, source.sceneFilename, this._scene);

    for (const group of container.animationGroups) {
      group.stop();
    }

    return {
      kind,
      descriptor,
      resolvedUrl: source.resolvedUrl,
      container,
    };
  }

  private async _loadTexture(descriptor: AssetDescriptor): Promise<LoadedTextureAsset> {
    const resolvedUrl = await resolveAssetUrl(descriptor.path);

    if (descriptor.cube && descriptor.basePath) {
      const texture = new CubeTexture(descriptor.basePath, this._scene);
      await this._waitForTextureReady(texture);
      return {
        kind: "texture",
        descriptor,
        resolvedUrl,
        texture,
      };
    }

    const texture = new Texture(resolvedUrl, this._scene, false, false);
    await this._waitForTextureReady(texture);

    return {
      kind: "texture",
      descriptor,
      resolvedUrl,
      texture,
    };
  }

  private async _loadAudio(descriptor: AssetDescriptor): Promise<LoadedAudioAsset> {
    const resolvedUrl = await resolveAssetUrl(descriptor.path);
    const response = await fetch(resolvedUrl);

    if (!response.ok) {
      throw new Error(`Failed to load audio asset "${descriptor.id}".`);
    }

    return {
      kind: "audio",
      descriptor,
      resolvedUrl,
      data: await response.arrayBuffer(),
    };
  }

  private async _loadBinary(descriptor: AssetDescriptor): Promise<ArrayBuffer> {
    const resolvedUrl = await resolveAssetUrl(descriptor.path);
    const response = await fetch(resolvedUrl);

    if (!response.ok) {
      throw new Error(`Failed to load binary asset "${descriptor.id}".`);
    }

    return response.arrayBuffer();
  }

  private _emitProgress(currentAssetId: string): void {
    const processed = this._progressLoaded + this._progressFailed;
    const percent = this._progressTotal > 0 ? Math.round((processed / this._progressTotal) * 100) : 100;

    if (this._loadingUi) {
      this._loadingUi.percent.text = `${percent}%`;
      this._loadingUi.status.text = currentAssetId;
      this._loadingUi.fill.width = `${percent}%`;
    }

    const payload: LoadingProgress = {
      loaded: this._progressLoaded,
      failed: this._progressFailed,
      total: this._progressTotal,
      percent,
      currentAssetId,
    };

    for (const listener of this._progressListeners) {
      listener(payload);
    }
  }

  private _waitForTextureReady(texture: Texture | CubeTexture): Promise<void> {
    if (texture.isReady()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const startedAt = Date.now();
      const timeoutMs = 5000;
      const poll = (): void => {
        if (texture.isReady()) {
          resolve();
          return;
        }
        if ((Date.now() - startedAt) >= timeoutMs) {
          console.warn(`[AssetLoader] Texture timed out after ${timeoutMs}ms:`, texture.name);
          resolve();
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
    });
  }

  private _setLoadingUiVisible(visible: boolean): void {
    if (!this._loadingUi) {
      this._loadingUi = this._createLoadingUi();
    }

    this._loadingUi.root.isVisible = visible;
  }

  private _createLoadingUi(): {
    texture: AdvancedDynamicTexture;
    root: Rectangle;
    status: TextBlock;
    percent: TextBlock;
    fill: Rectangle;
  } {
    const texture = AdvancedDynamicTexture.CreateFullscreenUI("asset-loader-ui", true, this._scene);

    const root = new Rectangle("asset-loader-root");
    root.width = 0.42;
    root.height = "168px";
    root.thickness = 2;
    root.cornerRadius = 22;
    root.background = "#090d14dd";
    root.color = "#2fcfff";
    root.isVisible = false;
    texture.addControl(root);

    const title = new TextBlock("asset-loader-title", "WORLD'S STRONGEST");
    title.top = "-44px";
    title.color = "#f5fbff";
    title.fontSize = 28;
    title.fontFamily = "Orbitron";
    title.height = "36px";
    root.addControl(title);

    const status = new TextBlock("asset-loader-status", "Preparing assets...");
    status.top = "-4px";
    status.color = "#9cc8d7";
    status.fontSize = 16;
    status.height = "22px";
    root.addControl(status);

    const progressFrame = new Rectangle("asset-loader-progress-frame");
    progressFrame.top = "34px";
    progressFrame.width = 0.76;
    progressFrame.height = "16px";
    progressFrame.thickness = 1;
    progressFrame.cornerRadius = 8;
    progressFrame.background = "#101925";
    progressFrame.color = "#26384f";
    root.addControl(progressFrame);

    const fill = new Rectangle("asset-loader-progress-fill");
    fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    fill.width = "0%";
    fill.height = 1;
    fill.thickness = 0;
    fill.cornerRadius = 8;
    fill.background = "#2fcfff";
    progressFrame.addControl(fill);

    const percent = new TextBlock("asset-loader-percent", "0%");
    percent.top = "66px";
    percent.color = "#ffffff";
    percent.fontSize = 22;
    percent.height = "28px";
    root.addControl(percent);

    return {
      texture,
      root,
      status,
      percent,
      fill,
    };
  }

  private _normalizeInstantiatedEntries(entries: InstantiatedEntries, baseName: string): InstantiatedModelAsset {
    const root = new TransformNode(`${baseName}_root`, this._scene);
    const meshes: AbstractMesh[] = [];

    for (const rootNode of entries.rootNodes) {
      rootNode.parent = root;

      if ("isVisible" in rootNode) {
        const meshRoot = rootNode as AbstractMesh;
        meshRoot.isVisible = true;
        meshRoot.visibility = 1;
        meshRoot.setEnabled(true);
        meshes.push(meshRoot);
      }

      for (const childMesh of rootNode.getChildMeshes(false)) {
        childMesh.isVisible = true;
        childMesh.visibility = 1;
        childMesh.setEnabled(true);
        childMesh.alwaysSelectAsActiveMesh = true;
        meshes.push(childMesh);
      }
    }

    for (const animationGroup of entries.animationGroups) {
      animationGroup.stop();
    }

    return {
      root,
      meshes,
      skeletons: entries.skeletons,
      animationGroups: entries.animationGroups,
    };
  }
}
