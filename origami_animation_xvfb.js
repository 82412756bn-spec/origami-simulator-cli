/**
 * Origami Animation Generator
 * Generates folding animation from flat pattern to folded state
 *
 * Uses origami-simulator.org with Playwright
 * - Frame 0: creasePercent=0 (flat crease pattern in 2D)
 * - Frames 1-N: creasePercent progression from 0 to 1 (3D folding)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const BASE_URL = 'https://origamisimulator.org/';
const PRESET_FILE = 'Origami/traditionalCrane.svg';
const OUTPUT_DIR = '/home/rayna/文档/Unbuntu_system/goods/2026.04.19飞鹤折纸/output/video';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'origami_crane_animation.mp4');
const TEMP_DIR = '/tmp/origami_xvfb_frames';

async function generateAnimation() {
  console.log('=== Origami Animation Generator ===\n');

  // Create temp directory
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Clean temp directory
  const existingFiles = fs.readdirSync(TEMP_DIR);
  for (const file of existingFiles) {
    fs.unlinkSync(path.join(TEMP_DIR, file));
  }

  const FPS = 30;
  const DURATION = 10; // seconds
  const NUM_FRAMES = FPS * DURATION; // 300 frames

  console.log(`Preset: Crane (3D)`);
  console.log(`Frames: ${NUM_FRAMES}`);
  console.log(`FPS: ${FPS}`);
  console.log(`Duration: ${DURATION}s`);
  console.log(`Output: ${OUTPUT_FILE}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });

  try {
    // Load origami simulator with crane preset
    console.log('Loading origami-simulator.org...');
    await page.goto(`${BASE_URL}?demo=${encodeURIComponent(PRESET_FILE)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.waitForTimeout(3000);
    console.log('Page loaded.\n');

    // Ensure mesh is off for cleaner view
    await page.evaluate(() => {
      const meshCheckbox = document.getElementById('meshVisible');
      if (meshCheckbox) {
        meshCheckbox.checked = false;
        meshCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    // Capture frames
    console.log(`📸 Capturing ${NUM_FRAMES} frames...`);

    for (let i = 0; i < NUM_FRAMES; i++) {
      const progress = i / (NUM_FRAMES - 1); // 0 to 1

      // Use globals.creasePercent (0-1) for smooth animation
      // At creasePercent=0, the simulator shows flat 2D crease pattern
      // As creasePercent increases, the 3D folding progresses
      const creasePercent = progress;

      await page.evaluate((percent) => {
        if (typeof globals !== 'undefined' && globals.creasePercent !== undefined) {
          globals.creasePercent = percent;
          globals.shouldChangeCreasePercent = true;
        }
      }, creasePercent);

      // Wait for simulation to update
      await page.waitForTimeout(50);

      // Capture frame
      const framePath = path.join(TEMP_DIR, `frame_${String(i).padStart(5, '0')}.png`);
      await page.screenshot({ path: framePath });

      // Progress indicator
      if ((i + 1) % 30 === 0 || i === NUM_FRAMES - 1) {
        const pct = Math.round((i + 1) / NUM_FRAMES * 100);
        process.stdout.write(`\r   Progress: ${i + 1}/${NUM_FRAMES} frames (${pct}%)`);
      }
    }
    console.log('\n✅ Frame capture complete\n');

    // Compile with FFmpeg
    console.log('🎞️  Compiling video with FFmpeg...');

    const ffmpegCmd = [
      'ffmpeg', '-y',
      '-framerate', FPS.toString(),
      '-i', `${TEMP_DIR}/frame_%05d.png`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '23',
      '-preset', 'medium',
      OUTPUT_FILE
    ];

    try {
      execFileSync('ffmpeg', ffmpegCmd.slice(1), { stdio: 'inherit' });

      const stats = fs.statSync(OUTPUT_FILE);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(`\n✅ Animation saved to: ${OUTPUT_FILE}`);
      console.log(`   File size: ${sizeMB} MB`);

    } catch (ffmpegError) {
      console.error(`\n❌ FFmpeg error: ${ffmpegError.message}`);
      console.log(`   Frames saved in: ${TEMP_DIR}`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  } finally {
    await browser.close();
    // Clean up frames
    // fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}

generateAnimation();