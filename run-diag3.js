const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    logs.push(`[pageerror] ${err.message}`);
  });

  const html = fs.readFileSync('/tmp/diag3.html', 'utf8');
  await page.setContent(html);

  try {
    await page.waitForFunction(() => window.status === 'done', { timeout: 15000 });
  } catch (e) {
    console.log('Timeout');
  }

  console.log('=== Browser logs ===');
  for (const log of logs.slice(0, 30)) {
    console.log(log.substring(0, 200));
  }

  const data = await page.evaluate(() => window.outputData);
  if (data) {
    const buffer = Buffer.from(data.split(',')[1], 'base64');
    fs.writeFileSync('/tmp/diag3.png', buffer);
    console.log('PNG size:', buffer.length, 'bytes');
  }

  await browser.close();
})();
