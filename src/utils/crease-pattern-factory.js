/**
 * Crease-pattern factory (v2.47.4)
 *
 * The five generators that ship with this CLI were never wired into the CLI:
 * 1130 lines of generator code with zero references and zero coverage.  This
 * module is the single place where a *pattern name* is mapped to
 *
 *   - the generator + method that produces it,
 *   - the parameter set with explicit **defaults**,
 *   - the explicit **valid range** of every parameter (criterion J:
 *     "每个 pattern 的参数有明确范围与默认值；非法参数报清晰错误"),
 *   - how the generic `--width` / `--height` options map onto that
 *     pattern's own size parameter.
 *
 * The pattern list is fixed by the task brief §2:
 *
 *   star | crane | fish | miura | tiger | radial | modular | unit
 *
 * `src/crease-pattern-generator.js` (the early implementation) is
 * intentionally NOT wired up: it exposes no distinct pattern names — it is a
 * second, older copy of the same star/base generators with a different API
 * shape, so mapping it to a pattern name would mean silently picking one of
 * two implementations for the same intent.  The task brief allows skipping
 * it with a stated reason ("creases 早期实现若无法给出明确 pattern，说明理由
 * 并跳过").
 */

const CreasePatternGeneratorV3 = require('../crease-pattern-generator-v3');
const RadialOrigamiGenerator = require('../radial-origami-generator');
const ModularOrigamiGenerator = require('../modular-origami-generator');
const ModularUnitGenerator = require('../modular-unit-generator');

/**
 * Numeric parameter descriptor.
 * @typedef {Object} ParamSpec
 * @property {number} min      - inclusive lower bound
 * @property {number} max      - inclusive upper bound
 * @property {boolean} [integer] - must be an integer (default false)
 */

/**
 * The pattern registry.
 *
 * `defaults`  — values handed to the generator when the user does not
 *               override them.
 * `ranges`    — per-parameter valid range; anything outside is a hard error.
 * `sizeParams`— which generator parameter `--width` / `--height` drive.
 */
const PATTERNS = {
  star: {
    label: 'Star tessellation',
    description: 'Radial star tessellation with N-fold symmetry (crease-pattern-generator-v3)',
    source: 'src/crease-pattern-generator-v3.js',
    generator: () => new CreasePatternGeneratorV3(),
    method: 'generateStarTessellation',
    defaults: { arms: 10, rings: 4, radius: 10 },
    ranges: {
      arms: { min: 3, max: 64, integer: true },
      rings: { min: 1, max: 32, integer: true },
      radius: { min: 0.1, max: 1000 },
    },
    sizeParams: { width: 'radius', height: 'radius' },
    options: [
      { flag: '--arms <n>', param: 'arms', desc: 'Number of radial arms (3-64, default 10)' },
      { flag: '--rings <n>', param: 'rings', desc: 'Number of concentric rings (1-32, default 4)' },
      { flag: '--radius <n>', param: 'radius', desc: 'Outer radius in model units (default 10)' },
    ],
  },

  crane: {
    label: 'Crane bird base',
    description: '真正的鹤基折痕图（preliminary base + 4 条 22.5° 角折痕）',
    source: 'src/crease-pattern-generator-v3.js',
    generator: () => new CreasePatternGeneratorV3(),
    method: 'generateTrueBirdBase',
    defaults: { scale: 1 },
    ranges: {
      scale: { min: 0.1, max: 1000 },
    },
    sizeParams: { width: 'scale', height: 'scale' },
    options: [
      { flag: '--scale <n>', param: 'scale', desc: '模型尺度（默认 1）' },
    ],
  },

  fish: {
    label: 'Fish base',
    description: '鱼基折痕图（preliminary base + 一对相对角的 22.5° 谷折）',
    source: 'src/crease-pattern-generator-v3.js',
    generator: () => new CreasePatternGeneratorV3(),
    method: 'generateFishBase22',
    defaults: { scale: 1 },
    ranges: {
      scale: { min: 0.1, max: 1000 },
    },
    sizeParams: { width: 'scale', height: 'scale' },
    options: [
      { flag: '--scale <n>', param: 'scale', desc: '模型尺度（默认 1）' },
    ],
  },

  miura: {
    label: 'Miura-ori',
    description: 'Miura-ori tessellation (crease-pattern-generator-v3)',
    source: 'src/crease-pattern-generator-v3.js',
    generator: () => new CreasePatternGeneratorV3(),
    method: 'generateMiuraOri',
    defaults: { rows: 5, cols: 8 },
    ranges: {
      rows: { min: 1, max: 256, integer: true },
      cols: { min: 1, max: 256, integer: true },
    },
    sizeParams: { width: 'cols', height: 'rows' },
    options: [
      { flag: '--rows <n>', param: 'rows', desc: 'Number of rows (1-256, default 5)' },
      { flag: '--cols <n>', param: 'cols', desc: 'Number of columns (1-256, default 8)' },
    ],
  },

  tiger: {
    label: 'Tiger base',
    description: '虎基折痕图（preliminary base + 22.5° 预折痕）',
    source: 'src/crease-pattern-generator-v3.js',
    generator: () => new CreasePatternGeneratorV3(),
    method: 'generateTigerBase22',
    defaults: { scale: 1 },
    ranges: {
      scale: { min: 0.1, max: 1000 },
    },
    sizeParams: { width: 'scale', height: 'scale' },
    options: [
      { flag: '--scale <n>', param: 'scale', desc: '模型尺度（默认 1）' },
    ],
  },

  radial: {
    label: 'Radial star',
    description: 'Radial origami with spike rings (radial-origami-generator)',
    source: 'src/radial-origami-generator.js',
    generator: () => new RadialOrigamiGenerator(),
    method: 'generateRadialStar',
    defaults: { arms: 10, layers: 3, radius: 10, spikeHeight: 6 },
    ranges: {
      arms: { min: 3, max: 64, integer: true },
      layers: { min: 1, max: 32, integer: true },
      radius: { min: 0.1, max: 1000 },
      spikeHeight: { min: 0, max: 1000 },
    },
    sizeParams: { width: 'radius', height: 'radius' },
    options: [
      { flag: '--arms <n>', param: 'arms', desc: 'Number of radial arms (3-64, default 10)' },
      { flag: '--layers <n>', param: 'layers', desc: 'Number of spike rings (1-32, default 3)' },
      { flag: '--radius <n>', param: 'radius', desc: 'Outer radius in model units (default 10)' },
      { flag: '--spike-height <n>', param: 'spikeHeight', desc: 'Spike height in model units (default 6)' },
    ],
  },

  modular: {
    label: 'Modular assembled star',
    description: 'Assembled modular origami star (modular-origami-generator)',
    source: 'src/modular-origami-generator.js',
    generator: () => new ModularOrigamiGenerator(),
    method: 'generateAssembledStar',
    defaults: { spikeCount: 10, radius: 10, unitLength: 8 },
    ranges: {
      spikeCount: { min: 3, max: 64, integer: true },
      radius: { min: 0.1, max: 1000 },
      unitLength: { min: 0.1, max: 1000 },
    },
    sizeParams: { width: 'unitLength', height: 'unitLength' },
    options: [
      { flag: '--spike-count <n>', param: 'spikeCount', desc: 'Number of spikes (3-64, default 10)' },
      { flag: '--radius <n>', param: 'radius', desc: 'Module radius in cm (default 10)' },
      { flag: '--unit-length <n>', param: 'unitLength', desc: 'Unit length in cm (default 8)' },
    ],
  },

  unit: {
    label: 'Modular pyramid unit',
    description: 'Single printable pyramid unit (modular-unit-generator)',
    source: 'src/modular-unit-generator.js',
    generator: () => new ModularUnitGenerator(),
    method: 'generatePyramidUnit',
    defaults: { spikeCount: 10, paperSize: 15 },
    ranges: {
      spikeCount: { min: 3, max: 64, integer: true },
      paperSize: { min: 1, max: 200 },
    },
    sizeParams: { width: 'paperSize', height: 'paperSize' },
    options: [
      { flag: '--spike-count <n>', param: 'spikeCount', desc: 'Number of spikes in the assembly (3-64, default 10)' },
      { flag: '--paper-size <n>', param: 'paperSize', desc: 'Paper edge length in cm (1-200, default 15)' },
    ],
  },
};

/** Pattern names in registry order. */
const PATTERN_NAMES = Object.keys(PATTERNS);

/**
 * Look up a pattern.
 * @param {string} name
 * @returns {Object|null}
 */
function getPattern(name) {
  if (!name) return null;
  return PATTERNS[String(name).toLowerCase()] || null;
}

/**
 * Validate one numeric parameter against its range.
 *
 * @param {string} patternName
 * @param {string} param
 * @param {*} value - raw value (string from the CLI or number)
 * @returns {Object} { ok, value, error }
 */
function validateParam(patternName, param, value) {
  const spec = PATTERNS[patternName].ranges[param];
  if (!spec) {
    return { ok: false, error: `unknown parameter "${param}" for pattern "${patternName}"` };
  }

  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) {
    return { ok: false, error: `--${param} must be a number, got "${value}"` };
  }
  if (spec.integer && !Number.isInteger(num)) {
    return { ok: false, error: `--${param} must be an integer, got "${value}"` };
  }
  if (num < spec.min || num > spec.max) {
    return {
      ok: false,
      error: `--${param} must be between ${spec.min} and ${spec.max}, got "${value}"`,
    };
  }
  return { ok: true, value: num };
}

/**
 * Build the generator parameter set for a pattern.
 *
 * Precedence: explicit pattern option > --width/--height mapping > default.
 *
 * @param {string} patternName
 * @param {Object} overrides - raw CLI values keyed by parameter name
 * @returns {Object} { params, errors }
 */
function buildParams(patternName, overrides = {}) {
  const pattern = PATTERNS[patternName];
  const params = { ...pattern.defaults };
  const errors = [];

  for (const [key, raw] of Object.entries(overrides)) {
    if (raw === undefined || raw === null) continue;
    const spec = pattern.ranges[key];
    if (!spec) {
      errors.push(`unknown parameter "${key}" for pattern "${patternName}"`);
      continue;
    }
    const result = validateParam(patternName, key, raw);
    if (!result.ok) errors.push(result.error);
    else params[key] = result.value;
  }

  return { params, errors };
}

/**
 * Produce the raw (not yet normalized) FOLD model for a pattern.
 *
 * @param {string} patternName
 * @param {Object} params
 * @returns {Object} raw FOLD model
 */
function generateRaw(patternName, params) {
  const pattern = PATTERNS[patternName];
  const generator = pattern.generator();
  const method = generator[pattern.method];
  if (typeof method !== 'function') {
    throw new Error(`generator ${pattern.source} has no method ${pattern.method}()`);
  }
  return method.call(generator, params);
}

/**
 * Map Commander's camelCase option names onto generator parameter names.
 *
 * Commander turns `--spike-count` into `options.spikeCount`; this table says
 * which generator parameter that option feeds.
 *
 * @param {string} patternName
 * @returns {Object} { camelCaseOptionName: generatorParamName }
 */
function cliOptionMap(patternName) {
  const map = {};
  const pattern = PATTERNS[patternName];
  if (!pattern) return map;
  for (const opt of pattern.options) {
    const long = opt.flag.split(' ')[0].replace(/^--/, '');
    const camel = long.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    map[camel] = opt.param;
  }
  return map;
}

/**
 * Human-readable help block listing every pattern and its parameters.
 * @returns {string}
 */
function describePatterns() {
  const lines = [];
  for (const name of PATTERN_NAMES) {
    const p = PATTERNS[name];
    lines.push(`  ${name.padEnd(9)} ${p.description}`);
    lines.push(`            defaults: ${Object.entries(p.defaults).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    const opts = p.options.map((o) => o.flag).join(' ');
    lines.push(`            options:  ${opts}`);
    lines.push(`            --width/--height → ${p.sizeParams.width}/${p.sizeParams.height}`);
  }
  return lines.join('\n');
}

module.exports = {
  PATTERNS,
  PATTERN_NAMES,
  getPattern,
  validateParam,
  buildParams,
  generateRaw,
  cliOptionMap,
  describePatterns,
};
