/**
 * Dieline Command
 * Parse and convert packaging dieline files (PDF/EPS/AI/SVG) to FOLD format
 */

const path = require('path');
const fs = require('fs');
const DielineParser = require('../utils/dieline-parser');

/**
 * Register dieline command with Commander
 * @param {Command} program - Commander program instance
 */
function registerDielineCommand(program) {
  const dieline = program
    .command('dieline')
    .description('Parse and convert packaging dieline files to FOLD format');

  // dieline parse command
  dieline
    .command('parse <file>')
    .description('Parse a dieline file (PDF/EPS/AI/SVG/FOLD) and output as FOLD JSON')
    .option('-o, --output <file>', 'Output file path (default: stdout)')
    .option('-f, --format <format>', 'Output format: fold, svg (default: fold)')
    .option('--scale <number>', 'Scale factor for coordinates', '100')
    .option('--debug', 'Enable debug output')
    .action(async (file, options) => {
      await parseDieline(file, options);
    });

  // dieline export command
  dieline
    .command('export <file>')
    .description('Export parsed dieline to different format')
    .option('-o, --output <file>', 'Output file path (required)')
    .option('-f, --format <format>', 'Output format: fold, svg (required)')
    .option('--scale <number>', 'Scale factor for coordinates', '100')
    .option('--debug', 'Enable debug output')
    .action(async (file, options) => {
      await exportDieline(file, options);
    });

  // dieline validate command
  dieline
    .command('validate <file>')
    .description('Validate a dieline file format')
    .option('--debug', 'Enable debug output')
    .action(async (file, options) => {
      await validateDieline(file, options);
    });

  // dieline info command
  dieline
    .command('info <file>')
    .description('Show information about a dieline file')
    .option('--debug', 'Enable debug output')
    .action(async (file, options) => {
      await dielineInfo(file, options);
    });
}

/**
 * Parse a dieline file and output FOLD format
 */
async function parseDieline(inputFile, options) {
  try {
    // Validate input file exists
    if (!fs.existsSync(inputFile)) {
      console.error(`❌ File not found: ${inputFile}`);
      process.exit(1);
    }

    // Validate file type
    if (!DielineParser.isValidDielineFile(inputFile)) {
      console.error(`❌ Unsupported file format: ${path.extname(inputFile)}`);
      console.error('   Supported formats: .pdf, .eps, .ai, .svg, .fold');
      process.exit(1);
    }

    const parser = new DielineParser({
      scale: parseFloat(options.scale),
      debug: options.debug,
    });

    if (options.debug) {
      console.log(`Parsing dieline: ${inputFile}`);
    }

    const foldData = await parser.parse(inputFile);

    if (options.output) {
      if (options.format === 'svg') {
        parser.exportToSVG(options.output, foldData);
        console.log(`✅ Exported SVG: ${options.output}`);
      } else {
        parser.exportToFold(options.output, foldData);
        console.log(`✅ Exported FOLD: ${options.output}`);
      }
    } else {
      // Output to stdout
      console.log(JSON.stringify(foldData, null, 2));
    }
  } catch (error) {
    console.error(`❌ Error parsing dieline: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Export parsed dieline to different format
 */
async function exportDieline(inputFile, options) {
  if (!options.output) {
    console.error('❌ Output file required (-o, --output)');
    process.exit(1);
  }

  if (!options.format) {
    console.error('❌ Output format required (-f, --format)');
    process.exit(1);
  }

  if (!['fold', 'svg'].includes(options.format)) {
    console.error(`❌ Invalid format: ${options.format}`);
    console.error('   Supported formats: fold, svg');
    process.exit(1);
  }

  try {
    if (!fs.existsSync(inputFile)) {
      console.error(`❌ File not found: ${inputFile}`);
      process.exit(1);
    }

    const parser = new DielineParser({
      scale: parseFloat(options.scale),
      debug: options.debug,
    });

    const foldData = await parser.parse(inputFile);

    if (options.format === 'svg') {
      parser.exportToSVG(options.output, foldData);
    } else {
      parser.exportToFold(options.output, foldData);
    }

    console.log(`✅ Exported ${options.format.toUpperCase()}: ${options.output}`);
  } catch (error) {
    console.error(`❌ Error exporting dieline: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Validate a dieline file
 */
async function validateDieline(inputFile, options) {
  try {
    if (!fs.existsSync(inputFile)) {
      console.error(`❌ File not found: ${inputFile}`);
      process.exit(1);
    }

    const ext = path.extname(inputFile).toLowerCase();
    const isValid = DielineParser.isValidDielineFile(inputFile);

    if (isValid) {
      console.log(`✅ Valid dieline file: ${ext}`);

      // Try to parse it
      const parser = new DielineParser({ debug: options.debug });
      const foldData = await parser.parse(inputFile);

      const vertexCount = foldData.vertices_coords?.length || 0;
      const edgeCount = foldData.edges_vertices?.length || 0;
      const faceCount = foldData.faces_vertices?.length || 0;

      console.log(`\n📊 Dieline Statistics:`);
      console.log(`   Vertices: ${vertexCount}`);
      console.log(`   Edges: ${edgeCount}`);
      console.log(`   Faces: ${faceCount}`);
    } else {
      console.error(`❌ Unsupported file format: ${ext}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Validation failed: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Show information about a dieline file
 */
async function dielineInfo(inputFile, options) {
  try {
    if (!fs.existsSync(inputFile)) {
      console.error(`❌ File not found: ${inputFile}`);
      process.exit(1);
    }

    const ext = path.extname(inputFile).toLowerCase();
    const stats = fs.statSync(inputFile);

    console.log(`📄 Dieline File: ${path.basename(inputFile)}`);
    console.log(`   Format: ${ext.toUpperCase().replace('.', '')}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   Path: ${inputFile}`);

    // Parse and show structure info
    const parser = new DielineParser({ debug: options.debug });
    const foldData = await parser.parse(inputFile);

    if (Array.isArray(foldData)) {
      console.log(`   Pages: ${foldData.length}`);
    } else if (foldData.pageWidth && foldData.pageHeight) {
      console.log(`   Page Size: ${foldData.pageWidth}x${foldData.pageHeight}`);
    }

    const vertexCount = foldData.vertices_coords?.length || 0;
    const edgeCount = foldData.edges_vertices?.length || 0;
    const faceCount = foldData.faces_vertices?.length || 0;

    console.log(`\n📐 Structure:`);
    console.log(`   Vertices: ${vertexCount}`);
    console.log(`   Edges: ${edgeCount}`);
    console.log(`   Faces: ${faceCount}`);

    if (foldData.frame_title) {
      console.log(`   Title: ${foldData.frame_title}`);
    }
  } catch (error) {
    console.error(`❌ Error reading dieline info: ${error.message}`);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

module.exports = { registerDielineCommand };
module.exports.registerDielineCommand = registerDielineCommand;