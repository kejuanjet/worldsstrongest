const fs = require('fs');

const file = 'src/core/CharacterRegistry.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove ENEMY_WEAPON_POOL
content = content.replace(/static ENEMY_WEAPON_POOL: string\[\] = \[[^\]]*\];?/, '');

// 2. Remove _normalizeImportedCharacterScale
content = content.replace(/private _normalizeImportedCharacterScale[\s\S]*?this\.scene, state, scale\);\r?\n\r?\n    \/\/ 6. Wait for matrices to update and re-measure[\s\S]*?state\._correctScaling = state\.rootNode\.scaling\.clone\(\);\r?\n  }/, '');

// 3. Remove _buildCharacterMesh
content = content.replace(/private async _buildCharacterMesh[\s\S]*?state\.auraSystem = null;\r?\n  }/, '');

// 4. Remove _spawnAura (if it exists)
content = content.replace(/private _spawnAura[\s\S]*?this\._updateAuraColor\(state, \w+\);?\r?\n  }/, '');

// 5. Remove _attachWeaponForState
content = content.replace(/private async _attachWeaponForState[\s\S]*?console\.log\(\`\[CharacterRegistry\] Attached \$\{weapId\} to slot \$\{state\.slot\}\`\);\r?\n  }/, '');

// 6. Remove _resolveWeaponAssetId
content = content.replace(/private _resolveWeaponAssetId[\s\S]*?return pool\[Math\.floor\(Math\.random\(\) \* pool\.length\)\]!;\r?\n    }\r?\n  }/, '');

// 7. Replace the imports added for MeshBuilder
content = content.replace(/import \{[\s\S]*?\} from "@babylonjs\/core";/, 'import { Vector3, Color4, TransformNode, type AbstractMesh, type AnimationGroup, type Skeleton, type Scene } from "@babylonjs/core";');
content = content.replace(/import \{ ASSET_MANIFEST, resolveAssetUrl, resolveSceneSource \} from "\.\/AssetLoader\.js";/, 'import { resolveAssetUrl, resolveSceneSource } from "./AssetLoader.js";');

fs.writeFileSync(file, content);
console.log('Stripped Mesh builder functions');
