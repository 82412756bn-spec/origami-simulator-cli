/**
 * Unit tests for v2.40 MCP (Model Context Protocol) server
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { TOOLS, handleRequest, SERVER_NAME, SERVER_VERSION } = require('../../src/mcp/server');

const PROJECT_ROOT = path.join(__dirname, '../..');
const HYPAR_PATH = path.join(PROJECT_ROOT, 'hypar.fold');

const TMP = os.tmpdir();

// Capture stdout writes by replacing process.stdout.write
function withCapturedStdout(fn) {
  const origWrite = process.stdout.write;
  let captured = '';
  process.stdout.write = (s) => { captured += s; return true; };
  return Promise.resolve()
    .then(() => fn())
    .then(() => captured, (e) => { throw e; })
    .finally(() => { process.stdout.write = origWrite; });
}

function parseLastResponse(captured) {
  const lines = captured.trim().split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
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

// ────────────────────────────────────────────────────────────────────
// Server identity
// ────────────────────────────────────────────────────────────────────
describe('MCP server identity', () => {
  test('exports server name and version', () => {
    expect(SERVER_NAME).toBe('origami-fold-analyzer');
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('exports 10 tools', () => {
    expect(TOOLS.length).toBe(10);
  });

  test('every tool has name, description, and inputSchema', () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema.type).toBe('object');
      expect(typeof t.handler).toBe('function');
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// initialize / tools/list / ping
// ────────────────────────────────────────────────────────────────────
describe('MCP initialize', () => {
  test('returns protocolVersion, serverInfo, capabilities', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: 1, method: 'initialize', params: {},
    }));
    const r = parseLastResponse(response);
    expect(r.id).toBe(1);
    expect(r.result.protocolVersion).toBeDefined();
    expect(r.result.serverInfo.name).toBe(SERVER_NAME);
    expect(r.result.serverInfo.version).toBe(SERVER_VERSION);
    expect(r.result.capabilities).toHaveProperty('tools');
  });

  test('ping returns empty object', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: 2, method: 'ping', params: {},
    }));
    const r = parseLastResponse(response);
    expect(r.id).toBe(2);
    expect(r.result).toEqual({});
  });

  test('notifications/initialized produces no response', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: null, method: 'notifications/initialized', params: {},
    }));
    // No response should be written
    expect(response).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────
// tools/list
// ────────────────────────────────────────────────────────────────────
describe('MCP tools/list', () => {
  test('returns all 10 tools with inputSchema', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: 3, method: 'tools/list', params: {},
    }));
    const r = parseLastResponse(response);
    expect(r.result.tools).toHaveLength(10);
    for (const t of r.result.tools) {
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('inputSchema');
    }
  });

  test('every tool has a name that matches its handler', () => {
    const toolNames = new Set(TOOLS.map(t => t.name));
    expect(toolNames.size).toBe(TOOLS.length);  // all unique
    // Sanity: includes the expected names
    expect(toolNames.has('analyze_fold')).toBe(true);
    expect(toolNames.has('summarize_fold')).toBe(true);
    expect(toolNames.has('fold_simulate')).toBe(true);
    expect(toolNames.has('diff_folds')).toBe(true);
    expect(toolNames.has('stl_export')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// tools/call — happy path
// ────────────────────────────────────────────────────────────────────
describe('MCP tools/call — happy path', () => {
  test('summarize_fold returns parsed summary', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: 4,
      method: 'tools/call',
      params: { name: 'summarize_fold', arguments: { file_path: HYPAR_PATH } },
    }));
    const r = parseLastResponse(response);
    expect(r.id).toBe(4);
    expect(r.result.content).toHaveLength(1);
    expect(r.result.content[0].type).toBe('text');
    const toolData = JSON.parse(r.result.content[0].text);
    expect(toolData.exitCode).toBe(0);
    const summary = JSON.parse(toolData.stdout);
    expect(summary.schemaVersion).toBeDefined();
    expect(summary.counts.vertices).toBe(96);
  }, 10000);

  test('kawasaki_check returns top deviations', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: 5,
      method: 'tools/call',
      params: { name: 'kawasaki_check', arguments: { file_path: HYPAR_PATH, top: 3 } },
    }));
    const r = parseLastResponse(response);
    const toolData = JSON.parse(r.result.content[0].text);
    expect(toolData.exitCode).toBe(0);
  }, 10000);

  test('fold_simulate produces 3D output', async () => {
    // Create a simple 2D FOLD for folding
    const foldFile = path.join(TMP, 'mcp-test.fold');
    fs.writeFileSync(foldFile, JSON.stringify({
      file_spec: 1.1,
      vertices_coords: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0], [2, 0, 0], [2, 1, 0]],
      edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 2]],
      edges_assignment: ['B', 'B', 'M', 'B', 'B', 'B', 'B'],
      faces_vertices: [[0, 1, 2, 3], [3, 2, 5, 4]],
    }));
    const outFile = path.join(TMP, 'mcp-folded.fold');

    try {
      const response = await withCapturedStdout(() => handleRequest({
        jsonrpc: '2.0', id: 6,
        method: 'tools/call',
        params: {
          name: 'fold_simulate',
          arguments: { file_path: foldFile, solver: 'kinematic', angle: 90, output_path: outFile },
        },
      }));
      const r = parseLastResponse(response);
      const toolData = JSON.parse(r.result.content[0].text);
      expect(toolData.exitCode).toBe(0);
      // Verify the 3D FOLD was written
      expect(fs.existsSync(outFile)).toBe(true);
      const folded = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      // V5 should have z != 0 after fold
      const V5 = folded.vertices_coords[5];
      expect(Math.abs(V5[2])).toBeGreaterThan(0.5);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  }, 10000);

  test('stl_export writes an STL file', async () => {
    const foldFile = path.join(TMP, 'mcp-stl-test.fold');
    const outFile = path.join(TMP, 'mcp-stl-test.stl');
    fs.writeFileSync(foldFile, JSON.stringify({
      file_spec: 1.1,
      vertices_coords: [[0, 0, 0], [50, 0, 0], [50, 50, 0], [0, 50, 0]],
      edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 0]],
      edges_assignment: ['B', 'B', 'B', 'B'],
      faces_vertices: [[0, 1, 2, 3]],
    }));
    try {
      const response = await withCapturedStdout(() => handleRequest({
        jsonrpc: '2.0', id: 7,
        method: 'tools/call',
        params: { name: 'stl_export', arguments: { file_path: foldFile, output_path: outFile, thickness: 1.0 } },
      }));
      const r = parseLastResponse(response);
      const toolData = JSON.parse(r.result.content[0].text);
      expect(toolData.exitCode).toBe(0);
      expect(fs.existsSync(outFile)).toBe(true);
      // Binary STL: 12 triangles, 684 bytes
      const buf = fs.readFileSync(outFile);
      expect(buf.length).toBe(684);
    } finally {
      if (fs.existsSync(foldFile)) fs.unlinkSync(foldFile);
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  }, 10000);
});

// ────────────────────────────────────────────────────────────────────
// tools/call — error paths
// ────────────────────────────────────────────────────────────────────
describe('MCP tools/call — error paths', () => {
  test('unknown tool → -32602 error', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: 8,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    }));
    const r = parseLastResponse(response);
    expect(r.error).toBeDefined();
    expect(r.error.code).toBe(-32602);
    expect(r.error.message).toMatch(/Unknown tool/);
  });

  test('missing required argument → -32602 error', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: 9,
      method: 'tools/call',
      params: { name: 'summarize_fold', arguments: {} },  // no file_path
    }));
    const r = parseLastResponse(response);
    expect(r.error).toBeDefined();
    expect(r.error.message).toMatch(/Missing required argument.*file_path/);
  });

  test('file not found → isError result', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: 10,
      method: 'tools/call',
      params: { name: 'summarize_fold', arguments: { file_path: '/nonexistent/x.fold' } },
    }));
    const r = parseLastResponse(response);
    expect(r.result.isError).toBe(true);
    const toolData = JSON.parse(r.result.content[0].text);
    expect(toolData.exitCode).not.toBe(0);
    expect(toolData.stderr).toMatch(/File not found/);
  }, 10000);
});

// ────────────────────────────────────────────────────────────────────
// JSON-RPC error handling
// ────────────────────────────────────────────────────────────────────
describe('MCP JSON-RPC error handling', () => {
  test('unknown method → -32601 error', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '2.0', id: 11, method: 'no_such_method', params: {},
    }));
    const r = parseLastResponse(response);
    expect(r.error.code).toBe(-32601);
  });

  test('invalid JSON-RPC version → -32600 error', async () => {
    const response = await withCapturedStdout(() => handleRequest({
      jsonrpc: '1.0', id: 12, method: 'ping', params: {},
    }));
    const r = parseLastResponse(response);
    expect(r.error.code).toBe(-32600);
  });
});

// ────────────────────────────────────────────────────────────────────
// MCP command CLI registration
// ────────────────────────────────────────────────────────────────────
describe('mcp command registration', () => {
  function makeFakeProgram() {
    const captured = {};
    return {
      captured,
      command(name) {
        const cmd = {
          name, options: [], _action: null, description: '',
          option(flag) { this.options.push(flag); return this; },
          description_(d) { this.description = d; return this; },
          action(fn) { this._action = fn; return this; },
        };
        cmd.description = cmd.description_;
        captured[name] = cmd;
        return cmd;
      },
    };
  }

  test('should register mcp command', () => {
    const { registerMcpCommand } = require('../../src/commands/mcp');
    const program = makeFakeProgram();
    registerMcpCommand(program);
    const cmd = program.captured['mcp'];
    expect(cmd).toBeDefined();
  });
});
