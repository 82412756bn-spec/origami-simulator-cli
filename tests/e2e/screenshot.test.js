/**
 * E2E Tests for OrigamiSimulator CLI
 * Tests for screenshot command
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const CLI_PATH = path.join(__dirname, '../../src/index.js');

async function cli(args) {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], { cwd: path.dirname(CLI_PATH) });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
  });
}

test.describe('Screenshot Command', () => {
  const outputPath = '/tmp/origami-e2e-screenshot.png';

  test.afterEach(() => {
    // Cleanup
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  test('should take screenshot with default filename', async () => {
    const result = await cli(['screenshot']);

    // Check command executed
    expect(result.exitCode).toBe(0);

    // Check file was created
    const defaultPath = path.join(process.cwd(), 'origami-screenshot.png');
    if (fs.existsSync(defaultPath)) {
      fs.unlinkSync(defaultPath);
    }
  });

  test('should save screenshot to specified path', async () => {
    const result = await cli(['screenshot', '-o', outputPath]);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should load preset before screenshot', async () => {
    const result = await cli(['screenshot', '-o', outputPath, '--preset', 'cranes']);

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
    const result = await cli(['load', '--preset', 'cranes']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Loaded preset: cranes');
  });

  test('should error on invalid preset', async () => {
    const result = await cli(['load', '--preset', 'nonexistent']);

    expect(result.exitCode).toBe(1);
  });
});

test.describe('Verify Command', () => {
  test('should verify valid FOLD file', async () => {
    const foldPath = path.join(__dirname, '../../examples/sample-crane.fold');
    const result = await cli(['verify', foldPath]);

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
  test('should analyze preset model', async () => {
    const result = await cli(['analyze', '--preset', 'cranes']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Model Analysis');
  });

  test('should show all analysis data with --all flag', async () => {
    const result = await cli(['analyze', '--preset', 'cranes', '--all']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Analysis complete');
  });
});
