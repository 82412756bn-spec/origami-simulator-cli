const { CommercialRenderer } = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer');
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const fold = JSON.parse(fs.readFileSync('/tmp/box-big.fold', 'utf8'));

  const renderer = new CommercialRenderer({
    width: 800, height: 800,
    material: 'corrugated', hdri: 'studio', angle: '45',
    debug: true,
  });

  // Intercept HTML building
  const html = renderer.buildHtml(fold);
  fs.writeFileSync('/tmp/debug-html.html', html);
  console.log('HTML saved, size:', html.length);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE:', msg.type(), msg.text().substring(0, 100)));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.setContent(html);
  await page.waitForFunction(() => window.status === 'done', { timeout: 10000 });

  // Check texture data in window
  const info = await page.evaluate(() => ({
    status: window.status,
    outputLength: window.outputData?.length || 0,
    hasOutput: !!window.outputData,
  }));
  console.log('Render result:', info);

  await browser.close();
})();
