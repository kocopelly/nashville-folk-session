/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
export default function (eleventyConfig) {
  // Pass through static assets
  eleventyConfig.addPassthroughCopy("src/styles");

  // Global data from JSON files
  eleventyConfig.addGlobalData("tunes", async () => {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync("data/tunes.json", "utf-8"));
  });

  eleventyConfig.addGlobalData("sessions", async () => {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync("data/sessions.json", "utf-8"));
  });

  // Helper: normalize a set tune entry (string or {tuneId, key}) to {tuneId, key?}
  function normalizeTuneEntry(entry) {
    if (typeof entry === "string") return { tuneId: entry };
    return entry;
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

  eleventyConfig.addFilter("tuneLink", function (entry, tunes) {
    const { tuneId } = normalizeTuneEntry(entry);
    const tune = tunes[tuneId];
    if (tune?.external?.thesession) {
      return `https://thesession.org/tunes/${tune.external.thesession}`;
    }
    return null;
  });

  eleventyConfig.addFilter("tuneType", function (entry, tunes) {
    const { tuneId } = normalizeTuneEntry(entry);
    return tunes[tuneId]?.type ?? "";
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
