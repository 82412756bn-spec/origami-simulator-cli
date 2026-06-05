/**
 * Mock Playwright module for testing
 */

const mockPage = {
  goto: jest.fn().mockResolvedValue(undefined),
  waitForTimeout: jest.fn().mockResolvedValue(undefined),
  waitForFunction: jest.fn().mockResolvedValue(undefined),
  screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
  click: jest.fn().mockResolvedValue(undefined),
  evaluate: jest.fn().mockResolvedValue({ success: true }),
  locator: jest.fn().mockReturnValue({
    setInputFiles: jest.fn().mockResolvedValue(undefined),
    isVisible: jest.fn().mockResolvedValue(true),
    first: jest.fn().mockReturnThis()
  }),
  setViewportSize: jest.fn().mockResolvedValue(undefined),
  waitForEvent: jest.fn().mockResolvedValue({
    saveAs: jest.fn().mockResolvedValue(undefined)
  }),
  close: jest.fn().mockResolvedValue(undefined)
};

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(undefined)
};

const mockBrowser = {
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn().mockResolvedValue(undefined)
};

module.exports = {
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser)
  }
};
