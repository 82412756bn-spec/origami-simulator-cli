/**
 * Generate Command (v2.47.4)
 *
 * `origami generate <pattern>` turns an *intent* (a named pattern plus a few
 * numbers) into a **pair** of artifacts:
 *
 *   <name>.fold   machine readable, verifiable (FoldAnalyzer can parse it)
 *   <name>.svg    printable / renderable / uploadable to origamisimulator.org
 *
 * The pair is mandatory by design: this repository has no generic
 * "crease-pattern SVG → FOLD" converter (task brief §1.2), so verification
 * always runs against the FOLD half while the SVG half exists for humans.
 *
 * After writing the artifacts the command runs the full verification suite
 * (criteria A-F of the task brief) and prints which criteria passed.
 *
 * Interface (fixed by the task brief §2 — do not invent a different one):
 *
 *   origami generate <pattern> [options]
 *
 *     -o, --output-dir <path>   output directory (default ./generated)
 *     -f, --format <fmt>        fold | svg | both (default both)
 *     -s, --seed <n>            random seed (default 42)
 *     -t, --thickness <mm>      paper thickness (default 1.0)
 *         --width / --height    size, mapped onto the generator's own size
 *                               parameter (see `origami generate --help`)
 *     -q, --quiet               print only the resulting paths
 *         --json                print the verification report as JSON
 *
 * Plus the pattern-specific parameters (`--arms`, `--grid`, `--rows`, …),
 * whose ranges and defaults live in src/utils/crease-pattern-factory.js.
 *
 * Scope note for criterion C: Kawasaki + Maekawa are **local necessary
 * conditions only**.  Passing them does NOT mean the pattern folds flat —
 * global flat-foldability is NP-hard and out of scope.
 */

const path = require('path');
const fs = require('fs');

const { FoldAnalyzer } = require('../utils/fold-analyzer');
const { normalizeCreasePattern, dedupeVertices } = require('../utils/crease-pattern-normalizer')
const { detectCreaseCrossings, checkLocalFlatFoldability } = require('../utils/crease-pattern-2d');
const { matchSvgToFold, checkSvgGeometry, ASSIGNMENT_COLORS } = require('../utils/svg-crease-parser');
const { parseXml } = require('../utils/xml-lite');
const { findTemplate, loadTemplateFold, transformTemplate } = require('../utils/template-transform');
const { loadFamilies, mapIntent, resolveFamily } = require('../utils/intent-map');
const CreasePatternGeneratorV3 = require('../crease-pattern-generator-v3');
const {
  PATTERNS,
  PATTERN_NAMES,
  getPattern,
  buildParams,
  generateRaw,
  describePatterns,
  cliOptionMap,
} = require('../utils/crease-pattern-factory');

/** Output formats accepted by --format. */
const FORMATS = ['fold', 'svg', 'both'];

/** SVG canvas used by the generator (matches generateSVG's defaults). */
const SVG_CANVAS = { width: 800, height: 800, padding: 50 };

/**
 * Run `fn` with console.log / console.warn muted.
 *
 * The upstream generators chat on stdout ("✅ 自动计算了 N 个面").  That
 * would corrupt the `--json` output and pollute `--quiet` output, so it is
 * suppressed for the duration of the generation.
 */
function withMutedConsole(fn) {
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

/**
 * Fail with a clear message and a non-zero exit code.
 * @param {string} message
 * @param {string} [hint]
 */
/** 模板 id 列表（给错误提示用） */
function loadManifestNames() {
  try {
    const { loadManifest } = require('../utils/template-transform');
    return (loadManifest().templates || []).map((t) => t.id).join(', ');
  } catch (e) {
    return '(清单不可读)';
  }
}

function fail(message, hint) {
  console.error(`❌ ${message}`);
  if (hint) console.error(`   ${hint}`);
  process.exit(1);
}

/**
 * Parse a numeric CLI option, rejecting anything that is not a finite number.
 * @param {string} name
 * @param {*} raw
 * @param {number} fallback
 * @returns {number}
 */
function parseNumericOption(name, raw, fallback) {
  if (raw === undefined || raw === null) return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    fail(`Invalid value for --${name}: "${raw}" is not a number`);
  }
  return num;
}

/**
 * Generate a crease pattern and verify it.
 *
 * @param {string} patternName
 * @param {Object} options - parsed CLI options
 * @returns {Object} { artifacts, verification, params, foldData, svgText }
 */
function generatePattern(patternName, options = {}) {
  const pattern = getPattern(patternName);
  if (!pattern) {
    fail(
      `Unknown pattern: "${patternName}"`,
      `Available patterns: ${PATTERN_NAMES.join(', ')}`
    );
  }

  // ── format ───────────────────────────────────────────────────────
  const format = String(options.format || 'both').toLowerCase();
  if (!FORMATS.includes(format)) {
    fail(`Invalid format: "${options.format}"`, `Valid formats: ${FORMATS.join(', ')}`);
  }

  // ── seed / thickness ─────────────────────────────────────────────
  const seed = parseNumericOption('seed', options.seed, 42);
  if (!Number.isInteger(seed) || seed < 0) {
    fail(`Invalid value for --seed: "${options.seed}" (expected a non-negative integer)`);
  }
  const thickness = parseNumericOption('thickness', options.thickness, 1.0);
  if (thickness <= 0) {
    fail(`Invalid value for --thickness: "${options.thickness}" (expected a positive number)`);
  }

  // ── parameters ───────────────────────────────────────────────────
  const optionMap = cliOptionMap(patternName);
  const overrides = {};
  for (const [cliName, param] of Object.entries(optionMap)) {
    if (options[cliName] !== undefined && options[cliName] !== null) {
      overrides[param] = options[cliName];
    }
  }
  // Generic --width / --height map onto this pattern's own size parameter.
  const sizeMap = pattern.sizeParams;
  if (options.width !== undefined && options.width !== null) {
    overrides[sizeMap.width] = options.width;
  }
  if (options.height !== undefined && options.height !== null) {
    overrides[sizeMap.height] = options.height;
  }

  const { params, errors } = buildParams(patternName, overrides);
  if (errors.length > 0) {
    fail(
      `Invalid parameter value for pattern "${patternName}"`,
      errors.join('\n   ')
    );
  }

  // ── generate + normalize ─────────────────────────────────────────
  const raw = withMutedConsole(() => generateRaw(patternName, params));
  const { foldData, report: normalizeReport } = normalizeCreasePattern(raw, {
    thickness,
    seed,
    pattern: patternName,
    params,
  });

  // 顶点去重（2026-11-26）：生成器的 idx(i,j) 映射会让同一坐标被 push 两次
  // （实测 crane 1500 顶点里 15 组重复、tiger 12 组）→ SVG 侧出现重复圆点。
  const deduped = dedupeVertices(foldData);
  const verticesRemoved = (foldData.vertices_coords || []).length -
    (deduped.vertices_coords || []).length;
  const foldDataFinal = deduped;
  if (verticesRemoved > 0) {
    console.log(`   （去重 ${verticesRemoved} 个重复顶点）`);
  }

  // ── artifacts ────────────────────────────────────────────────────
  const outputDir = path.resolve(options.outputDir || './generated');
  const baseName = patternName;
  const foldPath = path.join(outputDir, `${baseName}.fold`);
  const svgPath = path.join(outputDir, `${baseName}.svg`);

  fs.mkdirSync(outputDir, { recursive: true });

  const svgText = withMutedConsole(() =>
    new CreasePatternGeneratorV3().generateSVG(foldDataFinal, SVG_CANVAS));

  const artifacts = { fold: null, svg: null };
  if (format === 'fold' || format === 'both') {
    fs.writeFileSync(foldPath, JSON.stringify(foldDataFinal, null, 2), 'utf8');
    artifacts.fold = foldPath;
  }
  if (format === 'svg' || format === 'both') {
    fs.writeFileSync(svgPath, svgText, 'utf8');
    artifacts.svg = svgPath;
  }

  // ── verification (criteria A-F) ──────────────────────────────────
  const verification = verifyArtifacts({ patternName, params, seed, thickness, foldData: foldDataFinal, svgText, artifacts, format });

  return {
    pattern: patternName,
    params,
    seed,
    thickness,
    artifacts,
    verification,
    foldData: foldDataFinal,
    svgText,
    normalizeReport,
  };
}

/**
 * 从一份现成的 foldData 落盘产物并验证（模板模式用）。
 *
 * 与 generatePattern 共用同一套落盘与判据逻辑（A-F），只是**不再调用生成器**，
 * 而是用模板经对称变换得到的 foldData。
 */
function generateFromFoldData(baseName, foldDataIn, options = {}) {
  const format = String(options.format || 'both').toLowerCase();
  if (!FORMATS.includes(format)) {
    fail(`Invalid format: "${options.format}"`, `Valid formats: ${FORMATS.join(', ')}`);
  }
  const thickness = parseNumericOption('thickness', options.thickness, 1.0);
  if (thickness <= 0) {
    fail(`Invalid value for --thickness: "${options.thickness}" (expected a positive number)`);
  }

  // 顶点去重（与 generatePattern 同一处理）
  const deduped = dedupeVertices(foldDataIn);
  const removed = (foldDataIn.vertices_coords || []).length -
    (deduped.vertices_coords || []).length;
  const foldDataFinal = deduped;
  // 转换器产出的 FOLD 不带 thickness 字段 → 模板模式产物在这里补上，
  // 否则判据 B 会报 thickness=undefined（实测 miura-ori 模板 3 份阵列时出现）。
  if (typeof foldDataFinal.thickness !== 'number') {
    foldDataFinal.thickness = thickness;
  }
  if (removed > 0) {
    console.log(`   （去重 ${removed} 个重复顶点）`);
  }

  // 面片重算（模板的 faces 为空 → 判据 B 会报 F=0）。用生成器自带的 computeFaces。
  try {
    const gen = new CreasePatternGeneratorV3();
    const faces = gen.computeFaces(
      foldDataFinal.vertices_coords || [],
      foldDataFinal.edges_vertices || [],
      foldDataFinal.edges_assignment || []
    );
    if (Array.isArray(faces) && faces.length > 0) {
      foldDataFinal.faces_vertices = faces;
    }
  } catch (e) {
    console.log(`   （面片重算跳过：${e.message}）`);
  }

  const outputDir = path.resolve(options.outputDir || './generated');
  const foldPath = path.join(outputDir, `${baseName}.fold`);
  const svgPath = path.join(outputDir, `${baseName}.svg`);
  fs.mkdirSync(outputDir, { recursive: true });

  const svgText = withMutedConsole(() =>
    new CreasePatternGeneratorV3().generateSVG(foldDataFinal, SVG_CANVAS));

  const artifacts = { fold: null, svg: null };
  if (format === 'fold' || format === 'both') {
    fs.writeFileSync(foldPath, JSON.stringify(foldDataFinal, null, 2), 'utf8');
    artifacts.fold = foldPath;
  }
  if (format === 'svg' || format === 'both') {
    fs.writeFileSync(svgPath, svgText, 'utf8');
    artifacts.svg = svgPath;
  }

  const verification = verifyArtifacts({
    patternName: baseName,
    params: { template: baseName, ...(foldDataFinal.metadata && foldDataFinal.metadata.template_transform) },
    seed: parseNumericOption('seed', options.seed, 42),
    thickness,
    foldData: foldDataFinal,
    svgText,
    artifacts,
    format,
  });

  return {
    pattern: baseName,
    params: { template: baseName },
    seed: parseNumericOption('seed', options.seed, 42),
    thickness,
    artifacts,
    verification,
    foldData: foldDataFinal,
    svgText,
    normalizeReport: null,
  };
}

/**
 * Run criteria A-F over the generated artifacts.
 *
 * @param {Object} context
 * @returns {Object} criteria report
 */
function verifyArtifacts(context) {
  const { foldData, svgText, artifacts, format } = context;
  const criteria = {};

  // ── A: artifact pair ─────────────────────────────────────────────
  const expectFold = format === 'fold' || format === 'both';
  const expectSvg = format === 'svg' || format === 'both';
  const foldExists = artifacts.fold ? fs.existsSync(artifacts.fold) : true;
  const svgExists = artifacts.svg ? fs.existsSync(artifacts.svg) : true;
  criteria.A = {
    pass: foldExists && svgExists,
    detail: `fold=${foldExists ? '✓' : '✗'} svg=${svgExists ? '✓' : '✗'}`,
    note: 'The .fold/.svg pair is mandatory: this repo has no crease-pattern SVG→FOLD converter.',
  };

  // ── B: FOLD legality ──────────────────────────────────────────────
  const assignments = foldData.edges_assignment || [];
  // FOLD 规范（f-u-gram）允许的 edges_assignment 取值：
  //   M 山折 / V 谷折 / B 边界 / F 平折 / U 未指定
  // 此前只认 B/M/V → 把 F 与 U 误判成非法（实测 flat_crane 的 12 个 U 被误报）
  const VALID_ASSIGNMENTS = ['B', 'M', 'V', 'F', 'U'];
  const badAssignments = assignments.filter((a) => !VALID_ASSIGNMENTS.includes(String(a).toUpperCase()));
  const vertices = foldData.vertices_coords || [];
  const edges = foldData.edges_vertices || [];
  const faces = foldData.faces_vertices || [];
  const thickness = foldData.thickness;
  let analyzerOk = true;
  let analyzerError = null;
  try {
    const analyzer = new FoldAnalyzer(foldData);
    analyzer.basicAnalysis();
  } catch (error) {
    analyzerOk = false;
    analyzerError = error.message;
  }
  criteria.B = {
    pass: analyzerOk
      && vertices.length > 0
      && edges.length > 0
      && faces.length > 0
      && badAssignments.length === 0
      && typeof thickness === 'number' && thickness > 0,
    detail: `V=${vertices.length} E=${edges.length} F=${faces.length} `
      + `assignments=${assignments.length} (invalid ${badAssignments.length}) `
      + `thickness=${thickness}`,
    analyzerError,
  };

  // ── C: local necessary conditions (Kawasaki + Maekawa) ───────────
  const local = checkLocalFlatFoldability(foldData);
  criteria.C = {
    pass: local.pass,
    detail: `Kawasaki ${local.kawasaki.passCount}/${local.kawasaki.checked} `
      + `· Maekawa ${local.maekawa.passCount}/${local.maekawa.checked} `
      + `· interior vertices ${local.kawasaki.interiorVertices}`,
    scope: 'LOCAL NECESSARY CONDITIONS ONLY — passing does not mean the pattern folds flat '
      + '(global flat-foldability is NP-hard and out of scope)',
    kawasaki: local.kawasaki,
    maekawa: local.maekawa,
  };

  // ── D: 2D crease crossings (NOT the 3D Möller test) ───────────────
  const crossings = detectCreaseCrossings(foldData);
  criteria.D = {
    pass: crossings.crossingCount === 0,
    detail: `${crossings.crossingCount} proper 2D crossing(s) `
      + `· pairs checked ${crossings.pairsChecked} `
      + `· endpoint touches ${crossings.endpointTouchCount} `
      + `· collinear overlaps ${crossings.collinearOverlapCount}`,
    method: crossings.method,
    epsilon: crossings.epsilon,
  };

  // ── E: SVG ↔ FOLD consistency ────────────────────────────────────
  const match = matchSvgToFold(svgText, foldData);
  criteria.E = {
    pass: match.ok,
    detail: `${match.matchedEdges}/${match.foldEdgeCount} edge(s) matched (undirected)`
      + ` · colours ${match.colorMismatches.length === 0 ? 'consistent' : `${match.colorMismatches.length} mismatch(es)`}`,
    notes: match.notes,
  };

  // ── F: SVG well-formedness + renderability ───────────────────────
  const geometry = checkSvgGeometry(svgText, foldData);
  const doc = parseXml(svgText);
  const root = doc.root.children.find((c) => c.name === 'svg');
  const viewBox = root && root.attrs ? root.attrs.viewBox : null;
  const width = root && root.attrs ? parseFloat(root.attrs.width) : NaN;
  const height = root && root.attrs ? parseFloat(root.attrs.height) : NaN;
  const viewBoxOk = (() => {
    if (!viewBox) return false;
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
    return parts[2] > 0 && parts[3] > 0;
  })();
  const sizeOk = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const colorsOk = match.colorMismatches.length === 0;
  const collinearOk = crossings.collinearOverlapCount === 0;
  criteria.F = {
    pass: doc.ok && viewBoxOk && sizeOk && geometry.ok && colorsOk && collinearOk,
    detail: `XML ${doc.ok ? '✓' : '✗'} · viewBox ${viewBox || 'missing'} · size ${width}×${height}`
      + ` · zero-length edges ${geometry.zeroLengthEdges}`
      + ` · duplicate vertices ${geometry.duplicateVertices + geometry.foldDuplicateVertices}`
      + ` · collinear overlaps ${crossings.collinearOverlapCount}`
      + ` · M/V/B colours ${colorsOk ? '✓' : '✗'}`,
    xmlErrors: doc.errors,
    expectedColors: ASSIGNMENT_COLORS,
  };

  return criteria;
}

/**
 * Print the human-readable verification report.
 * @param {Object} result - generatePattern() result
 */
function printReport(result) {
  const { artifacts, verification, params, pattern, seed, thickness } = result;
  const c = verification;

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  📐 Generated crease pattern: ${pattern}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   Parameters: ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`   Seed: ${seed}   Thickness: ${thickness} mm`);
  if (artifacts.fold) console.log(`   FOLD: ${artifacts.fold}`);
  if (artifacts.svg) console.log(`   SVG:  ${artifacts.svg}`);
  console.log('');
  console.log('🔍 Verification:');

  const line = (tag, ok, detail) => {
    console.log(`   ${tag} ${ok ? '✅' : '⚠️ '} ${detail}`);
  };
  line('A  Artifact pair   ', c.A.pass, c.A.detail);
  line('B  FOLD legality   ', c.B.pass, c.B.detail);
  line('C  Local necessary ', c.C.pass, c.C.detail);
  console.log(`      ℹ️  ${c.C.scope}`);
  line('D  2D crossings    ', c.D.pass, c.D.detail);
  line('E  SVG ↔ FOLD      ', c.E.pass, c.E.detail);
  line('F  SVG well-formed ', c.F.pass, c.F.detail);

  if (!c.C.pass) {
    console.log('');
    console.log('   ⚠️  Criterion C is a LOCAL NECESSARY CONDITION check only.');
    console.log('      A failure means the pattern is not a valid flat-foldable crease');
    console.log('      pattern; it does NOT say anything about the other criteria.');
  }
  console.log('');
  console.log('✅ Generation complete');
}

/**
 * Register the `generate` command with Commander.
 * @param {Command} program
 */
function registerGenerateCommand(program) {
  program
    // 位置参数改为可选：模板模式（--template）不需要位置参数；
    // 「两者都不给」与「两者都给」由 action 里的校验给出清晰错误。
    .command('generate [pattern]')
    .description('Generate a crease pattern as a .fold + .svg pair')
    .option('-o, --output-dir <path>', 'Output directory', './generated')
    .option('-f, --format <fmt>', 'Output format: fold | svg | both', 'both')
    .option('-s, --seed <n>', 'Random seed (same seed ⇒ byte-identical output)', '42')
    .option('-t, --thickness <mm>', 'Paper thickness in mm', '1.0')
    .option('--width <n>', 'Pattern width (mapped onto the generator\'s own size parameter)')
    .option('--height <n>', 'Pattern height (mapped onto the generator\'s own size parameter)')
    .option('-q, --quiet', 'Print only the resulting paths')
    .option('--json', 'Print the verification report as JSON')
    .option('--arms <n>', 'Star/radial: number of arms')
    .option('--rings <n>', 'Star: number of concentric rings')
    .option('--radius <n>', 'Star/radial/modular: outer radius')
    .option('--grid <n>', 'Crane/fish/tiger: crease grid resolution')
    .option('--rows <n>', 'Miura: number of rows')
    .option('--cols <n>', 'Miura: number of columns')
    .option('--layers <n>', 'Radial: number of spike rings')
    .option('--spike-height <n>', 'Radial: spike height')
    .option('--spike-count <n>', 'Modular: number of spikes')
    .option('--unit-length <n>', 'Modular: unit length')
    .option('--paper-size <n>', 'Unit: paper edge length')
    .option('--template <id>', 'Use a real crease pattern from templates/ as the base (MIT, see templates/LICENSE)')
    .option('--intent <family>', 'Generate from an intent (base|origami|tessellation|pleat|kirigami|popup|...)')
    .option('--motif <name>', 'Intent mode: pick a specific motif within the family')
    .option('--symmetry <n>', 'Intent mode: symmetry order (how many rotated copies)')
    .option('--copies <n>', 'Template mode: how many rotated copies (1-64)')
    .option('--rotate <deg>', 'Template mode: rotation step between copies in degrees (-360..360)')
    .option('--scale <s>', 'Template mode: overall scale factor (0.01..100)')
    .addHelpText('after', `
Patterns:
${describePatterns()}

Notes:
  - The .fold/.svg pair is mandatory (no crease-pattern SVG→FOLD converter in this repo).
  - Criterion C checks LOCAL NECESSARY CONDITIONS (Kawasaki + Maekawa) only —
    passing them does NOT mean the pattern folds flat.
`)
    .action((pattern, options) => {
      // ── 模板模式 ──────────────────────────────────────────────
      const hasTemplate = options.template !== undefined;
      const hasIntent = options.intent !== undefined;
      const isPositional = pattern !== undefined && pattern !== null && pattern !== '';
      if (hasTemplate && isPositional) {
        fail('同时给了位置参数（pattern）和 --template，两者互斥',
             '用 `origami generate --template <id>` 或 `origami generate <pattern>`，二选一。');
        return;
      }
      if (!hasTemplate && !hasIntent && !isPositional) {
        fail('缺少目标：给一个 pattern 名或 --template <id>',
             '可用 pattern: ' + Object.keys(require('../utils/crease-pattern-factory').PATTERN_SPECS || {}).join(', ')
             + '；或用 --intent <族>（base / origami / tessellation / pleat / ...）'
             + '；模板见 templates/manifest.json');
        return;
      }
      // ── 意图模式 ────────────────────────────────────────────
      if (hasIntent && hasTemplate) {
        fail('同时给了 --intent 和 --template，两者互斥',
             '意图模式会自动选模板；要用指定模板请用 --template。');
        return;
      }
      if (hasIntent) {
        let families;
        try {
          families = loadFamilies();
        } catch (err) {
          fail(`族表不可用：${err.message}`, '重新安装本包（templates/families.json 是包的一部分）。');
          return;
        }
        const mapped = mapIntent({
          family: options.intent,
          motif: options.motif,
          symmetry: options.symmetry !== undefined ? Number(options.symmetry) : undefined,
          rotation: options.rotation !== undefined ? Number(options.rotation) : undefined,
          scale: options.scale !== undefined ? Number(options.scale) : undefined,
        }, families);
        if (!mapped.ok) {
          fail(`意图无法映射：${mapped.reason}`,
               `支持的形态族：${mapped.supported.join(', ')}`
               + (mapped.roadmap.length ? `｜待补：${mapped.roadmap.join('；')}` : ''));
          return;
        }
        const plan = mapped.plan;
        console.log(`意图 "${options.intent}" → 形态族 ${plan.family}`
          + `｜模板 ${plan.template}`
          + `｜copies=${plan.copies} rotate=${plan.rotate} scale=${plan.scale}`
          + (plan.motifMatched ? `｜motif 命中官方形态 ${plan.motifMatched}` : '')
          + (plan.motifMissed ? `｜⚠️ 未找到 motif "${plan.motifMissed}"，已用族内默认模板`
            + `（可选：${plan.alternatives.join(', ')}）` : ''));
        try {
          const base = loadTemplateFold({ id: plan.template, file: `${plan.template}.fold` });
          const transformed = transformTemplate(base.foldData || base,
            { copies: plan.copies, rotate: plan.rotate, scale: plan.scale });
          const result = generateFromFoldData(plan.template, transformed, options);
          printReport(result);
        } catch (err) {
          fail(`意图生成失败：${err.message}`);
        }
        return;
      }
      if (hasTemplate) {
        let found;
        try {
          found = findTemplate(options.template);
        } catch (err) {
          fail(`模板清单不可用：${err.message}`, '重新安装本包（templates/ 是包的一部分）。');
          return;
        }
        if (!found.template) {
          if (found.candidates.length > 1) {
            fail(`模板名 "${options.template}" 匹配到多个：${found.candidates.join(', ')}`, '请写得更具体。');
          } else {
            fail(`未知模板 "${options.template}"`, '可用模板见 templates/manifest.json（' + loadManifestNames() + '）。');
          }
          return;
        }
        const copies = parseNumericOption('--copies', options.copies, 1);
        const rotate = parseNumericOption('--rotate', options.rotate, 0);
        const scale = parseNumericOption('--scale', options.scale, 1);
        if (copies < 1 || copies > 64) {
          fail(`--copies 超出范围：${copies}`, '允许 1-64。');
          return;
        }
        if (rotate < -360 || rotate > 360) {
          fail(`--rotate 超出范围：${rotate}`, '允许 -360..360。');
          return;
        }
        if (scale <= 0 || scale > 100) {
          fail(`--scale 超出范围：${scale}`, '允许 0.01..100。');
          return;
        }
        try {
          const loaded = loadTemplateFold(found.template);
          const base = loaded.foldData;
          const transformed = transformTemplate(base, { copies, rotate, scale });
          const sr = loaded.report && loaded.report.split;
          if (sr && sr.detected) {
            console.log(`   （模板规范化：在 ${sr.detected} 处折痕交汇点建共享顶点，拆成 ${sr.edgesAfter} 条边）`);
          }
          const result = generateFromFoldData(found.template.id, transformed, options);
          printReport(result);
        } catch (err) {
          fail(`模板生成失败：${err.message}`);
        }
        return;
      }

      const result = generatePattern(pattern, options);

      if (options.json) {
        console.log(JSON.stringify({
          pattern: result.pattern,
          params: result.params,
          seed: result.seed,
          thickness: result.thickness,
          artifacts: result.artifacts,
          criteria: result.verification,
        }, null, 2));
        return;
      }

      if (options.quiet) {
        if (result.artifacts.fold) console.log(result.artifacts.fold);
        if (result.artifacts.svg) console.log(result.artifacts.svg);
        return;
      }

      printReport(result);
    });
}

module.exports = {
  registerGenerateCommand,
  generatePattern,
  verifyArtifacts,
  printReport,
  FORMATS,
  SVG_CANVAS,
  PATTERNS,
  PATTERN_NAMES,
};
