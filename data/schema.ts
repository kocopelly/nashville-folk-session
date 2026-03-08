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
  external: z
    .object({
      thesession: z.number().int().positive().optional(),
    })
    .default({}),
  notes: z.string().optional(),
});

// ─── Tune in a set (with key as played) ─────────────────────
export const SetTune = z.object({
  tuneId: z.string(),
  key: Key.optional(), // key as played this session
});

// ─── Set (ordered group of tunes) ───────────────────────────
export const TuneSet = z.object({
  tunes: z.array(z.union([z.string(), SetTune])).min(1), // plain ID or {tuneId, key}
  notes: z.string().optional(),
});

// ─── Session (a single gathering) ───────────────────────────
export const Session = z.object({
  id: z.string().regex(/^sess_\d{4}-\d{2}-\d{2}(_\d+)?$/, "Session ID must be sess_YYYY-MM-DD[_N]"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().optional(),
  location: z.string().optional(),
  tradition: Tradition,
  sets: z.array(TuneSet).min(1),
  notes: z.string().optional(),
  attendees: z.array(z.string()).default([]),
});

// ─── Top-level data files ───────────────────────────────────
export const TuneRegistry = z.record(z.string(), Tune);
export const SessionLog = z.array(Session);

// ─── Inferred types ─────────────────────────────────────────
export type Tradition = z.infer<typeof Tradition>;
export type TuneType = z.infer<typeof TuneType>;
export type Key = z.infer<typeof Key>;
export type Tune = z.infer<typeof Tune>;
export type SetTune = z.infer<typeof SetTune>;
export type TuneSet = z.infer<typeof TuneSet>;
export type Session = z.infer<typeof Session>;
