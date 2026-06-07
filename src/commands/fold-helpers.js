/**
 * Shared helpers for fold-analyzer-powered CLI subcommands
 *
 * Centralizes the file-loading / error-handling / analyzer-construction
 * logic that was previously hand-rolled in each alias (summary, visualize,
 * validate, kawasaki, maekawa, selfintersection, mvalternation).
 *
 * All global fold-analyzer commands should go through:
 *   - loadFoldFile(filePath, options)  →  foldData (or exits with code 1)
 *   - makeAnalyzer(foldData)           →  FoldAnalyzer instance
 *
 * That way adding a new top-level command is a 5-line .action() handler.
 */

const path = require('path');
const fs = require('fs');
const { FoldAnalyzer } = require('../utils/fold-analyzer');

/**
 * Default error-handling wrapper for any fold-analyzer command.
 *
 * Usage:
 *   program.command('foo <file>').action((file) => runWithFold(file, (analyzer, filePath) => {
 *     const r = analyzer.someMethod();
 *     console.log(r);
 *   }));
 *
 * Centralizes:
 *   - File resolution + existence check (exit 1 if missing)
 *   - Extension check (only .fold is supported; .svg errors clearly)
 *   - JSON parse error handling
 *   - try/catch with ❌ prefix and --debug-aware stack trace
 *   - process.exit(1) on error
 *
 * @param {string} file         - Path to .fold file (will be resolved)
 * @param {object} options      - CLI options object (for --debug)
 * @param {Function} body       - (analyzer, fullPath, foldData) => any
 */
function runWithFold(file, options, body) {
  // Allow (file, body) form for commands that don't take options
  if (typeof options === 'function') {
    body = options;
    options = {};
  }

  const fullPath = path.resolve(file);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${file}`);
    process.exit(1);
  }

  const ext = path.extname(fullPath).toLowerCase();
  if (ext !== '.fold') {
    console.error(`❌ Unsupported file format: ${ext}`);
    console.error('   Supported: .fold');
    process.exit(1);
  }

  let foldData;
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    foldData = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to parse FOLD JSON: ${error.message}`);
    if (options && options.debug) console.error(error.stack);
    process.exit(1);
  }

  let analyzer;
  try {
    analyzer = new FoldAnalyzer(foldData);
  } catch (error) {
    console.error(`❌ Failed to construct FoldAnalyzer: ${error.message}`);
    if (options && options.debug) console.error(error.stack);
    process.exit(1);
  }

  try {
    body(analyzer, fullPath, foldData);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    if (options && options.debug) console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Like runWithFold but writes JSON output to stdout.
 * Convenience for `--json` mode in subcommands.
 */
function runWithFoldJson(file, options, body) {
  runWithFold(file, options, (analyzer, fullPath, foldData) => {
    const result = body(analyzer, fullPath, foldData);
    if (result === undefined) return;  // handler printed its own output
    console.log(JSON.stringify(result, null, 2));
  });
}

module.exports = {
  runWithFold,
  runWithFoldJson,
  FoldAnalyzer,
};
