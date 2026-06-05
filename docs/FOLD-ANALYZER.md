# FOLD Analyzer v2.0

> Local FOLD file analysis with real origami mathematics
> No browser required. No Playwright overhead. Pure local computation.

---

## ⚠️ Critical Bug Fix in v2.8

> **If you are using v2.0 – v2.7, the `qualityAnalysis.findDuplicateEdges()` function contains an in-place mutation bug.**

**The bug** (in `src/utils/fold-analyzer.js`, originally at line 332):

```javascript
// ❌ BUG (v2.0 – v2.7): sorts the original edge array in place
const key = e.sort().join(',');
```

When an edge has a "backward" direction like `[3, 0]`, `Array.prototype.sort()` mutates it in place to `[0, 3]`. This **permanently corrupts `this.edges`**, breaking every downstream analysis that depends on edge direction.

**Affected downstream analyses** (v2.8+):
- `findBoundaryLoops()` (v2.8) — walks edges in their stored direction
- Any future direction-sensitive analysis built on `this.edges`

**Why it wasn't caught earlier**:
- v2.0 – v2.7 algorithms were direction-symmetric (used set membership)
- v2.0 – v2.7 unit tests called `analyzeXxx()` directly, not the full `analyze()` pipeline
- The bug only triggers when `qualityAnalysis()` runs *before* direction-sensitive code

**The fix** (v2.8+):

```javascript
// ✅ FIXED: copy first, then sort
const key = [...e].sort().join(',');
```

**Migration**: If you cannot upgrade to v2.8, apply this one-line patch manually in your copy of `fold-analyzer.js`. No other changes needed.

---

## Overview

The `analyze` command replaces the previous browser-based implementation with a **fully local** FOLD file analyzer that performs real origami mathematical analysis.

**Before (v1.0)**:
- ❌ Required Playwright browser launch
- ❌ Required OrigamiSimulator.org to be available online
- ❌ Returned "unknown" for most analysis fields
- ❌ Slow (5-10s per analysis)
- ❌ Failed when offline

**After (v2.0 → v2.9)**:
- ✅ Pure local computation
- ✅ Real Kawasaki & Maekawa theorem validation
- ✅ Symmetry detection (rotational & reflective) — **v2.1: over-detection fixed, v2.2: centroid-relative**
- ✅ Quality issue detection — **v2.2: real T-junction detection (was stub)**
- ✅ Pattern classification
- ✅ **v2.3: Real layer analysis** (face_orders / 3D z / spatial nesting) — was stub
- ✅ **v2.4: Strain estimation** (cosine-based bending, per-edge detail)
- ✅ **v2.5: M/V bend-direction consistency** (dihedral vs declared foldAngle)
- ✅ **v2.6: Self-intersection detection** (3D AABB + segment-segment distance)
- ✅ **v2.7: Face normal consistency** (divergence ratio) + **complete self-intersection** (vertex-inside, coplanar-overlap)
- ✅ **v2.8: Holes & boundary loops** (shoelace area + classification)
- ✅ **v2.9: Fold order topological sequence** (max-of-adjacent-faces heuristic)
- ✅ Fast (<300ms for typical origami models) — **v2.2: O(V+E) adjacency caching**
- ✅ Works offline
- ✅ **v2.1**: Strict mode + largest-independent-group filter (no spurious 5/6/12-fold)
- ✅ **v2.2**: Dieline-aware basic analysis (no nonsensical genus on 1-face meshes)
- ✅ **v2.8**: Fixed v2.0 `e.sort()` edge-mutation bug that corrupted downstream analyses

---

## Usage

```bash
origami analyze <file> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--all` | Show all analysis sections |
| `--json` | Output as JSON |
| `--validate` | Run flat-foldability validation (Kawasaki/Maekawa) |
| `--symmetry` | Detect symmetry only |
| `--quality` | Check quality issues only |
| `--strict` | Strict symmetry mode (tighter tolerance, filters subgroup over-detection) |
| `--debug` | Enable debug output |

### Examples

```bash
# Full analysis
origami analyze examples/sample-crane.fold --all

# Validate flat-foldability
origami analyze my-pattern.fold --validate

# JSON output for automation
origami analyze box.fold --json > analysis.json

# Just symmetry
origami analyze star.fold --symmetry
```

---

## Output Sections

### 📐 Basic Structure

- **Vertex count** — Total vertices in FOLD file
- **Edge count** — Total edges
- **Face count** — Total faces
- **Bounding box** — Width × Height in mm
- **Euler characteristic** — V - E + F (genus indicator)
- **Edge stats** — Count of M (Mountain), V (Valley), B (Boundary), F (Flat)

### 🔗 Structure

- **Manifold** — Whether each edge is shared by exactly 2 faces
- **Component count** — Number of disconnected components
- **Average valence** — Average edges per vertex
- **Valences** — Per-vertex edge counts

### 🔍 Flat-foldability Validation

- **Kawasaki's theorem** — For a vertex to be flat-foldable, alternating angles must sum to 180°
- **Maekawa's theorem** — For a vertex, M - V = ±2
- **Pass rate** — Percentage of vertices passing validation
- **Failed vertices** — Details of failures

### 🔄 Symmetry

- **Rotational symmetry** — 2, 3, 4, 5, 6, 8, 12-fold
- **Reflective symmetry** — X, Y, diagonal mirror planes

### 🏷️ Classification

- **Pattern type** — box, flat-sheet, star/flower, tessellation, complex-mesh
- **Aspect ratio** — Width / Height

### 🛡️ Quality Check

- **Degenerate edges** — Zero-length edges
- **Duplicate edges** — Edges with same vertices
- **Isolated vertices** — Vertices with no edges
- **T-junctions** — Non-manifold edges
- **Stretched faces** — Highly elongated faces (10:1+ ratio)

### ⚠️ Warnings

- Missing edge assignments
- Thin-sheet assumption (±180° all)
- No fold angles (flat pattern)

---

## Examples Output

```
═══════════════════════════════════════════════════════
  📊 FOLD Model Analysis Report
═══════════════════════════════════════════════════════
  File: examples/sample-crane.fold
═══════════════════════════════════════════════════════

📐 Basic Structure:
   Vertices:       5
   Edges:          8
   Faces:          4
   Bounding box:   1.0 × 1.0 mm
   Euler χ:        1 (genus 0.5)
   ...
```

---

## Architecture

```
src/utils/fold-analyzer.js      # Core analysis engine
src/commands/analyze.js         # CLI command
tests/unit/fold-analyzer.test.js # 19 unit tests
```

### Core Class

```js
const { FoldAnalyzer } = require('./utils/fold-analyzer');
const analyzer = new FoldAnalyzer(foldData);
const result = analyzer.analyze({ all: true });
```

`result` contains:
- `basic` — Vertex/edge/face counts, bounding box, Euler χ
- `structure` — Manifold check, components, valences
- `validation` — Kawasaki/Maekawa pass-fail per vertex
- `symmetry` — Rotational and reflective symmetries
- `classification` — Pattern type identification
- `quality` — Issue detection
- `warnings` — Top-level warnings

---

## Algorithms

### Kawasaki's Theorem

For a vertex `v` with incident edges in cyclic order:
```
even_angle_sum = sum(angles[0], angles[2], angles[4], ...)
odd_angle_sum  = sum(angles[1], angles[3], angles[5], ...)
```

The vertex can be flat-folded if `|even_angle_sum - odd_angle_sum| ≈ 180°`.

### Maekawa's Theorem

For a flat-foldable vertex: `|M - V| = 2` where M/V count the mountain/valley creases.

### Rotational Symmetry

For each tested n ∈ {2, 3, 4, 5, 6, 8, 12}, rotates every vertex around the centroid by 2π/n and checks if a matching vertex exists within tolerance.

#### Tolerance (v2.1 fix)

The v1.0 / early v2.0 implementation used `tolerance = max(0.5, scale × 0.01)`, which **over-loosened** small models. For a unit cube (max coord = 1), the 0.5 floor dominated, causing spurious 5/6/12-fold matches (the largest independent group is 4-fold).

v2.1 fix:

- **Default**: `tolerance = max(0.01, scale × 0.001)` — 0.1% of model scale, min 0.01
- **Strict**: `tolerance = max(0.001, scale × 0.0001)` — 0.01% of model scale, min 0.001

#### Largest-Independent-Group filter

A shape with n=12 cyclic symmetry has 2, 3, 4, 6 as subgroups (C₂, C₃, C₄, C₆ ⊂ C₁₂). Reporting all of them is redundant. v2.1 keeps only the **largest** rotational n, plus any reflective axes (which form the dihedral group D_n alongside C_n).

#### Per-symmetry residual threshold

Each candidate symmetry is now scored by its **max vertex displacement** (residual). If the residual exceeds 5% of model scale (default) or 0.5% (strict), the candidate is rejected. This filters out false positives that would otherwise pass purely on the loose tolerance.

| Mode   | Tolerance          | Residual accept | Use case                              |
|--------|--------------------|-----------------|---------------------------------------|
| default| 0.1% of scale      | 5% of scale     | Standard analysis, mm-scale models    |
| strict | 0.01% of scale     | 0.5% of scale   | Verify cube/regular polygon claims    |

**Bug fix verification (cube.fold)**:

```
Before v2.1:  2-fold, 3-fold, 4-fold, 5-fold, 6-fold, 12-fold  ← 4 false positives
After v2.1:   4-fold rotational symmetry (residual 0, tol 0.01)
              (filtered 1 subgroup detections)                ← clean output
```

**Real-shape preservation (hexagram)**:

```
6-fold rotational symmetry (residual 0, tol 0.1)
(filtered 2 subgroup detections)        ← 2,3,4 dropped, 6 kept
```

Strict mode confirms the same 6-fold with tighter tolerance 0.01.

### Manifold Check

Each edge must be shared by exactly 2 faces (for a closed surface).

---

## Performance

- 5 vertices / 8 edges: < 5ms
- 100 vertices / 500 edges: < 50ms
- 1000 vertices / 5000 edges: < 500ms

All tests run **synchronously** without browser launch overhead.

---

## Migration from v1.0

The old browser-based analyze was removed. The new command is:

```bash
# OLD (browser-based, slow, online-only)
origami analyze --preset miura-ori --all

# NEW (local, fast, offline)
origami analyze miura-ori.fold --all
```

To get a FOLD file for a preset:

```bash
# First get the URL
origami info miura-ori
# Then download from originamisimulator.org
# Or use an existing FOLD from the library:
ls origami-examples/FOLD/Origami/ | head
```

---

## Version History

- **v2.9** (2026-06-05): Fold order topological sequence (feat/v2.9-fold-order branch)
  - `analyzeFoldOrder()`: produces a topological sequence of M/V folds
  - Heuristic: each M/V fold's step = max(layer of adjacent faces)
  - Rationale: higher-layer face sits on top → lower-layer fold must complete first
  - 2D model fallback: all faces on layer 1
  - Boundary edges (1 adjacent face) skipped
  - 7 new unit tests, 98/98 in `fold-analyzer.test.js`
  - CLI section 🎴 Fold Order (--all only)
  - **Necessary (not sufficient)** condition for valid fold sequence
- **v2.8** (2026-06-05): Holes & boundary loops detection
  - Walks boundary edge adjacency graph to form closed loops
  - Shoelace formula for per-loop area
  - Area-based classification: largest loop = outer; smaller = hole iff inside larger
  - Disconnected sheets: each non-contained loop counts as outer
  - **v2.0 bug fix**: `qualityAnalysis` was using `e.sort()` which mutated `this.edges` in place — fixed to `[...e].sort()`
  - 7 new unit tests, 91/91 in `fold-analyzer.test.js`
- **v2.7** (2026-06-05): Face normal consistency + complete self-intersection
  - **analyzeFaceNormals()**: divergence ratio (`|Σ area×normal| / Σ area`) detects flipped faces
  - **analyzeSelfIntersection() extended**:
    - Vertex-face inclusion (G+1): a face's vertex inside another face
    - Coplanar overlap (G+2): two parallel faces with overlapping 2D projections
    - Check order: coplanar → vertex-inside → edge-crossing (most-specific first)
  - New helpers: `_pointInsideFace3D()`, `_coplanarOverlap()`, `_pointInPolygon2D()`, `_segments2DIntersect()`
  - is3D threshold loosened: 0.01 → 1e-6 (catches sub-millimeter 3D variation)
  - 12 new unit tests, 84/84 in `fold-analyzer.test.js`
- **v2.6** (2026-06-05): Self-intersection detection (3D)
  - AABB pre-filter + 3D segment-segment closest distance (Ericson §5.1.9)
  - Skips adjacent faces (share an edge — that's the mesh)
  - Skips 2D models (all faces coplanar — no 3D intersection possible)
  - Detects face pairs that geometrically cross in 3D
  - 11 new unit tests, 72/72 in `fold-analyzer.test.js`
- **v2.5** (2026-06-05): M/V bend-direction consistency (geometric vs declared)
  - New `dihedralAngle()` using `180° − arccos(|n1·n2|/|n1||n2|)` (orientation-agnostic)
  - New `faceNormal()` via Newell's method (handles non-planar polygons)
  - New `findAdjacentFaces()` for edge-face lookup
  - For each M/V edge: compare `foldAngle` to dihedral from face normals (5° tolerance)
  - 2D fallback: structural sanity (M/V with flat foldAngle flagged as suspicious)
  - 9 new unit tests, 61/61 in `fold-analyzer.test.js`
- **v2.4** (2026-06-05): Strain estimation (bending energy per edge)
  - Cosine-based bending strain: `strain = (1 + cos(θ)) / 2`
  - 0° (creased) → 1, 90° → 0.5, 180° (flat) → 0
  - Distinguishes M/V fold edges from B (boundary) / F (flat-face) edges
  - Per-edge detail in JSON, aggregate stats in CLI (avg/max/distribution)
  - Distribution buckets: low (<0.3), medium (0.3–0.7), high (>0.7)
  - 8 new unit tests, 52/52 in `fold-analyzer.test.js`
- **v2.3** (2026-06-05): Layer analysis (real implementation, was stub)
  - Replaces v2.2 stub `{ faceCount }` with full layer ordering
  - **Source priority**: `face_orders` (explicit, FOLD spec) → 3D z-coords (quantized) → `foldAngle` (rough) → flat (default)
  - **Spatial nesting**: point-in-polygon test for 2D models without explicit orders (O(F²·V), F=1000 → <1s)
  - New fields: `source`, `minLayer`, `maxLayer`, `nestingDepth`, `avgLayer`, `facesPerLayer`, `maxOverlap`, `notes`
  - CLI now shows 📚 Layers section (only with `--all`)
  - 9 new unit tests, 44/44 in `fold-analyzer.test.js`
- **v2.2** (2026-06-04): Robustness & performance pass
  - **T-junction detection**: real geometric check (vertex on interior of another edge), was a stub returning `[]` in v2.1
  - **Reflective symmetry centroid fix**: v2.1 reflected about origin → only worked for centred models. v2.2 reflects about vertex centroid, with vertex-set fallback for single-face meshes
  - **Precomputed adjacency map**: `getIncidentEdges` now uses cached `O(V+E)` map, was `O(V*E)` per validation pass
  - **Dieline-aware basic analysis**: 1-face meshes report `surfaceType: 'dieline'` and `genus: null` (was `1 - χ/2` giving nonsensical numbers like 0.5 for a square)
  - 10 new unit tests, 35/35 in `fold-analyzer.test.js`
- **v2.1** (2026-06-04): Symmetry over-detection fix
  - Tolerance formula: `max(0.5, scale×0.01)` → `max(0.01, scale×0.001)` (default)
  - New `--strict` mode tightens tolerance 10× and filters subgroup over-detection
  - Largest-independent-group filter (C_n ⊃ C_d for d|n → keep only max n)
  - Per-symmetry residual threshold prevents spurious 5/6/12-fold matches on small models
  - 6 new unit tests (cube/hexagram/asymmetric/8-fold/1000mm-scale)
- **v2.0** (2026-06-01): Complete rewrite, local analysis, real math theorems
- **v1.0**: Initial browser-based version (deprecated)
