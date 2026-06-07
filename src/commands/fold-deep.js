/**
 * Deep-analysis Commands — top-level fold-analyzer validators
 *
 * These expose the v2.12/v2.14/v2.15 deep validators as their own
 * global commands so users don't have to run `analyze --all` and
 * dig through 600+ lines of report to find the one section they want.
 *
 * Each command:
 *   - Validates input via the shared runWithFold helper
 *   - Calls a single FoldAnalyzer method (no analyze() overhead)
 *   - Prints a focused, human-readable report
 *   - Supports --json for machine-readable output
 *   - Supports --top <N> where applicable (Kawasaki/Maekawa top deviations)
 *   - Supports --debug for stack traces
 *
 * Implemented commands:
 *   kawasaki         — v2.12 Strict Kawasaki  (deviation from equal angle sums)
 *   maekawa          — v2.14 Strict Maekawa   (|M-V| = 2)
 *   selfintersection — v2.15 Möller triangle-triangle (3D)
 *   mvalternation    — v2.12 Alternating M/V  (M/V must alternate around internal vertices)
 */

const { runWithFold } = require('./fold-helpers');

// ────────────────────────────────────────────────────────────────────
// Strict Kawasaki  (v2.12)
// ────────────────────────────────────────────────────────────────────
function registerKawasakiCommand(program) {
  program
    .command('kawasaki <file>')
    .description('Strict Kawasaki flat-foldability check (v2.12 — ranks vertices by |evenSum - oddSum|)')
    .option('--top <n>', 'Show top N deviating vertices (default: 10)', (v) => parseInt(v, 10), 10)
    .option('--json', 'Output machine-readable JSON')
    .option('--debug', 'Show stack traces on error')
    .action((file, options) => {
      runWithFold(file, options, (analyzer) => {
        const r = analyzer.strictKawasaki(options.top);

        if (options.json) {
          console.log(JSON.stringify(r, null, 2));
          return;
        }

        console.log('📏 Strict Kawasaki (v2.12):');
        console.log(`   Tolerance:       ±5°`);
        console.log(`   Total checked:   ${r.totalChecked}`);
        console.log(`   Within tolerance:${r.withinTolerance}`);
        console.log(`   Out of tolerance:${r.outOfTolerance}`);

        if (r.topDeviations.length > 0) {
          console.log(`   Top ${r.topDeviations.length} deviations:`);
          for (const d of r.topDeviations) {
            console.log(`     vertex ${d.vertex}: ${d.deviation}° (even=${d.evenSum}°, odd=${d.oddSum}°)`);
          }
        }
        for (const note of r.notes) console.log(`   ℹ️  ${note}`);
      });
    });
}

// ────────────────────────────────────────────────────────────────────
// Strict Maekawa  (v2.14)
// ────────────────────────────────────────────────────────────────────
function registerMaekawaCommand(program) {
  program
    .command('maekawa <file>')
    .description('Strict Maekawa flat-foldability check (v2.14 — |M-V| = 2)')
    .option('--top <n>', 'Show top N deviating vertices (default: 10)', (v) => parseInt(v, 10), 10)
    .option('--json', 'Output machine-readable JSON')
    .option('--debug', 'Show stack traces on error')
    .action((file, options) => {
      runWithFold(file, options, (analyzer) => {
        const r = analyzer.analyzeMaekawa(options.top);

        if (options.json) {
          console.log(JSON.stringify(r, null, 2));
          return;
        }

        console.log('🏔️  Strict Maekawa (v2.14):');
        console.log(`   Theorem:         |M - V| = 2`);
        console.log(`   Total checked:   ${r.totalChecked}`);
        console.log(`   Within tolerance:${r.withinTolerance}`);
        console.log(`   Out of tolerance:${r.outOfTolerance}`);

        if (r.topDeviations.length > 0) {
          console.log(`   Top ${r.topDeviations.length} deviations:`);
          for (const d of r.topDeviations) {
            console.log(`     vertex ${d.vertex}: M=${d.M}/V=${d.V}, |M-V|-2 = ${d.deviation}`);
          }
        }
        for (const note of r.notes) console.log(`   ℹ️  ${note}`);
      });
    });
}

// ────────────────────────────────────────────────────────────────────
// Complete Self-Intersection  (v2.15 — Möller)
// ────────────────────────────────────────────────────────────────────
function registerSelfintersectionCommand(program) {
  program
    .command('selfintersection <file>')
    .description('Complete self-intersection check via Möller (1997) triangle-triangle (v2.15)')
    .option('--json', 'Output machine-readable JSON')
    .option('--debug', 'Show stack traces on error')
    .action((file, options) => {
      runWithFold(file, options, (analyzer) => {
        const r = analyzer.analyzeCompleteSelfIntersection();

        if (options.json) {
          console.log(JSON.stringify(r, null, 2));
          return;
        }

        console.log('🪡 Complete Self-Intersection (v2.15 — Möller):');
        console.log(`   Pairs checked:    ${r.facePairCount}`);
        if (r.aabbSurvivorCount > 0) {
          console.log(`   AABB survivors:   ${r.aabbSurvivorCount}`);
        }
        console.log(`   Intersections:    ${r.intersectionCount}`);

        for (const intr of r.intersections.slice(0, 5)) {
          const dist = intr.minDistance !== undefined ? ` (min dist: ${intr.minDistance})` : '';
          console.log(`     ⚠️  faces ${intr.face1}–${intr.face2} [${intr.kind}]${dist}`);
        }
        if (r.intersections.length > 5) {
          console.log(`     ... and ${r.intersections.length - 5} more`);
        }
        for (const note of r.notes) console.log(`   ℹ️  ${note}`);
      });
    });
}

// ────────────────────────────────────────────────────────────────────
// Alternating M/V Pattern  (v2.12)
// ────────────────────────────────────────────────────────────────────
function registerMvalternationCommand(program) {
  program
    .command('mvalternation <file>')
    .description('Alternating M/V pattern check (v2.12 — M/V must alternate around internal vertices)')
    .option('--json', 'Output machine-readable JSON')
    .option('--debug', 'Show stack traces on error')
    .action((file, options) => {
      runWithFold(file, options, (analyzer) => {
        const r = analyzer.analyzeAlternatingMV();

        if (options.json) {
          console.log(JSON.stringify(r, null, 2));
          return;
        }

        console.log('🔁 M/V Alternation (v2.12):');
        console.log(`   Checked:          ${r.totalChecked} internal vertex/vertices`);
        console.log(`   Consistent:       ${r.consistent}`);
        if (r.inconsistent > 0) {
          console.log(`   Inconsistent:     ${r.inconsistent}`);
          for (const inc of r.inconsistencies.slice(0, 5)) {
            console.log(`     ⚠️  vertex ${inc.vertex}: pattern="${inc.pattern}", ${inc.detail}`);
          }
          if (r.inconsistencies.length > 5) {
            console.log(`     ... and ${r.inconsistencies.length - 5} more`);
          }
        }
        for (const note of r.notes) console.log(`   ℹ️  ${note}`);
      });
    });
}

module.exports = {
  registerKawasakiCommand,
  registerMaekawaCommand,
  registerSelfintersectionCommand,
  registerMvalternationCommand,
};
