/**
 * Stats orchestrator — composes all stat modules into a single computeAllStats call.
 */
import { computeTunePlayStats, computeTypeBreakdown, computeKeyDistribution, computeVelocity, computePairings } from './tuneStats.js';
import { computeSessionDNA, computeRepertoireGrowth, computeSessionDiffs, computeKeyJourneys, buildTimeSeries } from './timeseries.js';
import { computeNetwork } from './network.js';

/**
 * Compute all stats from sessions + tunes data.
 * @param {any[]} sessions
 * @param {Record<string, any>} tunes
 */
export function computeAllStats(sessions, tunes) {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

  // Tune-level stats
  const { tunePlays, totalPlays, totalSets, maxSetSize, maxSetInfo } =
    computeTunePlayStats(sorted, tunes);

  // Breakdowns
  const typeBreakdown = computeTypeBreakdown(sorted, tunes, totalPlays);
  const keyDistribution = computeKeyDistribution(sorted);

  // Velocity & pairings
  const velocity = computeVelocity(tunePlays, sorted);
  const { pairCounts, pairings } = computePairings(sorted, tunes);

  // Time-series
  const sessionDNA = computeSessionDNA(sorted, tunes);
  const repertoireGrowth = computeRepertoireGrowth(sorted);
  const sessionDiffs = computeSessionDiffs(sorted, tunes);
  const keyJourneys = computeKeyJourneys(sorted);
  const timeSeries = buildTimeSeries(sorted, tunes, typeBreakdown, keyDistribution, repertoireGrowth);

  // Network
  const network = computeNetwork(sorted, tunes, pairCounts);

  // Client data (lean JSON for browser viz)
  const clientData = {
    timeSeries,
    network: {
      nodes: network.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        degree: n.degree,
        betweenness: n.betweenness,
        clustering: n.clustering,
      })),
      edges: network.edges,
    },
  };

  return {
    totalPlays,
    totalSets,
    uniqueTunesPlayed: tunePlays.length,
    avgTunesPerSession: sorted.length > 0 ? (totalPlays / sorted.length).toFixed(1) : '0',
    avgSetSize: totalSets > 0 ? (totalPlays / totalSets).toFixed(1) : '0',
    maxSetSize,
    maxSetInfo,
    tunePlays,
    typeBreakdown,
    keyDistribution,
    sessionDNA,
    velocity,
    pairings,
    repertoireGrowth,
    sessionDiffs,
    keyJourneys,
    timeSeries,
    network,
    clientData,
  };
}
