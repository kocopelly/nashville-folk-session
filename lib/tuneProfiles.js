/**
 * Compute per-tune profile data for individual tune pages.
 * Builds on pre-computed stats from tuneStats.js rather than re-walking sessions.
 * Only walks sessions once for session history (set context + partners), which
 * is the one thing the existing stats don't capture.
 */
import { normalizeTuneEntry } from './helpers.js';
import { computeTunePlayStats, computeVelocity, computePairings } from './tuneStats.js';

/**
 * @param {any[]} sessions
 * @param {Record<string, any>} tunes
 * @returns {any[]} Array of tune profile objects, one per tune in the registry
 */
export function computeTuneProfiles(sessions, tunes) {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  // ── Reuse existing stat computations ──
  const { tuneMap, tunePlays } = computeTunePlayStats(sorted, tunes);
  const velocity = computeVelocity(tunePlays, sorted);
  const { pairCounts } = computePairings(sorted, tunes);

  // Build velocity lookup: tuneId → { status, label, emoji }
  /** @type {Record<string, { status: string; label: string; emoji: string }>} */
  const velocityLookup = {};
  for (const t of velocity.standards) {
    velocityLookup[t.id] = { status: 'standard', label: 'Standard', emoji: '⚓' };
  }
  for (const t of velocity.heating) {
    velocityLookup[t.id] = { status: 'heating', label: 'Heating Up', emoji: '🔥' };
  }
  for (const t of velocity.oneOffs) {
    velocityLookup[t.id] = { status: 'oneoff', label: 'One-Hit Wonder', emoji: '💨' };
  }

  // Build per-tune pair rankings from global pairCounts
  /** @type {Record<string, { id: string; name: string; count: number }[]>} */
  const perTunePairs = {};
  for (const [pair, count] of Object.entries(pairCounts)) {
    const [a, b] = pair.split('|');
    if (!perTunePairs[a]) perTunePairs[a] = [];
    if (!perTunePairs[b]) perTunePairs[b] = [];
    perTunePairs[a].push({ id: b, name: tunes[b]?.name ?? b, count });
    perTunePairs[b].push({ id: a, name: tunes[a]?.name ?? a, count });
  }
  // Sort each by count descending
  for (const pairs of Object.values(perTunePairs)) {
    pairs.sort((a, b) => b.count - a.count);
  }

  // ── Session history (the one walk we actually need) ──
  /** @type {Record<string, { sessionId: string; date: string; setLabel: string | null; partners: { id: string; name: string }[] }[]>} */
  const sessionHistory = {};

  for (const session of sorted) {
    for (const set of session.sets) {
      for (const entry of set.tunes) {
        const { tuneId } = normalizeTuneEntry(entry);
        if (!sessionHistory[tuneId]) sessionHistory[tuneId] = [];

        const partners = set.tunes
          .map((/** @type {any} */ e) => normalizeTuneEntry(e))
          .filter((/** @type {import('./helpers.js').NormalizedEntry} */ e) => e.tuneId !== tuneId)
          .map((/** @type {import('./helpers.js').NormalizedEntry} */ e) => ({ id: e.tuneId, name: tunes[e.tuneId]?.name ?? e.tuneId }));

        sessionHistory[tuneId].push({
          sessionId: session.id,
          date: session.date,
          setLabel: set.label || null,
          partners,
        });
      }
    }
  }

  // ── Assemble profiles ──
  const profiles = [];

  for (const [tuneId, tune] of Object.entries(tunes)) {
    const stats = tuneMap[tuneId];
    const playCount = stats?.count ?? 0;
    const sessionIds = stats?.sessionIds ?? [];
    const sessionCount = sessionIds.length;

    // Keys played, from tuneMap
    /** @type {{ key: string; count: number }[]} */
    let keysPlayed = [];
    if (stats?.keys.length) {
      // Recount key frequencies from the tuneMap's key list + session data
      /** @type {Record<string, number>} */
      const keyCounts = {};
      for (const session of sorted) {
        for (const set of session.sets) {
          for (const entry of set.tunes) {
            const ne = normalizeTuneEntry(entry);
            if (ne.tuneId === tuneId) {
              const k = ne.key || tunes[tuneId]?.commonKeys?.[0] || '';
              if (k) keyCounts[k] = (keyCounts[k] || 0) + 1;
            }
          }
        }
      }
      keysPlayed = Object.entries(keyCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, count }));
    }

    // Session dates for first/last
    const sessionDates = sessionIds.map((/** @type {string} */ sid) => {
      const s = sorted.find((/** @type {any} */ sess) => sess.id === sid);
      return s?.date || '';
    }).filter(Boolean).sort();

    // Velocity
    const vel = velocityLookup[tuneId] ?? (
      playCount === 0
        ? { status: 'unplayed', label: 'Not Yet Played', emoji: '📋' }
        : { status: 'newcomer', label: 'Newcomer', emoji: '🌱' }
    );

    // Deduplicate session history (one entry per session, with all sets)
    const rawHistory = sessionHistory[tuneId] ?? [];
    /** @type {{ sessionId: string; date: string; sets: { label: string | null; partners: { id: string; name: string }[] }[] }[]} */
    const historyBySession = [];
    /** @type {Set<string>} */
    const seenSessions = new Set();
    for (const h of rawHistory) {
      if (!seenSessions.has(h.sessionId)) {
        seenSessions.add(h.sessionId);
        historyBySession.push({
          sessionId: h.sessionId,
          date: h.date,
          sets: rawHistory
            .filter(x => x.sessionId === h.sessionId)
            .map(x => ({ label: x.setLabel, partners: x.partners })),
        });
      }
    }
    historyBySession.reverse();

    profiles.push({
      id: tuneId,
      name: tune.name,
      type: tune.type,
      tradition: tune.tradition,
      aliases: tune.aliases || [],
      commonKeys: tune.commonKeys || [],
      url: tune.url || null,
      externalThesession: tune.external?.thesession || null,
      playCount,
      sessionCount,
      firstPlayed: sessionDates[0] || null,
      lastPlayed: sessionDates[sessionDates.length - 1] || null,
      keysPlayed,
      sessionHistory: historyBySession,
      pairedWith: perTunePairs[tuneId] ?? [],
      velocityStatus: vel.status,
      velocityLabel: vel.label,
      velocityEmoji: vel.emoji,
    });
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}
