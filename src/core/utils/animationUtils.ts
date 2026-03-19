import { type AbstractMesh, Quaternion } from "@babylonjs/core";

/**
 * Normalizes an animation target property path into an array of string segments.
 */
export function toTargetPropertyPath(rawPath: any): string[] {
  if (Array.isArray(rawPath)) return rawPath.map((part) => String(part));
  if (typeof rawPath !== "string") return [];
  return rawPath
    .split(".")
    .map((part: string) => part.trim())
    .filter(Boolean);
}

/**
 * Normalizes a target name by stripping path/alias prefixes and special characters.
 */
export function normalizeTargetName(raw: string | null | undefined): string {
  if (!raw) return "";
  let value = String(raw).trim();
  const pipeIdx = value.lastIndexOf("|");
  if (pipeIdx >= 0) value = value.slice(pipeIdx + 1);
  const colonIdx = value.lastIndexOf(":");
  if (colonIdx >= 0) value = value.slice(colonIdx + 1);
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Heuristics to select the "best" primary renderable mesh from an array.
 */
export function selectPrimaryRenderableMesh(meshes: AbstractMesh[] = []): AbstractMesh | null {
  return meshes.find((mesh) => mesh.getTotalVertices() > 0 && mesh.skeleton)
    ?? meshes.find((mesh) => mesh.getTotalVertices() > 0)
    ?? meshes.find((mesh) => mesh.skeleton)
    ?? meshes[0]
    ?? null;
}

/**
 * Standard configuration for character meshes to ensure correct rendering.
 */
export function configureCharacterMesh(mesh: any, { forceActiveSelection = false } = {}): void {
  if (!mesh || mesh.isDisposed?.()) return;
  mesh.isCharacter = true;
  mesh.isPickable = false;
  mesh.isVisible = true;
  mesh.visibility = 1;
  mesh.setEnabled?.(true);
  mesh.alwaysSelectAsActiveMesh = forceActiveSelection;
  mesh.doNotSyncBoundingInfo = false;
  mesh.refreshBoundingInfo?.();
  mesh.computeWorldMatrix?.(true);
}
