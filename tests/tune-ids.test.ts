import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Tune, TuneRegistry, SessionLog, FeedLog } from '../data/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '../data');

const tunes = JSON.parse(readFileSync(resolve(dataDir, 'tunes.json'), 'utf-8'));
const sessions = JSON.parse(readFileSync(resolve(dataDir, 'sessions.json'), 'utf-8'));
const feeds = JSON.parse(readFileSync(resolve(dataDir, 'feeds.json'), 'utf-8'));

// ── ID Format ────────────────────────────────────────────────

const TUNE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)+$/;

describe('tune ID format', () => {
  it('every tune ID matches slug-nanoid pattern', () => {
    for (const [id, tune] of Object.entries(tunes)) {
      expect(id, `key "${id}" doesn't match pattern`).toMatch(TUNE_ID_PATTERN);
      expect((tune as any).id, `tune.id "${(tune as any).id}" doesn't match key`).toBe(id);
    }
  });

  it('no legacy tune_NNN IDs remain', () => {
    const legacyIds = Object.keys(tunes).filter(id => /^tune_\d+$/.test(id));
    expect(legacyIds, `Found legacy IDs: ${legacyIds.join(', ')}`).toHaveLength(0);
  });

  it('all IDs are unique (no collisions)', () => {
    const ids = Object.keys(tunes);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects tune_001 style IDs at schema level', () => {
    const badTune = {
      id: 'tune_001',
      name: 'Test Tune',
      type: 'reel',
      tradition: 'irish',
    };
    const result = Tune.safeParse(badTune);
    expect(result.success, 'tune_001 should fail schema validation').toBe(false);
  });

  it('accepts slug-nanoid IDs at schema level', () => {
    const goodTune = {
      id: 'test-tune-abc12',
      name: 'Test Tune',
      type: 'reel',
      tradition: 'irish',
    };
    const result = Tune.safeParse(goodTune);
    expect(result.success, 'slug-nanoid should pass schema validation').toBe(true);
  });
});

// ── Schema Validation ────────────────────────────────────────

describe('schema validation', () => {
  it('tunes.json passes TuneRegistry schema', () => {
    const result = TuneRegistry.safeParse(tunes);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema errors:\n${issues.join('\n')}`);
    }
  });

  it('sessions.json passes SessionLog schema', () => {
    const result = SessionLog.safeParse(sessions);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema errors:\n${issues.join('\n')}`);
    }
  });

  it('feeds.json passes FeedLog schema', () => {
    const result = FeedLog.safeParse(feeds);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      expect.fail(`Schema errors:\n${issues.join('\n')}`);
    }
  });
});

// ── Referential Integrity ────────────────────────────────────

describe('referential integrity', () => {
  const tuneIds = new Set(Object.keys(tunes));

  it('every tuneId in sessions resolves to a real tune', () => {
    const dangling: string[] = [];
    for (const session of sessions) {
      for (const set of session.sets) {
        for (const entry of set.tunes) {
          const tuneId = typeof entry === 'string' ? entry : entry.tuneId;
          if (!tuneIds.has(tuneId)) {
            dangling.push(`${session.id}: ${tuneId}`);
          }
        }
      }
    }
    expect(dangling, `Dangling refs:\n${dangling.join('\n')}`).toHaveLength(0);
  });

  it('every tuneId in feeds resolves to a real tune', () => {
    const dangling: string[] = [];
    for (const feed of feeds) {
      for (const set of feed.sets || []) {
        for (const entry of set.tunes) {
          const tuneId = typeof entry === 'string' ? entry : entry.tuneId;
          if (!tuneIds.has(tuneId)) {
            dangling.push(`${feed.id}: ${tuneId}`);
          }
        }
      }
    }
    expect(dangling, `Dangling refs:\n${dangling.join('\n')}`).toHaveLength(0);
  });
});

// ── Tune ID Utility ──────────────────────────────────────────

describe('generateTuneId utility', () => {
  // Dynamic import since it's .mjs
  it('generates valid slug-nanoid IDs', async () => {
    const { generateTuneId } = await import('../scripts/lib/tune-id.mjs');
    const samples = [
      "Cooley's",
      "The Sheep In The Boat",
      "O'Farrell's",
      "I Ne'er Shall Wean Her",
      "Paddy Fahey's No. 15",
      "Gráinne's",
    ];
    for (const name of samples) {
      const id = generateTuneId(name);
      expect(id, `"${name}" → "${id}" doesn't match pattern`).toMatch(TUNE_ID_PATTERN);
    }
  });

  it('produces unique IDs for the same name', async () => {
    const { generateTuneId } = await import('../scripts/lib/tune-id.mjs');
    const ids = Array.from({ length: 100 }, () => generateTuneId('Test Tune'));
    expect(new Set(ids).size, 'Expected all 100 IDs to be unique').toBe(100);
  });

  it('strips apostrophes and special chars cleanly', async () => {
    const { slugify } = await import('../scripts/lib/tune-id.mjs');
    expect(slugify("Cooley's")).toBe('cooleys');
    expect(slugify("O'Farrell's")).toBe('ofarrells');
    expect(slugify("Gráinne's")).toBe('gr-innes');  // accented chars become hyphens
    expect(slugify("The Lark In The Morning")).toBe('the-lark-in-the-morning');
  });
});
