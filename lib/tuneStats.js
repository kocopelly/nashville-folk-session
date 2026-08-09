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
 * Percentile of a value within a sorted-ascending numeric array (linear interp).
 * @param {number[]} sortedAsc
 * @param {number} p  percentile in [0,1]
 */
function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx),
    hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

/**
 * Tune velocity: standards, heating up, one-hit wonders.
 *
 * Heuristics are relative to the corpus (not hardcoded counts):
 *  - Standards: appear in a large fraction of ALL sessions — session-appearance
 *    count is at/above the 75th percentile (top quartile) of multi-session tunes.
 *  - Heating up: momentum — appearance rate over a recent window meaningfully
 *    exceeds the tune's lifetime appearance rate (and it shows up 2+ times in
 *    the window). Catches genuine upward trends, established or new.
 *  - One-hit wonders: played in exactly one session, never returned.
 *
 * @param {{ id: string; name: string; count: number; sessionCount: number; sessionIds: string[] }[]} tunePlays
 * @param {any[]} sorted
 */
export function computeVelocity(tunePlays, sorted) {
  const sessionCount = sorted.length;
  const standards = [];
  const heating = [];
  const oneOffs = [];
  const dormant = [];

  // Chronological index of each session id, so we can measure "sessions since
  // last played" for the dormant / forgotten list.
  /** @type {Record<string, number>} */
  const sessionOrder = {};
  sorted.forEach((s, i) => {
    sessionOrder[s.id] = i;
  });

  // ── Standards: top-quartile session presence ──
  // Percentile is computed over tunes that recur (2+ sessions) so single-play
  // tunes don't drag the distribution down and swallow the whole list.
  const recurring = tunePlays.filter((t) => t.sessionCount >= 2);
  const presenceSorted = recurring.map((t) => t.sessionCount).sort((a, b) => a - b);
  // 75th percentile, floored at 2 so "standard" always means "came back".
  const stdThreshold = Math.max(2, Math.ceil(percentile(presenceSorted, 0.75)));

  // ── Heating window: last ~third of sessions (min 3, max 8) ──
  const windowSize = Math.min(8, Math.max(3, Math.round(sessionCount / 3)));
  const windowIds = sorted.slice(-windowSize).map((s) => s.id);
  const windowSet = new Set(windowIds);

  for (const t of tunePlays) {
    // Standards
    if (sessionCount >= 4 && t.sessionCount >= stdThreshold) {
      standards.push({ id: t.id, name: t.name, count: t.count, sessions: t.sessionCount });
    } else if (sessionCount < 4 && t.sessionCount >= Math.min(3, sessionCount)) {
      // Fallback for tiny corpora where percentiles are meaningless.
      standards.push({ id: t.id, name: t.name, count: t.count, sessions: t.sessionCount });
    }

    // One-hit wonders
    if (t.sessionCount === 1) {
      oneOffs.push({ id: t.id, name: t.name });
    }

    // Gathering dust — tunes we "forgot about": played a few times (2+),
    // but not seen in the recent window. Ranked by how long they've been gone.
    if (t.sessionCount >= 2) {
      const lastIdx = Math.max(...t.sessionIds.map((/** @type {string} */ id) => sessionOrder[id] ?? -1));
      const sessionsSince = sessionCount - 1 - lastIdx; // 0 = played most recent session
      // "Forgot about" = absent from the whole recency window.
      if (sessionsSince >= windowSize) {
        dormant.push({
          id: t.id,
          name: t.name,
          count: t.count,
          sessions: t.sessionCount,
          sessionsSince,
        });
      }
    }

    // Heating up — momentum vs own baseline
    const recentAppearances = t.sessionIds.filter((/** @type {string} */ id) => windowSet.has(id)).length;
    if (recentAppearances >= 2) {
      const recentRate = recentAppearances / windowSize;
      const lifetimeRate = t.sessionCount / sessionCount;
      // Trending: recent rate is at least 1.5x its lifetime rate.
      if (recentRate >= lifetimeRate * 1.5) {
        heating.push({
          id: t.id,
          name: t.name,
          count: t.count,
          sessions: t.sessionCount,
          recent: recentAppearances,
          momentum: recentRate / (lifetimeRate || 1e-9),
        });
      }
    }
  }

  // Rank standards by presence then plays; heating by momentum then recency.
  standards.sort((a, b) => b.sessions - a.sessions || b.count - a.count);
  heating.sort((a, b) => b.momentum - a.momentum || b.recent - a.recent || b.count - a.count);
  // Dormant: most-played first among the long-gone (biggest "loss" first),
  // tie-broken by how long they've been absent.
  dormant.sort((a, b) => b.count - a.count || b.sessionsSince - a.sessionsSince);

  return { standards, heating, oneOffs, dormant, stdThreshold, windowSize };
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
