/**
 * Regression tests for the Kawasaki / Maekawa 判定口径 (v2.50)
 *
 * Background
 * ----------
 * Kawasaki's theorem constrains the **sector angles** at a vertex: for a
 * flat-foldable even-degree vertex, the alternating sums of the sector
 * angles (the gaps between consecutive crease rays) must be equal — each
 * summing to 180°.
 *
 * v2.48 "fixed" this the wrong way round: it replaced the sector-angle sum
 * with the **crease angle** `|edges_foldAngle|`. But `edges_foldAngle` is the
 * *folding amount* of a crease (±180°), not a geometric angle. For any FOLD
 * whose foldAngle takes only the values {0, ±180} — which is every built-in
 * generator and most real works — the alternating sums are **identically
 * equal**, so the check became a **false-positive machine**:
 *
 *   - `origami kawasaki` reported tiger as "240/240 within 5°" while the
 *     true sector-angle error is 224° (median) — i.e. it does not fold flat.
 *   - The v2.48 fixture (the raw miura-ori from the corpus) "passed" only
 *     because the check could not fail; that file is in fact geometrically
 *     degenerate (69.7% of its vertices have a >180° sector). The normalised
 *     copy in the template library (132/132) is the sound one.
 *
 * v2.50 restores the sector-angle criterion and recalibrates the tolerance
 * against real work (0.5°): the corpus error distribution is **bimodal** —
 * 83.05% of vertices are exactly 0° and the rest exactly 180° (degenerate
 * rays from trimming) — so there is no "small error" band to be lenient about.
 *
 * What these tests lock down:
 *   1. A geometrically sound real work passes (flat-crane: 42/42).
 *   2. **Anti-false-positive**: a FOLD whose foldAngle is constant must NOT
 *      pass automatically; and the degenerate corpus miura-ori must be
 *      rejected rather than accepted.
 *   3. Vertices with an incident 'B' / 'U' / 'F' edge never take part in the
 *      check (both checks use the same rule set, so they cannot disagree).
 *   4. The Maekawa check and the Kawasaki check cover exactly the same
 *      vertices.
 *
 * The real-world corpus under ~/文档/Unbuntu_system/ is READ-ONLY and is only
 * used as a fixture when it happens to be present.
 */

const path = require('path');
const fs = require('fs');
const { FoldAnalyzer } = require('../../src/utils/fold-analyzer');
const { cli } = require('../helpers/cli');

const PROJECT_ROOT = path.join(__dirname, '../..');
const MIURA_PATH = path.join(PROJECT_ROOT, 'miura-ori.fold');
// 几何干净的真实作品（42 个内部顶点全部满足 Kawasaki）
const FLAT_CRANE_PATH = path.join(PROJECT_ROOT, 'flat-crane.fold');

// Read-only real-world corpus (may be absent on another machine → skipped).
const BENCH_ROOT = '/home/rayna/文档/Unbuntu_system/goods/origami-examples/FOLD';
const BENCH_MIURA = path.join(BENCH_ROOT, 'Tessellations/miura-ori.fold');

function loadFold(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Independent re-implementation of the internal-vertex rule, used to check
 * that the analyzer picks the same vertices (not a tautology against
 * getInternalCreaseVertices()).
 */
function expectedInternalVertices(fold) {
  const vertices = fold.vertices_coords || [];
  const edges = fold.edges_vertices || [];
  const assignments = fold.edges_assignment || [];
  const incident = new Map();
  vertices.forEach((_, i) => incident.set(i, []));
  edges.forEach((e, idx) => {
    if (!e || e.length < 2) return;
    if (incident.has(e[0])) incident.get(e[0]).push(idx);
    if (incident.has(e[1])) incident.get(e[1]).push(idx);
  });
  const out = [];
  for (const [v, inc] of incident.entries()) {
    if (inc.length < 3) continue;
    // 与 fold-analyzer 的规则一致：排除含 'B'（纸边）/'U'（未指定）/'F'（平折、预折痕）边的顶点
    if (inc.some((ei) => assignments[ei] === 'B' || assignments[ei] === 'U' || assignments[ei] === 'F')) continue;
    out.push(v);
  }
  return out.sort((a, b) => a - b);
}

/** Vertices that DO touch a boundary edge — these must never be checked. */
function boundaryTouchingVertices(fold) {
  const vertices = fold.vertices_coords || [];
  const edges = fold.edges_vertices || [];
  const assignments = fold.edges_assignment || [];
  const incident = new Map();
  vertices.forEach((_, i) => incident.set(i, []));
  edges.forEach((e, idx) => {
    if (!e || e.length < 2) return;
    if (incident.has(e[0])) incident.get(e[0]).push(idx);
    if (incident.has(e[1])) incident.get(e[1]).push(idx);
  });
  return [...incident.entries()]
    .filter(([, inc]) => inc.length >= 3 && inc.some((ei) => assignments[ei] === 'B'))
    .map(([v]) => v)
    .sort((a, b) => a - b);
}

// ────────────────────────────────────────────────────────────────────
// 1. miura-ori must actually pass the Kawasaki check
// ────────────────────────────────────────────────────────────────────
describe('Kawasaki criterion — geometrically sound real work', () => {
  test('flat-crane passes every checked vertex', () => {
    const analyzer = new FoldAnalyzer(loadFold(FLAT_CRANE_PATH));
    const sk = analyzer.strictKawasaki();

    expect(sk.totalChecked).toBe(42);
    // exact value for the shipped fixture — a change here means the 口径 moved
    expect(sk.withinTolerance).toBe(42);
    expect(sk.outOfTolerance).toBe(0);
    expect(sk.withinTolerance + sk.outOfTolerance).toBe(sk.totalChecked);
  });

  test('the `origami kawasaki` CLI reports the same pass rate', async () => {
    const r = await cli(['kawasaki', FLAT_CRANE_PATH, '--json']);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.totalChecked).toBe(42);
    expect(parsed.withinTolerance).toBe(42);
    expect(parsed.outOfTolerance).toBe(0);
  }, 30000);
});

// ─────────────────────────────────────────────────────────────
// Maekawa 的期望值按顶点的价数取（v2.51.1）
// ─────────────────────────────────────────────────────────────
describe('Maekawa criterion — expected value depends on vertex valence', () => {
  /** 造一个单顶点折痕图：n 条折痕从中心发出，按给定 M/V 分配 */
  function synthVertex(n, mCount) {
    const V = [[0, 0]];
    const E = [], A = [];
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      V.push([Math.cos(a), Math.sin(a)]);
      E.push([0, 1 + i]);
      A.push(i < mCount ? 'M' : 'V');
    }
    return { vertices_coords: V, edges_vertices: E, edges_assignment: A };
  }

  test('even valence expects |M-V| = 2 (classic Maekawa)', () => {
    const r = new FoldAnalyzer(synthVertex(4, 3)).analyzeMaekawa();
    expect(r.totalChecked).toBe(1);
    expect(r.withinTolerance).toBe(1);
  });

  test('odd valence (crease termination) expects |M-V| = 1', () => {
    // deg3 = 一条折痕终止于另一条折痕中段 → 推广形式 |M−V| = 2 − c = 1
    const r = new FoldAnalyzer(synthVertex(3, 2)).analyzeMaekawa();
    expect(r.totalChecked).toBe(1);
    expect(r.withinTolerance).toBe(1);
  });

  test('odd valence with |M-V| = 3 still fails', () => {
    // 防假阳性：奇数价不等于「一律通过」
    const r = new FoldAnalyzer(synthVertex(3, 3)).analyzeMaekawa();
    expect(r.totalChecked).toBe(1);
    expect(r.withinTolerance).toBe(0);
    expect(r.outOfTolerance).toBe(1);
  });

  test('even valence with |M-V| = 4 still fails', () => {
    const r = new FoldAnalyzer(synthVertex(4, 4)).analyzeMaekawa();
    expect(r.totalChecked).toBe(1);
    expect(r.withinTolerance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Anti-false-positive regression (the v2.48 → v2.50 bug)
// ─────────────────────────────────────────────────────────────
describe('Kawasaki criterion — must not be a false-positive machine', () => {
  test('a FOLD with constant foldAngle does NOT pass automatically', () => {
    // 构造：4 条折痕的顶点，扇区角 60/60/120/120（交替和 180 vs 240 → 差 60°），
    // 但 edges_foldAngle 全部取 ±180 —— v2.48 的实现会对它恒真。
    const fold = {
      vertices_coords: [[0, 0], [1, 0], [0.5, 0.87], [-0.5, 0.87], [0, -1]],
      edges_vertices: [[0, 1], [0, 2], [0, 3], [0, 4]],
      edges_assignment: ['M', 'V', 'M', 'V'],
      edges_foldAngle: [180, 180, 180, 180],
    };
    const sk = new FoldAnalyzer(fold).strictKawasaki();
    expect(sk.totalChecked).toBe(1);
    expect(sk.withinTolerance).toBe(0);
    expect(sk.outOfTolerance).toBe(1);
  });

  test('the degenerate corpus miura-ori is rejected, not accepted', () => {
    // 该文件 69.7% 的顶点有 >180° 的退化扇区 → 真实的 Kawasaki 判定应当拒绝它。
    // v2.48 的实现对它报「130/130 全过」—— 那是折痕角口径的假阳性。
    const analyzer = new FoldAnalyzer(loadFold(MIURA_PATH));
    const sk = analyzer.strictKawasaki();
    expect(sk.totalChecked).toBe(130);
    expect(sk.withinTolerance).toBe(0);
    expect(sk.outOfTolerance).toBe(130);
  });

  test('the normalised template-library copy of miura-ori does pass', () => {
    // 规范化（打断交点 → 平衡 M/V → 去重）修好了几何 → 132/132 全过。
    const tplPath = path.join(PROJECT_ROOT, 'templates', 'miura-ori.fold');
    if (!fs.existsSync(tplPath)) {
      console.warn('  (skipped — template file absent)');
      return;
    }
    const sk = new FoldAnalyzer(loadFold(tplPath)).strictKawasaki();
    expect(sk.withinTolerance).toBe(sk.totalChecked);
    expect(sk.totalChecked).toBeGreaterThan(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// 2. Boundary ('B') vertices take no part in the check
// ────────────────────────────────────────────────────────────────────
describe('internal vertex selection — boundary edges excluded', () => {
  // Two stars: the first has an extra boundary ('B') edge at its centre, the
  // second has none.  Only the second centre may be checked.
  function twoStarFold(withBoundaryEdge) {
    const vertices = [
      [0, 0, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0], [0, 0.5, 0],
      [10, 0, 0], [11, 0, 0], [10, 1, 0], [9, 0, 0], [10, -1, 0],
    ];
    const edges = [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [6, 7], [6, 8], [6, 9], [6, 10],
    ];
    const assignments = ['M', 'V', 'M', 'V', 'M', 'M', 'M', 'V'];
    const foldAngles = [180, -180, 180, -180, 180, 180, 180, -180];
    if (withBoundaryEdge) {
      edges.push([0, 5]);
      assignments.push('B');
      foldAngles.push(0);
    }
    return {
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: [
        [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1],
        [6, 7, 8], [6, 8, 9], [6, 9, 10], [6, 10, 7],
      ],
      edges_assignment: assignments,
      edges_foldAngle: foldAngles,
    };
  }

  test('a vertex with an incident B edge is dropped from the check set', () => {
    const analyzer = new FoldAnalyzer(twoStarFold(true));
    const internal = analyzer.getInternalCreaseVertices().map((x) => x.vertex);

    expect(internal).toEqual([6]);            // star centre 0 has a B edge
    expect(analyzer.strictKawasaki().totalChecked).toBe(1);
    expect(analyzer.analyzeMaekawa().totalChecked).toBe(1);
  });

  test('without the B edge the very same vertex IS checked', () => {
    const analyzer = new FoldAnalyzer(twoStarFold(false));
    const internal = analyzer.getInternalCreaseVertices().map((x) => x.vertex);

    expect(internal).toEqual([0, 6]);          // both centres are interior now
    expect(analyzer.strictKawasaki().totalChecked).toBe(2);
    expect(analyzer.analyzeMaekawa().totalChecked).toBe(2);
  });

  test('no B-touching vertex of a real pattern ever reaches the check set', () => {
    const fold = loadFold(MIURA_PATH);
    const analyzer = new FoldAnalyzer(fold);

    const excluded = boundaryTouchingVertices(fold);
    expect(excluded.length).toBeGreaterThan(0);   // the fixture really has them

    const checked = analyzer.getInternalCreaseVertices().map((x) => x.vertex);
    for (const v of excluded) {
      expect(checked).not.toContain(v);
    }
  });

  test('the check set equals "≥3 incident edges and no B edge", computed independently', () => {
    const fold = loadFold(MIURA_PATH);
    const analyzer = new FoldAnalyzer(fold);

    const expected = expectedInternalVertices(fold);
    expect(analyzer.getInternalCreaseVertices().map((x) => x.vertex)).toEqual(expected);
    expect(expected).toHaveLength(132);
  });
});

// ────────────────────────────────────────────────────────────────────
// 3. Maekawa and Kawasaki must cover the same vertices
// ────────────────────────────────────────────────────────────────────
describe('Maekawa and Kawasaki share one check set', () => {
  const fixtures = [
    path.join(PROJECT_ROOT, 'miura-ori.fold'),
    path.join(PROJECT_ROOT, 'hypar.fold'),
    path.join(PROJECT_ROOT, 'cranes.fold'),
  ].filter((p) => fs.existsSync(p));

  test('Kawasaki check set is a SUBSET of Maekawa check set (diff = odd-valence)', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) {
      const analyzer = new FoldAnalyzer(loadFold(f));
      const sk = analyzer.strictKawasaki();
      const sm = analyzer.analyzeMaekawa();
      // 两个检查集现在是**同一套规则**（含 B/U/F 边的顶点都不参与）→ 完全一致；
      // Kawasaki 还要再跳过奇数价顶点（定理只适用偶数价）→ 检查集是其子集。
      expect(sm.totalChecked).toBe(expectedInternalVertices(loadFold(f)).length);
      expect(sk.totalChecked).toBeLessThanOrEqual(sm.totalChecked);
      expect(sm.totalChecked - sk.totalChecked).toBe(sk.skippedOddValence || 0);
      // Kawasaki 的适用子集更窄（只查偶数价）→ 检查数 ≤ 内部顶点总数
      expect(sk.totalChecked).toBeLessThanOrEqual(expectedInternalVertices(loadFold(f)).length);
    }
  });

  test('every vertex reported by either check is an internal crease vertex', () => {
    for (const f of fixtures) {
      const analyzer = new FoldAnalyzer(loadFold(f));
      const internal = new Set(analyzer.getInternalCreaseVertices().map((x) => x.vertex));

      // topN large enough to keep every failing vertex
      const sk = analyzer.strictKawasaki(Number.MAX_SAFE_INTEGER);
      const sm = analyzer.analyzeMaekawa(Number.MAX_SAFE_INTEGER);

      expect(sk.topDeviations).toHaveLength(sk.outOfTolerance);
      expect(sm.topDeviations).toHaveLength(sm.outOfTolerance);

      for (const d of sk.topDeviations) expect(internal.has(d.vertex)).toBe(true);
      for (const d of sm.topDeviations) expect(internal.has(d.vertex)).toBe(true);
    }
  });

  test('both checks exclude exactly the same boundary vertices', () => {
    const fold = loadFold(MIURA_PATH);
    const analyzer = new FoldAnalyzer(fold);
    const boundary = new Set(boundaryTouchingVertices(fold));
    const internal = new Set(analyzer.getInternalCreaseVertices().map((x) => x.vertex));

    for (const v of boundary) expect(internal.has(v)).toBe(false);
    // …and both checks draw from that same internal set
    // (Kawasaki 的适用子集更窄：只查偶数价顶点，差集 = skippedOddValence)
    expect(analyzer.analyzeMaekawa().totalChecked).toBe(internal.size);
    const sk = analyzer.strictKawasaki();
    expect(sk.totalChecked).toBeLessThanOrEqual(internal.size);
    expect(internal.size - sk.totalChecked).toBe(sk.skippedOddValence || 0);
  });
});
