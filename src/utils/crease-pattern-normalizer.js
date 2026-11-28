/**
 * Crease-pattern normalization pipeline (v2.47.4)
 *
 * The five upstream generators (src/crease-pattern-generator-v3.js,
 * src/radial-origami-generator.js, src/modular-origami-generator.js,
 * src/modular-unit-generator.js) produce raw FOLD models.  They were never
 * wired into the CLI, so their output was never validated.  This module
 * turns a raw generator result into a *well-formed crease pattern*:
 *
 *   1. ENVELOPE   — FOLD v1.2 crease-pattern envelope (file/frame classes,
 *                   2D frame attribute, paper thickness, assignment whitelist,
 *                   consistent fold angles, rebuilt vertices_edges).
 *   2. CROSSINGS  — every 2D crease crossing is turned into a shared vertex
 *                   (the standard crease-pattern representation).  After this
 *                   step no two non-adjacent edges cross any more.
 *   3. FACES      — planar face extraction so that faces_vertices only
 *                   references edges that actually exist.
 *   4. M/V BALANCE — mountain/valley assignment is re-balanced so that every
 *                   interior vertex with an even degree satisfies Maekawa's
 *                   |M - V| = 2.
 *
 * Everything in here is deterministic: the search that repairs the M/V
 * assignment is driven by a seeded PRNG, so the same seed always produces the
 * same output, byte for byte.
 */

const {
  detectCreaseCrossings,
  computeInteriorVertices,
  splitCreasesAtCrossings,
  computeVerticesEdges,
  collapseDuplicateEdges,
  extractPlanarFaces,
  MAEKawa_TARGET_DIFFERENCE,
} = require('./crease-pattern-2d');

/** Assignments that are legal in a flat crease pattern produced by this CLI. */
const ALLOWED_ASSIGNMENTS = ['B', 'M', 'V'];

/** Fold angle that belongs to each assignment. */
const FOLD_ANGLE_FOR = { B: 0, M: 180, V: -180 };

/**
 * mulberry32 — a small, fast, fully deterministic 32-bit PRNG.
 *
 * Used for the seeded M/V repair search.  Same seed => same sequence =>
 * byte-identical output (task brief §3 criterion G).
 */
function createSeededRandom(seed) {
  let a = (Number(seed) >>> 0) || 0x9E3779B9;
  return function next() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Re-balance the mountain/valley assignment so that every interior vertex
 * with an even degree satisfies Maekawa's |M - V| = 2.
 *
 * Two phases:
 *
 *  1. Deterministic hill climbing on the total penalty
 *
 *         penalty(v) = (|M(v) - V(v)| - 2)^2      over solvable vertices
 *
 *     A single M<->V flip changes M-V by ±2 at both endpoints of the edge.
 *
 *  2. If the hill climb stalls (some patterns need an "augmenting" flip that
 *     temporarily breaks an already satisfied vertex), a seeded min-conflicts
 *     search takes over: repeatedly pick a violating vertex at random and
 *     flip a random incident crease, remembering the best assignment seen.
 *
 * Interior vertices with an ODD degree are excluded from the penalty: with an
 * odd number of creases M+V is odd, so |M-V| is odd and can never be 2.
 * Those vertices are reported separately as "unsatisfiable by Maekawa".
 *
 * Boundary ('B') edges are never flipped.
 *
 * @param {Object} foldData
 * @param {Object} [options]
 * @param {number} [options.seed]            - seed for the repair search
 * @param {number} [options.maxPasses]        - hill-climb passes
 * @param {number} [options.maxRestarts]      - min-conflicts restarts
 * @param {number} [options.maxStepsPerRun]   - min-conflicts steps per restart
 * @returns {Object} { foldData, report }
 */
function balanceMountainValley(foldData, options = {}) {
  const maxPasses = options.maxPasses ?? 200;
  const maxRestarts = options.maxRestarts ?? 12;
  const maxStepsPerRun = options.maxStepsPerRun ?? 20000;
  const seed = options.seed ?? 42;

  const vertices = foldData.vertices_coords || [];
  const edges = foldData.edges_vertices || [];
  const originalAssignments = (foldData.edges_assignment || []).slice();
  const originalFoldAngles = (foldData.edges_foldAngle || []).slice();

  const interior = computeInteriorVertices(foldData);
  const detailByVertex = new Map(interior.detail.map((d) => [d.vertex, d]));

  // adjacency: vertex -> edge indices
  const incident = new Map();
  for (let i = 0; i < vertices.length; i++) incident.set(i, []);
  edges.forEach((e, idx) => {
    if (!e || e.length < 2) return;
    if (incident.has(e[0])) incident.get(e[0]).push(idx);
    if (incident.has(e[1])) incident.get(e[1]).push(idx);
  });

  // vertices that can never satisfy Maekawa (odd number of creases)
  const unsatisfiable = new Set(
    interior.indices.filter((v) => (detailByVertex.get(v) || {}).degree % 2 !== 0)
  );
  const solvable = interior.indices.filter((v) => !unsatisfiable.has(v));

  /** Recompute the M-V difference of every vertex for a given assignment. */
  const computeDiff = (assignments) => {
    const diff = new Float64Array(vertices.length);
    edges.forEach((e, idx) => {
      const a = (assignments[idx] || 'B').toUpperCase();
      if (!e || e.length < 2) return;
      if (a === 'M') { diff[e[0]] += 1; diff[e[1]] += 1; }
      else if (a === 'V') { diff[e[0]] -= 1; diff[e[1]] -= 1; }
    });
    return diff;
  };

  const solvableSet = new Set(solvable);
  const penaltyOf = (diff, v) => {
    if (!solvableSet.has(v)) return 0;
    const d = Math.abs(diff[v]) - MAEKawa_TARGET_DIFFERENCE;
    return d * d;
  };
  const totalPenalty = (diff) => {
    let sum = 0;
    for (const v of solvable) sum += penaltyOf(diff, v);
    return sum;
  };
  const violatingVertices = (diff) => solvable.filter((v) => penaltyOf(diff, v) > 0);

  const assignments = originalAssignments.slice();
  let diff = computeDiff(assignments);
  const penaltyBefore = totalPenalty(diff);

  // ── phase 1: deterministic hill climbing ──────────────────────────
  let flips = 0;
  let passes = 0;
  const flipped = new Set();

  while (passes < maxPasses) {
    passes++;
    let improved = false;

    for (let i = 0; i < edges.length; i++) {
      if (flipped.has(i)) continue;              // never flip the same edge twice
      const a = (assignments[i] || 'B').toUpperCase();
      if (a !== 'M' && a !== 'V') continue;      // never flip boundary edges
      const e = edges[i];
      if (!e || e.length < 2 || e[0] === e[1]) continue;

      const delta = a === 'M' ? -2 : 2;
      const current = penaltyOf(diff, e[0]) + penaltyOf(diff, e[1]);

      const savedA = diff[e[0]];
      const savedB = diff[e[1]];
      diff[e[0]] += delta;
      diff[e[1]] += delta;
      const candidate = penaltyOf(diff, e[0]) + penaltyOf(diff, e[1]);
      diff[e[0]] = savedA;
      diff[e[1]] = savedB;

      if (candidate < current) {
        assignments[i] = a === 'M' ? 'V' : 'M';
        diff[e[0]] += delta;
        diff[e[1]] += delta;
        flipped.add(i);
        flips++;
        improved = true;
      }
    }

    if (!improved) break;
  }

  let best = assignments.slice();
  let bestDiff = diff;
  let bestPenalty = totalPenalty(diff);

  // ── phase 2: seeded weighted (breakout) search ───────────────────
  //
  // Plain min-conflicts gets trapped in a local minimum: for the `star`
  // tessellation it always lands on |M-V| = 4 at one interior vertex, no
  // matter how long it runs (measured: 12 restarts x 20k steps and
  // 400 restarts x 200k steps over 5 different seeds all end on penalty 4,
  // while an independent simulated-annealing search reaches penalty 0).
  //
  // The weighted "breakout" scheme fixes that: every solvable vertex carries
  // a weight (initially 1).  The search always repairs the violated vertex
  // with the largest *weighted* penalty and, when it has not improved for a
  // while, the weights of the still-violated vertices are increased so the
  // search is pushed out of the local minimum it is sitting in.
  //
  // Deterministic: the only randomness comes from the seeded PRNG, so the
  // same seed always produces byte-identical output (criterion G).
  let randomFlips = 0;
  let restarts = 0;
  let weightIncreases = 0;
  if (bestPenalty > 0) {
    const rand = createSeededRandom(seed);

    const weights = new Map();
    for (const v of solvable) weights.set(v, 1);

    const weightedPenaltyOf = (d, v) => {
      const dev = Math.abs(d[v]) - MAEKawa_TARGET_DIFFERENCE;
      return dev === 0 ? 0 : weights.get(v) * dev * dev;
    };

    const mvEdgeIndices = [];
    for (let i = 0; i < edges.length; i++) {
      const a = (assignments[i] || 'B').toUpperCase();
      if (a === 'M' || a === 'V') mvEdgeIndices.push(i);
    }

    let current = best.slice();
    let currentDiff = computeDiff(current);
    let currentPenalty = totalPenalty(currentDiff);

    const maxStagnation = Math.max(50, Math.floor(maxStepsPerRun / 20));
    let steps = 0;
    let stagnation = 0;

    while (steps < maxStepsPerRun && currentPenalty > 0) {
      steps++;

      // ── pick the violated vertex with the largest weighted penalty ──
      let worstVertex = -1;
      let worstScore = -1;
      for (const v of solvable) {
        const dev = Math.abs(currentDiff[v]) - MAEKawa_TARGET_DIFFERENCE;
        if (dev === 0) continue;
        const score = weights.get(v) * dev * dev;
        if (score > worstScore) { worstScore = score; worstVertex = v; }
      }
      if (worstVertex === -1) break;

      const candidates = (incident.get(worstVertex) || []).filter((ei) => {
        const a = (current[ei] || 'B').toUpperCase();
        return a === 'M' || a === 'V';
      });
      if (candidates.length === 0) break;

      // ── try every incident edge, keep the best (ties broken randomly) ──
      let chosen = -1;
      let chosenDelta = Infinity;
      const ties = [];
      for (const ei of candidates) {
        const a = (current[ei] || 'B').toUpperCase();
        const e = edges[ei];
        const delta = a === 'M' ? -2 : 2;
        const before = weightedPenaltyOf(currentDiff, e[0]) + weightedPenaltyOf(currentDiff, e[1]);
        currentDiff[e[0]] += delta;
        currentDiff[e[1]] += delta;
        const after = weightedPenaltyOf(currentDiff, e[0]) + weightedPenaltyOf(currentDiff, e[1]);
        currentDiff[e[0]] -= delta;
        currentDiff[e[1]] -= delta;
        const d = after - before;
        if (d < chosenDelta) { chosenDelta = d; chosen = ei; ties.length = 0; ties.push(ei); }
        else if (d === chosenDelta) ties.push(ei);
      }
      if (chosen === -1) break;
      if (ties.length > 1) chosen = ties[Math.floor(rand() * ties.length) % ties.length];

      const e = edges[chosen];
      const wasM = (current[chosen] || 'B').toUpperCase() === 'M';
      const delta = wasM ? -2 : 2;

      // unweighted penalty of the two touched vertices, before and after the flip
      const beforeU = penaltyOf(currentDiff, e[0]) + penaltyOf(currentDiff, e[1]);

      current[chosen] = wasM ? 'V' : 'M';
      currentDiff[e[0]] += delta;
      currentDiff[e[1]] += delta;
      randomFlips++;

      const afterU = penaltyOf(currentDiff, e[0]) + penaltyOf(currentDiff, e[1]);
      currentPenalty += afterU - beforeU;

      if (currentPenalty < bestPenalty) {
        bestPenalty = currentPenalty;
        best = current.slice();
        bestDiff = Float64Array.from(currentDiff);
        stagnation = 0;
      } else {
        stagnation++;
      }

      // ── breakout: punish the vertices that stay violated ──────────
      if (stagnation >= maxStagnation) {
        stagnation = 0;
        weightIncreases++;
        for (const v of solvable) {
          if (Math.abs(currentDiff[v]) - MAEKawa_TARGET_DIFFERENCE !== 0) {
            weights.set(v, weights.get(v) + 1);
          }
        }
        // restart from the best known assignment with a small perturbation
        if (mvEdgeIndices.length > 0) {
          current = best.slice();
          currentDiff = computeDiff(current);
          const kicks = 1 + (weightIncreases % 3);
          for (let k = 0; k < kicks; k++) {
            const ei = mvEdgeIndices[Math.floor(rand() * mvEdgeIndices.length) % mvEdgeIndices.length];
            const ke = edges[ei];
            const wasMK = (current[ei] || 'B').toUpperCase() === 'M';
            const kd = wasMK ? -2 : 2;
            current[ei] = wasMK ? 'V' : 'M';
            currentDiff[ke[0]] += kd;
            currentDiff[ke[1]] += kd;
          }
          currentPenalty = totalPenalty(currentDiff);
          restarts++;
        }
      }
    }
  }

  assignments.length = 0;
  assignments.push(...best);
  diff = bestDiff;
  const penaltyAfter = totalPenalty(diff);

  // fold angles follow the assignment
  const foldAngles = originalFoldAngles.slice();
  assignments.forEach((a, i) => {
    const up = String(a || 'B').toUpperCase();
    if (up === 'M' || up === 'V' || up === 'B') foldAngles[i] = FOLD_ANGLE_FOR[up];
  });

  const remaining = [];
  const unsatisfiableVertices = [];
  for (const item of interior.detail) {
    if (unsatisfiable.has(item.vertex)) {
      unsatisfiableVertices.push({
        vertex: item.vertex,
        degree: item.degree,
        reason: 'odd degree — |M-V| is odd and can never equal 2',
      });
      continue;
    }
    const d = Math.abs(diff[item.vertex]);
    if (d !== MAEKawa_TARGET_DIFFERENCE) {
      remaining.push({
        vertex: item.vertex,
        mountain: item.mountain,
        valley: item.valley,
        degree: item.degree,
        oddDegree: false,
      });
    }
  }

  const out = { ...foldData, edges_assignment: assignments };
  if (foldAngles.length === edges.length) out.edges_foldAngle = foldAngles;

  return {
    foldData: out,
    report: {
      interiorVertices: interior.indices.length,
      solvableVertices: solvable.length,
      flips: flips + randomFlips,
      hillClimbFlips: flips,
      searchFlips: randomFlips,
      restarts,
      weightIncreases,
      passes,
      penaltyBefore,
      penaltyAfter,
      unresolvedVertices: remaining,
      unsatisfiableVertices,
    },
  };
}

/**
 * Normalize a raw generator result into a well-formed crease pattern.
 *
 * @param {Object} foldData - raw FOLD model from one of the generators
 * @param {Object} [options]
 * @param {number} [options.thickness]   - paper thickness in mm (default 1.0)
 * @param {number|string} [options.seed]  - random seed recorded in metadata
 * @param {string} [options.pattern]     - pattern name recorded in metadata
 * @param {Object} [options.params]      - pattern parameters recorded in metadata
 * @param {boolean} [options.splitCrossings] - default true
 * @param {boolean} [options.balanceMV]       - default true
 * @param {boolean} [options.recomputeFaces]  - default true
 * @returns {Object} { foldData, report }
 */
/**
 * 顶点去重 + 索引重映射（2026-11-26）
 *
 * 为什么需要：生成器用 idx(i,j) 映射格点，某些坐标会被 push 两次
 * （实测 crane 1500 顶点里 15 组重复、tiger 12 组）→ SVG 侧出现重复圆点。
 *
 * 做法：按坐标合并顶点 → 把 edges / faces 里的顶点下标重映射到合并后的索引。
 * 折叠角（±180°）与 assignment 一并保留，边的语义不变。
 */
function dedupeVertices(foldData, epsilon = 1e-9) {
  if (!foldData || !Array.isArray(foldData.vertices_coords)) return foldData;
  const verts = foldData.vertices_coords;
  const remap = new Array(verts.length);
  const kept = [];
  const keyOf = (v) => (Array.isArray(v) ? v : [0, 0, 0])
    .slice(0, 3).map((c) => Math.round(c / epsilon) * epsilon).join(',');
  const index = new Map();
  for (let i = 0; i < verts.length; i++) {
    const k = keyOf(verts[i]);
    if (index.has(k)) {
      remap[i] = index.get(k);
    } else {
      index.set(k, kept.length);
      remap[i] = kept.length;
      kept.push(verts[i]);
    }
  }
  const mapEdges = (edges) => (Array.isArray(edges) ? edges : []).map((e) => {
    if (!Array.isArray(e) || e.length !== 2) return e;
    const a = remap[e[0]];
    const b = remap[e[1]];
    return a === b ? null : [a, b];
  }).filter(Boolean);
  const out = Object.assign({}, foldData, { vertices_coords: kept });
  const ev = mapEdges(foldData.edges_vertices);
  out.edges_vertices = ev;
  if (Array.isArray(foldData.faces_vertices)) {
    out.faces_vertices = foldData.faces_vertices.map((f) => {
      if (!Array.isArray(f)) return f;
      const mapped = [];
      for (const v of f) {
        const m = remap[v];
        if (mapped[mapped.length - 1] !== m) mapped.push(m);
      }
      return mapped.length >= 3 ? mapped : f;
    });
  }
  // edges_assignment / edges_foldAngle 与边一一对应；去重可能删掉自环边
  if (Array.isArray(foldData.edges_assignment) && foldData.edges_assignment.length !== ev.length) {
    const keep = [];
    let k = 0;
    const raw = foldData.edges_vertices || [];
    for (let i = 0; i < raw.length; i++) {
      const a = remap[raw[i][0]];
      const b = remap[raw[i][1]];
      if (a !== b) keep.push(i);
    }
    out.edges_assignment = keep.map((i) => foldData.edges_assignment[i]);
    out.edges_foldAngle = Array.isArray(foldData.edges_foldAngle)
      ? keep.map((i) => foldData.edges_foldAngle[i]) : [];
  }
  out.metadata = Object.assign({}, foldData.metadata, {
    vertices_deduped: verts.length - kept.length,
  });
  return out;
}


/**
 * **修正人造边界**：把位于纸**内部**的 'B'（不折叠）边恢复成真折痕。
 *
 * 为什么需要
 * ----------
 * 官方语料（origamisimulator.org 的 FOLD）在**裁剪**时，会把纸边界上的折痕
 * 替换成 'B'。但有些替换发生在纸的**内部** —— 实测 54 个作品里 1304 条 B 边中
 * **320 条（24.5%）是这类人造的**。
 *
 * 后果：那些顶点变成 deg3/deg4 且带 180° 的退化扇区 → 真实的 Kawasaki 判定
 * 把它们全判为「不满足折平必要条件」（实测 miura-ori 退化率 70%）。
 *
 * 判据：一条 B 边若**两端点都不在纸的外轮廓上**（凸包顶点）→ 它不可能是纸的边
 * → 是人造的 → 恢复成折痕。
 *
 * @param {Object} foldData
 * @param {Object} [options]
 * @returns {{foldData:Object, report:Object}}
 */
function fixArtificialBoundaryEdges(foldData, options = {}) {
  const V = foldData.vertices_coords || [];
  const E = foldData.edges_vertices || [];
  const A = foldData.edges_assignment || [];

  const report = { totalB: 0, artificial: 0, restored: 0 };

  // 纸的**包围盒**（比凸包保守）：只有两端点都**严格在包围盒内部**的 B 边
  // 才判为「人造」。
  //
  // 为什么不用凸包（大副 2026-11-28 复核意见 ①）：凸包顶点在**非凸轮廓**、
  // **纸上有孔**、**多张纸拼接**的情形下不等于纸边 → 会误伤真正的内部纸边，
  // 把该折的边变成折痕 → 改变折叠语义。
  // 包围盒严格内部这个判据**只会命中明显在纸内部的边**，宁可漏判也不误伤。
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of V) {
    if (!v) continue;
    if (v[0] < minX) minX = v[0];
    if (v[0] > maxX) maxX = v[0];
    if (v[1] < minY) minY = v[1];
    if (v[1] > maxY) maxY = v[1];
  }
  const spanX = (maxX - minX) || 1;
  const spanY = (maxY - minY) || 1;
  const eps = 1e-9;
  const strictlyInside = (vi) => {
    const v = V[vi];
    if (!v) return false;
    return v[0] > minX + eps && v[0] < maxX - eps
        && v[1] > minY + eps && v[1] < maxY - eps;
  };

  for (let i = 0; i < E.length; i++) {
    if (A[i] !== 'B') continue;
    report.totalB++;
    const [a, b] = E[i];
    if (a === undefined || b === undefined) continue;
    if (!strictlyInside(a) || !strictlyInside(b)) continue;   // 可能是真正的纸边
    report.artificial++;
    A[i] = 'M';        // 先全标山折，随后由 balanceMountainValley 平衡
    report.restored++;
  }

  if (report.restored > 0) {
    foldData.edges_assignment = A;
    foldData.edges_foldAngle = A.map((a) => FOLD_ANGLE_FOR[a] ?? 0);
  }
  return { foldData, report };
}

/** 凸包上的顶点索引（Andrew monotone chain，输入顶点索引） */
function convexHullIndices(V) {
  if (V.length < 3) return V.map((_, i) => i);
  const idx = V.map((_, i) => i)
    .sort((i, j) => (V[i][0] - V[j][0]) || (V[i][1] - V[j][1]));
  const cross = (o, a, b) =>
    (V[a][0] - V[o][0]) * (V[b][1] - V[o][1]) - (V[a][1] - V[o][1]) * (V[b][0] - V[o][0]);
  const lower = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

function normalizeCreasePattern(foldData, options = {}) {
  const thickness = options.thickness ?? 1.0;
  const splitCrossings = options.splitCrossings !== false;
  const balanceMV = options.balanceMV !== false;
  const recomputeFaces = options.recomputeFaces !== false;

  const report = {
    envelope: {},
    crossings: {},
    faces: {},
    mvBalance: {},
  };

  // ── 1. envelope ──────────────────────────────────────────────────
  let working = { ...foldData };
  working.file_spec = 1.2;
  working.file_creator = working.file_creator || 'origami generate (origami-simulator-cli)';
  working.file_classes = ['creasePattern'];
  working.frame_classes = ['creasePattern'];
  working.frame_attributes = ['2D'];
  working.frame_title = working.frame_title || 'Crease Pattern';
  working.thickness = thickness;

  const rawAssignments = foldData.edges_assignment || [];
  const assignments = rawAssignments.map((a) => {
    const up = String(a || 'B').toUpperCase();
    return ALLOWED_ASSIGNMENTS.includes(up) ? up : 'B';
  });
  working.edges_assignment = assignments;
  working.edges_foldAngle = assignments.map((a) => FOLD_ANGLE_FOR[a]);

  report.envelope = {
    fileSpec: working.file_spec,
    fileClasses: working.file_classes,
    frameClasses: working.frame_classes,
    frameAttributes: working.frame_attributes,
    thickness,
    assignmentCounts: assignments.reduce((acc, a) => {
      acc[a] = (acc[a] || 0) + 1;
      return acc;
    }, {}),
    normalizedAssignments: rawAssignments.filter((a, i) => {
      const up = String(a || 'B').toUpperCase();
      return !ALLOWED_ASSIGNMENTS.includes(up) || up !== assignments[i];
    }).length,
  };

  // ── 2. duplicate edges ───────────────────────────────────────────
  const deduped = collapseDuplicateEdges(working);
  working = deduped.foldData;
  report.duplicates = deduped.report;

  // ── 3. crossings ─────────────────────────────────────────────────
  if (splitCrossings) {
    const before = detectCreaseCrossings(working);
    const split = splitCreasesAtCrossings(working);
    working = split.foldData;
    report.crossings = {
      detected: before.crossingCount,
      verticesAdded: split.report.verticesAdded,
      edgesBefore: split.report.edgesBefore,
      edgesAfter: split.report.edgesAfter,
      remaining: detectCreaseCrossings(working).crossingCount,
    };
  } else {
    report.crossings = { detected: detectCreaseCrossings(working).crossingCount, skipped: true };
  }

  // ── 4. faces ─────────────────────────────────────────────────────
  if (recomputeFaces) {
    const faces = extractPlanarFaces(working);
    if (faces.length > 0) {
      working.faces_vertices = faces;
      report.faces = { count: faces.length, method: 'planar-half-edge' };
    } else {
      // keep whatever the generator produced (may be empty)
      working.faces_vertices = working.faces_vertices || [];
      report.faces = { count: (working.faces_vertices || []).length, method: 'generator (no planar faces found)' };
    }
  }

  // ── 4b. 修正人造边界（内部 'B' 边 → 真折痕）────────────────────────
  if (options.fixArtificialBoundary !== false) {
    const fix = fixArtificialBoundaryEdges(working);
    working = fix.foldData;
    report.artificialBoundary = fix.report;
  }

  // ── 5. M/V balance ───────────────────────────────────────────────
  if (balanceMV) {
    const balanced = balanceMountainValley(working, { seed: options.seed });
    working = balanced.foldData;
    report.mvBalance = balanced.report;
  }

  // ── 6. final bookkeeping ─────────────────────────────────────────
  working.vertices_edges = computeVerticesEdges(working.vertices_coords, working.edges_vertices);

  const metadata = {
    ...(foldData.metadata || {}),
    generator: 'origami generate',
    normalized: true,
    pattern: options.pattern ?? (foldData.metadata || {}).pattern ?? null,
    seed: options.seed ?? null,
    parameters: options.params ?? (foldData.metadata || {}).params ?? null,
  };
  working.metadata = metadata;

  return { foldData: working, report };
}

module.exports = {
  dedupeVertices,
  ALLOWED_ASSIGNMENTS,
  FOLD_ANGLE_FOR,
  createSeededRandom,
  balanceMountainValley,
  normalizeCreasePattern,
  extractPlanarFaces,
  fixArtificialBoundaryEdges,
  convexHullIndices,
};
