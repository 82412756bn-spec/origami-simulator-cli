const { defineConfig } = require('@playwright/test');

/**
 * Playwright 测试配置 —— 与 Jest 测试分目录（Playwright 官方要求）。
 *
 * 背景：tests/e2e/screenshot.test.js 原用 Playwright 的 test API 编写，
 * 但被 Jest 的 testMatch 收走（匹配 tests 目录下所有 .test.js），
 * Playwright 会直接抛错拒绝在 Jest 进程内运行：
 *   "Playwright Test needs to be invoked via 'npx playwright test' and
 *    excluded from Jest test runs."
 * 官方建议就是"一个目录放 Playwright 测试，一个目录放 Jest 测试"。
 *
 * 现在：
 *   tests/unit/        → Jest      （npm test）
 *   tests/e2e/         → Jest      （npm run test:e2e）
 *   tests/playwright/  → Playwright（npm run test:e2e:browser）
 */
module.exports = defineConfig({
  testDir: './tests/playwright',
  testMatch: '**/*.test.js',
  // 这些用例会拉起无头浏览器并访问 origamisimulator.org，网络慢时单例可达 60s+
  timeout: 180000,
  expect: { timeout: 10000 },
  // 用例串行跑：每个都独占无头浏览器 + 外网，并行会互相抢带宽导致假红
  workers: 1,
  reporter: [['list']],
});
