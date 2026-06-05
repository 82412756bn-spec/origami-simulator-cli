/**
 * Render Command v2
 * Three.js based commercial-grade rendering for packaging mockups
 *
 * Features:
 * - 8 PBR materials (paper, cardboard, metal, plastic)
 * - 6 HDRI lighting presets (studio, sunset, cool, etc.)
 * - 7 camera angles (30°, 45°, 60°, front, top, etc.)
 * - 4 output formats (PNG, JPG, WebP)
 * - Up to 4096×4096 output resolution
 */

const path = require('path');
const fs = require('fs');
const { Renderer, BatchRenderSettings } = require('../utils/renderer');
const {
  CommercialRenderer,
  MATERIAL_PRESETS,
  HDRI_PRESETS,
  CAMERA_ANGLES,
} = require('../utils/commercial-renderer');

/**
 * Register render command with Commander
 */
function registerRenderCommand(program) {
  const render = program
    .command('render')
    .description('Render commercial-quality mockup images (Three.js PBR)');

  // render single - uses new CommercialRenderer
  render
    .command('single <model>')
    .description('Render a single mockup image (commercial quality)')
    .option('-o, --output <path>', 'Output file path', 'mockup.png')
    .option('--dpi <number>', 'Resolution (72=web, 150=mid, 300=print)', '150')
    .option('--width <number>', 'Image width in pixels', '1920')
    .option('--height <number>', 'Image height in pixels', '1080')
    .option('--material <name>', `Material: ${CommercialRenderer.listMaterials().map(m => m.id).join(', ')}`, 'cardboard')
    .option('--hdri <name>', `Lighting: ${CommercialRenderer.listHDRI().map(h => h.id).join(', ')}`, 'studio')
    .option('--angle <name>', `Camera: ${CommercialRenderer.listAngles().map(a => a.id).join(', ')}`, '45')
    .option('--background <color>', 'Background color (hex)', '')
    .option('--transparent', 'Transparent background')
    .option('-f, --format <format>', 'Output format: png, jpg, webp', 'png')
    .option('--quality <number>', 'JPEG/WebP quality (0-1)', '0.95')
    .option('--debug', 'Enable debug output')
    .action(async (model, options) => {
      await renderSingleCommercial(model, options);
    });

  // render batch
  render
    .command('batch <model>')
    .description('Render multiple angles/formats')
    .option('-o, --output <dir>', 'Output directory')
    .option('--dpi <number>', 'Resolution', '150')
    .option('--angles <list>', `Angles: ${CommercialRenderer.listAngles().map(a => a.id).join(', ')}`, '30,45,60')
    .option('--material <name>', 'Material preset', 'cardboard')
    .option('--hdri <name>', 'HDRI preset', 'studio')
    .option('-f, --format <format>', 'Output format: png, jpg, webp', 'png')
    .option('--debug', 'Enable debug output')
    .action(async (model, options) => {
      await renderBatchCommercial(model, options);
    });

  // render presets
  render
    .command('presets')
    .description('List all available render presets')
    .action(async () => {
      await listAllPresets();
    });

  // render materials
  render
    .command('materials')
    .description('List available PBR materials')
    .action(async () => {
      listMaterials();
    });

  // render lighting
  render
    .command('lighting')
    .description('List available HDRI lighting presets')
    .action(async () => {
      listLighting();
    });

  // render angles
  render
    .command('angles')
    .description('List available camera angles')
    .action(async () => {
      listAngles();
    });
}

/**
 * Render a single mockup with commercial quality
 */
async function renderSingleCommercial(modelPath, options) {
  try {
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model file not found: ${modelPath}`);
      process.exit(1);
    }

    const fold = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

    // Map DPI to width/height if user only provided DPI
    let width = parseInt(options.width) || 1920;
    let height = parseInt(options.height) || 1080;
    const dpi = parseInt(options.dpi) || 150;

    if (options.dpi && !options.width && !options.height) {
      // Scale by DPI
      const baseScale = dpi / 72;
      width = Math.round(1920 * baseScale);
      height = Math.round(1080 * baseScale);
    }

    const material = options.material || 'cardboard';
    const hdri = options.hdri || 'studio';
    const angle = options.angle || '45';

    // Validate options
    if (!MATERIAL_PRESETS[material]) {
      console.error(`❌ Unknown material: ${material}`);
      console.error('   Available:', CommercialRenderer.listMaterials().map(m => m.id).join(', '));
      process.exit(1);
    }
    if (!HDRI_PRESETS[hdri]) {
      console.error(`❌ Unknown HDRI: ${hdri}`);
      process.exit(1);
    }
    if (!CAMERA_ANGLES[angle]) {
      console.error(`❌ Unknown angle: ${angle}`);
      process.exit(1);
    }

    const outputPath = options.output || `mockup_${material}_${hdri}_${angle}.${options.format || 'png'}`;

    console.log(`🎬 Rendering commercial mockup...`);
    console.log(`   Model: ${modelPath}`);
    console.log(`   Dimensions: ${width}×${height} (${dpi} DPI)`);
    console.log(`   Material: ${MATERIAL_PRESETS[material].name}`);
    console.log(`   Lighting: ${HDRI_PRESETS[hdri].name}`);
    console.log(`   Angle: ${CAMERA_ANGLES[angle].name}`);
    console.log(`   Output: ${outputPath}`);

    const renderer = new CommercialRenderer({
      width,
      height,
      dpi,
      material,
      hdri,
      angle,
      format: options.format || 'png',
      quality: parseFloat(options.quality) || 0.95,
      outputPath,
      background: options.background || null,
      transparent: options.transparent || false,
      debug: options.debug,
    });

    const result = await renderer.render(fold);

    if (result.success) {
      console.log(`\n✅ Render complete!`);
      console.log(`   File: ${result.outputPath}`);
      console.log(`   Size: ${(result.size / 1024).toFixed(1)} KB`);
    } else {
      console.error(`❌ Render failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error rendering: ${error.message}`);
    if (options.debug) console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Batch render
 */
async function renderBatchCommercial(modelPath, options) {
  try {
    if (!fs.existsSync(modelPath)) {
      console.error(`❌ Model file not found: ${modelPath}`);
      process.exit(1);
    }

    const fold = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

    const angles = options.angles.split(',').map(a => a.trim());
    const material = options.material || 'cardboard';
    const hdri = options.hdri || 'studio';
    const format = options.format || 'png';

    const outputDir = options.output || path.join(path.dirname(modelPath), 'renders');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const width = 1920;
    const height = 1080;

    console.log(`🎬 Batch rendering ${angles.length} mockups...`);
    console.log(`   Material: ${MATERIAL_PRESETS[material]?.name || material}`);
    console.log(`   Lighting: ${HDRI_PRESETS[hdri]?.name || hdri}`);
    console.log(`   Output: ${outputDir}`);

    let successCount = 0;
    for (const angle of angles) {
      const outputPath = path.join(outputDir, `mockup_${material}_${hdri}_${angle}.${format}`);

      const renderer = new CommercialRenderer({
        width, height, material, hdri, angle, format, outputPath, debug: false,
      });

      const result = await renderer.render(fold);
      if (result.success) {
        console.log(`   ✅ ${angle}°: ${path.basename(outputPath)} (${(result.size / 1024).toFixed(1)}KB)`);
        successCount++;
      } else {
        console.log(`   ❌ ${angle}°: ${result.error}`);
      }
    }

    console.log(`\n✅ Batch render: ${successCount}/${angles.length} successful`);
  } catch (error) {
    console.error(`❌ Error in batch render: ${error.message}`);
    if (options.debug) console.error(error.stack);
    process.exit(1);
  }
}

/**
 * List all presets (legacy + new)
 */
async function listAllPresets() {
  console.log('📐 Available Render Presets:\n');

  console.log('--- New: PBR + HDRI Presets ---\n');

  console.log('Materials:');
  for (const m of CommercialRenderer.listMaterials()) {
    console.log(`  ${m.id.padEnd(22)} ${m.name}`);
  }

  console.log('\nLighting (HDRI):');
  for (const h of CommercialRenderer.listHDRI()) {
    console.log(`  ${h.id.padEnd(15)} ${h.name}`);
  }

  console.log('\nCamera Angles:');
  for (const a of CommercialRenderer.listAngles()) {
    console.log(`  ${a.id.padEnd(15)} ${a.name}`);
  }

  console.log('\n--- Legacy: Resolution Presets ---\n');
  const presets = Renderer.presets();
  for (const [name, settings] of Object.entries(presets)) {
    console.log(`  ${name.padEnd(12)} - ${settings.name}`);
  }
}

function listMaterials() {
  console.log('🎨 PBR Materials:\n');
  for (const m of CommercialRenderer.listMaterials()) {
    console.log(`  ${m.id.padEnd(22)} ${m.name.padEnd(15)} (R:${m.roughness}, M:${m.metalness})`);
  }
}

function listLighting() {
  console.log('💡 HDRI Lighting Presets:\n');
  for (const h of CommercialRenderer.listHDRI()) {
    console.log(`  ${h.id.padEnd(15)} ${h.name}`);
  }
}

function listAngles() {
  console.log('📷 Camera Angles:\n');
  for (const a of CommercialRenderer.listAngles()) {
    console.log(`  ${a.id.padEnd(15)} ${a.name}`);
  }
}

module.exports = { registerRenderCommand };
module.exports.registerRenderCommand = registerRenderCommand;
