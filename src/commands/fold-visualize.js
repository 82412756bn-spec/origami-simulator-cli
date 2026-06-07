/**
 * Visualize Command — top-level alias for `analyze --visualize` (v2.16/v2.18)
 *
 * Writes a self-contained HTML report with embedded SVG.
 * M/V color coding, self-intersection highlights, summary table.
 */

const path = require('path');
const fs = require('fs');
const { runWithFold } = require('./fold-helpers');

function registerVisualizeCommand(program) {
  program
    .command('visualize <file>')
    .description('Write self-contained HTML visual report (v2.16/v2.18 — alias for `analyze --visualize`)')
    .option('-o, --output <path>', 'Output HTML path (default: <file>.html)')
    .action((file, options) => {
      runWithFold(file, options, (analyzer, fullPath) => {
        const result = analyzer.analyze();
        const html = analyzer.toVisualReport(
          { title: `Visual Report: ${path.basename(file)}`, fileName: path.basename(file) },
          result
        );
        const outPath = options.output
          ? path.resolve(options.output)
          : fullPath.replace(/\.fold$/, '') + '.html';
        fs.writeFileSync(outPath, html, 'utf8');
        console.log(`📊 Visual report written to: ${outPath}  (${html.length} bytes)`);
      });
    });
}

module.exports = { registerVisualizeCommand };
