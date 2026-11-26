/**
 * SVG crease-pattern parser and SVG↔FOLD matcher (v2.47.4)
 *
 * WHAT THIS MODULE DOES
 * ----------------------
 * The repository has no generic "crease-pattern SVG → FOLD" converter
 * (task brief §1.2: `dieline parse` is a packaging-dieline parser, not a
 * crease-pattern parser).  That is exactly why `origami generate` has to
 * emit a **pair** of artifacts: `.fold` (machine readable, verifiable) and
 * `.svg` (printable / uploadable).
 *
 * This module closes the loop in the other direction: it reads the SVG that
 * was just written and checks that it really is the same crease pattern as
 * the FOLD next to it.
 *
 *   parseSvgCreasePaths(svg)  → the crease paths (geometry + colour)
 *   matchSvgToFold(svg, fold) → criterion E: every drawn edge maps back to
 *                               the FOLD edge it came from (undirected
 *                               endpoint match), edge counts are equal and
 *                               the colours agree with `edges_assignment`.
 *
 * THE MATCHING ALGORITHM
 * ----------------------
 * The SVG is a *uniform-scale* rendering of the FOLD (the generator applies
 * one scale factor to both axes, mirrors Y, and translates).  We therefore
 * recover the similarity transform from the two bounding boxes and then map
 * every FOLD edge into SVG space and look it up.
 *
 * Tolerances (documented as required by the task brief, criterion D/E):
 *
 *   SVG_MATCH_TOLERANCE = 0.05 **SVG user units**
 *       The generator writes coordinates with `toFixed(2)`, so a single
 *       coordinate can be off by at most 0.005 user units.  0.05 is a 10x
 *       safety margin and still ~400x smaller than the smallest real feature
 *       (the tightest vertex spacing in any shipped pattern is ~20 units).
 *
 *   TRANSFORM_RESIDUAL_TOLERANCE = 0.5 **SVG user units**
 *       Maximum allowed deviation between the recovered transform and the
 *       actual SVG geometry.  A larger residual means the SVG is not a
 *       uniform-scale rendering of this FOLD and the match is reported as
 *       failed rather than silently accepted.
 *
 * Undirected matching: an SVG path `A—B` matches the FOLD edge `{A,B}`; the
 * order of the two endpoints is irrelevant (task brief §3 criterion E:
 * "无向边不谈方向一致").
 */

const { parseXml, findById, collectByTag } = require('./xml-lite');

/** Colour used by the SVG generator for each crease assignment. */
const ASSIGNMENT_COLORS = {
  M: '#FF0000',   // red   — mountain
  V: '#0066cc',   // blue — valley（QUALITY-STANDARDS v1.5 §9）
  B: '#000000',   // black — boundary
};

/** Endpoint matching tolerance in SVG user units. */
const SVG_MATCH_TOLERANCE = 0.05;

/** Maximum accepted deviation of the recovered similarity transform. */
const TRANSFORM_RESIDUAL_TOLERANCE = 0.5;

/**
 * Parse the `d` attribute of a path into a list of points.
 * Handles the "M x,y L x,y" form the generator emits, plus multi-segment
 * "M ... L ... L ..." polylines and space/comma separated numbers.
 *
 * @param {string} d
 * @returns {Array<Array<number>>}
 */
function parsePathData(d) {
  const points = [];
  if (!d || typeof d !== 'string') return points;

  const tokens = d.match(/[MLmlZzCcSsQqTtAaHhVv]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let i = 0;
  let command = null;
  let current = [0, 0];

  while (i < tokens.length) {
    const token = tokens[i];
    if (/^[MLZCSQTAHVmlzcsqtahv]$/.test(token)) {
      command = token;
      i++;
      if (command === 'Z' || command === 'z') continue;
      continue;
    }
    if (command === null) { i++; continue; }

    const num = parseFloat(token);
    if (Number.isNaN(num)) { i++; continue; }

    const upper = command.toUpperCase();
    const relative = command !== upper;

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      const x = relative ? current[0] + num : num;
      const y = relative ? current[1] + parseFloat(tokens[++i] || 0) : parseFloat(tokens[++i] || 0);
      current = [x, y];
      points.push([x, y]);
      // subsequent implicit line-tos after an M
      command = upper === 'M' ? (relative ? 'l' : 'L') : command;
      i++;
      continue;
    }
    if (upper === 'H') {
      current = [relative ? current[0] + num : num, current[1]];
      points.push([current[0], current[1]]);
      i++;
      continue;
    }
    if (upper === 'V') {
      current = [current[0], relative ? current[1] + num : num];
      points.push([current[0], current[1]]);
      i++;
      continue;
    }
    // Curves and arcs are not produced by the crease generator; skip them.
    i++;
  }

  return points;
}

/**
 * Extract the crease paths from an SVG document.
 *
 * @param {string} svgText
 * @returns {Object} { ok, errors, paths, xmlErrors, elementCount }
 *   paths: [{ points: [[x,y],[x,y]], color, strokeWidth }]
 */
function parseSvgCreasePaths(svgText) {
  const doc = parseXml(svgText);
  if (!doc.ok) {
    return { ok: false, errors: doc.errors, paths: [], xmlErrors: doc.errors, elementCount: doc.elementCount };
  }

  // The generator wraps the crease lines in <g id="creases">.  If that group
  // is missing we fall back to every <path> in the document.
  const creases = findById(doc.root, 'creases');
  const scope = creases ? creases.children : doc.root.children;

  const paths = [];
  for (const el of collectByTag({ children: scope }, 'path')) {
    const pts = parsePathData(el.attrs.d);
    if (pts.length < 2) continue;
    const color = String(el.attrs.stroke || el.attrs.fill || '').trim();
    const strokeWidth = parseFloat(el.attrs['stroke-width']);
    paths.push({
      points: [pts[0], pts[pts.length - 1]],
      color,
      strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : null,
    });
  }

  return { ok: true, errors: [], paths, xmlErrors: [], elementCount: doc.elementCount };
}

/**
 * Recover the similarity transform (uniform scale + optional Y mirror +
 * translation) that maps model coordinates onto SVG user coordinates.
 *
 * @param {Array<Array<number>>} modelPts
 * @param {Array<Array<number>>} svgPts
 * @returns {Object} { s, flipY, tx, ty, residual, method }
 */
function estimateTransform(modelPts, svgPts) {
  const bbox = (pts) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  };

  const m = bbox(modelPts);
  const s = bbox(svgPts);

  const result = { s: 1, flipY: true, tx: 0, ty: 0, residual: Infinity, method: 'bbox' };
  if (modelPts.length === 0 || svgPts.length === 0) return result;

  const width = m.width !== 0 ? m.width : m.height;
  const svgWidth = s.width !== 0 ? s.width : s.height;
  if (width === 0 || svgWidth === 0) return result;

  const scale = svgWidth / width;
  const tx = s.minX - scale * m.minX;

  // Two candidates: Y mirrored (SVG convention) and Y not mirrored.
  const candidates = [
    { flipY: true, ty: s.maxY + scale * m.minY },
    { flipY: false, ty: s.minY - scale * m.minY },
  ];

  let best = null;
  for (const cand of candidates) {
    const forward = (p) => (cand.flipY
      ? [scale * p[0] + tx, cand.ty - scale * p[1]]
      : [scale * p[0] + tx, scale * p[1] + cand.ty]);

    // Residual: how far the transformed model bbox corners are from the
    // actual SVG bbox corners.
    const corners = [
      [m.minX, m.minY], [m.maxX, m.minY], [m.maxX, m.maxY], [m.minX, m.maxY],
    ].map(forward);
    const cbox = bbox(corners);
    const residual = Math.max(
      Math.abs(cbox.minX - s.minX), Math.abs(cbox.maxX - s.maxX),
      Math.abs(cbox.minY - s.minY), Math.abs(cbox.maxY - s.maxY),
    );

    if (!best || residual < best.residual) {
      best = { ...cand, s: scale, tx, ty: cand.ty, residual };
    }
  }

  return best;
}

/**
 * Simple spatial hash over 2D points.
 */
function makePointIndex(points, cell) {
  const map = new Map();
  points.forEach((p, idx) => {
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(idx);
  });
  return {
    near(p) {
      const cx = Math.floor(p[0] / cell);
      const cy = Math.floor(p[1] / cell);
      const out = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = map.get(`${cx + dx},${cy + dy}`);
          if (bucket) out.push(...bucket);
        }
      }
      return out;
    },
  };
}

/**
 * Match the crease paths of an SVG against the edges of a FOLD model.
 *
 * @param {string} svgText
 * @param {Object} foldData
 * @param {Object} [options]
 * @param {number} [options.tolerance] - endpoint tolerance in SVG units
 * @returns {Object} report
 */
function matchSvgToFold(svgText, foldData, options = {}) {
  const tolerance = options.tolerance ?? SVG_MATCH_TOLERANCE;
  const parsed = parseSvgCreasePaths(svgText);

  const report = {
    ok: false,
    xmlWellFormed: parsed.ok,
    xmlErrors: parsed.xmlErrors || [],
    svgPathCount: parsed.paths.length,
    foldEdgeCount: (foldData.edges_vertices || []).length,
    edgeCountEqual: false,
    matchedEdges: 0,
    unmatchedEdges: [],
    colorMismatches: [],
    transform: null,
    tolerance,
    notes: [],
  };

  if (!parsed.ok) {
    report.notes.push('SVG is not well-formed XML');
    return report;
  }

  const vertices = foldData.vertices_coords || [];
  const edges = foldData.edges_vertices || [];
  const assignments = foldData.edges_assignment || [];

  report.edgeCountEqual = parsed.paths.length === edges.length;

  // Model endpoints (2 per edge) and SVG endpoints (2 per path).
  const modelPts = [];
  for (const e of edges) {
    if (!e || e.length < 2) continue;
    const a = vertices[e[0]], b = vertices[e[1]];
    if (!a || !b) continue;
    modelPts.push([a[0], a[1]]);
    modelPts.push([b[0], b[1]]);
  }
  const svgPts = [];
  for (const p of parsed.paths) {
    svgPts.push(p.points[0]);
    svgPts.push(p.points[1]);
  }

  const transform = estimateTransform(modelPts, svgPts);
  report.transform = transform;

  if (transform.residual > TRANSFORM_RESIDUAL_TOLERANCE) {
    report.notes.push(
      `SVG is not a uniform-scale rendering of this FOLD (transform residual ${transform.residual.toFixed(3)} > ${TRANSFORM_RESIDUAL_TOLERANCE})`
    );
    return report;
  }

  const forward = (p) => (transform.flipY
    ? [transform.s * p[0] + transform.tx, transform.ty - transform.s * p[1]]
    : [transform.s * p[0] + transform.tx, transform.s * p[1] + transform.ty]);

  // Index every SVG path endpoint so a transformed model point can find the
  // path(s) it belongs to.
  const endpointIndex = makePointIndex(svgPts, Math.max(tolerance * 2, 1e-6));

  const near = (p) => endpointIndex.near(p).filter((idx) => {
    const q = svgPts[idx];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) <= tolerance;
  });

  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    if (!e || e.length < 2) { report.unmatchedEdges.push({ edge: ei, reason: 'malformed edge' }); continue; }
    const a = vertices[e[0]], b = vertices[e[1]];
    if (!a || !b) { report.unmatchedEdges.push({ edge: ei, reason: 'vertex index out of range' }); continue; }

    const pa = forward([a[0], a[1]]);
    const pb = forward([b[0], b[1]]);

    const candA = near(pa);
    const candB = near(pb);

    let matchedPath = -1;
    for (const idx of candA) {
      const pathIdx = Math.floor(idx / 2);
      const endIdx = idx % 2;
      const other = svgPts[pathIdx * 2 + (1 - endIdx)];
      if (near(pb).includes(pathIdx * 2 + (1 - endIdx))) { matchedPath = pathIdx; break; }
      if (Math.hypot(other[0] - pb[0], other[1] - pb[1]) <= tolerance) { matchedPath = pathIdx; break; }
    }

    if (matchedPath === -1) {
      report.unmatchedEdges.push({ edge: ei, reason: 'no SVG path matches the FOLD edge endpoints' });
      continue;
    }

    report.matchedEdges++;

    const expected = String(assignments[ei] || 'B').toUpperCase();
    const expectedColor = ASSIGNMENT_COLORS[expected];
    const actual = parsed.paths[matchedPath].color;
    if (expectedColor && actual && actual.toUpperCase() !== expectedColor.toUpperCase()) {
      report.colorMismatches.push({
        edge: ei,
        assignment: expected,
        expectedColor,
        actualColor: actual,
      });
    }
  }

  report.ok = report.edgeCountEqual
    && report.unmatchedEdges.length === 0
    && report.colorMismatches.length === 0;

  if (!report.edgeCountEqual) {
    report.notes.push(`edge count differs: SVG ${report.svgPathCount} vs FOLD ${report.foldEdgeCount}`);
  }
  if (report.unmatchedEdges.length > 0) {
    report.notes.push(`${report.unmatchedEdges.length} FOLD edge(s) had no matching SVG path`);
  }
  if (report.colorMismatches.length > 0) {
    report.notes.push(`${report.colorMismatches.length} edge colour mismatch(es)`);
  }
  if (report.ok) {
    report.notes.push(`all ${report.matchedEdges} edge(s) matched (undirected) with consistent colours`);
  }

  return report;
}

/**
 * Check an SVG document for the degeneracies criterion F forbids:
 * zero-length edges and duplicate vertices.
 *
 * "Duplicate vertices" means two *distinct* vertices sitting at the same
 * position — NOT a vertex that is shared by several edges (that is normal
 * crease-pattern topology).  It is therefore checked twice:
 *
 *   - on the SVG side: the generator draws one <circle> per vertex, so two
 *     circles at the same spot are two duplicate vertices;
 *   - on the FOLD side: two entries of `vertices_coords` with the same
 *     coordinates.
 *
 * @param {string} svgText
 * @param {Object} [foldData]
 * @returns {Object} { ok, zeroLengthEdges, duplicateVertices, foldDuplicateVertices }
 */
function checkSvgGeometry(svgText, foldData = null) {
  const parsed = parseSvgCreasePaths(svgText);
  const report = {
    ok: false,
    xmlWellFormed: parsed.ok,
    xmlErrors: parsed.xmlErrors || [],
    pathCount: parsed.paths.length,
    zeroLengthEdges: 0,
    duplicateVertices: 0,
    foldDuplicateVertices: 0,
  };
  if (!parsed.ok) return report;

  for (const p of parsed.paths) {
    const [a, b] = p.points;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) === 0) report.zeroLengthEdges++;
  }

  // SVG side: one <circle> per vertex — two circles at the same spot are a
  // duplicate vertex.
  const doc = parseXml(svgText);
  const circles = collectByTag(doc.root, 'circle');
  const positions = new Map();
  for (const c of circles) {
    // 用 toFixed(6) 归一（与 FOLD 侧的 duplicateVertices 检查同一口径）——
    // 此前用原始字符串，浮点表示差异（1440 vs 1440.0000000001）会被误判成重复顶点
    // 判定精度取 4 位（= SVG 输出精度 toFixed(2) 的 0.01 单位之上留一位余量）：
    // SVG 的 circle 是 toFixed(2) 输出的，相差 <0.01 的不同顶点会在画布上重合 ——
    // 用 6 位判重会把它们误报成「重复顶点」。FOLD 侧同样口径。
    const key = `${Number(c.attrs.cx).toFixed(4)},${Number(c.attrs.cy).toFixed(4)}`;
    positions.set(key, (positions.get(key) || 0) + 1);
  }
  for (const count of positions.values()) {
    if (count > 1) report.duplicateVertices += count - 1;
  }

  // FOLD side: two vertex entries at the same coordinates.
  if (foldData && Array.isArray(foldData.vertices_coords)) {
    const seen = new Map();
    for (const v of foldData.vertices_coords) {
      const key = `${Number(v[0]).toFixed(4)},${Number(v[1]).toFixed(4)}`;   // 与 SVG 侧同口径
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    for (const count of seen.values()) {
      if (count > 1) report.foldDuplicateVertices += count - 1;
    }
  }

  report.ok = report.zeroLengthEdges === 0
    && report.duplicateVertices === 0
    && report.foldDuplicateVertices === 0;
  return report;
}

module.exports = {
  ASSIGNMENT_COLORS,
  SVG_MATCH_TOLERANCE,
  TRANSFORM_RESIDUAL_TOLERANCE,
  parsePathData,
  parseSvgCreasePaths,
  estimateTransform,
  matchSvgToFold,
  checkSvgGeometry,
};
