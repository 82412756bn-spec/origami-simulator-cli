/**
 * Validate Command — top-level alias for `analyze --validate-output` (v2.11/v2.19)
 *
 * Validates analyze() output against docs/fold-analyzer-schema.json (ajv).
 * CI/CD-friendly exit codes:
 *   0 = valid
 *   2 = validation failed (schema mismatch)
 *   3 = version mismatch (warning, still valid)
 */

const { runWithFold } = require('./fold-helpers');

function registerValidateCommand(program) {
  program
    .command('validate <file>')
    .description('Validate analyze() output against docs/fold-analyzer-schema.json (v2.11/v2.19 — alias for `analyze --validate-output`)')
    .option('--json', 'Output machine-readable JSON instead of human-readable')
    .action((file, options) => {
      runWithFold(file, options, (analyzer) => {
        const result = analyzer.analyze();
        const validation = analyzer.validateAgainstSchema(result);

        if (options.json) {
          console.log(JSON.stringify(validation, null, 2));
        } else {
          console.log('✅ JSON Schema Validation (v2.19):');
          console.log(`   ${validation.summary}`);
          console.log(`   Output schemaVersion:    ${validation.schemaVersion}`);
          console.log(`   Expected schemaVersion:   ${validation.expectedSchemaVersion}`);
          console.log(`   Version match:           ${validation.versionMatch ? '✅' : '⚠️  version mismatch'}`);
          if (!validation.valid && validation.errors.length > 0) {
            console.log(`   Errors:`);
            for (const err of validation.errors.slice(0, 10)) {
              console.log(`     ❌ ${err.instancePath || '<root>'} — ${err.message} (${err.keyword})`);
            }
            if (validation.errors.length > 10) {
              console.log(`     ... and ${validation.errors.length - 10} more`);
            }
          }
        }

        if (!validation.valid) process.exit(2);
        if (!validation.versionMatch) process.exit(3);
      });
    });
}

module.exports = { registerValidateCommand };
