/**
 * Bind Command
 * Bind artwork images to faces of a folded model
 */

const path = require('path');
const fs = require('fs');
const { FaceBinding, autoDetectBindings } = require('../utils/face-binding');

/**
 * Register bind command with Commander
 * @param {Command} program - Commander program instance
 */
function registerBindCommand(program) {
  const bind = program
    .command('bind')
    .description('Bind artwork images to faces of a folded model');

  // bind add command - bind single artwork to face
  bind
    .command('add <model> <face> <artwork>')
    .description('Bind artwork to a specific face')
    .option('-o, --output <file>', 'Output file path (default: model with _bound suffix)')
    .option('-r, --rotation <degrees>', 'Rotation (0, 90, 180, 270)', '0')
    .option('-l, --layer <name>', 'Layer name', 'default')
    .option('-s, --scale <number>', 'Scale factor', '1')
    .option('--debug', 'Enable debug output')
    .action(async (model, face, artwork, options) => {
      await addBinding(model, face, artwork, options);
    });

  // bind batch command - bind multiple artworks from directory
  bind
    .command('batch <model> <dir>')
    .description('Auto-detect and bind artworks from directory')
    .option('-o, --output <file>', 'Output file path')
    .option('-p, --pattern <pattern>', 'Filename pattern (e.g., face%%d.png)', 'face%d.png')
    .option('--debug', 'Enable debug output')
    .action(async (model, dir, options) => {
      await batchBinding(model, dir, options);
    });

  // bind list command - list current bindings
  bind
    .command('list <model>')
    .description('List current bindings on a model')
    .option('--debug', 'Enable debug output')
    .action(async (model, options) => {
      await listBindings(model, options);
    });

  // bind remove command - remove binding from face
  bind
    .command('remove <model> <face>')
    .description('Remove binding from a specific face')
    .option('-o, --output <file>', 'Output file path')
    .option('--debug', 'Enable debug output')
    .action(async (model, face, options) => {
      await removeBinding(model, face, options);
    });

  // bind clear command - clear all bindings
  bind
    .command('clear <model>')
    .description('Clear all bindings from a model')
    .option('-o, --output <file>', 'Output file path')
    .option('--debug', 'Enable debug output')
    .action(async (model, options) => {
      await clearBindings(model, options);
    });

  // bind generate command - generate template artwork files
  bind
    .command('generate <model>')
    .description('Generate template SVG files for each unbound face')
    .option('-o, --output <dir>', 'Output directory', './artwork-templates')
    .option('-f, --format <format>', 'Format: svg, png', 'svg')
    .option('--debug', 'Enable debug output')
    .action(async (model, options) => {
      await generateTemplates(model, options);
    });
}

/**
 * Add a single binding
 */
async function addBinding(modelPath, faceIndex, artworkPath, options) {
  try {
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model file not found: ${modelPath}`);
      process.exit(1);
    }

    if (!fs.existsSync(artworkPath)) {
      console.error(`❌ Artwork file not found: ${artworkPath}`);
      process.exit(1);
    }

    const face = parseInt(faceIndex);
    if (isNaN(face)) {
      console.error(`❌ Invalid face index: ${faceIndex}`);
      process.exit(1);
    }

    const binder = new FaceBinding({ debug: options.debug });
    binder.loadModel(modelPath);

    binder.bindArtwork(face, artworkPath, {
      rotation: parseInt(options.rotation) || 0,
      layer: options.layer,
      scale: parseFloat(options.scale) || 1,
    });

    const outputPath = options.output || generateOutputPath(modelPath);
    binder.exportModel(outputPath);

    const stats = binder.getStats();
    console.log(`✅ Bound face ${face} to ${path.basename(artworkPath)}`);
    console.log(`\n📊 Binding Statistics:`);
    console.log(`   Total faces: ${stats.totalFaces}`);
    console.log(`   Bound faces: ${stats.boundFaces}`);
    console.log(`   Unbound faces: ${stats.unboundFaces}`);
    console.log(`\n💾 Output: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error adding binding: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Batch binding from directory
 */
async function batchBinding(modelPath, dirPath, options) {
  try {
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model file not found: ${modelPath}`);
      process.exit(1);
    }

    if (!fs.existsSync(dirPath)) {
      console.error(`❌ Artwork directory not found: ${dirPath}`);
      process.exit(1);
    }

    const binder = new FaceBinding({ debug: options.debug });
    binder.loadModel(modelPath);

    // Auto-detect bindings from directory
    const bindings = autoDetectBindings(dirPath);

    if (bindings.length === 0) {
      console.log('⚠️  No artwork files found in directory');
      return;
    }

    // Apply bindings
    for (const binding of bindings) {
      try {
        binder.bindArtwork(binding.faceIndex, binding.artworkPath, binding.options);
        console.log(`✅ Bound face ${binding.faceIndex}: ${path.basename(binding.artworkPath)}`);
      } catch (err) {
        console.warn(`⚠️  Skipped face ${binding.faceIndex}: ${err.message}`);
      }
    }

    const outputPath = options.output || generateOutputPath(modelPath);
    binder.exportModel(outputPath);

    const stats = binder.getStats();
    console.log(`\n📊 Binding Statistics:`);
    console.log(`   Total faces: ${stats.totalFaces}`);
    console.log(`   Bound faces: ${stats.boundFaces}`);
    console.log(`   Unbound faces: ${stats.unboundFaces}`);
    console.log(`\n💾 Output: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error in batch binding: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * List current bindings on a model
 */
async function listBindings(modelPath, options) {
  try {
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model file not found: ${modelPath}`);
      process.exit(1);
    }

    const binder = new FaceBinding({ debug: options.debug });
    binder.loadModel(modelPath);

    // Check if model already has bindings
    if (binder.model.faces_material) {
      for (let i = 0; i < binder.model.faces_material.length; i++) {
        const material = binder.model.faces_material[i];
        if (material.artwork) {
          console.log(`Face ${i}: ${material.artwork} (layer: ${material.layer || 'default'})`);
        }
      }
    }

    // Show stats
    const stats = binder.getStats();
    console.log(`\n📊 Binding Statistics:`);
    console.log(`   Total faces: ${stats.totalFaces}`);
    console.log(`   Bound faces: ${stats.boundFaces}`);
    console.log(`   Unbound faces: ${stats.unboundFaces}`);

    if (stats.layers.length > 0) {
      console.log(`   Layers: ${stats.layers.join(', ')}`);
    }
  } catch (error) {
    console.error(`❌ Error listing bindings: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Remove binding from a specific face
 */
async function removeBinding(modelPath, faceIndex, options) {
  try {
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model file not found: ${modelPath}`);
      process.exit(1);
    }

    const face = parseInt(faceIndex);
    if (isNaN(face)) {
      console.error(`❌ Invalid face index: ${faceIndex}`);
      process.exit(1);
    }

    const binder = new FaceBinding({ debug: options.debug });
    binder.loadModel(modelPath);

    if (binder.isFaceBound(face)) {
      binder.unbindFace(face);
      console.log(`✅ Removed binding from face ${face}`);
    } else {
      console.log(`Face ${face} is not bound`);
    }

    const outputPath = options.output || generateOutputPath(modelPath);
    binder.exportModel(outputPath);
    console.log(`\n💾 Output: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error removing binding: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Clear all bindings
 */
async function clearBindings(modelPath, options) {
  try {
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model file not found: ${modelPath}`);
      process.exit(1);
    }

    const binder = new FaceBinding({ debug: options.debug });
    binder.loadModel(modelPath);
    binder.clearBindings();

    const outputPath = options.output || generateOutputPath(modelPath);
    binder.exportModel(outputPath);

    console.log(`✅ Cleared all bindings`);
    console.log(`\n💾 Output: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error clearing bindings: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Generate template SVG files for unbound faces
 */
async function generateTemplates(modelPath, options) {
  try {
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model file not found: ${modelPath}`);
      process.exit(1);
    }

    const binder = new FaceBinding({ debug: options.debug });
    binder.loadModel(modelPath);

    const outputDir = options.output;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const faceCount = binder.model.faces_vertices.length;
    let generated = 0;

    for (let i = 0; i < faceCount; i++) {
      if (!binder.isFaceBound(i)) {
        const uv = binder.computeUV(i);
        const width = (uv[2] - uv[0]) * 100;
        const height = (uv[3] - uv[1]) * 100;

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${uv[0]} ${uv[1]} ${uv[2] - uv[0]} ${uv[3] - uv[1]}" width="${width}" height="${height}">
  <!-- Template for face ${i} -->
  <!-- Add your artwork here -->
  <rect x="${uv[0]}" y="${uv[1]}" width="${uv[2] - uv[0]}" height="${uv[3] - uv[1]}" fill="none" stroke="#ccc" stroke-width="0.01"/>
  <text x="${(uv[0] + uv[2]) / 2}" y="${(uv[1] + uv[3]) / 2}" text-anchor="middle" fill="#999" font-size="0.1">Face ${i}</text>
</svg>`;

        const outputPath = path.join(outputDir, `face_${i}.svg`);
        fs.writeFileSync(outputPath, svg);
        generated++;
        console.log(`✅ Generated: ${outputPath}`);
      }
    }

    console.log(`\n📊 Generated ${generated} template files in ${outputDir}`);
  } catch (error) {
    console.error(`❌ Error generating templates: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Generate output path with _bound suffix
 */
function generateOutputPath(inputPath) {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  return path.join(dir, `${base}_bound.fold`);
}

module.exports = { registerBindCommand };
module.exports.registerBindCommand = registerBindCommand;