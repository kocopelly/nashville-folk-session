/**
 * Shared helpers for session/tune data processing.
 */

/**
 * @typedef {{ tuneId: string, key?: string, url?: string }} NormalizedEntry
 */

/**
 * Normalize a set tune entry — handles both string IDs and object entries.
 * @param {string | { tuneId: string, key?: string, url?: string }} entry
 * @returns {NormalizedEntry}
 */
export function normalizeTuneEntry(entry) {
  if (typeof entry === 'string') return { tuneId: entry, key: undefined, url: undefined };
  return { tuneId: entry.tuneId, key: entry.key, url: entry.url };
}
