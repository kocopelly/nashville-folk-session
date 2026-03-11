/**
 * Time-series computations: session DNA, repertoire growth, diffs, key journeys, chart data.
 */
import { normalizeTuneEntry } from './helpers.js';

const TYPE_COLORS = {
  reel: 'dna-reel',
  jig: 'dna-jig',
  polka: 'dna-polka',
  'slip jig': 'dna-slipjig',
  slide: 'dna-slide',
  hornpipe: 'dna-hornpipe',
  mixed: 'dna-mixed',
  unknown: 'dna-mixed',
};

/**
 * Build session DNA fingerprint strips.
 * @param {any[]} sorted
 * @param {Record<string, any>} tunes
 */
export function computeSessionDNA(sorted, tunes) {
  return sorted.map((session) => {
    const tuneCount = session.sets.reduce((/** @type {number} */ n, /** @type {any} */ s) => n + s.tunes.length, 0);
    const sets = session.sets.map((/** @type {any} */ set) => {
      /** @type {Record<string, number>} */
      const setTypeCounts = {};
      for (const entry of set.tunes) {
        const { tuneId } = normalizeTuneEntry(entry);
        const t = tunes[tuneId]?.type ?? 'unknown';
        setTypeCounts[t] = (setTypeCounts[t] || 0) + 1;
      }
      const dominantType =
        set.label && set.label !== 'mixed'
          ? set.label.replace(/s$/, '')
          : Object.entries(setTypeCounts).sort((a, b) => /** @type {number} */ (b[1]) - /** @type {number} */ (a[1]))[0]?.[0] || 'unknown';

      return {
        label: set.label || dominantType,
        type: dominantType,
        colorClass: TYPE_COLORS[/** @type {keyof typeof TYPE_COLORS} */ (dominantType)] || TYPE_COLORS.mixed,
        tuneCount: set.tunes.length,
        pct: tuneCount > 0 ? Math.round((set.tunes.length / tuneCount) * 100) : 0,
      };
    });

    return { id: session.id, date: session.date, tuneCount, setCount: session.sets.length, sets };
  });
}

/**
 * Repertoire growth: cumulative unique tunes over time.
 * @param {any[]} sorted
 */
export function computeRepertoireGrowth(sorted) {
  const seenTunes = new Set();
  return sorted.map((session) => {
    let newCount = 0;
    for (const set of session.sets) {
      for (const entry of set.tunes) {
        const { tuneId } = normalizeTuneEntry(entry);
        if (!seenTunes.has(tuneId)) {
          seenTunes.add(tuneId);
          newCount++;
        }
      }
    }
    return { date: session.date, newCount, cumulative: seenTunes.size };
  });
}

/**
 * Session diffs: new vs repeat tunes each session.
 * @param {any[]} sorted
 * @param {Record<string, any>} tunes
 */
export function computeSessionDiffs(sorted, tunes) {
  const seenBefore = new Set();
  return sorted.map((session) => {
    const sessionTuneIds = new Set();
    for (const set of session.sets) {
      for (const entry of set.tunes) {
        sessionTuneIds.add(normalizeTuneEntry(entry).tuneId);
      }
    }
    let newTunes = 0;
    let repeatTunes = 0;
    const newNames = [];
    const repeatNames = [];
    for (const tid of sessionTuneIds) {
      if (seenBefore.has(tid)) {
        repeatTunes++;
        repeatNames.push(tunes[tid]?.name ?? tid);
      } else {
        newTunes++;
        newNames.push(tunes[tid]?.name ?? tid);
      }
    }
    for (const tid of sessionTuneIds) seenBefore.add(tid);

    return {
      date: session.date,
      id: session.id,
      newTunes,
      repeatTunes,
      total: sessionTuneIds.size,
      newNames,
      repeatNames,
      newPct: sessionTuneIds.size > 0 ? Math.round((newTunes / sessionTuneIds.size) * 100) : 0,
      repeatPct: sessionTuneIds.size > 0 ? Math.round((repeatTunes / sessionTuneIds.size) * 100) : 0,
    };
  });
}

/**
 * Key journey: the tonal path through each night (first key of each set).
 * @param {any[]} sorted
 */
export function computeKeyJourneys(sorted) {
  return sorted.map((session) => {
    /** @type {string[]} */
    const keys = [];
    for (const set of session.sets) {
      const setKeys = set.tunes.map((/** @type {any} */ e) => normalizeTuneEntry(e).key).filter(Boolean);
      if (setKeys.length > 0) keys.push(setKeys[0]);
    }
    return { date: session.date, keys };
  });
}

/**
 * Build time series data for uPlot charts.
 * @param {any[]} sorted
 * @param {Record<string, any>} tunes
 * @param {any[]} typeBreakdown
 * @param {any[]} keyDistribution
 * @param {any[]} repertoireGrowth
 */
export function buildTimeSeries(sorted, tunes, typeBreakdown, keyDistribution, repertoireGrowth) {
  const allTypeNames = typeBreakdown.map((/** @type {any} */ t) => /** @type {string} */ (t.type));
  /** @type {Record<string, number[]>} */
  const typePerSession = {};
  for (const type of allTypeNames) {
    typePerSession[type] = sorted.map((session) => {
      let tc = 0, total = 0;
      for (const set of session.sets) {
        for (const entry of set.tunes) {
          total++;
          const { tuneId } = normalizeTuneEntry(entry);
          if ((tunes[tuneId]?.type ?? 'unknown') === type) tc++;
        }
      }
      return total > 0 ? Math.round((tc / total) * 100) : 0;
    });
  }

  const allKeys = [...new Set(keyDistribution.map((/** @type {any} */ k) => /** @type {string} */ (k.key)))];
  /** @type {Record<string, number[]>} */
  const keyPerSession = {};
  for (const key of allKeys) {
    keyPerSession[key] = sorted.map((session) => {
      let count = 0;
      for (const set of session.sets) {
        for (const entry of set.tunes) {
          const ne = normalizeTuneEntry(entry);
          const k = ne.key || tunes[ne.tuneId]?.commonKeys?.[0] || '';
          if (k === key) count++;
        }
      }
      return count;
    });
  }

  return {
    dates: sorted.map((s) => new Date(s.date + 'T12:00:00').getTime() / 1000),
    labels: sorted.map((s) => s.date),
    tunesPerSession: sorted.map((s) => s.sets.reduce((/** @type {number} */ n, /** @type {any} */ set) => n + set.tunes.length, 0)),
    setsPerSession: sorted.map((s) => s.sets.length),
    cumulativeUnique: repertoireGrowth.map((g) => g.cumulative),
    newPerSession: repertoireGrowth.map((g) => g.newCount),
    typePerSession,
    keyPerSession,
  };
}
