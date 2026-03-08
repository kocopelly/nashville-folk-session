#!/usr/bin/env tsx
/**
 * Validate tunes.json and sessions.json against Zod schemas.
 * Run: npm run validate
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TuneRegistry, SessionLog, type Session } from "../data/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../data");

let errors = 0;

// ── Validate tunes ──────────────────────────────────────────
console.log("Validating tunes.json...");
const rawTunes = JSON.parse(readFileSync(resolve(dataDir, "tunes.json"), "utf-8"));
const tunesResult = TuneRegistry.safeParse(rawTunes);

if (!tunesResult.success) {
  console.error("❌ tunes.json validation failed:");
  for (const issue of tunesResult.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  errors++;
} else {
  const count = Object.keys(tunesResult.data).length;
  console.log(`✅ tunes.json — ${count} tunes valid`);
}

// ── Validate sessions ───────────────────────────────────────
console.log("Validating sessions.json...");
const rawSessions = JSON.parse(readFileSync(resolve(dataDir, "sessions.json"), "utf-8"));
const sessionsResult = SessionLog.safeParse(rawSessions);

if (!sessionsResult.success) {
  console.error("❌ sessions.json validation failed:");
  for (const issue of sessionsResult.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  errors++;
} else {
  console.log(`✅ sessions.json — ${sessionsResult.data.length} sessions valid`);

  // Cross-reference: check all tune IDs in sessions exist in tunes
  if (tunesResult.success) {
    const tuneIds = new Set(Object.keys(tunesResult.data));
    const missing: string[] = [];

    for (const session of sessionsResult.data as Session[]) {
      for (const set of session.sets) {
        for (const tuneId of set.tunes) {
          if (!tuneIds.has(tuneId)) {
            missing.push(`${session.id} references unknown tune: ${tuneId}`);
          }
        }
      }
    }

    if (missing.length > 0) {
      console.error("❌ Dangling tune references:");
      for (const m of missing) console.error(`  - ${m}`);
      errors++;
    } else {
      console.log("✅ All tune references valid");
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} validation error(s) found.`);
  process.exit(1);
} else {
  console.log("\n🎻 All data valid!");
}
