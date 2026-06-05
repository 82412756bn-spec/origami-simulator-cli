/**
 * Analyze Command v2
 * Local FOLD file analysis with real origami math
 *
 * Replaces browser-based analysis with pure local computation.
 * Works offline, no Playwright required.
 */

const path = require('path');
const fs = require('fs');
const { FoldAnalyzer } = require('../utils/fold-analyzer');

/**
 * Register analyze command with Commander
 * @param {Command} program - Commander program instance
 */
function registerAnalyzeCommand(program) {
  program
    .command('analyze <file>')
    .description('Analyze a FOLD/SVG file locally (no browser required)')
    .option('--all', 'Show all analysis details')
    .option('--json', 'Output as JSON')
    .option('--validate', 'Run flat-foldability validation (Kawasaki/Maekawa)')
    .option('--symmetry', 'Detect symmetry')
    .option('--quality', 'Check quality issues')
    .option('--strict', 'Use strict symmetry detection (tighter tolerance, filter subgroup over-detection)')
    .option('--validate-output', 'Validate analyze() output against docs/fold-analyzer-schema.json (ajv, v2.11)')
    .option('--summary', 'Output compact summary JSON (v2.13) instead of full report')
    .option('--debug', 'Enable debug output')
    .action((file, options) => {
      analyzeFile(file, options);
    });
}

/**
 * Analyze a FOLD file
 */
function analyzeFile(filePath, options) {
  try {
    const fullPath = path.resolve(filePath);

    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }

    const ext = path.extname(fullPath).toLowerCase();

    let foldData;
    if (ext === '.fold') {
      const content = fs.readFileSync(fullPath, 'utf8');
      foldData = JSON.parse(content);
    } else if (ext === '.svg') {
      // SVG support is limited (extract vertices from path data)
      console.error('❌ SVG analysis not yet supported. Use FOLD format.');
      process.exit(1);
    } else {
      console.error(`❌ Unsupported file format: ${ext}`);
      console.error('   Supported: .fold');
      process.exit(1);
    }

    const analyzer = new FoldAnalyzer(foldData);

    if (options.summary) {
      // v2.13: compact summary JSON (for scripts/automation)
      const result = analyzer.analyze(options);
      const summary = analyzer.summarize(result);
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    if (options.json) {
      // JSON output mode
      const result = analyzer.analyze(options);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Pretty-print mode
    const result = analyzer.analyze(options);
    printReport(filePath, result, options);

    // Optional: validate output against JSON Schema (v2.11)
    if (options.validateOutput) {
      console.log('');
      console.log('✅ JSON Schema Validation (v2.11):');
      const validation = analyzer.validateAgainstSchema(result);
      console.log(`   ${validation.summary}`);
      console.log(`   Output schemaVersion:    ${validation.schemaVersion}`);
      console.log(`   Expected schemaVersion:   ${validation.expectedSchemaVersion}`);
      console.log(`   Version match:           ${validation.versionMatch ? '✅' : '⚠️  version mismatch'}`);
      if (!validation.valid && validation.errors.length > 0) {
        for (const err of validation.errors.slice(0, 5)) {
          console.log(`   ❌ ${err.instancePath || '<root>'} — ${err.message} (${err.keyword})`);
        }
        if (validation.errors.length > 5) {
          console.log(`   ... and ${validation.errors.length - 5} more errors`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ Error analyzing file: ${error.message}`);
    if (options.debug) console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Print a human-readable report
 */
function printReport(filePath, result, options) {
  const { basic, structure, validation, symmetry, classification, quality, strain, mvConsistency, selfIntersection, faceNormals, holes, foldOrder, mvAlternation, strictKawasaki, strictMaekawa, warnings } = result;

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  📊 FOLD Model Analysis Report');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  File: ${filePath}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Basic
  console.log('📐 Basic Structure:');
  console.log(`   Vertices:       ${basic.vertexCount}`);
  console.log(`   Edges:          ${basic.edgeCount}`);
  console.log(`   Faces:          ${basic.faceCount}`);
  console.log(`   Bounding box:   ${basic.boundingBox.width.toFixed(1)} × ${basic.boundingBox.height.toFixed(1)} mm`);
  console.log(`   Surface type:   ${basic.surfaceType}`);
  const genusStr = basic.genus === null ? 'N/A (dieline)' : basic.genus;
  console.log(`   Euler χ:        ${basic.eulerCharacteristic} (genus ${genusStr})`);
  console.log('');
  console.log('   Edge types:');
  for (const [type, count] of Object.entries(basic.edgeStats)) {
    if (count > 0) console.log(`     ${type}: ${count}`);
  }
  console.log('');

  // Structure
  console.log('🔗 Structure:');
  console.log(`   Manifold:       ${structure.isManifold ? '✅ Yes' : '❌ No'}`);
  console.log(`   Components:     ${structure.componentCount}`);
  console.log(`   Avg valence:    ${structure.avgValence}`);
  console.log('');

  // Validation
  if (options.all || options.validate) {
    console.log('🔍 Flat-foldability Validation:');
    console.log(`   Checked vertices: ${validation.checkedVertices}`);
    console.log(`   Pass:             ${validation.passCount} (${validation.passRate})`);
    console.log(`   Fail:             ${validation.failCount}`);

    if (validation.failedVertices.length > 0) {
      console.log('');
      console.log('   Failed vertices:');
      for (const fv of validation.failedVertices.slice(0, 5)) {
        console.log(`     Vertex ${fv.vertex}:`);
        console.log(`       Kawasaki: ${fv.kawasaki.valid ? '✓' : '✗'} (alt sum: ${fv.kawasaki.sum})`);
        console.log(`       Maekawa:  ${fv.maekawa.valid ? '✓' : '✗'} (M=${fv.maekawa.m}, V=${fv.maekawa.v}, diff=${fv.maekawa.diff})`);
      }
      if (validation.failedVertices.length > 5) {
        console.log(`     ... and ${validation.failedVertices.length - 5} more`);
      }
    }
    console.log('');
  }

  // Symmetry
  if (options.all || options.symmetry) {
    console.log('🔄 Symmetry:');
    if (symmetry.symmetries.length === 0) {
      console.log('   No symmetry detected');
    } else {
      for (const s of symmetry.symmetries) {
        if (s.type === 'rotational') {
          const detail = s.residual !== undefined
            ? ` (residual ${s.residual}, tol ${s.tolerance})`
            : '';
          console.log(`   ${s.n}-fold rotational symmetry${detail}`);
        } else if (s.type === 'reflective') {
          const detail = s.residual !== undefined
            ? ` (residual ${s.residual}, tol ${s.tolerance})`
            : '';
          console.log(`   Reflective symmetry (axis ${s.axis})${detail}`);
        }
      }
      if (symmetry.filteredSubgroups > 0) {
        console.log(`   (filtered ${symmetry.filteredSubgroups} subgroup detections)`);
      }
      if (symmetry.strict) {
        console.log(`   Mode: STRICT (residual threshold ${symmetry.residualAccept})`);
      }
    }
    console.log('');
  }

  // Classification
  if (options.all) {
    console.log('🏷️  Classification:');
    console.log(`   Type:           ${classification.patternType}`);
    console.log(`   Aspect ratio:   ${classification.aspectRatio}`);
    console.log('');
  }

  // Layers (v2.3: real implementation, was stub)
  if (options.all) {
    const layers = classification.layers;
    if (layers && layers.faceCount > 0) {
      console.log('📚 Layers:');
      console.log(`   Source:         ${layers.source}`);
      console.log(`   Nesting depth:  ${layers.nestingDepth}`);
      console.log(`   Layer range:    ${layers.minLayer} – ${layers.maxLayer}`);
      console.log(`   Avg layer:      ${typeof layers.avgLayer === 'number' ? layers.avgLayer.toFixed(2) : layers.avgLayer}`);
      if (layers.maxOverlap > 1) {
        console.log(`   Spatial overlap: ${layers.maxOverlap} faces stack at densest point`);
      }
      // Histogram (top 5 layers)
      const sortedLayers = Object.entries(layers.facesPerLayer)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .slice(0, 5);
      if (sortedLayers.length > 0) {
        const histStr = sortedLayers.map(([l, c]) => `L${l}:${c}`).join('  ');
        console.log(`   Per-layer:      ${histStr}${sortedLayers.length === 5 ? '  …' : ''}`);
      }
      for (const note of layers.notes) {
        console.log(`   ℹ️  ${note}`);
      }
      console.log('');
    }
  }

  // Quality
  if (options.all || options.quality) {
    console.log('🛡️  Quality Check:');
    if (quality.issues.length === 0) {
      console.log('   ✅ No issues found');
    } else {
      console.log(`   ${quality.errorCount} errors, ${quality.warningCount} warnings:`);
      for (const issue of quality.issues) {
        const icon = issue.type === 'error' ? '❌' : '⚠️';
        console.log(`   ${icon} ${issue.message}`);
        if (issue.details && issue.details.length > 0) {
          console.log(`      Affected: [${issue.details.join(', ')}${issue.details.length > 10 ? ', ...' : ''}]`);
        }
      }
    }
    console.log('');
  }

  // Strain (v2.4)
  if (options.all && strain) {
    console.log('🌀 Strain (bending, normalized 0–1):');
    if (strain.foldEdgeCount === 0) {
      console.log('   No fold data to analyze');
      for (const note of strain.notes) {
        console.log(`   ℹ️  ${note}`);
      }
    } else {
      console.log(`   Analyzed edges:    ${strain.edgeCount} total, ${strain.foldEdgeCount} M/V folds`);
      console.log(`   Avg bending:       ${strain.avgBendingStrain}`);
      console.log(`   Max bending:       ${strain.maxBendingStrain}`);
      const dist = strain.strainDistribution;
      console.log(`   Distribution:      low(<0.3): ${dist.low}  med: ${dist.medium}  high(>0.7): ${dist.high}`);
    }
    console.log('');
  }

  // M/V Consistency (v2.5)
  if (options.all && mvConsistency) {
    const mvc = mvConsistency;
    console.log('🔀 M/V Bend-Direction Consistency:');
    if (mvc.totalChecked === 0) {
      console.log('   No M/V edges to check');
    } else {
      console.log(`   Checked:           ${mvc.totalChecked} M/V edges`);
      console.log(`   Consistent:        ${mvc.consistent}`);
      const total = mvc.inconsistent + mvc.noGeometry;
      if (total > 0) {
        console.log(`   Inconsistent:      ${mvc.inconsistent}`);
        console.log(`   No geometry:       ${mvc.noGeometry} (2D fallback or degenerate)`);
      }
      // Show first few geometric inconsistencies
      for (const g of mvc.geometricInconsistencies.slice(0, 3)) {
        console.log(`     ⚠️  edge ${g.edge} (${g.assignment}): foldAngle=${g.foldAngle}°, dihedral=${g.dihedral}° (expected ${g.expectedDihedral}°, diff ${g.diff}°)`);
      }
      for (const s of mvc.structuralInconsistencies.slice(0, 3)) {
        console.log(`     ⚠️  edge ${s.edge}: ${s.detail}`);
      }
      if (mvc.geometricInconsistencies.length > 3) {
        console.log(`     ... and ${mvc.geometricInconsistencies.length - 3} more geometric`);
      }
    }
    for (const note of mvc.notes) {
      console.log(`   ℹ️  ${note}`);
    }
    console.log('');
  }

  // Self-Intersection (v2.6, extended v2.7)
  if (options.all && selfIntersection) {
    const si = selfIntersection;
    console.log('🪡 Self-Intersection (3D):');
    console.log(`   Pairs checked:    ${si.facePairCount}`);
    if (si.aabbSurvivorCount > 0) {
      console.log(`   AABB survivors:   ${si.aabbSurvivorCount} (passed bounding-box filter)`);
    }
    console.log(`   Intersections:    ${si.intersectionCount}`);
    if (si.edgeCrossingCount || si.vertexInsideCount || si.coplanarOverlapCount) {
      console.log(`   By kind:          edge=${si.edgeCrossingCount || 0}  vertex-inside=${si.vertexInsideCount || 0}  coplanar=${si.coplanarOverlapCount || 0}`);
    }
    for (const intr of si.intersections.slice(0, 5)) {
      const dist = intr.minDistance !== undefined ? ` (min dist: ${intr.minDistance})` : '';
      console.log(`     ⚠️  faces ${intr.face1}–${intr.face2} [${intr.kind}]${dist}`);
    }
    if (si.intersections.length > 5) {
      console.log(`     ... and ${si.intersections.length - 5} more`);
    }
    for (const note of si.notes) {
      console.log(`   ℹ️  ${note}`);
    }
    console.log('');
  }

  // Face Normals (v2.7)
  if (options.all && faceNormals) {
    const fn = faceNormals;
    console.log('🧭 Face Normal Consistency:');
    console.log(`   Faces analyzed:   ${fn.faceCount}`);
    console.log(`   Total area:       ${fn.totalArea.toFixed(2)}`);
    console.log(`   Divergence ratio: ${fn.divergenceRatio.toFixed(4)} (0=perfect, >0.5=many flipped)`);
    console.log(`   Consistent:       ${fn.consistent ? '✅ Yes' : '⚠️  No'}`);
    if (fn.degenerateFaces.length > 0) {
      console.log(`   Degenerate:       ${fn.degenerateFaces.length} face(s) with zero area: [${fn.degenerateFaces.join(', ')}]`);
    }
    for (const note of fn.notes) {
      console.log(`   ℹ️  ${note}`);
    }
    console.log('');
  }

  // Holes & Boundary Loops (v2.8)
  if (options.all && holes) {
    const h = holes;
    console.log('🕳️  Holes & Boundary Loops:');
    console.log(`   Boundary edges:   ${h.boundaryEdgeCount}`);
    console.log(`   Interior edges:   ${h.interiorEdgeCount}`);
    console.log(`   Loops detected:   ${h.loopCount} (${h.outerBoundaryCount} outer, ${h.holeCount} hole${h.holeCount !== 1 ? 's' : ''})`);
    for (const loop of h.loops.slice(0, 5)) {
      const kindLabel = loop.isOuterBoundary ? 'outer' : 'hole';
      console.log(`     - ${kindLabel} loop: ${loop.edgeIndices.length} edges, perimeter ${loop.perimeter.toFixed(2)}, area ${loop.enclosedArea.toFixed(2)}`);
    }
    if (h.loops.length > 5) {
      console.log(`     ... and ${h.loops.length - 5} more`);
    }
    for (const note of h.notes) {
      console.log(`   ℹ️  ${note}`);
    }
    console.log('');
  }

  // Fold Order (v2.9)
  if (options.all && foldOrder) {
    const fo = foldOrder;
    console.log('🎴 Fold Order:');
    console.log(`   M/V folds total:  ${fo.totalFolds}`);
    console.log(`   Steps required:   ${fo.stepCount}`);
    for (const step of fo.foldSequence.slice(0, 8)) {
      console.log(`     step ${step.step}: layer ${step.layer} → ${step.foldCount} fold(s) [edges: ${step.edgeIndices.join(', ')}]`);
    }
    if (fo.foldSequence.length > 8) {
      console.log(`     ... and ${fo.foldSequence.length - 8} more steps`);
    }
    for (const note of fo.notes) {
      console.log(`   ℹ️  ${note}`);
    }
    console.log('');
  }

  // M/V Alternation (v2.12)
  if (options.all && mvAlternation) {
    const ma = mvAlternation;
    console.log('🔁 M/V Alternation:');
    console.log(`   Checked:          ${ma.totalChecked} internal vertex/vertices`);
    console.log(`   Consistent:       ${ma.consistent}`);
    if (ma.inconsistent > 0) {
      console.log(`   Inconsistent:     ${ma.inconsistent}`);
      for (const inc of ma.inconsistencies.slice(0, 5)) {
        console.log(`     ⚠️  vertex ${inc.vertex}: pattern="${inc.pattern}", ${inc.detail}`);
      }
      if (ma.inconsistencies.length > 5) {
        console.log(`     ... and ${ma.inconsistencies.length - 5} more`);
      }
    }
    for (const note of ma.notes) {
      console.log(`   ℹ️  ${note}`);
    }
    console.log('');
  }

  // Strict Kawasaki (v2.12)
  if (options.all && strictKawasaki) {
    const sk = strictKawasaki;
    console.log('📏 Strict Kawasaki:');
    console.log(`   Total checked:    ${sk.totalChecked}`);
    console.log(`   Within tolerance: ${sk.withinTolerance} (deviation < 5°)`);
    console.log(`   Out of tolerance: ${sk.outOfTolerance}`);
    if (sk.topDeviations.length > 0) {
      console.log(`   Top deviations:`);
      for (const d of sk.topDeviations.slice(0, 5)) {
        console.log(`     vertex ${d.vertex}: ${d.deviation}° (even=${d.evenSum}°, odd=${d.oddSum}°)`);
      }
    }
    for (const note of sk.notes) {
      console.log(`   ℹ️  ${note}`);
    }
    console.log('');
  }

  // Strict Maekawa (v2.14)
  if (options.all && strictMaekawa) {
    const sm = strictMaekawa;
    console.log('🏔️  Strict Maekawa:');
    console.log(`   Total checked:     ${sm.totalChecked}`);
    console.log(`   Within tolerance:  ${sm.withinTolerance} (|M-V| = 2)`);
    console.log(`   Out of tolerance:  ${sm.outOfTolerance}`);
    if (sm.topDeviations.length > 0) {
      console.log(`   Top deviations:`);
      for (const d of sm.topDeviations.slice(0, 5)) {
        console.log(`     vertex ${d.vertex}: M=${d.M}/V=${d.V}, |M-V|-2 = ${d.deviation}`);
      }
    }
    for (const note of sm.notes) {
      console.log(`   ℹ️  ${note}`);
    }
    console.log('');
  }

  // Warnings
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    for (const w of warnings) {
      console.log(`   • ${w}`);
    }
    console.log('');
  }

  console.log('✅ Analysis complete');
}

module.exports = { registerAnalyzeCommand };
module.exports.registerAnalyzeCommand = registerAnalyzeCommand;
