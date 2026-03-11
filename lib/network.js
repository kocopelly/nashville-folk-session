/**
 * Network analysis: co-occurrence graph, centrality metrics, clustering, components.
 */
import { normalizeTuneEntry } from './helpers.js';

/**
 * Build the tune co-occurrence network with full graph metrics.
 * @param {any[]} sorted - Sessions sorted chronologically
 * @param {Record<string, any>} tunes - Tune lookup map
 * @param {Record<string, number>} pairCounts - Pre-computed pair co-occurrence counts
 */
export function computeNetwork(sorted, tunes, pairCounts) {
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
    const [a, b] = pair.split('|');
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

  // ── Node metrics: degree, clustering ──
  const networkNodes = networkNodeIds.map((id) => {
    const neighbors = Object.keys(adjacency[id]);
    const degree = neighbors.length;
    const totalWeight = Object.values(adjacency[id]).reduce((a, b) => a + b, 0);

    let triangles = 0;
    let possibleTriangles = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        possibleTriangles++;
        if (adjacency[neighbors[i]]?.[neighbors[j]]) triangles++;
      }
    }
    const clustering = possibleTriangles > 0 ? triangles / possibleTriangles : 0;

    return {
      id,
      name: tunes[id]?.name ?? id,
      type: tunes[id]?.type ?? 'unknown',
      degree,
      totalWeight,
      clustering: Math.round(clustering * 100) / 100,
    };
  });

  // ── Betweenness centrality (Brandes algorithm) ──
  const btw = {};
  for (const id of networkNodeIds) btw[id] = 0;

  for (const s of networkNodeIds) {
    const stack = [];
    const pred = {}, sigma = {}, dist = {}, delta = {};
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

  // ── Edges ──
  const networkEdges = [];
  const edgeSeen = new Set();
  for (const [src, targets] of Object.entries(adjacency)) {
    for (const [tgt, weight] of Object.entries(targets)) {
      const key = [src, tgt].sort().join('|');
      if (!edgeSeen.has(key)) {
        edgeSeen.add(key);
        networkEdges.push({ source: src, target: tgt, weight });
      }
    }
  }

  // ── Connected components ──
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

  // ── Aggregate stats ──
  const avgDeg = networkNodes.length > 0
    ? networkNodes.reduce((s, n) => s + n.degree, 0) / networkNodes.length
    : 0;
  const avgClust = networkNodes.length > 0
    ? networkNodes.reduce((s, n) => s + n.clustering, 0) / networkNodes.length
    : 0;
  const maxEdges = (nn * (nn - 1)) / 2;
  const netDensity = maxEdges > 0 ? networkEdges.length / maxEdges : 0;

  return {
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
    mostCentral: [...networkNodes].sort((a, b) => b.betweenness - a.betweenness).slice(0, 10),
    mostConnected: [...networkNodes].sort((a, b) => b.degree - a.degree).slice(0, 10),
    highestClustering: [...networkNodes]
      .filter((n) => n.degree >= 2)
      .sort((a, b) => b.clustering - a.clustering)
      .slice(0, 10),
  };
}
