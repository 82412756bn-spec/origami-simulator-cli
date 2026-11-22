/**
 * FOLD Merge (v2.42) — 3-way merge for FOLD files
 *
 * Uses the same spatial matching as FoldDiff (v2.31) to align vertices
 * across Base, Ours, and Theirs versions.
 *
 * Algorithm:
 *   1. Match vertices: Base ↔ Ours, Base ↔ Theirs (using spatial proximity)
 *   2. For each vertex in Base:
 *      - Ours unchanged, Theirs unchanged → keep Base position
 *      - Ours changed, Theirs unchanged → use Ours position
 *      - Ours unchanged, Theirs changed → use Theirs position
 *      - Both changed similarly → use average (if direction similar)
 *      - Both changed oppositely → CONFLICT
 *      - Only in Ours/Theirs → added vertex
 *   3. Similar logic for edges (assignments) and faces
 *   4. Output merged FOLD or conflict report
 *
 * Usage:
 *   origami merge base.fold ours.fold theirs.fold
 *   origami merge base.fold ours.fold theirs.fold --output merged.fold
 *   origami merge base.fold ours.fold theirs.fold --conflict-only
 */

class FoldMerge {
  constructor(base, ours, theirs, options = {}) {
    this.base = base;
    this.ours = ours;
    this.theirs = theirs;

    this.verticesBase = base.vertices_coords || [];
    this.verticesOurs = ours.vertices_coords || [];
    this.verticesTheirs = theirs.vertices_coords || [];

    this.edgesBase = base.edges_vertices || [];
    this.edgesOurs = ours.edges_vertices || [];
    this.edgesTheirs = theirs.edges_vertices || [];

    this.assignBase = base.edges_assignment || [];
    this.assignOurs = ours.edges_assignment || [];
    this.assignTheirs = theirs.edges_assignment || [];

    this.facesBase = base.faces_vertices || [];
    this.facesOurs = ours.faces_vertices || [];
    this.facesTheirs = theirs.faces_vertices || [];

    this.options = {
      vertexTolerance: options.vertexTolerance !== undefined ? options.vertexTolerance : 1e-3,
      moveThreshold: options.moveThreshold !== undefined ? options.moveThreshold : 1e-4,
      conflictThreshold: options.conflictThreshold || 0.5,  // 弧度，方向差异大于此值视为冲突
    };
  }

  /**
   * Perform 3-way merge and return result.
   * Returns: { merged: FOLD, conflicts: [], stats: {...} }
   */
  merge() {
    // 1. Match vertices across all three versions
    const vertexMapOurs = this.matchVertices(this.verticesBase, this.verticesOurs);
    const vertexMapTheirs = this.matchVertices(this.verticesBase, this.verticesTheirs);

    // 2. Merge vertices
    const vertexResult = this.mergeVertices(vertexMapOurs, vertexMapTheirs);

    // 3. Build inverse maps for edge/face matching
    const inverseOurs = this.inverseMap(vertexMapOurs);
    const inverseTheirs = this.inverseMap(vertexMapTheirs);

    // 4. Merge edges
    const edgeResult = this.mergeEdges(vertexMapOurs, vertexMapTheirs, inverseOurs, inverseTheirs);

    // 5. Merge faces
    const faceResult = this.mergeFaces(vertexMapOurs, vertexMapTheirs, inverseOurs, inverseTheirs);

    // 6. Merge metadata (simple: ours wins for non-conflicting keys)
    const metaResult = this.mergeMeta();

    // 7. Build merged FOLD
    const merged = this.buildMergedFOLD(vertexResult.vertices, edgeResult.edges, edgeResult.assignments, faceResult.faces, metaResult);

    // 8. Stats
    const stats = {
      verticesAutoMerged: vertexResult.autoMerged,
      verticesConflict: vertexResult.conflicts.length,
      verticesAdded: vertexResult.added.length,
      edgesAutoMerged: edgeResult.autoMerged,
      edgesConflict: edgeResult.conflicts.length,
      edgesAdded: edgeResult.added.length,
      facesAutoMerged: faceResult.autoMerged,
      facesConflict: faceResult.conflicts.length,
      facesAdded: faceResult.added.length,
    };

    return {
      merged,
      conflicts: [
        ...vertexResult.conflicts.map(c => ({ type: 'vertex', ...c })),
        ...edgeResult.conflicts.map(c => ({ type: 'edge', ...c })),
        ...faceResult.conflicts.map(c => ({ type: 'face', ...c })),
      ],
      stats,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Vertex matching (reuse from FoldDiff)
  // ────────────────────────────────────────────────────────────────────

  matchVertices(verticesA, verticesB) {
    const map = new Map();
    const usedB = new Set();
    for (let i = 0; i < verticesA.length; i++) {
      const va = verticesA[i];
      let bestJ = -1, bestD = this.options.vertexTolerance;
      for (let j = 0; j < verticesB.length; j++) {
        if (usedB.has(j)) continue;
        const vb = verticesB[j];
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

  inverseMap(map) {
    const inv = new Map();
    for (const [a, b] of map) {
      inv.set(b, a);
    }
    return inv;
  }

  // ────────────────────────────────────────────────────────────────────
  // Vertex merging
  // ────────────────────────────────────────────────────────────────────

  mergeVertices(mapOurs, mapTheirs) {
    const merged = [];
    const conflicts = [];
    const added = [];

    // Process each base vertex
    for (let i = 0; i < this.verticesBase.length; i++) {
      const baseV = this.verticesBase[i];
      const hasOurs = mapOurs.has(i);
      const hasTheirs = mapTheirs.has(i);

      if (!hasOurs && !hasTheirs) {
        // Not modified in either branch - keep base
        merged.push([...baseV]);
      } else if (hasOurs && !hasTheirs) {
        // Only modified in ours - take ours
        const oursIdx = mapOurs.get(i);
        merged.push([...this.verticesOurs[oursIdx]]);
      } else if (!hasOurs && hasTheirs) {
        // Only modified in theirs - take theirs
        const theirsIdx = mapTheirs.get(i);
        merged.push([...this.verticesTheirs[theirsIdx]]);
      } else {
        // Modified in both - check for conflict
        const oursIdx = mapOurs.get(i);
        const theirsIdx = mapTheirs.get(i);
        const oursV = this.verticesOurs[oursIdx];
        const theirsV = this.verticesTheirs[theirsIdx];

        // Check if both changed in the same direction
        const oursDelta = [oursV[0] - baseV[0], oursV[1] - baseV[1], oursV[2] - baseV[2]];
        const theirsDelta = [theirsV[0] - baseV[0], theirsV[1] - baseV[1], theirsV[2] - baseV[2]];

        const oursDist = this.dist(oursV, baseV);
        const theirsDist = this.dist(theirsV, baseV);

        if (oursDist < this.options.moveThreshold && theirsDist < this.options.moveThreshold) {
          // Both moved negligibly - keep base
          merged.push([...baseV]);
        } else if (oursDist < this.options.moveThreshold) {
          // Only ours moved significantly
          merged.push([...oursV]);
        } else if (theirsDist < this.options.moveThreshold) {
          // Only theirs moved significantly
          merged.push([...theirsV]);
        } else {
          // Both moved significantly - check direction similarity
          const directionSimilar = this.isDirectionSimilar(oursDelta, theirsDelta);
          if (directionSimilar) {
            // Same direction - take average
            merged.push([
              (oursV[0] + theirsV[0]) / 2,
              (oursV[1] + theirsV[1]) / 2,
              (oursV[2] + theirsV[2]) / 2,
            ]);
          } else {
            // Opposite directions - CONFLICT
            conflicts.push({
              indexBase: i,
              indexOurs: oursIdx,
              indexTheirs: theirsIdx,
              base: baseV,
              ours: oursV,
              theirs: theirsV,
              oursDelta,
              theirsDelta,
            });
            // Use ours as conflict resolution (user must manually resolve)
            merged.push([...oursV]);
          }
        }
      }
    }

    // Handle added vertices (in ours or theirs but not in base)
    const usedTheirs = new Set(mapTheirs.values());
    for (const [baseIdx, oursIdx] of mapOurs) {
      if (!this.verticesBase[baseIdx]) {
        // Added in ours
        added.push({ source: 'ours', index: oursIdx, coords: this.verticesOurs[oursIdx] });
        merged.push([...this.verticesOurs[oursIdx]]);
      }
    }
    for (const [baseIdx, theirsIdx] of mapTheirs) {
      if (!this.verticesBase[baseIdx] && !mapOurs.has(baseIdx)) {
        // Added in theirs only
        added.push({ source: 'theirs', index: theirsIdx, coords: this.verticesTheirs[theirsIdx] });
        merged.push([...this.verticesTheirs[theirsIdx]]);
      }
    }

    return {
      vertices: merged,
      autoMerged: this.verticesBase.length - conflicts.length,
      conflicts,
      added,
    };
  }

  isDirectionSimilar(deltaA, deltaB) {
    // Compute angle between two direction vectors
    const magA = Math.hypot(...deltaA);
    const magB = Math.hypot(...deltaB);
    if (magA < 1e-9 || magB < 1e-9) return true;

    // Normalize
    const dirA = deltaA.map(d => d / magA);
    const dirB = deltaB.map(d => d / magB);

    // Dot product = cos(angle)
    const dot = dirA[0] * dirB[0] + dirA[1] * dirB[1] + dirA[2] * dirB[2];

    // Similar if dot product > threshold (angle < 90° = same general direction)
    return dot > Math.cos(this.options.conflictThreshold);
  }

  // ────────────────────────────────────────────────────────────────────
  // Edge merging
  // ────────────────────────────────────────────────────────────────────

  mergeEdges(mapOurs, mapTheirs, inverseOurs, inverseTheirs) {
    const mergedEdges = [];
    const mergedAssignments = [];
    const conflicts = [];
    const added = [];

    // For each base edge, determine merge result
    for (let i = 0; i < this.edgesBase.length; i++) {
      const [a, b] = this.edgesBase[i];
      const assignBase = this.assignBase[i];

      // Check if endpoints are matched
      const aOurs = mapOurs.has(a) ? mapOurs.get(a) : -1;
      const bOurs = mapOurs.has(b) ? mapOurs.get(b) : -1;
      const aTheirs = mapTheirs.has(a) ? mapTheirs.get(a) : -1;
      const bTheirs = mapTheirs.has(b) ? mapTheirs.get(b) : -1;

      // Find corresponding edge in ours/theirs if endpoints matched
      let oursEdgeIdx = -1;
      let theirsEdgeIdx = -1;

      if (aOurs >= 0 && bOurs >= 0) {
        for (let j = 0; j < this.edgesOurs.length; j++) {
          const [oa, ob] = this.edgesOurs[j];
          if ((oa === aOurs && ob === bOurs) || (oa === bOurs && ob === aOurs)) {
            oursEdgeIdx = j;
            break;
          }
        }
      }

      if (aTheirs >= 0 && bTheirs >= 0) {
        for (let j = 0; j < this.edgesTheirs.length; j++) {
          const [ta, tb] = this.edgesTheirs[j];
          if ((ta === aTheirs && tb === bTheirs) || (ta === bTheirs && tb === aTheirs)) {
            theirsEdgeIdx = j;
            break;
          }
        }
      }

      if (oursEdgeIdx < 0 && theirsEdgeIdx < 0) {
        // Edge not present in either branch - keep base (or remove)
        mergedEdges.push([a, b]);
        mergedAssignments.push(assignBase || 'B');
      } else if (oursEdgeIdx >= 0 && theirsEdgeIdx < 0) {
        // Only in ours
        mergedEdges.push([aOurs, bOurs]);
        mergedAssignments.push(this.assignOurs[oursEdgeIdx] || 'B');
      } else if (oursEdgeIdx < 0 && theirsEdgeIdx >= 0) {
        // Only in theirs
        mergedEdges.push([aTheirs, bTheirs]);
        mergedAssignments.push(this.assignTheirs[theirsEdgeIdx] || 'B');
      } else {
        // Present in both - check assignment conflict
        const assignOurs = this.assignOurs[oursEdgeIdx] || 'B';
        const assignTheirs = this.assignTheirs[theirsEdgeIdx] || 'B';

        if (assignOurs === assignTheirs) {
          // Same assignment - merge OK
          mergedEdges.push([aOurs, bOurs]);
          mergedAssignments.push(assignOurs);
        } else if (assignOurs === assignBase) {
          // Ours kept base, theirs changed
          mergedEdges.push([aTheirs, bTheirs]);
          mergedAssignments.push(assignTheirs);
        } else if (assignTheirs === assignBase) {
          // Theirs kept base, ours changed
          mergedEdges.push([aOurs, bOurs]);
          mergedAssignments.push(assignOurs);
        } else {
          // Both changed differently - CONFLICT
          conflicts.push({
            indexBase: i,
            indexOurs: oursEdgeIdx,
            indexTheirs: theirsEdgeIdx,
            assignmentBase: assignBase,
            assignmentOurs: assignOurs,
            assignmentTheirs: assignTheirs,
          });
          // Use ours as default resolution
          mergedEdges.push([aOurs, bOurs]);
          mergedAssignments.push(assignOurs);
        }
      }
    }

    return {
      edges: mergedEdges,
      assignments: mergedAssignments,
      autoMerged: this.edgesBase.length - conflicts.length,
      conflicts,
      added,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Face merging
  // ────────────────────────────────────────────────────────────────────

  mergeFaces(mapOurs, mapTheirs, inverseOurs, inverseTheirs) {
    const merged = [];
    const conflicts = [];
    const added = [];

    // Simple approach: if base face exists in both ours/theirs with same vertices, merge
    for (let i = 0; i < this.facesBase.length; i++) {
      const baseFace = this.facesBase[i];

      // Try to find matching face in ours
      let oursFace = null;
      let oursIdx = -1;
      for (let j = 0; j < this.facesOurs.length; j++) {
        const f = this.facesOurs[j];
        if (this.faceSignature(f) === this.faceSignature(baseFace.map(v => mapOurs.has(v) ? mapOurs.get(v) : v))) {
          oursFace = f;
          oursIdx = j;
          break;
        }
      }

      // Try to find matching face in theirs
      let theirsFace = null;
      let theirsIdx = -1;
      for (let j = 0; j < this.facesTheirs.length; j++) {
        const f = this.facesTheirs[j];
        if (this.faceSignature(f) === this.faceSignature(baseFace.map(v => mapTheirs.has(v) ? mapTheirs.get(v) : v))) {
          theirsFace = f;
          theirsIdx = j;
          break;
        }
      }

      if (!oursFace && !theirsFace) {
        // Not in either - keep base
        merged.push([...baseFace]);
      } else if (oursFace && !theirsFace) {
        // Only in ours
        merged.push(oursFace.map(v => mapOurs.has(v) ? mapOurs.get(v) : v));
      } else if (!oursFace && theirsFace) {
        // Only in theirs
        merged.push(theirsFace.map(v => mapTheirs.has(v) ? mapTheirs.get(v) : v));
      } else {
        // In both - check if same
        const oursSig = this.faceSignature(oursFace);
        const theirsSig = this.faceSignature(theirsFace);
        if (oursSig === theirsSig) {
          merged.push(oursFace.map(v => mapOurs.has(v) ? mapOurs.get(v) : v));
        } else {
          // Different vertices - conflict (use ours)
          conflicts.push({
            indexBase: i,
            indexOurs: oursIdx,
            indexTheirs: theirsIdx,
            faceBase: baseFace,
            faceOurs: oursFace,
            faceTheirs: theirsFace,
          });
          merged.push(oursFace.map(v => mapOurs.has(v) ? mapOurs.get(v) : v));
        }
      }
    }

    return {
      faces: merged,
      autoMerged: this.facesBase.length - conflicts.length,
      conflicts,
      added,
    };
  }

  faceSignature(face) {
    return [...face].sort((a, b) => a - b).join(',');
  }

  // ────────────────────────────────────────────────────────────────────
  // Metadata merging
  // ───────────────────────────────────────────────────────────────────-

  mergeMeta() {
    // Simple strategy: ours wins for conflicting metadata
    const result = { ...this.base };
    const skip = new Set([
      'vertices_coords', 'edges_vertices', 'edges_assignment',
      'faces_vertices', 'edges_foldAngle', 'faceOrders',
    ]);

    for (const key of Object.keys(this.ours)) {
      if (skip.has(key)) continue;
      const baseVal = this.base[key];
      const oursVal = this.ours[key];
      const theirsVal = this.theirs[key];

      if (JSON.stringify(oursVal) === JSON.stringify(theirsVal)) {
        result[key] = oursVal;
      } else if (JSON.stringify(oursVal) === JSON.stringify(baseVal)) {
        result[key] = theirsVal;
      } else if (JSON.stringify(theirsVal) === JSON.stringify(baseVal)) {
        result[key] = oursVal;
      }
      // If both differ from base and each other, keep ours (conflict)
    }

    return result;
  }

  // ────────────────────────────────────────────────────────────────────
  // Build result
  // ───────────────────────────────────────────────────────────────────-

  buildMergedFOLD(vertices, edges, assignments, faces, meta) {
    return {
      ...meta,
      vertices_coords: vertices,
      edges_vertices: edges,
      edges_assignment: assignments,
      faces_vertices: faces,
      file_creator: `${this.base.file_creator || 'origami-fold'} + 3-way merge (v2.42)`,
      frame_title: 'Merged',
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Math
  // ───────────────────────────────────────────────────────────────────-

  dist(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
}

// ────────────────────────────────────────────────────────────────────
// Renderers
// ───────────────────────────────────────────────────────────────────-

/**
 * Human-readable merge report
 */
function renderText(result) {
  const lines = [];
  lines.push('═'.repeat(70));
  lines.push('FOLD 3-Way Merge');
  lines.push('═'.repeat(70));
  lines.push('');

  // Stats
  const s = result.stats;
  lines.push('Summary:');
  lines.push(`  Vertices: ${s.verticesAutoMerged} auto-merged, ${s.verticesConflict} conflict(s), ${s.verticesAdded} added`);
  lines.push(`  Edges:    ${s.edgesAutoMerged} auto-merged, ${s.edgesConflict} conflict(s), ${s.edgesAdded} added`);
  lines.push(`  Faces:    ${s.facesAutoMerged} auto-merged, ${s.facesConflict} conflict(s), ${s.facesAdded} added`);
  lines.push('');

  // Conflicts
  if (result.conflicts.length > 0) {
    lines.push('⚠️  CONFLICTS:');
    for (const c of result.conflicts) {
      if (c.type === 'vertex') {
        lines.push(`  Vertex [${c.indexBase}]:`);
        lines.push(`    Base:    ${fmt(c.base)}`);
        lines.push(`    Ours:   ${fmt(c.ours)} (Δ=${fmtDelta(c.oursDelta)})`);
        lines.push(`    Theirs: ${fmt(c.theirs)} (Δ=${fmtDelta(c.theirsDelta)})`);
      } else if (c.type === 'edge') {
        lines.push(`  Edge [${c.indexBase}]:`);
        lines.push(`    Base:    [${c.assignmentBase}]`);
        lines.push(`    Ours:   [${c.assignmentOurs}]`);
        lines.push(`    Theirs: [${c.assignmentTheirs}]`);
      }
    }
    lines.push('');
  }

  // Result
  lines.push(`✓ Merged FOLD created with ${result.merged.vertices_coords.length} vertices`);
  lines.push('═'.repeat(70));

  return lines.join('\n');
}

/**
 * JSON output for machine parsing
 */
function renderJSON(result) {
  return JSON.stringify(result, null, 2);
}

function fmt(v) {
  if (!v) return '?';
  return `(${v.map(x => Number(x).toFixed(3)).join(', ')})`;
}

function fmtDelta(d) {
  if (!d) return '(0, 0, 0)';
  return `(${d.map(x => Number(x).toFixed(3)).join(', ')})`;
}

module.exports = { FoldMerge, renderText, renderJSON };
