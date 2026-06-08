/**
 * Unit tests for v2.31 FOLD Diff
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { FoldDiff, renderText, renderHTML } = require('../../src/utils/fold-diff');
const { registerDiffCommand } = require('../../src/commands/fold-diff');

const TMP = os.tmpdir();

// ────────────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────────────

const TETRA = {
  file_spec: 1.1,
  frame_title: 'Tetrahedron',
  vertices_coords: [[0, 0, 0], [10, 0, 0], [5, 10, 0], [5, 5, 5]],
  edges_vertices: [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]],
  edges_assignment: ['B', 'B', 'B', 'M', 'M', 'V'],
  faces_vertices: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
};

// Same tetrahedron but with V1 moved 0.5mm and edge [0,3] reassigned M→V
const TETRA_MODIFIED = {
  file_spec: 1.1,
  frame_title: 'Tetrahedron (modified)',
  vertices_coords: [[0, 0, 0], [10.5, 0, 0], [5, 10, 0], [5, 5, 5]],
  edges_vertices: [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]],
  edges_assignment: ['B', 'B', 'B', 'V', 'M', 'V'],
  faces_vertices: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
};

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
beforeEach(() => {
  console.log.mockClear();
  console.error.mockClear();
});

// ────────────────────────────────────────────────────────────────────
// Core diff engine
// ────────────────────────────────────────────────────────────────────
describe('FoldDiff — core', () => {
  test('identical files produce no changes', () => {
    const d = new FoldDiff(TETRA, TETRA);
    const r = d.diff();
    expect(r.stats.verticesAdded).toBe(0);
    expect(r.stats.verticesRemoved).toBe(0);
    expect(r.stats.verticesMoved).toBe(0);
    expect(r.stats.verticesUnchanged).toBe(4);
    expect(r.stats.edgesModified).toBe(0);
    expect(r.stats.facesModified).toBe(0);
    expect(r.stats.metaChanges).toBe(0);
  });

  test('vertex match: V1 moved 0.5mm with tolerance 1.0 + moveThreshold 0.5 → unchanged', () => {
    // V1 (0.5mm) matches with tolerance 1.0; moveThreshold 0.5 hides the move
    // → classified as unchanged
    const d = new FoldDiff(TETRA, TETRA_MODIFIED, { vertexTolerance: 1.0, moveThreshold: 0.5 });
    const r = d.diff();
    expect(r.stats.verticesUnchanged).toBe(4);
    expect(r.stats.verticesMoved).toBe(0);
  });

  test('vertex match: V1 moved 0.5mm with tolerance 0.6 → moved (matched but displaced)', () => {
    // tolerance 0.6: V1 (0.5mm away) is MATCHED (0.5 < 0.6) but reported as
    // "moved" because distance (0.5) > moveThreshold (0).
    const d = new FoldDiff(TETRA, TETRA_MODIFIED, { vertexTolerance: 0.6 });
    const r = d.diff();
    expect(r.stats.verticesMoved).toBe(1);
    expect(r.vertices.moved[0].indexA).toBe(1);
    expect(r.vertices.moved[0].distance).toBeCloseTo(0.5, 5);
  });

  test('edge assignment change M→V is captured', () => {
    const d = new FoldDiff(TETRA, TETRA_MODIFIED, { vertexTolerance: 1.0 });
    const r = d.diff();
    expect(r.stats.edgesModified).toBe(1);
    expect(r.edges.modified[0].assignmentA).toBe('M');
    expect(r.edges.modified[0].assignmentB).toBe('V');
  });

  test('metadata change (frame_title) is captured', () => {
    const d = new FoldDiff(TETRA, TETRA_MODIFIED, { vertexTolerance: 1.0 });
    const r = d.diff();
    expect(r.stats.metaChanges).toBe(1);
    expect(r.meta.changes[0].key).toBe('frame_title');
  });
});

// ────────────────────────────────────────────────────────────────────
// Vertex add/remove
// ────────────────────────────────────────────────────────────────────
describe('FoldDiff — add/remove', () => {
  test('new vertex in B → reported as added', () => {
    const B = {
      ...TETRA,
      vertices_coords: [...TETRA.vertices_coords, [100, 100, 0]],
      edges_vertices: [...TETRA.edges_vertices, [3, 4]],
    };
    const d = new FoldDiff(TETRA, B);
    const r = d.diff();
    expect(r.stats.verticesAdded).toBe(1);
    expect(r.vertices.added[0].indexB).toBe(4);
    expect(r.vertices.added[0].coords).toEqual([100, 100, 0]);
  });

  test('removed vertex in A → reported as removed', () => {
    const A = {
      ...TETRA,
      vertices_coords: [...TETRA.vertices_coords, [100, 100, 0]],
      edges_vertices: [...TETRA.edges_vertices, [3, 4]],
    };
    const d = new FoldDiff(A, TETRA);
    const r = d.diff();
    expect(r.stats.verticesRemoved).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Exact mode
// ────────────────────────────────────────────────────────────────────
describe('FoldDiff — exact mode', () => {
  test('exact mode matches by index, but still detects moved positions', () => {
    // In exact mode, vertices are matched by INDEX (no spatial search).
    // But the diffVertices check still uses vertexTolerance to classify
    // matched vertices as moved/unchanged. So V1 (0.5mm shift) is reported
    // as "moved" with the standard default tolerance (1e-3).
    const d = new FoldDiff(TETRA, TETRA_MODIFIED, { exact: true });
    const r = d.diff();
    expect(r.stats.verticesMoved).toBe(1);   // V1 has different position
    expect(r.stats.verticesUnchanged).toBe(3);  // V0, V2, V3 unchanged
  });
});

// ────────────────────────────────────────────────────────────────────
// Renderers
// ────────────────────────────────────────────────────────────────────
describe('renderText', () => {
  test('produces a non-empty human-readable string', () => {
    const d = new FoldDiff(TETRA, TETRA_MODIFIED, { vertexTolerance: 0.001 });
    const r = d.diff();
    const text = renderText(r);
    expect(text).toMatch(/FOLD Diff/);
    expect(text).toMatch(/Summary:/);
    expect(text.length).toBeGreaterThan(100);
  });

  test('text output includes "moved" and "modified" markers', () => {
    // Use tolerance 0.6 so V1 (0.5mm) is matched AND reported as moved
    const d = new FoldDiff(TETRA, TETRA_MODIFIED, { vertexTolerance: 0.6 });
    const r = d.diff();
    const text = renderText(r);
    expect(text).toMatch(/moved by/);     // V1 moved
    expect(text).toMatch(/M → V/);          // edge 3 reassigned
    expect(text).toMatch(/frame_title/);    // metadata
  });
});

describe('renderHTML', () => {
  test('produces a self-contained HTML document', () => {
    const d = new FoldDiff(TETRA, TETRA_MODIFIED, { vertexTolerance: 0.001 });
    const r = d.diff();
    const html = renderHTML(r, { title: 'Test Diff' });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('Test Diff');
    expect(html).toContain('<table>');
  });

  test('XSS-safe: escapes HTML in metadata', () => {
    const evil = { ...TETRA, frame_title: '<script>alert(1)</script>' };
    const d = new FoldDiff(TETRA, evil);
    const r = d.diff();
    const html = renderHTML(r);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  test('shows "No changes detected" when identical', () => {
    const d = new FoldDiff(TETRA, TETRA);
    const r = d.diff();
    const html = renderHTML(r);
    expect(html).toContain('No changes detected');
  });
});

// ────────────────────────────────────────────────────────────────────
// CLI registration
// ────────────────────────────────────────────────────────────────────
describe('diff command registration', () => {
  function makeFakeProgram() {
    const captured = {};
    return {
      captured,
      command(name) {
        const cmd = {
          name, options: [], _action: null, description: '',
          option(flag) { this.options.push(flag); return this; },
          description_(d) { this.description = d; return this; },
          action(fn) { this._action = fn; return this; },
        };
        cmd.description = cmd.description_;
        captured[name] = cmd;
        return cmd;
      },
    };
  }

  test('should register diff <old> <new> with all expected options', () => {
    const program = makeFakeProgram();
    registerDiffCommand(program);
    const cmd = program.captured['diff <old> <new>'];
    expect(cmd).toBeDefined();
    expect(cmd.options).toContain('--json');
    expect(cmd.options).toContain('--html <file>');
    expect(cmd.options).toContain('--exact');
    expect(cmd.options).toContain('--tolerance <mm>');
    expect(cmd.options).toContain('--exit-code');
  });
});

// ────────────────────────────────────────────────────────────────────
// CLI end-to-end
// ────────────────────────────────────────────────────────────────────
describe('diff CLI end-to-end', () => {
  const { spawn } = require('child_process');
  const CLI_PATH = path.join(__dirname, '../../src/index.js');

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

  test('identical files produce "Total: 0 changes"', async () => {
    const a = path.join(TMP, 'diff-test-a.fold');
    const b = path.join(TMP, 'diff-test-b.fold');
    fs.writeFileSync(a, JSON.stringify(TETRA));
    fs.writeFileSync(b, JSON.stringify(TETRA));
    try {
      const r = await cli(['diff', a, b]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toMatch(/Total: 0 changes/);
    } finally {
      if (fs.existsSync(a)) fs.unlinkSync(a);
      if (fs.existsSync(b)) fs.unlinkSync(b);
    }
  });

  test('changed files with --exit-code exit 1', async () => {
    const a = path.join(TMP, 'diff-test-a.fold');
    const b = path.join(TMP, 'diff-test-b.fold');
    fs.writeFileSync(a, JSON.stringify(TETRA));
    fs.writeFileSync(b, JSON.stringify(TETRA_MODIFIED));
    try {
      const r = await cli(['diff', a, b, '--exit-code', '--tolerance', '0.001']);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toMatch(/Total: \d+ change/);
    } finally {
      if (fs.existsSync(a)) fs.unlinkSync(a);
      if (fs.existsSync(b)) fs.unlinkSync(b);
    }
  });

  test('--json produces parseable JSON', async () => {
    const a = path.join(TMP, 'diff-test-a.fold');
    const b = path.join(TMP, 'diff-test-b.fold');
    fs.writeFileSync(a, JSON.stringify(TETRA));
    fs.writeFileSync(b, JSON.stringify(TETRA_MODIFIED));
    try {
      // Use tolerance 0.6 so V1 (0.5mm) is matched AND reported as moved
      const r = await cli(['diff', a, b, '--json', '--tolerance', '0.6']);
      const parsed = JSON.parse(r.stdout);
      expect(parsed).toHaveProperty('stats');
      expect(parsed).toHaveProperty('vertices');
      expect(parsed).toHaveProperty('edges');
      expect(parsed).toHaveProperty('faces');
      expect(parsed.stats.verticesMoved).toBe(1);  // V1 moved 0.5mm
    } finally {
      if (fs.existsSync(a)) fs.unlinkSync(a);
      if (fs.existsSync(b)) fs.unlinkSync(b);
    }
  });

  test('--html writes a self-contained HTML file', async () => {
    const a = path.join(TMP, 'diff-test-a.fold');
    const b = path.join(TMP, 'diff-test-b.fold');
    const html = path.join(TMP, 'diff-test.html');
    fs.writeFileSync(a, JSON.stringify(TETRA));
    fs.writeFileSync(b, JSON.stringify(TETRA_MODIFIED));
    try {
      const r = await cli(['diff', a, b, '--html', html]);
      expect(fs.existsSync(html)).toBe(true);
      const content = fs.readFileSync(html, 'utf8');
      expect(content).toMatch(/^<!DOCTYPE html>/);
      expect(content).toContain('op-added');
      expect(content).toContain('op-modified');
    } finally {
      if (fs.existsSync(a)) fs.unlinkSync(a);
      if (fs.existsSync(b)) fs.unlinkSync(b);
      if (fs.existsSync(html)) fs.unlinkSync(html);
    }
  });

  test('missing file → exit 2', async () => {
    const r = await cli(['diff', '/nonexistent-a.fold', '/nonexistent-b.fold']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/File not found/);
  });
});
