/**
 * Golden-corpus regression for the `origami generate` toolchain (v2.47.4)
 * =========================================================================
 *
 * WHAT IS UNDER TEST
 * ------------------
 * The crease-pattern corpus that ships with the project:
 *
 *     ~/文档/Unbuntu_system/goods/origami-examples/
 *
 * It contains 77 **same-name** pairs (`<name>.fold` next to `<name>.svg`).
 * The `.fold` files live under `FOLD/<subdir>/`, the `.svg` files at the
 * corpus root under `<subdir>/`.
 *
 * SCOPE (deliberately narrow — this is a *regression* guard, not a
 * correctness proof):
 *
 *   - every `.fold` must parse as JSON and carry the complete FOLD field
 *     set (vertices / edges / faces / assignments / fold angles), with
 *     consistent lengths and in-range vertex indices;
 *   - every `.svg` must be well-formed XML with a root `<svg>` element and
 *     drawn geometry.
 *
 * NOT required (and therefore NOT asserted):
 *
 *   - Kawasaki / Maekawa passing — real works are not all flat-foldable;
 *   - the SVG and the FOLD describing the same geometry — the corpus was
 *     converted from third-party SVGs and some conversions are lossy;
 *   - the corpus matching what `origami generate` produces — the corpus is
 *     the *input* side of the toolchain, not its output.
 *
 * THE CORPUS IS READ-ONLY.  A snapshot of every corpus file (size + mtime)
 * is taken before and after the test run and compared, so an accidental write
 * fails the suite.
 *
 * NO NETWORK / NO BROWSER.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseXml } = require('../../src/utils/xml-lite');
const { FoldAnalyzer } = require('../../src/utils/fold-analyzer');

/** Root of the golden corpus (override with ORIGAMI_GOLDEN_CORPUS). */
const CORPUS_ROOT = process.env.ORIGAMI_GOLDEN_CORPUS
  || path.join(os.homedir(), '文档', 'Unbuntu_system', 'goods', 'origami-examples');

/** Expected number of same-name .fold/.svg pairs in the corpus. */
const EXPECTED_PAIR_COUNT = 77;

/** Assignment values defined by the FOLD specification. */
const FOLD_ASSIGNMENTS = ['B', 'M', 'V', 'F', 'U'];

/** Recursively list every file below `dir`. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Snapshot of every corpus file: relative path → {size, mtimeMs}. */
function snapshotCorpus() {
  const snap = new Map();
  for (const file of walk(CORPUS_ROOT)) {
    const stat = fs.statSync(file);
    snap.set(path.relative(CORPUS_ROOT, file), { size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return snap;
}

/**
 * Find every same-name `.fold` / `.svg` pair.
 *
 * The `.svg` lives at `<subdir>/<name>.svg`, its `.fold` sibling at
 * `FOLD/<subdir>/<name>.fold`.
 *
 * @returns {Array<{fold: string, svg: string, name: string}>}
 */
function findPairs() {
  const files = walk(CORPUS_ROOT);
  const svgs = files.filter((f) => f.toLowerCase().endsWith('.svg'));
  const pairs = [];
  for (const svg of svgs) {
    const rel = path.relative(CORPUS_ROOT, svg);
    const dir = path.dirname(rel);
    const stem = path.basename(rel, path.extname(rel));
    const fold = path.join(CORPUS_ROOT, 'FOLD', dir, `${stem}.fold`);
    if (fs.existsSync(fold)) {
      pairs.push({ fold, svg, name: `${dir}/${stem}` });
    }
  }
  return pairs.sort((a, b) => a.name.localeCompare(b.name));
}

describe('golden corpus — origami-examples', () => {
  let pairs;
  let before;

  beforeAll(() => {
    if (!fs.existsSync(CORPUS_ROOT)) {
      throw new Error(
        `golden corpus not found at ${CORPUS_ROOT} — `
        + 'set ORIGAMI_GOLDEN_CORPUS to point at the corpus directory',
      );
    }
    before = snapshotCorpus();
    pairs = findPairs();
  });

  afterAll(() => {
    // the corpus must not have been modified by this test run
    const after = snapshotCorpus();
    const changed = [];
    for (const [file, stat] of after) {
      const old = before.get(file);
      if (!old) { changed.push(`${file} (new)`); continue; }
      if (old.size !== stat.size || old.mtimeMs !== stat.mtimeMs) {
        changed.push(`${file} (size ${old.size}→${stat.size})`);
      }
    }
    for (const file of before.keys()) {
      if (!after.has(file)) changed.push(`${file} (deleted)`);
    }
    expect(changed).toEqual([]);
  });

  test(`the corpus contains ${EXPECTED_PAIR_COUNT} same-name .fold/.svg pairs`, () => {
    expect(pairs).toHaveLength(EXPECTED_PAIR_COUNT);
    // every pair really is a *same-name* pair
    for (const pair of pairs) {
      expect(path.basename(pair.fold, '.fold')).toBe(path.basename(pair.svg, '.svg'));
    }
  });

  test('every paired .fold parses as JSON and carries the complete FOLD field set', () => {
    const problems = [];
    for (const pair of pairs) {
      let fold;
      try {
        fold = JSON.parse(fs.readFileSync(pair.fold, 'utf8'));
      } catch (error) {
        problems.push(`${pair.name}: .fold is not valid JSON (${error.message})`);
        continue;
      }
      if (!fold || typeof fold !== 'object') {
        problems.push(`${pair.name}: .fold is not an object`);
        continue;
      }

      for (const key of [
        'file_spec', 'vertices_coords', 'edges_vertices',
        'faces_vertices', 'edges_assignment', 'edges_foldAngle',
      ]) {
        if (fold[key] === undefined || fold[key] === null) {
          problems.push(`${pair.name}: .fold is missing "${key}"`);
        }
      }
      if (typeof fold.file_spec !== 'string' || fold.file_spec.length === 0) {
        problems.push(`${pair.name}: file_spec is not a non-empty string`);
      }

      const vertices = fold.vertices_coords;
      const edges = fold.edges_vertices;
      const assignments = fold.edges_assignment;
      const foldAngles = fold.edges_foldAngle;

      if (!Array.isArray(vertices)) { problems.push(`${pair.name}: vertices_coords is not an array`); continue; }
      if (!Array.isArray(edges)) { problems.push(`${pair.name}: edges_vertices is not an array`); continue; }
      if (!Array.isArray(assignments)) { problems.push(`${pair.name}: edges_assignment is not an array`); continue; }
      if (!Array.isArray(foldAngles)) { problems.push(`${pair.name}: edges_foldAngle is not an array`); continue; }
      if (!Array.isArray(fold.faces_vertices)) { problems.push(`${pair.name}: faces_vertices is not an array`); continue; }

      if (assignments.length !== edges.length) {
        problems.push(`${pair.name}: edges_assignment (${assignments.length}) ≠ edges_vertices (${edges.length})`);
      }
      if (foldAngles.length !== edges.length) {
        problems.push(`${pair.name}: edges_foldAngle (${foldAngles.length}) ≠ edges_vertices (${edges.length})`);
      }

      const badAssignment = assignments.find((a) => !FOLD_ASSIGNMENTS.includes(String(a).toUpperCase()));
      if (badAssignment !== undefined) {
        problems.push(`${pair.name}: illegal assignment "${badAssignment}"`);
      }

      const badEdge = edges.find((e) => !Array.isArray(e) || e.length < 2
        || !Number.isInteger(e[0]) || !Number.isInteger(e[1])
        || e[0] < 0 || e[1] < 0 || e[0] >= vertices.length || e[1] >= vertices.length);
      if (badEdge) {
        problems.push(`${pair.name}: edge ${JSON.stringify(badEdge)} references a missing vertex`);
      }

      const badVertex = vertices.find((v) => !Array.isArray(v) || v.length < 2
        || !Number.isFinite(Number(v[0])) || !Number.isFinite(Number(v[1])));
      if (badVertex) {
        problems.push(`${pair.name}: vertex ${JSON.stringify(badVertex)} is not a 2D coordinate`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('every paired .svg is well-formed XML with a root <svg> and drawn geometry', () => {
    const problems = [];
    for (const pair of pairs) {
      const text = fs.readFileSync(pair.svg, 'utf8');
      const doc = parseXml(text);
      if (!doc.ok) {
        problems.push(`${pair.name}: SVG is not well-formed XML (${doc.errors[0].message} @${doc.errors[0].position})`);
        continue;
      }
      const root = doc.root.children.find((c) => c.name === 'svg');
      if (!root) {
        problems.push(`${pair.name}: SVG has no root <svg> element`);
        continue;
      }
      const hasViewBox = typeof root.attrs.viewBox === 'string' && root.attrs.viewBox.length > 0;
      const hasSize = Number.isFinite(parseFloat(root.attrs.width)) && Number.isFinite(parseFloat(root.attrs.height));
      if (!hasViewBox && !hasSize) {
        problems.push(`${pair.name}: root <svg> has neither a viewBox nor a width/height`);
      }
      const drawables = (text.match(/<(path|line|polyline|polygon)\b/g) || []).length;
      if (drawables === 0) {
        problems.push(`${pair.name}: SVG contains no drawn geometry`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('the corpus keeps real crease geometry in the vast majority of the pairs', () => {
    const withGeometry = pairs.filter((pair) => {
      const fold = JSON.parse(fs.readFileSync(pair.fold, 'utf8'));
      return (fold.vertices_coords || []).length > 0 && (fold.edges_vertices || []).length > 0;
    });
    // three corpus files are empty SVG→FOLD conversions (no vertices, no
    // edges); everything else must carry a real crease pattern
    expect(withGeometry.length).toBeGreaterThanOrEqual(EXPECTED_PAIR_COUNT - 3);
  });

  test('every paired .fold can be handed to the repository FoldAnalyzer', () => {
    const problems = [];
    for (const pair of pairs) {
      const fold = JSON.parse(fs.readFileSync(pair.fold, 'utf8'));
      try {
        const basic = new FoldAnalyzer(fold).basicAnalysis();
        if (basic.vertexCount !== (fold.vertices_coords || []).length) {
          problems.push(`${pair.name}: analyzer vertex count mismatch`);
        }
        if (basic.edgeCount !== (fold.edges_vertices || []).length) {
          problems.push(`${pair.name}: analyzer edge count mismatch`);
        }
      } catch (error) {
        problems.push(`${pair.name}: FoldAnalyzer threw (${error.message})`);
      }
    }
    expect(problems).toEqual([]);
  });
});
