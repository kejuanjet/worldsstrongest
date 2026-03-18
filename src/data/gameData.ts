import { Color3 } from "@babylonjs/core";

export type AssetPriority = 1 | 2 | 3;
export type AssetKind = "model" | "animation" | "texture" | "audio" | "binary";
export type CharacterStance = "MELEE" | "SWORD";
export type EntityTeam = "HERO" | "ENEMY";

export interface AssetDescriptor {
  id: string;
  path: string;
  priority: AssetPriority;
  type?: AssetKind;
  stream?: boolean;
  cube?: boolean;
  basePath?: string;
}

export interface AssetManifest {
  models: AssetDescriptor[];
  animations: AssetDescriptor[];
  textures: AssetDescriptor[];
  audio: AssetDescriptor[];
}

export interface JsonColor3 {
  r: number;
  g: number;
  b: number;
  __type?: "Color3";
}

export interface AttackProfile {
  label: string;
  attacks: string[];
}

export interface TransformationDefinition {
  id: string;
  label: string;
  plMultiplier: number;
  kiCost: number;
  color: Color3;
}

export interface CharacterDefinition {
  id: string;
  label: string;
  modelPath: string;
  desiredHeightM?: number;
  basePowerLevel: number;
  baseSpeed: number;
  baseStamina: number;
  defaultStance?: CharacterStance;
  stances?: CharacterStance[];
  stanceSwitchCost?: number;
  beamAttacks?: string[];
  spellAttacks?: string[];
  isBoss?: boolean;
  transformations: TransformationDefinition[];
  attackProfiles?: AttackProfile[];
  attackAnimVariants?: Record<string, string[]>;
}

export type CharacterRoster = Record<string, CharacterDefinition>;

interface CharacterDefinitionJson extends Omit<CharacterDefinition, "transformations"> {
  transformations?: Array<{
    id: string;
    label: string;
    plMultiplier: number;
    kiCost: number;
    color: JsonColor3;
  }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function normalizeAssetDescriptor(descriptor: AssetDescriptor, fallbackType?: AssetKind): AssetDescriptor {
  const resolvedType = descriptor.type ?? fallbackType;

  if (!resolvedType) {
    return { ...descriptor };
  }

  return {
    ...descriptor,
    type: resolvedType,
  };
}

function parseColor3(value: JsonColor3 | undefined): Color3 {
  if (!value) {
    return new Color3(1, 1, 1);
  }

  return new Color3(value.r, value.g, value.b);
}

export function normalizeManifest(manifest: Partial<AssetManifest>): AssetManifest {
  return {
    models: (manifest.models ?? []).map((entry) => normalizeAssetDescriptor(entry, "model")),
    animations: (manifest.animations ?? []).map((entry) => normalizeAssetDescriptor(entry, "animation")),
    textures: (manifest.textures ?? []).map((entry) => normalizeAssetDescriptor(entry, "texture")),
    audio: (manifest.audio ?? []).map((entry) => normalizeAssetDescriptor(entry, "audio")),
  };
}

export function parseCharacterRoster(raw: Record<string, CharacterDefinitionJson>): CharacterRoster {
  const roster: CharacterRoster = {};

  for (const [id, entry] of Object.entries(raw)) {
    roster[id] = {
      ...entry,
      transformations: (entry.transformations ?? []).map((transform) => ({
        ...transform,
        color: parseColor3(transform.color),
      })),
    };
  }

  return roster;
}

export async function loadAssetManifest(url = "/data/manifest.json"): Promise<AssetManifest> {
  const manifest = await fetchJson<Partial<AssetManifest>>(url);
  return normalizeManifest(manifest);
}

export async function loadCharacterRoster(url = "/data/characters.json"): Promise<CharacterRoster> {
  const raw = await fetchJson<Record<string, CharacterDefinitionJson>>(url);
  return parseCharacterRoster(raw);
}

export async function loadGameData(basePath = "/data"): Promise<{
  manifest: AssetManifest;
  characters: CharacterRoster;
}> {
  const [manifest, characters] = await Promise.all([
    loadAssetManifest(`${basePath}/manifest.json`),
    loadCharacterRoster(`${basePath}/characters.json`),
  ]);

  return { manifest, characters };
}
