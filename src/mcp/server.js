/**
 * MCP (Model Context Protocol) Server (v2.40)
 *
 * Exposes origami commands as MCP tools so AI assistants (Claude, etc.)
 * can call them directly. Communication: JSON-RPC 2.0 over stdio.
 *
 * Spec: https://modelcontextprotocol.io/specification
 *
 * Methods implemented:
 *   initialize           — server info + capabilities
 *   tools/list           — list all available tools with JSON Schema
 *   tools/call           — execute a tool with arguments
 *   ping                 — health check
 *
 * Each tool wraps an origami CLI command. Arguments are translated to
 * CLI flags; the FOLD content is written to a temp file and the CLI
 * is spawned as a subprocess. Output is returned as MCP tool result.
 *
 * This server adds NO new dependencies — uses Node's built-in
 * readline for stdio framing.
 */

const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const SERVER_NAME = 'origami-fold-analyzer';
const { VERSION: SERVER_VERSION } = require('../version');
const TMP_DIR = path.join(os.tmpdir(), 'origami-mcp');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ────────────────────────────────────────────────────────────────────
// Tool definitions
// ────────────────────────────────────────────────────────────────────
// Each tool has: name, description, inputSchema (JSON Schema),
// optional outputSchema, and a handler that maps inputs to CLI args.

const TOOLS = [
  {
    name: 'analyze_fold',
    description: 'Run the full FOLD analyzer on a file. Returns basic structure, flat-foldability (Kawasaki, Maekawa, alternating M/V), symmetry, quality, layer analysis, strain, and self-intersection.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a .fold file' },
        all: { type: 'boolean', description: 'Include all sections (default: false)', default: false },
        json: { type: 'boolean', description: 'Output full JSON (default: false)', default: false },
      },
      required: ['file_path'],
    },
    handler: async (args) => runCli(['analyze', args.file_path, ...(args.all ? ['--all'] : []), ...(args.json ? ['--json'] : [])]),
  },
  {
    name: 'summarize_fold',
    description: 'Return a compact summary (9 fields) of a FOLD file. 97% smaller than the full analyze JSON. Good for quick inspection.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a .fold file' },
      },
      required: ['file_path'],
    },
    handler: async (args) => runCli(['summary', args.file_path]),
  },
  {
    name: 'kawasaki_check',
    description: 'v2.12 Strict Kawasaki flat-foldability check. Ranks vertices by |evenSum - oddSum| deviation.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a .fold file' },
        top: { type: 'number', description: 'Show top N deviating vertices (default: 10)', default: 10 },
      },
      required: ['file_path'],
    },
    handler: async (args) => runCli(['kawasaki', args.file_path, '--top', String(args.top ?? 10)]),
  },
  {
    name: 'maekawa_check',
    description: 'v2.14 Strict Maekawa flat-foldability check. Validates |M-V| = 2 at every vertex.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a .fold file' },
        top: { type: 'number', description: 'Show top N deviating vertices (default: 10)', default: 10 },
      },
      required: ['file_path'],
    },
    handler: async (args) => runCli(['maekawa', args.file_path, '--top', String(args.top ?? 10)]),
  },
  {
    name: 'fold_simulate',
    description: 'Run the local fold simulator on a FOLD file. Returns 3D coordinates. Solver: kinematic (fast tree-fold), spring-mass (PBD bend-once+relax), spring-mass-cyclic (full cyclic PBD).',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a .fold file' },
        solver: { type: 'string', enum: ['kinematic', 'spring-mass', 'spring-mass-cyclic'], description: 'Solver to use (default: kinematic)', default: 'kinematic' },
        angle: { type: 'number', description: 'Target fold angle in degrees (default: 90)', default: 90 },
        output_path: { type: 'string', description: 'Where to write the 3D FOLD (default: <file>-folded.fold)' },
      },
      required: ['file_path'],
    },
    handler: async (args) => {
      const cliArgs = ['fold', args.file_path];
      if (args.solver) cliArgs.push('--solver', args.solver);
      if (args.angle !== undefined) cliArgs.push('--angle', String(args.angle));
      if (args.output_path) cliArgs.push('-o', args.output_path);
      return runCli(cliArgs);
    },
  },
  {
    name: 'diff_folds',
    description: 'Compare two FOLD files and report changes (added/removed/moved vertices, edges, faces, metadata).',
    inputSchema: {
      type: 'object',
      properties: {
        file_path_a: { type: 'string', description: 'Absolute path to first .fold file' },
        file_path_b: { type: 'string', description: 'Absolute path to second .fold file' },
        tolerance: { type: 'number', description: 'Vertex matching tolerance in mm (default: 0.001)', default: 0.001 },
      },
      required: ['file_path_a', 'file_path_b'],
    },
    handler: async (args) => runCli(['diff', args.file_path_a, args.file_path_b, '--tolerance', String(args.tolerance ?? 0.001)]),
  },
  {
    name: 'stl_export',
    description: 'Export a FOLD file to STL (binary or ASCII) for 3D printing or laser cutting. 2D inputs are extruded to a 3D sheet with the given thickness.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a .fold file' },
        output_path: { type: 'string', description: 'Where to write the .stl file (default: <file>.stl)' },
        thickness: { type: 'number', description: 'Sheet thickness in mm (default: 1.0)', default: 1.0 },
        ascii: { type: 'boolean', description: 'Use ASCII STL format (default: false)', default: false },
      },
      required: ['file_path'],
    },
    handler: async (args) => {
      const cliArgs = ['stl', args.file_path];
      if (args.output_path) cliArgs.push('-o', args.output_path);
      if (args.thickness !== undefined) cliArgs.push('--thickness', String(args.thickness));
      if (args.ascii) cliArgs.push('--ascii');
      return runCli(cliArgs);
    },
  },
  {
    name: 'validate_fold',
    description: 'Validate the analyze() output against the JSON schema (ajv). Returns validation status, schema version match, and any errors.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a .fold file' },
      },
      required: ['file_path'],
    },
    handler: async (args) => runCli(['validate', args.file_path]),
  },
  {
    name: 'selfintersection_check',
    description: 'v2.15 Complete self-intersection check (Möller triangle-triangle). Returns the number of intersecting face pairs and details.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a .fold file' },
      },
      required: ['file_path'],
    },
    handler: async (args) => runCli(['selfintersection', args.file_path]),
  },
  {
    name: 'mvalternation_check',
    description: 'v2.12 Alternating M/V pattern check. M and V must alternate around internal vertices.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to a .fold file' },
      },
      required: ['file_path'],
    },
    handler: async (args) => runCli(['mvalternation', args.file_path]),
  },
];

// ────────────────────────────────────────────────────────────────────
// JSON-RPC helpers
// ────────────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Run a CLI command and return { stdout, stderr, exitCode, fileOutput? }.
 */
function runCli(args) {
  return new Promise((resolve) => {
    const cliPath = path.join(__dirname, '..', 'index.js');
    const proc = spawn('node', [cliPath, ...args], { cwd: path.dirname(cliPath) });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code, args });
    });
    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: -1, args });
    });
  });
}

/**
 * Write a JSON-RPC response.
 */
function sendResponse(id, result) {
  const response = { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(response) + '\n');
}

/**
 * Write a JSON-RPC error.
 */
function sendError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error }) + '\n');
}

/**
 * Handle an incoming JSON-RPC request.
 */
async function handleRequest(req) {
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    sendError(req.id ?? null, -32600, 'Invalid Request');
    return;
  }

  switch (req.method) {
    case 'initialize':
      sendResponse(req.id, {
        protocolVersion: '2024-11-05',
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        capabilities: { tools: {} },
      });
      break;

    case 'notifications/initialized':
      // Client is ready; no response needed (notification).
      break;

    case 'ping':
      sendResponse(req.id, {});
      break;

    case 'tools/list':
      sendResponse(req.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      break;

    case 'tools/call': {
      const { name, arguments: args = {} } = req.params ?? {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        sendError(req.id, -32602, `Unknown tool: ${name}`);
        return;
      }
      // Validate required args
      const required = tool.inputSchema.required || [];
      for (const key of required) {
        if (args[key] === undefined) {
          sendError(req.id, -32602, `Missing required argument: ${key}`);
          return;
        }
      }
      try {
        const result = await tool.handler(args);
        sendResponse(req.id, {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
          isError: result.exitCode !== 0,
        });
      } catch (err) {
        sendResponse(req.id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        });
      }
      break;
    }

    default:
      sendError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

// ────────────────────────────────────────────────────────────────────
// Main: read JSON-RPC from stdin, dispatch
// ────────────────────────────────────────────────────────────────────

function start() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let req;
    try {
      req = JSON.parse(line);
    } catch (e) {
      sendError(null, -32700, 'Parse error: ' + e.message);
      return;
    }
    handleRequest(req);
  });
  rl.on('close', () => {
    process.exit(0);
  });
}

// Export for testing
module.exports = { TOOLS, handleRequest, runCli, sendResponse, sendError, start, SERVER_NAME, SERVER_VERSION };

// Auto-start when run as main module
if (require.main === module) {
  start();
}
