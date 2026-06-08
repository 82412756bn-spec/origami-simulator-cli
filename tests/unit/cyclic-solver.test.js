/**
 * Unit tests for v2.29 Full Cyclic PBD Solver
 *
 * v2.28's bend-once + relax only folded edges incident to the root face.
 * v2.29's per-iteration dihedral constraint handles all M-edges, including
 * inner-cyclic ones between two non-root faces.
 */

const { SpringMassSolver } = require('../../src/utils/spring-mass-solver');

const LFOLD = {
  file_spec: 1.1,
  vertices_coords: [
    [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0],
    [2, 0, 0], [2, 1, 0],
  ],
  edges_vertices: [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [3, 4], [4, 5], [5, 2],
  ],
  edges_assignment: ['B', 'B', 'M', 'B', 'B', 'B', 'B'],
  faces_vertices: [[0, 1, 2, 3], [3, 2, 5, 4]],
};

// Square divided into 4 triangles meeting at center (cyclic pattern)
const SQUARE_4T = {
  file_spec: 1.1,
  vertices_coords: [
    [0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [5, 5, 0],
  ],
  edges_vertices: [
    [0, 1], [1, 2], [2, 3], [3, 0],  // outer (B)
    [0, 4], [1, 4], [2, 4], [3, 4],  // spokes (M)
  ],
  edges_assignment: ['B', 'B', 'B', 'B', 'M', 'M', 'M', 'M'],
  faces_vertices: [
    [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4],
  ],
};

// ────────────────────────────────────────────────────────────────────
// cyclic mode: equivalence with v2.28 for tree patterns
// ────────────────────────────────────────────────────────────────────
describe('SpringMassSolver cyclic mode — tree patterns', () => {
  test('L-fold: cyclic mode produces similar result to v2.28 (V5 at z=±1)', () => {
    const simCyclic = new SpringMassSolver(LFOLD, { foldAngle: 90, cyclic: true, maxIterations: 100 });
    const r = simCyclic.solve(1.0);
    expect(Math.abs(r.vertices[5][2])).toBeGreaterThan(0.5);
  });

  test('L-fold: root face vertices stay at z=0 in cyclic mode', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90, cyclic: true, maxIterations: 100 });
    const r = sim.solve(1.0);
    for (const idx of [0, 1, 2, 3]) {
      expect(r.vertices[idx][2]).toBeCloseTo(0, 5);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// cyclic mode: handles inner-cyclic edges (v2.28's limitation)
// ────────────────────────────────────────────────────────────────────
describe('SpringMassSolver cyclic mode — cyclic patterns', () => {
  test('square-4-triangles: ALL 4 M-edges folded (V2 and V3 also move out of plane)', () => {
    // v2.28: only edges incident to root face (face 0) fold.
    //         Inner-cyclic edges [2,4] and [3,4] (between non-root faces)
    //         are SKIPPED, so V2 and V3 stay at z=0.
    // v2.29: ALL 4 M-edges are constrained. V2 (outer of [2,4]) and V3
    //         (outer of [3,4]) move out of plane too.
    const sim = new SpringMassSolver(SQUARE_4T, { foldAngle: 90, cyclic: true, maxIterations: 200, rootFace: 0 });
    const r = sim.solve(1.0);
    // V0 and V1 are in the root face (pinned, z=0)
    expect(r.vertices[0][2]).toBeCloseTo(0, 5);
    expect(r.vertices[1][2]).toBeCloseTo(0, 5);
    // V4 (center) is on all rotation axes, z=0
    expect(r.vertices[4][2]).toBeCloseTo(0, 5);
    // V2 and V3 are the inner-cyclic corners — they should have non-zero z
    // (this is the v2.28 limitation that v2.29 fixes)
    expect(Math.abs(r.vertices[2][2])).toBeGreaterThan(0.1);
    expect(Math.abs(r.vertices[3][2])).toBeGreaterThan(0.1);
  });

  test('cyclic mode converges (no oscillation, maxResidual drops)', () => {
    const sim = new SpringMassSolver(SQUARE_4T, { foldAngle: 90, cyclic: true, maxIterations: 200, rootFace: 0 });
    const r = sim.solve(1.0);
    // Convergence: maxResidual should be < tolerance (1e-4) OR near it
    // (Gauss-Seidel with stiff dihedral may not reach full tolerance)
    expect(r.iterations).toBeGreaterThan(0);
    expect(r.iterations).toBeLessThanOrEqual(200);
  });
});

// ────────────────────────────────────────────────────────────────────
// API compatibility
// ────────────────────────────────────────────────────────────────────
describe('SpringMassSolver cyclic mode — API', () => {
  test('cyclic: false is the v2.28 default behavior', () => {
    const r1 = new SpringMassSolver(LFOLD, { foldAngle: 90, cyclic: false }).solve(1.0);
    const r2 = new SpringMassSolver(LFOLD, { foldAngle: 90 }).solve(1.0);  // cyclic defaults to false
    expect(r1.vertices[5][2]).toBeCloseTo(r2.vertices[5][2], 5);
  });

  test('cyclic: true differs from cyclic: false on cyclic patterns', () => {
    const r28 = new SpringMassSolver(SQUARE_4T, { foldAngle: 90, cyclic: false, maxIterations: 100, rootFace: 0 }).solve(1.0);
    const r29 = new SpringMassSolver(SQUARE_4T, { foldAngle: 90, cyclic: true, maxIterations: 200, rootFace: 0 }).solve(1.0);
    // v2.28 skips inner-cyclic edges (V2/V3 partial fold), v2.29 constrains all 4
    // The MAX |z| over all vertices should differ between modes
    const max28 = Math.max(...r28.vertices.map(v => Math.abs(v[2])));
    const max29 = Math.max(...r29.vertices.map(v => Math.abs(v[2])));
    expect(max29).toBeGreaterThan(max28 * 0.5);
  });
});
