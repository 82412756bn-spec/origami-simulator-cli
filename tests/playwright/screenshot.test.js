/**
 * E2E Tests for OrigamiSimulator CLI (Playwright lane)
 *
 * 为什么单独一个目录：Playwright 的 test API 不能在 Jest 进程内运行，
 * 会直接抛 "Playwright Test needs to be invoked via 'npx playwright test'"。
 * 官方建议就是 Playwright 与 Jest 分目录。见 playwright.config.js。
 *
 * 跑法：npm run test:e2e:browser
 *
 * 网络分区：Playwright 支持在用例体内按条件 skip，网络不可达时显式跳过；
 * 网络抖动按「网络类特征」重试（确定性失败绝不重试）。
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const { CLI_PATH, cli, cliWithRetry } = require('../helpers/cli');
const { probe, TARGET } = require('../helpers/network');

const FOLD_PATH = path.join(__dirname, '../../examples/sample-crane.fold');

test.describe('Screenshot Command', () => {
  const outputPath = '/tmp/origami-e2e-screenshot.png';

  test.beforeAll(async () => { await probe(); });

  test.afterEach(() => {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    // CLI 的 cwd 是 src/，默认截图落在 src/origami-screenshot.png
    const defaultPath = path.join(path.dirname(CLI_PATH), 'origami-screenshot.png');
    if (fs.existsSync(defaultPath)) {
      fs.unlinkSync(defaultPath);
    }
  });

  test('should take screenshot with default filename', async () => {
    const online = await probe();
    test.skip(!online, `SKIP: ${TARGET} 不可达（网络依赖用例）`);
    const result = await cliWithRetry(['screenshot']);

    expect(result.exitCode).toBe(0);
  });

  test('should save screenshot to specified path', async () => {
    const online = await probe();
    test.skip(!online, `SKIP: ${TARGET} 不可达（网络依赖用例）`);
    const result = await cliWithRetry(['screenshot', '-o', outputPath]);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should load preset before screenshot', async () => {
    const online = await probe();
    test.skip(!online, `SKIP: ${TARGET} 不可达（网络依赖用例）`);
    const result = await cliWithRetry(['screenshot', '-o', outputPath, '--preset', 'cranes']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Screenshot saved');
    expect(fs.existsSync(outputPath)).toBe(true);
  });
});

test.describe('List Command', () => {
  test('should list all available presets', async () => {
    const result = await cli(['list']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cranes');
    expect(result.stdout).toContain('flapping-bird');
    expect(result.stdout).toContain('square');
  });
});

test.describe('Load Command', () => {
  test('should load preset by name', async () => {
    const online = await probe();
    test.skip(!online, `SKIP: ${TARGET} 不可达（网络依赖用例）`);
    const result = await cliWithRetry(['load', '--preset', 'cranes']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Loaded preset: cranes');
  });

  test('should error on invalid preset', async () => {
    // 无效 preset 在拉浏览器之前就被拦下（实测 0.27s，纯本地，不依赖网络）
    const result = await cli(['load', '--preset', 'nonexistent']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown preset');
  });
});

test.describe('Verify Command', () => {
  test('should verify valid FOLD file', async () => {
    const result = await cli(['verify', FOLD_PATH]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('valid FOLD format');
    expect(result.stdout).toContain('Vertices: 5');
  });

  test('should error on invalid file', async () => {
    const result = await cli(['verify', '/nonexistent/file.fold']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('File not found');
  });

  test('should error on unsupported format', async () => {
    const txtPath = '/tmp/test.txt';
    fs.writeFileSync(txtPath, 'test');

    const result = await cli(['verify', txtPath]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported file format');

    fs.unlinkSync(txtPath);
  });
});

test.describe('Analyze Command', () => {
  test('should analyze a FOLD file locally', async () => {
    // analyze 只接受文件位置参数（旧的 `analyze --preset` 从来不支持）
    const result = await cli(['analyze', FOLD_PATH]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('FOLD Model Analysis Report');
    expect(result.stdout).toContain('Vertices:');
  });

  test('should show all analysis data with --all flag', async () => {
    const result = await cli(['analyze', FOLD_PATH, '--all']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Analysis complete');
  });
});
