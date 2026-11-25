/**
 * REST API Server (v2.32)
 *
 * Wraps the origami CLI as an HTTP service. Pure Node http + child_process
 * — no new dependencies, no framework. All command logic is reused by
 * shelling out to the existing CLI.
 *
 * API design:
 *   POST /api/v1/:command
 *   Content-Type: application/json
 *   Body: { "fold": {...FOLD object...}, "options": {...command-specific...} }
 *
 *   Response 200:
 *   { "ok": true, "command": "analyze", "exitCode": 0, "stdout": "...", "stderr": "..." }
 *
 *   For file-producing commands (stl, visualize, dieline export, fold --animate):
 *   { "ok": true, "command": "stl", "outputFile": "/tmp/origami-api-xxx.stl", "sizeBytes": 1234 }
 *
 *   GET /health
 *   { "ok": true, "version": "2.32.0", "uptime": 12.3 }
 *
 *   GET /
 *   HTML page listing available endpoints
 *
 * Commands that write files (--output, --animate, etc.) write to a temp
 * directory and return the path in the response. The caller can then
 * fetch the file via GET /api/v1/files/:filename.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const { VERSION } = require('../version');
const TMP_DIR = path.join(os.tmpdir(), 'origami-api');

// Endpoints that produce file output
const FILE_OUTPUT_COMMANDS = new Set([
  'stl', 'visualize', 'dieline-export', 'dieline-parse',
]);

// CLI option-to-flag mapping for forwarding
const COMMAND_FLAGS = {
  analyze: ['--json'],
  summary: [],
  visualize: ['-o', '__OUTPUT__'],
  validate: [],
  kawasaki: ['--json'],
  maekawa: ['--json'],
  selfintersection: ['--json'],
  mvalternation: ['--json'],
  stl: ['-o', '__OUTPUT__'],
  fold: [],
  diff: [],
  'batch-analyze': [],
};

class OrigamiAPIServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 3000,
      host: options.host || '127.0.0.1',
      cliPath: options.cliPath || path.join(__dirname, '..', 'index.js'),
      ...options,
    };
    this.startTime = Date.now();
    this.requestCount = 0;
    this._server = null;

    // Ensure temp dir exists
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }
  }

  /**
   * Start the HTTP server. Returns a Promise that resolves when listening.
   */
  start() {
    return new Promise((resolve, reject) => {
      this._server = http.createServer((req, res) => this.handle(req, res));
      // Handle WebSocket upgrades (v2.36+)
      this._server.on('upgrade', (req, socket, head) => {
        const { handleWebSocketUpgrade } = require('./ws-fold');
        const handled = handleWebSocketUpgrade(req, socket, head, this);
        if (!handled) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
        }
      });
      this._server.on('error', reject);
      this._server.listen(this.options.port, this.options.host, () => {
        resolve(this);
      });
    });
  }

  /**
   * Stop the server.
   */
  stop() {
    return new Promise((resolve) => {
      if (this._server) {
        this._server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Main HTTP request handler.
   */
  async handle(req, res) {
    this.requestCount++;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;
    const pathname = url.pathname;

    // CORS headers (for browser clients)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        return this.handleRoot(res);
      }
      if (method === 'GET' && (pathname === '/demo' || pathname === '/demo.html')) {
        return this.handleDemo(res);
      }
      if (method === 'GET' && pathname === '/health') {
        return this.handleHealth(res);
      }
      if (method === 'GET' && pathname.startsWith('/api/v1/files/')) {
        const fname = pathname.substring('/api/v1/files/'.length);
        return this.handleFileDownload(res, fname);
      }
      if (method === 'POST' && pathname.startsWith('/api/v1/')) {
        const command = pathname.substring('/api/v1/'.length);
        return this.handleCommand(req, res, command);
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `Not found: ${method} ${pathname}` }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  }

  /**
   * GET / — HTML API index
   */
  handleRoot(res) {
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Origami FOLD Analyzer API</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
  h1 { color: #0066cc; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #fafafa; }
  .file-out { color: #d97706; }
</style></head><body>
<h1>📐 Origami FOLD Analyzer API <span style="font-size:14px;color:#666">v${VERSION}</span></h1>
<p>Send POST requests to <code>/api/v1/{command}</code> with a JSON body containing the FOLD object and command options.</p>

<h2>Commands</h2>
<table>
  <tr><th>Endpoint</th><th>Description</th></tr>
  <tr><td><code>POST /api/v1/analyze</code></td><td>Run full FOLD analysis</td></tr>
  <tr><td><code>POST /api/v1/summary</code></td><td>Compact summary JSON</td></tr>
  <tr><td><code>POST /api/v1/visualize</code></td><td>HTML visualization <span class="file-out">(returns file path)</span></td></tr>
  <tr><td><code>POST /api/v1/kawasaki</code></td><td>v2.12 Strict Kawasaki</td></tr>
  <tr><td><code>POST /api/v1/maekawa</code></td><td>v2.14 Strict Maekawa</td></tr>
  <tr><td><code>POST /api/v1/selfintersection</code></td><td>v2.15 Möller self-intersection</td></tr>
  <tr><td><code>POST /api/v1/mvalternation</code></td><td>v2.12 Alternating M/V</td></tr>
  <tr><td><code>POST /api/v1/validate</code></td><td>ajv schema validation</td></tr>
  <tr><td><code>POST /api/v1/stl</code></td><td>Export to STL <span class="file-out">(returns file path)</span></td></tr>
  <tr><td><code>POST /api/v1/fold</code></td><td>Run fold simulator (use "solver" option: kinematic/spring-mass/spring-mass-cyclic)</td></tr>
  <tr><td><code>POST /api/v1/diff</code></td><td>Diff two FOLD files (needs "foldA" + "foldB" in body)</td></tr>
  <tr><td><code>POST /api/v1/batch-analyze</code></td><td>Batch validate multiple files (needs "inputs" array)</td></tr>
  <tr><td><code>GET /health</code></td><td>Server health + version</td></tr>
  <tr><td><code>GET /api/v1/files/:name</code></td><td>Download a generated file</td></tr>
</table>

<h2>Example: analyze</h2>
<pre>POST /api/v1/analyze
Content-Type: application/json

{
  "fold": { "vertices_coords": [[0,0,0],[1,0,0],[0,1,0]], "edges_vertices": [[0,1],[1,2],[2,0]] },
  "options": { "all": true }
}</pre>
</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * GET /demo — Serve the WebSocket browser client (v2.36)
   */
  handleDemo(res) {
    const demoPath = path.join(__dirname, 'ws-fold-client.html');
    if (fs.existsSync(demoPath)) {
      const html = fs.readFileSync(demoPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Demo file not found');
    }
  }

  /**
   * GET /health
   */
  handleHealth(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      version: VERSION,
      uptime: (Date.now() - this.startTime) / 1000,
      requestCount: this.requestCount,
    }));
  }

  /**
   * GET /api/v1/files/:name — download a generated file
   */
  handleFileDownload(res, fname) {
    // Security: prevent path traversal
    if (fname.includes('/') || fname.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid filename' }));
      return;
    }
    const path_ = path.join(TMP_DIR, fname);
    if (!fs.existsSync(path_)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'File not found' }));
      return;
    }
    const content = fs.readFileSync(path_);
    // Guess content type
    let contentType = 'application/octet-stream';
    if (fname.endsWith('.html')) contentType = 'text/html';
    else if (fname.endsWith('.stl')) contentType = 'model/stl';
    else if (fname.endsWith('.json')) contentType = 'application/json';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
    });
    res.end(content);
  }

  /**
   * POST /api/v1/:command — dispatch to CLI
   */
  async handleCommand(req, res, command) {
    const body = await this.readBody(req);
    let payload;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body: ' + e.message }));
      return;
    }

    // Validate command
    if (!COMMAND_FLAGS[command]) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        error: `Unknown command: ${command}. Available: ${Object.keys(COMMAND_FLAGS).join(', ')}`,
      }));
      return;
    }

    try {
      const result = await this.runCommand(command, payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...result }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message, command }));
    }
  }

  /**
   * Run a CLI command with the given payload.
   * The payload must contain a 'fold' field (FOLD object) and an 'options' field.
   * For 'diff' command, payload must have 'foldA' and 'foldB'.
   * For 'batch-analyze' command, payload must have 'inputs' (array of paths or FOLD objects).
   */
  async runCommand(command, payload) {
    // For diff: requires foldA + foldB
    if (command === 'diff') {
      if (!payload.foldA || !payload.foldB) {
        throw new Error('diff requires both foldA and foldB in request body');
      }
      const aPath = this.writeTempFOLD(payload.foldA, 'a');
      const bPath = this.writeTempFOLD(payload.foldB, 'b');
      const args = ['diff', aPath, bPath];
      if (payload.options) this.appendOptions(args, command, payload.options);
      return this.spawn(args, /* captureFile */ false);
    }

    // For batch-analyze: requires 'inputs'
    if (command === 'batch-analyze') {
      if (!payload.inputs || !Array.isArray(payload.inputs)) {
        throw new Error('batch-analyze requires "inputs" array in request body');
      }
      // Inputs can be file paths or inline FOLD objects
      const inputPaths = payload.inputs.map((inp, i) => {
        if (typeof inp === 'string') return inp;  // file path
        if (typeof inp === 'object') return this.writeTempFOLD(inp, `input-${i}`);
        throw new Error(`Invalid input at index ${i}: must be path or FOLD object`);
      });
      const args = ['batch-analyze', ...inputPaths];
      if (payload.options) this.appendOptions(args, command, payload.options);
      return this.spawn(args, /* captureFile */ false);
    }

    // All other commands: require 'fold'
    if (!payload.fold) {
      throw new Error(`${command} requires "fold" in request body`);
    }
    const foldPath = this.writeTempFOLD(payload.fold, 'input');

    // If the command produces file output, set up a temp output path
    const wantsFile = FILE_OUTPUT_COMMANDS.has(command);
    let outputPath = null;
    if (wantsFile) {
      const ext = this.outputExtension(command, payload.options);
      outputPath = path.join(TMP_DIR, `output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
    }

    const args = [command, foldPath];
    if (outputPath) args.push('-o', outputPath);
    if (payload.options) this.appendOptions(args, command, payload.options);

    const result = await this.spawn(args, wantsFile);

    // For file outputs, return the path so caller can GET it
    if (wantsFile && result.exitCode === 0) {
      result.outputFile = outputPath;
      result.outputFilename = path.basename(outputPath);
      if (fs.existsSync(outputPath)) {
        result.sizeBytes = fs.statSync(outputPath).size;
      }
    }
    return result;
  }

  /**
   * Append options to a CLI args array, handling --output specially.
   */
  appendOptions(args, command, options) {
    for (const [key, value] of Object.entries(options)) {
      // Skip the output flag — we manage it ourselves
      if (key === 'output' || key === 'o') continue;
      const flag = key.length === 1 ? `-${key}` : `--${key}`;
      if (value === true) {
        args.push(flag);
      } else if (value === false) {
        // --no-foo style
        args.push(`--no-${key.replace(/^no-?/, '')}`);
      } else if (typeof value === 'object' && value !== null) {
        // JSON object — pass as JSON string
        args.push(flag, JSON.stringify(value));
      } else {
        args.push(flag, String(value));
      }
    }
  }

  /**
   * Spawn the CLI and capture stdout/stderr/exit code.
   */
  spawn(args, _captureFile) {
    return new Promise((resolve) => {
      const proc = spawn('node', [this.options.cliPath, ...args], {
        cwd: path.dirname(this.options.cliPath),
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        resolve({
          command: args[0],
          args: args.slice(1),
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });
      proc.on('error', (err) => {
        resolve({
          command: args[0],
          args: args.slice(1),
          exitCode: -1,
          stdout: '',
          stderr: err.message,
        });
      });
    });
  }

  /**
   * Write a FOLD object to a temp file and return the path.
   */
  writeTempFOLD(fold, label) {
    const fname = `origami-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.fold`;
    const fpath = path.join(TMP_DIR, fname);
    fs.writeFileSync(fpath, JSON.stringify(fold, null, 2));
    return fpath;
  }

  /**
   * Determine the output file extension for a command.
   */
  outputExtension(command, options = {}) {
    if (command === 'stl') return options.ascii ? 'stl' : 'stl';
    if (command === 'visualize') return 'html';
    if (command.startsWith('dieline-')) {
      const fmt = options.format || 'fold';
      return fmt === 'fold' ? 'fold' : fmt;
    }
    return 'out';
  }

  /**
   * Read the full request body as a string.
   */
  readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
}

module.exports = { OrigamiAPIServer, VERSION };
