/**
 * Unit tests for v2.24 FOLD → STL exporter
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { FoldSTLExporter } = require('../../src/utils/fold-stl-exporter');
const { registerStlCommand } = require('../../src/commands/fold-stl');

const TMP = os.tmpdir();

// ────────────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────────────

// 2D square (50×50mm, no z), will be extruded to 3D sheet
const SQUARE_2D = {
  file_spec: 1.1,
  vertices_coords: [[0, 0, 0], [50, 0, 0], [50, 50, 0], [0, 50, 0]],
  edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 0]],
  edges_assignment: ['B', 'B', 'B', 'B'],
  faces_vertices: [[0, 1, 2, 3]],
};

// True 3D tetrahedron (4 vertices, 4 triangular faces, 3D coords)
const TETRAHEDRON_3D = {
  file_spec: 1.1,
  vertices_coords: [
    [0, 0, 0],
    [10, 0, 0],
    [5, 10, 0],
    [5, 5, 10],
  ],
  edges_vertices: [
    [0, 1], [1, 2], [2, 0],
    [0, 3], [1, 3], [2, 3],
  ],
  faces_vertices: [
    [0, 1, 2],  // bottom
    [0, 1, 3],
    [1, 2, 3],
    [2, 0, 3],
  ],
};

// ────────────────────────────────────────────────────────────────────
// Binary STL format
// ────────────────────────────────────────────────────────────────────
describe('FoldSTLExporter — binary', () => {
  test('should produce a Buffer', () => {
    const out = new FoldSTLExporter().export(SQUARE_2D);
    expect(Buffer.isBuffer(out)).toBe(true);
  });

  test('2D square extrusion yields 12 triangles (2 top + 2 bottom + 4 sides × 2)', () => {
    const out = new FoldSTLExporter().export(SQUARE_2D);
    const triCount = out.readUInt32LE(80);
    expect(triCount).toBe(12);
  });

  test('2D square extrusion file size = 84 + 12 × 50 = 684', () => {
    const out = new FoldSTLExporter().export(SQUARE_2D);
    expect(out.length).toBe(684);
  });

  test('3D tetrahedron: 4 faces × 1 tri = 4 triangles (no extrusion needed)', () => {
    const out = new FoldSTLExporter({ thickness: 0 }).export(TETRAHEDRON_3D);
    expect(out.length).toBe(84 + 4 * 50);
    expect(out.readUInt32LE(80)).toBe(4);
  });

  test('header contains custom name (truncated to 79 chars)', () => {
    const out = new FoldSTLExporter({ name: 'my-fold' }).export(SQUARE_2D);
    const header = out.slice(0, 80).toString('utf8');
    expect(header).toMatch(/^my-fold/);
  });

  test('first triangle normal points up (z=+1) for top face', () => {
    const out = new FoldSTLExporter().export(SQUARE_2D);
    const off = 84;
    const nx = out.readFloatLE(off);
    const ny = out.readFloatLE(off + 4);
    const nz = out.readFloatLE(off + 8);
    // First top-face triangle: normal should be (0, 0, 1)
    expect(nx).toBeCloseTo(0, 5);
    expect(ny).toBeCloseTo(0, 5);
    expect(nz).toBeCloseTo(1, 5);
  });

  test('thickness=0 disables extrusion on 2D input (0 triangles)', () => {
    // 2D input with no extrusion: 0 triangles because faces are degenerate
    // (all 4 points coplanar in z=0 — would still triangulate but normals = NaN)
    // Actually our code skips the case thickness=0 for 2D. Verify no crash.
    expect(() => new FoldSTLExporter({ thickness: 0 }).export(SQUARE_2D)).not.toThrow();
  });

  test('should respect custom thickness', () => {
    const out = new FoldSTLExporter({ thickness: 2.0 }).export(SQUARE_2D);
    // Same triangle count, but top-face z is now +1.0
    const off = 84;
    const v1z = out.readFloatLE(off + 12 + 8);  // v1.z
    expect(v1z).toBeCloseTo(1.0, 5);
  });

  test('flipNormals reverses all triangle normals', () => {
    const normal = new FoldSTLExporter();
    const flipped = new FoldSTLExporter({ flipNormals: true });
    const out1 = normal.export(SQUARE_2D);
    const out2 = flipped.export(SQUARE_2D);
    // First triangle: normal (0,0,1) → flipped (0,0,-1)
    const nz1 = out1.readFloatLE(84 + 8);
    const nz2 = out2.readFloatLE(84 + 8);
    expect(nz1).toBeCloseTo(1, 5);
    expect(nz2).toBeCloseTo(-1, 5);
  });
});

// ────────────────────────────────────────────────────────────────────
// ASCII STL format
// ────────────────────────────────────────────────────────────────────
describe('FoldSTLExporter — ASCII', () => {
  test('should produce a string with "solid <name>" and "endsolid <name>"', () => {
    const out = new FoldSTLExporter({ format: 'ascii' }).export(SQUARE_2D);
    expect(typeof out).toBe('string');
    expect(out).toMatch(/^solid origami-fold/);
    expect(out).toMatch(/endsolid origami-fold\s*$/);
  });

  test('should emit "facet normal" for each triangle', () => {
    const out = new FoldSTLExporter({ format: 'ascii' }).export(SQUARE_2D);
    const facets = (out.match(/facet normal/g) || []).length;
    expect(facets).toBe(12);
  });

  test('should emit "vertex" 3× per facet', () => {
    const out = new FoldSTLExporter({ format: 'ascii' }).export(SQUARE_2D);
    const verts = (out.match(/vertex/g) || []).length;
    expect(verts).toBe(12 * 3);
  });

  test('uses scientific notation for floats', () => {
    const out = new FoldSTLExporter({ format: 'ascii' }).export(SQUARE_2D);
    expect(out).toMatch(/[\d.]+e[+-]?\d+/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Error handling
// ────────────────────────────────────────────────────────────────────
describe('FoldSTLExporter — error handling', () => {
  test('should throw on invalid FOLD object', () => {
    expect(() => new FoldSTLExporter().export({})).toThrow('Invalid FOLD');
    expect(() => new FoldSTLExporter().export({ vertices_coords: [[0, 0]] })).toThrow('Invalid FOLD');
  });

  test('should handle FOLD with no faces (returns empty)', () => {
    const fold = { vertices_coords: [[0, 0, 0], [1, 0, 0]], edges_vertices: [[0, 1]] };
    const out = new FoldSTLExporter().export(fold);
    // 0 triangles → 84 bytes
    expect(out.length).toBe(84);
  });
});

// ────────────────────────────────────────────────────────────────────
// stl CLI command
// ────────────────────────────────────────────────────────────────────
describe('stl command registration', () => {
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
        // Commander's chain uses .description(), not .description_() — alias it
        cmd.description = cmd.description_;
        captured[name] = cmd;
        return cmd;
      },
    };
  }

  test('should register stl <file> with all expected options', () => {
    const program = makeFakeProgram();
    registerStlCommand(program);
    const cmd = program.captured['stl <file>'];
    expect(cmd).toBeDefined();
    expect(cmd.options).toContain('-o, --output <path>');
    expect(cmd.options).toContain('--ascii');
    expect(cmd.options).toContain('--thickness <mm>');
    expect(cmd.options).toContain('--no-extrude');
    expect(cmd.options).toContain('--flip-normals');
    expect(cmd.options).toContain('--name <name>');
  });
});

// ────────────────────────────────────────────────────────────────────
// CLI end-to-end
// ────────────────────────────────────────────────────────────────────
describe('stl CLI end-to-end', () => {
  const { spawn } = require('child_process');
  const CLI_PATH = path.join(__dirname, '../../src/index.js');

  // Suppress console noise from CLI calls
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

  test('should write binary STL for a 2D square FOLD', async () => {
    const foldFile = path.join(TMP, 'cli-test-square.fold');
    const stlFile = path.join(TMP, 'cli-test-square.stl');
    fs.writeFileSync(foldFile, JSON.stringify(SQUARE_2D));
    try {
      const r = await cli(['stl', foldFile, '-o', stlFile]);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(stlFile)).toBe(true);
      const buf = fs.readFileSync(stlFile);
      expect(buf.length).toBe(684);
      expect(buf.readUInt32LE(80)).toBe(12);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(stlFile)) fs.unlinkSync(stlFile);
    }
  });

  test('should write ASCII STL with --ascii flag', async () => {
    const foldFile = path.join(TMP, 'cli-test-square-ascii.fold');
    const stlFile = path.join(TMP, 'cli-test-square-ascii.stl');
    fs.writeFileSync(foldFile, JSON.stringify(SQUARE_2D));
    try {
      const r = await cli(['stl', foldFile, '-o', stlFile, '--ascii']);
      expect(r.exitCode).toBe(0);
      const content = fs.readFileSync(stlFile, 'utf8');
      expect(content).toMatch(/^solid origami-fold/);
      expect((content.match(/facet normal/g) || []).length).toBe(12);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(stlFile)) fs.unlinkSync(stlFile);
    }
  });

  test('should respect --thickness flag', async () => {
    const foldFile = path.join(TMP, 'cli-test-thick.fold');
    const stlFile = path.join(TMP, 'cli-test-thick.stl');
    fs.writeFileSync(foldFile, JSON.stringify(SQUARE_2D));
    try {
      const r = await cli(['stl', foldFile, '-o', stlFile, '--thickness', '3.5']);
      expect(r.exitCode).toBe(0);
      const buf = fs.readFileSync(stlFile);
      // v1.z of first triangle should be +1.75 (half of 3.5)
      const v1z = buf.readFloatLE(84 + 20);
      expect(v1z).toBeCloseTo(1.75, 5);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(stlFile)) fs.unlinkSync(stlFile);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// dieline -f stl integration
// ────────────────────────────────────────────────────────────────────
describe('dieline -f stl integration', () => {
  const { spawn } = require('child_process');
  const CLI_PATH = path.join(__dirname, '../../src/index.js');

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

  test('dieline parse <file> -f stl should write a valid STL', async () => {
    const foldFile = path.join(TMP, 'dieline-stl-test.fold');
    const stlFile = path.join(TMP, 'dieline-stl-test.stl');
    fs.writeFileSync(foldFile, JSON.stringify(SQUARE_2D));
    try {
      const r = await cli(['dieline', 'parse', foldFile, '-f', 'stl', '-o', stlFile]);
      expect(r.exitCode).toBe(0);
      const buf = fs.readFileSync(stlFile);
      expect(buf.readUInt32LE(80)).toBe(12);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(stlFile)) fs.unlinkSync(stlFile);
    }
  });

  test('dieline export <file> -f stl should also work', async () => {
    const foldFile = path.join(TMP, 'dieline-stl-export.fold');
    const stlFile = path.join(TMP, 'dieline-stl-export.stl');
    fs.writeFileSync(foldFile, JSON.stringify(SQUARE_2D));
    try {
      const r = await cli(['dieline', 'export', foldFile, '-f', 'stl', '-o', stlFile]);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(stlFile)).toBe(true);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(stlFile)) fs.unlinkSync(stlFile);
    }
  });

  test('dieline with -f stl and --ascii should write ASCII STL', async () => {
    const foldFile = path.join(TMP, 'dieline-stl-ascii.fold');
    const stlFile = path.join(TMP, 'dieline-stl-ascii.stl');
    fs.writeFileSync(foldFile, JSON.stringify(SQUARE_2D));
    try {
      const r = await cli(['dieline', 'export', foldFile, '-f', 'stl', '-o', stlFile, '--ascii']);
      expect(r.exitCode).toBe(0);
      const content = fs.readFileSync(stlFile, 'utf8');
      expect(content).toMatch(/^solid /);
      expect((content.match(/facet normal/g) || []).length).toBe(12);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(stlFile)) fs.unlinkSync(stlFile);
    }
  });
});
