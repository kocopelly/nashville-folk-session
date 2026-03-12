/**
 * Tune-level statistics: play counts, type/key breakdowns, velocity, pairings.
 */
import { normalizeTuneEntry } from './helpers.js';

/**
 * Compute per-tune play stats and aggregate breakdowns.
 * @param {any[]} sorted - Sessions sorted chronologically
 * @param {Record<string, any>} tunes - Tune lookup map
 */
export function computeTunePlayStats(sorted, tunes) {
  /** @type {Record<string, { id: string; name: string; type: string; count: number; sessionIds: string[]; keys: string[] }>} */
  const tuneMap = {};
  let totalPlays = 0;
  let totalSets = 0;
  let maxSetSize = 0;
  let maxSetInfo = '';

  for (const session of sorted) {
    totalSets += session.sets.length;
    for (const set of session.sets) {
      if (set.tunes.length > maxSetSize) {
        maxSetSize = set.tunes.length;
        maxSetInfo = `${set.label || 'set'} — ${session.date}`;
      }
      for (const entry of set.tunes) {
        const { tuneId, key } = normalizeTuneEntry(entry);
        totalPlays++;
        if (!tuneMap[tuneId]) {
          tuneMap[tuneId] = {
            id: tuneId,
            name: tunes[tuneId]?.name ?? tuneId,
            type: tunes[tuneId]?.type ?? 'unknown',
            count: 0,
            sessionIds: [],
            keys: [],
          };
        }
        tuneMap[tuneId].count++;
        if (!tuneMap[tuneId].sessionIds.includes(session.id)) {
          tuneMap[tuneId].sessionIds.push(session.id);
        }
        if (key && !tuneMap[tuneId].keys.includes(key)) {
          tuneMap[tuneId].keys.push(key);
        }
      }
    }
  }

  // Resolve best key per tune
  const tunePlays = Object.values(tuneMap)
    .map((t) => {
      let bestKey = '';
      if (t.keys.length > 0) {
        /** @type {Record<string, number>} */
        const keyCounts = {};
        for (const session of sorted) {
          for (const set of session.sets) {
            for (const entry of set.tunes) {
              const ne = normalizeTuneEntry(entry);
              if (ne.tuneId === t.id) {
                const k = ne.key || tunes[t.id]?.commonKeys?.[0] || '';
                if (k) keyCounts[k] = (keyCounts[k] || 0) + 1;
              }
            }
          }
        }
        bestKey = Object.entries(keyCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || tunes[t.id]?.commonKeys?.[0] || '';
      } else {
        bestKey = tunes[t.id]?.commonKeys?.[0] || '';
      }
      return {
        ...t,
        sessionCount: t.sessionIds.length,
        keysDisplay: t.keys.join(', '),
        bestKey,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { tuneMap, tunePlays, totalPlays, totalSets, maxSetSize, maxSetInfo };
}

/**
 * Type breakdown (how many plays per tune type).
 * @param {any[]} sorted
 * @param {Record<string, any>} tunes
 * @param {number} totalPlays
 */
export function computeTypeBreakdown(sorted, tunes, totalPlays) {
  /** @type {Record<string, number>} */
  const typeCounts = {};
  for (const session of sorted) {
    for (const set of session.sets) {
      for (const entry of set.tunes) {
        const { tuneId } = normalizeTuneEntry(entry);
        const type = tunes[tuneId]?.type ?? 'unknown';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
    }
  }
  return Object.entries(typeCounts)
    .map(([type, count]) => ({
      type,
      count,
      pct: Math.round((count / totalPlays) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Key distribution across all plays.
 * @param {any[]} sorted
 */
export function computeKeyDistribution(sorted) {
  /** @type {Record<string, number>} */
  const keyCounts = {};
  for (const session of sorted) {
    for (const set of session.sets) {
      for (const entry of set.tunes) {
        const { key } = normalizeTuneEntry(entry);
        if (key) keyCounts[key] = (keyCounts[key] || 0) + 1;
      }
    }
  }
  const totalKeyed = Object.values(keyCounts).reduce((a, b) => a + b, 0);
  return Object.entries(keyCounts)
    .map(([key, count]) => ({
      key,
      count,
      pct: Math.round((count / totalKeyed) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Tune velocity: standards, heating up, one-hit wonders.
 * @param {{ id: string; name: string; count: number; sessionCount: number; sessionIds: string[] }[]} tunePlays
 * @param {any[]} sorted
 */
export function computeVelocity(tunePlays, sorted) {
  const sessionCount = sorted.length;
  const recentIds = sorted.slice(-3).map((s) => s.id);
  const standards = [];
  const heating = [];
  const oneOffs = [];

  for (const t of tunePlays) {
    const recentCount = t.sessionIds.filter((/** @type {string} */ id) => recentIds.includes(id)).length;
    if (t.sessionCount >= Math.min(3, sessionCount) && sessionCount >= 3) {
      standards.push({ id: t.id, name: t.name, count: t.count, sessions: t.sessionCount });
    } else if (recentCount >= 2 && t.sessionCount < sessionCount) {
      heating.push({ id: t.id, name: t.name, count: t.count, sessions: t.sessionCount });
    } else if (t.sessionCount === 1) {
      oneOffs.push({ id: t.id, name: t.name });
    }
  }

  return { standards, heating, oneOffs };
}

/**
 * Common pairings: tunes that appear together in sets.
 * @param {any[]} sorted
 * @param {Record<string, any>} tunes
 */
export function computePairings(sorted, tunes) {
  /** @type {Record<string, number>} */
  const pairCounts = {};
  for (const session of sorted) {
    for (const set of session.sets) {
      const ids = set.tunes.map((/** @type {any} */ e) => normalizeTuneEntry(e).tuneId);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const pair = [ids[i], ids[j]].sort().join('|');
          pairCounts[pair] = (pairCounts[pair] || 0) + 1;
        }
      }
    }
  }
  const pairings = Object.entries(pairCounts)
    .filter(([, c]) => c >= 2)
    .map(([pair, count]) => {
      const [a, b] = pair.split('|');
      return { tuneAId: a, tuneBId: b, tuneA: tunes[a]?.name ?? a, tuneB: tunes[b]?.name ?? b, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return { pairCounts, pairings };
}
