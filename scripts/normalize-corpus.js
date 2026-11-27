#!/usr/bin/env node
/**
 * 语料规范化修复层
 * =================
 *
 * 为什么需要
 * ----------
 * 官方语料（origamisimulator.org 的 78 个折痕图）里，**42 件有内部顶点的作品中有 23 件
 * 存在几何退化**（裁剪时纸边的折痕被人为换成 'B'，导致扇区角 > 180° 的退化顶点）。
 * 实测：miura-ori 原件 132 个内部顶点里 **92 个**有 >180° 的退化扇区 → 真实的 Kawasaki
 * 判定是 0/130；而**规范化后的副本 132/132 全过**。
 *
 * → 基准测试应该用**规范化副本**，原件只读不动。
 *
 * 做什么
 * ------
 * 读官方语料 → `normalizeCreasePattern()`（打断交点 → 平衡 M/V → 去重）→
 * 写规范化副本 + 报告修复前后的 Kawasaki / Maekawa。
 *
 * 用法
 * ----
 *   node scripts/normalize-corpus.js --in <官方语料 FOLD 目录> --out <输出目录>
 *   node scripts/normalize-corpus.js --dry-run
 */
const fs = require('fs');
const path = require('path');
const { normalizeCreasePattern } = require('../src/utils/crease-pattern-normalizer');
const { FoldAnalyzer } = require('../src/utils/fold-analyzer');

const DEFAULT_IN = '/home/rayna/文档/Unbuntu_system/goods/origami-examples/FOLD';
const DEFAULT_OUT = path.join(__dirname, '..', 'benchmarks', 'corpus-normalized');

function parseArgs(argv) {
  const out = { in: DEFAULT_IN, out: DEFAULT_OUT, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') out.in = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

/** 该 FOLD 的折平必要条件判定（扇区角 Kawasaki + Maekawa），用项目自己的分析器 */
function judge(foldData) {
  const a = new FoldAnalyzer(foldData);
  const k = a.strictKawasaki();
  const m = a.analyzeMaekawa();
  const rate = (a, b) => (b > 0 ? a / b : 0);
  return {
    kawa: `${k.withinTolerance}/${k.totalChecked}`,
    maekawa: `${m.withinTolerance}/${m.totalChecked}`,
    kawaRate: rate(k.withinTolerance, k.totalChecked),
    maekawaRate: rate(m.withinTolerance, m.totalChecked),
    ok: k.totalChecked > 0 && k.withinTolerance === k.totalChecked
      && m.totalChecked > 0 && m.withinTolerance === m.totalChecked,
  };
}

/** 统计退化扇区（>180°）的顶点占比 —— 几何退化的指标 */
function degeneracy(foldData) {
  const V = foldData.vertices_coords || [];
  const E = foldData.edges_vertices || [];
  const A = foldData.edges_assignment || [];
  const inc = new Map();
  E.forEach((e, i) => {
    if (!e || e.length < 2) return;
    for (const v of e) { if (!inc.has(v)) inc.set(v, []); inc.get(v).push(i); }
  });
  let total = 0, big = 0;
  for (const [vIdx, list] of inc) {
    if (list.length < 3) continue;
    if (list.some((i) => (A[i] || 'B') === 'B' || A[i] === 'U' || A[i] === 'F')) continue;
    total++;
    const p0 = V[vIdx];
    if (!p0) continue;
    const dirs = list.map((i) => {
      const e = E[i];
      const other = e[0] === vIdx ? e[1] : e[0];
      const p1 = V[other];
      return p1 ? Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) : 0;
    }).sort((x, y) => x - y);
    for (let k = 0; k < dirs.length; k++) {
      const ang = (k + 1 < dirs.length ? dirs[k + 1] : dirs[0] + 2 * Math.PI) - dirs[k];
      if (ang > Math.PI + 1e-9) { big++; break; }
    }
  }
  return { total, big, ratio: total ? big / total : 0 };
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.fold')) acc.push(p);
  }
  return acc;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
    return;
  }
  if (!fs.existsSync(args.in)) {
    console.error(`❌ 输入目录不存在: ${args.in}`);
    process.exit(1);
  }

  const files = walk(args.in);
  console.log(`语料: ${args.in}  (${files.length} 个 .fold)`);
  console.log(`输出: ${args.dryRun ? '(dry-run，不写)' : args.out}\n`);

  if (!args.dryRun) fs.mkdirSync(args.out, { recursive: true });

  const rows = [];
  for (const f of files) {
    const name = path.basename(f);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
    const before = judge(raw);
    const degBefore = degeneracy(raw);

    let fixed = raw;
    try {
      const res = normalizeCreasePattern(JSON.parse(JSON.stringify(raw)));
      if (res && res.foldData) fixed = res.foldData;
    } catch (e) {
      fixed = raw;
    }
    const after = judge(fixed);
    const degAfter = degeneracy(fixed);

    if (!args.dryRun) {
      const dest = path.join(args.out, name);
      fs.writeFileSync(dest, JSON.stringify(fixed, null, 2));
    }
    rows.push({ name, before, after, degBefore, degAfter });
  }

  console.log('固定宽度对齐表（顶点级通过率：Kawasaki / Maekawa）');
  console.log('─'.repeat(86));
  console.log(`${'作品'.padEnd(28)} ${'原件 Kaw'.padEnd(9)} ${'原件 Mae'.padEnd(9)} ${'修复后 Kaw'.padEnd(11)} ${'修复后 Mae'.padEnd(11)} 退化`);
  console.log('─'.repeat(86));
  let improved = 0, degraded = 0, n = 0;
  for (const r of rows) {
    if (!r.before.kawa || r.before.kawa.startsWith('0/0')) continue;
    n++;
    const pct = (x) => `${(x * 100).toFixed(1)}%`;
    const dB = r.degBefore.ratio > 0 ? `${(r.degBefore.ratio * 100).toFixed(0)}%` : '—';
    const dA = r.degAfter.ratio > 0 ? `${(r.degAfter.ratio * 100).toFixed(0)}%` : '—';
    if (r.after.kawaRate > r.before.kawaRate + 1e-9) improved++;
    if (r.after.kawaRate < r.before.kawaRate - 1e-9) degraded++;
    console.log(
      `${r.name.slice(0, 27).padEnd(28)} ${pct(r.before.kawaRate).padEnd(9)} ${pct(r.before.maekawaRate).padEnd(9)} `
      + `${pct(r.after.kawaRate).padEnd(11)} ${pct(r.after.maekawaRate).padEnd(11)} ${dB}→${dA}`);
  }
  console.log('─'.repeat(86));
  console.log(`参与统计的作品: ${n} 件`);
  console.log(`Kawasaki 顶点级通过率**提升**的: ${improved} 件；下降的: ${degraded} 件`);
  console.log(`\n判据说明：Kawasaki(扇区角, 5° 容差) · Maekawa(|M−V|=2)；「退化」= 扇区 >180° 的顶点占比`);
  console.log('注：规范化会打断交点 → 顶点变多，故用**顶点级通过率**而非作品级「100% 全过」比较');
}

if (require.main === module) main();
module.exports = { judge, degeneracy };
