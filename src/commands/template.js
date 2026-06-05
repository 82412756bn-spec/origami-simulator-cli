/**
 * Template Command v2
 * Generate and manage packaging box templates with material presets and SVG export
 */

const path = require('path');
const fs = require('fs');
const {
  generateTemplate,
  getAvailableTemplates,
} = require('../templates/packaging/box-templates');
const { validateTemplate } = require('../templates/packaging/validator');
const {
  MATERIALS,
  getMaterial,
  listMaterials,
  calculateMaterialFoldAngle,
  validateMaterialForBox,
} = require('../templates/packaging/materials');
const { DielineSVGExporter } = require('../utils/dieline-svg-exporter');
const { BoxBatchGenerator } = require('../utils/box-batch-generator');

/**
 * Register template command with Commander
 */
function registerTemplateCommand(program) {
  const template = program
    .command('template')
    .description('Generate and manage packaging box templates');

  // template list command
  template
    .command('list')
    .description('List all available box templates')
    .option('--format <format>', 'Output format: text, json', 'text')
    .action(async (options) => {
      await listTemplates(options);
    });

  // template materials command
  template
    .command('materials')
    .description('List all available material presets')
    .action(async () => {
      await listMaterialsCommand();
    });

  // template generate command
  template
    .command('generate <name>')
    .description('Generate a box template dieline')
    .option('-o, --output <path>', 'Output file path (default: stdout)')
    .option('-w, --width <mm>', 'Box width in mm', '100')
    .option('-h, --height <mm>', 'Box height in mm', '60')
    .option('-d, --depth <mm>', 'Box depth in mm', '30')
    .option('-t, --thickness <mm>', 'Material thickness in mm (default: 1.0)', '1.0')
    .option('-m, --material <name>', 'Use material preset (overrides thickness)')
    .option('--export-svg <path>', 'Also export as printable SVG')
    .option('--format <format>', 'Output format: fold, json', 'fold')
    .option('--validate', 'Validate generated template')
    .option('--debug', 'Enable debug output')
    .action(async (name, options) => {
      await generateBoxTemplate(name, options);
    });

  // template batch command
  template
    .command('batch <name>')
    .description('Generate multiple thickness variants for testing')
    .option('-o, --output <dir>', 'Output directory', './box-variants')
    .option('-w, --width <mm>', 'Box width in mm', '100')
    .option('-h, --height <mm>', 'Box height in mm', '60')
    .option('-d, --depth <mm>', 'Box depth in mm', '30')
    .option('--thicknesses <list>', 'Comma-separated thicknesses', '0.5,1,2,3')
    .option('--debug', 'Enable debug output')
    .action(async (name, options) => {
      await batchGenerate(name, options);
    });

  // template info command
  template
    .command('info <name>')
    .description('Show information about a template')
    .action(async (name, options) => {
      await templateInfo(name, options);
    });
}

/**
 * List all available templates
 */
async function listTemplates(options) {
  const templates = getAvailableTemplates();

  if (options.format === 'json') {
    console.log(JSON.stringify(templates, null, 2));
  } else {
    console.log('📦 Available Box Templates:\n');

    // Group by category
    const byCategory = {};
    for (const t of templates) {
      if (!byCategory[t.category]) {
        byCategory[t.category] = [];
      }
      byCategory[t.category].push(t);
    }

    for (const [category, items] of Object.entries(byCategory)) {
      console.log(`[${category.toUpperCase()}]`);
      for (const t of items) {
        console.log(`  ${t.id.padEnd(16)} ${t.name.padEnd(16)} ${t.nameCN}`);
      }
      console.log();
    }

    console.log('Commands:');
    console.log('  origami template list                 - Show templates');
    console.log('  origami template materials            - Show material presets');
    console.log('  origami template generate <name>      - Generate single');
    console.log('  origami template batch <name>         - Generate multiple variants');
    console.log('  origami template info <name>          - Show template info');
  }
}

/**
 * List material presets
 */
async function listMaterialsCommand() {
  console.log('🧱 Material Presets:\n');
  console.log('| ID'.padEnd(22) + '| Thickness | Recommended For');
  console.log('|' + '-'.repeat(21) + '+' + '-'.repeat(11) + '+' + '-'.repeat(40));

  for (const [id, mat] of Object.entries(MATERIALS)) {
    const recommended = mat.recommended.join(', ') || 'general';
    console.log(`| ${id.padEnd(20)} | ${String(mat.thickness + 'mm').padEnd(9)} | ${recommended}`);
  }

  console.log();
  console.log('Usage: origami template generate <name> --material <id>');
  console.log('Example: origami template generate mailer --material cardboard-2mm');
}

/**
 * Generate a box template
 */
async function generateBoxTemplate(name, options) {
  try {
    let material = null;
    let thickness = parseFloat(options.thickness) || 1.0;

    // Apply material preset if specified
    if (options.material) {
      try {
        material = getMaterial(options.material);
        thickness = material.thickness;

        // Check material compatibility
        const compatibility = validateMaterialForBox(material, name);
        if (!compatibility.suitable && options.debug) {
          console.warn(`⚠️  ${compatibility.warning}`);
          if (compatibility.suggestion) {
            console.warn(`   Suggestion: --material ${compatibility.suggestion}`);
          }
        }
      } catch (err) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
      }
    }

    const dimensions = {
      width: parseFloat(options.width) || 100,
      height: parseFloat(options.height) || 60,
      depth: parseFloat(options.depth) || 30,
      thickness,
    };

    if (options.debug) {
      console.log(`Generating template: ${name}`);
      console.log(`Dimensions: ${dimensions.width}×${dimensions.height}×${dimensions.depth}mm`);
      console.log(`Material: ${material ? options.material + ' (preset)' : 'custom'}`);
      console.log(`Thickness: ${thickness}mm`);
    }

    // Generate dieline
    const dieline = generateTemplate(name, dimensions);

    // Validate if requested
    if (options.validate) {
      const validation = validateTemplate({
        name,
        type: dieline.box_type,
        dimensions,
        dieline,
      });

      if (!validation.valid) {
        console.error('❌ Validation failed:');
        validation.errors.forEach(e => console.error(`   - ${e}`));
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach(w => console.warn(`⚠️  ${w}`));
      }

      console.log('✅ Template validated successfully');
    }

    // Output FOLD/JSON
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(dieline, null, 2));
      console.log(`✅ Generated: ${options.output}`);
      console.log(`   Template: ${dieline.frame_title}`);
      console.log(`   Dimensions: ${dieline.box_dimensions.width}×${dieline.box_dimensions.height}×${dieline.box_dimensions.depth}mm`);
      console.log(`   Thickness: ${dieline.thickness}mm${material ? ' (' + options.material + ')' : ''}`);
      console.log(`   Vertices: ${dieline.vertices_coords.length}`);
      console.log(`   Edges: ${dieline.edges_vertices.length}`);
      console.log(`   Faces: ${dieline.faces_vertices.length}`);

      // Show fold angle summary
      const mAngle = dieline.edges_foldAngle.filter((a, i) => dieline.edges_assignment[i] === 'M')[0] || 0;
      const vAngle = dieline.edges_foldAngle.filter((a, i) => dieline.edges_assignment[i] === 'V')[0] || 0;
      console.log(`   Fold Angles: Mountain ${mAngle}°, Valley ${vAngle}°`);

      // Export SVG if requested
      if (options.exportSvg) {
        const exporter = new DielineSVGExporter({ debug: options.debug });
        const svg = exporter.export(dieline);
        fs.writeFileSync(options.exportSvg, svg);
        console.log(`   📄 SVG: ${options.exportSvg}`);
      }
    } else {
      // Output to stdout
      console.log(JSON.stringify(dieline, null, 2));
    }

  } catch (error) {
    console.error(`❌ Error generating template: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Batch generate multiple thickness variants
 */
async function batchGenerate(name, options) {
  try {
    const thicknesses = options.thicknesses
      ? options.thicknesses.split(',').map(t => parseFloat(t.trim()))
      : [0.5, 1, 2, 3];

    const dimensions = {
      width: parseFloat(options.width) || 100,
      height: parseFloat(options.height) || 60,
      depth: parseFloat(options.depth) || 30,
    };

    const generator = new BoxBatchGenerator({
      outputDir: options.output,
      debug: options.debug,
    });

    console.log(`📦 Batch generating ${name} with ${thicknesses.length} thickness variants...`);
    console.log(`   Output: ${options.output}`);

    const results = generator.generateThicknessVariants(name, dimensions, thicknesses);

    console.log(`\n✅ Generated ${results.length} variants:`);
    console.log();
    console.log('| Thickness | Vertices | Edges | Path |');
    console.log('|-----------|----------|-------|------|');
    for (const r of results) {
      console.log(`| ${r.thickness}mm | ${r.vertices} | ${r.edges} | ${r.path} |`);
    }
  } catch (error) {
    console.error(`❌ Error in batch generation: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Show template information
 */
async function templateInfo(name, options) {
  const templates = getAvailableTemplates();
  const template = templates.find(t => t.id === name.toLowerCase());

  if (!template) {
    console.error(`❌ Unknown template: ${name}`);
    console.log(`\nAvailable templates:`);
    templates.forEach(t => console.log(`  - ${t.id}: ${t.name} (${t.nameCN})`));
    process.exit(1);
  }

  console.log(`📦 Template: ${template.name}`);
  console.log(`   ID: ${template.id}`);
  console.log(`   Chinese: ${template.nameCN}`);
  console.log(`   Category: ${template.category}`);
  console.log();
  console.log(`Usage: origami template generate ${template.id} --width <mm> --height <mm> --depth <mm> [--material <id>|--thickness <mm>]`);
  console.log();
  console.log(`Examples:`);
  console.log(`  origami template generate ${template.id} --width 100 --height 60 --depth 30 --material cardboard-1mm`);
  console.log(`  origami template generate ${template.id} --width 100 --height 60 --depth 30 --thickness 2.0`);
  console.log(`  origami template generate ${template.id} --width 100 --height 60 --depth 30 --export-svg output.svg`);
}

module.exports = { registerTemplateCommand };
module.exports.registerTemplateCommand = registerTemplateCommand;
