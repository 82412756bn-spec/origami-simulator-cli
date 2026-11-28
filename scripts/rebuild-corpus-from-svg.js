#!/usr/bin/env node
/**
 * 语料重建选择器：**从官方 SVG 重建 FOLD，判据全过才采用**
 * ==================================================
 *
 * 为什么需要
 * ----------
 * 官方语料（origamisimulator.org 的 FOLD）在**裁剪**时把纸边界上的折痕替换成 'B'，
 * 造成几何退化（>180° 的退化扇区）→ 真实的 Kawasaki 判定把它们判为不合格。
 * 实测 miura-ori：官方 FOLD 退化率 70%、Kawasaki 81/798；
 * 而**从官方 SVG 重新生成**的 FOLD 退化率 **0%**、Kawasaki **132/132 全过**。
 *
 * 但**不是所有作品都能这样治好**：whirlpool 从 SVG 重建后退化率仍 63%、
 * Kawasaki 1/568 —— 因为那里的退化来自**原始 SVG 本身的几何**（曲线采样截断），
 * 不是 FOLD 加工造成的。
 *
 * 所以不能用「一律重建」，要用**判据做选择器**：
 *   重建版跑判据 → **全过就采用重建版**，否则用规范化版。
 * → 全自动、可增量、零风险（判据不通过就自动回退）。
 *
 * 用法
 * ----
 *   node scripts/rebuild-corpus-from-svg.js --dry-run
 *   node scripts/rebuild-corpus-from-svg.js --out benchmarks/corpus-rebuilt
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { normalizeCreasePattern } = require('../src/utils/crease-pattern-normalizer');
const { FoldAnalyzer } = require('../src/utils/fold-analyzer');

const REPO = path.join(__dirname, '..');
const CORPUS = process.env.ORIGAMI_CORPUS || '/home/rayna/文档/Unbuntu_system/goods/origami-examples';
const CONVERTER = process.env.ORIGAMI_SVG2FOLD || '/home/rayna/文档/Unbuntu_system/evolution/svg_to_fold.py';
const DEFAULT_OUT = path.join(REPO, 'benchmarks', 'corpus-rebuilt');

function parseArgs(argv) {
  const out = { out: DEFAULT_OUT, dryRun: false, limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10) || 0;
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.fold') || e.name.endsWith('.svg')) acc.push(p);
  }
  return acc;
}

/** 判定：Kawasaki + Maekawa 是否全过（且至少检查了一个顶点） */
function judge(foldData) {
  const a = new FoldAnalyzer(foldData);
  const k = a.strictKawasaki();
  const m = a.analyzeMaekawa();
  return {
    kaw: `${k.withinTolerance}/${k.totalChecked}`,
    mae: `${m.withinTolerance}/${m.totalChecked}`,
    ok: k.totalChecked > 0 && k.withinTolerance === k.totalChecked
      && m.totalChecked > 0 && m.withinTolerance === m.totalChecked,
  };
}

/** 退化率：>180° 扇区占比 */
function degeneracy(foldData) {
  const V = foldData.vertices_coords || [], E = foldData.edges_vertices || [], A = foldData.edges_assignment || [];
  const inc = new Map();
  E.forEach((e, i) => { if (!e || e.length < 2) return; for (const v of e) { if (!inc.has(v)) inc.set(v, []); inc.get(v).push(i); } });
  let total = 0, big = 0;
  for (const [, list] of inc) {
    if (list.length < 3) continue;
    if (list.some((i) => (A[i] || 'B') === 'B' || A[i] === 'U' || A[i] === 'F')) continue;
    total++;
    const dirs = list.map((i) => {
      const e = E[i]; const o = e[0] === undefined ? -1 : e[1];
      const p0 = V[0], p1 = V[o];
      return p0 && p1 ? Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) : 0;
    }).sort((x, y) => x - y);
    for (let k = 0; k < dirs.length; k++) {
      const ang = (k + 1 < dirs.length ? dirs[k + 1] : dirs[0] + 2 * Math.PI) - dirs[k];
      if (ang > Math.PI + 1e-9) { big++; break; }
    }
  }
  return total ? big / total : 0;
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(CORPUS)) { console.error(`❌ 语料不存在: ${CORPUS}`); process.exit(1); }
  if (!fs.existsSync(CONVERTER)) {
    console.error(`❌ SVG→FOLD 转换器不存在: ${CONVERTER}`);
    console.error('   （用 ORIGAMI_SVG2FOLD 环境变量指定）');
    process.exit(2);
  }

  const files = walk(CORPUS);
  const svgs = new Map();
  const folds = new Map();
  for (const f of files) {
    const base = path.basename(f);
    if (f.endsWith('.svg')) svgs.set(base.replace(/\.svg$/, ''), f);
    else folds.set(base.replace(/\.fold$/, ''), f);
  }
  const names = [...folds.keys()].filter((n) => svgs.has(n)).sort();
  console.log(`语料: ${CORPUS}`);
  console.log(`  FOLD ${folds.size} 份 · SVG ${svgs.size} 份 · 同名配对 ${names.length} 份`);
  console.log(`输出: ${args.dryRun ? '(dry-run)' : args.out}\n`);

  if (!args.dryRun) fs.mkdirSync(args.out, { recursive: true });
  const tmp = fs.mkdtempSync('/tmp/rebuild-');
  const rows = [];
  const rebuildFailures = [];
  const list = args.limit ? names.slice(0, args.limit) : names;

  for (const n of list) {
    // ① 从官方 SVG 重建
    const svgFile = svgs.get(n);
    const outFold = path.join(tmp, `${n}.fold`);
    let rebuilt = null;
    let rebuildError = null;
    try {
      execFileSync('python3', [CONVERTER, svgFile, outFold], { timeout: 240, stdio: 'ignore' });
      if (fs.existsSync(outFold)) rebuilt = JSON.parse(fs.readFileSync(outFold, 'utf8'));
      else rebuildError = '转换器未产出文件';
    } catch (e) {
      rebuildError = (e && e.stderr ? String(e.stderr).trim().split('\n').slice(-1)[0] : String(e.message || e));
    }
    if (rebuildError) rebuildFailures.push({ name: n, error: rebuildError });

    // ② 官方 FOLD 规范化版（兜底）
    let normalized = null;
    try {
      const raw = JSON.parse(fs.readFileSync(folds.get(n), 'utf8'));
      const res = normalizeCreasePattern(JSON.parse(JSON.stringify(raw)));
      normalized = res.foldData;
    } catch (e) { /* 读不了 → 无兜底 */ }

    const jRebuilt = rebuilt ? judge(rebuilt) : null;
    const jNorm = normalized ? judge(normalized) : null;

    // ③ 选择器（排序规则，按优先级）：
    //   1. 判据**全过**者优先（重建版 > 规范化版）
    //   2. 都没全过 → 比**顶点级通过率**（Kawasaki 与 Maekawa 通过率的较小者）
    //   3. 仍相同 → 比**退化率**（越低越好）
    //   4. 再相同 → 取重建版（更新的来源）
    const score = (jj, dd) => {
      if (!jj) return -1;
      const kp = jj.kaw.includes('/') ? parseInt(jj.kaw.split('/')[0], 10) / Math.max(parseInt(jj.kaw.split('/')[1], 10), 1) : 0;
      const mp = jj.mae.includes('/') ? parseInt(jj.mae.split('/')[0], 10) / Math.max(parseInt(jj.mae.split('/')[1], 10), 1) : 0;
      return { pass: Math.min(kp, mp), deg: dd === null || dd === undefined ? 1 : dd, ok: jj.ok };
    };
    const sR = score(jRebuilt, rebuilt ? degeneracy(rebuilt) : null);
    const sN = score(jNorm, normalized ? degeneracy(normalized) : null);

    let chosen = 'none', data = null, j = null, why = '';
    // 排序（按优先级）：
    //   1. **退化率作 hard gate**：退化率高的那版直接出局
    //      （理由：大副 2026-11-28 复核指出 —— 退化面会「膨胀」通过率
    //        （面少 → 失败顶点也少）→ 若按通过率优先，会选到更差的分解）
    //   2. 判据**全过**者优先
    //   3. 顶点级通过率（Kaw 与 Mae 取小）更高者
    //   4. 取重建版
    const DEG_GATE = 0.02;   // 退化率 2% 以内才算「干净」
    const better = (a, b) => {
      const aClean = a.deg <= DEG_GATE, bClean = b.deg <= DEG_GATE;
      if (aClean !== bClean) return aClean;          // 干净的优先（hard gate）
      if (a.pass !== b.pass) return a.pass > b.pass;
      if (a.deg !== b.deg) return a.deg < b.deg;
      return false;
    };
    if (jRebuilt && jRebuilt.ok) { chosen = 'rebuilt'; data = rebuilt; j = jRebuilt; why = '重建版判据全过'; }
    else if (jNorm && jNorm.ok) { chosen = 'normalized'; data = normalized; j = jNorm; why = '规范化版判据全过'; }
    else if (jRebuilt && jNorm) {
      if (better(sR, sN)) { chosen = 'rebuilt-partial'; data = rebuilt; j = jRebuilt; why = `两者都未全过，重建版通过率更高（${(sR.pass * 100).toFixed(1)}% vs ${(sN.pass * 100).toFixed(1)}%）`; }
      else { chosen = 'normalized-partial'; data = normalized; j = jNorm; why = `两者都未全过，规范化版通过率更高（${(sN.pass * 100).toFixed(1)}% vs ${(sR.pass * 100).toFixed(1)}%）`; }
    } else if (jRebuilt) { chosen = 'rebuilt-unchecked'; data = rebuilt; j = jRebuilt; why = '仅重建版可用'; }
    else if (jNorm) { chosen = 'normalized-unchecked'; data = normalized; j = jNorm; why = '仅规范化版可用'; }

    if (data && !args.dryRun) {
      data.metadata = Object.assign({}, data.metadata || {}, {
        corpus_rebuild: { source_svg: path.basename(svgFile), chosen, reason: why, rebuilt_at: new Date().toISOString() },
      });
      fs.writeFileSync(path.join(args.out, `${n}.fold`), JSON.stringify(data, null, 2));
    }

    rows.push({
      name: n,
      rebuilt: jRebuilt ? `${jRebuilt.kaw}·${jRebuilt.mae}` : '—',
      rebuiltDeg: rebuilt ? degeneracy(rebuilt) : null,
      normalized: jNorm ? `${jNorm.kaw}·${jNorm.maekawa || jNorm.mae}` : '—',
      normalizedDeg: normalized ? degeneracy(normalized) : null,
      chosen, why,
    });
  }

  const fmt = (s) => String(s).padEnd(14);
  console.log('固定宽度对齐表（重建版 vs 规范化版：Kawasaki·Maekawa）');
  console.log('─'.repeat(104));
  console.log(`${'作品'.padEnd(28)} ${'重建版'.padEnd(14)} ${'规范化版'.padEnd(14)} ${'采用'.padEnd(18)} 原因`);
  console.log('─'.repeat(104));
  let cnt = { rebuilt: 0, normalized: 0, none: 0 };
  for (const r of rows) {
    const dr = r.rebuiltDeg === null ? '—' : `${(r.rebuiltDeg * 100).toFixed(0)}%`;
    const dn = r.normalizedDeg === null ? '—' : `${(r.normalizedDeg * 100).toFixed(0)}%`;
    console.log(`${r.name.slice(0, 27).padEnd(28)} ${fmt(r.rebuilt + ' ' + dr)} ${fmt(r.normalized + ' ' + dn)} ${r.chosen.padEnd(18)} ${r.why}`);
    if (r.chosen.startsWith('rebuilt')) cnt.rebuilt++;
    else if (r.chosen.startsWith('normalized')) cnt.normalized++;
    else cnt.none++;
  }
  console.log('─'.repeat(104));
  console.log(`采用重建版: ${cnt.rebuilt} 份 · 采用规范化版: ${cnt.normalized} 份 · 未产出: ${cnt.none} 份`);
  if (rebuildFailures.length) {
    console.log(`\n⚠️ SVG 重建失败 ${rebuildFailures.length} 份（已自动回退规范化版，不是静默失败）：`);
    for (const f of rebuildFailures.slice(0, 10)) console.log(`   - ${f.name}: ${f.error}`);
  }
  console.log('\n判据说明：Kawasaki(扇区角, 5° 容差) · Maekawa(偶数价期望 2 / 奇数价期望 1)；'
    + '「退化」= 扇区 >180° 的顶点占比');
  console.log('选择器：重建版**判据全过**才采用；否则回退规范化版（自动化、零风险）');
  if (!args.dryRun) console.log(`\n已写出: ${args.out}`);
}

if (require.main === module) main();
module.exports = { judge, degeneracy };
