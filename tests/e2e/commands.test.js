/**
 * E2E Tests for OrigamiSimulator CLI
 * Uses Jest with child_process to test CLI commands
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CLI_PATH = path.join(__dirname, '../../src/index.js');

async function cli(args) {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], { cwd: path.dirname(CLI_PATH) });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
  });
}

describe('Load Command', () => {
  test('should load preset by name', async () => {
    const result = await cli(['load', '--preset', 'cranes']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Loaded preset: cranes');
  });

  test('should load flapping-bird preset', async () => {
    const result = await cli(['load', '--preset', 'flapping-bird']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('flapping-bird');
  });

  test('should load square preset', async () => {
    const result = await cli(['load', '-p', 'square']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('square');
  });

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

  test('should load valid FOLD file', async () => {
    const foldPath = path.join(__dirname, '../../examples/sample-crane.fold');
    const result = await cli(['load', '--file', foldPath]);
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
    expect(result.stdout).toContain('square');
    expect(result.stdout).toContain('富士山');
    expect(result.stdout).toContain('爆弾');
  });

  test('should list exactly 8 presets', async () => {
    const result = await cli(['list']);
    const presetCount = (result.stdout.match(/- /g) || []).length;
    expect(presetCount).toBe(8);
  });
});

describe('Screenshot Command', () => {
  const outputPath = '/tmp/origami-test-screenshot.png';

  afterEach(() => {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    const defaultPath = path.join(process.cwd(), 'origami-screenshot.png');
    if (fs.existsSync(defaultPath)) fs.unlinkSync(defaultPath);
  });

  test('should take screenshot with default settings', async () => {
    const result = await cli(['screenshot']);
    expect(result.exitCode).toBe(0);
  });

  test('should save screenshot to specified path', async () => {
    const result = await cli(['screenshot', '-o', outputPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Screenshot saved');
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test('should load preset before screenshot', async () => {
    const result = await cli(['screenshot', '-o', outputPath, '--preset', 'cranes']);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test('should create non-empty screenshot file', async () => {
    await cli(['screenshot', '-o', outputPath]);
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
    expect(result.stdout).toContain('0.2.0');
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
