#!/usr/bin/env node

/**
 * OrigamiSimulator CLI
 * CLI tool for origamisimulator.org
 */

const { Command } = require('commander');
const playwright = require('playwright');
const path = require('path');
const fs = require('fs');
const { registerDielineCommand } = require('./commands/dieline');
const { registerBindCommand } = require('./commands/bind');
const { registerRenderCommand } = require('./commands/render');
const { registerTemplateCommand } = require('./commands/template');
const presetCache = require('./utils/preset-cache');

const { VERSION } = require('./version');
const BASE_URL = 'https://origamisimulator.org/';

// Complete preset list from origamisimulator.org
// Each preset has: id, name, file, category, author
const PRESETS = [
  // Popular/Common presets (URL accessible via ?preset=<id>)
  { id: 'cranes', name: 'Crane (3D)', file: 'Origami/traditionalCrane.svg', category: 'origami' },
  { id: 'flapping-bird', name: 'Flapping Bird', file: 'Origami/flappingBird.svg', category: 'origami' },
  { id: 'flat-crane', name: 'Crane (flat)', file: 'Origami/flat_crane.svg', category: 'origami' },
  { id: 'hypar', name: 'Hypar', file: 'Origami/hypar.svg', category: 'origami' },
  { id: 'square-twist', name: 'Square Twist', file: 'Origami/singlesquaretwist.svg', category: 'origami' },

  // Bases
  { id: 'bird-base', name: 'Bird Base', file: 'Bases/birdBase.svg', category: 'bases' },
  { id: 'boat-base', name: 'Boat Base', file: 'Bases/boatBase.svg', category: 'bases' },
  { id: 'frog-base', name: 'Frog Base', file: 'Bases/frogBase.svg', category: 'bases' },
  { id: 'square-base', name: 'Square Base', file: 'Bases/squareBase.svg', category: 'bases' },
  { id: 'waterbomb-base', name: 'Waterbomb Base', file: 'Bases/waterbombBase.svg', category: 'bases' },

  // Tessellations
  { id: 'miura-ori', name: 'Miura-Ori', file: 'Tessellations/miura-ori.svg', category: 'tessellations' },
  { id: 'waterbomb', name: 'Waterbomb', file: 'Tessellations/waterbomb.svg', category: 'tessellations' },
  { id: 'flower-tower', name: 'Flower Tower', file: 'Tessellations/FTpoly7.svg', category: 'tessellations' },
  { id: 'lang-honeycomb', name: 'Lang Honeycomb', file: 'Tessellations/langHoneycomb.svg', category: 'tessellations' },
  { id: 'huffman-extruded', name: 'Huffman Extruded Boxes', file: 'Tessellations/huffmanExtrudedBoxes.svg', category: 'tessellations' },

  // Curved Folds
  { id: 'leafy-opus', name: 'Leafy Opus', file: 'Curved/Leafy_Opus_T-69.svg', category: 'curved' },
  { id: 'shell14', name: 'Shell 14', file: 'Curved/shell14.svg', category: 'curved' },
  { id: 'rotating-star', name: 'Rotating Star', file: 'Curved/Rotating_Star.svg', category: 'curved' },

  // Pleating
  { id: 'box-pleat-tess', name: 'Box Pleat Tessellation', file: 'Pleating/BoxPleatTessellation.fold', category: 'pleating' },
  { id: 'box-pleat-pyramid', name: 'Box Pleat Pyramid', file: 'Pleating/BoxPleatPyramid.fold', category: 'pleating' },

  // Other
  { id: 'airplane', name: 'Paper Airplane', file: 'Origami/airplane.svg', category: 'origami' },
  { id: 'lang-cardinal', name: 'Lang Cardinal', file: 'Origami/langCardinal.svg', category: 'origami' },
  { id: 'lang-orchid', name: 'Lang Orchid', file: 'Origami/langOrchid.svg', category: 'origami' },
  { id: 'kirigami-triangle', name: 'Kirigami Auxetic Triangle', file: 'Kirigami/auxetic_triangle.svg', category: 'kirigami' },
  { id: 'popup-simple', name: 'Simple Popup', file: 'Popup/popupSimple.svg', category: 'popup' },
  { id: 'bistable-curved', name: 'Bistable Curved Pleat', file: 'Bistable/curvedPleatSimple.svg', category: 'bistable' },
  { id: 'polygami-cross', name: 'Polygami Cross', file: 'Polygami/polygamiCross.svg', category: 'polygami' },
];

// Simple ID to preset mapping for backward compatibility
const PRESET_IDS = PRESETS.map(p => p.id);

// Legacy preset names for backward compatibility
const LEGACY_PRESETS = {
  'cranes': 'cranes',
  'flapping-bird': 'flapping-bird',
  'square': 'square-base',
  '富士山': 'hypar',
  '爆弾': 'waterbomb',
  'simple-accordion': 'box-pleat-tess',
  'star': 'rotating-star',
  'shuriken': 'miura-ori'
};

function getPresetById(id) {
  return PRESETS.find(p => p.id === id);
}

function getPresetFile(id) {
  // Check legacy names first
  const resolvedId = LEGACY_PRESETS[id] || id;
  const preset = getPresetById(resolvedId);
  return preset ? preset.file : null;
}

function buildPresetUrl(id) {
  // Get preset file path
  const presetFile = getPresetFile(id);
  if (!presetFile) return null;
  // Use ?demo= with URL-encoded path (the origami simulator server
  // expects this format for loading preset SVG files)
  return `${BASE_URL}?demo=${encodeURIComponent(presetFile)}`;
}

async function launchBrowser(timeout = 60000) {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL, { timeout });
  } catch (e) {
    console.warn('⚠️  Page load timeout, continuing anyway...');
  }
  await page.waitForTimeout(3000);
  return { browser, page, context };
}

async function waitForPageReady(page) {
  // Wait for Three.js canvas to be ready
  try {
    await page.waitForFunction(() => document.querySelector('canvas') !== null, { timeout: 15000 });
  } catch (e) {
    console.warn('⚠️  Canvas not found, page may not be fully loaded');
  }
  await page.waitForTimeout(3000);
  return page;
}

const program = new Command();

program
  .name('origami')
  .description('CLI tool for OrigamiSimulator.org')
  .version(VERSION);

// ============================================================================
// Load Command - Load model from file or preset
// ============================================================================
program
  .command('load')
  .description('Load origami model from file or preset')
  .option('-f, --file <path>', 'Path to FOLD/SVG file')
  .option('-p, --preset <name>', 'Preset model name')
  .action(async (options) => {
    // Validate inputs FIRST (before launching browser — browser launch is 3-8s)
    if (options.preset) {
      const presetFile = getPresetFile(options.preset);
      if (!presetFile) {
        console.error(`❌ Unknown preset: ${options.preset}`);
        console.log('Use "origami list" to see available presets.');
        process.exit(1);
      }
    } else if (options.file) {
      const filePath = path.resolve(options.file);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
      }
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.fold' && ext !== '.svg') {
        console.error(`❌ Unsupported file format: ${ext}`);
        console.error('   Supported formats: .fold, .svg');
        process.exit(1);
      }
    } else {
      console.log('No file or preset specified');
      console.log('Usage: origami load --preset <name> OR origami load --file <path>');
      process.exit(0);
    }

    const { browser, page } = await launchBrowser();
    try {
      if (options.preset) {
        // 本地缓存优先（站点抖动/离线也能用），未命中才走 ?demo= 远程加载
        const resolvedId = LEGACY_PRESETS[options.preset] || options.preset;
        const presetFile = getPresetFile(options.preset);
        const preset = getPresetById(resolvedId);
        if (presetCache.hasCache(resolvedId, presetFile)) {
          const fileInput = await page.locator('input#fileSelector');
          await fileInput.setInputFiles(presetCache.cachePath(resolvedId, presetFile));
          await page.waitForTimeout(2000);
          await waitForPageReady(page);
          console.log(`✅ Loaded preset: ${options.preset}${preset ? ` (${preset.name})` : ''} [本地缓存]`);
        } else {
          const presetUrl = `${BASE_URL}?demo=${encodeURIComponent(presetFile)}`;
          await page.goto(presetUrl);
          await waitForPageReady(page);
          console.log(`✅ Loaded preset: ${options.preset}${preset ? ` (${preset.name})` : ''}`);
          // 顺手暖缓存（失败不影响主流程，所以不 await）
          presetCache.download(resolvedId, presetFile).then((r) => {
            if (r.ok && !r.cached) console.log(`   （已缓存到 ${presetCache.cachePath(resolvedId, presetFile)}）`);
          }).catch(() => {});
        }
      } else if (options.file) {
        // Load file via file input
        const filePath = path.resolve(options.file);

        // Find the hidden file input and upload the file
        const fileInput = await page.locator('input#fileSelector');
        await fileInput.setInputFiles(filePath);

        // Wait for file to be processed
        await page.waitForTimeout(2000);
        await waitForPageReady(page);

        console.log(`✅ Loaded file: ${options.file}`);
      } else {
        // Should not reach here due to early validation
        console.log('No file or preset specified');
        console.log('Usage: origami load --preset <name> OR origami load --file <path>');
      }
    } catch (error) {
      console.error(`❌ Error loading model: ${error.message}`);
      process.exit(1);
    } finally {
      await browser.close();
    }
  });

// ============================================================================
// List Command - List available presets
// ============================================================================
program
  .command('list')
  .description('List available preset models')
  .option('-c, --category <name>', 'Filter by category')
  .option('--simple', 'Simple list (just IDs)')
  .action(async (options) => {
    const categories = [...new Set(PRESETS.map(p => p.category))];

    if (options.simple) {
      // Simple list: just IDs
      console.log('Available presets:');
      PRESETS.forEach(p => console.log(`  - ${p.id}`));
    } else if (options.category) {
      // Filter by category
      const filtered = PRESETS.filter(p => p.category === options.category);
      if (filtered.length === 0) {
        console.log(`No presets found in category: ${options.category}`);
        console.log(`Available categories: ${categories.join(', ')}`);
      } else {
        console.log(`Presets in category "${options.category}":`);
        filtered.forEach(p => console.log(`  - ${p.id.padEnd(20)} ${p.name}`));
      }
    } else {
      // Full list with categories
      console.log('Available presets:');
      console.log(`\nCategories: ${categories.join(', ')}\n`);

      // Group by category
      categories.forEach(cat => {
        const catPresets = PRESETS.filter(p => p.category === cat);
        console.log(`[${cat.toUpperCase()}] (${catPresets.length})`);
        catPresets.forEach(p => {
          console.log(`  - ${p.id.padEnd(20)} ${p.name}`);
        });
        console.log();
      });

      console.log(`Total: ${PRESETS.length} presets`);
      console.log('\nTip: Use "origami list --category <name>" to filter by category');
      console.log('Tip: Use "origami list --simple" for a compact list');
    }
  });

// ============================================================================
// Presets Command - 本地缓存管理（status / sync）
// ============================================================================
program
  .command('presets [action]')
  .description('Manage the local preset cache (action: status | sync)')
  .option('-f, --force', 'Re-download presets even if already cached')
  .action(async (action = 'status', options = {}) => {
    const act = String(action).toLowerCase();

    if (act === 'sync') {
      console.log(`同步 ${PRESETS.length} 个 preset → ${presetCache.CACHE_DIR}`);
      let fresh = 0; let hit = 0; let fail = 0;
      for (const p of PRESETS) {
        const r = await presetCache.download(p.id, p.file, { force: Boolean(options.force) });
        if (r.ok && r.cached) { hit += 1; console.log(`  = ${p.id.padEnd(22)} 已有缓存 (${r.bytes} B)`); }
        else if (r.ok) { fresh += 1; console.log(`  + ${p.id.padEnd(22)} 下载 ${r.bytes} B`); }
        else { fail += 1; console.log(`  ! ${p.id.padEnd(22)} 失败：${r.reason}`); }
      }
      console.log(`\n完成：新下载 ${fresh} / 已有 ${hit} / 失败 ${fail}`);
      if (fail > 0) process.exitCode = 1;
      return;
    }

    if (act !== 'status') {
      console.error(`未知 action: ${action}（可用：status | sync）`);
      process.exit(1);
    }

    let have = 0;
    for (const p of PRESETS) {
      const ok = presetCache.hasCache(p.id, p.file);
      if (ok) have += 1;
      console.log(`  ${ok ? '✓' : '·'} ${p.id.padEnd(22)} ${ok ? presetCache.cachePath(p.id, p.file) : '未缓存'}`);
    }
    console.log(`\n${have}/${PRESETS.length} 已缓存　目录：${presetCache.CACHE_DIR}`);
  });

// ============================================================================
// Screenshot Command - Take screenshot
// ============================================================================
program
  .command('screenshot')
  .description('Take a screenshot of the simulator')
  .option('-o, --output <path>', 'Output file path', 'origami-screenshot.png')
  .option('-p, --preset <name>', 'Load preset before screenshot')
  .option('-f, --file <path>', 'Load file before screenshot')
  .action(async (options) => {
    const { browser, page } = await launchBrowser();
    try {
      // Load model if specified
      if (options.preset) {
        const resolvedId = LEGACY_PRESETS[options.preset] || options.preset;
        const presetFile = getPresetFile(options.preset);
        if (presetCache.hasCache(resolvedId, presetFile)) {
          const fileInput = await page.locator('input#fileSelector');
          await fileInput.setInputFiles(presetCache.cachePath(resolvedId, presetFile));
          await page.waitForTimeout(2000);
          await waitForPageReady(page);
          console.log(`   （preset 来自本地缓存）`);
        } else {
          await page.goto(buildPresetUrl(options.preset));
          await waitForPageReady(page);
          presetCache.download(resolvedId, presetFile).catch(() => {});
        }
      } else if (options.file) {
        const filePath = path.resolve(options.file);
        if (fs.existsSync(filePath)) {
          await page.goto(BASE_URL);
          await waitForPageReady(page);
          const fileInput = await page.locator('input#fileSelector');
          await fileInput.setInputFiles(filePath);
          await page.waitForTimeout(2000);
        }
      }

      // Set viewport and take screenshot
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.screenshot({ path: options.output, fullPage: true });
      console.log(`✅ Screenshot saved to: ${options.output}`);
    } catch (error) {
      console.error(`❌ Error taking screenshot: ${error.message}`);
      process.exit(1);
    } finally {
      await browser.close();
    }
  });

// ============================================================================
// Simulate Command - Run simulation
// ============================================================================
program
  .command('simulate')
  .description('Run folding simulation')
  .option('--percent <number>', 'Fold percentage (0-1)', '1.0')
  .option('--iterations <number>', 'Solver iterations', '50')
  .option('-p, --preset <name>', 'Preset model name')
  .option('-f, --file <path>', 'Model file path')
  .action(async (options) => {
    const { browser, page } = await launchBrowser();
    try {
      // Load model if specified
      if (options.preset) {
        await page.goto(buildPresetUrl(options.preset));
        await waitForPageReady(page);
      } else if (options.file) {
        const filePath = path.resolve(options.file);
        if (fs.existsSync(filePath)) {
          await page.goto(BASE_URL);
          await waitForPageReady(page);
          const fileInput = await page.locator('input#fileSelector');
          await fileInput.setInputFiles(filePath);
          await page.waitForTimeout(2000);
        }
      }

      // Set fold percent using JavaScript
      const percent = parseFloat(options.percent);
      await page.evaluate((p) => {
        // Find the fold percent slider and set its value
        const slider = document.querySelector('#foldPercent');
        if (slider) {
          slider.value = p;
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          slider.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, percent);

      // Wait for simulation to run
      await page.waitForTimeout(1000);
      console.log(`✅ Simulation completed: percent=${options.percent}, iterations=${options.iterations}`);
    } catch (error) {
      console.error(`❌ Error running simulation: ${error.message}`);
      process.exit(1);
    } finally {
      await browser.close();
    }
  });

// ============================================================================
// View Command - Switch view mode
// ============================================================================
program
  .command('view')
  .description('Switch view mode (pattern/simulation/folded/strain)')
  .option('-m, --mode <mode>', 'View mode', 'simulation')
  .option('-p, --preset <name>', 'Preset model name')
  .action(async (options) => {
    // Validate mode FIRST (before launching browser — browser launch is 3-8s)
    const validModes = ['pattern', 'simulation', 'folded', 'strain'];
    if (!validModes.includes(options.mode)) {
      console.error(`❌ Invalid view mode: ${options.mode}`);
      console.error(`   Valid modes: ${validModes.join(', ')}`);
      process.exit(1);
    }

    const { browser, page } = await launchBrowser();
    try {
      if (options.preset) {
        await page.goto(buildPresetUrl(options.preset));
        await waitForPageReady(page);
      }

      // Try to switch view mode via globals
      const result = await page.evaluate((mode) => {
        try {
          // Method 1: Try globals.viewMode
          if (window.globals && typeof globals.viewMode === 'function') {
            globals.viewMode(mode);
            return { success: true, method: 'globals.viewMode' };
          }
          // Method 2: Try clicking UI button by text
          const buttons = Array.from(document.querySelectorAll('button, a'));
          for (const btn of buttons) {
            if (btn.textContent.toLowerCase().includes(mode)) {
              btn.click();
              return { success: true, method: `button: "${btn.textContent}"` };
            }
          }
          // Method 3: Try globals setProperty
          if (window.globals && globals.setProperty) {
            globals.setProperty('viewMode', mode);
            return { success: true, method: 'globals.setProperty' };
          }
          return { success: false, reason: 'No view switching method found' };
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }, options.mode);

      if (result.success) {
        console.log(`✅ View mode: ${options.mode} (via ${result.method})`);
      } else {
        console.log(`⚠️  View mode changed to: ${options.mode} (${result.reason})`);
      }

      // Wait a moment for render update
      await page.waitForTimeout(500);

      // Take a screenshot to show the view
      const outputPath = `view-${options.mode}-${Date.now()}.png`;
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.screenshot({ path: outputPath, fullPage: true });
      console.log(`   Screenshot: ${outputPath}`);

    } finally {
      await browser.close();
    }
  });

// ============================================================================
// Export Command - Export model
// ============================================================================
program
  .command('export')
  .description('Export model in various formats (fold/stl/obj/png/svg)')
  .option('-f, --format <format>', 'Export format (fold/stl/obj/png/svg)', 'png')
  .option('-o, --output <path>', 'Output file path')
  .option('-p, --preset <name>', 'Preset model name')
  .option('--file <path>', 'Model file path')
  .option('--filename <name>', 'Filename for export (without extension)')
  .action(async (options) => {
    // Validate format FIRST (before launching browser — browser launch is 3-8s)
    const format = options.format.toLowerCase();
    const validFormats = ['fold', 'stl', 'obj', 'png', 'svg'];
    if (!validFormats.includes(format)) {
      console.error(`❌ Invalid format: ${format}`);
      console.error(`   Valid formats: ${validFormats.join(', ')}`);
      process.exit(1);
    }

    const { browser, context } = await launchBrowser();
    const page = await context.newPage();
    try {
      // Load model if specified
      if (options.preset) {
        await page.goto(buildPresetUrl(options.preset));
        await waitForPageReady(page);
      } else if (options.file) {
        const filePath = path.resolve(options.file);
        if (fs.existsSync(filePath)) {
          await page.goto(BASE_URL);
          await waitForPageReady(page);
          const fileInput = await page.locator('input#fileSelector');
          await fileInput.setInputFiles(filePath);
          await page.waitForTimeout(2000);
        }
      }

      // Set up download path
      const filename = options.filename || `origami-export.${format}`;
      const outputPath = options.output || filename;

      // For PNG export, take screenshot directly
      if (format === 'png') {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.screenshot({ path: outputPath, fullPage: true });
        console.log(`✅ Exported as PNG: ${outputPath}`);
        return;
      }

      // For 3D formats (STL, OBJ, FOLD), trigger download via browser UI

      // Map format to menu item IDs
      const menuItems = {
        'stl': 'exportSTL',
        'obj': 'exportOBJ',
        'fold': 'exportFOLD',
        'svg': 'saveSVG'
      };

      const menuId = menuItems[format];
      if (!menuId) {
        console.error(`❌ Export format not supported: ${format}`);
        process.exit(1);
      }

      // Click File menu to open it
      await page.click('a:has-text("File")');
      await page.waitForTimeout(500);

      // Click the export option
      await page.click(`#${menuId}`);
      await page.waitForTimeout(500);

      // Fill in filename if modal has input
      const filenameInput = await page.locator('#stlFilename, #objFilename, #foldFilename').first();
      if (await filenameInput.isVisible()) {
        await filenameInput.fill(options.filename || 'origami-export');
      }

      // Click save button based on format
      const saveButtons = {
        'stl': '#doSTLsave',
        'obj': '#doOBJsave',
        'fold': '#doFOLDsave'
      };

      const saveButtonId = saveButtons[format];
      if (saveButtonId) {
        // Register download listener FIRST
        let capturedDownload = null;
        page.on('download', (download) => { capturedDownload = download; });

        await page.click(saveButtonId);

        // Wait for download - the origami simulator needs time to process
        await page.waitForTimeout(3000);

        page.off('download', () => {});
        if (capturedDownload) {
          await capturedDownload.saveAs(outputPath);
          console.log(`✅ Exported as ${format.toUpperCase()}: ${outputPath}`);
          return;
        }
      }

      console.log(`⚠️  Download did not start`);
      console.log(`   Output: ${outputPath}`);

    } catch (error) {
      console.error(`❌ Error exporting: ${error.message}`);
      process.exit(1);
    } finally {
      await browser.close();
    }
  });

// ============================================================================
// Record Command - Record video/gif using Playwright + FFmpeg
// ============================================================================
program
  .command('record')
  .description('Record simulation as video/gif (uses Playwright + FFmpeg)')
  .option('--format <format>', 'Format (gif/webm/mp4)', 'gif')
  .option('--fps <number>', 'Frames per second', '30')
  .option('--duration <seconds>', 'Duration', '5')
  .option('-o, --output <path>', 'Output file path')
  .option('-p, --preset <name>', 'Preset model name')
  .option('--start-percent <number>', 'Start fold percent (0-1)', '0')
  .option('--end-percent <number>', 'End fold percent (0-1)', '1')
  .option('--scale <number>', 'Recording scale (1-4)', '2')
  .option('--frames <number>', 'Number of frames to capture', '60')
  .option('--temp-dir <path>', 'Temporary directory for frames', '/tmp/origami-frames')
  .action(async (options) => {
    const format = options.format.toLowerCase();
    const fps = parseInt(options.fps);
    const duration = parseInt(options.duration);
    const outputPath = options.output || `origami-record.${format}`;
    const tempDir = options.tempDir;
    const numFrames = parseInt(options.frames);
    const scale = parseInt(options.scale);

    // Validate format
    if (!['gif', 'webm', 'mp4'].includes(format)) {
      console.error(`❌ Invalid format: ${format}`);
      console.error('   Supported formats: gif, webm, mp4');
      process.exit(1);
    }

    console.log(`🎬 OrigamiSimulator Recording (Playwright + FFmpeg)`);
    console.log(`   Preset: ${options.preset || 'default'}`);
    console.log(`   Format: ${format}`);
    console.log(`   Frames: ${numFrames}`);
    console.log(`   FPS: ${fps}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Fold: ${options.startPercent} → ${options.endPercent}`);
    console.log('');

    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Clean temp directory
    const existingFiles = fs.readdirSync(tempDir);
    for (const file of existingFiles) {
      fs.unlinkSync(path.join(tempDir, file));
    }

    const { browser, page } = await launchBrowser();

    try {
      // Load preset
      if (options.preset) {
        try {
          await page.goto(buildPresetUrl(options.preset), { timeout: 60000 });
          await waitForPageReady(page);
          console.log('✅ Loaded preset');
        } catch (e) {
          console.warn('⚠️  Page load timeout, continuing...');
        }
      }

      // Calculate percent values for each frame
      const startPct = parseFloat(options.startPercent);
      const endPct = parseFloat(options.endPercent);

      console.log(`\n📸 Capturing ${numFrames} frames...`);

      for (let i = 0; i < numFrames; i++) {
        const percent = startPct + (endPct - startPct) * (i / (numFrames - 1));

        // Set fold percent
        await page.evaluate((p) => {
          const slider = document.querySelector('#foldPercent');
          if (slider) {
            slider.value = p;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, percent);

        // Wait for rendering
        await page.waitForTimeout(50);

        // Capture frame
        const framePath = path.join(tempDir, `frame_${String(i).padStart(5, '0')}.png`);
        await page.screenshot({ path: framePath });

        // Progress indicator
        if ((i + 1) % 10 === 0 || i === numFrames - 1) {
          process.stdout.write(`\r   Progress: ${i + 1}/${numFrames} frames captured`);
        }
      }
      console.log('\n✅ Frame capture complete');

      // Compile with FFmpeg
      console.log(`\n🎞️  Compiling video with FFmpeg...`);

      const outputExt = format === 'gif' ? 'gif' : (format === 'webm' ? 'webm' : 'mp4');
      const finalOutput = outputPath.endsWith(`.${outputExt}`) ? outputPath : `${outputPath}.${outputExt}`;

      // FFmpeg command based on format
      let ffmpegCmd;
      if (format === 'gif') {
        // GIF: palette-based for better quality
        ffmpegCmd = [
          'ffmpeg', '-y',
          '-framerate', fps.toString(),
          '-i', `${tempDir}/frame_%05d.png`,
          '-vf', `fps=${fps},scale=1920:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
          '-loop', '0',
          finalOutput
        ];
      } else if (format === 'mp4') {
        // MP4 using H.264
        ffmpegCmd = [
          'ffmpeg', '-y',
          '-framerate', fps.toString(),
          '-i', `${tempDir}/frame_%05d.png`,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-crf', '23',
          '-preset', 'medium',
          finalOutput
        ];
      } else {
        // WebM using VP9
        ffmpegCmd = [
          'ffmpeg', '-y',
          '-framerate', fps.toString(),
          '-i', `${tempDir}/frame_%05d.png`,
          '-c:v', 'libvpx-vp9',
          '-crf', '30',
          '-b:v', '0',
          finalOutput
        ];
      }

      // Execute FFmpeg
      console.log(`   Compiling with FFmpeg...`);
      const { execFileSync } = require('child_process');

      try {
        execFileSync('ffmpeg', ffmpegCmd.slice(1), { stdio: 'inherit' });
        console.log(`\n✅ Recording saved to: ${finalOutput}`);

        // Get file size
        const stats = fs.statSync(finalOutput);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`   File size: ${sizeMB} MB`);

      } catch (ffmpegError) {
        console.error(`\n❌ FFmpeg error: ${ffmpegError.message}`);
        console.log(`   Frames saved in: ${tempDir}`);
        console.log(`   You can manually compile with:`);
        console.log(`   ffmpeg -framerate ${fps} -i ${tempDir}/frame_%05d.png output.${format}`);
        process.exit(1);
      }

    } catch (error) {
      console.error(`❌ Error recording: ${error.message}`);
      process.exit(1);
    } finally {
      await browser.close();
      // Clean up frames (optional)
      // fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

// ============================================================================
// Analyze Command v2 - Local FOLD analysis (registered at bottom)
// ============================================================================
// (Old browser-based analyze command removed - see commands/analyze.js for new version)

// ============================================================================
// Batch Command - Batch processing
// ============================================================================
program
  .command('batch')
  .description('Process multiple models')
  .option('--models <list>', 'Comma-separated model list or preset names')
  .option('--action <action>', 'Action to perform (screenshot/export/analyze)', 'screenshot')
  .option('--format <format>', 'Export format for export action', 'png')
  .option('--output-dir <path>', 'Output directory for results', './batch-output')
  .option('-p, --preset <names>', 'Comma-separated preset names (alternative to --models)')
  .action(async (options) => {
    let models = [];

    // Get model/preset list
    if (options.models) {
      models = options.models.split(',').map(m => m.trim());
    } else if (options.preset) {
      models = options.preset.split(',').map(m => m.trim());
    } else {
      console.error('❌ --models or --preset is required');
      console.log('Usage: origami batch --models model1.fold,model2.fold --action screenshot');
      console.log('   or: origami batch --preset miura-ori,waterbomb --action screenshot');
      process.exit(1);
    }

    const action = options.action;
    const outputDir = options.outputDir;

    // Validate action
    if (!['screenshot', 'export', 'analyze'].includes(action)) {
      console.error(`❌ Invalid action: ${action}`);
      console.error('   Valid actions: screenshot, export, analyze');
      process.exit(1);
    }

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`🔄 Batch processing ${models.length} models...`);
    console.log(`   Action: ${action}`);
    console.log(`   Output: ${outputDir}`);
    console.log('');

    const { browser, page, context } = await launchBrowser();
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const modelName = path.basename(model, path.extname(model));
        const ext = path.extname(model).toLowerCase();
        const isPreset = !ext || ext === '';

        console.log(`[${i + 1}/${models.length}] ${isPreset ? 'Preset' : 'File'}: ${model}`);

        try {
          // Load model
          if (isPreset) {
            // It's a preset name
            const presetFile = getPresetFile(model);
            if (!presetFile) {
              console.log(`   ⚠️  Unknown preset: ${model}`);
              failCount++;
              continue;
            }
            const presetUrl = `${BASE_URL}?demo=${encodeURIComponent(presetFile)}`;
            try {
              await page.goto(presetUrl, { timeout: 30000 });
              await waitForPageReady(page);
            } catch (e) {
              console.log(`   ⚠️  Page load timeout, skipping...`);
              failCount++;
              continue;
            }
          } else {
            // It's a file path
            const filePath = path.resolve(model);
            if (!fs.existsSync(filePath)) {
              console.log(`   ⚠️  File not found: ${filePath}`);
              failCount++;
              continue;
            }
            try {
              await page.goto(BASE_URL, { timeout: 30000 });
              await waitForPageReady(page);
              const fileInput = await page.locator('input#fileSelector');
              await fileInput.setInputFiles(filePath);
              await page.waitForTimeout(2000);
            } catch (e) {
              console.log(`   ⚠️  Load error: ${e.message}`);
              failCount++;
              continue;
            }
          }

          // Execute action
          const outputPath = path.join(outputDir, `${isPreset ? model : modelName}.png`);

          if (action === 'screenshot') {
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.screenshot({ path: outputPath, fullPage: true });
            console.log(`   ✅ Saved: ${outputPath}`);
            successCount++;
          } else if (action === 'analyze') {
            const modelData = await page.evaluate(() => {
              try {
                if (window.globals && globals.pattern) {
                  const geometry = globals.pattern.getGeometry();
                  return geometry ? {
                    vertices: geometry.vertices ? geometry.vertices.length : 0,
                    edges: geometry.edges ? geometry.edges.length : 0,
                    faces: geometry.faces ? geometry.faces.length : 0,
                  } : null;
                }
              } catch (e) {}
              return null;
            });
            if (modelData) {
              console.log(`   📊 V:${modelData.vertices} E:${modelData.edges} F:${modelData.faces}`);
            } else {
              console.log(`   📊 Analysis unavailable`);
            }
            successCount++;
          } else if (action === 'export') {
            // Export as PNG for now (3D export requires menu interaction)
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.screenshot({ path: outputPath, fullPage: true });
            console.log(`   ✅ Exported: ${outputPath}`);
            successCount++;
          }

        } catch (error) {
          console.error(`   ❌ Error: ${error.message}`);
          failCount++;
        }
      }
    } finally {
      await browser.close();
    }

    console.log(`\n✅ Batch complete: ${successCount} succeeded, ${failCount} failed`);
  });

// ============================================================================
// Verify Command - Verify file
// ============================================================================
program
  .command('verify')
  .description('Verify model file validity')
  .argument('<file>', 'File to verify')
  .action(async (file) => {
    const filePath = path.resolve(file);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.fold' && ext !== '.svg') {
      console.error(`❌ Unsupported file format: ${ext}`);
      console.error('   Supported formats: .fold, .svg');
      process.exit(1);
    }

    try {
      if (ext === '.fold') {
        // Validate JSON structure
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);

        const hasCoords = Array.isArray(data.vertices_coords);
        const hasEdges = Array.isArray(data.edges_vertices);
        const hasFaces = Array.isArray(data.faces_vertices);

        console.log(`✅ File is valid FOLD format`);
        console.log(`   Vertices: ${hasCoords ? data.vertices_coords.length : 0}`);
        console.log(`   Edges: ${hasEdges ? data.edges_vertices.length : 0}`);
        console.log(`   Faces: ${hasFaces ? data.faces_vertices.length : 0}`);
      } else {
        // Validate SVG structure
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('<svg') || content.includes('<SVG')) {
          console.log(`✅ File is valid SVG format`);
        } else {
          console.error(`❌ File does not appear to be valid SVG`);
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(`❌ Error verifying file: ${error.message}`);
      process.exit(1);
    }
  });

// ============================================================================
// Config Command - Configure parameters
// ============================================================================
program
  .command('config')
  .description('Configure simulation parameters')
  .option('--axial-stiffness <number>', 'Axial stiffness (0-1)', parseFloat)
  .option('--crease-stiffness <number>', 'Crease stiffness (0-1)', parseFloat)
  .option('--gravity <number>', 'Gravity strength (-1 to 1)', parseFloat)
  .option('--iterations <number>', 'Number of solver iterations', parseInt)
  .action(async (options) => {
    const { browser, page } = await launchBrowser();
    try {
      // Apply configuration via JavaScript
      const config = {};
      if (options.axialStiffness !== undefined) {
        config.axialStiffness = options.axialStiffness;
      }
      if (options.creaseStiffness !== undefined) {
        config.creaseStiffness = options.creaseStiffness;
      }
      if (options.gravity !== undefined) {
        config.gravity = options.gravity;
      }
      if (options.iterations !== undefined) {
        config.numIterations = options.iterations;
      }

      await page.evaluate((cfg) => {
        // Apply to globals if available
        if (window.globals) {
          Object.keys(cfg).forEach(key => {
            if (globals[key] !== undefined) {
              globals[key] = cfg[key];
            }
          });
        }
      }, config);

      console.log('✅ Configuration applied:');
      Object.entries(config).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    } finally {
      await browser.close();
    }
  });

// ============================================================================
// Dieline Command - Parse packaging dieline files
// ============================================================================
registerDielineCommand(program);

// ============================================================================
// Bind Command - Bind artwork to faces
// ============================================================================
registerBindCommand(program);

// ============================================================================
// Render Command - Commercial quality mockup rendering
// ============================================================================
registerRenderCommand(program);

// ============================================================================
// Template Command - Packaging box templates
// ============================================================================
registerTemplateCommand(program);

// ============================================================================
// Analyze Command v2 - Local FOLD analysis (replaces browser-based one)
// ============================================================================
const { registerAnalyzeCommand } = require('./commands/analyze');
registerAnalyzeCommand(program);

// ============================================================================
// Generate Command - crease pattern generation (.fold + .svg pair)
// ============================================================================
const { registerGenerateCommand } = require('./commands/generate');
registerGenerateCommand(program);

// ============================================================================
// Fold-Analyzer Subcommands (v2.20+) — promoted to first-class CLI commands
//
// Each is a thin wrapper over a single FoldAnalyzer method. The shared
// file-loading / error-handling lives in commands/fold-helpers.js, so
// adding another top-level command is a ~30-line .action() handler.
// ============================================================================
const { registerSummaryCommand } = require('./commands/fold-summary');
const { registerVisualizeCommand } = require('./commands/fold-visualize');
const { registerValidateCommand } = require('./commands/fold-validate');
const {
  registerKawasakiCommand,
  registerMaekawaCommand,
  registerSelfintersectionCommand,
  registerMvalternationCommand,
} = require('./commands/fold-deep');
const { registerBatchAnalyzeCommand } = require('./commands/fold-batch');
const { registerStlCommand } = require('./commands/fold-stl');
const { registerFoldCommand } = require('./commands/fold-simulate');
const { registerDiffCommand } = require('./commands/fold-diff');
const { registerMergeCommand } = require('./commands/fold-merge');
const { registerV2Commands } = require('./commands/fold-v2');
const { registerOBJCommand } = require('./commands/fold-obj');
const { registerCraneWebGLCommand } = require('./commands/fold-crane');
const { registerWebGLCommand } = require('./commands/fold-webgl');
const { registerServeCommand } = require('./commands/serve');
const { registerMcpCommand } = require('./commands/mcp');

registerSummaryCommand(program);
registerVisualizeCommand(program);
registerValidateCommand(program);
registerKawasakiCommand(program);
registerMaekawaCommand(program);
registerSelfintersectionCommand(program);
registerMvalternationCommand(program);
registerBatchAnalyzeCommand(program);
registerStlCommand(program);
registerFoldCommand(program);
registerDiffCommand(program);
registerMergeCommand(program);
registerV2Commands(program);
registerOBJCommand(program);
registerCraneWebGLCommand(program);
registerWebGLCommand(program);
registerServeCommand(program);
registerMcpCommand(program);


// Only parse when run directly (not when imported as module for testing)
if (require.main === module || process.argv[1]?.includes('index.js')) {
  program.parse();
}

// Export for testing
module.exports = {
  PRESETS,
  PRESET_IDS,
  LEGACY_PRESETS,
  getPresetById,
  getPresetFile,
  buildPresetUrl,
  launchBrowser,
  waitForPageReady,
  BASE_URL,
  VERSION
};
