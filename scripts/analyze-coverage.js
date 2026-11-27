#!/usr/bin/env node
/**
 * analyze-coverage.js —— 以官方 78 例为基准，回答三个问题：
 *
 *   ① 内置生成器（8 个 pattern）的几何正确性到底如何？（大副点名要的数据）
 *      —— 「从未验证」不等于「几何错误」，不测就没资格说它无用
 *   ② 模板集的最小覆盖集是多少？（set cover 贪心 + 去冗余）
 *      —— 20 件可能压到 8-12 件；并给出「新增模板的入库门槛」
 *   ③ 15 个未复现的官方形态属于哪几类？（对称闭包的天花板在哪）
 *
 * 用法：node scripts/analyze-coverage.js [--corpus <goods/origami-examples 目录>]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const args = process.argv.slice(2);
const ci = args.indexOf('--corpus');
const CORPUS = ci >= 0
  ? path.resolve(args[ci + 1])
  : path.join(os.homedir(), '文档/Unbuntu_system/goods/origami-examples');

const { loadTemplateFold, transformTemplate, loadManifest } =
  require(path.join(REPO, 'src/utils/template-transform'));
const { detectCreaseCrossings } = require(path.join(REPO, 'src/utils/crease-pattern-2d.js'));
const { FoldAnalyzer } = require(path.join(REPO, 'src/utils/fold-analyzer.js'));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.fold')) out.push(p);
  }
  return out;
}

/** 结构指纹：判定两个折痕图是否「同构形态」 */
function feature(d) {
  const V = d.vertices_coords || [];
  const E = d.edges_vertices || [];
  const A = d.edges_assignment || [];
  const inc = new Map();
  E.forEach((e, i) => {
    if (!e || e.length < 2) return;
    for (const v of e) {
      if (!inc.has(v)) inc.set(v, []);
      inc.get(v).push(i);
    }
  });
  let interior = 0;
  const deg = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const [, list] of inc) {
    if (list.length < 3) continue;
    if (list.some((i) => (A[i] || 'B') === 'B')) continue;
    interior++;
    deg[list.length <= 3 ? 3 : list.length >= 7 ? 7 : list.length]++;
  }
  const cnt = { M: 0, V: 0, B: 0 };
  for (const a of A) cnt[a] = (cnt[a] || 0) + 1;
  const n = Math.max(A.length, 1);
  return [
    Math.log10(V.length + 1), Math.log10(E.length + 1), Math.log10(interior + 1),
    Math.log10((d.faces_vertices || []).length + 1),
    cnt.M / n, cnt.V / n, cnt.B / n,
    ...[3, 4, 5, 6, 7].map((k) => deg[k] / Math.max(interior, 1)),
  ];
}
function dist(a, b) {
  let s = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = Number.isFinite(a[i]) ? a[i] : 0;
    const y = Number.isFinite(b[i]) ? b[i] : 0;
    s += (x - y) ** 2;
  }
  return Math.sqrt(s);
}
function judge(d) {
  const a = new FoldAnalyzer(d);
  const k = a.strictKawasaki();
  const m = a.analyzeMaekawa();
  return {
    kaw: `${k.withinTolerance}/${k.totalChecked}`,
    mae: `${m.withinTolerance}/${m.totalChecked}`,
    cross: detectCreaseCrossings(d).crossingCount,
    flat: k.withinTolerance === k.totalChecked && m.withinTolerance === m.totalChecked,
  };
}

/* ── ① 内置生成器的几何正确性 ─────────────────────────────── */
console.log('=' * 82);
console.log('① 内置生成器（8 个 pattern）的几何正确性 —— 大副点名要的数据');
console.log('=' * 82);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
const builtins = [];
for (const b of ['star', 'crane', 'fish', 'miura', 'tiger', 'radial', 'modular', 'unit']) {
  try {
    execFileSync('node', [path.join(REPO, 'src/index.js'), 'generate', b,
      '--output-dir', path.join(tmp, b)], { cwd: REPO, stdio: 'ignore', timeout: 240000 });
    const f = path.join(tmp, b, `${b}.fold`);
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const j = judge(d);
    builtins.push({ name: b, feat: feature(d), j, d });
    console.log(`  ${b.padEnd(9)} Kaw ${j.kaw.padEnd(9)} Mae ${j.mae.padEnd(9)} 交叉 ${String(j.cross).padEnd(4)} ${j.flat ? '✅ 全过' : '⚠️'}`);
  } catch (e) { console.log(`  ${b}: 生成失败`); }
}

/* ── 官方 78 例 + 模板集 ─────────────────────────────────── */
const officialFiles = walk(path.join(CORPUS, 'FOLD')).sort();
const official = [];
for (const f of officialFiles) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  let norm = raw;
  try { norm = loadTemplateFold({ file: path.basename(f) }, path.dirname(f)).foldData; } catch (e) { /* raw */ }
  official.push({ name: path.basename(f, '.fold'), feat: feature(norm) });
}
console.log(`\n官方示例: ${official.length} 件`);

const manifest = loadManifest();
const combos = [];
for (const t of manifest.templates) {
  let base;
  try { base = loadTemplateFold(t).foldData; } catch (e) { continue; }
  for (const copies of [1, 2, 3, 4, 6]) {
    for (const rotate of [0, 30, 45, 60, 90, 120, 180]) {
      combos.push({ id: t.id, copies, rotate, feat: feature(transformTemplate(base, { copies, rotate, scale: 1 })) });
    }
  }
}
console.log(`模板组合: ${combos.length} 个（${manifest.templates.length} 模板）`);

/* ── ② set cover：最小覆盖集 ──────────────────────────────── */
console.log('\n' + '='.repeat(82));
console.log('② 模板集 set cover —— 最小覆盖集与冗余');
console.log('='.repeat(82));
const THRESH = 0.9;
const covered = new Set();
const picked = [];
const pool = combos.slice();
while (covered.size < official.length) {
  let best = null; let bestGain = -1;
  for (const c of pool) {
    let gain = 0;
    for (let i = 0; i < official.length; i++) {
      if (covered.has(i)) continue;
      if (dist(official[i].feat, c.feat) < THRESH) gain++;
    }
    if (gain > bestGain) { bestGain = gain; best = c; }
  }
  if (!best || bestGain <= 0) break;
  picked.push({ ...best, gain: bestGain });
  for (let i = 0; i < official.length; i++) {
    if (!covered.has(i) && dist(official[i].feat, best.feat) < THRESH) covered.add(i);
  }
  console.log(`  + ${best.id.padEnd(28)} copies=${best.copies} rotate=${String(best.rotate).padStart(3)}  边际增益 ${String(bestGain).padStart(2)}  累计覆盖 ${covered.size}/${official.length}`);
}
console.log(`\n  最小覆盖集: ${picked.length} 个组合覆盖 ${covered.size}/${official.length} 个官方形态`);
const usedTemplates = [...new Set(picked.map((p) => p.id))];
console.log(`  涉及模板: ${usedTemplates.length} 件 → ${usedTemplates.join(', ')}`);
const unused = manifest.templates.filter((t) => !usedTemplates.includes(t.id)).map((t) => t.id);
console.log(`  冗余模板（未贡献覆盖）: ${unused.length} 件 → ${unused.join(', ') || '无'}`);

/* ── ③ 未复现形态的分类 ──────────────────────────────────── */
console.log('\n' + '='.repeat(82));
console.log('③ 未复现的官方形态 —— 对称闭包的天花板在哪');
console.log('='.repeat(82));
const miss = [];
for (let i = 0; i < official.length; i++) {
  if (covered.has(i)) continue;
  let best = Infinity; let bid = '';
  for (const c of combos) {
    const d = dist(official[i].feat, c.feat);
    if (d < best) { best = d; bid = `${c.id}(${c.copies},${c.rotate})`; }
  }
  miss.push({ name: official[i].name, d: best, near: bid });
}
miss.sort((a, b) => a.d - b.d);
for (const m of miss) console.log(`  ${m.name.padEnd(32)} 最近 ${m.near.padEnd(30)} 距离 ${m.d.toFixed(3)}`);
console.log(`\n  未复现: ${miss.length} 件（距离 < ${THRESH} 视为复现）`);

fs.writeFileSync('/tmp/coverage-analysis.json', JSON.stringify({
  builtins: builtins.map((b) => ({ name: b.name, ...b.j })),
  minimalSet: picked, coveredCount: covered.size, officialCount: official.length,
  usedTemplates, unusedTemplates: unused, missed: miss,
}, null, 1));
console.log('\n（明细已写入 /tmp/coverage-analysis.json）');
