// Scene initialisation: camera, lighting, and day/night cycle.
// Extracted from GameLoop to keep the main orchestrator thin.

import {
  ArcRotateCamera,
  Color3,
  DirectionalLight,
  HemisphericLight,
  Vector3,
} from "@babylonjs/core";
import { CONFIG } from "../../config/index.js";
import { DayNightCycleController } from "../environment/DayNightCycle.js";

/**
 * Create the camera, lights, and day-night cycle on the given scene.
 * Accepts an optional config object (defaults to global CONFIG) for easier testing.
 * Returns `{ camera, dayNightCycle }`.
 */
export function setupScene(scene, config = CONFIG) {
  scene.clearColor.set(0.18, 0.28, 0.52, 1);

  const camera = new ArcRotateCamera(
    "mainCamera",
    config.camera.defaultAlpha,
    config.camera.defaultBeta,
    config.camera.defaultRadius,
    new Vector3(0, config.camera.verticalOffset, 0),
    scene
  );
  camera.lowerRadiusLimit = config.camera.minRadius;
  camera.upperRadiusLimit = config.camera.maxRadius;
  camera.lowerBetaLimit   = config.camera.minBeta;
  camera.upperBetaLimit   = config.camera.maxBeta;
  camera.wheelPrecision   = 18;
  camera.fov              = config.camera.fov;
  camera.minZ             = 0.1;
  camera.inertia = 0.85;
  camera.angularSensibilityX = 1000;
  camera.angularSensibilityY = 1000;
  camera.pinchPrecision = 2000;
  camera.inputs.clear(); // All camera input handled by InputManager + RuntimeCameraController
  scene.activeCamera = camera;

  const hemi = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), scene);
  hemi.intensity = 1.1;
  hemi.diffuse = new Color3(0.88, 0.93, 1.0);
  hemi.groundColor = new Color3(0.25, 0.3, 0.45);

  const sun = new DirectionalLight("sunLight", new Vector3(-0.4, -1, -0.2), scene);
  sun.position = new Vector3(40, 80, 20);
  sun.intensity = 1.8;
  sun.diffuse = new Color3(1.0, 0.97, 0.92);

  const dayNightCycle = new DayNightCycleController(scene, hemi, sun, {
    cycleDurationSeconds: config.lighting.dayNightCycleSeconds,
    startTimeOfDay: config.lighting.startTimeOfDay,
  });

  return { camera, dayNightCycle };
}
