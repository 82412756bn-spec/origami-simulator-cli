/**
 * obj Command (v2.45) — Export FOLD to OBJ/MTL format
 *
 *   origami obj <file>                    → export to <file>.obj
 *   origami obj <file> -o out.obj         → custom output
 *   origami obj <file> --mtl materials.mtl → custom MTL output
 *   origami obj <file> --no-mtl            → skip MTL
 *   origami obj <file> --separate-faces   → one object per face
 */

const path = require('path');
const fs = require('fs');
const { FoldOBJExporter } = require('../utils/fold-obj');

function registerOBJCommand(program) {
  program
    .command('obj <file>')
    .description('Export FOLD to OBJ/MTL format (v2.45)')
    .option('-o, --output <file>', 'Output OBJ file (default: <input>.obj)')
    .option('--mtl <file>', 'Output MTL file (default: <input>.mtl)')
    .option('--no-mtl', 'Skip MTL file generation')
    .option('--separate-faces', 'Export each face as separate object')
    .option('--triangulate', 'Triangulate faces (default: true)', true)
    .action((file, options) => {
      try {
        if (!fs.existsSync(file)) {
          console.error(`❌ File not found: ${file}`);
          process.exit(2);
        }

        const fold = JSON.parse(fs.readFileSync(file, 'utf8'));

        // Determine output paths
        const basePath = file.replace(/\.(fold|json)$/, '');
        const objPath = options.output || `${basePath}.obj`;
        const mtlPath = options.mtl || (options.noMtl ? null : `${basePath}.mtl`);

        // Export
        const exporter = new FoldOBJExporter(fold, {
          outputMtl: !options.noMtl,
          separateFaces: options.separateFaces,
          triangulate: options.triangulate,
          mtlFilename: mtlPath ? path.basename(mtlPath) : 'materials.mtl',
        });

        exporter.exportToFile(
          path.resolve(objPath),
          mtlPath ? path.resolve(mtlPath) : null
        );

      } catch (error) {
        console.error(`❌ Export error: ${error.message}`);
        if (options.debug) console.error(error.stack);
        process.exit(2);
      }
    });
}

module.exports = { registerOBJCommand };
