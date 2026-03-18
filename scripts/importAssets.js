// scripts/importAssets.js
// Utility to copy a batch of .glb files from an external source into the project's
// `public` folder and generate ASSET_MANIFEST entries for them. Run with
//    node scripts/importAssets.js
// Adjust the paths array below to whatever folders you need to sync.

const fs = require('fs');
const path = require('path');

// root of the game project
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEST_ROOT    = path.join(PROJECT_ROOT, 'public', 'assets');

// list of source files (absolute). you can easily extend/modify this list manually
const sources = [
  // melee
  'C:/Users/aubre/Downloads/BABYLONEAI/Attack Melee/Hook Punch.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Attack Melee/Hurricane Kick.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Attack Melee/Kicking.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Attack Melee/Mma Kick.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Attack Melee/Punch To Elbow Combo.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Attack Melee/Quad Punch.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Attack Melee/Uppercut Jab.glb',

  // blocking
  'C:/Users/aubre/Downloads/BABYLONEAI/Blocking/jump.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Blocking/Standing Block Idle.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/blocks/Inward Block.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/blocks/Standing Block Idle.glb',

  // dying
  'C:/Users/aubre/Downloads/BABYLONEAI/DYING/Dying (1).glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/DYING/Dying (2).glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/DYING/Dying.glb',

  // locomotion
  'C:/Users/aubre/Downloads/BABYLONEAI/flight/Flying.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/Backflip.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/Dodging Left(1).glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/Dodging Right.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/idle.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/jump.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/left strafe walking.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/left strafe.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/left turn 90.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/left turn.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/right strafe walking.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/right strafe.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/right turn 90.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/right turn.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/running.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Locomotion/Walking.glb',

  // models
  'C:/Users/aubre/Downloads/BABYLONEAI/models/Akademiks.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/models/ayo.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/models/hana.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/models/RAYNEFBX.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/models/Jelly roll.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/models/Lebron.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/models/opp.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/public/enemies/Akademiks.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/public/enemies/Granny.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/public/enemies/Jelly roll.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/public/full_gameready_city_buildings.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/public/weapons/ayoskatana.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/public/weapons/katana.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/public/weapons/neo-arc_blade__sci-fi_energy_sword.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/public/weapons/night_sky_sword.glb',

  // ki/beam
  'C:/Users/aubre/Downloads/BABYLONEAI/Specials/aura boomerang.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Specials/Casting Spell.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Specials/Magic Heal.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Specials/Magic Spell Casting.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Specials/SpecialMove_004_00_All_VFX.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Specials/Standing 2H Magic Attack 03.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/Specials/Two Hand Spell Casting.glb',

  // swords
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/Great Sword Strafe.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/Great Sword Walk.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/Run With Sword.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/Sheathing Sword.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/Spell cast with Sword.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword locomotion/casting spell with one hand sword in the other hand.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword locomotion/Great Sword Strafe.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword locomotion/Great Sword Walk.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword locomotion/Run With Sword.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword locomotion/Sheathing Sword.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword locomotion/Two Handed Sword Death.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword locomotion/Withdrawing Sword.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword melee/Great Sword Jump Attack.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword melee/Great Sword Slash.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword melee/Stable Sword In Slash.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword melee/Stable Sword Out Slash.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword ranged/Great Sword Slash Whilrwind.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword ranged/Stable Sword Inward Slash.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/sword ranged/Stable Sword Outward ShockwaveSlash.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/Two Handed Sword Death.glb',
  'C:/Users/aubre/Downloads/BABYLONEAI/swords animations/Withdrawing Sword.glb',
];

// helper to copy and return relative path
function copyFile(src) {
  const fileName = path.basename(src);
  const destDir = DEST_ROOT;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, fileName);
  fs.copyFileSync(src, destPath);
  return path.relative(PROJECT_ROOT, destPath).replace(/\\/g, '/');
}

// build manifest lines
const manifestEntries = [];
for (const src of sources) {
  try {
    const relPath = copyFile(src);
    const id = path.basename(src, path.extname(src)).replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    manifestEntries.push(`{ id: "${id}", path: "/${relPath}" }`);
  } catch (err) {
    console.error('failed to copy', src, err.message);
  }
}

console.log(`Done copying. Add following entries to ASSET_MANIFEST.models or appropriate section in src/core/AssetLoader.js:`);
console.log(manifestEntries.join(',\n'));
