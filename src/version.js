/**
 * 单一版本真相源 (single source of truth)
 *
 * 所有对外暴露的版本号一律从 package.json 读取。
 * 禁止在源码里硬编码版本字面量 —— v2.46.0 之前，src/ 里有 3 处硬编码
 * (0.2.0 / 2.32.0 / 2.40.0)，与 package.json 的 2.46.0 全部不一致。
 *
 * 消费方：
 *   src/index.js        → CLI --version
 *   src/api/server.js   → REST /health
 *   src/mcp/server.js   → MCP initialize → serverInfo.version
 */
const { version } = require('../package.json');

module.exports = { VERSION: version };
