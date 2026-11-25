/**
 * E2E Tests for OrigamiSimulator CLI (Jest lane)
 *
 * 分区原则：
 *   - 本地用例（list / verify / 输入校验）→ 直接跑，快且确定
 *   - 网络用例（load preset / screenshot，需访问 origamisimulator.org）
 *     → 外网不可达时整组显式 skip（明确跳过，不是静默通过）
 *     → 外网可达但抖动时，失败按「网络类特征」重试（确定性失败绝不重试）
 *
 * 跑法：npm run test:e2e
 */
const path = require('path');
const fs = require('fs');

const { CLI_PATH, cli, cliWithRetry } = require('../helpers/cli');
const PKG = require('../../package.json');

// 网络不可达时整组标记为 skipped —— 明确跳过，不是静默通过
const describeNetwork =
  process.env.E2E_OFFLINE === '1' ? describe.skip : describe;

describe('Load Command (local validation)', () => {
  // 这两条在开浏览器之前就被拦下（实测 <0.3s），不依赖网络
  test('should error on nonexistent file', async () => {
    const result = await cli(['load', '--file', '/nonexistent/file.fold']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('File not found');
  });

  test('should error on unsupported file format', async () => {
    const txtPath = '/tmp/test.txt';
    fs.writeFileSync(txtPath, 'test');
    const result = await cli(['load', '--file', txtPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported file format');
    fs.unlinkSync(txtPath);
  });
});

describeNetwork('Load Command (network)', () => {
  test('should load preset by name', async () => {
    const result = await cliWithRetry(['load', '--preset', 'cranes']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Loaded preset: cranes');
  });

  test('should load flapping-bird preset', async () => {
    const result = await cliWithRetry(['load', '--preset', 'flapping-bird']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('flapping-bird');
  });

  test('should load square preset', async () => {
    // 'square' 是 LEGACY_PRESETS 里的旧别名，指向 square-base
    const result = await cliWithRetry(['load', '-p', 'square']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('square');
  });

  test('should still resolve the legacy Japanese alias', async () => {
    // LEGACY_PRESETS: 富士山 → hypar（旧断言里 list 已不再显示日文名，
    // 但别名必须继续可用 —— 这里锁住这条兼容路径）
    const result = await cliWithRetry(['load', '--preset', '富士山']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('富士山');
  });

  test('should load valid FOLD file', async () => {
    const foldPath = path.join(__dirname, '../../examples/sample-crane.fold');
    const result = await cliWithRetry(['load', '--file', foldPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Loaded file');
  });
});

describe('List Command', () => {
  test('should list all available presets', async () => {
    const result = await cli(['list']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Available presets:');
    expect(result.stdout).toContain('cranes');
    expect(result.stdout).toContain('flapping-bird');
    // 旧断言写的是日文名（富士山 / 爆弾）：preset 已改名为 square-twist / square-base，
    // list 输出的是规范 id；日文名降级为兼容别名，另由 Load 用例覆盖
    expect(result.stdout).toContain('square-twist');
    expect(result.stdout).toContain('square-base');
  });

  test('should list a self-consistent preset count', async () => {
    const result = await cli(['list']);
    // 旧断言写死「恰好 8 个」，实际是 27 个 —— 改成自洽性断言：
    // 打印出来的条目行数必须等于命令自己声明的总数（这样加 preset 时不会腐烂），
    // 再加一条回归底线，防止 list 只吐几个还自称全量。
    const totalMatch = result.stdout.match(/Total: (\d+) presets/);
    expect(totalMatch).not.toBeNull();
    const declared = Number(totalMatch[1]);
    const listed = (result.stdout.match(/^ {2}- /gm) || []).length;
    expect(listed).toBe(declared);
    expect(listed).toBeGreaterThanOrEqual(20);
  });
});

describeNetwork('Screenshot Command (network)', () => {
  const outputPath = '/tmp/origami-test-screenshot.png';

  afterEach(() => {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    const defaultPath = path.join(path.dirname(CLI_PATH), 'origami-screenshot.png');
    if (fs.existsSync(defaultPath)) fs.unlinkSync(defaultPath);
  });

  test('should take screenshot with default settings', async () => {
    const result = await cliWithRetry(['screenshot']);
    expect(result.exitCode).toBe(0);
  });

  test('should save screenshot to specified path', async () => {
    const result = await cliWithRetry(['screenshot', '-o', outputPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Screenshot saved');
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test('should load preset before screenshot', async () => {
    const result = await cliWithRetry(['screenshot', '-o', outputPath, '--preset', 'cranes']);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test('should create non-empty screenshot file', async () => {
    const result = await cliWithRetry(['screenshot', '-o', outputPath]);
    expect(result.exitCode).toBe(0);
    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(10000);
  });
});

describe('Verify Command', () => {
  test('should verify valid FOLD file', async () => {
    const foldPath = path.join(__dirname, '../../examples/sample-crane.fold');
    const result = await cli(['verify', foldPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('valid FOLD format');
    expect(result.stdout).toContain('Vertices: 5');
    expect(result.stdout).toContain('Edges: 8');
    expect(result.stdout).toContain('Faces: 4');
  });

  test('should verify SVG file', async () => {
    const svgPath = '/tmp/test-verify.svg';
    fs.writeFileSync(svgPath, '<svg><rect/></svg>');
    const result = await cli(['verify', svgPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('valid SVG format');
    fs.unlinkSync(svgPath);
  });

  test('should error on nonexistent file', async () => {
    const result = await cli(['verify', '/nonexistent/file.fold']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('File not found');
  });

  test('should error on unsupported format', async () => {
    const txtPath = '/tmp/test.txt';
    fs.writeFileSync(txtPath, 'hello');
    const result = await cli(['verify', txtPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported file format');
    fs.unlinkSync(txtPath);
  });
});

describe('Version and Help', () => {
  test('should show version', async () => {
    const result = await cli(['--version']);
    expect(result.exitCode).toBe(0);
    // 版本号跟着 package.json 走 —— 单一真相源（v2.46.0 之前这里写死 0.2.0）
    expect(result.stdout.trim()).toContain(PKG.version);
  });

  test('should show help', async () => {
    const result = await cli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Commands:');
  });

  test('should show command help', async () => {
    const result = await cli(['load', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--file');
    expect(result.stdout).toContain('--preset');
  });
});
