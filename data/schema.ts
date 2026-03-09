import { z } from "zod";

// ─── Traditions ──────────────────────────────────────────────
export const Tradition = z.enum([
  "irish",
  "bluegrass",
  "old-time",
  "scottish",
  "other",
]);

// ─── Tune Types ──────────────────────────────────────────────
export const TuneType = z.enum([
  // Irish
  "reel",
  "jig",
  "slip jig",
  "hornpipe",
  "polka",
  "slide",
  "waltz",
  "march",
  "strathspey",
  "mazurka",
  "barndance",
  "set dance",
  // Bluegrass / Old-time
  "breakdown",
  "fiddle tune",
  "two-step",
  "song",
  // Catch-all
  "other",
]);

// ─── Key ─────────────────────────────────────────────────────
export const Key = z.enum([
  "A",
  "Am",
  "Amix",
  "Ador",
  "B",
  "Bm",
  "Bb",
  "C",
  "Cm",
  "D",
  "Dm",
  "Dmix",
  "Ddor",
  "E",
  "Em",
  "Edor",
  "Eb",
  "F",
  "Fm",
  "F#m",
  "G",
  "Gm",
  "Gmix",
  "Gdor",
  "Ab",
]);

// ─── Tune ────────────────────────────────────────────────────
export const Tune = z.object({
  id: z.string().regex(/^tune_\d+$/, "Tune ID must be tune_NNN"),
  name: z.string().min(1),
  type: TuneType,
  tradition: Tradition,
  aliases: z.array(z.string()).default([]),
  commonKeys: z.array(z.string()).default([]), // most common keys, descending by frequency
  url: z.string().url().optional(), // default link for this tune (any provider)
  external: z
    .object({
      thesession: z.number().int().positive().optional(),
      tta: z.string().optional(), // Traditional Tune Archive slug
    })
    .default({}),
  notes: z.string().optional(),
});

// ─── Link / Attachment ───────────────────────────────────────
export const Link = z.object({
  label: z.string(),
  url: z.string().url(),
  type: z
    .enum(["recording", "video", "photo", "article", "sheet-music", "other"])
    .default("other"),
});

// ─── Tune in a set (with key as played) ─────────────────────
export const SetTune = z.object({
  tuneId: z.string(),
  key: Key.optional(), // key as played this session
  url: z.string().url().optional(), // overrides the tune's default link (e.g. specific setting/arrangement)
});

// ─── Set (ordered group of tunes) ───────────────────────────
export const TuneSet = z.object({
  label: z.string().optional(), // e.g. "jigs", "reels", "polkas", "slow set"
  tunes: z.array(z.union([z.string(), SetTune])).min(1), // plain ID or {tuneId, key}
  notes: z.string().optional(),
  links: z.array(Link).default([]), // recordings, videos, etc. for this set
});

// ─── Series (a recurring session series) ────────────────────
export const Series = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "Series ID must be a lowercase slug"),
  name: z.string().min(1),
  tradition: Tradition,
  venue: z.string().optional(),          // default venue
  location: z.string().optional(),       // default city/state
  schedule: z.string().optional(),       // human-readable, e.g. "Every Wednesday"
  organizer: z.string().optional(),      // display name
  description: z.string().optional(),    // blurb for series page
  url: z.string().url().optional(),      // external link (Facebook group, website, etc.)
  listed: z.boolean().default(true),     // false = hidden from public listings
});

// ─── Session (a single gathering) ───────────────────────────
export const Session = z.object({
  id: z.string().regex(/^sess_\d{4}-\d{2}-\d{2}(_\d+)?$/, "Session ID must be sess_YYYY-MM-DD[_N]"),
  seriesId: z.string(),                  // references a series in series.json
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().optional(),          // overrides series default
  location: z.string().optional(),       // overrides series default
  tradition: Tradition.optional(),       // overrides series default
  organizer: z.string().optional(),      // overrides series default
  sets: z.array(TuneSet).min(1),
  notes: z.string().optional(),
  attendees: z.array(z.string()).default([]),
  links: z.array(Link).default([]),      // photos, event pages, fundraiser links, etc.
});

// ─── Top-level data files ───────────────────────────────────
export const TuneRegistry = z.record(z.string(), Tune);
export const SeriesRegistry = z.record(z.string(), Series);
export const SessionLog = z.array(Session);

// ─── Inferred types ─────────────────────────────────────────
export type Tradition = z.infer<typeof Tradition>;
export type TuneType = z.infer<typeof TuneType>;
export type Key = z.infer<typeof Key>;
export type Tune = z.infer<typeof Tune>;
export type Link = z.infer<typeof Link>;
export type SetTune = z.infer<typeof SetTune>;
export type TuneSet = z.infer<typeof TuneSet>;
export type Series = z.infer<typeof Series>;
export type Session = z.infer<typeof Session>;
