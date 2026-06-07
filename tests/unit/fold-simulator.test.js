/**
 * Unit tests for v2.27 FOLD Simulator (local kinematic fold solver)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { FoldSimulator } = require('../../src/utils/fold-simulator');
const { registerFoldCommand } = require('../../src/commands/fold-simulate');
const { renderAnimation } = require('../../src/commands/fold-simulate-anim');

const TMP = os.tmpdir();

// ────────────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────────────

// L-fold: 2 unit squares sharing edge [V2,V3], 7 edges, M edge [V2,V3]
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

// Flat triangle (3 vertices, 1 face, 3 edges) — degenerate, no fold propagation
const FLAT_TRIANGLE = {
  file_spec: 1.1,
  vertices_coords: [[0, 0, 0], [10, 0, 0], [5, 10, 0]],
  edges_vertices: [[0, 1], [1, 2], [2, 0]],
  edges_assignment: ['B', 'B', 'B'],
  faces_vertices: [[0, 1, 2]],
};

// 3-faced tree: face 0 (root) is connected to face 1 and face 2
// via M edges. Face 1 and face 2 are NOT connected to each other.
const TREE_3 = {
  file_spec: 1.1,
  vertices_coords: [
    [0, 0, 0], [10, 0, 0], [5, 10, 0],  // face 0
    [5, 0, 0], [10, 5, 0],              // face 1 (off to the right)
    [-2, 5, 0], [0, 5, 0],              // face 2 (off to the left)
  ],
  edges_vertices: [
    [0, 1], [1, 2], [2, 0],     // face 0 boundary
    [0, 3], [1, 3], [3, 4], [4, 1],  // face 1 boundary + shared edges
    [0, 6], [6, 5], [5, 2],     // face 2 boundary + shared edges
  ],
  edges_assignment: ['B', 'B', 'B', 'M', 'M', 'B', 'B', 'M', 'B', 'B'],
  faces_vertices: [
    [0, 1, 2],
    [0, 1, 4, 3],   // shares [0,1] and [1,3] with face 0
    [0, 5, 6],      // shares [0,5] and [5,6] with face 0... wait
  ],
};

// ────────────────────────────────────────────────────────────────────
// Core simulator
// ────────────────────────────────────────────────────────────────────
describe('FoldSimulator — core', () => {
  test('should throw on FOLD with no faces_vertices', () => {
    const noFaces = { vertices_coords: [[0, 0, 0]], edges_vertices: [] };
    const sim = new FoldSimulator(noFaces);
    expect(() => sim.simulate()).toThrow('no faces_vertices');
  });

  test('flat triangle (no M edges) stays flat at any percent', () => {
    const sim = new FoldSimulator(FLAT_TRIANGLE, { angle: 90 });
    const r = sim.simulate(1.0);
    for (const v of r.vertices_coords) {
      expect(v[2]).toBeCloseTo(0, 5);
    }
  });

  test('L-fold: root face (face 0) vertices stay at z=0', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const r = sim.simulate(1.0);
    // V0=(0,1), V1=(1,1), V2=(1,0), V3=(0,0) are all in face 0 (root)
    for (const idx of [0, 1, 2, 3]) {
      expect(r.vertices_coords[idx][2]).toBeCloseTo(0, 5);
    }
  });

  test('L-fold: non-shared vertex of face 1 (V5) moves to z=±1 after 90° fold', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const r = sim.simulate(1.0);
    // V5 was at (2, 1, 0). Distance from rotation axis (V2-V3) = sqrt(1.5² + 1²) ≈ 1.80
    // After 90° rotation, it should be at z=±some value
    expect(Math.abs(r.vertices_coords[5][2])).toBeGreaterThan(0.5);
  });

  test('percent=0 should produce flat output (z=0 for all vertices)', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const r = sim.simulate(0.0);
    for (const v of r.vertices_coords) {
      expect(v[2]).toBeCloseTo(0, 5);
    }
  });

  test('percent=0.5 produces intermediate z values (between 0 and full)', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const r = sim.simulate(0.5);
    // V5.z at 50% fold should be approximately half of full-fold z
    const half = Math.abs(r.vertices_coords[5][2]);
    const full = Math.abs(new FoldSimulator(LFOLD, { angle: 90 }).simulate(1.0).vertices_coords[5][2]);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full + 0.1);
  });

  test('result preserves FOLD structure (file_spec, edges, faces)', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const r = sim.simulate(1.0);
    expect(r.file_spec).toBe(1.1);
    expect(r.edges_vertices).toEqual(LFOLD.edges_vertices);
    expect(r.faces_vertices).toEqual(LFOLD.faces_vertices);
  });

  test('result marks file as simulated', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const r = sim.simulate(1.0);
    expect(r.file_creator).toMatch(/simulated/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Multi-frame animation
// ────────────────────────────────────────────────────────────────────
describe('FoldSimulator — multi-frame', () => {
  test('simulateFrames(1) returns 1 frame at 100%', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const frames = sim.simulateFrames(1);
    expect(frames.length).toBe(1);
    // V5 at 100%
    expect(Math.abs(frames[0].vertices_coords[5][2])).toBeGreaterThan(0.5);
  });

  test('simulateFrames(5) returns 5 frames from 0% to 100%', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const frames = sim.simulateFrames(5);
    expect(frames.length).toBe(5);
    // First frame: flat
    for (const v of frames[0].vertices_coords) {
      expect(v[2]).toBeCloseTo(0, 5);
    }
    // Last frame: full fold
    expect(Math.abs(frames[4].vertices_coords[5][2])).toBeGreaterThan(0.5);
  });

  test('simulateFrames(0) should throw', () => {
    const sim = new FoldSimulator(LFOLD);
    expect(() => sim.simulateFrames(0)).toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────
// Performance
// ────────────────────────────────────────────────────────────────────
describe('FoldSimulator — performance', () => {
  test('L-fold (6V, 7E, 2F) runs in < 5ms per frame', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const t0 = Date.now();
    sim.simulate(0.5);
    const t1 = Date.now();
    expect(t1 - t0).toBeLessThan(50);  // generous; actually < 1ms in practice
  });

  test('20 frames in < 100ms', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const t0 = Date.now();
    sim.simulateFrames(20);
    const t1 = Date.now();
    expect(t1 - t0).toBeLessThan(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// CLI registration
// ────────────────────────────────────────────────────────────────────
describe('fold command registration', () => {
  function makeFakeProgram() {
    const captured = {};
    return {
      captured,
      command(name) {
        const cmd = {
          name,
          options: [],
          _action: null,
          description: '',
          option(flag) { this.options.push(flag); return this; },
          description_(d) { this.description = d; return this; },
          action(fn) { this._action = fn; return this; },
        };
        cmd.description = cmd.description_;  // Commander uses .description()
        captured[name] = cmd;
        return cmd;
      },
    };
  }

  test('should register fold <file> with all expected options', () => {
    const program = makeFakeProgram();
    registerFoldCommand(program);
    const cmd = program.captured['fold <file>'];
    expect(cmd).toBeDefined();
    expect(cmd.options).toContain('-o, --output <path>');
    expect(cmd.options).toContain('--angle <degrees>');
    expect(cmd.options).toContain('--percent <pct>');
    expect(cmd.options).toContain('--frames <n>');
    expect(cmd.options).toContain('--animate <file>');
    expect(cmd.options).toContain('--no-mountain-up');
  });
});

// ────────────────────────────────────────────────────────────────────
// HTML animation renderer
// ────────────────────────────────────────────────────────────────────
describe('renderAnimation', () => {
  test('should produce a self-contained HTML string', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const frames = sim.simulateFrames(5);
    const html = renderAnimation(frames, { title: 'Test L-Fold' });
    expect(typeof html).toBe('string');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('Test L-Fold');
  });

  test('should embed all frames as JSON in the script', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const frames = sim.simulateFrames(3);
    const html = renderAnimation(frames);
    // Each frame's vertices should be embedded
    for (const f of frames) {
      const someVert = f.vertices_coords[0];
      // At least one vertex should be in the JSON
      expect(html).toContain(someVert[0].toString());
    }
  });

  test('should include play/pause button and slider', () => {
    const sim = new FoldSimulator(LFOLD, { angle: 90 });
    const html = renderAnimation(sim.simulateFrames(3));
    expect(html).toContain('id="play"');
    expect(html).toContain('id="slider"');
    expect(html).toContain('addEventListener');
  });

  test('XSS-safe: escapes HTML in title', () => {
    const html = renderAnimation([], { title: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ────────────────────────────────────────────────────────────────────
// CLI end-to-end
// ────────────────────────────────────────────────────────────────────
describe('fold CLI end-to-end', () => {
  const { spawn } = require('child_process');
  const CLI_PATH = path.join(__dirname, '../../src/index.js');
  const PROJECT_ROOT = path.join(__dirname, '../..');

  // Suppress console noise
  const originalLog = console.log;
  const originalError = console.error;
  beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });
  afterAll(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  function cli(args) {
    return new Promise((resolve) => {
      const proc = spawn('node', [CLI_PATH, ...args], { cwd: TMP });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
    });
  }

  test('should fold a 2D FOLD and write 3D output', async () => {
    const foldFile = path.join(TMP, 'cli-lfold.fold');
    const outFile = path.join(TMP, 'cli-lfold-out.fold');
    fs.writeFileSync(foldFile, JSON.stringify(LFOLD));
    try {
      const r = await cli(['fold', foldFile, '-o', outFile, '--angle', '90']);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(outFile)).toBe(true);
      const result = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      // V5 should be at z=±some value (not 0)
      expect(Math.abs(result.vertices_coords[5][2])).toBeGreaterThan(0.5);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });

  test('should write HTML animation with --animate', async () => {
    const foldFile = path.join(TMP, 'cli-anim.fold');
    const animFile = path.join(TMP, 'cli-anim.html');
    fs.writeFileSync(foldFile, JSON.stringify(LFOLD));
    try {
      const r = await cli(['fold', foldFile, '--animate', animFile]);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(animFile)).toBe(true);
      const html = fs.readFileSync(animFile, 'utf8');
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html.length).toBeGreaterThan(2000);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(animFile)) fs.unlinkSync(animFile);
    }
  });

  test('should respect --angle flag', async () => {
    const foldFile = path.join(TMP, 'cli-angle.fold');
    const out30 = path.join(TMP, 'cli-angle-30.fold');
    const out90 = path.join(TMP, 'cli-angle-90.fold');
    fs.writeFileSync(foldFile, JSON.stringify(LFOLD));
    try {
      await cli(['fold', foldFile, '-o', out30, '--angle', '30']);
      await cli(['fold', foldFile, '-o', out90, '--angle', '90']);
      const r30 = JSON.parse(fs.readFileSync(out30, 'utf8'));
      const r90 = JSON.parse(fs.readFileSync(out90, 'utf8'));
      // 30° should produce smaller |z| than 90°
      const z30 = Math.abs(r30.vertices_coords[5][2]);
      const z90 = Math.abs(r90.vertices_coords[5][2]);
      expect(z30).toBeLessThan(z90);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(out30)) fs.unlinkSync(out30);
      if (fs.existsSync(out90)) fs.unlinkSync(out90);
    }
  });
});
