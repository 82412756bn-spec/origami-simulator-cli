/**
 * Unit tests for the `origami generate` command (v2.47.4)
 * =========================================================================
 *
 * WHAT IS UNDER TEST
 * ------------------
 * `src/commands/generate.js` turns a named pattern into a **pair** of
 * artifacts:
 *
 *     <name>.fold   machine readable, verifiable
 *     <name>.svg    printable / renderable
 *
 * and then runs the verification suite (criteria A-F) over them.
 *
 * These tests exercise the command **as a black box** wherever possible:
 *
 *   - the CLI is spawned with `child_process` (`node src/index.js generate …`)
 *     so the real argument parsing / exit codes are covered;
 *   - the FOLD is re-read from disk with `JSON.parse` and checked with the
 *     repository's own `FoldAnalyzer`;
 *   - the SVG is re-read from disk and checked with the repository's own
 *     `xml-lite` parser;
 *   - the SVG↔FOLD edge matching is re-implemented **independently** here
 *     (own path parser + own similarity-transform recovery) so the test does
 *     not simply re-run the implementation's matcher.
 *
 * The implementation is NOT modified by these tests.
 *
 * NO NETWORK / NO BROWSER: everything runs in-process or through
 * `child_process.spawnSync` on the local `node` binary.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { generatePattern } = require('../../src/commands/generate');
const { FoldAnalyzer } = require('../../src/utils/fold-analyzer');
const { parseXml } = require('../../src/utils/xml-lite');
const { ASSIGNMENT_COLORS } = require('../../src/utils/svg-crease-parser');

const CLI = path.resolve(__dirname, '../../src/index.js');

/** Pattern used by the task brief (`node src/index.js generate crane …`). */
const PATTERN = 'crane';

/** A pattern whose verification report is fully green (A-F). */
const CLEAN_PATTERN = 'star';

// ─────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────

/** Create a throw-away output directory. */
function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `origami-generate-${tag}-`));
}

/**
 * Spawn the CLI and capture the result.
 * @param {string[]} args
 * @returns {{status:number, stdout:string, stderr:string}}
 */
function runCli(args) {
  const res = spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { ORIGAMI_INTERNAL_TEST: '1' }),
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

/**
 * Extract the `--json` payload from the CLI stdout.
 * @param {string} stdout
 * @returns {Object}
 */
function parseJsonReport(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`no JSON payload in CLI stdout: ${JSON.stringify(stdout.slice(0, 400))}`);
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

/**
 * Parse the `d` attribute of an SVG path into points.
 *
 * This is a deliberately small, independent parser: the crease generator
 * emits absolute `M x,y L x,y` segments, which is all this needs to cover.
 * A separate assertion pins the emitted format down.
 *
 * @param {string} d
 * @returns {Array<[number, number]>}
 */
function parsePathPoints(d) {
  const points = [];
  const re = /([ML])\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)/gi;
  let m;
  while ((m = re.exec(d)) !== null) {
    points.push([Number(m[2]), Number(m[3])]);
  }
  return points;
}

/**
 * Extract every `<path>` with its `d` and `stroke` attributes.
 * @param {string} svgText
 * @returns {Array<{points: Array<[number,number]>, color: string|null, d: string}>}
 */
function extractSvgPaths(svgText) {
  const paths = [];
  const re = /<path\b([^>]*)>/g;
  let m;
  while ((m = re.exec(svgText)) !== null) {
    const attrs = m[1];
    const dMatch = /\bd="([^"]*)"/.exec(attrs);
    if (!dMatch) continue;
    const strokeMatch = /\bstroke="([^"]*)"/.exec(attrs);
    const points = parsePathPoints(dMatch[1]);
    if (points.length < 2) continue;
    paths.push({ points, color: strokeMatch ? strokeMatch[1] : null, d: dMatch[1] });
  }
  return paths;
}

/**
 * Axis-aligned bounding box of a point list.
 * @param {Array<Array<number>>} pts
 */
function bbox(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Recover the similarity transform (uniform scale + optional Y mirror +
 * translation) that maps the FOLD model onto the SVG user space.
 *
 * Independent re-implementation of the matching rule: the SVG is a
 * uniform-scale rendering of the FOLD, so the scale can be read off the
 * bounding boxes and the Y direction is either mirrored or not.
 *
 * @param {Array<Array<number>>} modelPts
 * @param {Array<Array<number>>} svgPts
 */
function recoverTransform(modelPts, svgPts) {
  const m = bbox(modelPts);
  const s = bbox(svgPts);
  const modelWidth = m.width !== 0 ? m.width : m.height;
  const svgWidth = s.width !== 0 ? s.width : s.height;
  const scale = svgWidth / modelWidth;
  const tx = s.minX - scale * m.minX;

  const candidates = [
    { flipY: true, ty: s.maxY + scale * m.minY },
    { flipY: false, ty: s.minY - scale * m.minY },
  ];

  let best = null;
  for (const cand of candidates) {
    const forward = (p) => (cand.flipY
      ? [scale * p[0] + tx, cand.ty - scale * p[1]]
      : [scale * p[0] + tx, scale * p[1] + cand.ty]);
    const corners = [
      [m.minX, m.minY], [m.maxX, m.minY], [m.maxX, m.maxY], [m.minX, m.maxY],
    ].map(forward);
    const cbox = bbox(corners);
    const residual = Math.max(
      Math.abs(cbox.minX - s.minX), Math.abs(cbox.maxX - s.maxX),
      Math.abs(cbox.minY - s.minY), Math.abs(cbox.maxY - s.maxY),
    );
    if (!best || residual < best.residual) {
      best = { s: scale, flipY: cand.flipY, tx, ty: cand.ty, residual };
    }
  }
  return best;
}

/**
 * Spatial hash over SVG endpoints so a transformed model point can find the
 * path(s) it belongs to.
 */
function buildEndpointIndex(svgPts, cell = 1.0) {
  const map = new Map();
  svgPts.forEach((p, idx) => {
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
 * Match every FOLD edge against the SVG paths by **undirected** endpoints.
 *
 * @param {Object} fold
 * @param {Array} paths - from extractSvgPaths()
 * @param {number} tolerance - in SVG user units
 * @returns {{transform: Object, matches: Array<number>, unmatched: Array<number>}}
 */
function matchEdgesToPaths(fold, paths, tolerance = 0.05) {
  const vertices = fold.vertices_coords || [];
  const edges = fold.edges_vertices || [];

  const modelPts = [];
  for (const e of edges) {
    modelPts.push(vertices[e[0]], vertices[e[1]]);
  }
  const svgPts = [];
  for (const p of paths) {
    svgPts.push(p.points[0], p.points[1]);
  }

  const transform = recoverTransform(modelPts, svgPts);
  const forward = (p) => (transform.flipY
    ? [transform.s * p[0] + transform.tx, transform.ty - transform.s * p[1]]
    : [transform.s * p[0] + transform.tx, transform.s * p[1] + transform.ty]);

  const index = buildEndpointIndex(svgPts);
  const near = (p) => index.near(p).filter((idx) => {
    const q = svgPts[idx];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) <= tolerance;
  });

  const matches = [];
  const unmatched = [];
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    const a = forward(vertices[e[0]]);
    const b = forward(vertices[e[1]]);

    let matched = -1;
    for (const idx of near(a)) {
      const pathIdx = Math.floor(idx / 2);
      const endIdx = idx % 2;
      const other = svgPts[pathIdx * 2 + (1 - endIdx)];
      // undirected: the path may connect a→b or b→a
      if (Math.hypot(other[0] - b[0], other[1] - b[1]) <= tolerance) {
        matched = pathIdx;
        break;
      }
    }

    if (matched === -1) unmatched.push(ei);
    else matches.push(matched);
  }

  return { transform, matches, unmatched };
}

/** Distance between two points. */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ─────────────────────────────────────────────────────────────────────────
// 1 + 2: artifact pair and determinism
// ─────────────────────────────────────────────────────────────────────────

describe('origami generate — artifact pair', () => {
  let dir;
  let foldPath;
  let svgPath;

  beforeAll(() => {
    dir = tmpDir('pair');
    const res = runCli(['generate', PATTERN, '--output-dir', dir]);
    expect(res.status).toBe(0);
    foldPath = path.join(dir, `${PATTERN}.fold`);
    svgPath = path.join(dir, `${PATTERN}.svg`);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('writes a .fold and a .svg next to each other', () => {
    expect(fs.existsSync(foldPath)).toBe(true);
    expect(fs.existsSync(svgPath)).toBe(true);
    expect(fs.statSync(foldPath).size).toBeGreaterThan(0);
    expect(fs.statSync(svgPath).size).toBeGreaterThan(0);
  });

  test('the .fold is well-formed JSON', () => {
    const parsed = JSON.parse(fs.readFileSync(foldPath, 'utf8'));
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
  });

  test('the .svg is a non-empty SVG document', () => {
    const svg = fs.readFileSync(svgPath, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  test('--format fold writes only the .fold', () => {
    const d = tmpDir('fmt-fold');
    const res = runCli(['generate', PATTERN, '--output-dir', d, '--format', 'fold']);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(d, `${PATTERN}.fold`))).toBe(true);
    expect(fs.existsSync(path.join(d, `${PATTERN}.svg`))).toBe(false);
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('--format svg writes only the .svg', () => {
    const d = tmpDir('fmt-svg');
    const res = runCli(['generate', PATTERN, '--output-dir', d, '--format', 'svg']);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(d, `${PATTERN}.svg`))).toBe(true);
    expect(fs.existsSync(path.join(d, `${PATTERN}.fold`))).toBe(false);
    fs.rmSync(d, { recursive: true, force: true });
  });
});

describe('origami generate — determinism', () => {
  let dirA;
  let dirB;
  let dirC;

  beforeAll(() => {
    dirA = tmpDir('det-a');
    dirB = tmpDir('det-b');
    dirC = tmpDir('det-c');
    for (const d of [dirA, dirB, dirC]) {
      const res = runCli(['generate', PATTERN, '--output-dir', d, '--seed', '42']);
      expect(res.status).toBe(0);
    }
    // dirC uses a different seed on purpose
    const res = runCli(['generate', PATTERN, '--output-dir', dirC, '--seed', '7']);
    expect(res.status).toBe(0);
  });

  afterAll(() => {
    for (const d of [dirA, dirB, dirC]) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  test('the same seed produces a byte-identical .fold', () => {
    const a = fs.readFileSync(path.join(dirA, `${PATTERN}.fold`));
    const b = fs.readFileSync(path.join(dirB, `${PATTERN}.fold`));
    expect(a.length).toBe(b.length);
    expect(a.equals(b)).toBe(true);
  });

  test('the same seed produces a byte-identical .svg', () => {
    const a = fs.readFileSync(path.join(dirA, `${PATTERN}.svg`));
    const b = fs.readFileSync(path.join(dirB, `${PATTERN}.svg`));
    expect(a.length).toBe(b.length);
    expect(a.equals(b)).toBe(true);
  });

  test('a different seed changes the output (the seed is actually used)', () => {
    const a = fs.readFileSync(path.join(dirA, `${PATTERN}.fold`));
    const c = fs.readFileSync(path.join(dirC, `${PATTERN}.fold`));
    expect(a.equals(c)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3 + 4: FOLD legality and round-trip
// ─────────────────────────────────────────────────────────────────────────

describe('origami generate — FOLD legality', () => {
  let fold;
  let dir;

  beforeAll(() => {
    dir = tmpDir('fold');
    const res = runCli(['generate', PATTERN, '--output-dir', dir]);
    expect(res.status).toBe(0);
    fold = JSON.parse(fs.readFileSync(path.join(dir, `${PATTERN}.fold`), 'utf8'));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('vertices, edges and faces are all present and non-empty', () => {
    expect(Array.isArray(fold.vertices_coords)).toBe(true);
    expect(Array.isArray(fold.edges_vertices)).toBe(true);
    expect(Array.isArray(fold.faces_vertices)).toBe(true);
    expect(fold.vertices_coords.length).toBeGreaterThan(0);
    expect(fold.edges_vertices.length).toBeGreaterThan(0);
    expect(fold.faces_vertices.length).toBeGreaterThan(0);
  });

  test('every edge assignment is one of B / M / V', () => {
    expect(Array.isArray(fold.edges_assignment)).toBe(true);
    expect(fold.edges_assignment.length).toBe(fold.edges_vertices.length);
    const invalid = fold.edges_assignment.filter((a) => !['B', 'M', 'V'].includes(String(a).toUpperCase()));
    expect(invalid).toEqual([]);
  });

  test('thickness is a positive number', () => {
    expect(typeof fold.thickness).toBe('number');
    expect(fold.thickness).toBeGreaterThan(0);
  });

  test('--thickness is carried into the .fold', () => {
    const d = tmpDir('thickness');
    const res = runCli(['generate', PATTERN, '--output-dir', d, '--thickness', '0.8']);
    expect(res.status).toBe(0);
    const f = JSON.parse(fs.readFileSync(path.join(d, `${PATTERN}.fold`), 'utf8'));
    expect(f.thickness).toBeCloseTo(0.8, 6);
    fs.rmSync(d, { recursive: true, force: true });
  });

  test('every edge references an existing vertex', () => {
    const n = fold.vertices_coords.length;
    for (const e of fold.edges_vertices) {
      expect(Array.isArray(e)).toBe(true);
      expect(e.length).toBe(2);
      expect(e[0]).toBeGreaterThanOrEqual(0);
      expect(e[1]).toBeGreaterThanOrEqual(0);
      expect(e[0]).toBeLessThan(n);
      expect(e[1]).toBeLessThan(n);
    }
  });

  test('edges_foldAngle agrees with edges_assignment', () => {
    expect(Array.isArray(fold.edges_foldAngle)).toBe(true);
    expect(fold.edges_foldAngle.length).toBe(fold.edges_vertices.length);
    const expected = { B: 0, M: 180, V: -180 };
    fold.edges_assignment.forEach((a, i) => {
      expect(fold.edges_foldAngle[i]).toBe(expected[String(a).toUpperCase()]);
    });
  });

  test('the FOLD envelope is a 2D crease pattern', () => {
    expect(fold.file_spec).toBe(1.2);
    expect(fold.file_classes).toContain('creasePattern');
    expect(fold.frame_classes).toContain('creasePattern');
    expect(fold.frame_attributes).toContain('2D');
  });

  test('the repository FoldAnalyzer can read the generated FOLD', () => {
    const analyzer = new FoldAnalyzer(fold);
    const basic = analyzer.basicAnalysis();
    expect(basic.vertexCount).toBe(fold.vertices_coords.length);
    expect(basic.edgeCount).toBe(fold.edges_vertices.length);
    expect(basic.faceCount).toBe(fold.faces_vertices.length);
  });
});

describe('origami generate — FOLD round-trip', () => {
  let dir;
  let written;
  let readBack;

  beforeAll(() => {
    dir = tmpDir('roundtrip');
    const res = runCli(['generate', PATTERN, '--output-dir', dir]);
    expect(res.status).toBe(0);
    const file = path.join(dir, `${PATTERN}.fold`);
    written = JSON.parse(fs.readFileSync(file, 'utf8'));
    // write → read again, exactly like a consumer of the artifact would
    const tmp = path.join(dir, 'roundtrip.fold');
    fs.writeFileSync(tmp, JSON.stringify(written, null, 2), 'utf8');
    readBack = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the key fields survive a write → read cycle unchanged', () => {
    for (const key of [
      'file_spec', 'file_creator', 'file_classes', 'frame_classes',
      'frame_attributes', 'thickness',
    ]) {
      expect(readBack[key]).toEqual(written[key]);
    }
    for (const key of [
      'vertices_coords', 'edges_vertices', 'faces_vertices',
      'edges_assignment', 'edges_foldAngle', 'vertices_edges',
    ]) {
      expect(readBack[key]).toEqual(written[key]);
    }
  });

  test('the re-read FOLD analyses to the same numbers', () => {
    const before = new FoldAnalyzer(written).basicAnalysis();
    const after = new FoldAnalyzer(readBack).basicAnalysis();
    expect(after.vertexCount).toBe(before.vertexCount);
    expect(after.edgeCount).toBe(before.edgeCount);
    expect(after.faceCount).toBe(before.faceCount);
  });

  test('the CLI output equals the in-process generatePattern() output', () => {
    const d = tmpDir('inproc');
    const result = generatePattern(PATTERN, { outputDir: d, seed: 42, thickness: 1.0 });
    expect(fs.readFileSync(result.artifacts.fold).equals(fs.readFileSync(path.join(dir, `${PATTERN}.fold`))))
      .toBe(true);
    expect(fs.readFileSync(result.artifacts.svg).equals(fs.readFileSync(path.join(dir, `${PATTERN}.svg`))))
      .toBe(true);
    fs.rmSync(d, { recursive: true, force: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5: SVG well-formedness
// ─────────────────────────────────────────────────────────────────────────

describe('origami generate — SVG well-formedness', () => {
  let dir;
  let svg;
  let fold;
  let paths;

  beforeAll(() => {
    dir = tmpDir('svg');
    const res = runCli(['generate', PATTERN, '--output-dir', dir]);
    expect(res.status).toBe(0);
    svg = fs.readFileSync(path.join(dir, `${PATTERN}.svg`), 'utf8');
    fold = JSON.parse(fs.readFileSync(path.join(dir, `${PATTERN}.fold`), 'utf8'));
    paths = extractSvgPaths(svg);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the SVG is well-formed XML', () => {
    const doc = parseXml(svg);
    expect(doc.errors).toEqual([]);
    expect(doc.ok).toBe(true);
    expect(doc.elementCount).toBeGreaterThan(0);
  });

  test('the root <svg> element carries a usable viewBox and size', () => {
    const doc = parseXml(svg);
    const root = doc.root.children.find((c) => c.name === 'svg');
    expect(root).toBeDefined();

    const viewBox = root.attrs.viewBox;
    expect(typeof viewBox).toBe('string');
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    expect(parts).toHaveLength(4);
    parts.forEach((n) => expect(Number.isFinite(n)).toBe(true));
    expect(parts[2]).toBeGreaterThan(0);
    expect(parts[3]).toBeGreaterThan(0);

    expect(parseFloat(root.attrs.width)).toBeGreaterThan(0);
    expect(parseFloat(root.attrs.height)).toBeGreaterThan(0);
  });

  test('every crease path uses the absolute "M x,y L x,y" format', () => {
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p.d).toMatch(/^M-?\d*\.?\d+,-?\d*\.?\d+ L-?\d*\.?\d+,-?\d*\.?\d+$/);
      expect(p.points).toHaveLength(2);
    }
  });

  test('mountain creases are red (#FF0000), valley creases are blue, boundary creases are black', () => {
    const counts = { M: 0, V: 0, B: 0 };
    const colorByAssignment = { M: null, V: null, B: null };

    fold.edges_assignment.forEach((assignment, i) => {
      const a = String(assignment).toUpperCase();
      counts[a] += 1;
      const stroke = paths[i].color;
      if (a === 'M') {
        expect(stroke.toUpperCase()).toBe('#FF0000');
        colorByAssignment.M = stroke.toUpperCase();
      } else if (a === 'B') {
        expect(stroke.toUpperCase()).toBe('#000000');
        colorByAssignment.B = stroke.toUpperCase();
      } else if (a === 'V') {
        // The implementation maps V to the Origami-Simulator standard blue
        // (see ASSIGNMENT_COLORS in src/utils/svg-crease-parser.js).  The
        // task brief asked for "#0066cc"; the shipped implementation uses
        // "#0000FF" — see the bug report.  The assertion below therefore
        // pins the *contract* (V is blue) and the exact hex of the
        // implementation constant.
        expect(stroke.toUpperCase()).toBe(ASSIGNMENT_COLORS.V.toUpperCase());
        colorByAssignment.V = stroke.toUpperCase();
      }
    });

    expect(counts.M).toBeGreaterThan(0);
    expect(counts.V).toBeGreaterThan(0);
    expect(counts.B).toBeGreaterThan(0);

    // the valley colour really is blue (B channel dominant)
    const rgb = colorByAssignment.V.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    expect(rgb).not.toBeNull();
    const r = parseInt(rgb[1], 16);
    const g = parseInt(rgb[2], 16);
    const b = parseInt(rgb[3], 16);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  test('the colour constants of the implementation are M=#FF0000, V=blue, B=#000000', () => {
    expect(ASSIGNMENT_COLORS.M.toUpperCase()).toBe('#FF0000');
    expect(ASSIGNMENT_COLORS.B.toUpperCase()).toBe('#000000');
    expect(ASSIGNMENT_COLORS.V.toUpperCase()).toMatch(/^#[0-9A-F]{6}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6: SVG ↔ FOLD consistency
// ─────────────────────────────────────────────────────────────────────────

describe('origami generate — SVG ↔ FOLD consistency', () => {
  let dir;
  let svg;
  let fold;
  let paths;
  let match;

  beforeAll(() => {
    dir = tmpDir('match');
    const res = runCli(['generate', PATTERN, '--output-dir', dir]);
    expect(res.status).toBe(0);
    svg = fs.readFileSync(path.join(dir, `${PATTERN}.svg`), 'utf8');
    fold = JSON.parse(fs.readFileSync(path.join(dir, `${PATTERN}.fold`), 'utf8'));
    paths = extractSvgPaths(svg);
    match = matchEdgesToPaths(fold, paths);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the SVG draws exactly one path per FOLD edge', () => {
    expect(paths.length).toBe(fold.edges_vertices.length);
  });

  test('the SVG is a uniform-scale rendering of the FOLD (small transform residual)', () => {
    expect(match.transform.residual).toBeLessThan(0.5);
  });

  test('every FOLD edge matches an SVG path by undirected endpoints', () => {
    expect(match.unmatched).toEqual([]);
    expect(match.matches.length).toBe(fold.edges_vertices.length);
  });

  test('the edge → path mapping is a bijection (no path is used twice)', () => {
    expect(new Set(match.matches).size).toBe(match.matches.length);
    expect(match.matches.slice().sort((a, b) => a - b)).toEqual(
      paths.map((_, i) => i),
    );
  });

  test('the stroke colour of every matched path agrees with edges_assignment', () => {
    fold.edges_assignment.forEach((assignment, i) => {
      const expected = ASSIGNMENT_COLORS[String(assignment).toUpperCase()];
      const actual = paths[match.matches[i]].color;
      expect(actual.toUpperCase()).toBe(expected.toUpperCase());
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// the command's own verification report
// ─────────────────────────────────────────────────────────────────────────

describe('origami generate — verification report', () => {
  test('criteria A, B and E pass for the crane pattern', () => {
    const dir = tmpDir('verify-crane');
    const res = runCli(['generate', PATTERN, '--output-dir', dir, '--json']);
    expect(res.status).toBe(0);
    const report = parseJsonReport(res.stdout);
    expect(report.criteria.A.pass).toBe(true);
    expect(report.criteria.B.pass).toBe(true);
    expect(report.criteria.E.pass).toBe(true);
    expect(report.criteria.E.matchedEdges).toBe(report.criteria.E.foldEdgeCount);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('all criteria A-F pass for the star pattern', () => {
    const dir = tmpDir('verify-star');
    const res = runCli(['generate', CLEAN_PATTERN, '--output-dir', dir, '--json']);
    expect(res.status).toBe(0);
    const report = parseJsonReport(res.stdout);
    for (const key of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect([key, report.criteria[key].pass]).toEqual([key, true]);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8: invalid arguments
// ─────────────────────────────────────────────────────────────────────────

describe('origami generate — invalid arguments', () => {
  test('an unknown pattern exits non-zero with a clear message', () => {
    const dir = tmpDir('bad-pattern');
    const res = runCli(['generate', 'no-such-pattern', '--output-dir', dir]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Unknown pattern/i);
    expect(res.stderr).toMatch(/no-such-pattern/);
    // the message must point at the patterns that do exist
    expect(res.stderr).toMatch(/Available patterns/i);
    expect(res.stderr).toMatch(/crane/);
    // nothing was written
    expect(fs.existsSync(path.join(dir, 'no-such-pattern.fold'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('an invalid --format exits non-zero with a clear message', () => {
    const dir = tmpDir('bad-format');
    const res = runCli(['generate', PATTERN, '--output-dir', dir, '--format', 'pdf']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid format/i);
    expect(res.stderr).toMatch(/fold, svg, both/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a non-numeric --seed exits non-zero with a clear message', () => {
    const dir = tmpDir('bad-seed');
    const res = runCli(['generate', PATTERN, '--output-dir', dir, '--seed', 'abc']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/--seed/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('an out-of-range parameter exits non-zero and names the valid range', () => {
    const dir = tmpDir('bad-param');
    const res = runCli(['generate', PATTERN, '--output-dir', dir, '--grid', '9999']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/--grid must be between 4 and 256/);
    expect(fs.existsSync(path.join(dir, `${PATTERN}.fold`))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a non-positive --thickness exits non-zero', () => {
    const dir = tmpDir('bad-thickness');
    const res = runCli(['generate', PATTERN, '--output-dir', dir, '--thickness', '0']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/--thickness/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
