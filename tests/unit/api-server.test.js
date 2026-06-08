/**
 * Unit tests for v2.32 REST API Server
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { OrigamiAPIServer, VERSION } = require('../../src/api/server');

const TMP = os.tmpdir();
const CLI_PATH = path.join(__dirname, '../../src/index.js');
const TEST_PORT = 18999 + Math.floor(Math.random() * 100);  // random port

const SQUARE_FOLD = {
  file_spec: 1.1,
  vertices_coords: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]],
  edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 0]],
  edges_assignment: ['B', 'B', 'B', 'B'],
  faces_vertices: [[0, 1, 2, 3]],
};

const TETRA_FOLD = {
  file_spec: 1.1,
  vertices_coords: [[0, 0, 0], [10, 0, 0], [5, 10, 0], [5, 5, 5]],
  edges_vertices: [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]],
  edges_assignment: ['B', 'B', 'B', 'M', 'M', 'V'],
  faces_vertices: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
};

// Helper: make a HTTP request
function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      host: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        let json = null;
        try { json = JSON.parse(body); } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ────────────────────────────────────────────────────────────────────
// Server lifecycle (single shared instance across all describe blocks)
// ────────────────────────────────────────────────────────────────────
describe('OrigamiAPIServer', () => {
  let server;

  beforeAll(async () => {
    server = new OrigamiAPIServer({ port: TEST_PORT, host: '127.0.0.1', cliPath: CLI_PATH });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  // ────────────────────────────────────────────────────────────────────
  // Version constant
  // ────────────────────────────────────────────────────────────────────
  test('exports VERSION constant', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // ────────────────────────────────────────────────────────────────────
  // GET endpoints
  // ────────────────────────────────────────────────────────────────────
  test('GET /health returns server status', async () => {
    const r = await httpRequest('GET', '/health');
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.version).toBe(VERSION);
    expect(typeof r.json.uptime).toBe('number');
    expect(r.json.requestCount).toBeGreaterThan(0);
  });

  test('GET / returns HTML docs', async () => {
    const r = await httpRequest('GET', '/');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.body).toContain('Origami FOLD Analyzer API');
    expect(r.body).toContain('/api/v1/analyze');
  });

  test('GET /api/v1/unknown → 404', async () => {
    const r = await httpRequest('GET', '/api/v1/nonexistent');
    expect(r.status).toBe(404);
    expect(r.json.ok).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  // Command dispatch
  // ────────────────────────────────────────────────────────────────────
  test('POST /api/v1/summary returns summary JSON', async () => {
    const r = await httpRequest('POST', '/api/v1/summary', { fold: SQUARE_FOLD });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.command).toBe('summary');
    expect(r.json.exitCode).toBe(0);
    const parsed = JSON.parse(r.json.stdout);
    expect(parsed.schemaVersion).toBeDefined();
  });

  test('POST /api/v1/analyze returns analyze JSON', async () => {
    const r = await httpRequest('POST', '/api/v1/analyze', {
      fold: SQUARE_FOLD,
      options: { all: true },
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.exitCode).toBe(0);
  });

  test('POST /api/v1/kawasaki returns strict kawasaki JSON', async () => {
    const r = await httpRequest('POST', '/api/v1/kawasaki', {
      fold: TETRA_FOLD,
      options: { top: 5, json: true },
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.exitCode).toBe(0);
  });

  test('POST /api/v1/maekawa returns strict maekawa JSON', async () => {
    const r = await httpRequest('POST', '/api/v1/maekawa', {
      fold: TETRA_FOLD,
      options: { top: 5, json: true },
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.exitCode).toBe(0);
  });

  test('POST /api/v1/diff with foldA+foldB', async () => {
    const r = await httpRequest('POST', '/api/v1/diff', {
      foldA: TETRA_FOLD,
      foldB: TETRA_FOLD,
      options: { tolerance: 0.6 },
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.exitCode).toBe(0);
  });

  test('POST /api/v1/diff with only fold → 500', async () => {
    const r = await httpRequest('POST', '/api/v1/diff', { fold: TETRA_FOLD });
    expect(r.status).toBe(500);
    expect(r.json.ok).toBe(false);
    expect(r.json.error).toMatch(/requires both foldA and foldB/);
  });

  test('Unknown command → 404 with available list', async () => {
    const r = await httpRequest('POST', '/api/v1/bogus', { fold: SQUARE_FOLD });
    expect(r.status).toBe(404);
    expect(r.json.error).toMatch(/Unknown command/);
    expect(r.json.error).toMatch(/analyze/);
  });

  test('Missing fold → 500 (validation error)', async () => {
    const r = await httpRequest('POST', '/api/v1/summary', {});
    expect(r.status).toBe(500);
    expect(r.json.ok).toBe(false);
    expect(r.json.error).toMatch(/requires "fold"/);
  });

  test('Invalid JSON body → 400', async () => {
    const r = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: TEST_PORT, path: '/api/v1/summary', method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      req.write('{not valid json');
      req.end();
    });
    expect(r.status).toBe(400);
  });

  // ────────────────────────────────────────────────────────────────────
  // File-producing commands
  // ────────────────────────────────────────────────────────────────────
  test('POST /api/v1/stl returns a downloadable file', async () => {
    const r = await httpRequest('POST', '/api/v1/stl', { fold: SQUARE_FOLD });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.exitCode).toBe(0);
    expect(r.json.outputFile).toMatch(/\.stl$/);
    expect(r.json.sizeBytes).toBe(684);
    expect(fs.existsSync(r.json.outputFile)).toBe(true);
    const buf = fs.readFileSync(r.json.outputFile);
    expect(buf.length).toBe(684);
    expect(buf.readUInt32LE(80)).toBe(12);

    const filename = path.basename(r.json.outputFile);
    const download = await httpRequest('GET', '/api/v1/files/' + filename);
    expect(download.status).toBe(200);
    expect(download.body.length).toBe(684);
  });

  test('GET /api/v1/files/nonexistent → 404', async () => {
    const r = await httpRequest('GET', '/api/v1/files/nonexistent-12345.html');
    expect(r.status).toBe(404);
  });

  // ────────────────────────────────────────────────────────────────────
  // CORS
  // ────────────────────────────────────────────────────────────────────
  test('OPTIONS request returns 204 with CORS headers', async () => {
    const r = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: TEST_PORT, path: '/api/v1/summary', method: 'OPTIONS',
      }, (res) => {
        resolve({ status: res.statusCode, headers: res.headers });
      });
      req.on('error', reject);
      req.end();
    });
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('*');
  });

  test('All responses include CORS headers', async () => {
    const r = await httpRequest('GET', '/health');
    expect(r.headers['access-control-allow-origin']).toBe('*');
  });
});

// ────────────────────────────────────────────────────────────────────
// Serve command CLI registration (separate, no server needed)
// ────────────────────────────────────────────────────────────────────
describe('serve command registration', () => {
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

  test('should register serve with all expected options', () => {
    const { registerServeCommand } = require('../../src/commands/serve');
    const program = makeFakeProgram();
    registerServeCommand(program);
    const cmd = program.captured['serve'];
    expect(cmd).toBeDefined();
    expect(cmd.options).toContain('-p, --port <port>');
    expect(cmd.options).toContain('-H, --host <host>');
    expect(cmd.options).toContain('--cli-path <path>');
  });
});
