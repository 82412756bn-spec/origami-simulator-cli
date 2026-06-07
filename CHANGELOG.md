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

---

## [2.20.0] - 2026-06-07 — "fold-analyzer first-class CLI integration"

The v2.0–v2.19 fold-analyzer was a strong engine but its CLI surface was scattered: the main `analyze` command, plus three hand-rolled inline alias blocks for `summary`/`visualize`/`validate` in `src/index.js`, and four deep validators (v2.12 Strict Kawasaki, v2.14 Strict Maekawa, v2.15 Möller self-intersection, v2.12 Alternating M/V) that were only reachable via `analyze --all`.

This release makes fold-analyzer a first-class citizen of the CLI: every v2.x feature gets its own top-level subcommand, and a shared helper module removes ~110 lines of duplicated file-loading/error-handling code.

### Added

- **`src/commands/fold-helpers.js`** — shared `runWithFold(file, options, body)` wrapper. Centralizes file resolution, extension check (`.fold` only), JSON parse, `FoldAnalyzer` construction, and `--debug`-aware stack traces. Every fold subcommand now uses it.
- **4 new top-level deep-analysis commands** in `src/commands/fold-deep.js`:
  - `kawasaki <file>` — v2.12 Strict Kawasaki (ranks vertices by `|evenSum - oddSum|`, ±5° tolerance)
  - `maekawa <file>` — v2.14 Strict Maekawa (validates `|M-V| = 2`)
  - `selfintersection <file>` — v2.15 Complete Self-Intersection (Möller triangle-triangle)
  - `mvalternation <file>` — v2.12 Alternating M/V Pattern
  - Each supports `--json` for machine output, `--top <n>` (Kawasaki/Maekawa), `--debug`.
- **3 new subcommand modules** that replaced inline code in `src/index.js`:
  - `src/commands/fold-summary.js` (v2.13/v2.18)
  - `src/commands/fold-visualize.js` (v2.16/v2.18)
  - `src/commands/fold-validate.js` (v2.11/v2.19)
- **`tests/unit/fold-commands.test.js`** — 23 new unit tests covering all 7 new/refactored subcommands, using a fake-Commander pattern (no child_process, no Playwright, runs in <1s).

### Changed

- `src/index.js` shrunk by 110 lines (1116 → 1006). The 3 inline `summary`/`visualize`/`validate` blocks are now one-line `register*Command(program)` calls.
- All fold subcommands now share a single error-handling contract: missing file → `❌ File not found: <path>` and `process.exit(1)`; bad extension → `❌ Unsupported file format: <ext>`; malformed JSON → `❌ Failed to parse FOLD JSON: <msg>`. Behavior matches the old hand-rolled blocks but is now consistent and unit-tested.

### Test Coverage
- **fold-commands.test.js** (new): 23 tests in 0.3s — register, action, JSON output, error paths for all 7 commands
- **Full unit suite**: 15 suites, 450 tests pass in 1.9s
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

---

## [2.21.0] - 2026-06-07 — "DXF/PDF export for manufacturing"

Closes the 'design → verify → manufacture' loop. The fold-analyzer already had complete geometric data and an SVG exporter; this release adds the two formats that actually drive laser cutters / CNC / print.

### Added
- `src/utils/dieline-dxf-exporter.js` — AutoCAD R12 ASCII DXF writer
  - 3 layers: CUT (green, solid), MOUNTAIN (red, dashed), VALLEY (blue, dashed)
  - `$INSUNITS=4` (millimeters) in header
  - LWPOLYLINE for face boundaries + LINE for open segments
  - Output ~12KB for hypar.fold
- `src/utils/dieline-pdf-exporter.js` — pdf-lib cut-pattern sheet (no new dep)
  - A4 default, auto-orients landscape when model is wider than tall
  - Same color/dash conventions as SVG exporter
  - Face fills at 50% gray
  - Bottom legend: Cut / Mountain / Valley
  - Output ~3.4KB for hypar.fold
- `dieline` command now accepts `-f dxf` and `-f pdf` (in both `parse` and `export` subcommands)

### Tests
- `tests/unit/dieline-exporters.test.js` — 19 unit tests (1.1s)

---

## [2.22.0] - 2026-06-07 — "VS Code extension"

A thin VS Code wrapper that integrates the fold-analyzer as a first-class editor experience.

### Added
- `vscode-origami/` — full VS Code extension (no build step, no TypeScript)
  - 6 commands (editor context menu + Command Palette):
    - `Origami: Analyze File` — full analyze --all report
    - `Origami: Visualize` — self-contained HTML in Webview panel
    - `Origami: Validate Output (Schema)` — ajv validation
    - `Origami: Summary (Compact JSON)` — compact JSON
    - `Origami: Strict Kawasaki` — v2.12
    - `Origami: Strict Maekawa` — v2.14
  - Settings: `origami.cliPath` (default `"origami"`), `origami.showOutputOnRun`
  - Activation: onLanguage:json + onCommand:origami.*
  - Visualize reuses a single WebviewPanel (reveal instead of recreate)

### Tests
- `tests/unit/vscode-origami.test.js` — 4 unit tests using `jest.mock('vscode')`

### Packaging
- `cd vscode-origami && vsce package` produces a `.vsix`

---

## [2.23.0] - 2026-06-07 — "batch-analyze + JUnit XML for CI/CD"

Bulk FOLD validation with CI-friendly output.

### Added
- `batch-analyze <inputs...>` — run fold-analyzer on many .fold files at once
  - Inputs: file list, comma-list, glob (`*.fold`, `models/**`), directory (recursive)
  - Actions: `--action analyze|summary|validate|kawasaki|maekawa` (default: `analyze`)
  - Per-file checks: `basic` + `<action>` + `schema` (skip any with `--no-basic` / `--no-schema`)
  - Optional JUnit XML output via `--junit <file>` for CI/CD
  - Exit codes: 0=pass, 1=check failure, 2=input error
- Inline glob walker + JUnit XML writer (no new deps)
- `src/commands/fold-batch.js` — 320 lines

### Tests
- `tests/unit/fold-batch.test.js` — 22 unit tests (1.9s)
  - expandInputs (file / glob / dir / dedup / non-existent)
  - toJUnitXML (header, counts, failures, escaping)
  - CHECKS registry (5 actions × 1 real run on hypar.fold)
  - CLI end-to-end (good path, bad path, exit codes)

---

## Test Coverage Summary (v2.0 → v2.23)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| **Total (without preset-constants)** | **495** | **18** | **+486 since v2.0** |

---

## [2.24.0] - 2026-06-07 — "STL export"

Last gap in the design→verify→manufacture pipeline. STL is the de-facto standard for 3D printing (Cura, PrusaSlicer) and CAM software.

### Added
- `src/utils/fold-stl-exporter.js` — Binary + ASCII STL writer (0 new deps)
  - Binary: 80-byte header + uint32 tri count + 50 bytes/triangle
  - ASCII:  human-readable "solid / facet / vertex" blocks
  - Smart 2D→3D extrusion: quad face → 2 top + 2 bottom + 4 sides × 2 = 12 triangles
  - True 3D passthrough: z≠0 coordinates used as-is
  - Inline fan triangulation (matches `faceTriangles()` in fold-analyzer)
  - Inline normal computation via right-hand-rule cross product
- `stl <file>` top-level command
  - `--ascii` ASCII format (default binary)
  - `--thickness <mm>` sheet thickness (default 1.0)
  - `--no-extrude` skip extrusion for 3D models
  - `--flip-normals` reverse all face normals
  - `--name <name>` custom header name
- `dieline` command extended: `-f stl` (parse + export), `--ascii`, `--thickness`
- `tests/unit/fold-stl.test.js` — 22 unit tests (1.4s)

### Verified On
- Synthetic 50×50mm square: 12 triangles, 684 bytes binary
- 3D tetrahedron: 4 triangles (1 per face), 0 extrusion
- `--thickness 3.5` → v1.z = +1.75 (half offset) ✓
- `--flip-normals` → normal (0,0,1) → (0,0,-1) ✓
- `dieline export -f stl --ascii` → valid ASCII STL ✓

### Test Coverage Summary (v2.0 → v2.24)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| **Total (without preset-constants)** | **517** | **19** | **+508 since v2.0** |

---

## [2.27.0] - 2026-06-07 — "Local real-time fold simulator"

Adds a pure-JS kinematic fold solver that runs the fold simulation locally — no Playwright, no browser, no network. The previous `simulate` command at src/index.js:289 launched a Chromium and drove origamisimulator.org's slider; this new `fold` command does the math in-process in < 5ms per frame.

### Added
- `src/utils/fold-simulator.js` — tree-based kinematic fold solver (rigid origami approximation)
  - Builds face adjacency graph → BFS spanning tree → rotates child faces around shared edges
  - Rodrigues' rotation formula + 4×4 matrix composition (no gl-matrix / no three.js)
  - M=+angle, V=-angle around edge axis; cyclic patterns get first-assignment-wins
- `fold <file>` top-level command (avoids name clash with browser-based `simulate`)
  - `--angle <deg>`, `--percent <0-1>`, `--frames N -o out.json`, `--animate out.html`
  - `--no-mountain-up` to flip M/V convention
- `src/commands/fold-simulate-anim.js` — self-contained HTML animation
  - SVG with isometric projection (z → vertical offset, no WebGL)
  - Slider + play/pause, 20 frames embedded as JSON, ~5KB output
- `tests/unit/fold-simulator.test.js` — 21 unit tests (1.1s)

### Performance
| Fixture | V×E×F | ms/frame |
|---------|-------|---------:|
| L-fold | 6×7×2  | < 1ms |
| TREE_3  | 7×10×3 | < 2ms |
| 20 frames in 100ms total (10× real-time at 30fps target) | | |

### Limitations
- For CYCLIC patterns (most dense origamis), this is an APPROXIMATION: the spanning tree ignores back-edges, so the result may not be physically consistent at the cycle. For TREE-LIKE patterns (waterbomb base, bird base, simple L-folds) it's exact.
- For RIGID-FOLDABLE patterns, results are visually accurate.
- For NON-RIGID patterns (those requiring stretching), results are approximate but useful for visualization.

### Test Coverage Summary (v2.0 → v2.27)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| v2.27   |   287 |      7 | +21 fold-simulator.test.js |
| **Total (without preset-constants)** | **538** | **20** | **+529 since v2.0** |
