/**
 * Unit tests for the new fold-analyzer CLI commands (v2.20+)
 *
 * Tests:
 *   - summary, visualize, validate (refactored from inline src/index.js)
 *   - kawasaki, maekawa, selfintersection, mvalternation (new top-level commands)
 *
 * Pattern: instead of spawning child processes (slow, network-dependent),
 * we call the register*Command() functions with a fake program object
 * that captures the registered command, then invoke the action handler
 * directly with hypar.fold as the input fixture.
 */

const path = require('path');
const fs = require('fs');

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
// Clear mock call records between tests so console.log.calls from one
// test don't pollute the next test's JSON.parse() assertions.
beforeEach(() => {
  console.log.mockClear();
  console.error.mockClear();
});

// Hypar is a 96-vertex model with rich fold data — good stress test
const HYPAR_PATH = path.join(__dirname, '../../hypar.fold');

// Helper: build a fake Commander program that captures registered commands
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

describe('fold-summary command', () => {
  const { registerSummaryCommand } = require('../../src/commands/fold-summary');

  test('should register summary <file>', () => {
    const program = makeFakeProgram();
    registerSummaryCommand(program);
    expect(program.captured['summary <file>']).toBeDefined();
    expect(program.captured['summary <file>']._action).toBeInstanceOf(Function);
  });

  test('should output valid summary JSON on hypar.fold', () => {
    const program = makeFakeProgram();
    registerSummaryCommand(program);
    program.captured['summary <file>']._action(HYPAR_PATH, {});
    const output = console.log.mock.calls.map(c => c.join(' ')).join('\n');
    const parsed = JSON.parse(output);  // throws if not valid JSON
    expect(parsed.schemaVersion).toBeDefined();
    expect(parsed.summaryVersion).toBeDefined();
    expect(parsed.counts.vertices).toBe(96);
  });

  test('should exit 1 with error on missing file', () => {
    const program = makeFakeProgram();
    registerSummaryCommand(program);
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
    try {
      expect(() => program.captured['summary <file>']._action('/nonexistent.fold', {}))
        .toThrow('EXIT');
      const errOutput = console.error.mock.calls.map(c => c.join(' ')).join('\n');
      expect(errOutput).toContain('File not found');
    } finally {
      mockExit.mockRestore();
    }
  });
});

describe('fold-validate command', () => {
  const { registerValidateCommand } = require('../../src/commands/fold-validate');

  test('should register validate <file>', () => {
    const program = makeFakeProgram();
    registerValidateCommand(program);
    expect(program.captured['validate <file>']).toBeDefined();
  });

  test('should output JSON in --json mode on hypar.fold', () => {
    const program = makeFakeProgram();
    registerValidateCommand(program);
    program.captured['validate <file>']._action(HYPAR_PATH, { json: true });
    const output = console.log.mock.calls.map(c => c.join(' ')).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('valid');
    expect(parsed).toHaveProperty('schemaVersion');
  });

  test('should exit 1 on missing file', () => {
    const program = makeFakeProgram();
    registerValidateCommand(program);
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
    try {
      expect(() => program.captured['validate <file>']._action('/nonexistent.fold', {}))
        .toThrow('EXIT');
    } finally {
      mockExit.mockRestore();
    }
  });
});

describe('fold-visualize command', () => {
  const { registerVisualizeCommand } = require('../../src/commands/fold-visualize');

  test('should register visualize <file> with -o option', () => {
    const program = makeFakeProgram();
    registerVisualizeCommand(program);
    expect(program.captured['visualize <file>']).toBeDefined();
    expect(program.captured['visualize <file>'].options).toContain('-o, --output <path>');
  });

  test('should write HTML to default path', () => {
    const program = makeFakeProgram();
    registerVisualizeCommand(program);
    const tmpOut = '/tmp/test-hypar-viz.html';
    try {
      program.captured['visualize <file>']._action(HYPAR_PATH, { output: tmpOut });
      expect(fs.existsSync(tmpOut)).toBe(true);
      const html = fs.readFileSync(tmpOut, 'utf8');
      expect(html).toContain('<svg');
      expect(html.length).toBeGreaterThan(1000);
    } finally {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// New v2.20 deep-analysis commands
// ────────────────────────────────────────────────────────────────────

describe('kawasaki command (v2.12)', () => {
  const { registerKawasakiCommand } = require('../../src/commands/fold-deep');

  test('should register kawasaki <file> with --top and --json', () => {
    const program = makeFakeProgram();
    registerKawasakiCommand(program);
    const cmd = program.captured['kawasaki <file>'];
    expect(cmd).toBeDefined();
    expect(cmd.options).toContain('--top <n>');
    expect(cmd.options).toContain('--json');
  });

  test('should print Strict Kawasaki report on hypar.fold', () => {
    const program = makeFakeProgram();
    registerKawasakiCommand(program);
    program.captured['kawasaki <file>']._action(HYPAR_PATH, {});
    const output = console.log.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Strict Kawasaki');
    expect(output).toContain('Total checked');
    expect(output).toMatch(/Within tolerance/);
  });

  test('should output JSON in --json mode', () => {
    const program = makeFakeProgram();
    registerKawasakiCommand(program);
    program.captured['kawasaki <file>']._action(HYPAR_PATH, { json: true });
    const output = console.log.mock.calls.map(c => c.join(' ')).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('totalChecked');
    expect(parsed).toHaveProperty('withinTolerance');
    expect(parsed).toHaveProperty('outOfTolerance');
  });

  test('should respect --top option', () => {
    const program = makeFakeProgram();
    registerKawasakiCommand(program);
    program.captured['kawasaki <file>']._action(HYPAR_PATH, { top: 3, json: true });
    const output = console.log.mock.calls.map(c => c.join(' ')).join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.topDeviations.length).toBeLessThanOrEqual(3);
  });
});

describe('maekawa command (v2.14)', () => {
  const { registerMaekawaCommand } = require('../../src/commands/fold-deep');

  test('should register maekawa <file>', () => {
    const program = makeFakeProgram();
    registerMaekawaCommand(program);
    const cmd = program.captured['maekawa <file>'];
    expect(cmd).toBeDefined();
    expect(cmd.options).toContain('--top <n>');
  });

  test('should print Strict Maekawa report on hypar.fold', () => {
    const program = makeFakeProgram();
    registerMaekawaCommand(program);
    program.captured['maekawa <file>']._action(HYPAR_PATH, {});
    const output = console.log.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Strict Maekawa');
    expect(output).toContain('|M - V| = 2');
    expect(output).toMatch(/M=\d+\/V=\d+/);
  });

  test('should output JSON in --json mode', () => {
    const program = makeFakeProgram();
    registerMaekawaCommand(program);
    program.captured['maekawa <file>']._action(HYPAR_PATH, { json: true });
    const parsed = JSON.parse(console.log.mock.calls.map(c => c.join(' ')).join('\n'));
    expect(parsed).toHaveProperty('totalChecked');
    expect(parsed.topDeviations[0]).toHaveProperty('M');
    expect(parsed.topDeviations[0]).toHaveProperty('V');
    expect(parsed.topDeviations[0]).toHaveProperty('deviation');
  });
});

describe('selfintersection command (v2.15)', () => {
  const { registerSelfintersectionCommand } = require('../../src/commands/fold-deep');

  test('should register selfintersection <file>', () => {
    const program = makeFakeProgram();
    registerSelfintersectionCommand(program);
    expect(program.captured['selfintersection <file>']).toBeDefined();
  });

  test('should print Möller self-intersection report on hypar.fold', () => {
    const program = makeFakeProgram();
    registerSelfintersectionCommand(program);
    program.captured['selfintersection <file>']._action(HYPAR_PATH, {});
    const output = console.log.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Self-Intersection');
    expect(output).toContain('Möller');
    expect(output).toMatch(/Pairs checked/);
  });

  test('should output JSON in --json mode', () => {
    const program = makeFakeProgram();
    registerSelfintersectionCommand(program);
    program.captured['selfintersection <file>']._action(HYPAR_PATH, { json: true });
    const parsed = JSON.parse(console.log.mock.calls.map(c => c.join(' ')).join('\n'));
    expect(parsed).toHaveProperty('facePairCount');
    expect(parsed).toHaveProperty('intersectionCount');
    expect(parsed).toHaveProperty('intersections');
  });
});

describe('mvalternation command (v2.12)', () => {
  const { registerMvalternationCommand } = require('../../src/commands/fold-deep');

  test('should register mvalternation <file>', () => {
    const program = makeFakeProgram();
    registerMvalternationCommand(program);
    expect(program.captured['mvalternation <file>']).toBeDefined();
  });

  test('should print M/V alternation report on hypar.fold', () => {
    const program = makeFakeProgram();
    registerMvalternationCommand(program);
    program.captured['mvalternation <file>']._action(HYPAR_PATH, {});
    const output = console.log.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('M/V Alternation');
    expect(output).toMatch(/Checked:/);
  });

  test('should output JSON in --json mode', () => {
    const program = makeFakeProgram();
    registerMvalternationCommand(program);
    program.captured['mvalternation <file>']._action(HYPAR_PATH, { json: true });
    const parsed = JSON.parse(console.log.mock.calls.map(c => c.join(' ')).join('\n'));
    expect(parsed).toHaveProperty('totalChecked');
    expect(parsed).toHaveProperty('consistent');
    expect(parsed).toHaveProperty('inconsistent');
  });
});

describe('fold-helpers.runWithFold error paths', () => {
  const { runWithFold } = require('../../src/commands/fold-helpers');

  test('should exit 1 on .svg file (only .fold supported)', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
    const svgPath = '/tmp/test-svg.svg';
    fs.writeFileSync(svgPath, '<svg/>');
    try {
      expect(() => runWithFold(svgPath, {}, () => {})).toThrow('EXIT');
      const errOutput = console.error.mock.calls.map(c => c.join(' ')).join('\n');
      expect(errOutput).toContain('Unsupported file format');
    } finally {
      mockExit.mockRestore();
      fs.unlinkSync(svgPath);
    }
  });

  test('should exit 1 on malformed JSON', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
    const badPath = '/tmp/test-bad.fold';
    fs.writeFileSync(badPath, '{not valid json');
    try {
      expect(() => runWithFold(badPath, {}, () => {})).toThrow('EXIT');
      const errOutput = console.error.mock.calls.map(c => c.join(' ')).join('\n');
      expect(errOutput).toContain('parse FOLD JSON');
    } finally {
      mockExit.mockRestore();
      fs.unlinkSync(badPath);
    }
  });
});
