const { CommercialRenderer } = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer');
const { ProceduralTextureGenerator } = require('/home/rayna/文档/origami-simulator-cli/src/utils/procedural-texture');
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const fold = JSON.parse(fs.readFileSync('/tmp/plane.fold', 'utf8'));

  // Generate textures in Node
  const gen = new ProceduralTextureGenerator({ size: 256, seed: 42 });
  const tex = gen.generate('corrugated');

  // Build HTML manually with same code as commercial-renderer
  const threeJsUrl = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer');
  const renderer = new threeJsUrl.CommercialRenderer({
    width: 800, height: 600,
    material: 'corrugated', hdri: 'studio', angle: '45',
  });
  const html = renderer.buildHtml(fold);
  const threeDataUrl = renderer.loadThreeJs();
  const finalHtml = html.replace('THREE_PLACEHOLDER', threeDataUrl);

  // Save to inspect
  fs.writeFileSync('/tmp/fold-direct.html', finalHtml);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('ERR:', msg.text().substring(0, 200));
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message.substring(0, 200)));

  await page.setContent(finalHtml);

  // Wait longer for textures
  try {
    await page.waitForFunction(() => window.status === 'done', { timeout: 15000 });
  } catch (e) {
    console.log('Timeout waiting for done. Checking state...');
    const status = await page.evaluate(() => ({
      status: window.status,
      hasOutput: !!window.outputData,
      outputLength: window.outputData?.length || 0,
    }));
    console.log('Status:', status);
    await browser.close();
    return;
  }

  const data = await page.evaluate(() => window.outputData);
  const buffer = Buffer.from(data.split(',')[1], 'base64');
  fs.writeFileSync('/tmp/fold-direct.png', buffer);
  console.log('Saved:', buffer.length, 'bytes');

  await browser.close();
})();
