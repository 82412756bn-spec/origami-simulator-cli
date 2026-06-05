/**
 * Browser utilities for OrigamiSimulator CLI
 * Handles browser launch and page operations
 */

const playwright = require('playwright');
const BASE_URL = 'https://origamisimulator.org/';

/**
 * Launch browser with configurable timeout
 */
async function launchBrowser(timeout = 60000) {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(BASE_URL, { timeout });
  } catch (e) {
    console.warn('⚠️  Page load timeout, continuing anyway...');
  }
  await page.waitForTimeout(3000);
  return { browser, page, context };
}

/**
 * Wait for page to be ready (canvas element present)
 */
async function waitForPageReady(page) {
  await page.waitForTimeout(1500);
  try {
    await page.waitForFunction(() => {
      return document.querySelector('canvas') !== null;
    }, { timeout: 10000 });
  } catch (e) {
    console.warn('Warning: Canvas not found, page may not be fully loaded');
  }
}

/**
 * Navigate to a URL and wait for page ready
 */
async function navigateTo(page, url) {
  try {
    await page.goto(url, { timeout: 60000 });
    await waitForPageReady(page);
    return true;
  } catch (e) {
    console.warn('⚠️  Page load timeout, continuing...');
    return false;
  }
}

/**
 * Get browser version info
 */
async function getBrowserInfo() {
  return {
    chromium: playwright.chromium,
    version: 'playwright'
  };
}

module.exports = {
  launchBrowser,
  waitForPageReady,
  navigateTo,
  getBrowserInfo,
  BASE_URL
};
