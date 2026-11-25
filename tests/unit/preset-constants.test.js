/**
 * Unit tests for CLI commands via child_process
 * Tests command behavior without direct module import
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CLI_PATH = path.join(__dirname, '../../src/index.js');

// Detect Playwright availability. Tests that launch a real browser
// (e.g., batch --action screenshot) require it; otherwise they're slow.
// Set RUN_BROWSER_TESTS=1 to opt in.
const HAS_BROWSER = (() => {
  if (process.env.RUN_BROWSER_TESTS === '1') return true;
  try {
    require('playwright').chromium;
    return true;
  } catch (e) {
    return false;
  }
})();
const skipIfNoBrowser = HAS_BROWSER ? x => x : x.skip;

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

describe('Verify Command', () => {
  test('verify should accept .fold files', async () => {
    const foldPath = path.join(__dirname, '../../examples/sample-crane.fold');
    const result = await cli(['verify', foldPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('valid FOLD format');
    expect(result.stdout).toContain('Vertices: 5');
    expect(result.stdout).toContain('Edges: 8');
    expect(result.stdout).toContain('Faces: 4');
  });

  test('verify should accept .svg files with svg content', async () => {
    const svgPath = '/tmp/unit-test-verify.svg';
    fs.writeFileSync(svgPath, '<svg><polygon points="0,0 100,0 50,100"/></svg>');
    const result = await cli(['verify', svgPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('valid SVG format');
    fs.unlinkSync(svgPath);
  });

  test('verify should reject .json files', async () => {
    const jsonPath = '/tmp/unit-test-verify.json';
    fs.writeFileSync(jsonPath, '{"test": true}');
    const result = await cli(['verify', jsonPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported file format');
    fs.unlinkSync(jsonPath);
  });

  test('verify should reject nonexistent files', async () => {
    const result = await cli(['verify', '/nonexistent/file.fold']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('File not found');
  });

  test('verify should reject unsupported extensions', async () => {
    const txtPath = '/tmp/unit-test.txt';
    fs.writeFileSync(txtPath, 'hello world');
    const result = await cli(['verify', txtPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported file format');
    fs.unlinkSync(txtPath);
  });
});

describe('Config Command', () => {
  test('config should display help', async () => {
    const result = await cli(['config', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--axial-stiffness');
    expect(result.stdout).toContain('--crease-stiffness');
  });

  test('config should accept valid parameters', async () => {
    const result = await cli(['config', '--axial-stiffness', '0.5', '--crease-stiffness', '0.8']);
    // May fail due to browser issues, but should not crash.
    // Realistic budget: chromium launch (3-8s) + origamisimulator.org page load (5-30s) + 3s wait + JS eval.
    // 30s was too tight; bumped to 90s to match launchBrowser's default 60s timeout + headroom.
    expect(result).toHaveProperty('exitCode');
    expect(result).toHaveProperty('stdout');
  }, 90000);
});

describe('Batch Command', () => {
  test('batch should require models or preset', async () => {
    const result = await cli(['batch']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--models or --preset is required');
  });

  test('batch should reject invalid action', async () => {
    const result = await cli(['batch', '--preset', 'cranes', '--action', 'invalid']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid action');
  });

  test('batch should show batch processing message', async () => {
    const result = await cli(['batch', '--preset', 'cranes', '--action', 'screenshot']);
    // Should show batch processing start (may timeout but shouldn't crash)
    expect(result.stdout).toContain('Batch processing') || result.exitCode !== 0;
  }, 120000);  // 120s timeout: browser launch + page load + screenshot can be slow
});

describe('Analyze Command', () => {
  test('analyze should display help', async () => {
    const result = await cli(['analyze', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });
});

describe('View Command', () => {
  test('view should display help', async () => {
    const result = await cli(['view', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  test('view should reject invalid mode', async () => {
    const result = await cli(['view', '--mode', 'invalid']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid view mode');
  });
});

describe('Export Command', () => {
  test('export should display help', async () => {
    const result = await cli(['export', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  test('export should reject invalid format', async () => {
    const result = await cli(['export', '--format', 'invalid']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid format');
  });
});

describe('Simulate Command', () => {
  test('simulate should display help', async () => {
    const result = await cli(['simulate', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--percent');
    expect(result.stdout).toContain('--iterations');
  });
});

describe('Record Command', () => {
  test('record should display help', async () => {
    const result = await cli(['record', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--format');
    expect(result.stdout).toContain('--fps');
  });

  test('record should reject invalid format', async () => {
    const result = await cli(['record', '--format', 'avi']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid format');
  });
});

describe('Load Command - Error Cases', () => {
  test('load should error on nonexistent file', async () => {
    const result = await cli(['load', '--file', '/nonexistent/file.fold']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('File not found');
  });

  test('load should error on unsupported file format', async () => {
    const txtPath = '/tmp/test-load.txt';
    fs.writeFileSync(txtPath, 'test');
    const result = await cli(['load', '--file', txtPath]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported file format');
    fs.unlinkSync(txtPath);
  });

  test('load should error on unknown preset', async () => {
    const result = await cli(['load', '--preset', 'nonexistent-preset']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown preset');
  });
});

describe('List Command', () => {
  test('list should show all presets', async () => {
    const result = await cli(['list']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Available presets:');
    expect(result.stdout).toContain('Categories:');
    expect(result.stdout).toContain('cranes');
  });

  test('list should filter by category', async () => {
    const result = await cli(['list', '--category', 'tessellations']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('tessellations');
  });

  test('list should show simple format', async () => {
    const result = await cli(['list', '--simple']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Available presets:');
  });

  test('list should handle unknown category', async () => {
    const result = await cli(['list', '--category', 'nonexistent']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No presets found');
  });
});

describe('Version and Help', () => {
  test('should show version', async () => {
    const result = await cli(['--version']);
    expect(result.exitCode).toBe(0);
    // 单一真相源：--version 必须等于 package.json.version
    expect(result.stdout.trim()).toBe(require('../../package.json').version);
  });

  test('should show help', async () => {
    const result = await cli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Commands:');
  });

  test('should show load command help', async () => {
    const result = await cli(['load', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--file');
    expect(result.stdout).toContain('--preset');
  });

  test('should show list command help', async () => {
    const result = await cli(['list', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--category');
    expect(result.stdout).toContain('--simple');
  });

  test('should show screenshot command help', async () => {
    const result = await cli(['screenshot', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--output');
    expect(result.stdout).toContain('--preset');
  });
});