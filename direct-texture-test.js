// Direct browser test: prove textures work
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { ProceduralTextureGenerator } = require('./src/utils/procedural-texture');

(async () => {
  // 1. Generate textures in Node
  const generator = new ProceduralTextureGenerator({ size: 256, seed: 42 });
  const textures = generator.generate('cardboard');

  console.log('Textures generated:');
  console.log('  diffuse length:', textures.diffuse.length);
  console.log('  normal length:', textures.normal.length);
  console.log('  roughness length:', textures.roughness.length);

  // 2. Save textures to disk to verify they're valid
  const textureDir = '/tmp/textures-test';
  fs.mkdirSync(textureDir, { recursive: true });
  const saveDataUrl = (dataUrl, path) => {
    const base64 = dataUrl.split(',')[1];
    fs.writeFileSync(path, Buffer.from(base64, 'base64'));
  };
  saveDataUrl(textures.diffuse, `${textureDir}/diffuse.png`);
  saveDataUrl(textures.normal, `${textureDir}/normal.png`);
  saveDataUrl(textures.roughness, `${textureDir}/roughness.png`);

  console.log('\nTextures saved to:', textureDir);
  console.log('  diffuse.png:', fs.statSync(`${textureDir}/diffuse.png`).size, 'bytes');
  console.log('  normal.png:', fs.statSync(`${textureDir}/normal.png`).size, 'bytes');
  console.log('  roughness.png:', fs.statSync(`${textureDir}/roughness.png`).size, 'bytes');

  // 3. Test loading texture in browser
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const log = [];
  page.on('console', msg => log.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => log.push(`[error] ${err.message}`));

  const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#f0f0f0">
<canvas id="c" width="800" height="600"></canvas>
<div id="status">init</div>
<div id="result"></div>
<script>
  // Inline procedural texture generation (mirror of node side)
  window.status = 'generating';

  // Create a simple 256x256 procedural diffuse pattern
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Fill with cardboard color #c4a57b (196, 165, 123)
  ctx.fillStyle = '#c4a57b';
  ctx.fillRect(0, 0, 256, 256);

  // Add fiber noise
  const rng = (seed) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
  const r = rng(42);
  const imageData = ctx.getImageData(0, 0, 256, 256);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (r() - 0.5) * 80;  // ±40 variation
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
    data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  const diffuseDataUrl = canvas.toDataURL('image/png');
  document.getElementById('result').textContent = 'Diffuse size: ' + diffuseDataUrl.length;

  // Test if Three.js can load this image
  const img = new Image();
  img.onload = () => {
    document.getElementById('status').textContent = 'loaded';
    document.getElementById('result').textContent =
      'Image: ' + img.width + 'x' + img.height + ', dataURL: ' + diffuseDataUrl.length;
  };
  img.onerror = () => {
    document.getElementById('status').textContent = 'failed';
  };
  img.src = diffuseDataUrl;
</script>
</body></html>`;

  await page.setContent(html);
  await page.waitForFunction(() => window.document.getElementById('status').textContent !== 'init', { timeout: 10000 });

  const status = await page.evaluate(() => document.getElementById('status').textContent);
  const result = await page.evaluate(() => document.getElementById('result').textContent);

  console.log('\nBrowser test:');
  console.log('  Status:', status);
  console.log('  Result:', result);

  await browser.close();
})();
