const { CommercialRenderer } = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer');
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const fold = JSON.parse(fs.readFileSync('/tmp/box-big.fold', 'utf8'));

  const renderer = new CommercialRenderer({
    width: 1000, height: 1000,
    material: 'corrugated', hdri: 'studio', angle: '45',
    outputPath: '/tmp/diag.png',
    debug: true,
  });

  // Hack: inject error listener
  const origRender = renderer.render.bind(renderer);
  renderer.render = async function (foldData) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('ERROR')) {
        console.log('PAGE:', msg.type(), msg.text().substring(0, 200));
      }
    });
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    const threeDataUrl = this.loadThreeJs();
    const html = this.buildHtml(foldData).replace('THREE_PLACEHOLDER', threeDataUrl);

    await page.setContent(html);
    await page.waitForFunction(() => window.status === 'done', { timeout: 30000 });
    const base64 = await page.evaluate(() => window.outputData);

    if (!base64) {
      console.log('ERROR: No output data');
      await browser.close();
      return { success: false, error: 'No output data' };
    }

    const buffer = Buffer.from(base64.split(',')[1], 'base64');
    console.log('Output size:', buffer.length, 'bytes');

    // Check if there's any visible texture
    if (buffer.length < 50000) {
      console.log('⚠️  Output suspiciously small - texture may not be rendered');
    } else {
      console.log('✅ Output size suggests texture rendered');
    }

    fs.writeFileSync(this.options.outputPath, buffer);
    await browser.close();
    return { success: true, size: buffer.length, buffer };
  };

  const result = await origRender(fold);
})();
