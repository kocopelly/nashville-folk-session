/**
 * Compute per-tune profile data for individual tune pages.
 * Aggregates identity, play stats, session history, set pairings, and velocity.
 */
import { normalizeTuneEntry } from './helpers.js';

/**
 * @param {any[]} sessions
 * @param {Record<string, any>} tunes
 * @returns {any[]} Array of tune profile objects, one per tune in the registry
 */
export function computeTuneProfiles(sessions, tunes) {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const sessionCount = sorted.length;
  const recentIds = sorted.slice(-3).map(s => s.id);

  // ── Per-tune accumulators ──
  /** @type {Record<string, { playCount: number; sessionIds: string[]; keysPlayed: Record<string, number>; sessionHistory: any[]; pairCounts: Record<string, number> }>} */
  const acc = {};

  for (const tuneId of Object.keys(tunes)) {
    acc[tuneId] = { playCount: 0, sessionIds: [], keysPlayed: {}, sessionHistory: [], pairCounts: {} };
  }

  for (const session of sorted) {
    for (const set of session.sets) {
      const setTuneIds = set.tunes.map((/** @type {any} */ e) => normalizeTuneEntry(e).tuneId);

      for (const entry of set.tunes) {
        const { tuneId, key } = normalizeTuneEntry(entry);
        if (!acc[tuneId]) {
          acc[tuneId] = { playCount: 0, sessionIds: [], keysPlayed: {}, sessionHistory: [], pairCounts: {} };
        }

        acc[tuneId].playCount++;

        if (!acc[tuneId].sessionIds.includes(session.id)) {
          acc[tuneId].sessionIds.push(session.id);
        }

        const resolvedKey = key || tunes[tuneId]?.commonKeys?.[0] || '';
        if (resolvedKey) {
          acc[tuneId].keysPlayed[resolvedKey] = (acc[tuneId].keysPlayed[resolvedKey] || 0) + 1;
        }

        // Track pairings (other tunes in the same set)
        for (const otherId of setTuneIds) {
          if (otherId !== tuneId) {
            acc[tuneId].pairCounts[otherId] = (acc[tuneId].pairCounts[otherId] || 0) + 1;
          }
        }
      }

      // Session history entries (one per set this tune appears in)
      for (const entry of set.tunes) {
        const { tuneId } = normalizeTuneEntry(entry);
        if (!acc[tuneId]) continue;
        const partners = set.tunes
          .map((/** @type {any} */ e) => normalizeTuneEntry(e))
          .filter((/** @type {any} */ e) => e.tuneId !== tuneId)
          .map((/** @type {any} */ e) => ({ id: e.tuneId, name: tunes[e.tuneId]?.name ?? e.tuneId }));

        acc[tuneId].sessionHistory.push({
          sessionId: session.id,
          date: session.date,
          setLabel: set.label || null,
          partners,
        });
      }
    }
  }

  // ── Build profiles ──
  const profiles = [];

  for (const [tuneId, tune] of Object.entries(tunes)) {
    const data = acc[tuneId] || { playCount: 0, sessionIds: [], keysPlayed: {}, sessionHistory: [], pairCounts: {} };

    // Keys played, sorted by frequency
    const keysPlayed = Object.entries(data.keysPlayed)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count }));

    // Session dates for first/last
    const sessionDates = data.sessionIds.map(sid => {
      const s = sorted.find(sess => sess.id === sid);
      return s?.date || '';
    }).filter(Boolean).sort();

    // Paired tunes ranked by co-occurrence
    const pairedWith = Object.entries(data.pairCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({
        id,
        name: tunes[id]?.name ?? id,
        count,
      }));

    // Velocity status
    const recentCount = data.sessionIds.filter(id => recentIds.includes(id)).length;
    let velocityStatus = 'newcomer';
    let velocityLabel = 'Newcomer';
    let velocityEmoji = '🌱';
    if (data.sessionIds.length === 0) {
      velocityStatus = 'unplayed';
      velocityLabel = 'Not Yet Played';
      velocityEmoji = '📋';
    } else if (data.sessionIds.length >= Math.min(3, sessionCount) && sessionCount >= 3) {
      velocityStatus = 'standard';
      velocityLabel = 'Standard';
      velocityEmoji = '⚓';
    } else if (recentCount >= 2 && data.sessionIds.length < sessionCount) {
      velocityStatus = 'heating';
      velocityLabel = 'Heating Up';
      velocityEmoji = '🔥';
    } else if (data.sessionIds.length === 1) {
      velocityStatus = 'oneoff';
      velocityLabel = 'One-Hit Wonder';
      velocityEmoji = '💨';
    }

    // Deduplicate session history (show one entry per session, with all sets)
    const historyBySession = [];
    const seenSessions = new Set();
    for (const h of data.sessionHistory) {
      if (!seenSessions.has(h.sessionId)) {
        seenSessions.add(h.sessionId);
        historyBySession.push({
          sessionId: h.sessionId,
          date: h.date,
          sets: data.sessionHistory
            .filter(x => x.sessionId === h.sessionId)
            .map(x => ({ label: x.setLabel, partners: x.partners })),
        });
      }
    }
    // Reverse chronological
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
      playCount: data.playCount,
      sessionCount: data.sessionIds.length,
      firstPlayed: sessionDates[0] || null,
      lastPlayed: sessionDates[sessionDates.length - 1] || null,
      keysPlayed,
      sessionHistory: historyBySession,
      pairedWith,
      velocityStatus,
      velocityLabel,
      velocityEmoji,
    });
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}
