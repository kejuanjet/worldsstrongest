const fs = require('fs');

const file = 'src/core/CharacterRegistry.ts';
let content = fs.readFileSync(file, 'utf8');

// The functions to remove.
// I will just use basic indexOf and string slicing since regex might fail on multiline content or miss braces.

function removeMethod(methodStartRegex, keepUntilRegex) {
    const match = content.match(methodStartRegex);
    if (!match) return;
    const startIndex = match.index;
    const part2 = content.substring(startIndex);
    const endMatch = part2.match(keepUntilRegex);
    if (endMatch) {
       const endIndex = startIndex + endMatch.index + endMatch[0].length;
       content = content.substring(0, startIndex) + content.substring(endIndex);
       console.log(`Removed method matching ${methodStartRegex.toString()}`);
    } else {
       console.log(`Failed to find end for ${methodStartRegex.toString()}`);
    }
}

content = content.replace(/static ENEMY_WEAPON_POOL: string\[\] = \[[^\]]*\];?/, '');

removeMethod(/private async _buildCharacterMesh[\s\S]{10,50}?\{/, /state\.auraSystem = null;\r?\n  \}/);
removeMethod(/private async _attachWeaponForState[\s\S]{10,50}?\{/, /console\.log\(\`\[CharacterRegistry\] Attached \$\{weapId\} to slot \$\{state\.slot\}\`\);\r?\n  \}/);
removeMethod(/private _resolveWeaponAssetId[\s\S]{10,50}?\{/, /return pool\[Math\.floor\(Math\.random\(\) \* pool\.length\)\]!;\r?\n    \}\r?\n  \}/);
removeMethod(/private _normalizeImportedCharacterScale[\s\S]{10,50}?\{/, /state\._correctScaling = state\.rootNode\.scaling\.clone\(\);\r?\n  \}/);
removeMethod(/private _getMeshBounds[\s\S]{10,50}?\{/, /return min && max \? \{ min, max \} : null;\r?\n  \}/);
removeMethod(/private _ensureFxNode[\s\S]{10,50}?\{/, /state\.fxNode\.scaling\.setAll\(inverseScale\);\r?\n  \}/);
removeMethod(/private _sanitizeImportedAnimationGroups[\s\S]{10,50}?\{/, /targeted\.splice\(i, 1\);\r?\n        \}\r?\n      \}\r?\n    \}\r?\n  \}/);
removeMethod(/private _selectPrimaryRenderableMesh[\s\S]{10,50}?\{/, /(\r?\n\s*\?\? null;\r?\n  \}|return meshes\[0\] ?? null;\r?\n  \})/);
removeMethod(/private _configureCharacterMesh[\s\S]{10,50}?\{/, /mesh\.computeWorldMatrix\?\(\w+\);\r?\n  \}/);


fs.writeFileSync(file, content);
console.log('Stripped Mesh builder functions successfully!');
