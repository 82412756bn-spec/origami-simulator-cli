/**
 * Unit tests for the VS Code extension (v2.22)
 *
 * Mocks the `vscode` module so we can test activate() and the command
 * registrations in plain Node.
 */

// Mock the vscode module before requiring extension.js
const mockCommands = new Map();
const mockContext = {
  subscriptions: [],
};

const mockVscode = {
  commands: {
    registerCommand: (id, fn) => {
      mockCommands.set(id, fn);
      return { dispose: () => mockCommands.delete(id) };
    },
  },
  window: {
    createOutputChannel: (name) => ({
      name,
      appendLine: () => {},
      show: () => {},
      clear: () => {},
      dispose: () => {},
    }),
    showErrorMessage: (...args) => { mockVscode._lastError = args.join(' '); },
    showWarningMessage: (...args) => { mockVscode._lastWarn = args.join(' '); },
    setStatusBarMessage: () => undefined,
    activeTextEditor: undefined,
  },
  workspace: {
    getConfiguration: (section) => ({
      get: (key, def) => def,  // always default
    }),
    rootPath: undefined,
  },
  Uri: {
    file: (p) => ({ fsPath: p }),
  },
  ViewColumn: { Beside: 2 },
  _lastError: null,
  _lastWarn: null,
};

// Inject the mock via jest.mock (auto-hooks require() inside extension.js)
jest.mock('vscode', () => mockVscode, { virtual: true });

const { activate, deactivate } = require('../../vscode-origami/extension');

describe('Origami VS Code Extension (v2.22)', () => {
  beforeAll(() => {
    activate(mockContext);
  });

  test('should register 6 commands', () => {
    expect(mockCommands.size).toBe(6);
    expect(mockCommands.has('origami.analyze')).toBe(true);
    expect(mockCommands.has('origami.visualize')).toBe(true);
    expect(mockCommands.has('origami.validate')).toBe(true);
    expect(mockCommands.has('origami.summary')).toBe(true);
    expect(mockCommands.has('origami.kawasaki')).toBe(true);
    expect(mockCommands.has('origami.maekawa')).toBe(true);
  });

  test('command handlers should be functions', () => {
    for (const [id, fn] of mockCommands) {
      expect(typeof fn).toBe('function');
    }
  });

  test('deactivate should be callable', () => {
    expect(typeof deactivate).toBe('function');
    expect(() => deactivate()).not.toThrow();
  });

  test('package.json should declare origami as the publisher category', () => {
    const pkg = require('../../vscode-origami/package.json');
    expect(pkg.name).toBe('origami');
    expect(pkg.displayName).toBe('Origami FOLD Analyzer');
    expect(pkg.engines.vscode).toMatch(/^\^1\./);
    expect(pkg.contributes.commands.length).toBe(6);
    expect(pkg.contributes.menus['editor/context/file'].length).toBe(6);
    expect(pkg.contributes.configuration.properties['origami.cliPath']).toBeDefined();
  });
});
