/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
export default function (eleventyConfig) {
  // CSS is handled by Tailwind CLI — no passthrough for styles

  // Global data from JSON files
  eleventyConfig.addGlobalData("tunes", async () => {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync("data/tunes.json", "utf-8"));
  });

  eleventyConfig.addGlobalData("series", async () => {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync("data/series.json", "utf-8"));
  });

  eleventyConfig.addGlobalData("sessions", async () => {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync("data/sessions.json", "utf-8"));
  });

  // Helper: resolve a session field with series fallback
  // session.field > series.field
  eleventyConfig.addFilter("resolve", function (session, field, series) {
    if (session[field] != null) return session[field];
    const s = series[session.seriesId];
    return s?.[field] ?? null;
  });

  // Helper: normalize a set tune entry (string or {tuneId, key, url})
  function normalizeTuneEntry(entry) {
    if (typeof entry === "string") return { tuneId: entry, key: undefined, url: undefined };
    return { tuneId: entry.tuneId, key: entry.key, url: entry.url };
  }

  // Filters
  eleventyConfig.addFilter("tuneName", function (entry, tunes) {
    const { tuneId } = normalizeTuneEntry(entry);
    return tunes[tuneId]?.name ?? tuneId;
  });

  eleventyConfig.addFilter("tuneId", function (entry) {
    return normalizeTuneEntry(entry).tuneId;
  });

  eleventyConfig.addFilter("tuneKey", function (entry) {
    return normalizeTuneEntry(entry).key || null;
  });

  // Link resolution: entry.url (set-level override) > tune.url (default) > null
  eleventyConfig.addFilter("tuneLink", function (entry, tunes) {
    const { tuneId, url } = normalizeTuneEntry(entry);
    if (url) return url;
    const tune = tunes[tuneId];
    return tune?.url || null;
  });

  // Link type → emoji mapping
  const linkEmoji = { recording: "🎵", video: "🎬", photo: "📸", article: "📄", "sheet-music": "🎼", other: "🔗" };
  eleventyConfig.addFilter("linkEmoji", function (type) {
    return linkEmoji[type] || "🔗";
  });

  eleventyConfig.addFilter("tuneType", function (entry, tunes) {
    const { tuneId } = normalizeTuneEntry(entry);
    return tunes[tuneId]?.type ?? "";
  });

  // Is this a "loose" set? (single tune, no label)
  eleventyConfig.addFilter("isLoose", function (set) {
    return set.tunes.length === 1 && !set.label;
  });

  // Count total tunes across all sets
  eleventyConfig.addFilter("tuneCount", function (sets) {
    return sets.reduce((n, s) => n + s.tunes.length, 0);
  });

  // Are all sets in a session "loose"?
  eleventyConfig.addFilter("allLoose", function (sets) {
    return sets.every(s => s.tunes.length === 1 && !s.label);
  });

  eleventyConfig.addFilter("dateDisplay", function (dateStr) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  eleventyConfig.addFilter("mostPlayed", function (sessions, tunes) {
    const counts = {};
    for (const session of sessions) {
      for (const set of session.sets) {
        for (const entry of set.tunes) {
          const { tuneId } = normalizeTuneEntry(entry);
          counts[tuneId] = (counts[tuneId] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .map(([id, count]) => ({ id, name: tunes[id]?.name ?? id, count }))
      .sort((a, b) => b.count - a.count);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
    },
  };
}
