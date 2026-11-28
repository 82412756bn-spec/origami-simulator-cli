/**
 * 2D crease-pattern geometry utilities (v2.47.4)
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * FoldAnalyzer.analyzeSelfIntersection() and FoldAnalyzer.analyzeCompleteSelfIntersection()
 * use 3D Möller triangle-triangle intersection.  For a flat 2D crease pattern all
 * faces are coplanar, so both methods bail out early with
 *   "2D model — all faces coplanar, no 3D intersection possible"   (Pairs checked: 0)
 * and can therefore NEVER detect a crease line that crosses another crease
 * line in the plane.
 *
 * This module implements the missing 2D capability.  It does NOT touch the
 * existing 3D behaviour of FoldAnalyzer — the 3D methods keep their exact
 * current results (task brief §1.3 / §7).
 *
 * WHAT IS HERE
 * ------------
 *  - proper 2D segment/segment intersection (scale free, documented epsilon)
 *  - crease-crossing report for a FOLD model  (criterion D)
 *  - interior-vertex detection (convex-hull aware)
 *  - Kawasaki + Maekawa *local necessary conditions*  (criterion C)
 *  - splitting of creases at their 2D crossing points (standard crease-pattern
 *    representation: every crossing point is a shared vertex)
 *  - planar face extraction (half-edge walk) for the resulting graph
 *
 * IMPORTANT SCOPE NOTE (criterion C)
 * ----------------------------------
 * Kawasaki + Maekawa are LOCAL NECESSARY conditions only.  Passing them does
 * NOT mean the pattern can be folded flat — global flat-foldability is
 * NP-hard and is explicitly out of scope for this task.
 */

/**
 * Dimensionless epsilon used by the 2D segment intersection test.
 *
 * The orientation of three points is evaluated as a *normalised* signed area
 *
 *     s(p,q,r) = cross(q-p, r-p) / (|q-p| * |r-p|)  =  sin(angle(p-q, p-r))
 *
 * so the threshold is a pure angle threshold (sin of the angle) and therefore
 * **scale invariant**: it means "the three points are collinear to within
 * 1e-9 radians".  1e-9 rad is far below any meaningful geometric deviation
 * (float64 noise on a 1e4-unit sheet is ~1e-12 rad) and far above it.
 */
const CROSSING_EPSILON = 1e-9;

/**
 * Kawasaki tolerance in degrees.  Matches the tolerance used by
 * FoldAnalyzer.validateFlatFoldability() ("altSum < 1.0") so that the
 * `origami generate` verification and the `origami analyze` verification
 * never disagree about the same vertex.
 */
const KAWASAKI_TOLERANCE_DEGREES = 1.0;

/**
 * Maekawa target: |M - V| must equal 2 at an interior vertex.
 * (FoldAnalyzer.analyzeMaekawa() uses the same target.)
 */
const MAEKawa_TARGET_DIFFERENCE = 2;

/**
 * Tolerance (in model units) for "is this point on that segment" tests and
 * for merging coincident vertices.  Relative to the model scale: 1e-9 of the
 * model bounding-box diagonal is far below any real geometric feature.
 */
const GEOMETRY_TOLERANCE = 1e-9;

// ────────────────────────────────────────────────────────────────────
// Basic 2D helpers
// ────────────────────────────────────────────────────────────────────

/** Extract the 2D part of a FOLD vertex coordinate. */
function point2(vertex) {
  return [vertex[0], vertex[1]];
}

/** Signed (double) area of the triangle p-q-r. */
function signedArea2(p, q, r) {
  return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
}

/**
 * Scale-free orientation: sin of the angle between (q-p) and (r-p).
 * Returns 0 when the input degenerates.
 */
function normalizedOrientation(p, q, r) {
  const area = signedArea2(p, q, r);
  const d1 = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const d2 = Math.hypot(r[0] - p[0], r[1] - p[1]);
  if (d1 === 0 || d2 === 0) return 0;
  return area / (d1 * d2);
}

/** Is `p` on the closed segment a-b (within `tolerance` model units)? */
function pointOnSegment(a, b, p, tolerance = GEOMETRY_TOLERANCE) {
  const cross = signedArea2(a, b, p);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]) <= tolerance;
  // perpendicular distance
  if (Math.abs(cross) / len > tolerance) return false;
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  if (dot < -tolerance) return false;
  if (dot > len * len + tolerance) return false;
  return true;
}

/** Do the two closed segments a-b and c-d overlap over a non-zero length? */
function segmentsOverlap(a, b, c, d) {
  const ccw = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = ccw(a, b, c), abD = ccw(a, b, d);
  const cdA = ccw(c, d, a), cdB = ccw(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return false; // proper crossing, not overlap
  return pointOnSegment(a, b, c) || pointOnSegment(a, b, d) ||
         pointOnSegment(c, d, a) || pointOnSegment(c, d, b);
}

/**
 * Classify how two 2D segments relate to each other.
 *
 * Returns one of:
 *   'proper'           — the segments cross transversally (this is a REAL
 *                        crossing and is what criterion D forbids between
 *                        two non-adjacent edges)
 *   'collinear-overlap' — the segments are collinear and overlap (degenerate
 *                        geometry, reported separately)
 *   'endpoint-touch'   — an endpoint of one segment lies on the other
 *                        segment (T-junction; not a proper crossing)
 *   'none'             — the segments are disjoint
 */
function classifySegmentPair(p1, p2, p3, p4, epsilon = CROSSING_EPSILON) {
  const o1 = normalizedOrientation(p3, p4, p1);
  const o2 = normalizedOrientation(p3, p4, p2);
  const o3 = normalizedOrientation(p1, p2, p3);
  const o4 = normalizedOrientation(p1, p2, p4);
  const eps = epsilon;

  const allCollinear = Math.abs(o1) <= eps && Math.abs(o2) <= eps &&
                       Math.abs(o3) <= eps && Math.abs(o4) <= eps;
  if (allCollinear) {
    if (segmentsOverlap(p1, p2, p3, p4)) {
      return { type: 'collinear-overlap', point: [p1[0], p1[1]] };
    }
    return { type: 'none', point: null };
  }

  // endpoint of one segment sitting on the other segment -> touch, not crossing
  const touches = (Math.abs(o1) <= eps && pointOnSegment(p3, p4, p1)) ||
                  (Math.abs(o2) <= eps && pointOnSegment(p3, p4, p2)) ||
                  (Math.abs(o3) <= eps && pointOnSegment(p1, p2, p3)) ||
                  (Math.abs(o4) <= eps && pointOnSegment(p1, p2, p4));
  if (touches) {
    let point = null;
    if (Math.abs(o1) <= eps) point = [p1[0], p1[1]];
    else if (Math.abs(o2) <= eps) point = [p2[0], p2[1]];
    else if (Math.abs(o3) <= eps) point = [p3[0], p3[1]];
    else if (Math.abs(o4) <= eps) point = [p4[0], p4[1]];
    return { type: 'endpoint-touch', point };
  }

  const straddles1 = (o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0);
  const straddles2 = (o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0);
  if (straddles1 && straddles2) {
    return { type: 'proper', point: segmentIntersectionPoint(p1, p2, p3, p4) };
  }
  return { type: 'none', point: null };
}

/** Intersection point of two properly crossing segments. */
function segmentIntersectionPoint(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (d === 0) return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

// ────────────────────────────────────────────────────────────────────
// Criterion D — 2D crease crossing detection
// ────────────────────────────────────────────────────────────────────

/**
 * Detect crease lines that cross each other in the plane.
 *
 * Two edges are "adjacent" when they share a vertex *index*; adjacent edges
 * are skipped (they legitimately meet).  Every other pair is tested with the
 * 2D segment intersection above.  Only a **proper** (transversal) crossing
 * counts as a crossing; collinear overlaps and endpoint touches are reported
 * separately because they are degenerate-geometry problems, not crossings.
 *
 * @param {Object} foldData - FOLD model
 * @param {Object} [options]
 * @param {number} [options.epsilon] - dimensionless collinearity epsilon
 * @returns {Object} report
 */
function detectCreaseCrossings(foldData, options = {}) {
  const epsilon = options.epsilon ?? CROSSING_EPSILON;
  const vertices = foldData.vertices_coords || [];
  const edges = foldData.edges_vertices || [];
  const assignments = foldData.edges_assignment || [];

  const report = {
    method: '2d-segment-intersection',
    epsilon,
    edgeCount: edges.length,
    pairsChecked: 0,
    adjacentPairsSkipped: 0,
    crossingCount: 0,
    crossings: [],
    endpointTouchCount: 0,
    endpointTouches: [],
    collinearOverlapCount: 0,
    collinearOverlaps: [],
    degenerateEdgeCount: 0,
    notes: [],
  };

  for (let i = 0; i < edges.length; i++) {
    const e1 = edges[i];
    if (!e1 || e1[0] === e1[1]) { report.degenerateEdgeCount++; continue; }
    const p1 = point2(vertices[e1[0]]);
    const p2 = point2(vertices[e1[1]]);

    for (let j = i + 1; j < edges.length; j++) {
      const e2 = edges[j];
      if (!e2 || e2[0] === e2[1]) continue;
      // adjacent (share a vertex index) -> legitimate meeting point
      if (e1[0] === e2[0] || e1[0] === e2[1] || e1[1] === e2[0] || e1[1] === e2[1]) {
        report.adjacentPairsSkipped++;
        continue;
      }
      report.pairsChecked++;
      const p3 = point2(vertices[e2[0]]);
      const p4 = point2(vertices[e2[1]]);
      const cls = classifySegmentPair(p1, p2, p3, p4, epsilon);
      if (cls.type === 'proper') {
        report.crossingCount++;
        report.crossings.push({
          edge1: i,
          edge2: j,
          assignment1: assignments[i] || null,
          assignment2: assignments[j] || null,
          point: cls.point.map((v) => Number(v.toFixed(9))),
        });
      } else if (cls.type === 'endpoint-touch') {
        report.endpointTouchCount++;
        if (report.endpointTouches.length < 50) {
          report.endpointTouches.push({ edge1: i, edge2: j, point: cls.point });
        }
      } else if (cls.type === 'collinear-overlap') {
        report.collinearOverlapCount++;
        if (report.collinearOverlaps.length < 50) {
          report.collinearOverlaps.push({ edge1: i, edge2: j });
        }
      }
    }
  }

  if (report.crossingCount === 0) {
    report.notes.push('No 2D crease crossings detected ✓');
  } else {
    report.notes.push(`Found ${report.crossingCount} 2D crease crossing(s)`);
  }
  if (report.degenerateEdgeCount > 0) {
    report.notes.push(`${report.degenerateEdgeCount} degenerate (zero-length) edge(s) skipped`);
  }
  return report;
}

// ────────────────────────────────────────────────────────────────────
// Convex hull / interior vertices
// ────────────────────────────────────────────────────────────────────

/**
 * Andrew's monotone chain convex hull.  Collinear points are excluded from
 * the hull vertex list but they are still detected as "on the hull boundary"
 * by pointOnSegment() below.
 */
function convexHull(points) {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Detect the vertices that lie on the outer boundary of the sheet.
 *
 * A vertex is "on the sheet boundary" when it lies on the convex hull of the
 * vertex set (including collinear points along a hull edge).  Such a vertex
 * is NOT an interior vertex of the sheet, no matter how the upstream
 * generator labelled its edges — Maekawa/Kawasaki are statements about
 * interior vertices only.
 */
function computeSheetBoundaryVertices(foldData) {
  const vertices = foldData.vertices_coords || [];
  if (vertices.length === 0) return new Set();

  const pts = vertices.map((v) => point2(v));
  const hull = convexHull(pts);
  const onBoundary = new Set();

  if (hull.length < 3) {
    // degenerate sheet (1-2 distinct points) -> everything is boundary
    for (let i = 0; i < vertices.length; i++) onBoundary.add(i);
    return onBoundary;
  }

  const scale = Math.max(
    Math.hypot(hull[0][0] - hull[hull.length - 1][0], hull[0][1] - hull[hull.length - 1][1]),
    1
  );
  const tolerance = scale * 1e-9;

  for (let i = 0; i < vertices.length; i++) {
    const p = pts[i];
    for (let h = 0; h < hull.length; h++) {
      const a = hull[h];
      const b = hull[(h + 1) % hull.length];
      if (pointOnSegment(a, b, p, tolerance)) { onBoundary.add(i); break; }
    }
  }
  return onBoundary;
}

/**
 * Interior vertices of the sheet: vertices with at least 3 incident creases,
 * no incident boundary ('B') edge, and not located on the sheet boundary.
 */
function computeInteriorVertices(foldData) {
  const vertices = foldData.vertices_coords || [];
  const edges = foldData.edges_vertices || [];
  const assignments = foldData.edges_assignment || [];

  const incident = new Map();
  for (let i = 0; i < vertices.length; i++) incident.set(i, []);
  edges.forEach((e, idx) => {
    if (!e || e.length < 2) return;
    if (incident.has(e[0])) incident.get(e[0]).push(idx);
    if (incident.has(e[1])) incident.get(e[1]).push(idx);
  });

  const boundary = computeSheetBoundaryVertices(foldData);
  const interior = [];
  const detail = [];

  for (const [v, inc] of incident.entries()) {
    const asg = inc.map((ei) => (assignments[ei] || 'B').toUpperCase());
    const hasBoundaryEdge = asg.includes('B');
    const isOnSheetBoundary = boundary.has(v);
    const interior_ = !hasBoundaryEdge && !isOnSheetBoundary && inc.length >= 3;
    if (interior_) {
      interior.push(v);
      detail.push({
        vertex: v,
        degree: inc.length,
        edges: inc,
        mountain: asg.filter((a) => a === 'M').length,
        valley: asg.filter((a) => a === 'V').length,
      });
    }
  }

  return {
    indices: interior,
    detail,
    boundaryVertexCount: boundary.size,
    totalVertices: vertices.length,
  };
}

// ────────────────────────────────────────────────────────────────────
// Criterion C — Kawasaki + Maekawa (local necessary conditions)
// ────────────────────────────────────────────────────────────────────

/**
 * Angles (degrees) between consecutive incident creases around a vertex,
 * ordered counter-clockwise.  Mirrors FoldAnalyzer.computeVertexAngles().
 */
function vertexAngles(vertices, edges, vertexIdx, incidentEdges) {
  const [vx, vy] = point2(vertices[vertexIdx]);
  const directions = [];
  for (const eIdx of incidentEdges) {
    const [a, b] = edges[eIdx];
    const other = a === vertexIdx ? b : a;
    const [ox, oy] = point2(vertices[other]);
    directions.push([ox - vx, oy - vy]);
  }
  directions.sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));

  const angles = [];
  for (let i = 0; i < directions.length; i++) {
    const p = directions[i];
    const q = directions[(i + 1) % directions.length];
    const lp = Math.hypot(p[0], p[1]);
    const lq = Math.hypot(q[0], q[1]);
    if (lp === 0 || lq === 0) continue;
    const dot = p[0] * q[0] + p[1] * q[1];
    angles.push(Math.acos(Math.max(-1, Math.min(1, dot / (lp * lq)))) * 180 / Math.PI);
  }
  return angles;
}

/**
 * Check the local necessary conditions for flat-foldability:
 *
 *   Kawasaki : the alternating angle sums around an interior vertex are equal
 *   Maekawa  : |M - V| = 2 at an interior vertex
 *
 * These are LOCAL NECESSARY conditions only.  A pattern that passes both is
 * still NOT guaranteed to fold flat — global flat-foldability is NP-hard and
 * is out of scope (task brief §3 criterion C).
 *
 * @param {Object} foldData
 * @param {Object} [options]
 * @param {number} [options.kawasakiToleranceDegrees]
 * @returns {Object} report
 */
function checkLocalFlatFoldability(foldData, options = {}) {
    // 单一真相源（2026-11-26）：判定逻辑全部委托给 FoldAnalyzer 的
    // strictKawasaki() / analyzeMaekawa() —— 与 origami kawasaki / maekawa 命令
    // 以及 analyze --all 的 validation 块**完全同一套口径**。
    // 此前这里自己实现了一套（用扇区角、含边界顶点），导致同一份产物
    // 在 origami generate 的判据 C 与 origami kawasaki 里给出互相矛盾的结论。
    const { FoldAnalyzer } = require('./fold-analyzer');
    const analyzer = new FoldAnalyzer(foldData);
    const sk = analyzer.strictKawasaki();
    const sm = analyzer.analyzeMaekawa();
    const interiorVertices = analyzer.getInternalCreaseVertices().length;

    const kawasaki = {
      toleranceDegrees: 5.0,
      interiorVertices,
      checked: sk.totalChecked,
      passCount: sk.withinTolerance,
      failCount: sk.outOfTolerance,
      skippedOddValence: sk.skippedOddValence || 0,
      failures: (sk.topDeviations || []).map((d) => ({
        vertex: d.vertex,
        deviation: d.deviation,
        evenSum: d.evenSum,
        oddSum: d.oddSum,
      })),
    };
    const maekawa = {
      checked: sm.totalChecked,
      passCount: sm.withinTolerance,
      failCount: sm.outOfTolerance,
      failures: (sm.topDeviations || []).map((d) => ({
        vertex: d.vertex,
        deviation: d.deviation,
        m: d.m,
        v: d.v,
      })),
    };
    return {
      pass: kawasaki.failCount === 0 && maekawa.failCount === 0,
      kawasaki,
      maekawa,
    };
  }

// ────────────────────────────────────────────────────────────────────
// Splitting creases at their crossing points
// ────────────────────────────────────────────────────────────────────

/**
 * Split every crease at the 2D points where it crosses another crease.
 *
 * In a crease pattern a crossing point is a *vertex*: two creases meeting in
 * the plane share that vertex.  Representing it as two independent edges
 * that visually cross is what makes the model impossible to validate.  After
 * splitting, no two non-adjacent edges cross any more (criterion D holds by
 * construction) and the crossing point becomes a regular interior vertex
 * whose Kawasaki/Maekawa status is reported honestly.
 *
 * @param {Object} foldData
 * @param {Object} [options]
 * @param {number} [options.epsilon]
 * @param {number} [options.mergeTolerance] - model units; crossing points closer
 *                                          than this are merged into one vertex
 * @returns {Object} { foldData, report }
 */
function splitCreasesAtCrossings(foldData, options = {}) {
  const crossings = detectCreaseCrossings(foldData, options);
  const vertices = foldData.vertices_coords || [];
  const edges = foldData.edges_vertices || [];
  const assignments = foldData.edges_assignment || [];
  const foldAngles = foldData.edges_foldAngle || [];

  const report = {
    detected: crossings.crossingCount,
    split: 0,
    verticesAdded: 0,
    edgesBefore: edges.length,
    edgesAfter: edges.length,
  };

  if (crossings.crossingCount === 0) {
    return { foldData: { ...foldData }, report };
  }

  // 1. collect split points per edge
  const splitPoints = edges.map(() => []);
  const newVertices = [];
  const mergeTolerance = options.mergeTolerance ?? GEOMETRY_TOLERANCE;

  // unique=true → 永远新建（即使坐标与已有顶点重合）→ 用于 X 交叉的「两条折痕各自独立」
  const findOrAddVertex = (pt, unique = false) => {
    if (!unique) {
      for (let i = 0; i < newVertices.length; i++) {
        const v = newVertices[i];
        if (Math.abs(v[0] - pt[0]) <= mergeTolerance && Math.abs(v[1] - pt[1]) <= mergeTolerance) {
          return vertices.length + i;
        }
      }
    }
    newVertices.push([pt[0], pt[1], 0]);
    return vertices.length + newVertices.length - 1;
  };

  for (const crossing of crossings.crossings) {
    // 两条被切的折痕**共享**交点顶点（保持原有的拓扑表示）。
    //
    // 曾试过「每条折痕各用独立顶点」（FOLD 里 X 交叉的另一种标准表示）—— 它确实让
    // 交点不再是 deg4 假失败顶点，但会**改变模板库的顶点结构**，连带破坏
    // balanceMountainValley 的结果（实测 birdBase 模板的 Maekawa 从全过变成 12/15）。
    // → 拓扑表示保持原样；交点处的 Kawasaki 问题改由「修正人造边界」间接缓解，
    //   剩余部分属**源文件几何退化**（见 v2.52.0 的 CHANGELOG 与技术决策记录）。
    const idx = findOrAddVertex(crossing.point);
    splitPoints[crossing.edge1].push({ t: 0, idx, point: crossing.point });
    splitPoints[crossing.edge2].push({ t: 0, idx, point: crossing.point });
  }

  // 2. split each edge at its points, ordered along the edge
  const newEdges = [];
  const newAssignments = [];
  const newFoldAngles = [];

  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    const pa = point2(vertices[a]);
    const pb = point2(vertices[b]);
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    const len2 = dx * dx + dy * dy;

    const pts = splitPoints[i].map((sp) => ({
      idx: sp.idx,
      t: len2 === 0 ? 0 : ((sp.point[0] - pa[0]) * dx + (sp.point[1] - pa[1]) * dy) / len2,
    }));
    pts.sort((x, y) => x.t - y.t);

    let prev = a;
    let emitted = 0;
    for (const sp of pts) {
      if (sp.idx === prev) continue;      // already at this vertex
      newEdges.push([prev, sp.idx]);
      newAssignments.push(assignments[i]);
      newFoldAngles.push(foldAngles[i]);
      emitted++;
      prev = sp.idx;
    }
    if (prev !== b || emitted === 0) {
      newEdges.push([prev, b]);
      newAssignments.push(assignments[i]);
      newFoldAngles.push(foldAngles[i]);
    }
    report.split += emitted;
  }

  const newCoords = vertices.map((v) => [v[0], v[1], v[2] === undefined ? 0 : v[2]]).concat(newVertices);

  const out = {
    ...foldData,
    vertices_coords: newCoords,
    edges_vertices: newEdges,
    edges_assignment: newAssignments,
    edges_foldAngle: newEdges.map((_, i) => (newFoldAngles[i] === undefined ? 0 : newFoldAngles[i])),
  };
  out.vertices_edges = computeVerticesEdges(newCoords, newEdges);

  report.verticesAdded = newVertices.length;
  report.edgesAfter = newEdges.length;
  return { foldData: out, report };
}

/** Recompute the FOLD v1.2 `vertices_edges` adjacency table. */
function computeVerticesEdges(vertices, edges) {
  const out = Array.from({ length: vertices.length }, () => []);
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    if (a >= 0 && a < vertices.length) out[a].push(i);
    if (b >= 0 && b < vertices.length) out[b].push(i);
  }
  return out;
}

/**
 * Collapse duplicate edges.
 *
 * Two edges that connect the same unordered pair of vertices describe the
 * same geometric crease; keeping both inflates the edge count, makes the
 * vertex degree wrong (which in turn breaks Kawasaki/Maekawa analysis) and
 * makes the SVG draw the same line twice.
 *
 * Merge rule: the first occurrence wins, except that a boundary ('B')
 * assignment always wins — if one of the parallel edges marks the sheet
 * boundary, that is where the sheet ends.
 *
 * @param {Object} foldData
 * @returns {Object} { foldData, report }
 */
function collapseDuplicateEdges(foldData) {
  const edges = foldData.edges_vertices || [];
  const assignments = foldData.edges_assignment || [];
  const foldAngles = foldData.edges_foldAngle || [];

  const seen = new Map();
  const keep = [];
  const keptOriginalIndex = [];
  const mergedAssignment = [];

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!e || e.length < 2) continue;
    const key = e[0] < e[1] ? `${e[0]}-${e[1]}` : `${e[1]}-${e[0]}`;
    if (seen.has(key)) {
      const at = seen.get(key);
      const a = String(assignments[i] || 'B').toUpperCase();
      if (a === 'B') mergedAssignment[at] = 'B';
      continue;
    }
    seen.set(key, keep.length);
    keep.push([e[0], e[1]]);
    keptOriginalIndex.push(i);
    mergedAssignment.push(String(assignments[i] || 'B').toUpperCase());
  }

  const removed = edges.length - keep.length;
  if (removed === 0) {
    return { foldData: { ...foldData }, report: { duplicatesRemoved: 0, edgesBefore: edges.length, edgesAfter: edges.length } };
  }

  const out = {
    ...foldData,
    edges_vertices: keep,
    edges_assignment: mergedAssignment,
    edges_foldAngle: keptOriginalIndex.map((i) => (foldAngles[i] === undefined ? 0 : foldAngles[i])),
  };

  return {
    foldData: out,
    report: { duplicatesRemoved: removed, edgesBefore: edges.length, edgesAfter: keep.length },
  };
}

// ────────────────────────────────────────────────────────────────────
// Planar face extraction
// ────────────────────────────────────────────────────────────────────

/**
 * Extract the bounded faces of a planar straight-line graph.
 *
 * Half-edge walk: at every vertex the outgoing half-edges are sorted by
 * angle; the next half-edge of a face is the one that precedes the incoming
 * half-edge in that order.  Faces with a negative signed area (the outer
 * face of the sheet) are discarded.
 *
 * @param {Object} foldData
 * @returns {Array<Array<number>>} faces_vertices
 */
function extractPlanarFaces(foldData) {
  const vertices = foldData.vertices_coords || [];
  const edges = foldData.edges_vertices || [];

  const adjacency = new Map();
  for (let i = 0; i < vertices.length; i++) adjacency.set(i, []);
  edges.forEach((e) => {
    if (!e || e.length < 2 || e[0] === e[1]) return;
    adjacency.get(e[0]).push(e[1]);
    adjacency.get(e[1]).push(e[0]);
  });

  for (const [vi, list] of adjacency.entries()) {
    const [x, y] = point2(vertices[vi]);
    list.sort((a, b) => {
      const aa = Math.atan2(point2(vertices[a])[1] - y, point2(vertices[a])[0] - x);
      const bb = Math.atan2(point2(vertices[b])[1] - y, point2(vertices[b])[0] - x);
      return aa - bb;
    });
  }

  const faces = [];
  const visited = new Set();

  for (const e of edges) {
    if (!e || e.length < 2 || e[0] === e[1]) continue;
    for (const [from, to] of [[e[0], e[1]], [e[1], e[0]]]) {
      const key = `${from}>${to}`;
      if (visited.has(key)) continue;

      const cycle = [];
      let cur = [from, to];
      let guard = 0;
      const maxSteps = edges.length * 4 + 16;
      let broken = false;

      while (guard++ < maxSteps) {
        const cKey = `${cur[0]}>${cur[1]}`;
        if (visited.has(cKey)) { broken = true; break; }
        visited.add(cKey);
        cycle.push(cur[0]);

        const list = adjacency.get(cur[1]) || [];
        const idx = list.indexOf(cur[0]);
        if (idx === -1) { broken = true; break; }
        const nextTo = list[(idx - 1 + list.length) % list.length];
        const next = [cur[1], nextTo];
        if (next[0] === from && next[1] === to) break;   // closed the face
        cur = next;
      }

      if (broken || cycle.length < 3) continue;

      // signed area (shoelace)
      let area = 0;
      for (let i = 0; i < cycle.length; i++) {
        const p = point2(vertices[cycle[i]]);
        const q = point2(vertices[cycle[(i + 1) % cycle.length]]);
        area += p[0] * q[1] - q[0] * p[1];
      }
      area /= 2;
      if (area <= 0) continue;   // outer face / degenerate

      // sanity: no repeated vertices, non-zero area
      if (new Set(cycle).size !== cycle.length) continue;
      faces.push(cycle);
    }
  }

  return faces;
}

module.exports = {
  CROSSING_EPSILON,
  KAWASAKI_TOLERANCE_DEGREES,
  MAEKawa_TARGET_DIFFERENCE,
  GEOMETRY_TOLERANCE,
  point2,
  signedArea2,
  normalizedOrientation,
  pointOnSegment,
  segmentsOverlap,
  classifySegmentPair,
  segmentIntersectionPoint,
  detectCreaseCrossings,
  convexHull,
  computeSheetBoundaryVertices,
  computeInteriorVertices,
  vertexAngles,
  checkLocalFlatFoldability,
  splitCreasesAtCrossings,
  computeVerticesEdges,
  collapseDuplicateEdges,
  extractPlanarFaces,
};
