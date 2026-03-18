import type {
  AbstractMesh,
  AnimationGroup,
  Bone,
  Skeleton,
  TransformNode,
} from "@babylonjs/core";
import type { AssetLoader } from "../AssetLoader.js";
import type { CharacterState } from "../CharacterRegistry.js";
import {
  ANIM_STATE,
  BASE_RETARGET_STATES,
  CLIP_ASSET_IDS,
  SUPPORT_RETARGET_STATES,
  SWORD_RETARGET_STATES,
  buildAnimationNameMap,
  normalizeTargetName,
} from "./AnimationData.js";

const MIXAMO_PREFIXES = ["mixamorig", "mixamorig9Character"];

const BONE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  hips: ["pelvis", "root", "bip01", "hip", "rootbone", "pelvisbone"],
  spine: ["spine1", "spine2", "spine3", "spine5", "spine6", "spine7"],
  spine1: ["spine", "spine2", "spine3"],
  spine2: ["spine", "spine1", "spine3", "chest"],
  spine3: ["spine", "spine2", "chest"],
  head: ["neck", "headtop", "headbone", "head1"],
  neck: ["head", "neck1", "neckbone"],
  righthand: ["righthand", "handr", "wristr", "hand_right", "right_hand", "hand"],
  rightarm: ["rightupperarm", "upperarmr", "arm_r", "rightarm", "right_upper_arm", "shoulderr"],
  rightforearm: ["rightlowerarm", "lowerarmr", "forearm_r", "right_forearm", "rightforearm"],
  lefthand: ["lefthand", "handl", "wristl", "hand_left", "left_hand", "hand"],
  leftarm: ["leftupperarm", "upperarml", "arm_l", "leftarm", "left_upper_arm", "shoulderl"],
  leftforearm: ["leftlowerarm", "lowerarml", "forearm_l", "left_forearm", "leftforearm"],
  rightleg: ["rightupperleg", "upperlegr", "thighr", "leg_r", "rightleg", "right_upper_leg", "hip_r"],
  rightfoot: ["rightankle", "ankler", "foot_r", "rightfoot", "right_foot"],
  righttoe: ["righttoebase", "toe_r", "right_toe", "righttoe"],
  leftleg: ["leftupperleg", "upperlegl", "thighl", "leg_l", "leftleg", "left_upper_leg", "hip_l"],
  leftfoot: ["leftankle", "anklel", "foot_l", "leftfoot", "left_foot"],
  lefttoe: ["lefttoebase", "toe_l", "left_toe", "lefttoe"],
  rightshoulder: ["shoulderr", "clavicle_r", "rightshoulder", "right_shoulder", "collar_r"],
  leftshoulder: ["shoulderl", "clavicle_l", "leftshoulder", "left_shoulder", "collar_l"],
};

type NormalizedModelAsset = {
  animGroups: AnimationGroup[];
  skeletons: Skeleton[];
};

type NamedTarget = {
  id?: string | null;
  name?: string | null;
  parent?: unknown;
  [key: string]: unknown;
};

function buildBoneAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(BONE_ALIASES)) {
    for (const alias of aliases) {
      if (!map.has(alias)) map.set(alias, canonical);
    }
    if (!map.has(canonical)) map.set(canonical, canonical);
  }
  return map;
}

const BONE_ALIAS_MAP = buildBoneAliasMap();
const CORE_PREWARM_STATES: readonly string[] = [
  ANIM_STATE.IDLE,
  ANIM_STATE.WALK,
  ANIM_STATE.RUN,
  ANIM_STATE.JUMP,
  ANIM_STATE.HURT,
  ANIM_STATE.DEATH,
] as const;

function resolveBoneAlias(normalizedName: string): string {
  return BONE_ALIAS_MAP.get(normalizedName) ?? normalizedName;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AnimationRetargeter {
  readonly assetLoader: AssetLoader | null;
  private _retargetCount = 0;
  private _averageRetargetMs = 0;

  constructor(assetLoader: AssetLoader | null = null) {
    this.assetLoader = assetLoader;
  }

  getAverageRetargetMs(): number {
    return this._averageRetargetMs;
  }

  async prewarmCharacterAnimations(characterIds: readonly string[]): Promise<void> {
    const assetLoader = this.assetLoader;
    if (!assetLoader || characterIds.length === 0) return;

    const assetIds = new Set<string>();
    for (const characterId of characterIds) {
      const meleeMap = buildAnimationNameMap(characterId, "MELEE");
      for (const stateId of CORE_PREWARM_STATES) {
        const clipName = meleeMap[stateId];
        const assetId = clipName ? CLIP_ASSET_IDS[clipName] : null;
        if (assetId) assetIds.add(assetId);
      }
    }

    const descriptors = [...assetIds]
      .map((assetId) => ({ assetId, descriptor: assetLoader.getDescriptor(assetId) }))
      .filter((entry): entry is { assetId: string; descriptor: NonNullable<ReturnType<AssetLoader["getDescriptor"]>> } => Boolean(entry.descriptor));

    await this._loadPendingClips(
      descriptors.map(({ assetId, descriptor }) => ({
        clipName: assetId,
        assetId,
        descriptor,
      })),
      assetLoader,
    );
  }

  cleanupClonedGroups(
    state: CharacterState | null | undefined,
    slot: number,
  ): number {
    if (!state || state.animationGroups.length === 0) return 0;

    const toRemove: number[] = [];
    for (let i = state.animationGroups.length - 1; i >= 0; i -= 1) {
      const group = state.animationGroups[i];
      if (!group) continue;
      if (group.metadata?.clonedForSlot !== slot) continue;
      try {
        group.stop();
        group.dispose();
      } catch {
        // Ignore disposal errors.
      }
      toRemove.push(i);
    }

    for (const index of toRemove) {
      state.animationGroups.splice(index, 1);
    }

    if (toRemove.length) {
      console.log(
        `[AnimationController] Cleaned up ${toRemove.length} stale cloned animation groups for slot ${slot}`,
      );
    }
    return toRemove.length;
  }

  async ensurePriorityAnimation(
    state: CharacterState | null | undefined,
    characterId: string,
  ): Promise<void> {
    const assetLoader = this.assetLoader;
    if (!assetLoader || !state?.mesh) return;

    const meleeMap = buildAnimationNameMap(characterId, "MELEE");
    const idleClipName = meleeMap[ANIM_STATE.IDLE];
    if (!idleClipName) return;

    const existingNames = new Set(
      state.animationGroups.flatMap((group) => {
        const rawName = group.name;
        return [rawName.toLowerCase(), normalizeTargetName(rawName)].filter(Boolean);
      }),
    );
    const clipLower = idleClipName.toLowerCase();
    const clipNorm = normalizeTargetName(idleClipName);
    if (existingNames.has(clipLower) || existingNames.has(clipNorm)) return;

    const assetId = CLIP_ASSET_IDS[idleClipName];
    if (!assetId) return;
    const descriptor = assetLoader.getDescriptor(assetId);
    if (!descriptor) return;

    let sourceAsset = assetLoader.getOrFallback(assetId);
    if (!sourceAsset) {
      try {
        sourceAsset = await assetLoader.load(descriptor);
      } catch (error) {
        console.warn(
          `[AnimationController] Priority IDLE load failed (${assetId}): ${errorMessage(error)}`,
        );
        return;
      }
    }

    const { converter: targetConverter } = this._createTargetConverter(state);
    const sourceAnimGroups = this._getAnimationGroups(sourceAsset);
    if (sourceAnimGroups.length === 0) return;
    const sourceGroup =
      sourceAnimGroups.find((group) => {
        const name = group.name;
        return (
          name.toLowerCase() === clipLower ||
          normalizeTargetName(name) === clipNorm
        );
      }) ?? sourceAnimGroups[0]!;

    let clonedGroup: AnimationGroup;
    try {
      clonedGroup = sourceGroup.clone(
        `${state.slot}_${assetId}_priority`,
        targetConverter,
      );
    } catch (error) {
      console.warn(
        `[AnimationController] Priority IDLE clone failed (${assetId}): ${errorMessage(error)}`,
        );
        return;
      }
    if (clonedGroup.targetedAnimations.length === 0) {
      clonedGroup.dispose();
      return;
    }

    clonedGroup.metadata = {
      ...(clonedGroup.metadata ?? {}),
      clonedForSlot: state.slot,
    };
    clonedGroup.name = idleClipName;
    clonedGroup.stop();
    clonedGroup.weight = 0;
    state.animationGroups.push(clonedGroup);

    console.log(
      `[AnimationController] Priority IDLE clip "${idleClipName}" retargeted for slot ${state.slot}`,
    );
  }

  async ensureRetargetedAnimations(
    state: CharacterState | null | undefined,
    characterId: string,
    currentStance: string | null | undefined = null,
  ): Promise<void> {
    const startedAt = performance.now();
    const assetLoader = this.assetLoader;
    if (!assetLoader || !state?.mesh) return;

    const clipNames = this._collectRetargetClipNames(
      state,
      characterId,
      currentStance,
    );
    const existingNames = new Set(
      state.animationGroups.flatMap((group) => {
        const rawName = group.name;
        const lowered = rawName.toLowerCase();
        const normalized = normalizeTargetName(rawName);
        return [lowered, normalized].filter(Boolean);
      }),
    );
    const { converter: targetConverter, unmatchedBones } =
      this._createTargetConverter(state);

    const pendingClips: Array<{
      clipName: string;
      assetId: string;
      descriptor: NonNullable<ReturnType<AssetLoader["getDescriptor"]>>;
    }> = [];

    for (const clipName of clipNames) {
      const clipLower = clipName.toLowerCase();
      const clipNormalized = normalizeTargetName(clipName);
      if (existingNames.has(clipLower) || existingNames.has(clipNormalized)) {
        continue;
      }
      const assetId = CLIP_ASSET_IDS[clipName];
      if (!assetId) continue;
      const descriptor = assetLoader.getDescriptor(assetId);
      if (!descriptor) continue;
      pendingClips.push({ clipName, assetId, descriptor });
    }
    if (!pendingClips.length) return;

    const loadResults = await this._loadPendingClips(pendingClips, assetLoader);

    const clonedGroups: AnimationGroup[] = [];
    for (let index = 0; index < loadResults.length; index += 1) {
      const entry = loadResults[index];
      if (!entry?.sourceAsset) continue;

      const { clipName, assetId, descriptor, sourceAsset } = entry;
      const clipLower = clipName.toLowerCase();
      const clipNormalized = normalizeTargetName(clipName);
      const sourceAnimGroups = this._getAnimationGroups(sourceAsset);
      if (sourceAnimGroups.length === 0) {
        console.warn(
          `[AnimationController] Retarget clip ${assetId} (${descriptor.path}) has no animation groups.`,
        );
        continue;
      }
      const sourceGroup =
        sourceAnimGroups.find((group) => {
          const groupName = group.name;
          return (
            groupName.toLowerCase() === clipLower ||
            normalizeTargetName(groupName) === clipNormalized
          );
        }) ?? sourceAnimGroups[0]!;
      let clonedGroup: AnimationGroup;
      try {
        clonedGroup = sourceGroup.clone(
          `${state.slot}_${assetId}`,
          targetConverter,
        );
      } catch (error) {
        console.warn(
          `[AnimationController] clone() failed for ${assetId}: ${errorMessage(error)}`,
        );
        continue;
      }
      const targetedAnimationCount = clonedGroup.targetedAnimations.length;
      if (targetedAnimationCount === 0) {
        console.warn(
          `[AnimationController] Retargeted group "${clipName}" has 0 targeted animations — bone name mismatch?`,
        );
        clonedGroup.dispose();
        continue;
      }

      clonedGroup.metadata = {
        ...(clonedGroup.metadata ?? {}),
        clonedForSlot: state.slot,
      };
      clonedGroup.name = clipName;
      clonedGroup.stop();
      clonedGroup.weight = 0;
      clonedGroups.push(clonedGroup);
      existingNames.add(clipLower);
      if (clipNormalized) existingNames.add(clipNormalized);
      if ((index + 1) % 3 === 0) {
        await this._yieldToMainThread();
      }
    }

    if (clonedGroups.length) {
      console.log(
        `[AnimationController] Retargeted ${clonedGroups.length} animation clips for ${characterId} (slot ${state.slot})`,
      );
      state.animationGroups.push(...clonedGroups);
    } else {
      console.warn(
        `[AnimationController] No animations were retargeted for ${characterId} (slot ${state.slot}) — will use embedded animations from model`,
      );
    }

    if (unmatchedBones.size > 0) {
      console.warn(
        `[AnimationController] Unmatched source bones for ${characterId}:`,
        [...unmatchedBones].slice(0, 10).join(", "),
        unmatchedBones.size > 10 ? `... (${unmatchedBones.size} total)` : "",
      );
    }

    const elapsed = performance.now() - startedAt;
    this._retargetCount += 1;
    this._averageRetargetMs += (elapsed - this._averageRetargetMs) / this._retargetCount;
    console.debug(
      `[AnimationController] Retarget batch for ${characterId} took ${elapsed.toFixed(1)}ms (${this._averageRetargetMs.toFixed(1)}ms avg)`,
    );
  }

  private async _loadPendingClips(
    pendingClips: Array<{
      clipName: string;
      assetId: string;
      descriptor: NonNullable<ReturnType<AssetLoader["getDescriptor"]>>;
    }>,
    assetLoader: AssetLoader,
  ): Promise<Array<{
    clipName: string;
    assetId: string;
    descriptor: NonNullable<ReturnType<AssetLoader["getDescriptor"]>>;
    sourceAsset: unknown;
  } | null>> {
    const queue = [...pendingClips];
    const results: Array<{
      clipName: string;
      assetId: string;
      descriptor: NonNullable<ReturnType<AssetLoader["getDescriptor"]>>;
      sourceAsset: unknown;
    } | null> = new Array(queue.length).fill(null);
    const concurrency = Math.min(2, queue.length);
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        const index = pendingClips.indexOf(next);
        let sourceAsset = assetLoader.getOrFallback(next.assetId);
        if (!sourceAsset) {
          try {
            sourceAsset = await assetLoader.load(next.descriptor);
          } catch (error) {
            console.warn(
              `[AnimationController] Failed to load retarget clip ${next.assetId} (${next.descriptor.path}): ${errorMessage(error)}`,
            );
            results[index] = null;
            continue;
          }
        }
        results[index] = { ...next, sourceAsset };
      }
    });
    await Promise.all(workers);
    return results;
  }

  private async _yieldToMainThread(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  private _normalizeModelAsset(asset: unknown): NormalizedModelAsset | null {
    if (!asset || typeof asset !== "object") return null;
    const candidate = asset as {
      animGroups?: AnimationGroup[];
      animationGroups?: AnimationGroup[];
      skeletons?: Skeleton[];
      container?: {
        animationGroups?: AnimationGroup[];
        skeletons?: Skeleton[];
      };
    };
    const animGroups =
      candidate.animGroups ??
      candidate.animationGroups ??
      candidate.container?.animationGroups ??
      [];
    const skeletons =
      candidate.skeletons ?? candidate.container?.skeletons ?? [];
    if (!animGroups.length && !skeletons.length) return null;
    return { animGroups, skeletons };
  }

  private _getAnimationGroups(asset: unknown): AnimationGroup[] {
    return this._normalizeModelAsset(asset)?.animGroups ?? [];
  }

  private _collectRetargetClipNames(
    state: CharacterState,
    characterId: string,
    currentStance: string | null | undefined,
  ): Set<string> {
    const clipNames = new Set<string>();
    const meleeMap = buildAnimationNameMap(characterId, "MELEE");
    const swordMap = buildAnimationNameMap(characterId, "SWORD");
    const stances = state.characterDef.stances ?? [];

    const canUseSword =
      stances.includes("SWORD") ||
      state.currentStance === "SWORD" ||
      currentStance === "SWORD";

    for (const stateId of BASE_RETARGET_STATES) {
      const clipName = meleeMap[stateId];
      if (clipName && CLIP_ASSET_IDS[clipName]) {
        clipNames.add(clipName);
      }
    }

    if (canUseSword) {
      for (const stateId of SWORD_RETARGET_STATES) {
        const clipName = swordMap[stateId];
        if (clipName && CLIP_ASSET_IDS[clipName]) {
          clipNames.add(clipName);
        }
      }
    }

    if (characterId === "HANA") {
      for (const stateId of SUPPORT_RETARGET_STATES) {
        const clipName = meleeMap[stateId] ?? swordMap[stateId];
        if (clipName && CLIP_ASSET_IDS[clipName]) {
          clipNames.add(clipName);
        }
      }
    }

    return clipNames;
  }

  private _createTargetConverter(state: CharacterState): {
    converter: (sourceTarget: unknown) => TransformNode | AbstractMesh | Bone | null;
    unmatchedBones: Set<string>;
  } {
    const nodesByName = new Map<string, TransformNode | AbstractMesh>();
    const nodesByNormalizedName = new Map<string, TransformNode | AbstractMesh>();
    const registerNode = (
      node: (TransformNode | AbstractMesh) | null | undefined,
      aliasName: string | null = null,
    ): void => {
      if (!node?.name) return;
      nodesByName.set(node.name, node);
      const normalizedNodeName = normalizeTargetName(node.name);
      if (normalizedNodeName && !nodesByNormalizedName.has(normalizedNodeName)) {
        nodesByNormalizedName.set(normalizedNodeName, node);
      }
      const normalizedAlias = normalizeTargetName(aliasName);
      if (normalizedAlias && !nodesByNormalizedName.has(normalizedAlias)) {
        nodesByNormalizedName.set(normalizedAlias, node);
      }
    };

    const skipNames = new Set(
      ["__root__", state.rootNode?.name, state.mesh?.name].filter(
        (value): value is string => Boolean(value),
      ),
    );
    const normalizedSkipNames = new Set(
      [...skipNames].map((name) => normalizeTargetName(name)).filter(Boolean),
    );
    normalizedSkipNames.add("root");
    normalizedSkipNames.add("rootnode");
    normalizedSkipNames.add("rootm");

    const shouldRegister = (node: { name?: string | null } | null | undefined): boolean => {
      if (!node?.name) return false;
      if (skipNames.has(node.name)) return false;
      const normalized = normalizeTargetName(node.name);
      return !(normalized && normalizedSkipNames.has(normalized));
    };

    const bonesByName = new Map<string, Bone>();
    const bonesByNormalizedName = new Map<string, Bone>();
    const bonesByAlias = new Map<string, Bone>();
    const skeletons =
      state.skeletons.length
        ? state.skeletons
        : state.mesh?.skeleton
          ? [state.mesh.skeleton]
          : [];

    const boneNames: string[] = [];
    for (const skeleton of skeletons) {
      for (const bone of skeleton.bones) {
        if (!bone.name) continue;
        if (skipNames.has(bone.name)) continue;
        const normalizedBoneName = normalizeTargetName(bone.name);
        if (normalizedBoneName && normalizedSkipNames.has(normalizedBoneName)) {
          continue;
        }

        boneNames.push(bone.name);
        bonesByName.set(bone.name, bone);
        if (normalizedBoneName && !bonesByNormalizedName.has(normalizedBoneName)) {
          bonesByNormalizedName.set(normalizedBoneName, bone);
        }

        const aliasKey = resolveBoneAlias(normalizedBoneName);
        if (aliasKey && !bonesByAlias.has(aliasKey)) {
          bonesByAlias.set(aliasKey, bone);
        }

        for (const prefix of MIXAMO_PREFIXES) {
          const prefixedName = `${prefix}:${normalizedBoneName}`;
          if (!bonesByName.has(prefixedName)) {
            bonesByName.set(prefixedName, bone);
          }
        }

        const transformNode = bone.getTransformNode();
        if (transformNode?.name && shouldRegister(transformNode)) {
          registerNode(transformNode, bone.name);
        }
      }
    }

    console.log(
      `[AnimationController] Registered bones:`,
      boneNames.slice(0, 10).join(", "),
      boneNames.length > 10 ? `... (${boneNames.length} total)` : "",
    );

    for (const node of state.rootNode ? state.rootNode.getChildTransformNodes(false) : []) {
      if (shouldRegister(node)) registerNode(node);
    }
    for (const mesh of state.rootNode ? state.rootNode.getChildMeshes(false) : []) {
      if (shouldRegister(mesh)) registerNode(mesh);
    }

    console.log(
      `[AnimationController] targetConverter built — ${nodesByName.size} scene nodes, ${bonesByName.size} skeleton bones`,
    );

    const unmatchedBones = new Set<string>();
    const converter = (sourceTarget: unknown): TransformNode | AbstractMesh | Bone | null => {
      const target = sourceTarget as NamedTarget | null | undefined;
      const name = target?.name;
      if (!name) return null;
      if (skipNames.has(name)) return null;

      const normalizedName = normalizeTargetName(name);
      if (normalizedName && normalizedSkipNames.has(normalizedName)) return null;

      const node =
        nodesByName.get(name) ??
        nodesByNormalizedName.get(normalizedName) ??
        null;
      if (node) return node;

      for (const prefix of MIXAMO_PREFIXES) {
        const prefixedName = `${prefix}:${normalizedName}`;
        const prefixedNode =
          nodesByName.get(prefixedName) ??
          nodesByNormalizedName.get(normalizedName) ??
          null;
        if (prefixedNode) return prefixedNode;
      }

      let bone =
        bonesByName.get(name) ??
        bonesByNormalizedName.get(normalizedName) ??
        null;
      if (!bone) {
        const aliasKey = resolveBoneAlias(normalizedName);
        bone = bonesByAlias.get(aliasKey) ?? null;
      }
      if (!bone) {
        for (const prefix of MIXAMO_PREFIXES) {
          const prefixedName = `${prefix}:${normalizedName}`;
          bone = bonesByName.get(prefixedName) ?? null;
          if (bone) break;
        }
      }
      if (bone) {
        return bone.getTransformNode() ?? bone;
      }

      unmatchedBones.add(name);
      return null;
    };

    return { converter, unmatchedBones };
  }
}
