#!/usr/bin/env node
/**
 * e2e 启动器 —— 先探外网，再决定网络用例是「跑」还是「明确 skip」。
 *
 * 用法：npm run test:e2e
 * 退出码：与 jest 一致（0 = 全绿或明确 skip，1 = 有真红）
 *
 * 为什么需要它：screenshot / load --preset 依赖 origamisimulator.org，
 * 网络不通时直接红，是假信号。这里在跑之前先探测，不通就设 E2E_OFFLINE=1，
 * 由测试文件在收集阶段把网络用例整组标记为 skipped。
 */
const { spawn } = require('child_process');
const path = require('path');
const { probe, TARGET } = require('../helpers/network');

(async () => {
  const online = await probe();
  const env = { ...process.env };

  if (online) {
    console.log(`[e2e] ${TARGET} 可达 → 网络用例正常执行`);
  } else {
    env.E2E_OFFLINE = '1';
    console.log(`[e2e] ${TARGET} 不可达 → 网络用例标记为 skipped（明确跳过，不是静默通过）`);
  }

  const jestArgs = ['tests/e2e', '--testTimeout=180000'];
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['jest', ...jestArgs],
    { cwd: path.resolve(__dirname, '../..'), env, stdio: 'inherit' }
  );
  child.on('close', (code) => process.exit(code === null ? 1 : code));
})();
