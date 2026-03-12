#!/usr/bin/env node
/**
 * Migrate tune IDs from auto-increment (tune_001) to slug-nanoid (sheep-in-the-boat-x7k2m).
 *
 * - Reads data/tunes.json and data/sessions.json
 * - Generates new kebab-case slug + 5-char nanoid for each tune
 * - Rewrites both files with new IDs
 * - Writes a mapping file (scripts/id-mapping.json) for reference
 *
 * Usage: node scripts/migrate-tune-ids.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { customAlphabet } from 'nanoid';

const DRY_RUN = process.argv.includes('--dry-run');
const NANOID_LENGTH = 5;
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', NANOID_LENGTH);

// --- Helpers ---

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')           // remove apostrophes
    .replace(/[^a-z0-9]+/g, '-')    // non-alphanum → hyphen
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens
}

function generateNewId(name) {
  const slug = slugify(name);
  const nid = nanoid(NANOID_LENGTH).toLowerCase();
  return `${slug}-${nid}`;
}

// --- Load data ---

const tunesPath = 'data/tunes.json';
const sessionsPath = 'data/sessions.json';

const tunes = JSON.parse(readFileSync(tunesPath, 'utf-8'));
const sessions = JSON.parse(readFileSync(sessionsPath, 'utf-8'));

// --- Build mapping: old ID → new ID ---

const idMap = {};
const newTunes = {};

for (const [oldId, tune] of Object.entries(tunes)) {
  const newId = generateNewId(tune.name);
  idMap[oldId] = newId;

  newTunes[newId] = {
    ...tune,
    id: newId,
  };
}

// --- Remap session tune references ---

let refsUpdated = 0;

for (const session of sessions) {
  for (const set of session.sets || []) {
    for (const tuneRef of set.tunes || []) {
      const oldId = tuneRef.tuneId;
      if (idMap[oldId]) {
        tuneRef.tuneId = idMap[oldId];
        refsUpdated++;
      } else {
        console.warn(`⚠️  Unknown tuneId in session ${session.id}, set: ${oldId}`);
      }
    }
  }
}

// --- Report ---

console.log(`Migrated ${Object.keys(idMap).length} tune IDs`);
console.log(`Updated ${refsUpdated} session references`);
console.log(`\nSample mappings:`);
const samples = Object.entries(idMap).slice(0, 5);
for (const [old, nw] of samples) {
  console.log(`  ${old} → ${nw}`);
}

if (DRY_RUN) {
  console.log('\n--dry-run: no files written.');
  process.exit(0);
}

// --- Write ---

writeFileSync(tunesPath, JSON.stringify(newTunes, null, 2) + '\n', 'utf-8');
writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2) + '\n', 'utf-8');
writeFileSync('scripts/id-mapping.json', JSON.stringify(idMap, null, 2) + '\n', 'utf-8');

console.log('\n✅ Written: data/tunes.json, data/sessions.json, scripts/id-mapping.json');
