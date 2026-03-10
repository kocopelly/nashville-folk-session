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

  // Series as an array (for pagination in series.njk)
  eleventyConfig.addGlobalData("seriesList", async () => {
    const { readFileSync } = await import("node:fs");
    const data = JSON.parse(readFileSync("data/series.json", "utf-8"));
    return Object.values(data).filter(s => s.listed !== false);
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

  // Link type → inline SVG icon mapping (14×14, stroke-based, muted)
  const linkIcon = {
    recording: `<svg class="inline-block w-3.5 h-3.5 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    video: `<svg class="inline-block w-3.5 h-3.5 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    photo: `<svg class="inline-block w-3.5 h-3.5 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
    article: `<svg class="inline-block w-3.5 h-3.5 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    "sheet-music": `<svg class="inline-block w-3.5 h-3.5 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    other: `<svg class="inline-block w-3.5 h-3.5 align-[-2px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  };
  eleventyConfig.addFilter("linkIcon", function (type) {
    return linkIcon[type] || linkIcon.other;
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

  // Series helpers
  eleventyConfig.addFilter("seriesSessionCount", function (sessions, seriesId) {
    return sessions.filter(s => s.seriesId === seriesId).length;
  });

  eleventyConfig.addFilter("filterBySeries", function (sessions, seriesId) {
    return sessions.filter(s => s.seriesId === seriesId);
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
