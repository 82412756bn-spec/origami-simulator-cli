/**
 * FOLD Diff (v2.31) — Compare two FOLD files and report changes
 *
 * Strategy:
 *   1. Match vertices by spatial proximity (find closest vertex in B for
 *      each vertex in A, with a distance threshold). Vertices that are
 *      within threshold are "matched"; others are "removed" (only in A)
 *      or "added" (only in B).
 *   2. Match edges by their (matchedA, matchedB) vertex index pairs. An
 *      edge is "modified" if both endpoints are matched but the
 *      assignment (M/V/B) changed.
 *   3. Match faces by their vertex-set signatures. A face is "modified"
 *      if its vertex set changed.
 *   4. Report a structured diff with all changes.
 *
 * This is a structural + spatial diff. It does NOT do a "semantic" diff
 * (e.g., detect that vertex N was split into two vertices).
 *
 * For pure topological diff (no spatial matching), use the "exact" mode.
 */

class FoldDiff {
  constructor(foldA, foldB, options = {}) {
    this.foldA = foldA;
    this.foldB = foldB;
    this.verticesA = foldA.vertices_coords || [];
    this.verticesB = foldB.vertices_coords || [];
    this.edgesA = foldA.edges_vertices || [];
    this.edgesB = foldB.edges_vertices || [];
    this.assignA = foldA.edges_assignment || [];
    this.assignB = foldB.edges_assignment || [];
    this.facesA = foldA.faces_vertices || [];
    this.facesB = foldB.faces_vertices || [];

    this.options = {
      // MATCHING threshold: max distance to consider two vertices "the same"
      // vertex (i.e., to be matched across A and B). Default 1e-3 mm.
      // A higher value matches more vertices but might over-match distinct ones.
      vertexTolerance: options.vertexTolerance !== undefined ? options.vertexTolerance : 1e-3,
      // MOVED threshold: matched vertices with distance > this are reported
      // as "moved". Default 0 (any non-zero distance = moved). A higher value
      // treats small numerical perturbations as unchanged.
      moveThreshold: options.moveThreshold !== undefined ? options.moveThreshold : 0,
      // When true, vertex indices must match exactly (no spatial matching).
      exact: options.exact || false,
    };
  }

  /**
   * Compute the diff and return a structured result.
   * Returns: { vertices: {added, removed, moved, unchanged},
   *           edges:   {added, removed, modified, unchanged},
   *           faces:   {added, removed, modified, unchanged},
   *           meta:    {changes: [{key, before, after}]},
   *           stats:   { totalAdded, totalRemoved, totalModified, totalUnchanged } }
   */
  diff() {
    // 1. Vertex matching
    const vertexMap = this.matchVertices();
    const vertexDiff = this.diffVertices(vertexMap);

    // 2. Edge matching (using mapped vertex indices)
    const edgeMap = this.matchEdges(vertexMap);
    const edgeDiff = this.diffEdges(edgeMap, vertexMap);

    // 3. Face matching
    const faceMap = this.matchFaces(vertexMap);
    const faceDiff = this.diffFaces(faceMap, vertexMap);

    // 4. Metadata diff
    const metaDiff = this.diffMeta();

    // Stats
    const stats = {
      verticesAdded: vertexDiff.added.length,
      verticesRemoved: vertexDiff.removed.length,
      verticesMoved: vertexDiff.moved.length,
      verticesUnchanged: vertexDiff.unchanged.length,
      edgesAdded: edgeDiff.added.length,
      edgesRemoved: edgeDiff.removed.length,
      edgesModified: edgeDiff.modified.length,
      edgesUnchanged: edgeDiff.unchanged.length,
      facesAdded: faceDiff.added.length,
      facesRemoved: faceDiff.removed.length,
      facesModified: faceDiff.modified.length,
      facesUnchanged: faceDiff.unchanged.length,
      metaChanges: metaDiff.changes.length,
    };

    return {
      vertices: vertexDiff,
      edges: edgeDiff,
      faces: faceDiff,
      meta: metaDiff,
      stats,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Vertex matching
  // ────────────────────────────────────────────────────────────────────

  /**
   * Match vertices by spatial proximity. Returns a Map from A-index to B-index.
   * Vertices without a match are not in the map.
   */
  matchVertices() {
    const map = new Map();
    if (this.options.exact) {
      const n = Math.min(this.verticesA.length, this.verticesB.length);
      for (let i = 0; i < n; i++) {
        map.set(i, i);
      }
      return map;
    }
    // For each vertex in A, find closest unmatched vertex in B
    const usedB = new Set();
    // Sort A-vertices by index to make matching deterministic
    for (let i = 0; i < this.verticesA.length; i++) {
      const va = this.verticesA[i];
      let bestJ = -1, bestD = this.options.vertexTolerance;
      for (let j = 0; j < this.verticesB.length; j++) {
        if (usedB.has(j)) continue;
        const vb = this.verticesB[j];
        const d = this.dist(va, vb);
        if (d < bestD) {
          bestD = d;
          bestJ = j;
        }
      }
      if (bestJ >= 0) {
        map.set(i, bestJ);
        usedB.add(bestJ);
      }
    }
    return map;
  }

  /**
   * Classify vertices as added/removed/moved/unchanged.
   */
  diffVertices(vertexMap) {
    const added = [];     // In B but not in A
    const removed = [];  // In A but not in B
    const moved = [];    // Matched but position changed significantly
    const unchanged = [];

    // Removed: A-vertices not in map
    for (let i = 0; i < this.verticesA.length; i++) {
      if (!vertexMap.has(i)) {
        removed.push({ indexA: i, coords: this.verticesA[i] });
      } else {
        const j = vertexMap.get(i);
        const d = this.dist(this.verticesA[i], this.verticesB[j]);
        if (d > this.options.moveThreshold) {
          moved.push({
            indexA: i, indexB: j,
            from: this.verticesA[i],
            to: this.verticesB[j],
            distance: d,
          });
        } else {
          unchanged.push({ indexA: i, indexB: j });
        }
      }
    }

    // Added: B-vertices not in the inverse map
    const usedB = new Set(vertexMap.values());
    for (let j = 0; j < this.verticesB.length; j++) {
      if (!usedB.has(j)) {
        added.push({ indexB: j, coords: this.verticesB[j] });
      }
    }

    return { added, removed, moved, unchanged };
  }

  // ────────────────────────────────────────────────────────────────────
  // Edge matching
  // ────────────────────────────────────────────────────────────────────

  /**
   * Match edges using vertex index translation. Edges are matched by their
   * {min, max} vertex pair (order-independent).
   */
  matchEdges(vertexMap) {
    const map = new Map();  // a-edge index → b-edge index
    // Build a lookup from B edge pair to B edge index
    const bLookup = new Map();
    for (let j = 0; j < this.edgesB.length; j++) {
      const [a, b] = this.edgesB[j];
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      bLookup.set(key, j);
    }
    for (let i = 0; i < this.edgesA.length; i++) {
      const [a, b] = this.edgesA[i];
      if (!vertexMap.has(a) || !vertexMap.has(b)) continue;
      const aB = vertexMap.get(a), bB = vertexMap.get(b);
      const key = `${Math.min(aB, bB)}-${Math.max(aB, bB)}`;
      if (bLookup.has(key)) {
        map.set(i, bLookup.get(key));
      }
    }
    return map;
  }

  /**
   * Classify edges as added/removed/modified/unchanged.
   * Modified = same endpoints but assignment changed.
   */
  diffEdges(edgeMap, vertexMap) {
    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Removed + modified
    for (let i = 0; i < this.edgesA.length; i++) {
      if (!edgeMap.has(i)) {
        // If both endpoints have no match, edge is genuinely removed.
        // If only one endpoint has no match, the edge is "deformed" — still report as removed.
        removed.push({ indexA: i, vertices: this.edgesA[i], assignment: this.assignA[i] });
      } else {
        const j = edgeMap.get(i);
        const assignA = this.assignA[i];
        const assignB = this.assignB[j];
        if (assignA !== assignB) {
          modified.push({
            indexA: i, indexB: j,
            verticesA: this.edgesA[i],
            verticesB: this.edgesB[j],
            assignmentA: assignA,
            assignmentB: assignB,
          });
        } else {
          unchanged.push({ indexA: i, indexB: j });
        }
      }
    }

    // Added: B-edges not in map
    const usedB = new Set(edgeMap.values());
    for (let j = 0; j < this.edgesB.length; j++) {
      if (!usedB.has(j)) {
        added.push({ indexB: j, vertices: this.edgesB[j], assignment: this.assignB[j] });
      }
    }

    return { added, removed, modified, unchanged };
  }

  // ────────────────────────────────────────────────────────────────────
  // Face matching
  // ────────────────────────────────────────────────────────────────────

  /**
   * Match faces by their vertex-set signature (translated through vertexMap).
   */
  matchFaces(vertexMap) {
    const map = new Map();
    const bLookup = new Map();
    for (let j = 0; j < this.facesB.length; j++) {
      const faceB = this.facesB[j].map(v => vertexMap.has(v) ? vertexMap.get(v) : -1);
      const sig = this.faceSignature(faceB);
      bLookup.set(sig, j);
    }
    for (let i = 0; i < this.facesA.length; i++) {
      const faceA = this.facesA[i];
      const sig = this.faceSignature(faceA);
      if (bLookup.has(sig)) {
        map.set(i, bLookup.get(sig));
      }
    }
    return map;
  }

  /**
   * Sorted vertex set as a string key (order-independent for face equality).
   */
  faceSignature(face) {
    return [...face].sort((a, b) => a - b).join(',');
  }

  /**
   * Classify faces as added/removed/modified/unchanged.
   * Modified = same vertex set but some vertex was moved significantly.
   */
  diffFaces(faceMap, vertexMap) {
    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    for (let i = 0; i < this.facesA.length; i++) {
      if (!faceMap.has(i)) {
        removed.push({ indexA: i, vertices: this.facesA[i] });
      } else {
        // Check if any vertex in this face was moved
        const j = faceMap.get(i);
        const faceA = this.facesA[i];
        const faceB = this.facesB[j];
        // A face is "modified" if it has a moved vertex
        let hasMoved = false;
        const movedVerts = [];
        for (const vA of faceA) {
          if (vertexMap.has(vA)) {
            const vB = vertexMap.get(vA);
            const d = this.dist(this.verticesA[vA], this.verticesB[vB]);
            if (d > this.options.vertexTolerance) {
              hasMoved = true;
              movedVerts.push({ vertexA: vA, vertexB: vB, distance: d });
            }
          }
        }
        if (hasMoved) {
          modified.push({ indexA: i, indexB: j, verticesA: faceA, verticesB: faceB, movedVerts });
        } else {
          unchanged.push({ indexA: i, indexB: j });
        }
      }
    }

    const usedB = new Set(faceMap.values());
    for (let j = 0; j < this.facesB.length; j++) {
      if (!usedB.has(j)) {
        added.push({ indexB: j, vertices: this.facesB[j] });
      }
    }

    return { added, removed, modified, unchanged };
  }

  // ────────────────────────────────────────────────────────────────────
  // Metadata diff
  // ────────────────────────────────────────────────────────────────────

  diffMeta() {
    const changes = [];
    const allKeys = new Set([
      ...Object.keys(this.foldA || {}),
      ...Object.keys(this.foldB || {}),
    ]);
    // Skip keys we diff separately
    const skip = new Set([
      'vertices_coords', 'edges_vertices', 'edges_assignment',
      'faces_vertices', 'edges_foldAngle', 'faceOrders',
    ]);
    for (const key of allKeys) {
      if (skip.has(key)) continue;
      const a = this.foldA[key];
      const b = this.foldB[key];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        changes.push({ key, before: a, after: b });
      }
    }
    return { changes };
  }

  // ────────────────────────────────────────────────────────────────────
  // Math
  // ────────────────────────────────────────────────────────────────────

  dist(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
}

// ────────────────────────────────────────────────────────────────────
// Renderers
// ────────────────────────────────────────────────────────────────────

/**
 * Human-readable text diff (like `diff -u`).
 */
function renderText(diff) {
  const lines = [];
  lines.push('─'.repeat(70));
  lines.push('FOLD Diff');
  lines.push('─'.repeat(70));
  lines.push('');

  // Stats summary
  const s = diff.stats;
  lines.push('Summary:');
  lines.push(`  Vertices: +${s.verticesAdded} -${s.verticesRemoved} ~${s.verticesMoved} =${s.verticesUnchanged}`);
  lines.push(`  Edges:    +${s.edgesAdded} -${s.edgesRemoved} ~${s.edgesModified} =${s.edgesUnchanged}`);
  lines.push(`  Faces:    +${s.facesAdded} -${s.facesRemoved} ~${s.facesModified} =${s.facesUnchanged}`);
  lines.push(`  Meta:     ${s.metaChanges} change(s)`);
  lines.push('');

  // Vertices
  if (diff.vertices.added.length || diff.vertices.removed.length || diff.vertices.moved.length) {
    lines.push('Vertices:');
    for (const v of diff.vertices.added) {
      lines.push(`  + [${v.indexB}] ${fmt(v.coords)} (added)`);
    }
    for (const v of diff.vertices.removed) {
      lines.push(`  - [${v.indexA}] ${fmt(v.coords)} (removed)`);
    }
    for (const v of diff.vertices.moved) {
      lines.push(`  ~ [${v.indexA}→${v.indexB}] moved by ${v.distance.toFixed(4)} mm`);
      lines.push(`      from ${fmt(v.from)}`);
      lines.push(`      to   ${fmt(v.to)}`);
    }
    lines.push('');
  }

  // Edges
  if (diff.edges.added.length || diff.edges.removed.length || diff.edges.modified.length) {
    lines.push('Edges:');
    for (const e of diff.edges.added) {
      lines.push(`  + [${e.indexB}] (${e.vertices.join(',')}) [${e.assignment || 'B'}] (added)`);
    }
    for (const e of diff.edges.removed) {
      lines.push(`  - [${e.indexA}] (${e.vertices.join(',')}) [${e.assignment || 'B'}] (removed)`);
    }
    for (const e of diff.edges.modified) {
      lines.push(`  ~ [${e.indexA}→${e.indexB}] assignment: ${e.assignmentA} → ${e.assignmentB}`);
    }
    lines.push('');
  }

  // Faces
  if (diff.faces.added.length || diff.faces.removed.length || diff.faces.modified.length) {
    lines.push('Faces:');
    for (const f of diff.faces.added) {
      lines.push(`  + [${f.indexB}] (${f.vertices.join(',')}) (added)`);
    }
    for (const f of diff.faces.removed) {
      lines.push(`  - [${f.indexA}] (${f.vertices.join(',')}) (removed)`);
    }
    for (const f of diff.faces.modified) {
      lines.push(`  ~ [${f.indexA}→${f.indexB}] contains ${f.movedVerts.length} moved vert(s)`);
    }
    lines.push('');
  }

  // Meta
  if (diff.meta.changes.length) {
    lines.push('Metadata:');
    for (const c of diff.meta.changes) {
      lines.push(`  ~ ${c.key}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`);
    }
    lines.push('');
  }

  // Total
  const totalChanges = s.verticesAdded + s.verticesRemoved + s.verticesMoved +
                       s.edgesAdded + s.edgesRemoved + s.edgesModified +
                       s.facesAdded + s.facesRemoved + s.facesModified +
                       s.metaChanges;
  lines.push('─'.repeat(70));
  lines.push(`Total: ${totalChanges} change${totalChanges !== 1 ? 's' : ''}`);
  lines.push('─'.repeat(70));

  return lines.join('\n');
}

/**
 * Side-by-side HTML diff.
 */
function renderHTML(diff, options = {}) {
  const title = options.title || 'FOLD Diff';
  // Build a simple table: row per changed element
  const rows = [];
  for (const v of diff.vertices.added) {
    rows.push({ kind: 'vertex', op: 'added', label: `V${v.indexB}`, detail: fmt(v.coords) });
  }
  for (const v of diff.vertices.removed) {
    rows.push({ kind: 'vertex', op: 'removed', label: `V${v.indexA}`, detail: fmt(v.coords) });
  }
  for (const v of diff.vertices.moved) {
    rows.push({ kind: 'vertex', op: 'moved', label: `V${v.indexA}→${v.indexB}`, detail: `moved ${v.distance.toFixed(4)} mm` });
  }
  for (const e of diff.edges.added) {
    rows.push({ kind: 'edge', op: 'added', label: `E${e.indexB} (${e.vertices.join(',')})`, detail: `[${e.assignment || 'B'}]` });
  }
  for (const e of diff.edges.removed) {
    rows.push({ kind: 'edge', op: 'removed', label: `E${e.indexA} (${e.vertices.join(',')})`, detail: `[${e.assignment || 'B'}]` });
  }
  for (const e of diff.edges.modified) {
    rows.push({ kind: 'edge', op: 'modified', label: `E${e.indexA}→${e.indexB}`, detail: `${e.assignmentA} → ${e.assignmentB}` });
  }
  for (const f of diff.faces.added) {
    rows.push({ kind: 'face', op: 'added', label: `F${f.indexB}`, detail: `(${f.vertices.join(',')})` });
  }
  for (const f of diff.faces.removed) {
    rows.push({ kind: 'face', op: 'removed', label: `F${f.indexA}`, detail: `(${f.vertices.join(',')})` });
  }
  for (const f of diff.faces.modified) {
    rows.push({ kind: 'face', op: 'modified', label: `F${f.indexA}→${f.indexB}`, detail: `${f.movedVerts.length} moved vert(s)` });
  }
  for (const c of diff.meta.changes) {
    rows.push({ kind: 'meta', op: 'modified', label: c.key, detail: `${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}` });
  }

  const s = diff.stats;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(title)}</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 20px; background: #fafafa; }
    h1 { font-size: 18px; margin: 0 0 8px 0; }
    .summary { color: #666; font-size: 13px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #eee; border-radius: 4px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .op { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; min-width: 64px; text-align: center; }
    .op-added { background: #d4edda; color: #155724; }
    .op-removed { background: #f8d7da; color: #721c24; }
    .op-modified { background: #fff3cd; color: #856404; }
    .op-unchanged { background: #e2e3e5; color: #383d41; }
    .label { font-family: 'SF Mono', Consolas, monospace; font-size: 12px; }
    .detail { color: #666; font-size: 12px; }
    .empty { color: #999; font-style: italic; padding: 24px; text-align: center; }
  </style>
</head>
<body>
  <h1>📊 ${escHtml(title)}</h1>
  <div class="summary">
    Vertices: +${s.verticesAdded} -${s.verticesRemoved} ~${s.verticesMoved} =${s.verticesUnchanged} &nbsp;|&nbsp;
    Edges: +${s.edgesAdded} -${s.edgesRemoved} ~${s.edgesModified} =${s.edgesUnchanged} &nbsp;|&nbsp;
    Faces: +${s.facesAdded} -${s.facesRemoved} ~${s.facesModified} =${s.facesUnchanged} &nbsp;|&nbsp;
    Meta: ${s.metaChanges}
  </div>
  ${rows.length === 0
    ? '<div class="empty">No changes detected</div>'
    : `<table>
        <thead><tr><th>Op</th><th>Element</th><th>Detail</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td><span class="op op-${r.op}">${r.op}</span></td>
            <td class="label">${escHtml(r.label)}</td>
            <td class="detail">${escHtml(r.detail)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`}
</body>
</html>
`;
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmt(v) {
  if (!v) return '?';
  return `(${v.map(x => Number(x).toFixed(2)).join(', ')})`;
}

module.exports = { FoldDiff, renderText, renderHTML };
