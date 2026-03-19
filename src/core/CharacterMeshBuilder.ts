import {
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  TransformNode,
  SceneLoader,
  type AbstractMesh,
  type AnimationGroup,
  type Scene,
} from "@babylonjs/core";
import { getEnemyDef } from "../ai/EnemyRegistry.js";
import { ASSET_MANIFEST, resolveAssetUrl, resolveSceneSource } from "./AssetLoader.js";
import {
  configureCharacterMesh,
  selectPrimaryRenderableMesh,
  toTargetPropertyPath,
} from "./utils/animationUtils.js";

const CHARACTER_MIN_HEIGHT_M = 1.6256; // 5'4"
const CHARACTER_MAX_HEIGHT_M = 2.1336; // 7'0"
const DEFAULT_CHARACTER_HEIGHT_M = 1.82;
const MODEL_HEIGHT_OVERRIDES_M: Record<string, number> = {
  "/assets/models/ayo.glb": 1.8288,
};

export const ENEMY_WEAPON_POOL: string[] = [
  "weapon_ayoskatana",
  "weapon_katana",
  "weapon_neon_blade",
  "weapon_night_sword",
];

// Ensure we have access to the PlayerState interface without circular imports
// We'll use 'any' for now since PlayerState is internal to CharacterRegistry
type PlayerState = any;

export class CharacterMeshBuilder {
  static async buildCharacterMesh(scene: Scene, state: PlayerState): Promise<void> {
    const root = new TransformNode(`player_${state.slot}_root`, scene);
    root.position.copyFrom(state.position);
    state.rootNode = root;

    try {
      const resolvedModelPath = await resolveAssetUrl(state.characterDef.modelPath);
      const importSource = await resolveSceneSource(state.characterDef.modelPath);
      console.log(`[CharacterMeshBuilder] Loading model from: ${state.characterDef.modelPath} -> ${resolvedModelPath}`);

      const result = await SceneLoader.ImportMeshAsync("", importSource.rootUrl, importSource.sceneFilename, scene);

      result.meshes.forEach(m => {
        if (!m.parent) m.parent = root;
        const hasVertices = m.getTotalVertices() > 0;
        CharacterMeshBuilder.configureCharacterMesh(m, { forceActiveSelection: hasVertices });
      });

      state.mesh = CharacterMeshBuilder.selectPrimaryRenderableMesh(result.meshes);
      state.characterMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
      if (!state.characterMeshes.length) {
        state.characterMeshes = result.meshes.filter(Boolean);
      }

      CharacterMeshBuilder.sanitizeImportedAnimationGroups(result.animationGroups);
      result.animationGroups.forEach((g: any) => {
        g.goToFrame(0);
        g.stop();
        g.weight = 0;
      });

      state.animationGroups = result.animationGroups;
      state.skeletons = result.skeletons;

      CharacterMeshBuilder.normalizeImportedCharacterScale(scene, state, result.meshes);

    } catch (err: any) {
      console.warn(`[CharacterMeshBuilder] Model not found for ${state.characterId}: ${err.message}`);
      const capsule = MeshBuilder.CreateCapsule(
        `player_${state.slot}_mesh`,
        { height: 2, radius: 0.4 },
        scene
      );
      capsule.parent = root;
      (capsule as any).isCharacter = true;
      capsule.isPickable = false;
      (capsule as any).alwaysSelectAsActiveMesh = true;

      const mat = new StandardMaterial(`player_${state.slot}_mat`, scene);
      const slotColors = [Color3.Blue(), Color3.Red(), Color3.Yellow(), Color3.Green()];
      const fallbackColor = slotColors[state.slot % slotColors.length] ?? Color3.White();
      mat.diffuseColor = fallbackColor;
      capsule.material = mat;

      state.mesh = capsule;
      state.characterMeshes = [capsule];
      state.animationGroups = [];
      state.skeletons = [];
    }

    // Aura visuals are handled by AuraSystem; clear the duplicate logic
    state.auraSystem = null;
  }

  static async attachWeaponForState(scene: Scene, state: PlayerState): Promise<void> {
    const supportsSword = (state.characterDef.stances ?? []).includes("SWORD");
    if (!supportsSword) return;

    const weapId = CharacterMeshBuilder.resolveWeaponAssetId(state);
    const weapDef = ASSET_MANIFEST.models.find(m => m.id === weapId);
    if (!weapDef) return;

    let weapResult: any;
    try {
      await resolveAssetUrl(weapDef.path);
      const importSource = await resolveSceneSource(weapDef.path);
      weapResult = await SceneLoader.ImportMeshAsync("", importSource.rootUrl, importSource.sceneFilename, scene);
    } catch (err: any) {
      console.warn(`[CharacterMeshBuilder] Could not load weapon ${weapId}:`, err.message);
      return;
    }

    const skeleton = (state.mesh as any)?.skeleton ?? null;
    let handBone: any = null;
    if (skeleton) {
      const exactNames = [
        "mixamorig:RightHand", "mixamorig9Character:RightHand",
        "RightHand", "Hand_R", "hand_r", "Bip01_R_Hand", "Wrist_R",
      ];
      for (const name of exactNames) {
        handBone = skeleton.bones.find((b: any) => b.name === name) ?? null;
        if (handBone) break;
      }
      if (!handBone) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const fingerKw = ["index", "middle", "ring", "pinky", "thumb", "finger"];
        handBone = skeleton.bones.find((b: any) => {
          const n = norm(b.name);
          const isHand = n.includes("righthand") || n.includes("handr") || n.endsWith("rhand");
          return isHand && !fingerKw.some(k => n.includes(k));
        }) ?? null;
      }
    }

    const realMeshes = weapResult.meshes.filter((m: AbstractMesh) => m.getTotalVertices() > 0);
    let naturalLength = 1.0;
    if (realMeshes.length > 0) {
      let minV = new Vector3(Infinity, Infinity, Infinity);
      let maxV = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const m of realMeshes) {
        m.computeWorldMatrix(true);
        const bi = m.getBoundingInfo();
        minV.minimizeInPlace(bi.boundingBox.minimumWorld);
        maxV.maximizeInPlace(bi.boundingBox.maximumWorld);
      }
      const diag = maxV.subtract(minV);
      naturalLength = Math.max(diag.x, diag.y, diag.z);
    }

    const desiredLengthM = 0.85 * ((state.characterDef.desiredHeightM ?? 1.82) / 1.82);
    const uniformScale = naturalLength > 0.001 ? desiredLengthM / naturalLength : 0.01;

    const weaponRoot = new TransformNode(`weapon_${state.slot}`, scene);
    if (handBone && state.mesh) {
      weaponRoot.parent = state.mesh;
      weaponRoot.attachToBone(handBone, state.mesh);
    } else {
      weaponRoot.parent = state.rootNode;
      weaponRoot.position = new Vector3(0.4, 1.0, 0.2);
    }

    const importedRoot = weapResult.meshes[0];
    if (importedRoot) {
      importedRoot.parent = weaponRoot;
      importedRoot.position = Vector3.Zero();
      importedRoot.rotationQuaternion = null;
      importedRoot.rotation = Vector3.Zero();
      importedRoot.scaling = new Vector3(uniformScale, uniformScale, uniformScale);
    } else {
      weapResult.meshes.forEach((m: any) => {
        m.parent = weaponRoot;
        m.scaling = new Vector3(uniformScale, uniformScale, uniformScale);
      });
    }

    state.weaponNode = weaponRoot;
    state.weaponNode.setEnabled(state.currentStance === "SWORD");
  }

  static resolveWeaponAssetId(state: PlayerState): string {
    const enemyDef = state.enemyDefId ? getEnemyDef(state.enemyDefId) : null;
    if ((enemyDef as any)?.weaponForced) return (enemyDef as any).weaponForced;

    switch (state.characterId) {
      case "AYO": return "weapon_ayoskatana";
      case "LEBRON": return "weapon_neon_blade";
      case "AKADEMIKS": return "weapon_katana";
      case "OPP": return "weapon_night_sword";
      default: return ENEMY_WEAPON_POOL[Math.floor(Math.random() * ENEMY_WEAPON_POOL.length)]!;
    }
  }

  static normalizeImportedCharacterScale(scene: Scene, state: PlayerState, meshes: AbstractMesh[]): void {
    const allMeshes = meshes.filter(Boolean);
    const renderMeshes = allMeshes.filter((mesh) =>
      mesh.isEnabled() !== false &&
      mesh.isVisible !== false &&
      mesh.getTotalVertices() > 0
    );

    if (!state.rootNode || !renderMeshes.length) return;

    state.rootNode.computeWorldMatrix(true);
    renderMeshes.forEach(m => {
      m.computeWorldMatrix(true);
      m.refreshBoundingInfo({});
    });

    const bounds = CharacterMeshBuilder.getMeshBounds(renderMeshes);
    if (!bounds) return;

    const currentHeight = bounds.max.y - bounds.min.y;
    if (!(currentHeight > 0.001)) return;

    const desiredHeight = MODEL_HEIGHT_OVERRIDES_M[state.characterDef.modelPath]
      ?? state.characterDef.desiredHeightM
      ?? DEFAULT_CHARACTER_HEIGHT_M;
    const targetHeight = Math.min(
      CHARACTER_MAX_HEIGHT_M,
      Math.max(CHARACTER_MIN_HEIGHT_M, desiredHeight)
    );
    const scale = targetHeight / currentHeight;

    state.rootNode.scaling.setAll(scale);
    CharacterMeshBuilder.ensureFxNode(scene, state, scale);

    state.rootNode.computeWorldMatrix(true);
    renderMeshes.forEach(m => {
      m.computeWorldMatrix(true);
      m.refreshBoundingInfo({});
    });

    const scaledBounds = CharacterMeshBuilder.getMeshBounds(renderMeshes);
    if (!scaledBounds) return;

    const glbRoot = allMeshes.find(m => m.parent === state.rootNode) ?? renderMeshes[0];
    if (glbRoot) {
      const feetWorldY = scaledBounds.min.y;
      const targetFeetY = state.rootNode.position.y;
      const worldDelta = targetFeetY - feetWorldY;

      if (Math.abs(worldDelta) > 0.0001) {
        const effectiveScaleY = Math.max(state.rootNode.scaling.y * glbRoot.scaling.y, 0.0001);
        glbRoot.position.y += worldDelta / effectiveScaleY;
      }
    }

    state.rootNode.computeWorldMatrix(true);
    renderMeshes.forEach(m => m.computeWorldMatrix(true));

    state._correctScaling = state.rootNode.scaling.clone();
  }

  static ensureFxNode(scene: Scene, state: PlayerState, visualScale: number = 1): void {
    if (!state.rootNode) return;
    if (!state.fxNode || state.fxNode.isDisposed()) {
      state.fxNode = new TransformNode(`player_${state.slot}_fx`, scene);
      state.fxNode.parent = state.rootNode;
      state.fxNode.position.set(0, 0, 0);
    }
    const inverseScale = 1 / Math.max(visualScale, 0.0001);
    state.fxNode.scaling.setAll(inverseScale);
  }

  static getMeshBounds(meshes: AbstractMesh[]): { min: Vector3; max: Vector3 } | null {
    let min: Vector3 | null = null;
    let max: Vector3 | null = null;
    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const info = mesh.getBoundingInfo();
      const box = info.boundingBox;

      const meshMin = box.minimumWorld;
      const meshMax = box.maximumWorld;

      if (!min) {
        min = meshMin.clone();
        max = meshMax.clone();
        continue;
      }

      min.x = Math.min(min.x, meshMin.x);
      min.y = Math.min(min.y, meshMin.y);
      min.z = Math.min(min.z, meshMin.z);
      max!.x = Math.max(max!.x, meshMax.x);
      max!.y = Math.max(max!.y, meshMax.y);
      max!.z = Math.max(max!.z, meshMax.z);
    }
    return min && max ? { min, max } : null;
  }

  static sanitizeImportedAnimationGroups(animationGroups: AnimationGroup[] = []): void {
    for (const group of animationGroups) {
      const targeted = Array.isArray((group as any)?.targetedAnimations) ? (group as any).targetedAnimations : null;
      if (!targeted?.length) continue;

      for (let i = targeted.length - 1; i >= 0; i -= 1) {
        const targetProp = targeted[i]?.animation?.targetPropertyPath;
        const path = toTargetPropertyPath(targetProp);
        
        if (!path.length) continue;

        const normalizedPath = path.map((part: string) => String(part).toLowerCase());
        const hidesMesh = normalizedPath.includes("visibility") || normalizedPath.includes("isvisible");
        const togglesEnabled = normalizedPath.includes("enabled") || normalizedPath.includes("setenabled");
        if (hidesMesh || togglesEnabled) {
          targeted.splice(i, 1);
        }
      }
    }
  }

  static selectPrimaryRenderableMesh(meshes: AbstractMesh[] = []): AbstractMesh | null {
    return selectPrimaryRenderableMesh(meshes);
  }

  static configureCharacterMesh(mesh: any, { forceActiveSelection = false } = {}): void {
    configureCharacterMesh(mesh, { forceActiveSelection });
  }
}
