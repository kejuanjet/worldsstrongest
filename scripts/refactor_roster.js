import fs from 'fs';

const filePath = 'c:/Users/aubre/OneDrive/Documents/WORLDS STRONGEST/src/core/CharacterRegistry.ts';
let content = fs.readFileSync(filePath, 'utf8');

// The start string
const startStr = '// ─── Character Roster ─────────────────────────────────────────────────────────';
// The end string
const endStr = '  LEBRON: {\r\n'; // or something similar to find the end

// Easier string matching:
const match = content.match(/\/\/ ─── Character Roster ──[\s\S]*?LEBRON: {[\s\S]*?},\r?\n\};\r?\n/);
if (match) {
  content = content.replace(match[0], '');
  // Now add import at top
  const importStatement = 'import { CHARACTER_ROSTER } from "../data/CharacterRoster.js";\r\n';
  content = content.replace(/import { getEnemyDef/g, importStatement + 'import { getEnemyDef');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully extracted CHARACTER_ROSTER from CharacterRegistry.ts');
} else {
  console.log('Failed to match CHARACTER_ROSTER block.');
}
