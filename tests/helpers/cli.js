/**
 * e2e 共用的 CLI 调用器 —— 带「只对网络类失败生效」的重试。
 *
 * 背景：load / screenshot 都要开无头浏览器访问 origamisimulator.org。
 * 实测同一命令单次耗时 15-65s 波动，e2e 里出现过「手动 3 次全绿、套件里红 1 次」
 * 的情况（2026-11-26）。分不清是产品坏了还是外网抖了，这个信号就是废的。
 *
 * 重试契约：
 *   - 只在退出码非 0 且 stderr 命中网络类特征时才重试
 *   - 确定性失败（File not found / Unsupported file format / Unknown preset）
 *     一次都不重试 —— 绝不拿重试掩盖真 bug
 *   - 探针判定整站不可达时，由 run-e2e.js 走「显式 skip」路径，不进重试
 */
const { spawn } = require('child_process');
const path = require('path');

const CLI_PATH = path.join(__dirname, '../../src/index.js');

// 网络类失败的特征串
const TRANSIENT = /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ERR_|net::|Page load timeout|Cannot navigate/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 原样调用 CLI，不重试 */
function cli(args) {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], { cwd: path.dirname(CLI_PATH) });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => resolve({ exitCode: code, stdout, stderr, attempts: 1 }));
  });
}

/** 判断一次失败是否属于网络类（可重试） */
function looksTransient(stderr = '') {
  return TRANSIENT.test(stderr);
}

/**
 * 调用 CLI，失败时最多重试 retries 次（仅网络类失败）。
 * @returns {Promise<{exitCode:number, stdout:string, stderr:string, attempts:number}>}
 */
async function cliWithRetry(args, { retries = 2, delayMs = 4000 } = {}) {
  let result = await cli(args);
  while (result.exitCode !== 0 && looksTransient(result.stderr) && result.attempts <= retries) {
    await sleep(delayMs);
    result = await cli(args);
  }
  return result;
}

module.exports = { CLI_PATH, cli, cliWithRetry, looksTransient, sleep };
