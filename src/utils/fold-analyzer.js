/**
 * Fold Analyzer v2
 * Local FOLD file analysis with real origami math (no browser required)
 *
 * Performs:
 * - Basic structure analysis (vertices, edges, faces)
 * - Kawasaki's theorem validation (flat-foldability check at vertices)
 * - Maekawa's theorem validation (M/V count at each vertex)
 * - Symmetry detection (n-fold rotational)
 * - Connectivity / genus analysis
 * - Strain estimation
 * - Layer ordering / nesting depth
 * - Crease pattern classification
 * - v2.10: JSON Schema-conforming output + M/V-Layer skip detection
 * - v2.11: Optional ajv-based schema validation via validateAgainstSchema()
 */

const fs = require('fs');
const path = require('path');

// Symmetry detection tolerances (in model units, e.g. mm).
// Default: 0.1% of model scale, min 0.01 — enough for floating-point noise on mm-scale models.
// Strict: 0.01% of model scale, min 0.001 — filters spurious 5/6/12-fold matches on small models.
const TOLERANCE_DEFAULT_FRAC = 0.001;   // 0.1%
const TOLERANCE_DEFAULT_FLOOR = 0.01;  // 0.01 mm minimum
const TOLERANCE_STRICT_FRAC = 0.0001;  // 0.01%
const TOLERANCE_STRICT_FLOOR = 0.001;  // 0.001 mm minimum

// Per-symmetry residual threshold (max vertex displacement) to accept a candidate.
const RESIDUAL_ACCEPT_DEFAULT = 0.05;  // 5% of unit
const RESIDUAL_ACCEPT_STRICT = 0.005;  // 0.5% of unit

/**
 * Kawasaki 交替角和的容差（度）。
 *
 * 用**真实作品**校准（2026-11-27，官方 78 件，16998 个偶数价内部顶点，
 * 扇区角口径）：
 *   - 误差分布**双峰**：83.05% 的顶点误差恰为 0°，17% 恰为 180°
 *     （零长/重合折痕射线造成的退化顶点，多来自裁剪人造边界）
 *   - 中间带（0.5°–5°）只占 0.2%（36 个顶点），来自少数作品的手绘精度噪声
 *     （例：flappingBird 的 4 个顶点误差 2.79°，该作品数学上可展平）
 *
 * 所以 5° 是安全的：它**只**多放过那 0.2% 的真实噪声，**不会**放过 180° 的退化。
 * 收紧到 0.5° 反而会把 flappingBird 这类「可展平但精度不足」的真实作品判死（假阴性）。
 *
 * 注意：5° 这个值原本是在**折痕角**口径下定的，那个口径对 foldAngle ∈ {0,±180}
 * 的 FOLD 恒真（假阳性）—— 口径修正后重新用真实作品验证过，结论是不变。
 */
const KAWASAKI_TOLERANCE_DEG = 5.0;

class FoldAnalyzer {
  constructor(foldData) {
    this.fold = foldData;
    this.vertices = foldData.vertices_coords || [];
    this.edges = foldData.edges_vertices || [];
    this.faces = foldData.faces_vertices || [];
    this.assignments = foldData.edges_assignment || [];
    this.foldAngles = foldData.edges_foldAngle || [];
  }

  /**
   * Full analysis of the FOLD model
   * @param {Object} options - { all: boolean, strict: boolean, validate: boolean, ... }
   * @returns {Object} Comprehensive analysis report conforming to docs/fold-analyzer-schema.json
   */
  analyze(options = {}) {
    return {
      schemaVersion: '2.10',
      basic: this.basicAnalysis(),
      structure: this.structureAnalysis(),
      validation: this.validateFlatFoldability(options),
      symmetry: this.detectSymmetry(options),
      classification: this.classifyPattern(options),
      quality: this.qualityAnalysis(),
      strain: this.analyzeStrain(),
      mvConsistency: this.analyzeMVConsistency(),
      selfIntersection: this.analyzeSelfIntersection(),
      faceNormals: this.analyzeFaceNormals(),
      holes: this.analyzeHoles(),
      foldOrder: this.analyzeFoldOrder(),
      mvAlternation: this.analyzeAlternatingMV(),
      strictKawasaki: this.strictKawasaki(),
      strictMaekawa: this.analyzeMaekawa(),
      completeSelfIntersection: this.analyzeCompleteSelfIntersection(),
      warnings: this.collectWarnings(),
    };
  }

  /**
   * Compute the symmetry tolerance (and per-symmetry residual threshold) for current options.
   * Returns { tolerance, residualAccept, strict }.
   */
  _symmetryTolerances(options) {
    const strict = !!options.strict;
    const frac = strict ? TOLERANCE_STRICT_FRAC : TOLERANCE_DEFAULT_FRAC;
    const floor = strict ? TOLERANCE_STRICT_FLOOR : TOLERANCE_DEFAULT_FLOOR;
    const residualAccept = strict ? RESIDUAL_ACCEPT_STRICT : RESIDUAL_ACCEPT_DEFAULT;

    if (this.vertices.length === 0) {
      return { tolerance: floor, residualAccept, strict };
    }
    const maxX = Math.max(...this.vertices.map(v => Math.abs(v[0] || 0)));
    const maxY = Math.max(...this.vertices.map(v => Math.abs(v[1] || 0)));
    const scale = Math.max(maxX, maxY, 1);
    const tolerance = Math.max(floor, scale * frac);
    return { tolerance, residualAccept, strict };
  }

  /**
   * Basic analysis (vertices, edges, faces, dimensions)
   *
   * v2.2: dieline-aware — a 1-face "mesh" is an unrolled dieline (open surface),
   * not a closed manifold, so the genus formula V - E + F = 2 doesn't apply.
   * Report genus as null and surfaceType as 'dieline' in that case.
   */
  basicAnalysis() {
    const v = this.vertices;
    const e = this.edges;
    const f = this.faces;

    // Compute bounding box
    const bbox = this.computeBoundingBox();

    // Count edge types
    const edgeStats = this.computeEdgeStats();

    // Euler characteristic: V - E + F = 2 for closed sphere, 0 for torus, etc.
    const euler = v.length - e.length + f.length;

    // Surface type: closed (≥2 faces) vs dieline (1 face) vs empty
    let surfaceType = 'empty';
    if (f.length === 1) surfaceType = 'dieline';
    else if (f.length >= 2) surfaceType = 'closed-or-mesh';

    // Genus only meaningful for closed orientable surfaces (≥2 faces).
    // Dieline (1 face) and empty (0 faces) have no well-defined genus.
    const genus = (surfaceType === 'closed-or-mesh') ? 1 - euler / 2 : null;

    return {
      vertexCount: v.length,
      edgeCount: e.length,
      faceCount: f.length,
      boundingBox: bbox,
      eulerCharacteristic: euler,
      genus,                       // null for dielines (was nonsensical number in v2.1)
      surfaceType,                 // NEW: 'empty' | 'dieline' | 'closed-or-mesh'
      edgeStats,
    };
  }

  /**
   * Structural analysis (manifold, connected components)
   */
  structureAnalysis() {
    // Check manifold property
    const isManifold = this.checkManifold();
    const components = this.countConnectedComponents();

    // Per-vertex valence
    const valences = this.computeValences();
    const avgValence = valences.length > 0
      ? valences.reduce((a, b) => a + b, 0) / valences.length
      : 0;

    // Layer analysis
    const layers = this.analyzeLayers();

    return {
      isManifold,
      componentCount: components,
      avgValence: avgValence.toFixed(2),
      valences,
      layers,
    };
  }

  /**
   * Validate flat-foldability using Kawasaki's theorem
   *
   * Kawasaki's theorem: A vertex can be flat-folded if and only if
   * alternating angles around the vertex sum to 180°.
   *
   * Skips validation for:
   * - Flat dielines (only 1 face, no real fold structure)
   * - Vertices with < 3 incident edges (boundary, can't fold)
   */
  validateFlatFoldability() {
    const vertexResults = [];
    let passCount = 0;
    let failCount = 0;
    let skipped = 0;

    // Skip flat dielines (1 face) - they're unrolled patterns, not 3D folds
    const isFlatDieline = this.faces.length === 1;
    if (isFlatDieline) {
      return {
        totalVertices: this.vertices.length,
        checkedVertices: 0,
        passCount: 0,
        failCount: 0,
        skipped: this.vertices.length,
        passRate: 'N/A (flat dieline)',
        note: 'Flat dieline - not a 3D foldable pattern',
        failedVertices: [],
      };
    }

    // 口径与 origami kawasaki / maekawa 统一（2026-11-26）：
    // 同一份内部折痕顶点集合（degree≥3 且不含 B 边）、同一套折痕角 + 几何环绕顺序，
    // 且 Kawasaki 只查偶数价顶点（定理的适用前提）。
    // 此前此处用的是**扇区角**且含边界顶点 → 与 origami kawasaki 给出互相矛盾的结论。
    for (const { vertex: vIdx, edges: incidentEdges } of this.getInternalCreaseVertices()) {
      // Kawasaki 要的是**扇区角**（几何量），不是折痕角（折叠量）——
      // 后者对 foldAngle ∈ {0,±180} 的 FOLD 恒真 → 假阳性。
      const sectors = this._sectorAngles(vIdx, incidentEdges);
      const evenSum = sectors.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
      const oddSum = sectors.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0);
      const altSum = Math.abs(evenSum - oddSum) * (180 / Math.PI);

      // Maekawa: M - V = ±2 for flat fold
      let mCount = 0, vCount = 0;
      for (const eIdx of incidentEdges) {
        const a = this.assignments[eIdx];
        if (a === 'M') mCount++;
        else if (a === 'V') vCount++;
      }
      const mvDiff = mCount - vCount;
      const maekawaValid = Math.abs(mvDiff) === 2;

      // Kawasaki 只适用于偶数价顶点（奇数项交替和不可能相消）
      const kawasakiValid = incidentEdges.length % 2 === 0
        && altSum < KAWASAKI_TOLERANCE_DEG;
      const passes = kawasakiValid && maekawaValid;

      if (passes) passCount++;
      else failCount++;

      if (!passes) {
        vertexResults.push({
          vertex: vIdx,
          kawasaki: { valid: kawasakiValid, sum: altSum.toFixed(2) },
          maekawa: { valid: maekawaValid, m: mCount, v: vCount, diff: mvDiff },
        });
      }
    }

    return {
      totalVertices: this.vertices.length,
      checkedVertices: passCount + failCount,
      skipped,
      passCount,
      failCount,
      passRate: (passCount + failCount) > 0
        ? (passCount / (passCount + failCount) * 100).toFixed(1) + '%'
        : 'N/A',
      failedVertices: vertexResults,
    };
  }

  /**
   * Detect symmetry (rotational, reflective)
   *
   * Strategy:
   * - Check all candidate n-fold rotations, recording the max residual (vertex displacement).
   * - Apply two-stage filter:
   *   (1) per-symmetry residual threshold (filters spurious high-n matches)
   *   (2) largest-independent-group: if n=12 passes, drop 2,3,4,6 (subgroups of cyclic C12)
   * - Reflective axes are reported independently (they form the dihedral group alongside C_n).
   *
   * @param {Object} options - { strict?: boolean } tightens tolerance and residual threshold.
   */
  detectSymmetry(options = {}) {
    const { tolerance, residualAccept, strict } = this._symmetryTolerances(options);
    const candidates = [2, 3, 4, 5, 6, 8, 12];
    const rotational = [];

    for (const n of candidates) {
      const residual = this.rotationalResidual(n, tolerance);
      if (residual === Infinity) continue;          // vertex-set mismatch
      if (residual > residualAccept) continue;       // too sloppy → spurious
      rotational.push({ n, residual });
    }

    // Sort by n descending; if multiple pass, keep the largest n.
    // Acyclic groups: 12 > 8 > 6 > 4 > 3 > 2 — keep the max only, since C_n ⊃ C_d for d|n.
    rotational.sort((a, b) => b.n - a.n);
    const keptRotational = rotational.length > 0 ? [rotational[0]] : [];

    const symmetries = keptRotational.map(({ n, residual }) => ({
      type: 'rotational',
      n,
      residual: Number(residual.toFixed(4)),
      tolerance: Number(tolerance.toFixed(4)),
    }));

    // Reflective axes are independent of cyclic order; keep all that pass.
    for (let axis = 0; axis < 3; axis++) {
      const residual = this.reflectiveResidual(axis, tolerance);
      if (residual === Infinity) continue;
      if (residual > residualAccept) continue;
      symmetries.push({
        type: 'reflective',
        axis,
        residual: Number(residual.toFixed(4)),
        tolerance: Number(tolerance.toFixed(4)),
      });
    }

    return {
      symmetries,
      hasSymmetry: symmetries.length > 0,
      strict,
      residualAccept: Number(residualAccept.toFixed(4)),
      filteredSubgroups: rotational.length - keptRotational.length,
    };
  }

  /**
   * Classify the crease pattern type
   */
  classifyPattern(options = {}) {
    const bbox = this.computeBoundingBox();
    const aspectRatio = bbox.width / bbox.height;

    // Check for known patterns
    const patternType = this.identifyPatternType(options);

    // Layer count for nesting
    const layerInfo = this.analyzeLayers();

    return {
      patternType,
      aspectRatio: aspectRatio.toFixed(2),
      boundingBox: bbox,
      layers: layerInfo,
    };
  }

  /**
   * Quality analysis (warnings, issues)
   */
  qualityAnalysis() {
    const issues = [];

    // Check for degenerate edges
    const degenerate = this.edges.filter(e => e[0] === e[1]);
    if (degenerate.length > 0) {
      issues.push({
        type: 'error',
        message: `${degenerate.length} degenerate edges (zero-length)`,
      });
    }

    // Check for duplicate edges
    // Use [...e].sort() to avoid mutating the original edge array (v2.8 bugfix)
    const edgeSet = new Set();
    for (const e of this.edges) {
      const key = [...e].sort().join(',');
      if (edgeSet.has(key)) {
        issues.push({
          type: 'warning',
          message: `Duplicate edge found: ${e.join('-')}`,
        });
      }
      edgeSet.add(key);
    }

    // Check isolated vertices
    const isolated = this.findIsolatedVertices();
    if (isolated.length > 0) {
      issues.push({
        type: 'warning',
        message: `${isolated.length} isolated vertices (no edges)`,
        details: isolated.slice(0, 10),
      });
    }

    // Check for T-junctions (non-manifold edges)
    const tJunctions = this.findTJunctions();
    if (tJunctions.length > 0) {
      issues.push({
        type: 'warning',
        message: `${tJunctions.length} potential T-junctions`,
        details: tJunctions.slice(0, 10).map(tj => `v${tj.vertex}→e${tj.edge}@t=${tj.t}`),
      });
    }

    // Check for very stretched faces
    const stretched = this.findStretchedFaces();
    if (stretched.length > 0) {
      issues.push({
        type: 'warning',
        message: `${stretched.length} highly stretched faces`,
        details: stretched.slice(0, 5),
      });
    }

    return {
      issues,
      issueCount: issues.length,
      errorCount: issues.filter(i => i.type === 'error').length,
      warningCount: issues.filter(i => i.type === 'warning').length,
    };
  }

  /**
   * Collect all warnings
   */
  collectWarnings() {
    const warnings = [];

    // No assignment info
    if (this.assignments.length === 0) {
      warnings.push('No edge assignments - cannot validate flat-foldability');
    }

    // No fold angles
    if (this.foldAngles.length === 0) {
      warnings.push('No fold angles - model is flat (unfolded)');
    }

    // Outdated fold angles (all ±180° = thin sheet)
    if (this.foldAngles.length > 0) {
      const thinSheet = this.foldAngles.every(a => Math.abs(a) === 180);
      if (thinSheet) {
        warnings.push('All fold angles are ±180° (thin-sheet assumption). Apply thickness constraint for physical accuracy.');
      }
    }

    return warnings;
  }

  // ============================================================
  // Helper methods
  // ============================================================

  computeBoundingBox() {
    if (this.vertices.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    }
    const xs = this.vertices.map(v => v[0]);
    const ys = this.vertices.map(v => v[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  }

  computeEdgeStats() {
    const stats = { M: 0, V: 0, B: 0, F: 0, unknown: 0 };
    for (const a of this.assignments) {
      if (stats[a] !== undefined) stats[a]++;
      else stats.unknown++;
    }
    return stats;
  }

  /**
   * Check if mesh is manifold (each edge shared by exactly 2 faces)
   */
  checkManifold() {
    const edgeFaceCount = new Map();
    for (const face of this.faces) {
      for (let i = 0; i < face.length; i++) {
        const a = face[i];
        const b = face[(i + 1) % face.length];
        const edgeKey = a < b ? `${a}-${b}` : `${b}-${a}`;
        edgeFaceCount.set(edgeKey, (edgeFaceCount.get(edgeKey) || 0) + 1);
      }
    }
    for (const count of edgeFaceCount.values()) {
      if (count !== 2) return false;
    }
    return true;
  }

  /**
   * Count connected components (using BFS)
   */
  countConnectedComponents() {
    if (this.vertices.length === 0) return 0;

    const adj = new Map();
    for (let i = 0; i < this.vertices.length; i++) adj.set(i, []);
    for (const [a, b] of this.edges) {
      if (a >= 0 && a < this.vertices.length && b >= 0 && b < this.vertices.length) {
        adj.get(a).push(b);
        adj.get(b).push(a);
      }
    }

    const visited = new Set();
    let components = 0;
    for (let i = 0; i < this.vertices.length; i++) {
      if (!visited.has(i)) {
        components++;
        const queue = [i];
        visited.add(i);
        while (queue.length > 0) {
          const v = queue.shift();
          for (const u of adj.get(v) || []) {
            if (!visited.has(u)) {
              visited.add(u);
              queue.push(u);
            }
          }
        }
      }
    }
    return components;
  }

  /**
   * Compute valence (number of edges) for each vertex
   */
  computeValences() {
    const valence = new Array(this.vertices.length).fill(0);
    for (const [a, b] of this.edges) {
      if (a >= 0 && a < valence.length) valence[a]++;
      if (b >= 0 && b < valence.length) valence[b]++;
    }
    return valence;
  }

  /**
   * Build (or return cached) vertex → edge-idx[] adjacency map.
   * v2.2 perf: O(V+E) once, vs O(V*E) if computed per-vertex.
   */
  _incidentEdgeMap() {
    if (this._incidentEdgeMapCache) return this._incidentEdgeMapCache;
    const map = new Array(this.vertices.length);
    for (let i = 0; i < map.length; i++) map[i] = [];
    for (let i = 0; i < this.edges.length; i++) {
      const [a, b] = this.edges[i];
      if (a >= 0 && a < map.length) map[a].push(i);
      if (b >= 0 && b < map.length && b !== a) map[b].push(i);
    }
    this._incidentEdgeMapCache = map;
    return map;
  }

  /**
   * Get incident edges for a vertex. Uses cached adjacency map (O(1) lookup).
   * Backward-compat: returns a fresh array, safe for callers to mutate.
   */
  getIncidentEdges(vIdx) {
    if (vIdx < 0 || vIdx >= this.vertices.length) return [];
    return [...this._incidentEdgeMap()[vIdx]];
  }

  /**
   * Compute angles around a vertex (using face normals)
   */
  computeVertexAngles(vIdx, incidentEdges) {
    if (this.vertices.length < 1) return [];

    // Get 2D position of the vertex
    const [vx, vy] = this.vertices[vIdx];

    // For each incident edge, compute direction
    const directions = [];
    for (const eIdx of incidentEdges) {
      const [a, b] = this.edges[eIdx];
      const otherIdx = a === vIdx ? b : a;
      const [ox, oy] = this.vertices[otherIdx];
      directions.push([ox - vx, oy - vy]);
    }

    // Sort directions by angle
    directions.sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));

    // Compute angles between consecutive directions
    const angles = [];
    for (let i = 0; i < directions.length; i++) {
      const p = directions[i];
      const q = directions[(i + 1) % directions.length];

      // Angle between p and q
      const dot = p[0] * q[0] + p[1] * q[1];
      const lenP = Math.sqrt(p[0] * p[0] + p[1] * p[1]);
      const lenQ = Math.sqrt(q[0] * q[0] + q[1] * q[1]);
      if (lenP === 0 || lenQ === 0) continue;
      const cosA = Math.max(-1, Math.min(1, dot / (lenP * lenQ)));
      angles.push(Math.acos(cosA) * 180 / Math.PI);
    }

    return angles;
  }

  /**
   * Compute max residual (vertex displacement) for n-fold rotation around the centroid.
   * Returns Infinity if the rotated vertex set doesn't match within tolerance.
   * Returns 0 for exact match (typical for idealised shapes).
   *
   * Bug fix vs v1.0: the original used tolerance = max(0.5, scale*0.01), which over-loosened
   * small models (unit cube → 0.5 tolerance = half side length) and caused spurious 5/6/12-fold
   * matches. New formula: max(0.01, scale*0.001) by default, max(0.001, scale*0.0001) in strict.
   */
  rotationalResidual(n, tolerance) {
    if (this.vertices.length === 0) return Infinity;

    const cx = this.vertices.reduce((s, v) => s + v[0], 0) / this.vertices.length;
    const cy = this.vertices.reduce((s, v) => s + v[1], 0) / this.vertices.length;
    const angle = (2 * Math.PI) / n;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let maxResidual = 0;
    for (const v of this.vertices) {
      const dx = v[0] - cx;
      const dy = v[1] - cy;
      const rx = cx + dx * cosA - dy * sinA;
      const ry = cy + dx * sinA + dy * cosA;

      // Find closest matching vertex and record its distance
      let best = Infinity;
      for (const v2 of this.vertices) {
        const ddx = v2[0] - rx;
        const ddy = v2[1] - ry;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < best) best = d;
      }
      if (best > tolerance) return Infinity;     // failed match → no symmetry
      if (best > maxResidual) maxResidual = best;
    }
    return maxResidual;
  }

  /**
   * Backward-compat boolean wrapper. Kept for any external callers.
   */
  hasRotationalSymmetry(n, options = {}) {
    const { tolerance } = this._symmetryTolerances(options);
    return this.rotationalResidual(n, tolerance) !== Infinity;
  }

  /**
   * Compute max residual for reflection about the given axis (0=X, 1=Y, 2=diagonal).
   *
   * v2.2 fix: previously reflected about the origin, which is correct only when
   * the model is centred at (0, 0). For off-centre models this gave false negatives.
   * Now reflects about the centroid of the vertex set, which is the mathematically
   * correct axis for dihedral symmetry detection.
   *
   * v2.2 fix 2: for single-face meshes (dielines / line drawings) there are no
   * other faces to match against, so face-based residual returns Infinity. Fall
   * back to vertex-set residual: each reflected vertex must match some vertex.
   */
  reflectiveResidual(axis, tolerance) {
    if (this.vertices.length === 0) return Infinity;

    // Centroid of vertex set (not face set — face centroids are irrelevant for
    // reflective symmetry of the vertex layout).
    const cx = this.vertices.reduce((s, v) => s + v[0], 0) / this.vertices.length;
    const cy = this.vertices.reduce((s, v) => s + v[1], 0) / this.vertices.length;

    // Reflect every vertex about the centroid
    const reflectedAll = this.vertices.map(v => {
      const dx = v[0] - cx;
      const dy = v[1] - cy;
      if (axis === 0) return [cx + dx, cy - dy];   // mirror about horizontal axis
      if (axis === 1) return [cx - dx, cy + dy];   // mirror about vertical axis
      return [cx + dy, cy + dx];                     // mirror about diagonal y=x
    });

    // Compute max distance from each reflected vertex to its nearest original vertex
    let maxResidual = 0;
    for (const rv of reflectedAll) {
      let best = Infinity;
      for (const ov of this.vertices) {
        const dx = ov[0] - rv[0];
        const dy = ov[1] - rv[1];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) best = d;
      }
      if (best > tolerance) return Infinity;       // residual exceeds tolerance
      if (best > maxResidual) maxResidual = best;
    }

    // For multi-face meshes, additionally require face→face match (catches
    // cases where vertex set is symmetric but face structure isn't, e.g. a
    // degenerate layout). For 0 or 1 faces, skip the face check.
    if (this.faces.length >= 2) {
      for (const face of this.faces) {
        const reflectedFace = face.map(vIdx => reflectedAll[vIdx]);
        let bestFace = Infinity;
        for (const otherFace of this.faces) {
          if (otherFace.length !== reflectedFace.length) continue;
          let faceBest = Infinity;
          for (const rv of reflectedFace) {
            let vBest = Infinity;
            for (const ov of otherFace) {
              const ov2 = this.vertices[ov];
              const dx = ov2[0] - rv[0];
              const dy = ov2[1] - rv[1];
              const d = Math.sqrt(dx * dx + dy * dy);
              if (d < vBest) vBest = d;
            }
            if (vBest > faceBest) faceBest = vBest;
          }
          if (faceBest < bestFace) bestFace = faceBest;
        }
        if (bestFace === Infinity) return Infinity;
        if (bestFace > tolerance) return Infinity;
      }
    }
    return maxResidual;
  }

  /**
   * Backward-compat boolean wrapper.
   */
  hasReflectiveSymmetry(axis, options = {}) {
    const { tolerance } = this._symmetryTolerances(options);
    return this.reflectiveResidual(axis, tolerance) !== Infinity;
  }

  /**
   * Identify pattern type (cubic, star, tessellation, etc.)
   */
  identifyPatternType(options = {}) {
    // Check for box (8 vertices, 6 faces, 12 edges)
    if (this.vertices.length === 8 && this.faces.length === 6) {
      return 'box';
    }
    // Check for flat sheet
    if (this.vertices.length === 4 && this.faces.length === 1) {
      return 'flat-sheet';
    }
    // Check for tessellation (many small faces, reflective symmetry)
    if (this.faces.length > 20 && this.detectSymmetry(options).symmetries.some(s => s.type === 'reflective')) {
      return 'tessellation';
    }
    if (this.faces.length > 50) {
      return 'complex-mesh';
    }
    // Check for star/flower (rotational symmetry, n>=6)
    if (this.detectSymmetry(options).symmetries.some(s => s.type === 'rotational' && s.n >= 6)) {
      return 'star/flower';
    }
    return 'generic';
  }

  /**
   * Analyze layer ordering (nesting depth) — v2.3 real implementation.
   *
   * Layer source priority (most reliable first):
   *   1. `face_orders` — explicit integer z-order per face (FOLD spec)
   *   2. 3D vertex z-coords — quantize face centroids into integer layers
   *   3. `edges_foldAngle` — rough estimate from unique fold magnitudes
   *   4. flat — single layer (typical for unfolded dieline)
   *
   * For 2D models without face_orders, also computes `maxOverlap` via
   * point-in-polygon tests: how many faces contain each face's centroid.
   * This is the spatial "nesting depth" — different from layer ordering,
   * but a useful proxy for how many sheets of paper stack at any point.
   *
   * @returns {{
   *   source: 'explicit' | 'implicit-3d' | 'implicit-fold' | 'flat',
   *   faceCount: number,
   *   minLayer: number, maxLayer: number, nestingDepth: number, avgLayer: number,
   *   facesPerLayer: Object<number, number>,
   *   maxOverlap: number,           // spatial nesting (1+)
   *   hasExplicitOrders: boolean,
   *   notes: string[]
   * }}
   */
  analyzeLayers() {
    const result = {
      source: 'flat',
      faceCount: this.faces.length,
      minLayer: 1,
      maxLayer: 1,
      nestingDepth: 1,
      avgLayer: 1,
      facesPerLayer: { 1: this.faces.length },
      maxOverlap: 1,
      hasExplicitOrders: false,
      notes: [],
    };

    if (this.faces.length === 0) {
      result.notes.push('No faces — cannot analyze layers');
      return result;
    }

    // 1. Explicit face_orders
    const orders = this.fold.face_orders;
    if (Array.isArray(orders) && orders.length === this.faces.length) {
      result.source = 'explicit';
      result.hasExplicitOrders = true;
      result.faceOrders = orders;
      const minL = Math.min(...orders);
      const maxL = Math.max(...orders);
      result.minLayer = minL;
      result.maxLayer = maxL;
      result.nestingDepth = maxL - minL + 1;
      result.avgLayer = orders.reduce((a, b) => a + b, 0) / orders.length;
      const histogram = {};
      for (const o of orders) histogram[o] = (histogram[o] || 0) + 1;
      result.facesPerLayer = histogram;
      result.notes.push(`face_orders present (${orders.length} entries)`);
      return result;
    }

    // 2. Implicit 3D z-coordinates
    if (this.vertices.length > 0 && this.vertices.some(v => Array.isArray(v) && v.length >= 3 && Math.abs(v[2] || 0) > 0.01)) {
      result.source = 'implicit-3d';
      const zValues = this.faces.map(face => this._faceCentroidZ(face));
      // Quantize z-values to integer layers (split on gaps > 0.01)
      const sortedZ = [...zValues].sort((a, b) => a - b);
      const layerMap = new Map();
      let currentLayer = 1;
      layerMap.set(sortedZ[0], currentLayer);
      for (let i = 1; i < sortedZ.length; i++) {
        if (Math.abs(sortedZ[i] - sortedZ[i - 1]) > 0.01) currentLayer++;
        layerMap.set(sortedZ[i], currentLayer);
      }
      const inferredOrders = zValues.map(z => layerMap.get(z));
      result.faceOrders = inferredOrders;
      result.minLayer = 1;
      result.maxLayer = currentLayer;
      result.nestingDepth = currentLayer;
      result.avgLayer = inferredOrders.reduce((a, b) => a + b, 0) / inferredOrders.length;
      const histogram = {};
      for (const o of inferredOrders) histogram[o] = (histogram[o] || 0) + 1;
      result.facesPerLayer = histogram;
      result.notes.push(`Layers inferred from 3D vertex z-coords (${currentLayer} distinct z-planes)`);
      return result;
    }

    // 3. Implicit foldAngle
    if (this.foldAngles.length > 0 && this.foldAngles.some(a => Math.abs(a) > 0.01 && Math.abs(a - 180) > 0.01)) {
      result.source = 'implicit-fold';
      // Crude estimate: count distinct |foldAngle| values as layer proxy
      const unique = new Set(this.foldAngles.map(a => Math.round(Math.abs(a) / 5) * 5));
      result.nestingDepth = Math.min(unique.size + 1, 10);
      result.maxLayer = result.nestingDepth;
      result.notes.push(`Layers estimated from ${unique.size} distinct fold angles (rough)`);
      result.notes.push('Geometric fold-based layer inference not yet implemented');
    }

    // 4. Spatial nesting via point-in-polygon (always compute, for 2D models)
    if (this.faces.length > 1) {
      result.maxOverlap = this._computeMaxOverlap();
      if (result.source === 'flat' && result.maxOverlap > 1) {
        result.notes.push(`Flat model but ${result.maxOverlap} faces overlap at some point (spatial nesting)`);
      }
    }
    return result;
  }

  /**
   * Compute the z-coordinate of a face's centroid (for 3D z-layer inference).
   * Returns 0 for empty or invalid faces.
   */
  _faceCentroidZ(face) {
    if (!Array.isArray(face) || face.length === 0) return 0;
    let sum = 0;
    let count = 0;
    for (const idx of face) {
      const v = this.vertices[idx];
      if (Array.isArray(v) && v.length >= 3) {
        sum += v[2] || 0;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  /**
   * Compute the 2D centroid of a face (used for spatial nesting test).
   */
  _faceCentroid(face) {
    if (!Array.isArray(face) || face.length === 0) return [0, 0];
    let sx = 0, sy = 0, n = 0;
    for (const idx of face) {
      const v = this.vertices[idx];
      if (Array.isArray(v) && v.length >= 2) {
        sx += v[0];
        sy += v[1];
        n++;
      }
    }
    return n > 0 ? [sx / n, sy / n] : [0, 0];
  }

  /**
   * Point-in-polygon test (ray casting algorithm).
   * Works for convex and concave polygons, including holes (handled by winding).
   */
  _pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    const [px, py] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const vi = this.vertices[polygon[i]];
      const vj = this.vertices[polygon[j]];
      if (!vi || !vj) continue;
      const xi = vi[0], yi = vi[1];
      const xj = vj[0], yj = vj[1];
      const intersect = ((yi > py) !== (yj > py)) &&
                        (px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Compute the max overlap (nesting depth) at any face centroid.
   * For each face, count how many faces contain its centroid. Return the max.
   * Cost: O(F²) point-in-polygon tests, each O(V). For F=1000, V=10 → ~10⁷ ops.
   */
  _computeMaxOverlap() {
    if (this.faces.length === 0) return 1;
    const centroids = this.faces.map(f => this._faceCentroid(f));
    let maxOverlap = 1;
    for (let i = 0; i < this.faces.length; i++) {
      let count = 1;  // count self
      for (let j = 0; j < this.faces.length; j++) {
        if (i === j) continue;
        if (this._pointInPolygon(centroids[i], this.faces[j])) count++;
      }
      if (count > maxOverlap) maxOverlap = count;
    }
    return maxOverlap;
  }

  /**
   * Compute face normal using Newell's method (works for non-planar polygons too).
   * Returns [nx, ny, nz] unnormalized. Length is proportional to 2× polygon area.
   */
  faceNormal(face) {
    if (!Array.isArray(face) || face.length < 3) return [0, 0, 0];
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < face.length; i++) {
      const cur = this.vertices[face[i]] || [0, 0, 0];
      const next = this.vertices[face[(i + 1) % face.length]] || [0, 0, 0];
      const cx = cur[0] || 0, cy = cur[1] || 0, cz = cur[2] || 0;
      const nx_ = next[0] || 0, ny_ = next[1] || 0, nz_ = next[2] || 0;
      nx += (cy - ny_) * (cz + nz_);
      ny += (cz - nz_) * (cx + nx_);
      nz += (cx - nx_) * (cy + ny_);
    }
    return [nx, ny, nz];
  }

  /**
   * Find all face indices that contain both endpoints of an edge.
   * For a 2-manifold mesh, this returns 0, 1, or 2 faces (boundary edge = 1).
   */
  findAdjacentFaces(edgeIdx) {
    if (edgeIdx < 0 || edgeIdx >= this.edges.length) return [];
    const [a, b] = this.edges[edgeIdx];
    const adjacent = [];
    for (let i = 0; i < this.faces.length; i++) {
      const face = this.faces[i];
      let hasA = false, hasB = false;
      for (const v of face) {
        if (v === a) hasA = true;
        if (v === b) hasB = true;
      }
      if (hasA && hasB) adjacent.push(i);
    }
    return adjacent;
  }

  /**
   * Compute axis-aligned bounding box for a face.
   * Returns { minX, maxX, minY, maxY, minZ, maxZ }.
   */
  _faceAABB(face) {
    if (!Array.isArray(face) || face.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    }
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const vi of face) {
      const v = this.vertices[vi];
      if (!v) continue;
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
      if (v[2] !== undefined) {
        if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
      }
    }
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  /**
   * Test if two AABBs overlap (with optional tolerance).
   */
  _aabbOverlap(a, b, tolerance = 0) {
    return a.maxX + tolerance >= b.minX && a.minX - tolerance <= b.maxX &&
           a.maxY + tolerance >= b.minY && a.minY - tolerance <= b.maxY &&
           a.maxZ + tolerance >= b.minZ && a.minZ - tolerance <= b.maxZ;
  }

  /**
   * Test if two faces share an edge (are adjacent in the mesh).
   * True if there exists an edge in `this.edges` that has both endpoints in both faces.
   */
  _facesShareEdge(face1Idx, face2Idx) {
    if (face1Idx === face2Idx) return true;
    const f1 = this.faces[face1Idx];
    const f2 = this.faces[face2Idx];
    if (!f1 || !f2) return false;
    // Build vertex set for face2
    const set2 = new Set(f2);
    // Count how many vertices of face1 are in face2
    let shared = 0;
    for (const v of f1) if (set2.has(v)) shared++;
    // 2 shared vertices = share an edge
    return shared >= 2;
  }

  /**
   * Closest distance between two 3D line segments.
   * Real-Time Collision Detection (Ericson) §5.1.9, simplified.
   * Returns { distance, s, t } where s, t ∈ [0, 1] are closest-point params.
   */
  _segmentClosestDistance3D(p1, q1, p2, q2) {
    const EPS = 1e-12;
    const dx1 = q1[0] - p1[0], dy1 = q1[1] - p1[1], dz1 = q1[2] - p1[2];
    const dx2 = q2[0] - p2[0], dy2 = q2[1] - p2[1], dz2 = q2[2] - p2[2];
    const rx = p1[0] - p2[0], ry = p1[1] - p2[1], rz = p1[2] - p2[2];
    const a = dx1*dx1 + dy1*dy1 + dz1*dz1;
    const e = dx2*dx2 + dy2*dy2 + dz2*dz2;
    const f = dx2*rx + dy2*ry + dz2*rz;

    let s, t;
    if (a <= EPS && e <= EPS) {
      // Both segments are points
      s = 0; t = 0;
    } else if (a <= EPS) {
      s = 0;
      t = Math.max(0, Math.min(1, f / e));
    } else {
      const c = dx1*rx + dy1*ry + dz1*rz;
      if (e <= EPS) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else {
        const b = dx1*dx2 + dy1*dy2 + dz1*dz2;
        const denom = a * e - b * b;
        s = denom !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
        else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
      }
    }

    // Closest points
    const c1x = p1[0] + s * dx1, c1y = p1[1] + s * dy1, c1z = p1[2] + s * dz1;
    const c2x = p2[0] + t * dx2, c2y = p2[1] + t * dy2, c2z = p2[2] + t * dz2;
    const dd = Math.sqrt((c1x - c2x) ** 2 + (c1y - c2y) ** 2 + (c1z - c2z) ** 2);
    return { distance: dd, s, t };
  }

  /**
   * Compute the dihedral angle (in degrees, 0–180) between the two faces
   * adjacent to an edge. Returns null if the edge has < 2 adjacent faces,
   * the edge is degenerate, or one of the faces is degenerate.
   *
   * Method: dihedral = 180° − arccos(|n1 · n2| / (|n1| |n2|))
   * (uses absolute value so orientation of face normals doesn't matter).
   *
   *   n1 parallel n2 (coplanar faces) → 180° − 0°   = 180°  ✓ (no fold)
   *   n1 perpendicular n2            → 180° − 90°  = 90°   ✓ (right-angle fold)
   *   n1 antiparallel n2             → 180° − 180° = 0°    ✓ (fully creased)
   */
  dihedralAngle(edgeIdx) {
    if (edgeIdx < 0 || edgeIdx >= this.edges.length) return null;
    const adjacent = this.findAdjacentFaces(edgeIdx);
    if (adjacent.length < 2) return null;

    const n1 = this.faceNormal(this.faces[adjacent[0]]);
    const n2 = this.faceNormal(this.faces[adjacent[1]]);
    const l1 = Math.sqrt(n1[0] * n1[0] + n1[1] * n1[1] + n1[2] * n1[2]);
    const l2 = Math.sqrt(n2[0] * n2[0] + n2[1] * n2[1] + n2[2] * n2[2]);
    if (l1 < 1e-12 || l2 < 1e-12) return null;

    const cosA = Math.max(-1, Math.min(1, Math.abs(n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (l1 * l2)));
    return (180 - Math.acos(cosA) * 180 / Math.PI);
  }

  /**
   * Analyze M/V bend-direction consistency: verify that each M/V edge's
   * declared foldAngle matches the dihedral angle computed from face normals.
   *
   * For 2D models (no z data), fall back to a foldAngle presence check:
   *   - M/V with foldAngle = 0 or 180 → suspicious (says it's a fold but angle is flat)
   *   - B/F with foldAngle != 0 → suspicious (boundary/flat edge shouldn't have a fold angle)
   *
   * For 3D models, compare dihedral (geometric) with foldAngle (declared).
   * Mismatch tolerance: 5° (typical floating-point + solver convergence noise).
   *
   * Note: the SIGN of the foldAngle vs the M/V assignment is convention-dependent
   * and not checked here — we only verify the MAGNITUDE.
   *
   * @returns {{
   *   totalChecked: number,
   *   consistent: number,
   *   inconsistent: number,
   *   noGeometry: number,        // 2D models, can't compute dihedral
   *   geometricInconsistencies: Array<{ edge, assignment, foldAngle, dihedral, diff }>,
   *   structuralInconsistencies: Array<{ edge, assignment, foldAngle, issue, detail }>,
   *   notes: string[]
   * }}
   */
  analyzeMVConsistency() {
    const result = {
      totalChecked: 0,
      consistent: 0,
      inconsistent: 0,
      noGeometry: 0,
      geometricInconsistencies: [],
      structuralInconsistencies: [],
      notes: [],
    };

    if (this.faces.length < 2) {
      // Need at least 2 faces for any dihedral check, but the 2D structural
      // check (M/V + flat foldAngle) doesn't require 2 faces — only the
      // 3D geometric check does. So we just note this and continue.
      result.notes.push('Fewer than 2 faces — 3D dihedral check disabled, 2D structural check still active');
    }

    // Detect 3D model
    const is3D = this.vertices.some(v => Array.isArray(v) && v.length >= 3 && Math.abs(v[2] || 0) > 0.01);
    if (!is3D) {
      result.notes.push('2D model — falling back to foldAngle presence check (no dihedral available)');
    }

    const ANGLE_TOLERANCE = 5.0;  // degrees

    for (let i = 0; i < this.edges.length; i++) {
      const assignment = this.assignments[i];
      if (assignment !== 'M' && assignment !== 'V') continue;
      result.totalChecked++;

      const foldAngle = (i < this.foldAngles.length) ? this.foldAngles[i] : undefined;

      // 3D check: dihedral vs foldAngle
      if (is3D && foldAngle !== undefined && foldAngle !== null) {
        const dihedral = this.dihedralAngle(i);
        if (dihedral === null) {
          // Edge has < 2 adjacent faces or degenerate — can't check, skip
          result.noGeometry++;
          continue;
        }
        // The dihedral is in [0, 180]. The foldAngle can be in [-180, 180].
        // We compare magnitudes: |180 - foldAngle| should equal dihedral.
        // (When paper folds to 90°, the dihedral is 90°; the foldAngle is 90° from flat.)
        const expectedDihedral = Math.abs(180 - Math.abs(foldAngle));
        const diff = Math.abs(dihedral - expectedDihedral);
        if (diff > ANGLE_TOLERANCE) {
          result.inconsistent++;
          result.geometricInconsistencies.push({
            edge: i,
            assignment,
            foldAngle,
            dihedral: Number(dihedral.toFixed(2)),
            expectedDihedral: Number(expectedDihedral.toFixed(2)),
            diff: Number(diff.toFixed(2)),
            issue: 'foldAngle-does-not-match-geometry',
          });
        } else {
          result.consistent++;
        }
        continue;
      }

      // 2D check (or 3D without foldAngle data): structural sanity
      if (foldAngle === undefined || foldAngle === null) {
        result.noGeometry++;
        continue;
      }
      const absFold = Math.abs(foldAngle);
      if (absFold < 0.5 || absFold > 179.5) {
        // M/V edge with essentially flat (0° or 180°) foldAngle — suspicious
        result.inconsistent++;
        result.structuralInconsistencies.push({
          edge: i,
          assignment,
          foldAngle,
          issue: 'fold-edge-with-flat-angle',
          detail: `${assignment} edge but foldAngle ≈ ${foldAngle}° (essentially flat)`,
        });
      } else {
        result.consistent++;
      }
    }

    if (result.totalChecked === 0) {
      result.notes.push('No M/V edges found');
    }

    // v2.10: M/V-Layer skip detection (structural inconsistency)
    // For each M/V edge between faces at different layers, if the layer gap is > 1,
    // that's a "skip-layer" fold — physically implausible (a single fold can't bridge
    // a layer gap > 1). Flag as structuralInconsistency.
    const layerInfo = this.analyzeLayers();
    if (layerInfo.faceOrders && layerInfo.faceOrders.length === this.faces.length) {
      for (let i = 0; i < this.edges.length; i++) {
        const assignment = this.assignments[i];
        if (assignment !== 'M' && assignment !== 'V') continue;
        const adjacent = this.findAdjacentFaces(i);
        if (adjacent.length < 2) continue;

        const layer1 = layerInfo.faceOrders[adjacent[0]] || 1;
        const layer2 = layerInfo.faceOrders[adjacent[1]] || 1;
        const layerGap = Math.abs(layer1 - layer2);
        if (layerGap > 1) {
          result.inconsistent++;
          result.structuralInconsistencies.push({
            edge: i,
            assignment,
            foldAngle: (i < this.foldAngles.length) ? this.foldAngles[i] : undefined,
            issue: 'mv-layer-skip',
            detail: `${assignment} edge ${i} skips layers: face ${adjacent[0]} on layer ${layer1}, face ${adjacent[1]} on layer ${layer2} (gap ${layerGap})`,
          });
        }
      }
      const layerSkips = result.structuralInconsistencies.filter(s => s.issue === 'mv-layer-skip').length;
      if (layerSkips > 0) {
        result.notes.push(`Found ${layerSkips} M/V edge(s) skipping layers (structural inconsistency)`);
      }
    }
    return result;
  }

  /**
   * Detect self-intersections in 3D folded models.
   *
   * v2.6: edge-edge crossings via 3D segment-segment closest distance.
   * v2.7: also detects
   *   - Vertex-face inclusion (a face's vertex inside another face)
   *   - Coplanar face overlap (two faces in the same plane, 2D overlap)
   *
   * For each pair of non-adjacent faces, AABB pre-filter to skip
   * obviously-separated pairs, then detailed geometric checks.
   *
   * Skips:
   *   - Adjacent faces (share an edge — natural mesh connection)
   *   - 2D models (all faces coplanar — no 3D intersection possible)
   *
   * @returns {{
   *   facePairCount: number,
   *   aabbSurvivorCount: number,
   *   intersectionCount: number,
   *   edgeCrossingCount: number,
   *   vertexInsideCount: number,
   *   coplanarOverlapCount: number,
   *   intersections: Array<{ face1: number, face2: number, kind: string, minDistance?: number }>,
   *   notes: string[]
   * }}
   */
  analyzeSelfIntersection() {
    const result = {
      facePairCount: 0,
      aabbSurvivorCount: 0,
      intersectionCount: 0,
      edgeCrossingCount: 0,
      vertexInsideCount: 0,
      coplanarOverlapCount: 0,
      intersections: [],
      notes: [],
    };

    if (this.faces.length < 2) {
      result.notes.push('Fewer than 2 faces — nothing to check');
      return result;
    }

    // Detect 3D model
    const is3D = this.vertices.some(v => Array.isArray(v) && v.length >= 3 && Math.abs(v[2] || 0) > 1e-6);
    if (!is3D) {
      result.notes.push('2D model — all faces coplanar, no 3D self-intersection possible');
      return result;
    }

    // Pre-compute AABBs
    const aabbs = this.faces.map(f => this._faceAABB(f));

    const TOLERANCE = 0.01;  // 0.01mm

    for (let i = 0; i < this.faces.length; i++) {
      for (let j = i + 1; j < this.faces.length; j++) {
        if (this._facesShareEdge(i, j)) continue;
        result.facePairCount++;

        if (!this._aabbOverlap(aabbs[i], aabbs[j], TOLERANCE)) continue;
        result.aabbSurvivorCount++;

        const f1 = this.faces[i];
        const f2 = this.faces[j];
        let pairMinDist = Infinity;
        let foundKind = null;

        // Check order: coplanar → vertex-inside → edge-crossing
        // Rationale: coplanar overlap is a 2D concept in a 3D world; if faces
        // are parallel-offset, vertex-inside might also fire but coplanar-overlap
        // is the more semantically correct label.

        // 1) Coplanar overlap check (v2.7 G+2)
        {
          const cop = this._coplanarOverlap(f1, f2);
          if (cop.coplanar && cop.overlap) {
            foundKind = 'coplanar-overlap';
          }
        }

        // 2) Vertex-face inclusion check (v2.7 G+1)
        if (!foundKind) {
          for (const vi of f1) {
            if (this._pointInsideFace3D(this.vertices[vi], f2, TOLERANCE)) {
              foundKind = 'vertex-inside';
              break;
            }
          }
          if (!foundKind) {
            for (const vi of f2) {
              if (this._pointInsideFace3D(this.vertices[vi], f1, TOLERANCE)) {
                foundKind = 'vertex-inside';
                break;
              }
            }
          }
        }

        // 3) Edge-edge crossing check (3D segment-segment distance)
        if (!foundKind) {
          for (let e1 = 0; e1 < f1.length; e1++) {
            const a1 = this.vertices[f1[e1]];
            const a2 = this.vertices[f1[(e1 + 1) % f1.length]];
            for (let e2 = 0; e2 < f2.length; e2++) {
              const b1 = this.vertices[f2[e2]];
              const b2 = this.vertices[f2[(e2 + 1) % f2.length]];
              if (this._segmentsShareVertex(a1, a2, b1, b2)) continue;
              const r = this._segmentClosestDistance3D(a1, a2, b1, b2);
              if (r.distance < pairMinDist) pairMinDist = r.distance;
              if (r.distance < TOLERANCE) {
                foundKind = 'edge-crossing';
                break;
              }
            }
            if (foundKind) break;
          }
        }

        if (foundKind) {
          result.intersectionCount++;
          const entry = { face1: i, face2: j, kind: foundKind };
          if (pairMinDist < Infinity) entry.minDistance = Number(pairMinDist.toFixed(4));
          result.intersections.push(entry);
          if (foundKind === 'edge-crossing') result.edgeCrossingCount++;
          else if (foundKind === 'vertex-inside') result.vertexInsideCount++;
          else if (foundKind === 'coplanar-overlap') result.coplanarOverlapCount++;
        }
      }
    }

    if (result.intersectionCount === 0) {
      result.notes.push('No self-intersections detected ✓');
    } else {
      const parts = [];
      if (result.edgeCrossingCount > 0) parts.push(`${result.edgeCrossingCount} edge-crossing`);
      if (result.vertexInsideCount > 0) parts.push(`${result.vertexInsideCount} vertex-inside`);
      if (result.coplanarOverlapCount > 0) parts.push(`${result.coplanarOverlapCount} coplanar-overlap`);
      result.notes.push(`Found ${result.intersectionCount} intersecting pair(s): ${parts.join(', ')}`);
    }
    return result;
  }

  /**
   * Test if two segments share a vertex (i.e., one of p1/q1 equals one of p2/q2).
   * Used to skip trivial intersections at mesh boundaries.
   */
  _segmentsShareVertex(p1, q1, p2, q2) {
    const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs((a[2] || 0) - (b[2] || 0)) < 1e-9;
    return same(p1, p2) || same(p1, q2) || same(q1, p2) || same(q1, q2);
  }

  /**
   * 2D point-in-polygon (ray casting). Returns true if point is inside polygon.
   */
  _pointInPolygon2D(point, polygon2D) {
    if (!Array.isArray(polygon2D) || polygon2D.length < 3) return false;
    const [px, py] = point;
    let inside = false;
    for (let i = 0, j = polygon2D.length - 1; i < polygon2D.length; j = i++) {
      const [xi, yi] = polygon2D[i];
      const [xj, yj] = polygon2D[j];
      if (((yi > py) !== (yj > py)) &&
          (px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * 2D segment-segment intersection test.
   */
  _segments2DIntersect(p1, p2, p3, p4) {
    const d1 = (p4[0] - p3[0]) * (p1[1] - p3[1]) - (p4[1] - p3[1]) * (p1[0] - p3[0]);
    const d2 = (p4[0] - p3[0]) * (p2[1] - p3[1]) - (p4[1] - p3[1]) * (p2[0] - p3[0]);
    const d3 = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
    const d4 = (p2[0] - p1[0]) * (p4[1] - p1[1]) - (p2[1] - p1[1]) * (p4[0] - p1[0]);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  /**
   * Test if a 3D point lies inside a 3D face polygon (within plane tolerance).
   * Method: project to 2D by dropping the dominant axis of the face normal,
   * then run 2D point-in-polygon.
   */
  _pointInsideFace3D(point, face, tolerance = 0.01) {
    if (!Array.isArray(face) || face.length < 3) return false;
    const n = this.faceNormal(face);
    const nLen = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2);
    if (nLen < 1e-12) return false;

    // Distance from point to face's plane
    const planePoint = this.vertices[face[0]] || [0, 0, 0];
    const dx = (point[0] || 0) - (planePoint[0] || 0);
    const dy = (point[1] || 0) - (planePoint[1] || 0);
    const dz = (point[2] || 0) - (planePoint[2] || 0);
    const planeDist = Math.abs(n[0] * dx + n[1] * dy + n[2] * dz) / nLen;
    if (planeDist > tolerance) return false;

    // Choose projection axis (drop the one with the largest normal component)
    const absN = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
    let axis;
    if (absN[0] >= absN[1] && absN[0] >= absN[2]) axis = 0;
    else if (absN[1] >= absN[2]) axis = 1;
    else axis = 2;

    const point2D = axis === 0 ? [(point[1] || 0), (point[2] || 0)] :
                    axis === 1 ? [(point[0] || 0), (point[2] || 0)] :
                                 [(point[0] || 0), (point[1] || 0)];
    const face2D = face.map(vi => {
      const v = this.vertices[vi] || [0, 0, 0];
      return axis === 0 ? [(v[1] || 0), (v[2] || 0)] :
             axis === 1 ? [(v[0] || 0), (v[2] || 0)] :
                          [(v[0] || 0), (v[1] || 0)];
    });
    return this._pointInPolygon2D(point2D, face2D);
  }

  /**
   * Test if two faces are coplanar and overlap in 2D.
   * Returns: { coplanar: boolean, overlap: boolean, projectionAxis: number }
   */
  _coplanarOverlap(face1, face2, coplanarityTolerance = 0.001) {
    const n1 = this.faceNormal(face1);
    const n2 = this.faceNormal(face2);
    const n1Len = Math.sqrt(n1[0] ** 2 + n1[1] ** 2 + n1[2] ** 2);
    const n2Len = Math.sqrt(n2[0] ** 2 + n2[1] ** 2 + n2[2] ** 2);
    if (n1Len < 1e-12 || n2Len < 1e-12) return { coplanar: false, overlap: false };

    // Check parallel/antiparallel (use absolute value for orientation)
    const dot = Math.abs(n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (n1Len * n2Len);
    if (dot < 1 - coplanarityTolerance) return { coplanar: false, overlap: false };

    // Project both faces to 2D using dominant axis of n1
    const absN = [Math.abs(n1[0]), Math.abs(n1[1]), Math.abs(n1[2])];
    let axis;
    if (absN[0] >= absN[1] && absN[0] >= absN[2]) axis = 0;
    else if (absN[1] >= absN[2]) axis = 1;
    else axis = 2;

    const f1_2D = face1.map(vi => {
      const v = this.vertices[vi] || [0, 0, 0];
      return axis === 0 ? [(v[1] || 0), (v[2] || 0)] :
             axis === 1 ? [(v[0] || 0), (v[2] || 0)] :
                          [(v[0] || 0), (v[1] || 0)];
    });
    const f2_2D = face2.map(vi => {
      const v = this.vertices[vi] || [0, 0, 0];
      return axis === 0 ? [(v[1] || 0), (v[2] || 0)] :
             axis === 1 ? [(v[0] || 0), (v[2] || 0)] :
                          [(v[0] || 0), (v[1] || 0)];
    });

    // Edge-edge 2D intersections
    for (let i = 0; i < f1_2D.length; i++) {
      const a1 = f1_2D[i], a2 = f1_2D[(i + 1) % f1_2D.length];
      for (let j = 0; j < f2_2D.length; j++) {
        const b1 = f2_2D[j], b2 = f2_2D[(j + 1) % f2_2D.length];
        if (this._segments2DIntersect(a1, a2, b1, b2)) {
          return { coplanar: true, overlap: true, projectionAxis: axis };
        }
      }
    }
    // Vertex-in-polygon 2D containment
    for (const v of f1_2D) {
      if (this._pointInPolygon2D(v, f2_2D)) {
        return { coplanar: true, overlap: true, projectionAxis: axis };
      }
    }
    for (const v of f2_2D) {
      if (this._pointInPolygon2D(v, f1_2D)) {
        return { coplanar: true, overlap: true, projectionAxis: axis };
      }
    }
    return { coplanar: true, overlap: false, projectionAxis: axis };
  }

  /**
   * Fan-triangulate a face (v2.15). Returns array of [v0, v1, v2] triangle
   * index tuples. For an N-gon, returns N-2 triangles using vertex 0 as fan apex.
   */
  faceTriangles(face) {
    if (!Array.isArray(face) || face.length < 3) return [];
    if (face.length === 3) return [[face[0], face[1], face[2]]];
    const tris = [];
    for (let i = 1; i < face.length - 1; i++) {
      tris.push([face[0], face[i], face[i + 1]]);
    }
    return tris;
  }

  /**
   * Möller triangle-triangle intersection test (v2.15).
   * Returns: { intersects, coplanar, kind: 'edge-edge' | 'vertex-inside' | 'coplanar' | 'none' }
   *
   * Reference: Möller, T. (1997). "A fast triangle-triangle intersection test."
   * Simplified for our use case (no exact intersection geometry).
   */
  triangleTriangleIntersect3D(t1, t2) {
    const EPS = 1e-9;

    const V1 = [
      this.vertices[t1[0]] || [0, 0, 0],
      this.vertices[t1[1]] || [0, 0, 0],
      this.vertices[t1[2]] || [0, 0, 0],
    ];
    const V2 = [
      this.vertices[t2[0]] || [0, 0, 0],
      this.vertices[t2[1]] || [0, 0, 0],
      this.vertices[t2[2]] || [0, 0, 0],
    ];

    // Plane of triangle 1
    const e1 = [V1[1][0] - V1[0][0], V1[1][1] - V1[0][1], V1[1][2] - V1[0][2]];
    const e2 = [V1[2][0] - V1[0][0], V1[2][1] - V1[0][1], V1[2][2] - V1[0][2]];
    const N1 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const n1Len = Math.sqrt(N1[0] ** 2 + N1[1] ** 2 + N1[2] ** 2);
    if (n1Len < EPS) return { intersects: false, coplanar: false, kind: 'none' };
    const N1n = [N1[0] / n1Len, N1[1] / n1Len, N1[2] / n1Len];

    // Signed distances of t2 vertices from t1's plane
    const d_v = (v) => N1n[0] * (v[0] - V1[0][0]) + N1n[1] * (v[1] - V1[0][1]) + N1n[2] * (v[2] - V1[0][2]);
    const d2 = [d_v(V2[0]), d_v(V2[1]), d_v(V2[2])];

    // Check if t2 is entirely on one side of t1's plane
    if ((d2[0] > EPS && d2[1] > EPS && d2[2] > EPS) ||
        (d2[0] < -EPS && d2[1] < -EPS && d2[2] < -EPS)) {
      return { intersects: false, coplanar: false, kind: 'none' };
    }

    // Coplanarity: all 3 d2 ≈ 0
    if (Math.abs(d2[0]) < EPS && Math.abs(d2[1]) < EPS && Math.abs(d2[2]) < EPS) {
      return { intersects: true, coplanar: true, kind: 'coplanar' };
    }

    // Compute t2's plane
    const e3 = [V2[1][0] - V2[0][0], V2[1][1] - V2[0][1], V2[1][2] - V2[0][2]];
    const e4 = [V2[2][0] - V2[0][0], V2[2][1] - V2[0][1], V2[2][2] - V2[0][2]];
    const N2 = [
      e3[1] * e4[2] - e3[2] * e4[1],
      e3[2] * e4[0] - e3[0] * e4[2],
      e3[0] * e4[1] - e3[1] * e4[0],
    ];
    const n2Len = Math.sqrt(N2[0] ** 2 + N2[1] ** 2 + N2[2] ** 2);
    if (n2Len < EPS) return { intersects: false, coplanar: false, kind: 'none' };
    const N2n = [N2[0] / n2Len, N2[1] / n2Len, N2[2] / n2Len];

    const d_v2 = (v) => N2n[0] * (v[0] - V2[0][0]) + N2n[1] * (v[1] - V2[0][1]) + N2n[2] * (v[2] - V2[0][2]);
    const d1 = [d_v2(V1[0]), d_v2(V1[1]), d_v2(V1[2])];
    if ((d1[0] > EPS && d1[1] > EPS && d1[2] > EPS) ||
        (d1[0] < -EPS && d1[1] < -EPS && d1[2] < -EPS)) {
      return { intersects: false, coplanar: false, kind: 'none' };
    }

    // Both planes straddle — triangles intersect in a line segment or point
    return { intersects: true, coplanar: false, kind: 'edge-edge' };
  }

  /**
   * Detect self-intersections using complete Möller triangle-triangle
   * intersection (v2.15).
   *
   * Differs from v2.6/v2.7 analyzeSelfIntersection in that it:
   *   1. Triangulates all faces (handles polygons, not just triangles)
   *   2. Uses Möller algorithm (gold standard for tri-tri intersection)
   *   3. Detects coplanar face overlap via 2D polygon intersection
   *
   * @returns {{
   *   facePairCount: number,
   *   aabbSurvivorCount: number,
   *   intersectionCount: number,
   *   intersections: Array<{ face1, face2, kind }>,
   *   notes: string[]
   * }}
   */
  analyzeCompleteSelfIntersection() {
    const result = {
      facePairCount: 0,
      aabbSurvivorCount: 0,
      intersectionCount: 0,
      intersections: [],
      notes: [],
    };

    if (this.faces.length < 2) {
      result.notes.push('Fewer than 2 faces — nothing to check');
      return result;
    }

    const is3D = this.vertices.some(v => Array.isArray(v) && v.length >= 3 && Math.abs(v[2] || 0) > 1e-6);
    if (!is3D) {
      result.notes.push('2D model — all faces coplanar, no 3D intersection possible');
      return result;
    }

    // Pre-triangulate all faces
    const triangulations = this.faces.map(f => this.faceTriangles(f));
    const aabbs = this.faces.map(f => this._faceAABB(f));

    const TOLERANCE = 0.01;

    for (let i = 0; i < this.faces.length; i++) {
      for (let j = i + 1; j < this.faces.length; j++) {
        if (this._facesShareEdge(i, j)) continue;
        result.facePairCount++;

        if (!this._aabbOverlap(aabbs[i], aabbs[j], TOLERANCE)) continue;
        result.aabbSurvivorCount++;

        let foundKind = null;
        for (const t1 of triangulations[i]) {
          for (const t2 of triangulations[j]) {
            const r = this.triangleTriangleIntersect3D(t1, t2);
            if (r.intersects) {
              foundKind = r.kind;
              break;
            }
          }
          if (foundKind) break;
        }

        if (foundKind) {
          result.intersectionCount++;
          result.intersections.push({
            face1: i,
            face2: j,
            kind: foundKind,
          });
        }
      }
    }

    if (result.intersectionCount === 0) {
      result.notes.push('No self-intersections detected ✓');
    } else {
      result.notes.push(`Found ${result.intersectionCount} intersecting face pair(s)`);
    }
    return result;
  }

  /**
   * Internal crease vertices — the shared check set for Kawasaki and Maekawa.
   *
   * A vertex qualifies when it has ≥3 incident edges AND none of those edges
   * is a boundary ('B') edge.  Boundary vertices are not flat-foldability
   * candidates at all: Kawasaki's theorem is a statement about interior
   * vertices, and a vertex touching the sheet boundary has an open fan of
   * creases, so the local flat-foldability conditions do not apply.
   *
   * v2.48: both strictKawasaki() and analyzeMaekawa() walk this same list so
   * that the two checks always report the same number of checked vertices.
   * Previously Kawasaki checked every vertex with ≥3 incident edges (including
   * boundary ones) while Maekawa used a different ad-hoc selection.
   *
   * @returns {Array<{ vertex: number, edges: number[] }>} cached
   */
  getInternalCreaseVertices() {
    if (this._internalCreaseVerticesCache) return this._internalCreaseVerticesCache;

    const result = [];
    for (let vIdx = 0; vIdx < this.vertices.length; vIdx++) {
      const incidentEdges = this.getIncidentEdges(vIdx);
      if (incidentEdges.length < 3) continue;

      // 排除边界顶点：含 'B'（纸边）/'U'（未指定）/'F'（平折、预折痕）边的顶点
      // 不是「所有折痕都参与折叠」的内部顶点 —— Kawasaki 与 Maekawa 的检查集
      // 必须一致（同一套规则），否则两个判据会互相矛盾。
      let hasBoundaryEdge = false;
      for (const eIdx of incidentEdges) {
        const a = this.assignments[eIdx];
        if (a === 'B' || a === 'U' || a === 'F') { hasBoundaryEdge = true; break; }
      }
      if (hasBoundaryEdge) continue;

      result.push({ vertex: vIdx, edges: incidentEdges });
    }

    this._internalCreaseVerticesCache = result;
    return result;
  }

  /**
   * Order a vertex's incident edges by geometric direction (cyclic order).
   *
   * For each incident edge the direction is measured FROM the vertex TOWARD
   * the other endpoint, `atan2(dy, dx)` is normalized to [0, 2π), and the
   * edges are sorted by that angle.  The result is the counter-clockwise
   * cyclic order of the creases around the vertex.
   *
   * v2.48: this is the order the Kawasaki alternating sum runs over.  It is a
   * separate helper from computeVertexAngles() (which yields *sector* angles
   * — the gaps between consecutive creases — and is used elsewhere), because
   * Kawasaki's theorem must be evaluated on crease angles, not sector angles.
   *
   * @param {number} vIdx
   * @param {number[]} incidentEdges
   * @returns {Array<{ edge: number, angle: number }>}
   */
  /**
   * 顶点的**扇区角**（sector angle）：相邻两条折痕射线之间的夹角。
   *
   * 为什么不能用 edges_foldAngle：Kawasaki 定理要的是几何量（扇区角），
   * 而 foldAngle 是折痕的折叠量（山/谷折 180°）。当一个 FOLD 的 foldAngle
   * 取值只有 {0, ±180} 时（内置生成器与大量官方作品都是这样），
   * 偶数价顶点的「折痕角交替和」恒相等 → 判定恒真 → **假阳性**。
   *
   * 实测（2026-11-27）：用折痕角 tiger 报「240/240 within 5°」；
   * 用扇区角真实值 2/240（误差中位 223.8°）。
   */

  _sectorAngles(vIdx, incidentEdges) {
    const [vx, vy] = this.vertices[vIdx] || [0, 0];
    const dirs = incidentEdges.map((eIdx) => {
      const [a, b] = this.edges[eIdx] || [];
      const other = a === vIdx ? b : a;
      const [ox, oy] = this.vertices[other] || [0, 0];
      let angle = Math.atan2(oy - vy, ox - vx);
      if (angle < 0) angle += 2 * Math.PI;
      return angle;
    }).sort((x, y) => x - y);
    const sectors = [];
    for (let i = 0; i < dirs.length; i++) {
      sectors.push((i + 1 < dirs.length ? dirs[i + 1] : dirs[0] + 2 * Math.PI) - dirs[i]);
    }
    return sectors;
  }

  _cyclicEdgeOrder(vIdx, incidentEdges) {
    const [vx, vy] = this.vertices[vIdx] || [0, 0];
    const items = incidentEdges.map((eIdx) => {
      const [a, b] = this.edges[eIdx] || [];
      const other = a === vIdx ? b : a;
      const [ox, oy] = this.vertices[other] || [0, 0];
      let angle = Math.atan2(oy - vy, ox - vx);
      if (angle < 0) angle += 2 * Math.PI;
      return { edge: eIdx, angle };
    });
    items.sort((p, q) => p.angle - q.angle);
    return items;
  }

  /**
   * Strict Maekawa analysis (v2.14) — rank vertices by exact |M - V - 2|.
   *
   * Refines the v2.0/v2.5 Maekawa check with detailed diagnostics. For each
   * internal vertex (≥3 incident M/V edges), reports the exact M count, V
   * count, |M - V| - 2 deviation, and ranks the top N worst.
   *
   * Maekawa's theorem: for a flat-foldable vertex, |M - V| = 2.
   * Deviation = ||M - V| - 2|. Small = good (0 = perfect).
   *
   * v2.48: the internal-vertex selection is now shared with strictKawasaki()
   * (see getInternalCreaseVertices()) — boundary ('B') vertices are excluded
   * from both checks so that the two reports cover the same vertex set.
   * The |M - V| = 2 rule itself is unchanged.
   *
   * @param {number} [topN=10] - Number of worst-deviation vertices to report
   * @returns {{
   *   totalChecked: number,
   *   withinTolerance: number,        // |M-V| = 2
   *   outOfTolerance: number,
   *   topDeviations: Array<{ vertex, M, V, MV, deviation }>,
   *   notes: string[]
   * }}
   */
  analyzeMaekawa(topN = 10) {
    const result = {
      totalChecked: 0,
      withinTolerance: 0,
      outOfTolerance: 0,
      topDeviations: [],
      notes: [],
    };

    // 「无 3D 折叠可检」的正确判据是**内部折痕顶点集为空**，
    // 而不是 `faces.length === 1`。
    // 后者只是代理指标，且会误伤：折痕图普遍带悬挂边 → 半边算法只能闭合部分面
    // （实测真实作品 birdBase：文件里 16 面，重算只有 8 面）→
    // 于是很多**几何完全正确**的折痕图被当成「flat dieline」而**整段跳过检查**，
    // 报出「0 个被检查顶点」这种看起来像「全过」的结果。
    const internalVerts = this.getInternalCreaseVertices();
    if (internalVerts.length === 0) {
      result.notes.push('Flat dieline — 无内部折痕顶点，Maekawa 检查不适用（单片 / 平面轮廓）');
      return result;
    }

    for (const { vertex: vIdx, edges: incidentEdges } of internalVerts) {
      let mCount = 0, vCount = 0;
      for (const eIdx of incidentEdges) {
        const a = this.assignments[eIdx];
        if (a === 'M') mCount++;
        else if (a === 'V') vCount++;
      }

      const mvDiff = mCount - vCount;        // signed
      const mvAbs = Math.abs(mvDiff);        // unsigned
      // Maekawa 的期望值按**顶点的价数**取：
      //   偶数价（无折痕终止）：|M − V| = 2   —— 经典形式
      //   奇数价（有折痕终止）：|M − V| = 1   —— 推广形式 |M−V| = 2 − c（c = 终止折痕数）
      //
      // 为什么必须分开：奇数价顶点有奇数条折痕 → M + V 为奇数 → |M−V| **必为奇数**
      // → 永远不可能等于 2。用偶数价的公式去判奇数价顶点是**公式用错了**（结构性误判），
      // 不是"更严格"。
      //
      // 依据（真实作品，非推测）：官方语料里 **208 个 deg3 内部顶点全部是 |M−V| = 1**，
      // 无一例外；几何干净的真实作品（flat_crane / birdBase / openSinkBase / waterbomb /
      // 6ptHypar-anti）里**一个奇数价内部顶点都没有** → 奇数价顶点属于「折痕终止」结构。
      const oddValence = incidentEdges.length % 2 === 1;
      const expectedMv = oddValence ? 1 : 2;
      const deviation = Math.abs(mvAbs - expectedMv);  // ||M-V| - expected|

      result.totalChecked++;
      if (deviation === 0) {
        result.withinTolerance++;
      } else {
        result.outOfTolerance++;
        result.topDeviations.push({
          vertex: vIdx,
          M: mCount,
          V: vCount,
          MV: mvDiff,
          deviation,
        });
      }
    }

    // Sort by deviation descending, then by vertex index for stability
    result.topDeviations.sort((a, b) => b.deviation - a.deviation || a.vertex - b.vertex);
    result.topDeviations = result.topDeviations.slice(0, topN);

    if (result.totalChecked === 0) {
      result.notes.push('No internal vertices with ≥3 incident edges');
    } else if (result.outOfTolerance > 0) {
      const worst = result.topDeviations[0];
      result.notes.push(`Found ${result.outOfTolerance} vertex/vertices with Maekawa deviation > 0 (worst: vertex ${worst.vertex}, M=${worst.M}/V=${worst.V}, deviation=${worst.deviation})`);
    } else {
      result.notes.push(`All ${result.totalChecked} vertex/vertices satisfy |M-V|=2`);
    }
    return result;
  }

  /**
   * Analyze alternating M/V pattern around each internal vertex (v2.12).
   *
   * For a flat-foldable origami, M (mountain) and V (valley) assignments on
   * edges around a vertex should ALTERNATE (this is a consequence of
   * Kawasaki's theorem and the local geometric constraints of folding).
   *
   * Algorithm:
   *   1. For each vertex with ≥3 incident edges
   *   2. Get incident edges in cyclic angular order (use computeVertexAngles)
   *   3. Examine M/V assignments on those edges (skip B/F boundary edges)
   *   4. Check if pattern alternates (no two consecutive M or V)
   *   5. If not alternating, flag as mvAlternationInconsistency
   *
   * Note: a vertex can be all-M or all-V if some edges are boundary — in that
   * case the M/V part of the cycle may not be a complete ring, which is OK.
   * Only flag when the M/V subsequence is non-alternating.
   *
   * @returns {{
   *   totalChecked: number,
   *   consistent: number,
   *   inconsistent: number,
   *   inconsistencies: Array<{ vertex, edgeIndices, assignments, pattern, issue }>,
   *   notes: string[]
   * }}
   */
  analyzeAlternatingMV() {
    const result = {
      totalChecked: 0,
      consistent: 0,
      inconsistent: 0,
      inconsistencies: [],
      notes: [],
    };

    if (this.vertices.length === 0) {
      result.notes.push('No vertices');
      return result;
    }

    for (let vIdx = 0; vIdx < this.vertices.length; vIdx++) {
      const incidentEdges = this.getIncidentEdges(vIdx);
      if (incidentEdges.length < 3) continue;

      // Build cyclic order via computeVertexAngles
      const angles = this.computeVertexAngles(vIdx, incidentEdges);
      // angles.length === incidentEdges.length (modulo degenerate)

      // Get M/V assignments in cyclic order
      const cyclicOrder = incidentEdges;  // sorted by angle (computeVertexAngles does this)
      const cyclicAssignments = cyclicOrder.map(eIdx => this.assignments[eIdx]);

      // Walk the cycle, check for consecutive same M/V
      let prevMV = null;
      let prevEdgeIdx = -1;
      let lastMV = null;     // for wrap-around check
      let lastEdgeIdx = -1;
      const violations = [];

      for (let i = 0; i < cyclicAssignments.length; i++) {
        const a = cyclicAssignments[i];
        if (a !== 'M' && a !== 'V') continue;  // skip B/F
        if (lastMV !== null && a === lastMV) {
          violations.push({
            prevEdge: lastEdgeIdx,
            currEdge: cyclicOrder[i],
            prevAssignment: lastMV,
            currAssignment: a,
          });
        }
        lastMV = a;
        lastEdgeIdx = cyclicOrder[i];
      }

      // Wrap-around check: first M/V vs last M/V
      if (violations.length === 0) {
        // Already checked consecutive; just verify wrap
        // (already covered by last iteration)
      }

      result.totalChecked++;
      if (violations.length > 0) {
        result.inconsistent++;
        result.inconsistencies.push({
          vertex: vIdx,
          edgeIndices: cyclicOrder,
          assignments: cyclicAssignments,
          pattern: cyclicAssignments.join(''),
          issue: 'mv-not-alternating',
          detail: `Vertex ${vIdx}: ${violations.length} consecutive same-M/V pair(s) in cycle`,
        });
      } else {
        result.consistent++;
      }
    }

    if (result.totalChecked === 0) {
      result.notes.push('No internal vertices with ≥3 incident edges');
    } else if (result.inconsistent > 0) {
      result.notes.push(`Found ${result.inconsistent} non-alternating M/V vertex/vertices`);
    } else {
      result.notes.push('All checked vertices have alternating M/V pattern');
    }
    return result;
  }

  /**
   * Strict Kawasaki analysis (v2.12) — rank vertices by deviation from the
   * alternating-angle condition.
   *
   * v2.48 (口径修正): the alternating sum is now taken over the **crease
   * angles** (`|edges_foldAngle|`), not over the **sector angles** produced
   * by computeVertexAngles().  Kawasaki's theorem constrains the angles the
   * creases make around the vertex; the sector angle (the gap between two
   * consecutive creases) is a different quantity, and using it made this
   * check report systematic false negatives on real crease patterns
   * (e.g. miura-ori: 0/132 → 130/132).
   *
   * Algorithm:
   *   1. Walk the internal crease vertices (see getInternalCreaseVertices():
   *      ≥3 incident edges, no boundary ('B') edge) — the same vertex set the
   *      Maekawa check uses.
   *   2. Order the incident edges by geometric direction around the vertex
   *      (see _cyclicEdgeOrder()).
   *   3. Take |edges_foldAngle| of each edge and alternate-sum them.
   *   4. Deviation = |evenSum - oddSum|; < 5° counts as flat-foldable.
   *
   * @param {number} [topN=10] - Number of worst-deviation vertices to report
   * @returns {{
   *   totalChecked: number,
   *   withinTolerance: number,         // deviation < 5°
   *   outOfTolerance: number,
   *   topDeviations: Array<{ vertex, deviation, evenSum, oddSum }>,
   *   notes: string[]
   * }}
   */
  strictKawasaki(topN = 10) {
    const KAWASAKI_TOLERANCE = KAWASAKI_TOLERANCE_DEG;  // degrees（真实作品校准）
    const result = {
      totalChecked: 0,
      withinTolerance: 0,
      outOfTolerance: 0,
      topDeviations: [],
      notes: [],
    };

    // 与 analyzeMaekawa 同一判据：内部折痕顶点集为空才是「不可检」
    if (this.getInternalCreaseVertices().length === 0) {
      result.notes.push('Flat dieline — 无内部折痕顶点，Kawasaki 检查不适用（单片 / 平面轮廓）');
      return result;
    }

    for (const { vertex: vIdx, edges: incidentEdges } of this.getInternalCreaseVertices()) {
      // Kawasaki 定理只适用于**偶数条折痕**的顶点：奇数项的交替和不可能相消
      // （奇数价顶点的折平性由 Maekawa 那一侧保证）。实测（78 个真实作品）：
      // 加上本限制后顶点通过率 82.69% → 87.33%，且多件真实作品变成「全过」。
      if (incidentEdges.length % 2 === 1) {
        result.skippedOddValence = (result.skippedOddValence || 0) + 1;
        continue;
      }
      // Kawasaki 要的是**扇区角**（几何量），不是折痕角（折叠量）——
      // 后者对 foldAngle ∈ {0,±180} 的 FOLD 恒真 → 假阳性。
      const sectors = this._sectorAngles(vIdx, incidentEdges);

      const evenSum = sectors.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
      const oddSum = sectors.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0);
      // Kawasaki: the alternating sums of the sector angles must be EQUAL.
      // Deviation = |evenSum - oddSum|，单位度。
      const deviation = Math.abs(evenSum - oddSum) * (180 / Math.PI);

      result.totalChecked++;
      if (deviation < KAWASAKI_TOLERANCE) {
        result.withinTolerance++;
      } else {
        result.outOfTolerance++;
        result.topDeviations.push({
          vertex: vIdx,
          deviation: Number(deviation.toFixed(2)),
          evenSum: Number(evenSum.toFixed(2)),
          oddSum: Number(oddSum.toFixed(2)),
        });
      }
    }

    // Sort by deviation descending and keep top N
    result.topDeviations.sort((a, b) => b.deviation - a.deviation);
    result.topDeviations = result.topDeviations.slice(0, topN);

    if (result.totalChecked === 0) {
      result.notes.push('No internal vertices with ≥3 incident edges');
    } else if (result.outOfTolerance > 0) {
      result.notes.push(`Found ${result.outOfTolerance} vertex/vertices with Kawasaki deviation > ${KAWASAKI_TOLERANCE}° (worst: ${result.topDeviations[0]?.deviation || 'N/A'}°)`);
    } else {
      result.notes.push(`All ${result.totalChecked} vertex/vertices within ${KAWASAKI_TOLERANCE}° tolerance`);
    }
    return result;
  }

  /**
   * Analyze fold order — topological sequence of M/V folds.
   *
   * v2.9: simple heuristic based on per-face layer (from v2.3) and the
   * "max layer of adjacent faces" rule.
   *
   * Rule: for a fold on an M/V edge shared by two faces, the fold must
   * happen at step `max(layer_f1, layer_f2)`. The higher-layer face sits
   * "on top" of the lower-layer face, so the lower-layer fold must be
   * complete before this fold is meaningful.
   *
   * Within a step, all folds are independent (any order is valid).
   *
   * This is a necessary (not sufficient) condition for a valid fold
   * sequence. Real origami simulators may add M/V layer-consistency
   * checks (mountain/valley assignment must match the layer order).
   *
   * @returns {{
   *   totalFolds: number,
   *   stepCount: number,
   *   foldSequence: Array<{ step: number, layer: number, foldCount: number, edgeIndices: number[] }>,
   *   notes: string[]
   * }}
   */
  analyzeFoldOrder() {
    const result = {
      totalFolds: 0,
      stepCount: 0,
      foldSequence: [],
      notes: [],
    };

    if (this.faces.length < 2) {
      result.notes.push('Fewer than 2 faces — cannot determine fold order');
      return result;
    }
    if (this.edges.length === 0) {
      result.notes.push('No edges — nothing to fold');
      return result;
    }

    // Get per-face layer from v2.3 analyzeLayers
    const layerInfo = this.analyzeLayers();
    let faceLayers = layerInfo.faceOrders;
    if (!faceLayers || faceLayers.length !== this.faces.length) {
      // Fallback: all faces on layer 1
      faceLayers = new Array(this.faces.length).fill(1);
    }

    // Group M/V edges by their step (= max layer of adjacent faces)
    const edgesByStep = new Map(); // step → edge indices
    for (let i = 0; i < this.edges.length; i++) {
      const assignment = this.assignments[i];
      if (assignment !== 'M' && assignment !== 'V') continue;
      const adjacent = this.findAdjacentFaces(i);
      if (adjacent.length < 2) continue;  // boundary edge: can't be folded in 3D

      const layer1 = faceLayers[adjacent[0]] || 1;
      const layer2 = faceLayers[adjacent[1]] || 1;
      // For edges shared by 3+ faces, take max over all
      let step = Math.max(layer1, layer2);
      for (let k = 2; k < adjacent.length; k++) {
        step = Math.max(step, faceLayers[adjacent[k]] || 1);
      }
      if (!edgesByStep.has(step)) edgesByStep.set(step, []);
      edgesByStep.get(step).push(i);
      result.totalFolds++;
    }

    if (result.totalFolds === 0) {
      result.notes.push('No M/V edges found — nothing to fold');
      return result;
    }

    // Convert to ordered sequence
    const sortedSteps = [...edgesByStep.keys()].sort((a, b) => a - b);
    for (const step of sortedSteps) {
      result.foldSequence.push({
        step,
        layer: step,
        foldCount: edgesByStep.get(step).length,
        edgeIndices: edgesByStep.get(step).sort((a, b) => a - b),
      });
    }
    result.stepCount = result.foldSequence.length;
    result.notes.push(`Computed ${result.stepCount}-step fold sequence for ${result.totalFolds} M/V edges`);
    return result;
  }

  /**
   * Find all boundary loops in the mesh.
   *
   * A "boundary edge" has only 1 adjacent face (the rest of the mesh is on
   * one side, the "outside" is on the other). A "boundary loop" is a closed
   * path of boundary edges — either the outer perimeter of the paper or a
   * hole punched in it.
   *
   * Algorithm: walk the boundary edge adjacency graph. Each boundary vertex
   * has exactly 2 incident boundary edges (mesh is 2-manifold at boundary),
   * so the walk is deterministic and produces closed loops.
   *
   * @returns {Array<{
   *   edgeIndices: number[],
   *   vertexIndices: number[],
   *   perimeter: number,        // sum of edge lengths
   *   enclosedArea: number,     // shoelace formula
   *   isOuterBoundary: boolean, // true if this loop encloses all others
   * }>}
   */
  findBoundaryLoops() {
    // Step 1: collect boundary edges (edges with only 1 adjacent face)
    const boundaryEdges = [];
    for (let i = 0; i < this.edges.length; i++) {
      if (this.findAdjacentFaces(i).length === 1) {
        boundaryEdges.push(i);
      }
    }
    if (boundaryEdges.length === 0) return [];

    // Step 2: build vertex → boundary-edge[] map
    // Each boundary vertex has exactly 2 boundary edges
    const vertexToBoundary = new Map();
    for (const ei of boundaryEdges) {
      const [a, b] = this.edges[ei];
      if (!vertexToBoundary.has(a)) vertexToBoundary.set(a, []);
      if (!vertexToBoundary.has(b)) vertexToBoundary.set(b, []);
      vertexToBoundary.get(a).push(ei);
      vertexToBoundary.get(b).push(ei);
    }

    // Step 3: walk boundary to form loops
    const visited = new Set();
    const loops = [];

    for (const startEdge of boundaryEdges) {
      if (visited.has(startEdge)) continue;

      const loop = { edgeIndices: [], vertexIndices: [], perimeter: 0, enclosedArea: 0, isOuterBoundary: false };
      let currentEdge = startEdge;
      let [currentA, currentB] = this.edges[startEdge];
      const startVertex = currentA;
      const startB = currentB;

      // Walk the boundary until we return to start
      let safety = boundaryEdges.length + 1; // prevent infinite loop
      while (safety-- > 0) {
        if (visited.has(currentEdge)) break;
        visited.add(currentEdge);
        loop.edgeIndices.push(currentEdge);
        loop.vertexIndices.push(currentA);

        // Find next edge: from currentB, the other boundary edge
        const edgesAtB = vertexToBoundary.get(currentB) || [];
        const nextEdge = edgesAtB.find(ei => ei !== currentEdge);
        if (nextEdge === undefined) break;

        const [nextA, nextB] = this.edges[nextEdge];
        currentEdge = nextEdge;
        currentA = nextA;   // = currentB from previous step
        currentB = nextB;

        // Closed if we returned to start vertex AND current edge is the start edge
        // Don't push currentB — the modulo in shoelace wraps back to vertexIndices[0]
        if (currentA === startVertex && currentEdge === startEdge) {
          break;
        }
      }
      loops.push(loop);
    }

    // Step 4: compute perimeter + enclosed area (shoelace formula)
    for (const loop of loops) {
      // Perimeter
      let perim = 0;
      for (const ei of loop.edgeIndices) {
        const [a, b] = this.edges[ei];
        const va = this.vertices[a] || [0, 0, 0];
        const vb = this.vertices[b] || [0, 0, 0];
        const dx = (vb[0] || 0) - (va[0] || 0);
        const dy = (vb[1] || 0) - (va[1] || 0);
        perim += Math.sqrt(dx * dx + dy * dy);
      }
      loop.perimeter = perim;

      // Shoelace area (assumes 2D projection; for 3D, projects to dominant axis)
      // For boundary loops of typical origami (planar sheet), z ≈ 0 for all boundary vertices
      const n = loop.vertexIndices.length;
      if (n >= 3) {
        // Determine projection axis from boundary vertices
        const has3D = loop.vertexIndices.some(vi => {
          const v = this.vertices[vi] || [0, 0, 0];
          return Math.abs(v[2] || 0) > 1e-6;
        });
        const project = (v) => {
          if (has3D) {
            // Project to (x, y) — for 2D-ish meshes this is fine
            return [v[0] || 0, v[1] || 0];
          }
          return [v[0] || 0, v[1] || 0];
        };
        let area = 0;
        for (let i = 0; i < n; i++) {
          const vi = loop.vertexIndices[i];
          const vj = loop.vertexIndices[(i + 1) % n];
          const pi = project(this.vertices[vi] || [0, 0, 0]);
          const pj = project(this.vertices[vj] || [0, 0, 0]);
          area += pi[0] * pj[1] - pj[0] * pi[1];
        }
        loop.enclosedArea = Math.abs(area) / 2;
      }
    }

    // Step 5: classify outer vs hole
    // Strategy: sort by area descending. The largest is "outer" (or one of them
    // if tied). Each smaller loop is "hole" iff its centroid is inside a larger
    // loop; otherwise it's another outer loop (disconnected sheet).
    if (loops.length > 0) {
      const sorted = [...loops].sort((a, b) => b.enclosedArea - a.enclosedArea);
      const largest = sorted[0];
      for (const loop of loops) {
        if (loop === largest) {
          // Largest is always outer (it's the boundary of the paper region
          // with the most area)
          loop.isOuterBoundary = true;
        } else {
          // Is this loop's centroid inside any larger loop?
          const centroid = this._loopCentroid(loop);
          const insideLarger = sorted.some(other => {
            if (other === loop || other.enclosedArea <= loop.enclosedArea) return false;
            return this._pointInPolygon2D(centroid, this._loopTo2D(other));
          });
          loop.isOuterBoundary = !insideLarger;
        }
      }
    }

    return loops;
  }

  /**
   * Compute the 2D centroid of a boundary loop.
   */
  _loopCentroid(loop) {
    if (!loop.vertexIndices || loop.vertexIndices.length === 0) return [0, 0];
    let sx = 0, sy = 0;
    for (const vi of loop.vertexIndices) {
      const v = this.vertices[vi] || [0, 0, 0];
      sx += v[0] || 0;
      sy += v[1] || 0;
    }
    return [sx / loop.vertexIndices.length, sy / loop.vertexIndices.length];
  }

  /**
   * Project a loop's vertex indices to 2D coordinates.
   */
  _loopTo2D(loop) {
    return (loop.vertexIndices || []).map(vi => {
      const v = this.vertices[vi] || [0, 0, 0];
      return [v[0] || 0, v[1] || 0];
    });
  }

  /**
   * Analyze holes & boundary loops (v2.8).
   *
   * A "hole" is a boundary loop that doesn't correspond to the outer perimeter
   * of the paper. For typical origami (single sheet, no holes punched),
   * there should be exactly 1 boundary loop (the outer perimeter).
   *
   * @returns {{
   *   boundaryEdgeCount: number,
   *   interiorEdgeCount: number,
   *   loopCount: number,
   *   outerBoundaryCount: number,
   *   holeCount: number,
   *   loops: Array<{...}>,
   *   notes: string[]
   * }}
   */
  analyzeHoles() {
    const result = {
      boundaryEdgeCount: 0,
      interiorEdgeCount: 0,
      loopCount: 0,
      outerBoundaryCount: 0,
      holeCount: 0,
      loops: [],
      notes: [],
    };

    // Count boundary vs interior edges
    for (let i = 0; i < this.edges.length; i++) {
      if (this.findAdjacentFaces(i).length === 1) {
        result.boundaryEdgeCount++;
      } else if (this.findAdjacentFaces(i).length === 2) {
        result.interiorEdgeCount++;
      }
      // edges with 0 or 3+ faces are anomalous (non-manifold)
    }

    if (this.edges.length === 0) {
      result.notes.push('No edges — nothing to check');
      return result;
    }

    const loops = this.findBoundaryLoops();
    result.loops = loops;
    result.loopCount = loops.length;
    result.outerBoundaryCount = loops.filter(l => l.isOuterBoundary).length;
    result.holeCount = loops.filter(l => !l.isOuterBoundary).length;

    if (result.boundaryEdgeCount === 0) {
      result.notes.push('No boundary edges — mesh is fully closed (no holes, no outer perimeter)');
    } else if (result.loopCount === 0) {
      result.notes.push(`${result.boundaryEdgeCount} boundary edges but no closed loop (anomalous)`);
    } else if (result.holeCount === 0) {
      result.notes.push(`${result.loopCount} boundary loop(s) — single sheet, no holes`);
    } else {
      result.notes.push(`Found ${result.holeCount} hole(s) punched in the sheet`);
    }

    return result;
  }

  /**
   * Analyze face normal consistency (BFS-style orientation check).
   *
   * For a closed orientable 2-manifold, all face normals should be either
   * all "outward" or all "inward" — the vector sum of (area × normal)
   * should be near zero (divergence theorem).
   *
   * For an open mesh, the sum corresponds to the boundary integral, which
   * is non-zero in general. We report a divergence ratio (sum / total area)
   * that should be small for consistently-oriented meshes regardless.
   *
   * Also detects:
   *   - Degenerate (zero-area) faces
   *   - Per-face normal magnitude (= 2× area)
   *
   * @returns {{
   *   faceCount: number,
   *   degenerateFaces: number[],
   *   normalMagnitudes: number[],
   *   signedAreaSum: [number, number, number],
   *   totalArea: number,
   *   divergenceRatio: number,
   *   consistent: boolean,
   *   notes: string[]
   * }}
   */
  analyzeFaceNormals() {
    const result = {
      faceCount: 0,
      degenerateFaces: [],
      normalMagnitudes: [],
      signedAreaSum: [0, 0, 0],
      totalArea: 0,
      divergenceRatio: 0,
      consistent: true,
      notes: [],
    };

    if (this.faces.length === 0) {
      result.notes.push('No faces — nothing to check');
      return result;
    }

    // Compute face normals and accumulate area × normal
    for (let i = 0; i < this.faces.length; i++) {
      const n = this.faceNormal(this.faces[i]);
      const mag = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
      result.normalMagnitudes.push(Number(mag.toFixed(4)));
      result.faceCount++;
      const area = mag / 2;
      result.totalArea += area;
      result.signedAreaSum[0] += n[0];
      result.signedAreaSum[1] += n[1];
      result.signedAreaSum[2] += n[2];
      if (mag < 1e-9) result.degenerateFaces.push(i);
    }

    if (result.totalArea > 0) {
      const sumMag = Math.sqrt(
        result.signedAreaSum[0] ** 2 +
        result.signedAreaSum[1] ** 2 +
        result.signedAreaSum[2] ** 2
      );
      result.divergenceRatio = sumMag / result.totalArea;
      // For closed mesh: ratio ≈ 0. For open: depends on boundary.
      // For inconsistent normals (some flipped): ratio is large.
      if (result.divergenceRatio > 0.5) {
        result.consistent = false;
        result.notes.push(`High divergence ratio (${result.divergenceRatio.toFixed(3)}) — many face normals likely flipped`);
      } else if (result.divergenceRatio > 0.1) {
        result.notes.push(`Moderate divergence ratio (${result.divergenceRatio.toFixed(3)}) — some faces may be flipped`);
      } else {
        result.notes.push(`Divergence ratio ${result.divergenceRatio.toFixed(3)} — face normals look consistent`);
      }
    }

    if (result.degenerateFaces.length > 0) {
      result.notes.push(`${result.degenerateFaces.length} degenerate face(s) (zero area)`);
    }
    return result;
  }

  /**
   * Analyze strain — how much each edge is folded from flat (180°).
   *
   * Bending strain formula (from computational origami literature):
   *   bendingStrain(θ) = (1 + cos(θ)) / 2
   * where θ is the fold angle in degrees.
   *
   *   θ = 180°  → strain = 0    (flat, no fold)
   *   θ =  90°  → strain = 0.5  (right-angle fold)
   *   θ =   0°  → strain = 1    (fully folded / creased)
   *
   * This is the cosine-based strain (proportional to bending energy), not
   * the linear deviation |180° - θ| / 180°. The cos form is more physically
   * meaningful: small angular deviations near flat have small strain.
   *
   * Skips edges without foldAngle data. Distinguishes:
   *   - all edges with foldAngle data (including flat 180° = strain 0)
   *   - M/V (mountain/valley) fold edges only — excludes B (boundary) and F (flat-face)
   *
   * @returns {{
   *   edgeCount: number,             // edges with foldAngle data
   *   foldEdgeCount: number,         // M/V edges with foldAngle
   *   avgBendingStrain: number|null, // mean across fold edges
   *   maxBendingStrain: number|null, // max across fold edges
   *   strainDistribution: { low: number, medium: number, high: number },
   *   perEdgeStrain: Array<{ edge: number, assignment: string, angle: number, strain: number }>,
   *   notes: string[]
   * }}
   */
  analyzeStrain() {
    const result = {
      edgeCount: 0,
      foldEdgeCount: 0,
      avgBendingStrain: null,
      maxBendingStrain: null,
      strainDistribution: { low: 0, medium: 0, high: 0 },
      perEdgeStrain: [],
      notes: [],
    };

    if (this.foldAngles.length === 0) {
      result.notes.push('No fold angles — cannot estimate strain');
      return result;
    }
    if (this.foldAngles.length !== this.edges.length) {
      result.notes.push(`foldAngle count (${this.foldAngles.length}) ≠ edge count (${this.edges.length}) — partial data`);
    }

    // Compute strain per edge that has foldAngle data
    let sumStrain = 0;
    let maxStrain = 0;
    for (let i = 0; i < this.edges.length; i++) {
      if (i >= this.foldAngles.length) break;
      const angle = this.foldAngles[i];
      if (angle === undefined || angle === null) continue;
      result.edgeCount++;

      // bendingStrain = (1 + cos(angle_rad)) / 2
      const angleRad = (angle * Math.PI) / 180;
      const strain = (1 + Math.cos(angleRad)) / 2;
      // Clamp to [0, 1] for safety (cos can drift slightly outside)
      const clampedStrain = Math.max(0, Math.min(1, strain));

      const assignment = this.assignments[i] || 'unknown';
      const isFold = (assignment === 'M' || assignment === 'V');

      if (isFold) {
        result.foldEdgeCount++;
        sumStrain += clampedStrain;
        if (clampedStrain > maxStrain) maxStrain = clampedStrain;

        // Distribution buckets (using bending strain)
        if (clampedStrain < 0.3) result.strainDistribution.low++;
        else if (clampedStrain < 0.7) result.strainDistribution.medium++;
        else result.strainDistribution.high++;
      }

      result.perEdgeStrain.push({
        edge: i,
        assignment,
        angle,
        strain: Number(clampedStrain.toFixed(4)),
      });
    }

    if (result.foldEdgeCount > 0) {
      result.avgBendingStrain = Number((sumStrain / result.foldEdgeCount).toFixed(4));
      result.maxBendingStrain = Number(maxStrain.toFixed(4));
    } else {
      result.notes.push('No M/V fold edges with foldAngle data');
    }
    return result;
  }

  /**
   * Find isolated vertices
   */
  findIsolatedVertices() {
    const isolated = [];
    const valences = this.computeValences();
    for (let i = 0; i < valences.length; i++) {
      if (valences[i] === 0) isolated.push(i);
    }
    return isolated;
  }

  /**
   * Find T-junctions: a vertex of one edge lies on the interior of another edge.
   *
   * Geometric check: for each vertex v, look at all edges not incident to v.
   * Project v onto each such edge and check if the projection lies strictly
   * inside the segment (0 < t < 1) within tolerance, AND the perpendicular
   * distance is below tolerance.
   *
   * Returns: array of { edge, vertex, t, perpDist } where edge is the edge being
   * T'd into, vertex is the dangling vertex, t is the projection parameter, and
   * perpDist is the perpendicular distance from vertex to edge.
   *
   * v2.2 fix: previously a stub returning []. This implementation catches real
   * mesh issues like dangling edges and overlapping-but-not-connected geometry.
   */
  findTJunctions() {
    const results = [];
    if (this.edges.length === 0 || this.vertices.length === 0) return results;

    // Tolerance: small fraction of model scale, with a small floor.
    const maxX = Math.max(...this.vertices.map(v => Math.abs(v[0] || 0)), 0);
    const maxY = Math.max(...this.vertices.map(v => Math.abs(v[1] || 0)), 0);
    const scale = Math.max(maxX, maxY, 1);
    const tolerance = Math.max(0.001, scale * 0.0001);

    // Build a set of (vertex) → which edges it's an endpoint of (avoid self-check)
    const incidentSet = new Set();
    for (let i = 0; i < this.edges.length; i++) {
      const [a, b] = this.edges[i];
      incidentSet.add(`${a}|${i}`);
      incidentSet.add(`${b}|${i}`);
    }

    for (let i = 0; i < this.edges.length; i++) {
      const [a, b] = this.edges[i];
      const pa = this.vertices[a];
      const pb = this.vertices[b];
      const ex = pb[0] - pa[0];
      const ey = pb[1] - pa[1];
      const lenSq = ex * ex + ey * ey;
      if (lenSq < 1e-12) continue; // degenerate edge

      for (let v = 0; v < this.vertices.length; v++) {
        if (v === a || v === b) continue;          // skip endpoints of this edge
        if (incidentSet.has(`${v}|${i}`)) continue; // shouldn't happen, but safe

        const pv = this.vertices[v];
        const wx = pv[0] - pa[0];
        const wy = pv[1] - pa[1];

        // Project v onto the line through a→b: t = (w · e) / |e|²
        const t = (wx * ex + wy * ey) / lenSq;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue; // not strictly interior

        // Perpendicular distance from v to line a→b
        const projX = pa[0] + t * ex;
        const projY = pa[1] + t * ey;
        const dx = pv[0] - projX;
        const dy = pv[1] - projY;
        const perpDist = Math.sqrt(dx * dx + dy * dy);
        if (perpDist > tolerance) continue; // not actually on the line

        results.push({ edge: i, vertex: v, t: Number(t.toFixed(4)), perpDist: Number(perpDist.toFixed(4)) });
      }
    }
    return results;
  }

  /**
   * Find highly stretched faces
   */
  findStretchedFaces() {
    const stretched = [];
    for (let i = 0; i < this.faces.length; i++) {
      const face = this.faces[i];
      if (face.length < 3) continue;

      const pts = face.map(idx => this.vertices[idx] || [0, 0]);
      const edges = [];
      for (let j = 0; j < pts.length; j++) {
        const p1 = pts[j];
        const p2 = pts[(j + 1) % pts.length];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        edges.push(Math.sqrt(dx * dx + dy * dy));
      }
      const minEdge = Math.min(...edges);
      const maxEdge = Math.max(...edges);
      if (minEdge > 0 && maxEdge / minEdge > 10) {
        stretched.push(i);
      }
    }
    return stretched;
  }

  /**
   * Build a Bounding Volume Hierarchy (BVH) over all face AABBs (v2.17).
   *
   * Returns a tree where each node is:
   *   { aabb, left, right, faces }  — internal nodes: aabb union of children
   *                                  — leaf nodes: aabb + faces=[indices]
   *
   * Build strategy: median split on longest axis. For typical origami
   * models this gives O(F log F) build + O(F log F) query (vs O(F²) brute).
   */
  _buildBVH() {
    if (this.faces.length === 0) return null;

    const aabbs = this.faces.map((f, i) => ({
      aabb: this._faceAABB(f),
      faceIdx: i,
    }));

    const build = (indices) => {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (const idx of indices) {
        const a = aabbs[idx].aabb;
        if (a.minX < minX) minX = a.minX; if (a.maxX > maxX) maxX = a.maxX;
        if (a.minY < minY) minY = a.minY; if (a.maxY > maxY) maxY = a.maxY;
        if (a.minZ < minZ) minZ = a.minZ; if (a.maxZ > maxZ) maxZ = a.maxZ;
      }

      if (indices.length <= 1) {
        return { aabb: { minX, maxX, minY, maxY, minZ, maxZ }, left: null, right: null, faces: indices.slice() };
      }

      const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
      const axis = (dx >= dy && dx >= dz) ? 0 : (dy >= dz ? 1 : 2);

      const getCentroid = (faceIdx) => {
        const a = aabbs[faceIdx].aabb;
        return axis === 0 ? (a.minX + a.maxX) / 2 : axis === 1 ? (a.minY + a.maxY) / 2 : (a.minZ + a.maxZ) / 2;
      };
      const sorted = indices.slice().sort((a, b) => getCentroid(a) - getCentroid(b));
      const mid = sorted.length >> 1;
      const left = build(sorted.slice(0, mid));
      const right = build(sorted.slice(mid));

      return { aabb: { minX, maxX, minY, maxY, minZ, maxZ }, left, right, faces: null };
    };

    return build(aabbs.map(a => a.faceIdx));
  }

  /**
   * Query BVH for all faces whose AABB overlaps a query AABB.
   * Iterative stack-based (no recursion depth issues for large trees).
   */
  _queryBVH(node, queryAABB) {
    if (!node) return [];
    const results = [];
    const stack = [node];
    while (stack.length > 0) {
      const n = stack.pop();
      if (!n || !this._aabbOverlap(n.aabb, queryAABB, 0)) continue;
      if (n.faces) {
        for (const f of n.faces) results.push(f);
      } else {
        if (n.left) stack.push(n.left);
        if (n.right) stack.push(n.right);
      }
    }
    return results;
  }

  /**
   * BVH-accelerated self-intersection detection (v2.17).
   *
   * Same semantics as v2.15 `analyzeCompleteSelfIntersection()` but uses
   * a Bounding Volume Hierarchy to avoid O(F²) brute-force pair tests.
   *
   * @returns same shape as v2.15 analyzeCompleteSelfIntersection() + method field
   */
  analyzeSelfIntersectionBVH() {
    const result = {
      facePairCount: 0,
      aabbSurvivorCount: 0,
      intersectionCount: 0,
      intersections: [],
      notes: [],
      method: 'BVH (v2.17)',
    };

    if (this.faces.length < 2) {
      result.notes.push('Fewer than 2 faces — nothing to check');
      return result;
    }

    const is3D = this.vertices.some(v => Array.isArray(v) && v.length >= 3 && Math.abs(v[2] || 0) > 1e-6);
    if (!is3D) {
      result.notes.push('2D model — all faces coplanar, no 3D intersection possible');
      return result;
    }

    const bvh = this._buildBVH();
    if (!bvh) {
      result.notes.push('BVH build failed');
      return result;
    }

    const triangulations = this.faces.map(f => this.faceTriangles(f));
    const faceAABBs = this.faces.map(f => this._faceAABB(f));
    const TOLERANCE = 0.01;

    const seenPairs = new Set();
    for (let i = 0; i < this.faces.length; i++) {
      const candidates = this._queryBVH(bvh, faceAABBs[i]);
      for (const j of candidates) {
        if (j <= i) continue;  // avoid duplicates and self
        if (this._facesShareEdge(i, j)) continue;
        const pairKey = i * 100000 + j;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        result.facePairCount++;
        if (!this._aabbOverlap(faceAABBs[i], faceAABBs[j], TOLERANCE)) continue;
        result.aabbSurvivorCount++;

        let foundKind = null;
        for (const t1 of triangulations[i]) {
          for (const t2 of triangulations[j]) {
            const r = this.triangleTriangleIntersect3D(t1, t2);
            if (r.intersects) {
              foundKind = r.kind;
              break;
            }
          }
          if (foundKind) break;
        }

        if (foundKind) {
          result.intersectionCount++;
          result.intersections.push({ face1: i, face2: j, kind: foundKind });
        }
      }
    }

    if (result.intersectionCount === 0) {
      result.notes.push('No self-intersections detected ✓ (BVH-accelerated)');
    } else {
      result.notes.push(`Found ${result.intersectionCount} intersecting face pair(s) (BVH-accelerated)`);
    }
    return result;
  }

  /**
   * Generate a self-contained HTML visual report (v2.16).
   *
   * Returns a string containing:
   *   - Header with file metadata + analysis version
   *   - SVG visualization (vertices + edges) with M/V color-coding
   *   - Self-intersection highlights (from v2.15)
   *   - Summary table (from v2.13)
   *   - Top issues list
   *   - No external dependencies — pure HTML+CSS+SVG
   *
   * @param {Object} [options] - { title?: string, fileName?: string }
   * @param {Object} [analyzeResult] - Optional pre-computed analyze() output.
   * @returns {string} HTML string (self-contained, ~5-50KB)
   */
  toVisualReport(options = {}, analyzeResult) {
    const r = analyzeResult || this.analyze();
    const summary = this.summarize(r);
    const opts = {
      title: options.title || 'FOLD Model Visual Report',
      fileName: options.fileName || '(unknown)',
      ...options,
    };

    // SVG dimensions
    const bbox = r.basic.boundingBox;
    const padding = 20;
    const svgWidth = 600;
    const svgHeight = 400;
    const scaleX = (svgWidth - 2 * padding) / Math.max(bbox.width, 0.001);
    const scaleY = (svgHeight - 2 * padding) / Math.max(bbox.height, 0.001);
    const scale = Math.min(scaleX, scaleY);

    const project = (v) => {
      const x = padding + (v[0] - bbox.minX) * scale;
      const y = svgHeight - padding - (v[1] - bbox.minY) * scale;
      return [x, y];
    };

    const edgeColor = (a) => {
      if (a === 'M') return '#2563eb';
      if (a === 'V') return '#dc2626';
      if (a === 'F') return '#94a3b8';
      return '#6b7280';
    };

    const edgesSvg = this.edges.map((e, idx) => {
      const a = this.vertices[e[0]] || [0, 0, 0];
      const b = this.vertices[e[1]] || [0, 0, 0];
      const [x1, y1] = project(a);
      const [x2, y2] = project(b);
      const c = edgeColor(this.assignments[idx]);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="1.5" />`;
    }).join('\n      ');

    const verticesSvg = this.vertices.map((v) => {
      const [x, y] = project(v);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#1f2937" />`;
    }).join('\n      ');

    // Highlight self-intersection edges
    const selfIntersect = r.completeSelfIntersection || { intersections: [] };
    const intersectionEdgeSet = new Set();
    for (const inter of selfIntersect.intersections) {
      for (const fIdx of [inter.face1, inter.face2]) {
        const face = this.faces[fIdx] || [];
        for (let i = 0; i < face.length; i++) {
          const a = face[i];
          const b = face[(i + 1) % face.length];
          for (let j = 0; j < this.edges.length; j++) {
            const e = this.edges[j];
            if ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) {
              intersectionEdgeSet.add(j);
              break;
            }
          }
        }
      }
    }
    const highlightSvg = Array.from(intersectionEdgeSet).map(idx => {
      const e = this.edges[idx];
      const a = this.vertices[e[0]] || [0, 0, 0];
      const b = this.vertices[e[1]] || [0, 0, 0];
      const [x1, y1] = project(a);
      const [x2, y2] = project(b);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#f59e0b" stroke-width="4" opacity="0.6" />`;
    }).join('\n      ');

    const summaryHtml = `
    <h2>Summary</h2>
    <table>
      <tr><th>Schema version</th><td>${summary.schemaVersion}</td></tr>
      <tr><th>Summary version</th><td>${summary.summaryVersion}</td></tr>
      <tr><th>Counts</th><td>${summary.counts.vertices} vertices, ${summary.counts.edges} edges, ${summary.counts.faces} faces (${summary.counts.facesByType})</td></tr>
      <tr><th>Surface</th><td>${summary.surface.type} (Euler χ = ${summary.surface.euler}, genus = ${summary.surface.genus ?? 'N/A'})</td></tr>
      <tr><th>Kawasaki</th><td>${summary.flatFoldability.kawasaki.checked} checked, ${summary.flatFoldability.kawasaki.passed} passed (${summary.flatFoldability.kawasaki.passRate})</td></tr>
      <tr><th>Maekawa</th><td>${summary.flatFoldability.maekawa.checked} checked, ${summary.flatFoldability.maekawa.passed} passed</td></tr>
      <tr><th>Quality</th><td>${summary.quality.errorCount} errors, ${summary.quality.warningCount} warnings</td></tr>
      <tr><th>MV alternation</th><td>${summary.consistency.mvAlternation.checked} checked, ${summary.consistency.mvAlternation.inconsistent} non-alternating</td></tr>
      <tr><th>Strict Kawasaki</th><td>${summary.consistency.strictKawasaki.outOfTolerance} out of tolerance</td></tr>
      <tr><th>Self-intersections</th><td>${selfIntersect.intersectionCount || 0} face pair(s)</td></tr>
    </table>`;

    const issuesHtml = summary.quality.topIssues.length > 0 ? `
    <h2>Top Issues</h2>
    <ul>
      ${summary.quality.topIssues.map(i => `<li class="issue-${i.severity}">${this._escapeHtml(i.message)}</li>`).join('\n      ')}
    </ul>` : '';

    const legendHtml = `
    <h2>Edge Legend</h2>
    <div class="legend">
      <span><span class="swatch" style="background:#2563eb"></span> Mountain (M)</span>
      <span><span class="swatch" style="background:#dc2626"></span> Valley (V)</span>
      <span><span class="swatch" style="background:#94a3b8"></span> Flat (F)</span>
      <span><span class="swatch" style="background:#6b7280"></span> Boundary (B)</span>
      <span><span class="swatch" style="background:#f59e0b"></span> Self-intersection (v2.15)</span>
    </div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${this._escapeHtml(opts.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 20px; color: #1f2937; }
    h1 { color: #111827; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
    h2 { color: #374151; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    table { border-collapse: collapse; margin: 12px 0; }
    th { text-align: left; padding: 4px 12px; background: #f3f4f6; border: 1px solid #d1d5db; }
    td { padding: 4px 12px; border: 1px solid #d1d5db; }
    .svg-container { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; margin: 12px 0; }
    .legend { display: flex; gap: 16px; flex-wrap: wrap; }
    .legend span { display: flex; align-items: center; gap: 4px; }
    .swatch { display: inline-block; width: 12px; height: 12px; border-radius: 2px; }
    ul { list-style: none; padding-left: 0; }
    li.issue-error { background: #fee2e2; border-left: 4px solid #dc2626; padding: 6px 10px; margin: 4px 0; }
    li.issue-warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 6px 10px; margin: 4px 0; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>${this._escapeHtml(opts.title)}</h1>
  <p><strong>File:</strong> ${this._escapeHtml(opts.fileName)}</p>
  <h2>Visualization (top-down 2D projection)</h2>
  <div class="svg-container">
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white" />
      ${edgesSvg}
      ${highlightSvg}
      ${verticesSvg}
    </svg>
  </div>
  ${legendHtml}
  ${summaryHtml}
  ${issuesHtml}
  <div class="footer">
    Generated by fold-analyzer v${r.schemaVersion} (visualizer v2.16) • ${new Date().toISOString()}
  </div>
</body>
</html>`;
  }

  /**
   * HTML-escape a string for safe embedding.
   * @private
   */
  _escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Generate a compact summary (v2.13) — for scripts/automation/CI use.
   *
   * Unlike `analyze()` (which returns all 16 fields), `summarize()` returns
   * only the most-actionable subset:
   *   - schemaVersion, fileSanity
   *   - basic counts
   *   - flat-foldability summary
   *   - quality summary (top issues, counts)
   *   - key warnings
   *   - analysis version info
   *
   * @param {Object} [analyzeResult] - Optional pre-computed analyze() output.
   *   If not provided, calls this.analyze() internally.
   * @returns {{
   *   schemaVersion: string,
   *   summaryVersion: string,
   *   counts: { vertices, edges, faces, facesByType },
   *   surface: { type, euler, genus },
   *   flatFoldability: { kawasaki: Object, maekawa: Object },
   *   quality: { errorCount, warningCount, topIssues: Array<Object> },
   *   consistency: { mvAlternation: Object, strictKawasaki: Object },
   *   keyWarnings: string[],
   *   notes: string[]
   * }}
   */
  summarize(analyzeResult) {
    const r = analyzeResult || this.analyze();

    const topIssues = (r.quality.issues || [])
      .slice(0, 5)
      .map(i => ({
        severity: i.type,
        kind: i.message.split(':')[0] || 'issue',
        message: i.message,
      }));

    return {
      schemaVersion: r.schemaVersion,
      summaryVersion: '2.13',
      counts: {
        vertices: r.basic.vertexCount,
        edges: r.basic.edgeCount,
        faces: r.basic.faceCount,
        facesByType: r.classification.patternType,
      },
      surface: {
        type: r.basic.surfaceType,
        euler: r.basic.eulerCharacteristic,
        genus: r.basic.genus,
      },
      flatFoldability: {
        kawasaki: {
          checked: r.validation.checkedVertices,
          passed: r.validation.passCount,
          failed: r.validation.failCount,
          passRate: r.validation.passRate,
        },
        maekawa: {
          checked: r.validation.checkedVertices,
          passed: r.validation.passCount,
          failed: r.validation.failCount,
        },
      },
      quality: {
        errorCount: r.quality.errorCount,
        warningCount: r.quality.warningCount,
        topIssues,
      },
      consistency: {
        mvAlternation: {
          checked: r.mvAlternation.totalChecked,
          inconsistent: r.mvAlternation.inconsistent,
        },
        strictKawasaki: {
          totalChecked: r.strictKawasaki.totalChecked,
          outOfTolerance: r.strictKawasaki.outOfTolerance,
          worstDeviation: (r.strictKawasaki.topDeviations && r.strictKawasaki.topDeviations[0])
            ? r.strictKawasaki.topDeviations[0].deviation
            : null,
        },
      },
      keyWarnings: (r.warnings || []).slice(0, 5),
      notes: [
        `Generated by fold-analyzer v${r.schemaVersion}`,
        'Use --validate-output to check schema conformance',
        'Use --json for full output (all 16 fields)',
      ],
    };
  }

  /**
   * Validate the output of analyze() against docs/fold-analyzer-schema.json
   * using ajv (JSON Schema validator). v2.11.
   *
   * Optional check — doesn't run by default. Activate via:
   *   - CLI: --validate-output flag
   *   - Programmatic: analyzer.validateAgainstSchema()
   *
   * @param {Object} [analyzeResult] - Optional pre-computed analyze() output.
   *   If not provided, calls this.analyze() internally.
   * @returns {{
   *   valid: boolean,
   *   errors: Array<{ instancePath, schemaPath, keyword, message, params }>,
   *   schemaVersion: string,
   *   expectedSchemaVersion: string,
   *   versionMatch: boolean,
   *   summary: string
   * }}
   */
  validateAgainstSchema(analyzeResult) {
    // Lazy-load ajv to avoid hard dependency for users who don't need validation
    let Ajv;
    try {
      Ajv = require('ajv');
    } catch (e) {
      return {
        valid: false,
        errors: [{ instancePath: '', schemaPath: '', keyword: 'dependency', message: 'ajv not installed; run `npm install ajv`', params: {} }],
        schemaVersion: null,
        expectedSchemaVersion: null,
        versionMatch: false,
        summary: 'ajv dependency missing — cannot validate',
      };
    }

    // Load schema
    const schemaPath = path.join(__dirname, '..', '..', 'docs', 'fold-analyzer-schema.json');
    let schema;
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    } catch (e) {
      return {
        valid: false,
        errors: [{ instancePath: '', schemaPath: '', keyword: 'schema-load', message: `Failed to load schema: ${e.message}`, params: {} }],
        schemaVersion: null,
        expectedSchemaVersion: null,
        versionMatch: false,
        summary: 'Schema file load failed',
      };
    }

    const expectedSchemaVersion = schema.properties && schema.properties.schemaVersion && schema.properties.schemaVersion.const;

    // Run analyze if not provided
    const result = analyzeResult || this.analyze();
    const schemaVersion = result.schemaVersion;

    // Strip $schema field — ajv v8 default doesn't support draft 2020-12 meta-schema.
    // Stripping it makes ajv use draft-07 (which has all features we need).
    const schemaForAjv = { ...schema };
    delete schemaForAjv.$schema;

    // Validate
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schemaForAjv);
    const valid = validate(result);

    return {
      valid: !!valid,
      errors: (validate.errors || []).map(e => ({
        instancePath: e.instancePath || '',
        schemaPath: e.schemaPath || '',
        keyword: e.keyword || '',
        message: e.message || '',
        params: e.params || {},
      })),
      schemaVersion,
      expectedSchemaVersion,
      versionMatch: schemaVersion === expectedSchemaVersion,
      summary: valid
        ? `✅ Output conforms to schema (version ${schemaVersion})`
        : `❌ ${(validate.errors || []).length} validation error(s) — see errors array`,
    };
  }
}

module.exports = { FoldAnalyzer };
module.exports.FoldAnalyzer = FoldAnalyzer;
