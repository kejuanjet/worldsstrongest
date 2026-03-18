import {
  Color3,
  MeshBuilder,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { resolveAssetUrl, resolveSceneSource } from "../AssetLoader.js";

// Target world extent for auto-scaled zone models (meters).
// Spawn points are typically within ±30 units, so 200m across is comfortable.
const TARGET_ZONE_EXTENT = 200;

export async function loadZoneGeometry(scene, def) {
  const root = new TransformNode(`zone_root_${def.id}`, scene);

  try {
    if (!def.modelPath) throw new Error("No modelPath provided");
    
    const resolvedModelPath = await resolveAssetUrl(def.modelPath);
    const importSource = await resolveSceneSource(def.modelPath);

    const result = await SceneLoader.ImportMeshAsync(
      "",
      importSource.rootUrl,
      importSource.sceneFilename,
      scene
    );

    result.meshes.forEach((mesh) => {
      if (!mesh.parent) mesh.parent = root;
      mesh.isPickable = true;   // allow ground raycasts
    });

    // Hide root while the (potentially slow) bounding-box scan runs so there
    // is no flash of unscaled geometry before the scale is applied.
    root.setEnabled(false);
    await _normalizeScale(def, result.meshes, root);
    root.setEnabled(true);

  } catch (err) {
    console.warn(`[ZoneLoader] Failed to load zone geometry:`, err);
    
    // Fallback ground if model fails to load
    const ground = MeshBuilder.CreateGround("fallbackGround", { width: TARGET_ZONE_EXTENT, height: TARGET_ZONE_EXTENT }, scene);
    ground.parent = root;
    ground.isPickable = true;
    const mat = new StandardMaterial("fallbackMat", scene);
    mat.diffuseColor = def.ambientColor || new Color3(0.2, 0.8, 0.2);
    ground.material = mat;
  }

  if (def.isTrainingZone) {
    _buildTrainingFeatures(scene, def, root);
  }

  return root;
}

export function unloadZoneRoot(root) {
  root?.dispose();
}

async function _normalizeScale(def, meshes, root) {
  if (def.cityScale && def.cityScale !== 1.0) {
    root.scaling.setAll(def.cityScale);
    return;
  }

  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);

  // Process in chunks and yield to the event loop between them so a large
  // city model's bounding-box scan doesn't block the main thread.
  const CHUNK = 50;
  for (let i = 0; i < meshes.length; i++) {
    meshes[i].computeWorldMatrix(true);
    const info = meshes[i].getBoundingInfo();
    if (info) {
      min.minimizeInPlace(info.boundingBox.minimumWorld);
      max.maximizeInPlace(info.boundingBox.maximumWorld);
    }
    if ((i + 1) % CHUNK === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  const extentX = max.x - min.x;
  const extentZ = max.z - min.z;
  const largestExtent = Math.max(extentX, extentZ);

  if (largestExtent < 0.01) return;

  const targetExtent = def.targetExtent ?? TARGET_ZONE_EXTENT;
  const scale = targetExtent / largestExtent;

  // Only scale if the zone is wildly out of range (< 20m or > 2000m across) or if explicitly forced
  if (def.forceScaleToExtent || scale < 0.1 || scale > 10) {
    console.log(`[ZoneLoader] Scaled ${def.id}: native ${largestExtent.toFixed(1)}m → ${targetExtent}m (×${scale.toFixed(4)})`);
    root.scaling.setAll(scale);
  }
}

function _buildTrainingFeatures(scene, def, root) {
  const mat = new StandardMaterial("trainingPlatformMat", scene);
  mat.diffuseColor = new Color3(0.5, 0.5, 0.6);
  mat.alpha = 0.8;

  const spawnPoints = def.trainingSpawnPoints || [];
  
  // Procedural fallback if spawn points aren't configured
  if (spawnPoints.length === 0) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const radius = 15;
      spawnPoints.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
  }

  for (let i = 0; i < spawnPoints.length; i++) {
    const pos = spawnPoints[i];
    const platform = MeshBuilder.CreateCylinder(`trainingPlat_${i}`, { height: 0.2, diameter: 4 }, scene);
    platform.position = pos.clone();
    platform.position.y += 0.1;
    platform.parent = root;
    platform.material = mat;
    platform.isPickable = true;
  }
}