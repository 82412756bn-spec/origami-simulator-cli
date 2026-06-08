/**
 * diff Command (v2.31) — Compare two FOLD files
 *
 *   origami diff <old> <new>                    → text diff to stdout
 *   origami diff <old> <new> --json             → machine-readable JSON
 *   origami diff <old> <new> --html out.html    → side-by-side visual diff
 *   origami diff <old> <new> --exact            → match by index (no spatial)
 *   origami diff <old> <new> --tolerance 0.5    → vertex distance threshold
 *
 * Returns 0 if no changes, 1 if changes detected, 2 on error.
 * Suitable for CI/CD: `if ! origami diff old.fold new.fold; then ...`.
 */

const path = require('path');
const fs = require('fs');
const { FoldDiff, renderText, renderHTML } = require('../utils/fold-diff');

function registerDiffCommand(program) {
  program
    .command('diff <old> <new>')
    .description('Compare two FOLD files and report changes (v2.31 — text/JSON/HTML output)')
    .option('--json', 'Output machine-readable JSON')
    .option('--html <file>', 'Write side-by-side HTML diff to <file>')
    .option('--exact', 'Match vertices by index only (no spatial tolerance)')
    .option('--tolerance <mm>', 'Vertex MATCHING tolerance in mm (default: 0.001mm — vertices farther apart treated as add/remove)', (v) => parseFloat(v), 1e-3)
    .option('--move-threshold <mm>', 'Distance above which matched vertices are reported as MOVED (default: 0)', (v) => parseFloat(v), 0)
    .option('--exit-code', 'Exit 0 if no changes, 1 if changes detected (for CI/CD)', false)
    .action((oldFile, newFile, options) => {
      try {
        if (!fs.existsSync(oldFile)) {
          console.error(`❌ File not found: ${oldFile}`);
          process.exit(2);
        }
        if (!fs.existsSync(newFile)) {
          console.error(`❌ File not found: ${newFile}`);
          process.exit(2);
        }

        const foldA = JSON.parse(fs.readFileSync(oldFile, 'utf8'));
        const foldB = JSON.parse(fs.readFileSync(newFile, 'utf8'));

        const diffEngine = new FoldDiff(foldA, foldB, {
          exact: options.exact,
          vertexTolerance: options.tolerance,
          moveThreshold: options.moveThreshold,
        });
        const result = diffEngine.diff();

        if (options.html) {
          const html = renderHTML(result, { title: `Diff: ${path.basename(oldFile)} vs ${path.basename(newFile)}` });
          const outPath = path.resolve(options.html);
          fs.writeFileSync(outPath, html, 'utf8');
          console.log(`📊 HTML diff written to: ${outPath}  (${html.length} bytes)`);
          if (options.json) {
            // Both --html and --json: also print JSON summary to stdout
            console.log(JSON.stringify(result, null, 2));
          }
        } else if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(renderText(result));
        }

        if (options.exitCode) {
          const totalChanges = result.stats.verticesAdded + result.stats.verticesRemoved +
                              result.stats.verticesMoved + result.stats.edgesAdded +
                              result.stats.edgesRemoved + result.stats.edgesModified +
                              result.stats.facesAdded + result.stats.facesRemoved +
                              result.stats.facesModified + result.stats.metaChanges;
          process.exit(totalChanges > 0 ? 1 : 0);
        }
      } catch (error) {
        console.error(`❌ Error computing diff: ${error.message}`);
        if (options.debug) console.error(error.stack);
        process.exit(2);
      }
    });
}

module.exports = { registerDiffCommand };
