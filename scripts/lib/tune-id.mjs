/**
 * Tune ID generation utility.
 *
 * Format: kebab-slug-xxxxx (name slug + 5-char lowercase alphanumeric nanoid)
 * Examples: sheep-in-the-boat-a3k7m, cooleys-mxq5i
 *
 * Usage:
 *   import { generateTuneId, slugify } from './lib/tune-id.mjs';
 *   const id = generateTuneId("Cooley's");  // → "cooleys-r8k2m"
 */

import { customAlphabet } from 'nanoid';

const NANOID_LENGTH = 5;
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', NANOID_LENGTH);

/**
 * Convert a tune name to a URL-safe kebab-case slug.
 * Strips apostrophes, replaces non-alphanum with hyphens, trims edges.
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a unique tune ID from a name.
 * Format: {slug}-{nanoid}
 */
export function generateTuneId(name) {
  return `${slugify(name)}-${nanoid()}`;
}
