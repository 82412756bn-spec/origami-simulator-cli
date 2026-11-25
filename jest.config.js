module.exports = {
  testEnvironment: 'node',
  // 只收 Jest 用例。Playwright 用例放在 tests/playwright/，必须排除 ——
  // Playwright 在 Jest 进程内运行时会直接抛错拒绝执行。
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/playwright/'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  verbose: true,
  // 单测用 60s 上限；e2e 另用 --testTimeout=180000（截图用例实测 15-65s，取决于外网）
  testTimeout: 60000,
};
