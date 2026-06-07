/**
 * batch-analyze Command (v2.23) — Bulk FOLD validation for CI/CD
 *
 * Runs the local fold-analyzer on a glob pattern / directory / file list
 * and produces:
 *   - Human-readable progress + summary to stdout
 *   - Optional JUnit XML to --junit <file> for CI/CD systems
 *     (GitHub Actions, GitLab CI, Jenkins, CircleCI, etc.)
 *
 * NO browser required — all work is local and offline.
 *
 * Subcommand/action matrix:
 *   --action analyze     — full analyze()  (default)
 *   --action summary     — compact summary JSON
 *   --action validate    — ajv schema validation
 *   --action kawasaki    — v2.12 Strict Kawasaki
 *   --action maekawa     — v2.14 Strict Maekawa
 *
 * Output matrix per file:
 *   1. basic         — basicAnalysis (always — counts)
 *   2. <action>      — the requested action's primary check
 *   3. schema        — JSON schema validation (always, if v2.11+ schema exists)
 *
 * Exit codes:
 *   0 = all files passed all checks
 *   1 = at least one file failed at least one check
 *   2 = input error (no files matched, bad action, etc.)
 */

const path = require('path');
const fs = require('fs');
const { runWithFold } = require('./fold-helpers');

// Per-file "test cases" — each must return { pass: bool, message: string, details?: any }
const CHECKS = {
  analyze: {
    label: 'analyze',
    run(analyzer) {
      const result = analyzer.analyze();
      const issues = (result.quality && result.quality.issues) || [];
      const errors = issues.filter(i => i.type === 'error').length;
      const warnings = issues.filter(i => i.type === 'warning').length;
      return {
        pass: errors === 0,
        message: errors === 0
          ? `${warnings} warning${warnings !== 1 ? 's' : ''}, 0 errors`
          : `${errors} error${errors !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}`,
        details: { errors, warnings, totalIssues: issues.length },
      };
    },
  },
  summary: {
    label: 'summary',
    run(analyzer) {
      const result = analyzer.analyze();
      const s = analyzer.summarize(result);
      return { pass: true, message: `summary v${s.summaryVersion || '?'} ok`, details: s };
    },
  },
  validate: {
    label: 'validate',
    run(analyzer) {
      const result = analyzer.analyze();
      const v = analyzer.validateAgainstSchema(result);
      return {
        pass: v.valid,
        message: v.valid
          ? `schema v${v.schemaVersion} ok`
          : `schema validation failed: ${(v.errors || []).length} error(s)`,
        details: v,
      };
    },
  },
  kawasaki: {
    label: 'kawasaki',
    run(analyzer) {
      const r = analyzer.strictKawasaki(10);
      return {
        pass: r.outOfTolerance === 0,
        message: `${r.outOfTolerance} of ${r.totalChecked} vertices out of tolerance`,
        details: r,
      };
    },
  },
  maekawa: {
    label: 'maekawa',
    run(analyzer) {
      const r = analyzer.analyzeMaekawa(10);
      return {
        pass: r.outOfTolerance === 0,
        message: `${r.outOfTolerance} of ${r.totalChecked} vertices out of tolerance`,
        details: r,
      };
    },
  },
};

/**
 * Expand input patterns to a list of .fold file paths.
 * Supports:
 *   - Glob patterns: STAR-DOT-fold, examples/STAR-DOT-fold, models/DOUBLESTAR/STAR-DOT-fold
 *   - Directories: "examples/" → all .fold files in it (recursive)
 *   - File lists:   "a.fold,b.fold,c.fold"
 *   - Single file:  "hypar.fold"
 */
function expandInputs(inputs, cwd) {
  const files = new Set();

  for (const input of inputs) {
    // Comma-separated list?
    const parts = input.includes(',') ? input.split(',').map(s => s.trim()) : [input];

    for (const part of parts) {
      if (!part) continue;

      // Directory?
      let abs = path.isAbsolute(part) ? part : path.resolve(cwd, part);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        walkDir(abs, files);
        continue;
      }

      // Glob pattern?
      if (/[*?[\]]/.test(part)) {
        const matches = globSync(part, cwd);
        for (const m of matches) files.add(path.resolve(m));
        continue;
      }

      // Plain file
      if (fs.existsSync(abs) && path.extname(abs).toLowerCase() === '.fold') {
        files.add(abs);
        continue;
      }

      // Pretend it's a preset name and try to resolve
      const presetFile = tryResolvePreset(part);
      if (presetFile) {
        files.add(path.resolve(presetFile));
        continue;
      }

      // Last resort: keep as-is (will error later with a clear message)
      files.add(abs);
    }
  }

  return Array.from(files);
}

function walkDir(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, out);
    else if (path.extname(entry.name).toLowerCase() === '.fold') out.add(full);
  }
}

// Tiny glob matcher: **, *, ?  (no external dep)
function globSync(pattern, cwd) {
  // Convert ** to regex .* (handles "examples/**.fold" and "examples/*.fold")
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*\\\*/g, '::DOUBLESTAR::')
    .replace(/\\\*/g, '[^/]*')
    .replace(/::DOUBLESTAR::/g, '.*')
    .replace(/\\\?/g, '[^/]');

  const out = [];
  const base = pattern.includes('/') ? pattern.split('/').slice(0, -1).join('/') : '';
  const searchDir = path.isAbsolute(base) ? base : path.resolve(cwd, base || '.');
  if (!fs.existsSync(searchDir)) return out;

  walkDir(searchDir, new Set());
  // walkDir above adds to `out` Set but we use a local set; redo:
  const collected = new Set();
  walkDir(searchDir, collected);
  for (const f of collected) {
    if (new RegExp('^' + regex + '$').test(path.relative(cwd, f).split(path.sep).join('/'))) {
      out.push(f);
    }
  }
  return out;
}

function tryResolvePreset(name) {
  try {
    const { getPresetFile } = require('../index.js');
    return getPresetFile(name);
  } catch {
    return null;
  }
}

/**
 * JUnit XML writer.
 * Format spec: https://github.com/testmoapp/junitxml
 */
function toJUnitXML(suiteName, fileResults, totalTimeSec) {
  const totalTests = fileResults.reduce((n, fr) => n + fr.checks.length, 0);
  const totalFailures = fileResults.reduce(
    (n, fr) => n + fr.checks.filter(c => !c.pass).length, 0);

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="${esc(suiteName)}" tests="${totalTests}" ` +
    `failures="${totalFailures}" errors="0" time="${totalTimeSec.toFixed(3)}">`
  );

  for (const fr of fileResults) {
    const tests = fr.checks.length;
    const failures = fr.checks.filter(c => !c.pass).length;
    lines.push(
      `  <testsuite name="${esc(fr.file)}" tests="${tests}" ` +
      `failures="${failures}" errors="0" time="${fr.timeSec.toFixed(3)}" ` +
      `timestamp="${fr.startedAt}">`
    );
    for (const c of fr.checks) {
      const tag = `<testcase name="${esc(c.name)}" classname="${esc(fr.file)}" time="${c.timeSec.toFixed(3)}"`;
      if (c.pass) {
        lines.push(`    ${tag}/>`);
      } else {
        lines.push(`    ${tag}>`);
        lines.push(`      <failure message="${esc(c.message)}" type="${esc(c.name)}Error">`);
        lines.push(esc(JSON.stringify(c.details, null, 2)));
        lines.push('      </failure>');
        lines.push('    </testcase>');
      }
    }
    lines.push('  </testsuite>');
  }

  lines.push('</testsuites>');
  return lines.join('\n') + '\n';
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function registerBatchAnalyzeCommand(program) {
  program
    .command('batch-analyze <inputs...>')
    .description('Run fold-analyzer on multiple .fold files (glob / dir / list). Optional JUnit XML output for CI/CD. (v2.23)')
    .option('-a, --action <action>', 'Action: analyze, summary, validate, kawasaki, maekawa (default: analyze)', 'analyze')
    .option('-j, --junit <file>', 'Write JUnit XML report to <file> (CI/CD integration)')
    .option('--no-basic', 'Skip the basicAnalysis check (counts)')
    .option('--no-schema', 'Skip the JSON schema validation check')
    .option('--parallel <n>', 'Process N files in parallel (default: 1)', (v) => parseInt(v, 10), 1)
    .option('--continue', 'Continue on error (default: true). Set --no-continue to stop at first failure.', true)
    .option('--quiet', 'Suppress per-file progress; print only the summary')
    .action(async (inputs, options) => {
      const action = options.action;
      if (!CHECKS[action]) {
        console.error(`❌ Invalid action: ${action}`);
        console.error(`   Valid actions: ${Object.keys(CHECKS).join(', ')}`);
        process.exit(2);
      }

      const cwd = process.cwd();
      const files = expandInputs(inputs, cwd);
      if (files.length === 0) {
        console.error(`❌ No .fold files found matching: ${inputs.join(' ')}`);
        process.exit(2);
      }

      if (!options.quiet) {
        console.log(`🔄 batch-analyze: ${files.length} file(s), action=${action}`);
        console.log('');
      }

      const t0 = Date.now();
      const results = [];

      // Simple sequential processor. Parallel mode could use worker_threads
      // but for typical CI/CD usage (< 100 files) sequential is fine and
      // produces deterministic output.
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = path.relative(cwd, file) || file;
        if (!options.quiet) {
          console.log(`[${i + 1}/${files.length}] ${fileName}`);
        }
        const fr = await runFile(file, action, options, cwd);
        results.push(fr);
        if (!options.quiet) {
          const status = fr.allPass ? '✅' : '❌';
          console.log(`  ${status} ${fr.checks.length} checks in ${(fr.timeSec * 1000).toFixed(0)}ms`);
          for (const c of fr.checks) {
            const icon = c.pass ? '  ✓' : '  ✗';
            console.log(`${icon} ${c.name}: ${c.message}`);
          }
          console.log('');
        }
        if (!fr.allPass && !options.continue) break;
      }

      const totalTimeSec = (Date.now() - t0) / 1000;
      const totalChecks = results.reduce((n, fr) => n + fr.checks.length, 0);
      const totalFailures = results.reduce(
        (n, fr) => n + fr.checks.filter(c => !c.pass).length, 0);
      const passFiles = results.filter(fr => fr.allPass).length;

      // Summary line
      console.log('─'.repeat(60));
      console.log(`📊 batch-analyze summary:`);
      console.log(`   Files:     ${passFiles}/${results.length} passed`);
      console.log(`   Checks:    ${totalChecks - totalFailures}/${totalChecks} passed`);
      console.log(`   Failures:  ${totalFailures}`);
      console.log(`   Time:      ${totalTimeSec.toFixed(2)}s`);

      // JUnit XML
      if (options.junit) {
        const xml = toJUnitXML(`origami-batch-${action}`, results, totalTimeSec);
        const outPath = path.resolve(options.junit);
        fs.writeFileSync(outPath, xml, 'utf8');
        console.log(`   JUnit XML: ${outPath} (${xml.length} bytes)`);
      }

      process.exit(totalFailures > 0 ? 1 : 0);
    });
}

/**
 * Run all checks for a single file. Returns a structured result.
 */
async function runFile(filePath, action, options, _cwd) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const checks = [];

  try {
    const foldData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const { FoldAnalyzer } = require('../utils/fold-analyzer');
    const analyzer = new FoldAnalyzer(foldData);

    // 1. basicAnalysis (optional)
    if (options.basic !== false) {
      const t1 = Date.now();
      try {
        const b = analyzer.basicAnalysis();
        checks.push({
          name: 'basic',
          pass: b && b.vertexCount > 0 && b.edgeCount > 0,
          message: `${b.vertexCount}V ${b.edgeCount}E ${b.faceCount}F`,
          timeSec: (Date.now() - t1) / 1000,
        });
      } catch (e) {
        checks.push({ name: 'basic', pass: false, message: e.message, timeSec: (Date.now() - t1) / 1000 });
      }
    }

    // 2. Action check
    {
      const t1 = Date.now();
      try {
        const r = CHECKS[action].run(analyzer);
        checks.push({ name: CHECKS[action].label, ...r, timeSec: (Date.now() - t1) / 1000 });
      } catch (e) {
        checks.push({ name: CHECKS[action].label, pass: false, message: e.message, timeSec: (Date.now() - t1) / 1000 });
      }
    }

    // 3. Schema validation (optional)
    if (options.schema !== false) {
      const t1 = Date.now();
      try {
        const result = analyzer.analyze();
        const v = analyzer.validateAgainstSchema(result);
        checks.push({
          name: 'schema',
          pass: v.valid,
          message: v.valid ? `v${v.schemaVersion} ok` : `${(v.errors || []).length} schema error(s)`,
          details: v.valid ? undefined : v,
          timeSec: (Date.now() - t1) / 1000,
        });
      } catch (e) {
        checks.push({ name: 'schema', pass: false, message: e.message, timeSec: (Date.now() - t1) / 1000 });
      }
    }
  } catch (e) {
    // File-level error (couldn't load or parse)
    checks.push({ name: 'load', pass: false, message: e.message, timeSec: 0 });
  }

  return {
    file: filePath,
    startedAt,
    timeSec: (Date.now() - t0) / 1000,
    checks,
    allPass: checks.every(c => c.pass),
  };
}

module.exports = { registerBatchAnalyzeCommand, toJUnitXML, expandInputs, CHECKS };
