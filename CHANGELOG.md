# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-04-16

### Added

- Initial project setup
- Basic CLI framework with Commander.js
- Browser automation with Playwright
- Basic commands:
  - `load` - Load preset models
  - `list` - List available presets
  - `screenshot` - Take screenshots
  - `simulate` - Run simulation
  - `view` - Switch view mode
  - `export` - Export models
  - `record` - Record videos
  - `analyze` - Analyze models
  - `batch` - Batch processing
  - `verify` - Verify file validity
  - `config` - Configuration
- OpenCLI adapter configuration
- Project documentation:
  - README.md
  - PROJECT.md
  - COMMAND-REFERENCE.md
  - ARCHITECTURE.md
  - CONTRIBUTING.md
  - LICENSE
  - TESTS.md

### Known Issues

- File upload (FOLD/SVG) not yet implemented
- Export functions not fully implemented
- Video recording not yet implemented
- Model analysis returns mock data

---

## [0.0.0] - 2026-04-16

### Added

- Project directory created
- npm initialization
- Basic dependencies installed

## [2.19.0] - 2026-06-05 — "fold-analyzer v2.0–v2.19 release"

This is the **fold-analyzer evolution release** — a complete rewrite of the FOLD file analysis engine, replacing the original browser-based v1.0 implementation with a fully local, offline-capable math engine. 19 sub-versions over a single day, 167 new unit tests, 13 new CLI subcommands/flags.

### Major: fold-analyzer v2.0 — Local Math Engine

#### v2.0 — Real origami mathematics
- Basic geometric counts and bounding box
- **Kawasaki's theorem** validation: alternating angles sum to 180°
- **Maekawa's theorem** validation: |M - V| = 2
- Flat-foldability pass/fail per vertex

#### v2.1 — Symmetry over-detection fix
- Strict mode + largest-independent-group filter
- Eliminates spurious 5/6/12-fold matches on small models

#### v2.2 — Robustness & performance
- T-junction detection (was stub)
- Centroid-relative reflective symmetry
- O(V+E) adjacency cache (was O(V*E) per validation)
- Dieline-aware basic analysis (no nonsensical genus)

#### v2.3 — Real layer analysis
- face_orders / 3D z-coord inference
- Spatial nesting via point-in-polygon

#### v2.4 — Strain estimation
- Cosine-based bending: `(1+cos(θ))/2`
- Per-edge detail + M/V filter

#### v2.5 — M/V bend-direction consistency
- Dihedral from face normals (Newell's method)
- Geometric vs declared foldAngle check

#### v2.6 — Self-intersection detection
- AABB pre-filter
- 3D segment-segment closest distance (Ericson §5.1.9)

#### v2.7 — Face normal consistency
- Divergence ratio: |Σ(area × normal)| / Σ(area)
- Complete self-intersection: vertex-inside, coplanar-overlap

#### v2.8 — Holes & boundary loops
- Boundary edge walking
- Shoelace area + classification
- **CRITICAL BUG FIX**: `qualityAnalysis.findDuplicateEdges()` was using `e.sort()` which mutated `this.edges` in place — fixed to `[...e].sort()`. v2.0–v2.7 affected; v2.8+ correct.

#### v2.9 — Fold order topological sequence
- `analyzeFoldOrder()` using max-of-adjacent-faces heuristic on layer data

### Major: Schema & Standardization (v2.10–v2.11)

#### v2.10 — JSON Schema
- `docs/fold-analyzer-schema.json` (draft 2020-12) for full output conformance
- `schemaVersion: "2.10"` field added
- M/V-Layer skip detection: flags `|layer(f1) - layer(f2)| > 1` as `structuralInconsistency`

#### v2.11 — JSON Schema Validator
- `ajv` dependency added (^8.x)
- `validateAgainstSchema()` method
- `--validate-output` CLI flag
- Strips `$schema` field (ajv v8 doesn't support draft 2020-12 meta-schema)

### Major: Deepened Physical Validation (v2.12, v2.14)

#### v2.12 — Strict Kawasaki + Alternating M/V
- `analyzeAlternatingMV()`: M/V must alternate around internal vertices
- `strictKawasaki(topN=10)`: ranks vertices by |evenSum - oddSum|
- **Formula fix during dev**: deviation = |evenSum - oddSum| (NOT |... - 180|, since Kawasaki requires EQUAL sums, both ≈ 180°)

#### v2.14 — Strict Maekawa
- `analyzeMaekawa(topN=10)`: formula `||M - V| - 2|`
- Per-vertex report: M, V, MV (signed), deviation

### Major: Output Modes (v2.13, v2.15–v2.18)

#### v2.13 — Summary Mode
- `summarize()` method: 9 compact fields, 97.4% smaller than `--json`
- `--summary` CLI flag

#### v2.15 — Complete Self-Intersection (Möller)
- `faceTriangles()` for fan-triangulation (handles polygons)
- `triangleTriangleIntersect3D()` (Möller 1997)
- `analyzeCompleteSelfIntersection()` method

#### v2.16 — Visualizer (HTML report)
- `toVisualReport()` method: self-contained HTML with embedded SVG
- M/V color coding, self-intersection highlights
- XSS-safe (HTML-escaped all user inputs)
- `--visualize <file>` CLI flag

#### v2.17 — BVH Acceleration (spatial index)
- `_buildBVH()` / `_queryBVH()` helpers
- `analyzeSelfIntersectionBVH()` method
- O(F log F) build + query vs O(F²) brute force
- `--bvh` CLI flag

#### v2.18 — CLI Refactor (subcommand aliases)
- `summary <file>` (alias for `analyze --summary`)
- `visualize <file>` (alias for `analyze --visualize`)

#### v2.19 — Validate Subcommand (CI/CD-friendly)
- `validate <file>` (alias for `analyze --validate-output`)
- CI/CD-friendly exit codes:
  - 0 = valid
  - 2 = validation failed
  - 3 = version mismatch
- `--json` flag for machine-readable output

### Test Coverage
- **fold-analyzer.test.js**: 9 tests (v2.0) → 176 tests (v2.19) — **+167 tests, +1856%**
- All versions unit-tested, real-file verified on hypar.fold
- Performance: 200-300ms for typical origami models

### Performance Characteristics
| Version | Complexity | Notes |
|---------|------------|-------|
| v2.6 self-intersection | O(F²) | Brute-force pair test |
| v2.15 complete self-intersection | O(F²) | Möller tri-tri |
| v2.17 BVH self-intersection | O(F log F) | BVH-accelerated |
| v2.13 summary | 9 fields | 97.4% smaller than full |

### CLI Subcommands (v2.18–v2.19 ergonomic layer)
- `origami analyze <file>` — full analysis (v2.0+)
- `origami summary <file>` — compact JSON (v2.13/v2.18)
- `origami visualize <file>` — HTML report (v2.16/v2.18)
- `origami validate <file>` — schema check, CI/CD exit codes (v2.11/v2.19)
- `origami load`/`list`/`screenshot`/`simulate`/`view`/`export`/`record`/`batch`/`verify`/`config`/`dieline`/`bind`/`render`/`template` (unchanged from 0.1.0)

### Dependencies Added
- `ajv` (^8.20.0) — JSON Schema validation (v2.11)

### Notes
- This release is the **fold-analyzer v2.0–v2.19 series** (a single day's evolution captured)
- For v2.0–v2.7 users, the v2.0 in-place mutation bug fix (`e.sort()` → `[...e].sort()`) is critical — see [docs/FOLD-ANALYZER.md](docs/FOLD-ANALYZER.md) "⚠️ Critical Bug Fix in v2.8"
- Schema version is "2.10" (frozen at v2.10); v2.11+ are additive-only and don't bump schema

### Verified On
- hypar.fold (3D origami, 96 vertices / 207 edges)
- miura-ori, waterbomb, cranes, etc. (origami-examples/FOLD/Origami/)
- Custom-crafted test cases (unit + integration)
