/**
 * Unit tests for v2.23 batch-analyze command
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  registerBatchAnalyzeCommand,
  toJUnitXML,
  expandInputs,
  CHECKS,
} = require('../../src/commands/fold-batch');

const TMP = os.tmpdir();
const PROJECT_ROOT = path.join(__dirname, '../..');

function makeFakeProgram() {
  const captured = {};
  return {
    captured,
    command(name) {
      const cmd = {
        name,
        options: [],
        _action: null,
        description: '',
        option(flag, _desc, _parseFn) {
          this.options.push(flag);
          return this;
        },
        description(desc) { this.description = desc; return this; },
        action(fn) { this._action = fn; return this; },
      };
      captured[name] = cmd;
      return cmd;
    },
  };
}

// Suppress console noise
const originalLog = console.log;
const originalError = console.error;
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});
afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
});
beforeEach(() => {
  console.log.mockClear();
  console.error.mockClear();
});

// ────────────────────────────────────────────────────────────────────
// expandInputs: input expansion
// ────────────────────────────────────────────────────────────────────
describe('expandInputs', () => {
  test('expands a single .fold file', () => {
    const files = expandInputs(['hypar.fold'], PROJECT_ROOT);
    expect(files).toHaveLength(1);
    expect(files[0].endsWith('hypar.fold')).toBe(true);
  });

  test('expands a comma-separated list', () => {
    const files = expandInputs(['hypar.fold,cranes.fold'], PROJECT_ROOT);
    expect(files.length).toBe(2);
  });

  test('expands a directory recursively', () => {
    const files = expandInputs(['examples'], PROJECT_ROOT);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every(f => f.endsWith('.fold'))).toBe(true);
  });

  test('keeps non-existent paths for later error (load check fails)', () => {
    // expandInputs doesn't filter — it just collects. Bad paths surface
    // as a `load` check failure at run time, which is what we want for
    // CI/CD (so users see which file is missing in JUnit XML).
    const files = expandInputs(['/nonexistent/zzz.fold'], PROJECT_ROOT);
    expect(files).toHaveLength(1);
  });

  test('deduplicates repeated files', () => {
    const files = expandInputs(['hypar.fold,hypar.fold'], PROJECT_ROOT);
    expect(files).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// toJUnitXML: XML output
// ────────────────────────────────────────────────────────────────────
describe('toJUnitXML', () => {
  const sampleResults = [
    {
      file: '/path/to/hypar.fold',
      startedAt: '2026-06-07T10:00:00.000Z',
      timeSec: 0.123,
      allPass: true,
      checks: [
        { name: 'basic', pass: true, message: '96V 207E 0F', timeSec: 0.001 },
        { name: 'analyze', pass: true, message: '0 errors, 16 warnings', timeSec: 0.05 },
        { name: 'schema', pass: true, message: 'v2.10 ok', timeSec: 0.072 },
      ],
    },
    {
      file: '/path/to/crane.fold',
      startedAt: '2026-06-07T10:00:00.123Z',
      timeSec: 0.05,
      allPass: false,
      checks: [
        { name: 'basic', pass: true, message: '5V 8E 4F', timeSec: 0.001 },
        { name: 'analyze', pass: false, message: '1 vertex failed Kawasaki', timeSec: 0.04, details: { vertex: 3 } },
        { name: 'schema', pass: true, message: 'v2.10 ok', timeSec: 0.009 },
      ],
    },
  ];

  test('emits valid XML header', () => {
    const xml = toJUnitXML('test', sampleResults, 0.173);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  test('top-level testsuites has correct aggregate counts', () => {
    const xml = toJUnitXML('test', sampleResults, 0.173);
    expect(xml).toMatch(/<testsuites[^>]*tests="6"/);
    expect(xml).toMatch(/<testsuites[^>]*failures="1"/);
    expect(xml).toMatch(/<testsuites[^>]*errors="0"/);
  });

  test('emits one testsuite per file', () => {
    const xml = toJUnitXML('test', sampleResults, 0.173);
    const suiteMatches = xml.match(/<testsuite\s/g) || [];
    expect(suiteMatches.length).toBe(2);
  });

  test('emits <failure> tag for failed checks', () => {
    const xml = toJUnitXML('test', sampleResults, 0.173);
    expect(xml).toMatch(/<failure message="1 vertex failed Kawasaki"/);
    expect(xml).toMatch(/type="analyzeError"/);
  });

  test('emits self-closing <testcase> for passing checks', () => {
    const xml = toJUnitXML('test', sampleResults, 0.173);
    // 5 passing testcases should be self-closing
    const selfClosing = (xml.match(/<testcase[^>]+\/>/g) || []).length;
    expect(selfClosing).toBe(5);
  });

  test('escapes special characters in file paths', () => {
    const evil = [{ file: '<script>alert(1)</script>', startedAt: 'x', timeSec: 0, allPass: true, checks: [] }];
    const xml = toJUnitXML('test', evil, 0);
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).not.toContain('<script>alert');
  });

  test('writes parseable XML to disk', () => {
    const xml = toJUnitXML('test', sampleResults, 0.173);
    const out = path.join(TMP, 'junit-test.xml');
    try {
      fs.writeFileSync(out, xml);
      // Should be parseable as XML (just check it round-trips through DOMParser if available)
      // Otherwise basic structural check
      const content = fs.readFileSync(out, 'utf8');
      expect(content).toContain('<testsuites');
      expect(content).toContain('</testsuites>');
      // Open + close tag counts match
      const opens = (content.match(/<testsuite[\s>]/g) || []).length;
      const closes = (content.match(/<\/testsuite>/g) || []).length;
      expect(opens).toBe(closes);
    } finally {
      if (fs.existsSync(out)) fs.unlinkSync(out);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// CHECKS: per-action validators
// ────────────────────────────────────────────────────────────────────
describe('CHECKS registry', () => {
  test('has all 5 expected actions', () => {
    expect(Object.keys(CHECKS).sort()).toEqual(
      ['analyze', 'kawasaki', 'maekawa', 'summary', 'validate'].sort()
    );
  });

  test('each check has label + run', () => {
    for (const [name, c] of Object.entries(CHECKS)) {
      expect(c.label).toBeDefined();
      expect(typeof c.run).toBe('function');
    }
  });

  test('checks run against a real hypar.fold analyzer', () => {
    const foldData = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'hypar.fold'), 'utf8'));
    const { FoldAnalyzer } = require('../../src/utils/fold-analyzer');
    const analyzer = new FoldAnalyzer(foldData);

    for (const [name, c] of Object.entries(CHECKS)) {
      const r = c.run(analyzer);
      expect(r).toHaveProperty('pass');
      expect(r).toHaveProperty('message');
      expect(typeof r.pass).toBe('boolean');
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// CLI registration
// ────────────────────────────────────────────────────────────────────
describe('batch-analyze command registration', () => {
  test('should register batch-analyze <inputs...>', () => {
    const program = makeFakeProgram();
    registerBatchAnalyzeCommand(program);
    const cmd = program.captured['batch-analyze <inputs...>'];
    expect(cmd).toBeDefined();
    expect(cmd.options).toContain('-a, --action <action>');
    expect(cmd.options).toContain('-j, --junit <file>');
    expect(cmd.options).toContain('--no-basic');
    expect(cmd.options).toContain('--no-schema');
  });
});

// ────────────────────────────────────────────────────────────────────
// CLI end-to-end (using real hypar.fold + cranes.fold)
// ────────────────────────────────────────────────────────────────────
describe('batch-analyze CLI end-to-end', () => {
  const { spawn } = require('child_process');
  const CLI_PATH = path.join(__dirname, '../../src/index.js');

  function cli(args) {
    return new Promise((resolve) => {
      const proc = spawn('node', [CLI_PATH, ...args], { cwd: PROJECT_ROOT });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
    });
  }

  test('should run on 2 files and write JUnit XML', async () => {
    const out = path.join(TMP, 'batch-junit.xml');
    try {
      const r = await cli(['batch-analyze', 'hypar.fold', 'cranes.fold', '--junit', out, '--quiet']);
      expect(r.exitCode).toBe(0);
      expect(fs.existsSync(out)).toBe(true);
      const xml = fs.readFileSync(out, 'utf8');
      expect(xml).toContain('<testsuites');
      expect(xml).toContain('hypar.fold');
      expect(xml).toContain('cranes.fold');
    } finally {
      if (fs.existsSync(out)) fs.unlinkSync(out);
    }
  }, 30000);

  test('should exit 1 when checks fail (kawasaki action on real model)', async () => {
    const r = await cli(['batch-analyze', 'hypar.fold', '--action', 'kawasaki', '--quiet']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('Failures:  ');
  }, 30000);

  test('should report nonexistent file as a load failure (exit 1, not 2)', async () => {
    // expandInputs keeps the path verbatim so the load check catches it
    // and surfaces the error in JUnit XML — that's the right CI behavior
    // (you want to see WHICH file is missing, not just "0 files").
    const r = await cli(['batch-analyze', '/nonexistent/zzz.fold', '--quiet']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/Failures:\s+1/);
  });

  test('should exit 2 with non-matching glob pattern', async () => {
    const r = await cli(['batch-analyze', '/tmp/nonexistent-dir/*.fold']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('No .fold files found');
  });

  test('should exit 2 with invalid action', async () => {
    const r = await cli(['batch-analyze', 'hypar.fold', '--action', 'bogus']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('Invalid action');
  });

  test('should expand a directory', async () => {
    const r = await cli(['batch-analyze', 'examples', '--quiet']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Files:\s+\d+\/\d+ passed/);
  }, 60000);
});
