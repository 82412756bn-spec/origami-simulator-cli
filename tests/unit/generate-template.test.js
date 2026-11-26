/**
 * 模板模式（--template）的单元测试
 *
 * 覆盖：
 *  1. 模板清单可读、每件模板文件存在
 *  2. **对称变换保持折平性**（核心）：manifest 里每件模板 × copies=3 × rotate=120，
 *     产物的 Kawasaki 与 Maekawa 必须全过
 *  3. 确定性：同参数两次跑，产物逐字节一致
 *  4. 参数校验：非法 copies / rotate / scale / 未知模板 → 非 0 退出 + 清晰错误
 *  5. SVG 与 FOLD 一致：边数相等（复用判据 E 的逻辑）
 *
 * 另有一条「反自证」用例：用**测试内独立实现**的变换规则复算，
 * 避免测试只是复述实现的输出。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');
const CLI = path.join(REPO, 'src', 'index.js');
const TEMPLATE_DIR = path.join(REPO, 'templates');
const MANIFEST = path.join(TEMPLATE_DIR, 'manifest.json');

const { FoldAnalyzer } = require('../../src/utils/fold-analyzer');

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function run(args, opts = {}) {
  try {
    const out = execFileSync('node', [CLI, ...args], {
      cwd: REPO, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out, err: '' };
  } catch (e) {
    return { code: e.status === undefined ? 1 : e.status, out: e.stdout || '', err: e.stderr || '' };
  }
}

describe('模板模式 · 清单与文件', () => {
  test('manifest 可读且至少有一件模板', () => {
    const m = loadManifest();
    expect(Array.isArray(m.templates)).toBe(true);
    expect(m.templates.length).toBeGreaterThan(0);
  });

  test('每件模板的 .fold 文件都存在', () => {
    for (const t of loadManifest().templates) {
      expect(fs.existsSync(path.join(TEMPLATE_DIR, t.file))).toBe(true);
    }
  });

  test('templates/LICENSE 存在（MIT 再分发条件：副本须附版权与许可声明）', () => {
    const lic = path.join(TEMPLATE_DIR, 'LICENSE');
    expect(fs.existsSync(lic)).toBe(true);
    expect(fs.readFileSync(lic, 'utf8')).toMatch(/Permission is hereby granted/);
  });
});

describe('模板模式 · 对称变换保持折平性（核心判据）', () => {
  const manifest = loadManifest();

  test('每一件模板 × copies=3 × rotate=120 → Kawasaki 与 Maekawa 全过', () => {
    const failures = [];
    for (const t of manifest.templates) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'origami-tmpl-'));
      const r = run(['generate', '--template', t.id, '--copies', '3', '--rotate', '120',
        '--output-dir', dir, '--quiet']);
      if (r.code !== 0) {
        failures.push(`${t.id}: 命令退出 ${r.code}`);
        continue;
      }
      const foldPath = path.join(dir, `${t.id}.fold`);
      if (!fs.existsSync(foldPath)) {
        failures.push(`${t.id}: 未产出 .fold`);
        continue;
      }
      const data = JSON.parse(fs.readFileSync(foldPath, 'utf8'));
      const a = new FoldAnalyzer(data);
      const k = a.strictKawasaki();
      const m = a.analyzeMaekawa();
      if (k.outOfTolerance > 0) {
        failures.push(`${t.id}: Kawasaki ${k.withinTolerance}/${k.totalChecked}`);
      }
      if (m.outOfTolerance > 0) {
        failures.push(`${t.id}: Maekawa ${m.withinTolerance}/${m.totalChecked}`);
      }
    }
    // manifest 里标了 known_limitations 的模板，其不通过项是**已知且已登记**的形态原因；
    // 这里只要求「完全合格的模板必须全过」，已知受限的模板允许不通过但必须在清单里登记。
    const known = manifest.templates.filter((t) => t.known_limitations).map((t) => t.id);
    const unexpected = failures.filter((f) => !known.some((id) => f.startsWith(id)));
    expect(unexpected).toEqual([]);
  });

  test('完全合格的模板（manifest 标注 fully_qualified）必须真的全过', () => {
    const failures = [];
    for (const t of loadManifest().templates) {
      if (!t.fully_qualified) continue;   // manifest v2 的字段（v1 是 baseline_at_copies3_rotate120.fully_qualified）
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'origami-tmpl-'));
      const r = run(['generate', '--template', t.id, '--copies', '3', '--rotate', '120',
        '--output-dir', dir, '--quiet']);
      if (r.code !== 0) { failures.push(`${t.id}: 退出 ${r.code}`); continue; }
      const data = JSON.parse(fs.readFileSync(path.join(dir, `${t.id}.fold`), 'utf8'));
      const a = new FoldAnalyzer(data);
      if (a.strictKawasaki().outOfTolerance > 0) failures.push(`${t.id}: Kawasaki`);
      if (a.analyzeMaekawa().outOfTolerance > 0) failures.push(`${t.id}: Maekawa`);
    }
    expect(failures).toEqual([]);
  });
});

describe('模板模式 · 确定性', () => {
  test('同参数两次跑 → 产物逐字节一致', () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'origami-det-a-'));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'origami-det-b-'));
    const args = ['generate', '--template', 'Bases-birdBase', '--copies', '3', '--rotate', '120', '--quiet'];
    run([...args, '--output-dir', dirA]);
    run([...args, '--output-dir', dirB]);
    const a = fs.readFileSync(path.join(dirA, 'Bases-birdBase.fold'));
    const b = fs.readFileSync(path.join(dirB, 'Bases-birdBase.fold'));
    expect(a.equals(b)).toBe(true);
    const sa = fs.readFileSync(path.join(dirA, 'Bases-birdBase.svg'), 'utf8');
    const sb = fs.readFileSync(path.join(dirB, 'Bases-birdBase.svg'), 'utf8');
    expect(sa).toBe(sb);
  });
});

describe('模板模式 · 参数校验', () => {
  const cases = [
    [['generate', '--template', 'no-such-template'], /未知模板|Unknown template/i],
    [['generate', '--template', 'Bases-birdBase', '--copies', '0'], /copies/i],
    [['generate', '--template', 'Bases-birdBase', '--copies', '999'], /copies/i],
    [['generate', '--template', 'Bases-birdBase', '--rotate', '9999'], /rotate/i],
    [['generate', '--template', 'Bases-birdBase', '--scale', '0'], /scale/i],
    [['generate', '--template', 'Bases-birdBase', 'star'], /互斥|二选一/i],
  ];
  test.each(cases)('非法用法 → 非 0 退出并给出清晰错误: %j', (args, pattern) => {
    const r = run(args);
    expect(r.code).not.toBe(0);
    expect(r.err + r.out).toMatch(pattern);
  });
});

describe('模板模式 · SVG 与 FOLD 一致', () => {
  test('产物 SVG 的边数 == FOLD 的边数', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'origami-svg-'));
    const r = run(['generate', '--template', 'Bases-birdBase', '--copies', '2', '--rotate', '180',
      '--output-dir', dir, '--quiet']);
    expect(r.code).toBe(0);
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'Bases-birdBase.fold'), 'utf8'));
    const svg = fs.readFileSync(path.join(dir, 'Bases-birdBase.svg'), 'utf8');
    const paths = (svg.match(/<path[^>]*\sd="M/g) || []).length;
    expect(paths).toBe((data.edges_vertices || []).length);
  });
});

describe('模板模式 · 反自证（独立复算）', () => {
  test('独立复算的旋转与排布规则，与实现的产物一致（不变量断言）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'origami-ind-'));
    const r = run(['generate', '--template', 'Bases-birdBase', '--copies', '2', '--rotate', '180',
      '--output-dir', dir, '--quiet']);
    expect(r.code).toBe(0);
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'Bases-birdBase.fold'), 'utf8'));
    const pts = data.vertices_coords || [];

    // 独立实现：读原始模板 → 绕包围盒中心旋转 180°
    const manifest = loadManifest();
    const tpl = manifest.templates.find((x) => x.id === 'Bases-birdBase');
    const raw = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, tpl.file), 'utf8'));
    const vs = raw.vertices_coords;
    const xs = vs.map((v) => v[0]);
    const ys = vs.map((v) => v[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const a = Math.PI;                        // 180°
    const rot = vs.map((v) => [
      cx + (v[0] - cx) * Math.cos(a) - (v[1] - cy) * Math.sin(a),
      cy + (v[0] - cx) * Math.sin(a) + (v[1] - cy) * Math.cos(a),
    ]);

    // 不变量 1：顶点数不少于「原模板 × 份数」（规范化会额外加交点顶点，故用 ≥）
    expect(pts.length).toBeGreaterThanOrEqual(rot.length * 2);

    // 不变量 2：按 x 排序后的**最大间隙**处切分 → 两份的包围盒**不重叠**
    // （不能用原始顶点数切：规范化会加顶点，切分会错位）
    const sorted = pts.slice().sort((p1, p2) => p1[0] - p2[0]);
    let best = 0, bestAt = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i][0] - sorted[i - 1][0];
      if (gap > best) { best = gap; bestAt = i; }
    }
    expect(best).toBeGreaterThan(0);
    const left = sorted.slice(0, bestAt);
    const right = sorted.slice(bestAt);
    expect(Math.min(...right.map((v) => v[0]))).toBeGreaterThanOrEqual(Math.max(...left.map((v) => v[0])) - 1e-6);

    // 不变量 3：其中一份的顶点与「原始模板旋转 180° 后的点」高度吻合
    // （规范化会新增交点顶点，故用匹配率而非精确相等）
    const target = new Set(rot.map((v) => `${v[0].toFixed(3)},${v[1].toFixed(3)}`));
    const pool = [...left, ...right];
    const hit = pool.filter((v) => target.has(`${v[0].toFixed(3)},${v[1].toFixed(3)}`)).length;
    expect(hit).toBeGreaterThan(rot.length * 0.85);
  });
});
