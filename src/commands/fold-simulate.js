/**
 * fold Command (v2.27) — Local real-time fold simulator
 *
 * Runs the local kinematic fold solver on a FOLD file. No browser, no
 * network, no Playwright — pure JS, < 5ms for typical patterns.
 *
 * Usage:
 *   origami fold <file>                              → folded.fold (90° M, V at 0)
 *   origami fold <file> --angle 60                   → custom fold angle
 *   origami fold <file> --frames 10                  → 10 frames 0→100%
 *   origami fold <file> --animate out.html           → self-contained HTML animation
 *   origami fold <file> --no-mountain-up             → M folds down, V folds up
 *
 * Output:
 *   - .fold file with 3D vertex coordinates (z non-zero)
 *   - Or animation: standalone HTML with SVG, slider, play button
 *
 * Performance: O(F + E) per frame, F = faces, E = edges. For a 96-vertex
 * origami like hypar.fold with ~50 faces, runs in < 1ms per frame.
 */

const path = require('path');
const fs = require('fs');
const { runWithFold } = require('./fold-helpers');
const { renderAnimation } = require('./fold-simulate-anim');

function registerFoldCommand(program) {
  program
    .command('fold <file>')
    .description('Run local kinematic fold simulator (v2.27 — no browser, < 5ms per frame)')
    .option('-o, --output <path>', 'Output FOLD file (default: <file>-folded.fold)')
    .option('--angle <degrees>', 'Fold angle in degrees (default: 90)', (v) => parseFloat(v), 90)
    .option('--percent <pct>', 'Fold percentage 0-1 (default: 1.0 = fully folded)', (v) => parseFloat(v), 1.0)
    .option('--frames <n>', 'Output N frames from 0% to 100% (writes JSON array of FOLDs to stdout or -o)', (v) => parseInt(v, 10), 0)
    .option('--animate <file>', 'Write self-contained HTML animation with slider to <file>')
    .option('--no-mountain-up', 'Reverse convention: M folds down, V folds up')
    .option('--root-face <n>', 'Index of the face to use as the root (default: 0)', (v) => parseInt(v, 10), 0)
    .option('--debug', 'Show stack traces on error')
    .action((file, options) => {
      runWithFold(file, options, (_analyzer, fullPath, foldData) => {
        const { FoldSimulator } = require('../utils/fold-simulator');
        const sim = new FoldSimulator(foldData, {
          angle: options.angle,
          mountainUp: options.mountainUp !== false,
          rootFace: options.rootFace,
        });

        if (options.frames > 0) {
          // Multi-frame output
          const t0 = Date.now();
          const frames = sim.simulateFrames(options.frames);
          const t1 = Date.now();
          const out = {
            file: path.basename(fullPath),
            frames: options.frames,
            foldAngle: options.angle,
            computeTimeMs: t1 - t0,
            msPerFrame: ((t1 - t0) / options.frames).toFixed(3),
            data: frames,
          };
          if (options.output) {
            const outPath = path.resolve(options.output);
            fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
            console.log(`🎬 Wrote ${options.frames} frames to: ${outPath}  (${t1 - t0}ms total, ${out.msPerFrame}ms/frame)`);
          } else {
            console.log(JSON.stringify(out, null, 2));
          }
          return;
        }

        if (options.animate) {
          // HTML animation
          const frames = sim.simulateFrames(20);  // 20 frames for animation
          const html = renderAnimation(frames, { title: path.basename(fullPath) });
          const outPath = path.resolve(options.animate);
          fs.writeFileSync(outPath, html, 'utf8');
          console.log(`🎬 HTML animation written to: ${outPath}  (${html.length} bytes, ${frames.length} frames)`);
          return;
        }

        // Single-frame output
        const t0 = Date.now();
        const result = sim.simulate(options.percent);
        const t1 = Date.now();
        const outPath = options.output
          ? path.resolve(options.output)
          : fullPath.replace(/\.fold$/, '') + '-folded.fold';
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
        const zRange = computeZRange(result.vertices_coords);
        console.log(`📐 Folded FOLD written to: ${outPath}  (${t1 - t0}ms, z=[${zRange[0].toFixed(2)}, ${zRange[1].toFixed(2)}])`);
      });
    });
}

function computeZRange(verts) {
  let min = Infinity, max = -Infinity;
  for (const v of verts) {
    if (v[2] < min) min = v[2];
    if (v[2] > max) max = v[2];
  }
  return [min, max];
}

module.exports = { registerFoldCommand };
