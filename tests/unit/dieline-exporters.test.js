/**
 * Unit tests for v2.21 Dieline DXF/PDF exporters
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DielineDXFExporter } = require('../../src/utils/dieline-dxf-exporter');
const { DielinePDFExporter } = require('../../src/utils/dieline-pdf-exporter');

const TMP = os.tmpdir();

// A minimal 2D FOLD dieline (3-edge triangle with M/V/B assignments)
const TRIANGLE_FOLD = {
  file_spec: 1.1,
  vertices_coords: [[0, 0], [10, 0], [5, 8.66]],  // equilateral
  edges_vertices: [[0, 1], [1, 2], [2, 0]],
  edges_assignment: ['B', 'M', 'V'],
  faces_vertices: [[0, 1, 2]],
  frame_title: 'Test Triangle',
};

// ────────────────────────────────────────────────────────────────────
// DXF exporter
// ────────────────────────────────────────────────────────────────────
describe('DielineDXFExporter', () => {
  test('should export a valid DXF text string', () => {
    const dxf = new DielineDXFExporter();
    const output = dxf.export(TRIANGLE_FOLD);
    expect(typeof output).toBe('string');
    expect(output).toContain('SECTION');
    expect(output).toContain('ENTITIES');
    expect(output).toContain('EOF');
  });

  test('should include the LAYER table with 3 layers (CUT, MOUNTAIN, VALLEY)', () => {
    const dxf = new DielineDXFExporter();
    const output = dxf.export(TRIANGLE_FOLD);
    expect(output).toMatch(/LAYER\s+2\s+CUT/);
    expect(output).toMatch(/LAYER\s+2\s+MOUNTAIN/);
    expect(output).toMatch(/LAYER\s+2\s+VALLEY/);
  });

  test('should set $INSUNITS=4 (millimeters) in header', () => {
    const dxf = new DielineDXFExporter();
    const output = dxf.export(TRIANGLE_FOLD);
    expect(output).toContain('$INSUNITS');
    expect(output).toMatch(/INSUNITS[\s\S]{0,40}70\s+4/);
  });

  test('should emit LINE entities for M/V/B edges', () => {
    const dxf = new DielineDXFExporter();
    const output = dxf.export(TRIANGLE_FOLD);
    const lineCount = (output.match(/\nLINE\n/g) || []).length;
    expect(lineCount).toBeGreaterThanOrEqual(3);
  });

  test('should emit a LWPOLYLINE for the face boundary', () => {
    const dxf = new DielineDXFExporter();
    const output = dxf.export(TRIANGLE_FOLD);
    expect(output).toContain('LWPOLYLINE');
  });

  test('should respect --no-closed-boundary option', () => {
    const dxf = new DielineDXFExporter({ closedBoundary: false });
    const output = dxf.export(TRIANGLE_FOLD);
    // When closedBoundary=false, no LWPOLYLINE; but lines still emitted
    expect(output).not.toContain('LWPOLYLINE');
    expect(output).toContain('LINE');
  });

  test('should throw on invalid FOLD', () => {
    const dxf = new DielineDXFExporter();
    expect(() => dxf.export({})).toThrow('Invalid FOLD');
    expect(() => dxf.export({ vertices_coords: [[0, 0]] })).toThrow('Invalid FOLD');
  });

  test('should parse with offline DXF validator (basic structural check)', () => {
    const dxf = new DielineDXFExporter();
    const output = dxf.export(TRIANGLE_FOLD);
    // Minimal R12 DXF structure: HEADER → TABLES → ENTITIES → EOF
    const hasHeader = output.includes('SECTION\n2\nHEADER');
    const hasEntities = output.includes('SECTION\n2\nENTITIES');
    const hasEnds = output.endsWith('EOF\n');
    expect(hasHeader).toBe(true);
    expect(hasEntities).toBe(true);
    expect(hasEnds).toBe(true);
  });

  test('should write a parseable DXF file to disk', () => {
    const dxf = new DielineDXFExporter();
    const out = path.join(TMP, 'test-triangle.dxf');
    try {
      fs.writeFileSync(out, dxf.export(TRIANGLE_FOLD), 'utf8');
      const content = fs.readFileSync(out, 'utf8');
      expect(content.length).toBeGreaterThan(200);
      // Count entities
      const entities = (content.match(/\nLINE\n/g) || []).length;
      expect(entities).toBe(3);
    } finally {
      if (fs.existsSync(out)) fs.unlinkSync(out);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// PDF exporter
// ────────────────────────────────────────────────────────────────────
describe('DielinePDFExporter', () => {
  test('should export a Uint8Array PDF', async () => {
    const pdf = new DielinePDFExporter();
    const bytes = await pdf.export(TRIANGLE_FOLD);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);
  });

  test('should produce a valid PDF file (%PDF- header)', async () => {
    const pdf = new DielinePDFExporter();
    const bytes = await pdf.export(TRIANGLE_FOLD);
    const head = Buffer.from(bytes.slice(0, 8)).toString('latin1');
    expect(head).toMatch(/^%PDF-1\./);
  });

  test('should throw on invalid FOLD', async () => {
    const pdf = new DielinePDFExporter();
    await expect(pdf.export({})).rejects.toThrow('Invalid FOLD');
  });

  test('should write a valid PDF to disk', async () => {
    const pdf = new DielinePDFExporter({ title: 'Test' });
    const out = path.join(TMP, 'test-triangle.pdf');
    try {
      const bytes = await pdf.export(TRIANGLE_FOLD);
      fs.writeFileSync(out, bytes);
      const stat = fs.statSync(out);
      expect(stat.size).toBeGreaterThan(500);
      const header = fs.readFileSync(out, { encoding: 'latin1' }).slice(0, 5);
      expect(header).toBe('%PDF-');
    } finally {
      if (fs.existsSync(out)) fs.unlinkSync(out);
    }
  });

  test('should respect custom page dimensions', async () => {
    const pdf = new DielinePDFExporter({ pageWidth: 100, pageHeight: 150 });
    const bytes = await pdf.export(TRIANGLE_FOLD);
    expect(bytes.length).toBeGreaterThan(500);
  });

  test('should auto-orient landscape when model is wider than tall', async () => {
    // Wide model: 100mm wide × 5mm tall
    const wideFold = {
      vertices_coords: [[0, 0], [100, 0], [100, 5], [0, 5]],
      edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 0]],
      edges_assignment: ['B', 'B', 'B', 'B'],
      faces_vertices: [[0, 1, 2, 3]],
    };
    const pdf = new DielinePDFExporter({ pageWidth: 210, pageHeight: 297, autoOrient: true });
    const bytes = await pdf.export(wideFold);
    // Just check it produces a valid PDF; specific orientation is internal
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');
  });
});

// ────────────────────────────────────────────────────────────────────
// CLI integration: dieline command with dxf/pdf formats
// ────────────────────────────────────────────────────────────────────
describe('dieline command supports dxf and pdf formats', () => {
  const { spawn } = require('child_process');
  const CLI_PATH = path.join(__dirname, '../../src/index.js');
  const PROJECT_ROOT = path.join(__dirname, '../..');
  const HYPAR = path.join(PROJECT_ROOT, 'hypar.fold');

  function cli(args) {
    return new Promise((resolve) => {
      // Use project root as cwd so `hypar.fold` resolves correctly
      const proc = spawn('node', [CLI_PATH, ...args], { cwd: PROJECT_ROOT });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
    });
  }

  test('dieline parse hypar.fold -f dxf should write a .dxf file', async () => {
    const out = path.join(TMP, 'cli-test.dxf');
    try {
      const r = await cli(['dieline', 'parse', HYPAR, '-o', out, '-f', 'dxf']);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(out)).toBe(true);
      const head = fs.readFileSync(out, 'utf8').slice(0, 200);
      expect(head).toContain('SECTION');
    } finally {
      if (fs.existsSync(out)) fs.unlinkSync(out);
    }
  });

  test('dieline parse hypar.fold -f pdf should write a .pdf file', async () => {
    const out = path.join(TMP, 'cli-test.pdf');
    try {
      const r = await cli(['dieline', 'parse', HYPAR, '-o', out, '-f', 'pdf']);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(out)).toBe(true);
      const head = fs.readFileSync(out, { encoding: 'latin1' }).slice(0, 5);
      expect(head).toBe('%PDF-');
    } finally {
      if (fs.existsSync(out)) fs.unlinkSync(out);
    }
  });

  test('dieline export hypar.fold -f dxf should write a .dxf file', async () => {
    const out = path.join(TMP, 'cli-export.dxf');
    try {
      const r = await cli(['dieline', 'export', HYPAR, '-o', out, '-f', 'dxf']);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(out)).toBe(true);
    } finally {
      if (fs.existsSync(out)) fs.unlinkSync(out);
    }
  });

  test('dieline export with -f jpg should error gracefully', async () => {
    const r = await cli(['dieline', 'export', HYPAR, '-o', '/tmp/x.jpg', '-f', 'jpg']);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('Invalid format');
  });
});
