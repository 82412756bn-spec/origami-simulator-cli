# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.47.0] - 2026-11-26

> 说明：本仓库的变更记录在 2.43.0 之后中断，2.44 / 2.45 / 2.46 三个版本此前没有条目
> （2.45 新增 OBJ/MTL 导出，2.46 新增批量折纸命令与 GPU PBD 求解器）。
> 本条把「叙述与交付漂移」一次性收口。

### Fixed

- **版本号单一真相源**（新增 `src/version.js`）：`origami --version`、REST `/health`、
  MCP `serverInfo.version` 三处全部改为读 `package.json`。此前源码里有 3 处硬编码版本
  —— `src/index.js` 的 `0.2.0`、`src/api/server.js` 的 `2.32.0`、`src/mcp/server.js` 的
  `2.40.0` —— 与 `package.json` 的 `2.46.0` 全部不一致；文档里另有 4 处 `0.2.0`。
- **e2e 判据分诊**：`tests/e2e/screenshot.test.js` 原用 Playwright 的 test API 编写，
  却被 Jest 的 `testMatch` 收走，Playwright 直接抛错拒绝执行（该 suite 从未真正跑过）。
  按官方建议拆成两个目录：`tests/e2e/`（Jest 车道）与 `tests/playwright/`（Playwright 车道）。
- **6 处陈旧判据**：写死「恰好 8 个 preset」（实际 27）· 断言已改名的日文 preset
  `富士山`/`爆弾`（旧别名降级为 `LEGACY_PRESETS` 兼容映射，另补一条用例锁住）·
  `analyze --preset`（该命令从来只接受文件位置参数）· 三处写死版本字面量的断言。

### Added

- **网络类失败的信号**：`tests/helpers/network.js`（外网探针）+ `tests/helpers/cli.js`
  （只对网络类特征失败重试的调用器）。外网不可达时网络用例整组**显式 skip**
  （明确跳过，不是静默通过）；外网抖动时重试，但确定性失败一次都不重试 —— 不用重试掩盖真 bug。
- **`files` 白名单**：发布包从 215 文件 / 5.6 MB 降到 **71 文件 / 208.7 kB**（解包后 803.7 kB）。
  白名单按目录精确列出（`src/commands/`、`src/utils/`、`src/templates/`、`src/api/`、`src/mcp/`、
  `src/*.js`），**不整目录放行 `src/`** —— 整目录放行会把单测
  （`preset-constants.test.js` 的 `batch` 用例）在 `src/batch-output/` 生成的
  229.5 kB PNG 一起打进包，而 `.npmignore` 对已列入 `files` 的文件无效（npm 文档明说）。

### Changed

- **测试分三条车道**：`npm test`（660 单测）· `npm run test:e2e`（Jest e2e 20 例）·
  `npm run test:e2e:browser`（Playwright e2e 11 例）。
- **README 重写**：定位从「origamisimulator.org 的 CLI」改为「从 FOLD 到成品的折纸/纸艺
  工具链」，并补上负定义（不是网页版的替代品，不是图形编辑器）。
- **覆盖率改为实测**：语句 42.85%（3689/8608）· 分支 39.03% · 函数 53.33% · 行 42.24%。
  （此前仓库里唯一的覆盖率产物只有 4 个文件 / 21.3%，且未入库。）

### Removed

- 运行产物 `src/origami-screenshot.png` 与 `src/batch-output/` 不再入库（已进 `.gitignore`）。

## [2.43.0] - 2026-06-08

### Added

- **WebGL 3D Preview** — Interactive Three.js visualization
  - New file: `src/commands/fold-webgl.js` (300+ lines)
  - Browser-based 3D rendering with Three.js
  - Orbit controls: rotate (left-drag), pan (right-drag), zoom (scroll)
  - Mountain (red) / Valley (blue) / Boundary (green) color coding
  - Material colors from v2.0 format (`faces_color`)
  - Animation support with `--frames` and `--auto-fold`
  - Wireframe overlay toggle
  - Customizable canvas size and background
- **CLI Command**:
  - `origami webgl <file>` — Generate 3D preview
  - `origami webgl <file> -o preview.html` — Custom output
  - `origami webgl <file> --frames` — Include animation frames
  - `origami webgl <file> --auto-fold` — Auto-play animation

### Usage

```bash
# Basic 3D preview
origami webgl model.fold

# With animation
origami webgl model.fold --frames --auto-fold

# Custom size
origami webgl model.fold --width 1200 --height 800

# Wireframe mode
origami webgl model.fold --wireframe
```

### Features

- Three.js from CDN (no local dependency)
- Real-time rendering with 60fps
- Info panel with model stats
- Play/Pause animation controls
- Reset camera button

---

## [2.45.0] - 2026-06-08

### Added

- **OBJ/MTL Export** — High-fidelity 3D model export
  - New file: `src/utils/fold-obj.js` (300+ lines)
  - Wavefront OBJ format with vertex/face export
  - MTL material support with Kd/Ka/Ks/Ns
  - Faces color: `faces_color` → RGB values
  - Faces material: `faces_material` → named materials
  - Auto-triangulation of non-triangular faces
- **CLI Command**:
  - `origami obj <file>` — Export to OBJ
  - `origami obj <file> -o model.obj` — Custom output
  - `origami obj <file> --mtl materials.mtl` — Custom MTL
  - `origami obj <file> --no-mtl` — OBJ only
  - `origami obj <file> --separate-faces` — Per-face objects

### Usage

```bash
# Basic export
origami obj model.fold

# With materials
origami obj model.fold -o model.obj --mtl model.mtl

# No MTL file
origami obj model.fold --no-mtl
```

### Verification

```
$ origami obj test/merge/colored.fold
📦 OBJ written to: test/merge/colored.obj
🎨 MTL written to: test/merge/colored.mtl
   Materials: 1
   Vertices: 4
   Faces: 1
```

---

## [2.44.0] - 2026-06-08

### Added

- **FOLD v2.0 Format Support** — Extended format for advanced features
  - New file: `src/utils/fold-v2.js` (300+ lines)
  - Material properties: `faces_color`, `faces_material`, `faces_texture`
  - Physics properties: `edges_stiffness`, `faces_density`, `vertices_mass`
  - Animation: `animation_keyframes`, `animation_interpolation`
  - Extension namespace: `extensions` for custom metadata
- **CLI Commands** (4 new):
  - `origami v2detect <file>` — Detect format version
  - `origami v2validate <file>` — Validate v2.0 format
  - `origami v2upgrade <file> -o out.fold` — Upgrade to v2.0
  - `origami v2downgrade <file> -o out.fold` — Downgrade to v1.1

### Technical Details

- Backward compatible: works with v1.1, v1.2, and v2.0
- Auto-detection of format version
- Validation with detailed error/warning messages
- Upgrade/downgrade preserves data integrity

### Usage

```bash
# Detect format
origami v2detect model.fold

# Validate
origami v2validate model.fold

# Upgrade
origami v2upgrade v1.fold -o v2.fold

# Downgrade
origami v2downgrade v2.fold -o v1.fold
```

---

## [2.42.0] - 2026-06-08

### Added

- **3-Way FOLD Merge** — Complete version control workflow
  - New file: `src/utils/fold-merge.js` (350+ lines)
  - Three-way geometric alignment (Base, Ours, Theirs)
  - Conflict detection (opposite vertex movements)
  - Auto-merge for non-conflicting changes
  - CLI command: `origami merge <base> <ours> <theirs>`
  - Options: `--output`, `--json`, `--conflict-only`, `--tolerance`

### Technical Details

- Reuses spatial vertex matching from FoldDiff (v2.31)
- Direction similarity check using dot product
- Edge assignment merge logic (M/V/B)
- Face vertex mapping through vertex maps

### Usage

```bash
# Basic merge
origami merge base.fold ours.fold theirs.fold -o merged.fold

# Conflict report only
origami merge base.fold ours.fold theirs.fold --conflict-only

# JSON output for CI/CD
origami merge base.fold ours.fold theirs.fold --json --exit-code
```

### Related

- v2.31: FoldDiff (2-way comparison)
- v2.42: FoldMerge (3-way merge) ← NEW

---

## [2.41.0] - 2026-06-08

### Added

- **GPU PBD Solver** — WebGPU-accelerated Position-Based Dynamics simulation
  - New file: `src/utils/gpu-pbd-solver.js` (450+ lines)
  - Edge constraint compute shader (parallel processing)
  - Bend constraint compute shader (dihedral angle)
  - Fallback to CPU when WebGPU unavailable
- **CLI Integration** — `--gpu` flag for fold command
  - `origami fold <file> --solver spring-mass --gpu`
  - `origami fold <file> --solver spring-mass-cyclic --gpu`
  - Auto-detects WebGPU support and falls back gracefully

### Performance

- Expected: 10-50ms/frame (CPU) → <5ms/frame (GPU)
- Requires browser with WebGPU support (Chrome 113+, Edge 113+)

### Technical Details

- WebGPU Compute Shaders for parallel edge/bend constraints
- GPU buffer management: positions, rest lengths, edge indices
- Bind groups for shader input/output
- Async initialization with lazy device request

---

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

---

## [2.28.0] - 2026-06-08 — "Spring-mass / PBD solver"

Adds a Position-Based Dynamics (PBD) fold solver that handles cyclic patterns correctly. v2.27's tree-based kinematic solver was O(F) and deterministic but approximated cyclic patterns; v2.28 iteratively relaxes edge-length + bending constraints toward a consistent state.

### Added
- `src/utils/spring-mass-solver.js` — PBD solver (280 lines, 0 new deps)
  - Algorithm: bend-once + relax (apply full bending rotation once, then iterate edge constraints)
  - NOT per-iteration bending (that oscillates: rotate 90° every step → never converge)
- `fold <file> --solver spring-mass` flag (kinematic remains default for back-compat)
- `--edge-stiffness 0.3`, `--bending-stiffness 1.0`, `--iterations 100` options
- `tests/unit/spring-mass-solver.test.js` — 17 unit tests (0.3s)

### Bug fixed during dev
- Per-iteration bending oscillates → moved bending to one-shot pre-step
- Root face detection was too loose ("any root vertex" was true for both faces due to shared M-edge vertices) → changed to set-equality

### Limitations (documented in code)
- For CYCLIC patterns, v2.28 only folds edges incident to the root face. Edges between two non-root faces (cyclic inner edges) are skipped. Fully consistent cyclic fold is a v2.29+ goal.

### Test Coverage Summary (v2.0 → v2.28)

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
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| **Total (without preset-constants)** | **555** | **21** | **+546 since v2.0** |

---

## [2.29.0] - 2026-06-08 — "Full cyclic PBD solver"

Fixes v2.28's documented cyclic limitation: v2.28's bend-once + relax only folded M-edges incident to the root face; v2.29's per-iteration dihedral constraint handles ALL M-edges, including inner-cyclic ones between two non-root faces, producing a physically-consistent solution for cyclic patterns.

### Added
- `cyclic: true` mode in `SpringMassSolver` (default: false for v2.28 compat)
- Per-iteration bend CONSTRAINT (replaces v2.28's one-shot bend)
  - Computes CURRENT dihedral via cross-product face normals + atan2
  - Applies rotation = (target - current) * stiffness per outer-face vert
- `cross()` and `projectPerp()` math helpers
- `--solver spring-mass-cyclic` CLI flag
- `tests/unit/cyclic-solver.test.js` — 6 unit tests (0.2s)

### Verified
- square-into-4-triangles fixture (5V, 8E, 4F, cyclic):
  - v2.28: V2/V3 partial folds only. Inner-cyclic M-edges skipped.
  - v2.29: V2/V3 fully folded to z=±5.5. ALL 4 M-edges active.

### Performance
< 5ms for 200 iterations on 5V/8E/4F.

### Test Coverage Summary (v2.0 → v2.29)

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
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| **Total (without preset-constants)** | **561** | **22** | **+552 since v2.0** |

---

## [2.31.0] - 2026-06-08 — "FOLD file diff"

Adds structural + spatial diff between two FOLD files. Useful for version control, code review, and tracking iterative design changes.

### Added
- `src/utils/fold-diff.js` — diff engine (340 lines, 0 new deps)
  - Match vertices by spatial proximity (closest-unmatched B within tolerance)
  - Match edges by (mapped-A, mapped-B) vertex pair
  - Match faces by translated vertex-set signature
  - Diff metadata fields
- `src/commands/fold-diff.js` — `diff <old> <new>` CLI (80 lines)
- 3 output modes: text (default), JSON, HTML (color-coded)
- `tests/unit/fold-diff.test.js` — 19 unit tests (1.3s)

### Two separate thresholds (split during dev to fix test fixture conflict)
- `vertexTolerance` (default 1e-3 mm): matching threshold — max distance to consider two vertices "the same"
- `moveThreshold` (default 0): reporting threshold — matched vertices with distance > this are reported as "moved"

### CLI
- `origami diff <old> <new>` — text
- `origami diff <old> <new> --json` — JSON
- `origami diff <old> <new> --html out.html` — HTML
- `origami diff <old> <new> --exact` — match by index (no spatial)
- `origami diff <old> <new> --tolerance 0.5` — match within 0.5 mm
- `origami diff <old> <new> --move-threshold 1` — report moves > 1 mm
- `origami diff <old> <new> --exit-code` — 0=no changes, 1=changes (for CI/CD)

### Test Coverage Summary (v2.0 → v2.31)

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
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| v2.31   |   329 |     10 | +19 fold-diff.test.js |
| **Total (without preset-constants)** | **580** | **23** | **+571 since v2.0** |
---

## [2.32.0] - 2026-06-08 — "REST API service"

Adds a pure-Node HTTP server that exposes every origami CLI command as a JSON-in/JSON-out REST endpoint. Zero new dependencies (uses built-in `http` + `child_process`).

### Architecture
Server is a thin shell — each request is dispatched by spawning the existing CLI as a subprocess and capturing stdout/stderr/exit. This means every endpoint behaves identically to its CLI counterpart, with no code duplication.

### Endpoints (POST /api/v1/{command})
- `analyze`, `summary`, `visualize`, `kawasaki`, `maekawa`, `selfintersection`, `mvalternation`, `validate`
- `stl` — STL export (returns file path)
- `fold` — fold simulator (solver option: kinematic/spring-mass/spring-mass-cyclic)
- `diff` — requires `foldA` + `foldB` in body
- `batch-analyze` — requires `inputs` array (paths or FOLD objects)

### Plus
- `GET /health` — version + uptime + request count
- `GET /` — HTML API docs
- `GET /api/v1/files/:name` — download generated file (path-traversal blocked)
- `OPTIONS /api/v1/*` — CORS preflight

### CLI
- `origami serve` → 127.0.0.1:3000
- `origami serve --port 8080`
- `origami serve --host 0.0.0.0`

### Test Coverage Summary (v2.0 → v2.32)

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
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| v2.31   |   329 |     10 | +19 fold-diff.test.js |
| v2.32   |   347 |     11 | +18 api-server.test.js |
| **Total (without preset-constants)** | **598** | **24** | **+589 since v2.0** |
---

## [2.36.0] - 2026-06-08 — "WebSocket real-time fold animation"

Adds a WebSocket endpoint that streams fold simulation frames in real-time to a connected client. Zero new dependencies — uses Node's built-in `http.upgrade` event + a hand-rolled minimal WebSocket protocol implementation.

### Protocol
1. Client opens WebSocket to `GET /api/v1/ws/fold`
2. Server sends `101 Switching Protocols`
3. Client sends first text frame: `{"fold": {...}, "options": {...}}`
4. Server streams frames: `ack` → N × `frame` → `done` (or `error`)
5. Either side closes to terminate

### Browser client
`/demo` (v2.36) serves a self-contained HTML+JS+SVG client that connects to the WebSocket, picks a solver, and animates the fold. No build step.

### Test Coverage Summary (v2.0 → v2.36)

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
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| v2.31   |   329 |     10 | +19 fold-diff.test.js |
| v2.32   |   347 |     11 | +18 api-server.test.js |
| v2.36   |   361 |     12 | +14 ws-fold.test.js |
| **Total (without preset-constants)** | **612** | **25** | **+603 since v2.0** |
---

## [2.40.0] - 2026-06-08 — "MCP tool exposure"

Exposes origami commands as MCP tools so AI assistants (Claude, etc.) can call them directly. Communication: JSON-RPC 2.0 over stdio.

### 10 tools
- `analyze_fold` — full FOLD analysis
- `summarize_fold` — compact summary (9 fields)
- `kawasaki_check` — v2.12 Strict Kawasaki
- `maekawa_check` — v2.14 Strict Maekawa
- `fold_simulate` — fold simulator (3 solvers)
- `diff_folds` — compare two FOLD files
- `stl_export` — STL export
- `validate_fold` — ajv schema validation
- `selfintersection_check` — v2.15 Möller
- `mvalternation_check` — v2.12 Alternating M/V

### For Claude Code / Claude Desktop integration
```json
{
  "mcpServers": {
    "origami": { "command": "origami", "args": ["mcp"] }
  }
}
```

### Test Coverage Summary (v2.0 → v2.40)

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
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| v2.31   |   329 |     10 | +19 fold-diff.test.js |
| v2.32   |   347 |     11 | +18 api-server.test.js |
| v2.36   |   361 |     12 | +14 ws-fold.test.js |
| v2.40   |   379 |     13 | +18 mcp-server.test.js |
| **Total (without preset-constants)** | **630** | **26** | **+621 since v2.0** |
