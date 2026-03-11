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

  // ── Comprehensive stats computation ──────────────────────
  eleventyConfig.addFilter("computeAllStats", function (sessions, tunes) {
    // Sort sessions chronologically
    const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

    // ── Tune play stats ──
    const tuneMap = {};
    let totalPlays = 0;
    let totalSets = 0;
    let maxSetSize = 0;
    let maxSetInfo = "";

    for (const session of sorted) {
      totalSets += session.sets.length;
      for (const set of session.sets) {
        if (set.tunes.length > maxSetSize) {
          maxSetSize = set.tunes.length;
          maxSetInfo = `${set.label || "set"} — ${session.date}`;
        }
        for (const entry of set.tunes) {
          const { tuneId, key } = normalizeTuneEntry(entry);
          totalPlays++;
          if (!tuneMap[tuneId]) {
            tuneMap[tuneId] = {
              id: tuneId,
              name: tunes[tuneId]?.name ?? tuneId,
              type: tunes[tuneId]?.type ?? "unknown",
              count: 0,
              sessionIds: [],
              keys: [],
            };
          }
          tuneMap[tuneId].count++;
          if (!tuneMap[tuneId].sessionIds.includes(session.id)) {
            tuneMap[tuneId].sessionIds.push(session.id);
          }
          if (key && !tuneMap[tuneId].keys.includes(key)) {
            tuneMap[tuneId].keys.push(key);
          }
        }
      }
    }

    const tunePlays = Object.values(tuneMap)
      .map((t) => ({
        ...t,
        sessionCount: t.sessionIds.length,
        keysDisplay: t.keys.join(", "),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const uniqueTunesPlayed = tunePlays.length;

    // ── Type breakdown ──
    const typeCounts = {};
    for (const session of sorted) {
      for (const set of session.sets) {
        for (const entry of set.tunes) {
          const { tuneId } = normalizeTuneEntry(entry);
          const type = tunes[tuneId]?.type ?? "unknown";
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
      }
    }
    const typeBreakdown = Object.entries(typeCounts)
      .map(([type, count]) => ({
        type,
        count,
        pct: Math.round((count / totalPlays) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // ── Key distribution ──
    const keyCounts = {};
    for (const session of sorted) {
      for (const set of session.sets) {
        for (const entry of set.tunes) {
          const { key } = normalizeTuneEntry(entry);
          if (key) {
            keyCounts[key] = (keyCounts[key] || 0) + 1;
          }
        }
      }
    }
    const totalKeyed = Object.values(keyCounts).reduce((a, b) => a + b, 0);
    const keyDistribution = Object.entries(keyCounts)
      .map(([key, count]) => ({
        key,
        count,
        pct: Math.round((count / totalKeyed) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // ── Session DNA ──
    const typeColors = {
      reel: "dna-reel",
      jig: "dna-jig",
      polka: "dna-polka",
      "slip jig": "dna-slipjig",
      slide: "dna-slide",
      hornpipe: "dna-hornpipe",
      mixed: "dna-mixed",
      unknown: "dna-mixed",
    };

    const sessionDNA = sorted.map((session) => {
      const tuneCount = session.sets.reduce(
        (n, s) => n + s.tunes.length,
        0,
      );
      const sets = session.sets.map((set) => {
        // Determine dominant type of the set
        const setTypeCounts = {};
        for (const entry of set.tunes) {
          const { tuneId } = normalizeTuneEntry(entry);
          const t = tunes[tuneId]?.type ?? "unknown";
          setTypeCounts[t] = (setTypeCounts[t] || 0) + 1;
        }
        const dominantType =
          set.label && set.label !== "mixed"
            ? set.label.replace(/s$/, "")
            : Object.entries(setTypeCounts).sort(
                (a, b) => b[1] - a[1],
              )[0]?.[0] || "unknown";

        return {
          label: set.label || dominantType,
          type: dominantType,
          colorClass: typeColors[dominantType] || typeColors.mixed,
          tuneCount: set.tunes.length,
          pct:
            tuneCount > 0
              ? Math.round((set.tunes.length / tuneCount) * 100)
              : 0,
        };
      });

      return {
        id: session.id,
        date: session.date,
        tuneCount,
        setCount: session.sets.length,
        sets,
      };
    });

    // ── Tune velocity ──
    const sessionCount = sorted.length;
    const recentIds = sorted.slice(-3).map((s) => s.id);
    const standards = [];
    const heating = [];
    const oneOffs = [];

    for (const t of tunePlays) {
      const recentCount = t.sessionIds.filter((id) =>
        recentIds.includes(id),
      ).length;
      if (t.sessionCount >= Math.min(3, sessionCount) && sessionCount >= 3) {
        standards.push({ name: t.name, count: t.count, sessions: t.sessionCount });
      } else if (recentCount >= 2 && t.sessionCount < sessionCount) {
        heating.push({ name: t.name, count: t.count, sessions: t.sessionCount });
      } else if (t.sessionCount === 1) {
        oneOffs.push({ name: t.name });
      }
    }

    // ── Common pairings ──
    const pairCounts = {};
    for (const session of sorted) {
      for (const set of session.sets) {
        const ids = set.tunes.map((e) => normalizeTuneEntry(e).tuneId);
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const pair = [ids[i], ids[j]].sort().join("|");
            pairCounts[pair] = (pairCounts[pair] || 0) + 1;
          }
        }
      }
    }
    const pairings = Object.entries(pairCounts)
      .filter(([, c]) => c >= 2)
      .map(([pair, count]) => {
        const [a, b] = pair.split("|");
        return {
          tuneA: tunes[a]?.name ?? a,
          tuneB: tunes[b]?.name ?? b,
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // ── Repertoire growth ──
    const seenTunes = new Set();
    const repertoireGrowth = sorted.map((session) => {
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
      return {
        date: session.date,
        newCount,
        cumulative: seenTunes.size,
      };
    });

    // ── Session diffs ──
    const seenBefore = new Set();
    const sessionDiffs = sorted.map((session) => {
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
      // Add all to seenBefore after counting
      for (const tid of sessionTuneIds) {
        seenBefore.add(tid);
      }
      return {
        date: session.date,
        id: session.id,
        newTunes,
        repeatTunes,
        total: sessionTuneIds.size,
        newNames,
        repeatNames,
        newPct:
          sessionTuneIds.size > 0
            ? Math.round((newTunes / sessionTuneIds.size) * 100)
            : 0,
        repeatPct:
          sessionTuneIds.size > 0
            ? Math.round((repeatTunes / sessionTuneIds.size) * 100)
            : 0,
      };
    });

    // ── Key journey per session ──
    const keyJourneys = sorted.map((session) => {
      const keys = [];
      for (const set of session.sets) {
        const setKeys = set.tunes
          .map((e) => normalizeTuneEntry(e).key)
          .filter(Boolean);
        if (setKeys.length > 0) {
          // Use the first tune's key as the set's "key center"
          keys.push(setKeys[0]);
        }
      }
      return { date: session.date, keys };
    });

    return {
      totalPlays,
      totalSets,
      uniqueTunesPlayed,
      avgTunesPerSession:
        sorted.length > 0
          ? (totalPlays / sorted.length).toFixed(1)
          : "0",
      avgSetSize:
        totalSets > 0 ? (totalPlays / totalSets).toFixed(1) : "0",
      maxSetSize,
      maxSetInfo,
      tunePlays,
      typeBreakdown,
      keyDistribution,
      sessionDNA,
      velocity: { standards, heating, oneOffs },
      pairings,
      repertoireGrowth,
      sessionDiffs,
      keyJourneys,
    };
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
