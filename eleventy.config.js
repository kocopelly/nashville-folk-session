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

    // ── Time series data (for uPlot) ──
    const allTypeNames = typeBreakdown.map((t) => t.type);
    const typePerSession = {};
    for (const type of allTypeNames) {
      typePerSession[type] = sorted.map((session) => {
        let tc = 0,
          total = 0;
        for (const set of session.sets) {
          for (const entry of set.tunes) {
            total++;
            const { tuneId } = normalizeTuneEntry(entry);
            if ((tunes[tuneId]?.type ?? "unknown") === type) tc++;
          }
        }
        return total > 0 ? Math.round((tc / total) * 100) : 0;
      });
    }

    const timeSeries = {
      dates: sorted.map(
        (s) => new Date(s.date + "T12:00:00").getTime() / 1000,
      ),
      labels: sorted.map((s) => s.date),
      tunesPerSession: sorted.map((s) =>
        s.sets.reduce((n, set) => n + set.tunes.length, 0),
      ),
      setsPerSession: sorted.map((s) => s.sets.length),
      cumulativeUnique: repertoireGrowth.map((g) => g.cumulative),
      newPerSession: repertoireGrowth.map((g) => g.newCount),
      typePerSession,
    };

    // ── Network analysis ──
    // Build adjacency from pairCounts
    const adjacency = {};
    const allPlayedIds = new Set();
    for (const session of sorted) {
      for (const set of session.sets) {
        for (const entry of set.tunes) {
          allPlayedIds.add(normalizeTuneEntry(entry).tuneId);
        }
      }
    }
    for (const [pair, weight] of Object.entries(pairCounts)) {
      const [a, b] = pair.split("|");
      if (!adjacency[a]) adjacency[a] = {};
      if (!adjacency[b]) adjacency[b] = {};
      adjacency[a][b] = weight;
      adjacency[b][a] = weight;
    }
    // Include isolated nodes
    for (const id of allPlayedIds) {
      if (!adjacency[id]) adjacency[id] = {};
    }

    const networkNodeIds = Object.keys(adjacency);
    const networkNodes = networkNodeIds.map((id) => {
      const neighbors = Object.keys(adjacency[id]);
      const degree = neighbors.length;
      const totalWeight = Object.values(adjacency[id]).reduce(
        (a, b) => a + b,
        0,
      );

      // Clustering coefficient
      let triangles = 0;
      let possibleTriangles = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          possibleTriangles++;
          if (adjacency[neighbors[i]]?.[neighbors[j]]) triangles++;
        }
      }
      const clustering =
        possibleTriangles > 0 ? triangles / possibleTriangles : 0;

      return {
        id,
        name: tunes[id]?.name ?? id,
        type: tunes[id]?.type ?? "unknown",
        degree,
        totalWeight,
        clustering: Math.round(clustering * 100) / 100,
      };
    });

    // Betweenness centrality (Brandes algorithm)
    const btw = {};
    for (const id of networkNodeIds) btw[id] = 0;
    for (const s of networkNodeIds) {
      const stack = [];
      const pred = {},
        sigma = {},
        dist = {},
        delta = {};
      for (const v of networkNodeIds) {
        pred[v] = [];
        sigma[v] = 0;
        dist[v] = -1;
        delta[v] = 0;
      }
      sigma[s] = 1;
      dist[s] = 0;
      const queue = [s];
      while (queue.length > 0) {
        const v = queue.shift();
        stack.push(v);
        for (const w of Object.keys(adjacency[v] || {})) {
          if (dist[w] < 0) {
            queue.push(w);
            dist[w] = dist[v] + 1;
          }
          if (dist[w] === dist[v] + 1) {
            sigma[w] += sigma[v];
            pred[w].push(v);
          }
        }
      }
      while (stack.length > 0) {
        const w = stack.pop();
        for (const v of pred[w]) {
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
        }
        if (w !== s) btw[w] += delta[w];
      }
    }
    // Normalize betweenness (undirected)
    const nn = networkNodeIds.length;
    const normFact = nn > 2 ? 2 / ((nn - 1) * (nn - 2)) : 1;
    for (const id of networkNodeIds) {
      btw[id] = Math.round(btw[id] * normFact * 1000) / 1000;
    }
    for (const node of networkNodes) node.betweenness = btw[node.id] || 0;

    // Build edges list for viz
    const networkEdges = [];
    const edgeSeen = new Set();
    for (const [src, targets] of Object.entries(adjacency)) {
      for (const [tgt, weight] of Object.entries(targets)) {
        const key = [src, tgt].sort().join("|");
        if (!edgeSeen.has(key)) {
          edgeSeen.add(key);
          networkEdges.push({ source: src, target: tgt, weight });
        }
      }
    }

    // Connected components
    const visited = new Set();
    let componentCount = 0;
    for (const id of networkNodeIds) {
      if (!visited.has(id)) {
        componentCount++;
        const q = [id];
        while (q.length > 0) {
          const curr = q.shift();
          if (visited.has(curr)) continue;
          visited.add(curr);
          for (const nb of Object.keys(adjacency[curr] || {})) {
            if (!visited.has(nb)) q.push(nb);
          }
        }
      }
    }

    const avgDeg =
      networkNodes.length > 0
        ? networkNodes.reduce((s, n) => s + n.degree, 0) /
          networkNodes.length
        : 0;
    const avgClust =
      networkNodes.length > 0
        ? networkNodes.reduce((s, n) => s + n.clustering, 0) /
          networkNodes.length
        : 0;
    const maxEdges = (nn * (nn - 1)) / 2;
    const netDensity = maxEdges > 0 ? networkEdges.length / maxEdges : 0;

    const network = {
      nodes: networkNodes.sort((a, b) => b.degree - a.degree),
      edges: networkEdges,
      stats: {
        nodeCount: networkNodes.length,
        edgeCount: networkEdges.length,
        avgDegree: Math.round(avgDeg * 10) / 10,
        avgClustering: Math.round(avgClust * 100) / 100,
        density: Math.round(netDensity * 1000) / 1000,
        components: componentCount,
      },
      mostCentral: [...networkNodes]
        .sort((a, b) => b.betweenness - a.betweenness)
        .slice(0, 10),
      mostConnected: [...networkNodes]
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 10),
      highestClustering: [...networkNodes]
        .filter((n) => n.degree >= 2)
        .sort((a, b) => b.clustering - a.clustering)
        .slice(0, 10),
    };

    // ── Client data (lean JSON for browser viz) ──
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
      timeSeries,
      network,
      clientData,
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
