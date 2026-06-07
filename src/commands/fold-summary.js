/**
 * Summary Command — top-level alias for `analyze --summary` (v2.13/v2.18)
 *
 * Outputs compact JSON for CI/CD, webhooks, LLM context, scripts.
 * 97%+ size reduction vs full analyze() output.
 */

const { runWithFold } = require('./fold-helpers');

function registerSummaryCommand(program) {
  program
    .command('summary <file>')
    .description('Output compact summary JSON for a FOLD file (v2.13/v2.18 — alias for `analyze --summary`)')
    .action((file, options) => {
      runWithFold(file, options, (analyzer) => {
        const result = analyzer.analyze();
        const summary = analyzer.summarize(result);
        console.log(JSON.stringify(summary, null, 2));
      });
    });
}

module.exports = { registerSummaryCommand };
