const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/snap/bin/chromium',
    headless: true
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });

  try {
    await page.goto('https://origamisimulator.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Load cranes preset
    const fileInput = await page.$('input[type="file"]');
    // Actually use preset by clicking or via URL

    // Take screenshot at fold=0%
    await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      if (slider) { slider.value = 0; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/cranes_0.png', timeout: 5000 });
    console.log('Captured frame at 0%');

    // Fold to 50%
    await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      if (slider) { slider.value = 0.5; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/cranes_50.png', timeout: 5000 });
    console.log('Captured frame at 50%');

    // Fold to 100%
    await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      if (slider) { slider.value = 1; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/cranes_100.png', timeout: 5000 });
    console.log('Captured frame at 100%');

    console.log('Screenshots saved to /tmp/cranes_*.png');

  } catch (e) {
    console.error('Error:', e.message);
  }

  await browser.close();
})();