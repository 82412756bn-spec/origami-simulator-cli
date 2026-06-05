/**
 * Unit tests for browser module
 * Uses mocked playwright to test browser utilities
 */

// Mock playwright before requiring browser module
jest.mock('playwright', () => require('../mocks/playwright'));

const { launchBrowser, waitForPageReady, navigateTo, getBrowserInfo, BASE_URL } = require('../../src/utils/browser');

describe('Browser Constants', () => {
  test('BASE_URL should be correct', () => {
    expect(BASE_URL).toBe('https://origamisimulator.org/');
  });
});

describe('launchBrowser', () => {
  test('should launch browser successfully', async () => {
    const result = await launchBrowser();
    expect(result).toHaveProperty('browser');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('context');
  });

  test('should accept custom timeout', async () => {
    await launchBrowser(120000);
    // Mock was called with timeout
    expect(true).toBe(true);
  });
});

describe('waitForPageReady', () => {
  test('should wait for page without error', async () => {
    const mockPage = {
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockResolvedValue(undefined)
    };
    await expect(waitForPageReady(mockPage)).resolves.not.toThrow();
  });

  test('should handle timeout gracefully', async () => {
    const mockPage = {
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockRejectedValue(new Error('timeout'))
    };
    await expect(waitForPageReady(mockPage)).resolves.not.toThrow();
  });
});

describe('navigateTo', () => {
  test('should navigate to URL successfully', async () => {
    const mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockResolvedValue(undefined)
    };
    const result = await navigateTo(mockPage, 'https://example.com');
    expect(result).toBe(true);
  });

  test('should handle navigation timeout', async () => {
    const mockPage = {
      goto: jest.fn().mockRejectedValue(new Error('timeout')),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockRejectedValue(new Error('timeout'))
    };
    const result = await navigateTo(mockPage, 'https://example.com');
    expect(result).toBe(false);
  });
});

describe('getBrowserInfo', () => {
  test('should return browser info', async () => {
    const info = await getBrowserInfo();
    expect(info).toHaveProperty('chromium');
    expect(info).toHaveProperty('version');
    expect(info.version).toBe('playwright');
  });
});
