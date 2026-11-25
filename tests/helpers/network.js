/**
 * 外网可达性探测 —— 把「依赖 origamisimulator.org」的用例从「随机红」
 * 变成「明确 skip」。
 *
 * 背景：e2e 里 load --preset 与 screenshot 都要从 origamisimulator.org
 * 取模型，实测单个用例耗时 15s-65s（随外网状况波动）。判据超时阈值一旦
 * 贴着波动上沿，红灯就分不清是产品坏了还是网络抖了。
 *
 * 契约：
 *   - 探测通过 → 网络用例照常跑
 *   - 探测失败 → 网络用例被显式标记为 skipped（不是静默 pass）
 */
const https = require('https');

const TARGET = 'origamisimulator.org';

/**
 * @param {number} timeoutMs 探测超时
 * @returns {Promise<boolean>} 站点是否可达（2xx-4xx 都算可达）
 */
function probe(timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const req = https.get(`https://${TARGET}/`, { timeout: timeoutMs }, (res) => {
      res.resume();
      done(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('timeout', () => {
      req.destroy();
      done(false);
    });
    req.on('error', () => done(false));
  });
}

module.exports = { probe, TARGET };
