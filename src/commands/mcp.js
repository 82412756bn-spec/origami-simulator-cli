/**
 * mcp Command (v2.40) — Start the MCP (Model Context Protocol) server
 *
 *   origami mcp
 *
 * Reads JSON-RPC 2.0 messages from stdin, writes responses to stdout.
 * Exposes all origami commands as MCP tools for AI assistants.
 *
 * To use with Claude Code or Claude Desktop, configure mcpServers
 * with command "origami" and args ["mcp"].
 */

const { start } = require('../mcp/server');

function registerMcpCommand(program) {
  program
    .command('mcp')
    .description('Start the MCP (Model Context Protocol) server over stdio (v2.40)')
    .action(() => {
      // The MCP server is purely stdio-based. Use readline.
      // When the parent process closes stdin, the server exits.
      start();
    });
}

module.exports = { registerMcpCommand };
