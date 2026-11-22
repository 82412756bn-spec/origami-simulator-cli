/**
 * v2 Commands (v2.44) — FOLD v2.0 format tools
 *
 *   origami v2detect <file>         → detect format version
 *   origami v2validate <file>        → validate v2.0 format
 *   origami v2upgrade <file> -o out  → upgrade to v2.0
 *   origami v2downgrade <file> -o out → downgrade to v1.1
 */

const path = require('path');
const fs = require('fs');
const { FoldV2, formatValidationResult, formatSummary } = require('../utils/fold-v2');

/**
 * Register all v2 commands
 */
function registerV2Commands(program) {
  registerV2Detect(program);
  registerV2Validate(program);
  registerV2Upgrade(program);
  registerV2Downgrade(program);
}

/**
 * origami v2detect <file>
 * Detect FOLD format version
 */
function registerV2Detect(program) {
  program
    .command('v2detect <file>')
    .description('Detect FOLD format version (v1.1, v1.2, or v2.0)')
    .option('--json', 'Output machine-readable JSON')
    .action((file, options) => {
      try {
        if (!fs.existsSync(file)) {
          console.error(`❌ File not found: ${file}`);
          process.exit(2);
        }

        const fold = JSON.parse(fs.readFileSync(file, 'utf8'));
        const detection = FoldV2.detect(fold);
        const summary = FoldV2.summary(fold);

        if (options.json) {
          console.log(JSON.stringify({ ...detection, ...summary }, null, 2));
        } else {
          console.log(formatSummary(fold));
        }
      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(2);
      }
    });
}

/**
 * origami v2validate <file>
 * Validate v2.0 format
 */
function registerV2Validate(program) {
  program
    .command('v2validate <file>')
    .description('Validate FOLD v2.0 format and report errors/warnings')
    .option('--json', 'Output machine-readable JSON')
    .option('--strict', 'Treat warnings as errors')
    .action((file, options) => {
      try {
        if (!fs.existsSync(file)) {
          console.error(`❌ File not found: ${file}`);
          process.exit(2);
        }

        const fold = JSON.parse(fs.readFileSync(file, 'utf8'));
        const result = FoldV2.validate(fold);

        // Treat warnings as errors in strict mode
        if (options.strict && result.warnings.length > 0) {
          result.errors.push(...result.warnings);
          result.warnings = [];
        }

        console.log(formatValidationResult(result));

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        }

        // Exit code
        if (!result.valid) {
          process.exit(1);
        }
      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(2);
      }
    });
}

/**
 * origami v2upgrade <file>
 * Upgrade to v2.0 format
 */
function registerV2Upgrade(program) {
  program
    .command('v2upgrade <file>')
    .description('Upgrade FOLD v1.x to v2.0 format')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .option('--json', 'Output as JSON')
    .action((file, options) => {
      try {
        if (!fs.existsSync(file)) {
          console.error(`❌ File not found: ${file}`);
          process.exit(2);
        }

        const fold = JSON.parse(fs.readFileSync(file, 'utf8'));
        const upgraded = FoldV2.upgrade(fold);

        if (options.output) {
          const outPath = path.resolve(options.output);
          fs.writeFileSync(outPath, JSON.stringify(upgraded, null, 2));
          console.log(`✅ Upgraded to v2.0: ${outPath}`);
          console.log(`   Original: v${fold.file_spec || 1.1}`);
          console.log(`   New:      v${upgraded.file_spec}`);
        } else if (options.json) {
          console.log(JSON.stringify(upgraded, null, 2));
        } else {
          console.log(JSON.stringify(upgraded, null, 2));
        }
      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(2);
      }
    });
}

/**
 * origami v2downgrade <file>
 * Downgrade to v1.x format
 */
function registerV2Downgrade(program) {
  program
    .command('v2downgrade <file>')
    .description('Downgrade FOLD v2.0 to v1.x format')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .option('--json', 'Output as JSON')
    .option('--target <version>', 'Target version (default: 1.1)', (v) => parseFloat(v), 1.1)
    .action((file, options) => {
      try {
        if (!fs.existsSync(file)) {
          console.error(`❌ File not found: ${file}`);
          process.exit(2);
        }

        const fold = JSON.parse(fs.readFileSync(file, 'utf8'));
        const originalVersion = FoldV2.detect(fold).version;

        // Warn if not a v2.0 file
        if (originalVersion !== '2.0') {
          console.warn(`⚠️  File is not v2.0 format (detected: ${originalVersion})`);
        }

        const downgraded = FoldV2.downgrade(fold, options.target);

        if (options.output) {
          const outPath = path.resolve(options.output);
          fs.writeFileSync(outPath, JSON.stringify(downgraded, null, 2));
          console.log(`✅ Downgraded to v${options.target}: ${outPath}`);
        } else if (options.json) {
          console.log(JSON.stringify(downgraded, null, 2));
        } else {
          console.log(JSON.stringify(downgraded, null, 2));
        }
      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(2);
      }
    });
}

module.exports = { registerV2Commands };
