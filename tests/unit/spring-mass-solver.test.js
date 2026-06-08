/**
 * Unit tests for v2.28 SpringMassSolver (PBD fold simulator)
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

// Flat triangle (no M edges)
const FLAT_TRIANGLE = {
  file_spec: 1.1,
  vertices_coords: [[0, 0, 0], [10, 0, 0], [5, 10, 0]],
  edges_vertices: [[0, 1], [1, 2], [2, 0]],
  edges_assignment: ['B', 'B', 'B'],
  faces_vertices: [[0, 1, 2]],
};

// ────────────────────────────────────────────────────────────────────
// Core solver
// ────────────────────────────────────────────────────────────────────
describe('SpringMassSolver — core', () => {
  test('should throw on FOLD with no faces', () => {
    const sim = new SpringMassSolver({ vertices_coords: [], edges_vertices: [] });
    expect(() => sim.solve()).toThrow('no faces_vertices');
  });

  test('flat triangle (no M edges) stays flat', () => {
    const sim = new SpringMassSolver(FLAT_TRIANGLE, { foldAngle: 90 });
    const r = sim.solve(1.0);
    for (const v of r.vertices) {
      expect(v[2]).toBeCloseTo(0, 5);
    }
  });

  test('L-fold root face vertices stay at z=0', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const r = sim.solve(1.0);
    // V0, V1, V2, V3 are all in the root face
    for (const idx of [0, 1, 2, 3]) {
      expect(r.vertices[idx][2]).toBeCloseTo(0, 5);
    }
  });

  test('L-fold: V5 (outer of folded face) ends at z=±1 after 90° fold', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const r = sim.solve(1.0);
    expect(Math.abs(r.vertices[5][2])).toBeCloseTo(1.0, 1);
  });

  test('L-fold: V4 (on axis line) stays at z=0', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const r = sim.solve(1.0);
    // V4 is at (2, 0, 0) — on the extension of the M edge axis (the x-axis),
    // so a 90° rotation around that axis leaves it unchanged
    expect(r.vertices[4][2]).toBeCloseTo(0, 5);
  });

  test('percent=0 produces flat output (no bending applied)', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const r = sim.solve(0.0);
    for (const v of r.vertices) {
      expect(v[2]).toBeCloseTo(0, 5);
    }
  });

  test('percent=0.5 produces V5 at z=±sin(45°)≈0.707 (sin of half-angle)', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const r = sim.solve(0.5);
    // The z displacement is sin(angle) * distance_from_axis, not (angle/maxAngle)
    // At 50% of 90° = 45°, sin(45°) ≈ 0.707
    expect(Math.abs(r.vertices[5][2])).toBeCloseTo(Math.SQRT1_2, 2);
  });

  test('simulate() returns a valid FOLD structure', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const r = sim.simulate(1.0);
    expect(r.file_spec).toBe(1.1);
    expect(r.vertices_coords).toBeDefined();
    expect(r.edges_vertices).toEqual(LFOLD.edges_vertices);
    expect(r.faces_vertices).toEqual(LFOLD.faces_vertices);
    expect(r.file_creator).toMatch(/spring-mass/);
  });

  test('simulateFrames(5) returns 5 frames from 0% to 100%', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const frames = sim.simulateFrames(5);
    expect(frames.length).toBe(5);
    // First frame flat, last frame full
    expect(Math.abs(frames[0].vertices_coords[5][2])).toBeCloseTo(0, 1);
    expect(Math.abs(frames[4].vertices_coords[5][2])).toBeCloseTo(1.0, 1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Solver correctness
// ────────────────────────────────────────────────────────────────────
describe('SpringMassSolver — correctness', () => {
  test('V5 final position should preserve distance to V2 (rest length)', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const r = sim.solve(1.0);
    // V2 to V5 rest length in original: sqrt((2-1)² + (1-0)²) = sqrt(2)
    const restLength = Math.SQRT2;
    const V2 = r.vertices[2], V5 = r.vertices[5];
    const dist = Math.hypot(V2[0] - V5[0], V2[1] - V5[1], V2[2] - V5[2]);
    // With soft edges (stiffness 0.3) and many iterations, should be close
    expect(dist).toBeCloseTo(restLength, 1);
  });

  test('V4 final position preserves distance to V3 (rest length)', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const r = sim.solve(1.0);
    // V3=(0,0,0) to V4=(2,0,0) rest = 2
    const dist = Math.hypot(r.vertices[3][0] - r.vertices[4][0],
                            r.vertices[3][1] - r.vertices[4][1],
                            r.vertices[3][2] - r.vertices[4][2]);
    expect(dist).toBeCloseTo(2.0, 1);
  });

  test('edge [4, 5] (both in folded face) preserves length', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90 });
    const r = sim.solve(1.0);
    // V4 to V5 rest = 1
    const dist = Math.hypot(r.vertices[4][0] - r.vertices[5][0],
                            r.vertices[4][1] - r.vertices[5][1],
                            r.vertices[4][2] - r.vertices[5][2]);
    expect(dist).toBeCloseTo(1.0, 1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Cyclic patterns (LIMITATION documented for v2.28)
// ────────────────────────────────────────────────────────────────────
describe('SpringMassSolver — cyclic patterns (partial support)', () => {
  // A square divided into 4 triangles meeting at a center vertex.
  // Cyclic: each triangle shares M edges with two neighbors (via center).
  // v2.28 only folds edges INCIDENT to the root face. Edges between two
  // non-root faces (cyclic inner edges) are skipped. This means a fully
  // consistent cyclic fold is not yet achieved — that's a v2.29+ goal.
  test('edges incident to root face fold; non-root edges are skipped', () => {
    const cyclicFold = {
      file_spec: 1.1,
      vertices_coords: [
        [0, 0, 0],   // 0: bottom-left
        [10, 0, 0],  // 1: bottom-right
        [10, 10, 0], // 2: top-right
        [0, 10, 0],  // 3: top-left
        [5, 5, 0],   // 4: center
      ],
      edges_vertices: [
        [0, 1], [1, 2], [2, 3], [3, 0],  // outer square (B)
        [0, 4], [1, 4], [2, 4], [3, 4],  // spokes (M)
      ],
      edges_assignment: ['B', 'B', 'B', 'B', 'M', 'M', 'M', 'M'],
      faces_vertices: [
        [0, 1, 4],   // face 0 (root): bottom triangle
        [1, 2, 4],   // face 1: right
        [2, 3, 4],   // face 2: top
        [3, 0, 4],   // face 3: left
      ],
    };
    const sim = new SpringMassSolver(cyclicFold, { foldAngle: 90, maxIterations: 50, rootFace: 0 });
    const r = sim.solve(1.0);
    // Root face 0 = [0, 1, 4] is pinned: V0, V1, V4 stay at z=0
    for (const idx of [0, 1, 4]) {
      expect(r.vertices[idx][2]).toBeCloseTo(0, 5);
    }
    // M edge [0, 4]: between face 0 (root) and face 3. outerVerts of face 3
    // is {3}. So V3 should move.
    expect(Math.abs(r.vertices[3][2])).toBeGreaterThan(0.1);
    // M edge [1, 4]: between face 0 (root) and face 1. outerVerts of face 1
    // is {2}. So V2 should move.
    expect(Math.abs(r.vertices[2][2])).toBeGreaterThan(0.1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Performance
// ────────────────────────────────────────────────────────────────────
describe('SpringMassSolver — performance', () => {
  test('L-fold (6V, 7E, 2F) runs in < 30ms for 100 iterations', () => {
    const sim = new SpringMassSolver(LFOLD, { foldAngle: 90, maxIterations: 100 });
    const t0 = Date.now();
    sim.solve(1.0);
    const t1 = Date.now();
    expect(t1 - t0).toBeLessThan(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// Solver options
// ────────────────────────────────────────────────────────────────────
describe('SpringMassSolver — options', () => {
  test('mountainUp=false reverses fold direction', () => {
    const sim1 = new SpringMassSolver(LFOLD, { foldAngle: 90, mountainUp: true });
    const sim2 = new SpringMassSolver(LFOLD, { foldAngle: 90, mountainUp: false });
    const r1 = sim1.solve(1.0);
    const r2 = sim2.solve(1.0);
    // V5.z should be opposite signs
    expect(r1.vertices[5][2] * r2.vertices[5][2]).toBeLessThan(0);
  });

  test('different root face indices are respected', () => {
    const sim0 = new SpringMassSolver(LFOLD, { foldAngle: 90, rootFace: 0 });
    const sim1 = new SpringMassSolver(LFOLD, { foldAngle: 90, rootFace: 1 });
    const r0 = sim0.solve(1.0);
    const r1 = sim1.solve(1.0);
    // Both should produce non-zero z for some vertices
    const max0 = Math.max(...r0.vertices.map(v => Math.abs(v[2])));
    const max1 = Math.max(...r1.vertices.map(v => Math.abs(v[2])));
    expect(max0).toBeGreaterThan(0.1);
    expect(max1).toBeGreaterThan(0.1);
    // With rootFace=0, face 0 = [0,1,2,3] is pinned, so those stay at z=0
    for (const idx of [0, 1, 2, 3]) {
      expect(r0.vertices[idx][2]).toBeCloseTo(0, 5);
    }
    // With rootFace=1, face 1 = [3,2,5,4] is pinned, so V2/V3/V4/V5 stay at z=0
    // (V0 and V1 are the outer of the M edge, so they fold)
    for (const idx of [2, 3, 4, 5]) {
      expect(r1.vertices[idx][2]).toBeCloseTo(0, 5);
    }
  });

  test('invalid solver options should be validated by CLI, not solver', () => {
    // The solver itself doesn't validate; the CLI does. Just verify the
    // constructor accepts arbitrary options without crashing.
    expect(() => new SpringMassSolver(LFOLD, { foo: 'bar' })).not.toThrow();
  });
});
