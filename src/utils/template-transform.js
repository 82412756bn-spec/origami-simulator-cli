/**
 * 模板变换器（2026-11-26）
 *
 * 用途：把 `templates/` 里的真实折痕图（模板）按参数做**对称变换**，
 * 得到「按我的想法生成」的新折痕图。
 *
 * 为什么是对称变换：对称变换**保持折平性** —— 不改变每个内部顶点的 M/V 计数，
 * 也不改变折痕角的交替和（Kawasaki）与 M/V 差（Maekawa）。
 * 实测（真实 birdBase / flat_crane）：1/2/3/4/6 份旋转阵列后判定全部全过。
 *
 * 模板来源：origamisimulator.org（MIT License，见 templates/LICENSE）。
 */
const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'templates');
const MANIFEST = path.join(TEMPLATE_DIR, 'manifest.json');

/** 读模板清单 */
function loadManifest(dir = TEMPLATE_DIR) {
  const p = path.join(dir, 'manifest.json');
  if (!fs.existsSync(p)) {
    throw new Error(`模板清单不存在: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * 按 id 找模板（不区分大小写；唯一命中才返回）。
 * @returns {{template:Object, candidates:string[]}}
 */
function findTemplate(id, dir = TEMPLATE_DIR) {
  const manifest = loadManifest(dir);
  const list = manifest.templates || [];
  const needle = String(id).toLowerCase();
  const exact = list.find((t) => t.id.toLowerCase() === needle);
  if (exact) return { template: exact, candidates: [] };
  const partial = list.filter((t) => t.id.toLowerCase().includes(needle));
  if (partial.length === 1) return { template: partial[0], candidates: [] };
  return { template: null, candidates: partial.map((t) => t.id) };
}

/**
 * 读模板的 foldData 并做**规范化**（打断 → 平衡 M/V → 去重）。
 *
 * 为什么必须规范化：模板来自 SVG→FOLD 转换，而 SVG 在折痕交汇处**没有顶点标记**
 * → 转换出的 FOLD 在那里是两条独立边相交（proper crossing），几何不完整。
 * 打断折痕把交点变成共享顶点（标准折痕图表示），再重新平衡 M/V。
 *
 * @returns {{foldData:Object, report:Object}}
 */
function loadTemplateFold(template, dir = TEMPLATE_DIR) {
  const p = path.join(dir, template.file);
  if (!fs.existsSync(p)) {
    throw new Error(`模板文件不存在: ${template.file}`);
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));

  const { splitCreasesAtCrossings } = require('./crease-pattern-2d');
  const { balanceMountainValley, dedupeVertices } = require('./crease-pattern-normalizer');

  const split = splitCreasesAtCrossings(raw);
  let foldData = split.foldData || raw;

  let balanced = null;
  try {
    const b = balanceMountainValley(foldData, {});
    balanced = b.foldData || b;
    if (balanced && Array.isArray(balanced.vertices_coords)) foldData = balanced;
  } catch (e) {
    balanced = null;   // 平衡失败不阻断（判定会如实报出）
  }

  const deduped = dedupeVertices(foldData);

  return {
    foldData: deduped,
    report: {
      split: split.report || null,
      balanced: Boolean(balanced),
      dedupedVertices: (foldData.vertices_coords || []).length - (deduped.vertices_coords || []).length,
    },
  };
}

/** 包围盒 */
function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of points) {
    if (v[0] < minX) minX = v[0];
    if (v[1] < minY) minY = v[1];
    if (v[0] > maxX) maxX = v[0];
    if (v[1] > maxY) maxY = v[1];
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/**
 * 对称变换：复制 N 份，第 i 份绕模板自身包围盒中心旋转 i*rotate 度，
 * 整体缩放 scale，沿 +x 依次平移（模板宽度 × scale）避免重叠。
 *
 * 折痕类型（edges_assignment）、折叠角（edges_foldAngle）、thickness **原样保留**。
 *
 * @param {Object} foldData 模板的 foldData
 * @param {{copies?:number, rotate?:number, scale?:number}} opts
 * @returns {Object} 变换后的 foldData
 */
function transformTemplate(foldData, { copies = 1, rotate = 0, scale = 1, gap = null } = {}) {
  const baseV = foldData.vertices_coords || [];
  const baseE = foldData.edges_vertices || [];
  const baseA = foldData.edges_assignment || [];
  const baseF = foldData.edges_foldAngle || [];
  const box = bbox(baseV);
  // 份与份之间留一点间距（默认 2% 宽度）：贴边时两条折痕会共享坐标点，
  // 判定器可能把它们当成「非顶点交叉」。
  const gapSize = gap === null ? Math.max((box.width || 1) * scale * 0.02, 1e-6) : gap;

  const rad = (d) => (d * Math.PI) / 180;
  const allV = [], allE = [], allA = [], allF = [];

  // 先各自旋转，再按**旋转后的实际包围盒**依次排开 —— 否则相邻份会重叠，
  // 表现为「2D 交叉」判据报警（旋转 120° 的菱形轮廓比原包围盒宽）。
  const parts = [];
  for (let c = 0; c < copies; c++) {
    const a = rad(rotate * c);
    const ca = Math.cos(a), sa = Math.sin(a);
    const pts = baseV.map((v) => {
      const dx = (v[0] - box.cx) * scale;
      const dy = (v[1] - box.cy) * scale;
      return [box.cx + dx * ca - dy * sa, box.cy + dx * sa + dy * ca, (v[2] || 0) * scale];
    });
    parts.push(pts);
  }

  let cursorX = null;
  for (const pts of parts) {
    const b = bbox(pts);
    const shift = cursorX === null ? 0 : cursorX - b.minX;
    const off = allV.length;
    for (const v of pts) {
      allV.push([v[0] + shift, v[1], v[2]]);
    }
    for (let i = 0; i < baseE.length; i++) {
      const e = baseE[i];
      if (!e || e.length < 2) continue;
      allE.push([e[0] + off, e[1] + off]);
      allA.push(baseA[i] !== undefined ? baseA[i] : 'B');
      allF.push(baseF[i] !== undefined ? baseF[i] : 0);
    }
    // 推进游标必须用 **shift 之后** 的 maxX —— 之前误用了旧 cursorX，导致相邻两份重叠
    cursorX = b.maxX + shift + gapSize;
  }

  const out = Object.assign({}, foldData, {
    vertices_coords: allV,
    edges_vertices: allE,
    edges_assignment: allA,
    edges_foldAngle: allF,
    faces_vertices: [],          // 面片由 computeFaces 重算；判定不依赖它
  });
  if (typeof foldData.thickness === 'number') out.thickness = foldData.thickness;
  out.metadata = Object.assign({}, foldData.metadata, {
    generated_from: 'template',
    template_transform: { copies, rotate, scale, gap: gapSize },
  });
  return out;
}

module.exports = { TEMPLATE_DIR, MANIFEST, loadManifest, findTemplate, loadTemplateFold, transformTemplate, bbox };
