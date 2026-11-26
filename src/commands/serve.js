/**
 * serve Command (v2.32) — Start the REST API server
 *
 *   origami serve                        → 127.0.0.1:3000 (default)
 *   origami serve --port 8080           → custom port
 *   origami serve --host 0.0.0.0        → listen on all interfaces
 *   origami serve --cli-path /path/to/cli  → custom CLI path
 *
 * The server shells out to the existing CLI for each request, so every
 * command behaves identically to its CLI counterpart.
 *
 * Request logging (v2.47): every request appends one JSONL line to
 *   ~/.origami/signals/rest.jsonl      (override: ORIGAMI_SIGNALS_DIR)
 * Only route / method / status / duration / peer IP are recorded — never
 * the request body, and never the query string (it may carry secrets).
 *
 * Note on "is somebody else calling": the default bind is 127.0.0.1, so
 * a non-loopback peer IP can only appear when the server is started with
 * `--host 0.0.0.0` (or bound to a routable address).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { OrigamiAPIServer } = require('../api/server');

// ────────────────────────────────────────────────────────────────────
// Signals logging (v2.47 — 14-day falsification window observer)
// ────────────────────────────────────────────────────────────────────
// The peer IP is the only evidence used to tell "someone else" from
// "the author", so it is recorded verbatim from the socket.

const SIGNALS_DIR = process.env.ORIGAMI_SIGNALS_DIR || path.join(os.homedir(), '.origami', 'signals');
let _signalsWarned = false;

/**
 * Local ISO-8601 timestamp with UTC offset, e.g. 2026-11-27T09:00:00+08:00.
 */
function isoTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Path only — the query string is dropped on purpose.
 */
function routeOf(url) {
  try {
    return new URL(url || '/', 'http://localhost').pathname;
  } catch (err) {
    return url || null;
  }
}

/**
 * Append one JSONL line to the signals log. Never throws.
 */
function appendSignal(entry) {
  try {
    fs.mkdirSync(SIGNALS_DIR, { recursive: true });
    fs.appendFileSync(path.join(SIGNALS_DIR, `${entry.channel}.jsonl`), JSON.stringify(entry) + '\n');
  } catch (err) {
    if (!_signalsWarned) {
      _signalsWarned = true;
      process.stderr.write(`[origami] signals log unavailable, continuing without it (${err.message})\n`);
    }
  }
}

/**
 * Observe every HTTP request on the running server and log it once the
 * response is finished (status code is only final at that point).
 */
function attachRequestLogger(server) {
  const httpServer = server && server._server;
  if (!httpServer || typeof httpServer.on !== 'function') {
    process.stderr.write('[origami] signals log unavailable: cannot attach the request logger, continuing without it\n');
    return;
  }

  httpServer.on('request', (req, res) => {
    const startedAt = Date.now();
    const peerIp = (req.socket && req.socket.remoteAddress) || null;
    const route = routeOf(req.url);
    let logged = false;

    const record = (status) => {
      if (logged) return;
      logged = true;
      appendSignal({
        ts: isoTimestamp(),
        channel: 'rest',
        route,
        method: req.method || null,
        status,
        ms: Date.now() - startedAt,
        peer_ip: peerIp,
      });
    };

    res.on('finish', () => record(res.statusCode));
    res.on('close', () => record(res.statusCode));
  });
}

function registerServeCommand(program) {
  program
    .command('serve')
    .description('Start REST API server wrapping all origami commands (v2.32 — default 127.0.0.1:3000)')
    .option('-p, --port <port>', 'Port to listen on (default: 3000)', (v) => parseInt(v, 10), 3000)
    .option('-H, --host <host>', 'Host to bind (default: 127.0.0.1)', '127.0.0.1')
    .option('--cli-path <path>', 'Path to the origami CLI entry (default: src/index.js)')
    .action(async (options) => {
      const cliPath = options.cliPath || path.join(__dirname, '..', 'index.js');
      const server = new OrigamiAPIServer({
        port: options.port,
        host: options.host,
        cliPath,
      });

      try {
        await server.start();
        attachRequestLogger(server);
        console.log(`📡 Origami FOLD Analyzer API listening on http://${options.host}:${options.port}`);
        console.log(`   Try:  curl http://${options.host}:${options.port}/health`);
        console.log(`   Docs: http://${options.host}:${options.port}/`);
        console.log('   Press Ctrl+C to stop.');

        // Graceful shutdown
        const shutdown = async () => {
          console.log('\nShutting down...');
          await server.stop();
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (err) {
        console.error(`❌ Failed to start server: ${err.message}`);
        process.exit(1);
      }
    });
}

module.exports = { registerServeCommand, attachRequestLogger, appendSignal, isoTimestamp, routeOf };
