/**
 * fold Command (v2.27/v2.28) — Local fold simulator
 *
 * Two solvers:
 *   - kinematic (v2.27, default): tree-based, deterministic, < 1ms.
 *     Approximates cyclic patterns.
 *   - spring-mass (v2.28): PBD-based, 10-50ms per frame, handles cyclic
 *     patterns correctly.
 *
 * Usage:
 *   origami fold <file>                                → folded.fold (90° M, 0° V)
 *   origami fold <file> --solver spring-mass           → use PBD solver
 *   origami fold <file> --solver spring-mass --iterations 200
 *   origami fold <file> --angle 60                     → custom fold angle
 *   origami fold <file> --frames 10                    → 10 frames 0→100%
 *   origami fold <file> --animate out.html             → self-contained HTML animation
 *   origami fold <file> --no-mountain-up               → M folds down, V folds up
 *
 * Output:
 *   - .fold file with 3D vertex coordinates (z non-zero)
 *   - Or animation: standalone HTML with SVG, slider, play button
 *
 * Performance:
 *   - kinematic: < 1ms per frame for typical patterns (50 faces)
 *   - spring-mass: 10-50ms per frame (PBD iteration cost)
 */

const path = require('path');
const fs = require('fs');
const { runWithFold } = require('./fold-helpers');
const { renderAnimation } = require('./fold-simulate-anim');

function registerFoldCommand(program) {
  program
    .command('fold <file>')
    .description('Run local fold simulator (v2.27 kinematic / v2.28 spring-mass — no browser)')
    .option('-o, --output <path>', 'Output FOLD file (default: <file>-folded.fold)')
    .option('--angle <degrees>', 'Fold angle in degrees (default: 90)', (v) => parseFloat(v), 90)
    .option('--percent <pct>', 'Fold percentage 0-1 (default: 1.0 = fully folded)', (v) => parseFloat(v), 1.0)
    .option('--frames <n>', 'Output N frames from 0% to 100% (writes JSON array of FOLDs to stdout or -o)', (v) => parseInt(v, 10), 0)
    .option('--animate <file>', 'Write self-contained HTML animation with slider to <file>')
    .option('--solver <solver>', 'Solver: kinematic (v2.27, default), spring-mass (v2.28), or spring-mass-cyclic (v2.29 — full cyclic PBD)', 'kinematic')
    .option('--iterations <n>', 'Max PBD iterations for spring-mass solver (default: 100)', (v) => parseInt(v, 10), 100)
    .option('--edge-stiffness <k>', 'Edge spring stiffness 0-1 (spring-mass, default: 0.3)', (v) => parseFloat(v), 0.3)
    .option('--bending-stiffness <k>', 'Bending stiffness 0-1 (spring-mass, default: 1.0)', (v) => parseFloat(v), 1.0)
    .option('--no-mountain-up', 'Reverse convention: M folds down, V folds up')
    .option('--root-face <n>', 'Index of the face to use as the root (default: 0)', (v) => parseInt(v, 10), 0)
    .option('--debug', 'Show stack traces on error')
    .action((file, options) => {
      runWithFold(file, options, (_analyzer, fullPath, foldData) => {
        const solver = options.solver;
        if (!['kinematic', 'spring-mass', 'spring-mass-cyclic'].includes(solver)) {
          console.error(`❌ Invalid solver: ${solver}`);
          console.error(`   Valid solvers: kinematic, spring-mass, spring-mass-cyclic`);
          process.exit(2);
        }

        let sim, frameFn;
        if (solver === 'kinematic') {
          const { FoldSimulator } = require('../utils/fold-simulator');
          sim = new FoldSimulator(foldData, {
            angle: options.angle,
            mountainUp: options.mountainUp !== false,
            rootFace: options.rootFace,
          });
          frameFn = (pct) => sim.simulate(pct);
        } else {
          const { SpringMassSolver } = require('../utils/spring-mass-solver');
          sim = new SpringMassSolver(foldData, {
            foldAngle: options.angle,
            mountainUp: options.mountainUp !== false,
            rootFace: options.rootFace,
            maxIterations: options.iterations,
            edgeStiffness: options.edgeStiffness,
            bendingStiffness: options.bendingStiffness,
            cyclic: solver === 'spring-mass-cyclic',
          });
          frameFn = (pct) => sim.simulate(pct);
        }

        if (options.frames > 0) {
          // Multi-frame output
          const t0 = Date.now();
          const frames = [];
          for (let i = 0; i < options.frames; i++) {
            const pct = options.frames === 1 ? 1.0 : i / (options.frames - 1);
            frames.push(frameFn(pct));
          }
          const t1 = Date.now();
          const out = {
            file: path.basename(fullPath),
            solver,
            frames: options.frames,
            foldAngle: options.angle,
            computeTimeMs: t1 - t0,
            msPerFrame: ((t1 - t0) / options.frames).toFixed(3),
            data: frames,
          };
          if (options.output) {
            const outPath = path.resolve(options.output);
            fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
            console.log(`🎬 Wrote ${options.frames} frames to: ${outPath}  (${t1 - t0}ms total, ${out.msPerFrame}ms/frame) [${solver}]`);
          } else {
            console.log(JSON.stringify(out, null, 2));
          }
          return;
        }

        if (options.animate) {
          // HTML animation
          const t0 = Date.now();
          const frames = [];
          for (let i = 0; i < 20; i++) {
            const pct = i / 19;
            frames.push(frameFn(pct));
          }
          const t1 = Date.now();
          const html = renderAnimation(frames, { title: path.basename(fullPath) });
          const outPath = path.resolve(options.animate);
          fs.writeFileSync(outPath, html, 'utf8');
          console.log(`🎬 HTML animation written to: ${outPath}  (${html.length} bytes, ${frames.length} frames, ${t1 - t0}ms compute) [${solver}]`);
          return;
        }

        // Single-frame output
        const t0 = Date.now();
        const result = frameFn(options.percent);
        const t1 = Date.now();
        const outPath = options.output
          ? path.resolve(options.output)
          : fullPath.replace(/\.fold$/, '') + '-folded.fold';
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
        const zRange = computeZRange(result.vertices_coords);
        console.log(`📐 Folded FOLD written to: ${outPath}  (${t1 - t0}ms, z=[${zRange[0].toFixed(2)}, ${zRange[1].toFixed(2)}]) [${solver}]`);
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
