import { CONFIG } from "../core/index.js";
import { CAMERA_CONFIG } from "./camera.js";

// Merge extended camera tuning into the shared runtime config object so
// gameplay systems all read the same camera values.
Object.assign(CONFIG.camera, CAMERA_CONFIG);

export * from "../core/index.js";
export * from "./camera.js";
