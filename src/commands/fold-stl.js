/**
 * stl Command — top-level alias for FOLD → STL export (v2.24)
 *
 * Wraps the FoldSTLExporter for direct CLI use:
 *   origami stl hypar.fold                       → out.stl (binary, 1mm sheet)
 *   origami stl hypar.fold -o model.stl --ascii  → ASCII format
 *   origami stl hypar.fold --thickness 2.5       → 2.5mm sheet (laser/3D print)
 *   origami stl hypar.fold --no-extrude          → 3D coordinates only (no extrusion)
 *
 * Both binary and ASCII STL are valid for:
 *   - 3D printing (Cura, PrusaSlicer, etc.)
 *   - Laser cutting with thickness (CAM software)
 *   - CAD import (Fusion 360, FreeCAD, OpenSCAD)
 */

const path = require('path');
const fs = require('fs');
const { runWithFold } = require('./fold-helpers');

function registerStlCommand(program) {
  program
    .command('stl <file>')
    .description('Export FOLD geometry to STL (binary/ASCII) for 3D printing / laser cutting (v2.24)')
    .option('-o, --output <path>', 'Output STL path (default: <file>.stl)')
    .option('--ascii', 'Output ASCII STL (default: binary — more compact)')
    .option('--thickness <mm>', 'Sheet thickness for 2D→3D extrusion (default: 1.0mm)', (v) => parseFloat(v), 1.0)
    .option('--no-extrude', 'Skip extrusion for 2D inputs (only works on true 3D models)')
    .option('--flip-normals', 'Reverse all face normals')
    .option('--name <name>', 'Name in the STL header (binary: 80-byte header, ascii: "solid <name>")', 'origami-fold')
    .option('--debug', 'Show stack traces on error')
    .action((file, options) => {
      runWithFold(file, options, (_analyzer, fullPath, foldData) => {
        const { FoldSTLExporter } = require('../utils/fold-stl-exporter');
        const stl = new FoldSTLExporter({
          thickness: options.extrude === false ? 0 : options.thickness,
          format: options.ascii ? 'ascii' : 'binary',
          flipNormals: options.flipNormals,
          name: options.name,
        });

        const out = stl.export(foldData);
        const outPath = options.output
          ? path.resolve(options.output)
          : fullPath.replace(/\.fold$/, '') + '.stl';

        fs.writeFileSync(outPath, out);
        // For binary: triangles = (length - 80 - 4) / 50
        // For ASCII: count "facet" lines
        const triCount = options.ascii
          ? (out.match(/\bfacet\s+normal\b/g) || []).length
          : (out.length - 84) / 50;
        const fmt = options.ascii ? 'ASCII' : 'Binary';
        console.log(`📐 ${fmt} STL written to: ${outPath}  (${out.length} bytes, ${triCount} triangles)`);
      });
    });
}

module.exports = { registerStlCommand };
