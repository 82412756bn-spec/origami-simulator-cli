const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'https://origamisimulator.org/';
const presetName = 'miura-ori';
const presetFile = 'Tessellations/miura-ori.svg';
const outputPath = '/tmp/from-file-test.fold';

async function test() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    
    const url = BASE_URL + '?model=' + encodeURIComponent(presetFile);
    
    let capturedDownload = null;
    page.on('download', (download) => {
        console.log('Download event received!');
        capturedDownload = download;
    });
    
    console.log('Navigating to:', url);
    await page.goto(url, { timeout: 60000 });
    console.log('Loaded, waiting 6s...');
    await page.waitForTimeout(6000);
    
    console.log('Clicking File...');
    await page.click('a:has-text("File")');
    await page.waitForTimeout(1000);
    
    console.log('Clicking exportFOLD...');
    await page.click('#exportFOLD');
    await page.waitForTimeout(1000);
    
    const fnInput = page.locator('#foldFilename');
    console.log('fnInput visible:', await fnInput.isVisible());
    
    if (await fnInput.isVisible()) {
        await fnInput.fill(presetName);
        console.log('Filled filename');
    }
    
    console.log('Clicking doFOLDsave...');
    await page.click('#doFOLDsave');
    
    console.log('Waiting 3s...');
    await page.waitForTimeout(3000);
    
    console.log('capturedDownload:', capturedDownload ? capturedDownload.suggestedFilename() : 'null');
    
    if (capturedDownload) {
        await capturedDownload.saveAs(outputPath);
        console.log('Saved!');
    }
    
    await browser.close();
    
    if (fs.existsSync(outputPath)) {
        const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        console.log('V =', data.vertices_coords.length);
    }
}

test().catch(console.error);
