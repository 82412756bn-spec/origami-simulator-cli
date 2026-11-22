/**
 * merge Command (v2.42) — 3-way merge for FOLD files
 *
 *   origami merge <base> <ours> <theirs>           → merged FOLD to stdout
 *   origami merge <base> <ours> <theirs> -o out.fold
 *   origami merge <base> <ours> <theirs> --json      → JSON output
 *   origami merge <base> <ours> <theirs> --conflict-only  → only conflict report
 *   origami merge <base> <ours> <theirs> --tolerance 0.01
 *
 * Exit codes:
 *   0 = clean merge (no conflicts)
 *   1 = merge with conflicts (auto-resolved)
 *   2 = error
 */

const path = require('path');
const fs = require('fs');
const { FoldMerge, renderText, renderJSON } = require('../utils/fold-merge');

function registerMergeCommand(program) {
  program
    .command('merge <base> <ours> <theirs>')
    .description('3-way merge for FOLD files (v2.42)')
    .option('-o, --output <file>', 'Output merged FOLD to <file> (default: stdout)')
    .option('--json', 'Output machine-readable JSON')
    .option('--conflict-only', 'Only output conflict report (no merged file)')
    .option('--tolerance <mm>', 'Vertex matching tolerance (default: 0.001mm)', (v) => parseFloat(v), 1e-3)
    .option('--move-threshold <mm>', 'Distance threshold for "moved" vertices (default: 0.0001mm)', (v) => parseFloat(v), 1e-4)
    .option('--exit-code', 'Exit 0 for clean merge, 1 for conflicts, 2 for error', false)
    .action((baseFile, oursFile, theirsFile, options) => {
      try {
        // Validate input files
        const files = [
          { name: 'base', path: baseFile },
          { name: 'ours', path: oursFile },
          { name: 'theirs', path: theirsFile },
        ];

        for (const f of files) {
          if (!fs.existsSync(f.path)) {
            console.error(`❌ File not found: ${f.path}`);
            process.exit(2);
          }
        }

        // Load FOLD files
        const foldBase = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
        const foldOurs = JSON.parse(fs.readFileSync(oursFile, 'utf8'));
        const foldTheirs = JSON.parse(fs.readFileSync(theirsFile, 'utf8'));

        // Perform merge
        const merger = new FoldMerge(foldBase, foldOurs, foldTheirs, {
          vertexTolerance: options.tolerance,
          moveThreshold: options.moveThreshold,
        });
        const result = merger.merge();

        // Output
        if (options.conflictOnly) {
          // Only show conflicts
          if (result.conflicts.length === 0) {
            console.log('No conflicts - clean merge!');
          } else {
            console.log(renderText(result));
          }
        } else if (options.json) {
          // JSON output
          console.log(renderJSON(result));
        } else if (options.output) {
          // Write merged file
          const outPath = path.resolve(options.output);
          fs.writeFileSync(outPath, JSON.stringify(result.merged, null, 2));
          const conflictMsg = result.conflicts.length > 0
            ? ` (⚠️  ${result.conflicts.length} conflict(s) auto-resolved)`
            : ' (clean merge)';
          console.log(`📦 Merged FOLD written to: ${outPath}${conflictMsg}`);

          if (result.conflicts.length > 0) {
            console.log('\nConflict summary:');
            console.log(`  Vertices: ${result.stats.verticesConflict}`);
            console.log(`  Edges:    ${result.stats.edgesConflict}`);
            console.log(`  Faces:    ${result.stats.facesConflict}`);
          }
        } else {
          // Default: text report to stdout
          console.log(renderText(result));
          console.log('\nTo save merged file, use: --output <file>');
        }

        // Exit code
        if (options.exitCode) {
          process.exit(result.conflicts.length > 0 ? 1 : 0);
        }
      } catch (error) {
        console.error(`❌ Merge error: ${error.message}`);
        if (options.debug) console.error(error.stack);
        process.exit(2);
      }
    });
}

module.exports = { registerMergeCommand };
