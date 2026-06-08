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
 */

const { OrigamiAPIServer } = require('../api/server');

function registerServeCommand(program) {
  program
    .command('serve')
    .description('Start REST API server wrapping all origami commands (v2.32 — default 127.0.0.1:3000)')
    .option('-p, --port <port>', 'Port to listen on (default: 3000)', (v) => parseInt(v, 10), 3000)
    .option('-H, --host <host>', 'Host to bind (default: 127.0.0.1)', '127.0.0.1')
    .option('--cli-path <path>', 'Path to the origami CLI entry (default: src/index.js)')
    .action(async (options) => {
      const path = require('path');
      const cliPath = options.cliPath || path.join(__dirname, '..', 'index.js');
      const server = new OrigamiAPIServer({
        port: options.port,
        host: options.host,
        cliPath,
      });

      try {
        await server.start();
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

module.exports = { registerServeCommand };
