#!/usr/bin/env node
/**
 * verify-against-official.js —— 以官方 78 个示例为基准，逆向验证「按意图生成」能力。
 *
 * 三层验证：
 *   1. 还原保真度：官方 FOLD 经规范化管线（打断→平衡 M/V→去重）后，
 *      折痕总弧长与几何覆盖率是否保持（几何有没有被破坏）
 *   2. 覆盖矩阵：官方 78 例 → 最接近的**内置生成器**（8 个）
 *   3. 逆向拟合：官方 78 例 → 最接近的**模板 + 参数组合**（模板库 × copies × rotate）
 *
 * 用法：
 *   node scripts/verify-against-official.js [--corpus <goods/origami-examples 目录>]
 *
 * 退出码：0 = 跑完（结论看输出）；1 = 语料不存在
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const args = process.argv.slice(2);
const corpusArg = args.indexOf('--corpus');
const CORPUS = corpusArg >= 0
  ? path.resolve(args[corpusArg + 1])
  : path.join(os.homedir(), '文档/Unbuntu_system/goods/origami-examples');

if (!fs.existsSync(CORPUS)) {
  console.error(`语料目录不存在: ${CORPUS}\n（可用 --corpus 指定）`);
  process.exit(1);
}

const {
  loadTemplateFold, transformTemplate, loadManifest,
} = require(path.join(REPO, 'src/utils/template-transform'));
const { detectCreaseCrossings } = require(path.join(REPO, 'src/utils/crease-pattern-2d.js'));
const { FoldAnalyzer } = require(path.join(REPO, 'src/utils/fold-analyzer.js'));

/* ── 工具 ─────────────────────────────────────────────── */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.fold')) out.push(p);
  }
  return out;
}
function totalLength(d) {
  const V = d.vertices_coords || [];
  let t = 0;
  for (const e of (d.edges_vertices || [])) {
    if (!e || e.length < 2) continue;
    const a = V[e[0]]; const b = V[e[1]];
    if (!a || !b) continue;
    t += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return t;
}
function segs(d) {
  const V = d.vertices_coords || [];
  const r = [];
  for (const e of (d.edges_vertices || [])) {
    if (!e || e.length < 2 || e[0] === e[1]) continue;
    const a = V[e[0]]; const b = V[e[1]];
    if (!a || !b) continue;
    r.push([a[0], a[1], b[0], b[1]]);
  }
  return r;
}
/** 折痕图结构指纹（用于最近邻比较） */
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
  const degHist = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const [, list] of inc) {
    if (list.length < 3) continue;
    if (list.some((i) => (A[i] || 'B') === 'B')) continue;
    interior++;
    degHist[list.length <= 3 ? 3 : list.length >= 7 ? 7 : list.length]++;
  }
  const cnt = { M: 0, V: 0, B: 0 };
  for (const a of A) cnt[a] = (cnt[a] || 0) + 1;
  const n = Math.max(A.length, 1);
  return [
    Math.log10(V.length + 1), Math.log10(E.length + 1), Math.log10(interior + 1),
    Math.log10((d.faces_vertices || []).length + 1),
    cnt.M / n, cnt.V / n, cnt.B / n,
    ...[3, 4, 5, 6, 7].map((k) => degHist[k] / Math.max(interior, 1)),
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

/* ── 1. 还原保真度 ─────────────────────────────────────── */
const official = walk(path.join(CORPUS, 'FOLD')).sort();
console.log(`官方示例: ${official.length} 件\n`);

let lenOk = 0; let lenBad = 0; let empty = 0; let crossFixed = 0; let flatOk = 0;
for (const f of official) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  let norm = raw;
  try { norm = loadTemplateFold({ file: path.basename(f) }, path.dirname(f)).foldData; } catch (e) { /* raw */ }
  const out = transformTemplate(norm, { copies: 1, rotate: 0, scale: 1 });
  const l0 = totalLength(raw); const l1 = totalLength(out);
  if (l0 === 0 && l1 === 0) {
    // 官方 FOLD 本身是空的（3 件：HexSpiralTess / Treble_Clef / auxetic_triangle）→
    // 弧长 0/0 无可比性 → 单独归类，不计入「未保持」
    empty += 1;
  } else if (Math.abs(l1 / (l0 || 1) - 1) < 0.005) {
    lenOk += 1;
  } else {
    lenBad += 1;
    console.log(`   [弧长未保持] ${path.basename(f)}  比值 ${(l1 / (l0 || 1)).toFixed(4)}  边 ${(raw.edges_vertices || []).length}→${(out.edges_vertices || []).length}`);
  }
  const c0 = detectCreaseCrossings(raw).crossingCount;
  const c1 = detectCreaseCrossings(out).crossingCount;
  if (c0 > 0 && c1 === 0) crossFixed++;
  const a = new FoldAnalyzer(out);
  const k = a.strictKawasaki(); const m = a.analyzeMaekawa();
  if (k.withinTolerance === k.totalChecked && m.withinTolerance === m.totalChecked) flatOk++;
}
console.log('【1】还原保真度');
console.log(`   弧长保持            : ${lenOk} / ${official.length - empty}（另 ${empty} 件官方 FOLD 本身为空，不适用）`);
if (lenBad) console.log(`   弧长未保持          : ${lenBad}`);
console.log(`   交叉被规范化消除    : ${crossFixed} / ${official.length}`);
console.log(`   规范化后折平性全过  : ${flatOk} / ${official.length}\n`);

/* ── 2 & 3. 覆盖矩阵与逆向拟合 ─────────────────────────── */
const offFeat = [];
for (const f of official) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  let norm = raw;
  try { norm = loadTemplateFold({ file: path.basename(f) }, path.dirname(f)).foldData; } catch (e) { /* raw */ }
  offFeat.push({ name: path.basename(f, '.fold'), feat: feature(norm) });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vao-'));
const bFeat = [];
for (const b of ['star', 'crane', 'fish', 'miura', 'tiger', 'radial', 'modular', 'unit']) {
  try {
    execFileSync('node', [path.join(REPO, 'src/index.js'), 'generate', b, '--output-dir', path.join(tmp, b)],
      { cwd: REPO, stdio: 'ignore', timeout: 240000 });
    const f = path.join(tmp, b, `${b}.fold`);
    if (fs.existsSync(f)) bFeat.push({ name: b, feat: feature(JSON.parse(fs.readFileSync(f, 'utf8'))) });
  } catch (e) { /* skip */ }
}
const combos = [];
for (const t of loadManifest().templates) {
  let base;
  try { base = loadTemplateFold(t).foldData; } catch (e) { continue; }
  for (const copies of [1, 2, 3, 4, 6]) {
    for (const rotate of [0, 30, 45, 60, 90, 120, 180]) {
      combos.push({ id: t.id, copies, rotate, feat: feature(transformTemplate(base, { copies, rotate, scale: 1 })) });
    }
  }
}

const tally = {}; let covered = 0;
for (const o of offFeat) {
  let best = null; let bd = Infinity;
  for (const b of bFeat) {
    const d = dist(o.feat, b.feat);
    if (d < bd) { bd = d; best = b.name; }
  }
  tally[best] = (tally[best] || 0) + 1;
  if (bd < 0.9) covered++;
}
console.log('【2】内置生成器（8 个）对官方形态的覆盖');
for (const [k, v] of Object.entries(tally).sort((x, y) => y[1] - x[1])) {
  console.log(`   ${String(k).padEnd(10)} ${String(v).padStart(2)} 件  ${'█'.repeat(v)}`);
}
console.log(`   距离 < 0.9（视为覆盖）: ${covered} / ${offFeat.length}\n`);

let fitGood = 0;
const fits = [];
for (const o of offFeat) {
  let best = null; let bd = Infinity;
  for (const c of combos) {
    const d = dist(o.feat, c.feat);
    if (d < bd) { bd = d; best = c; }
  }
  if (bd < 0.9) fitGood++;
  fits.push({ name: o.name, id: best.id, copies: best.copies, rotate: best.rotate, d: Number(bd.toFixed(3)) });
}
fits.sort((a, b) => a.d - b.d);
console.log('【3】模板 + 参数对官方形态的复现（逆向拟合）');
console.log(`   距离 < 0.9（视为可复现）: ${fitGood} / ${offFeat.length}`);
console.log('   拟合最好与最差的样例:');
for (const f of fits.slice(0, 6)) {
  console.log(`     ✅ ${f.name.padEnd(30)} → ${f.id.padEnd(30)} copies=${f.copies} rotate=${String(f.rotate).padStart(3)} d=${f.d}`);
}
console.log('     ...');
for (const f of fits.slice(-6)) {
  console.log(`     ⚠️ ${f.name.padEnd(30)} → ${f.id.padEnd(30)} copies=${f.copies} rotate=${String(f.rotate).padStart(3)} d=${f.d}`);
}
console.log('\n（d 为结构指纹距离：0 = 同构形态，越小越接近）');
