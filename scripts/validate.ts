#!/usr/bin/env tsx
/**
 * Validate tunes.json and sessions.json against Zod schemas.
 * Run: npm run validate
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TuneRegistry, SeriesRegistry, SessionLog, type Session } from "../data/schema.js";

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

// ── Validate series ─────────────────────────────────────────
console.log("Validating series.json...");
const rawSeries = JSON.parse(readFileSync(resolve(dataDir, "series.json"), "utf-8"));
const seriesResult = SeriesRegistry.safeParse(rawSeries);

if (!seriesResult.success) {
  console.error("❌ series.json validation failed:");
  for (const issue of seriesResult.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  errors++;
} else {
  const count = Object.keys(seriesResult.data).length;
  console.log(`✅ series.json — ${count} series valid`);
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

  // ── Duplicate detection ──────────────────────────────────
  // Tunes with known duplicate names that are genuinely different tunes.
  // Add entries as "name|type" (lowercased) to suppress the name+type check.
  const allowedNameTypeDupes = new Set<string>([
    // e.g. "paddy fahey's|reel" if we ever track multiple Fahey's
  ]);

  if (tunesResult.success) {
    // 1) Same external ID = always a dupe (thesession, tta, etc.)
    const externalIndex = new Map<string, string[]>();
    for (const [tuneId, tune] of Object.entries(tunesResult.data)) {
      const ext = (tune as any).external ?? {};
      for (const [provider, id] of Object.entries(ext)) {
        if (id == null) continue;
        const key = `${provider}:${id}`;
        if (!externalIndex.has(key)) externalIndex.set(key, []);
        externalIndex.get(key)!.push(tuneId);
      }
    }
    const extDupes = [...externalIndex.entries()].filter(([, ids]) => ids.length > 1);
    if (extDupes.length > 0) {
      console.error("❌ Duplicate external IDs:");
      for (const [key, ids] of extDupes) {
        console.error(`  - ${key} → ${ids.join(", ")}`);
      }
      errors++;
    } else {
      console.log("✅ No duplicate external IDs");
    }

    // 2) Same name + type = likely a dupe (catches tunes without external IDs)
    const nameTypeIndex = new Map<string, string[]>();
    for (const [tuneId, tune] of Object.entries(tunesResult.data)) {
      const t = tune as any;
      const key = `${t.name.toLowerCase().trim()}|${t.type}`;
      if (!nameTypeIndex.has(key)) nameTypeIndex.set(key, []);
      nameTypeIndex.get(key)!.push(tuneId);
    }
    const nameTypeDupes = [...nameTypeIndex.entries()].filter(
      ([key, ids]) => ids.length > 1 && !allowedNameTypeDupes.has(key)
    );
    if (nameTypeDupes.length > 0) {
      console.error("❌ Duplicate name+type (add to allowlist in validate.ts if intentional):");
      for (const [key, ids] of nameTypeDupes) {
        console.error(`  - "${key}" → ${ids.join(", ")}`);
      }
      errors++;
    } else {
      console.log("✅ No duplicate name+type combos");
    }
  }

  // Cross-reference: check all tune IDs in sessions exist in tunes
  if (tunesResult.success) {
    const tuneIds = new Set(Object.keys(tunesResult.data));
    const missing: string[] = [];

    for (const session of sessionsResult.data as Session[]) {
      for (const set of session.sets) {
        for (const entry of set.tunes) {
          const tuneId = typeof entry === "string" ? entry : entry.tuneId;
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

  // Cross-reference: check all seriesId in sessions exist in series
  if (seriesResult.success) {
    const seriesIds = new Set(Object.keys(seriesResult.data));
    const missingSeries: string[] = [];

    for (const session of sessionsResult.data as Session[]) {
      if (!seriesIds.has(session.seriesId)) {
        missingSeries.push(`${session.id} references unknown series: ${session.seriesId}`);
      }
    }

    if (missingSeries.length > 0) {
      console.error("❌ Dangling series references:");
      for (const m of missingSeries) console.error(`  - ${m}`);
      errors++;
    } else {
      console.log("✅ All series references valid");
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} validation error(s) found.`);
  process.exit(1);
} else {
  console.log("\n🎻 All data valid!");
}
