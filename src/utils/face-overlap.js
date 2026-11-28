/**
 * 面片（faces）重叠检测
 * ====================
 *
 * 为什么需要
 * ----------
 * `transformTemplate` 之前把 `faces_vertices` 硬编码清空，v2.51.0 改成按份偏移正确重建。
 * 但重建出来的面**可能是重叠的** —— 下游折叠模拟假定面片是纸的**划分**（互不重叠），
 * 面片重叠会让模拟结果失真（层序判定、厚度计算都依赖它）。
 *
 * 检什么
 * ------
 * 1. **面片两两重叠**：任意两个面有正面积交集 → 重叠
 *    用 Sutherland–Hodgman 多边形裁剪算交集面积（比布尔运算简单，够用）
 * 2. **面积和 > 纸面面积**：Σ面面积显著超过纸的凸包面积 → 必然有重叠或重复计数
 *
 * 面数可能上千 → O(n²) 不可接受 → 用**包围盒预筛** + 只对候选对做裁剪。
 */

function bboxOf(face, V) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const vi of face) {
    const p = V[vi];
    if (!p) continue;
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

function boxesOverlap(a, b, eps = 1e-9) {
  return !(a.maxX <= b.minX + eps || b.maxX <= a.minX + eps
    || a.maxY <= b.minY + eps || b.maxY <= a.minY + eps);
}

/** Sutherland–Hodgman：把 subject 多边形裁剪到 clip 多边形内 */
function clipPolygon(subject, clip) {
  let output = subject.slice();
  const n = clip.length;
  for (let i = 0; i < n && output.length; i++) {
    const a = clip[i], b = clip[(i + 1) % n];
    const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) {
          const ip = lineIntersect(prev, cur, a, b);
          if (ip) output.push(ip);
        }
        output.push(cur);
      } else if (prevIn) {
        const ip = lineIntersect(prev, cur, a, b);
        if (ip) output.push(ip);
      }
    }
  }
  return output;
}

function lineIntersect(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** 凸包（Andrew monotone chain） */
function convexHull(points) {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/**
 * 检测 FOLD 的面片重叠。
 * @returns {{faces:number, overlaps:Array, sumArea:number, hullArea:number, areaRatio:number, ok:boolean}}
 */
function detectFaceOverlaps(foldData, options = {}) {
  const V = foldData.vertices_coords || [];
  const faces = (foldData.faces_vertices || []).filter((f) => f && f.length >= 3);
  const minOverlapArea = options.minOverlapArea || 1e-9;
  const maxPairs = options.maxPairs || 200000;

  const polys = [];
  const boxes = [];
  let sumArea = 0;
  for (const f of faces) {
    const poly = f.map((vi) => V[vi]).filter(Boolean);
    if (poly.length < 3) continue;
    polys.push(poly);
    boxes.push(bboxOf(f, V));
    sumArea += polyArea(poly);
  }

  // 面积和 vs 凸包面积
  const hull = convexHull(V.map((p) => [p[0], p[1]]));
  const hullArea = hull.length >= 3 ? polyArea(hull) : 0;

  // 两两重叠（bbox 预筛）
  const overlaps = [];
  let pairs = 0;
  outer:
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (++pairs > maxPairs) break outer;
      if (!boxesOverlap(boxes[i], boxes[j])) continue;
      const inter = clipPolygon(polys[i], polys[j]);
      const area = inter.length >= 3 ? polyArea(inter) : 0;
      if (area > minOverlapArea) {
        overlaps.push({ a: i, b: j, area });
        if (overlaps.length >= 20) break outer;
      }
    }
  }

  const areaRatio = hullArea > 0 ? sumArea / hullArea : 0;

  // **简单多边形**检查：面不能自交（否则面积与拓扑都不可信）
  let nonSimple = 0;
  for (const poly of polys) {
    if (!isSimplePolygon(poly)) nonSimple++;
  }

  // **边集包含关系**：面的每条边都必须是折痕图里存在的边（否则面是凭空造的）
  // 只有在**提供了 edges_vertices** 时才能判「孤儿边」——
  // 否则（只给 faces 的调用方）无从判断面的边是否真实存在。
  const rawEdges = foldData.edges_vertices || [];
  let orphanEdges = 0;
  if (rawEdges.length) {
    const edgeSet = new Set(rawEdges.map(
      (e) => `${Math.min(e[0], e[1])},${Math.max(e[0], e[1])}`));
    for (const f of (foldData.faces_vertices || [])) {
      if (!f || f.length < 3) continue;
      for (let i = 0; i < f.length; i++) {
        const a = f[i], b = f[(i + 1) % f.length];
        if (!edgeSet.has(`${Math.min(a, b)},${Math.max(a, b)}`)) { orphanEdges++; break; }
      }
    }
  }

  return {
    faces: polys.length,
    overlaps,
    sumArea,
    hullArea,
    areaRatio,
    nonSimple,
    orphanEdges,
    ok: overlaps.length === 0 && nonSimple === 0 && orphanEdges === 0
      && (hullArea === 0 || areaRatio <= 1.0001),
  };
}


/** 简单多边形检查：相邻边不自交（O(n²)，面数不大时可接受） */
function isSimplePolygon(poly) {
  const n = poly.length;
  if (n < 3) return false;
  // 重复顶点
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]) < 1e-12) return false;
    }
  }
  // 非相邻边相交
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (i === 0 && j === n - 1) || Math.abs(i - j) === 1) continue;
      if (segmentsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const onSeg = (a, b, c) => Math.abs(d(a, b, c)) < 1e-12
    && c[0] >= Math.min(a[0], b[0]) - 1e-12 && c[0] <= Math.max(a[0], b[0]) + 1e-12
    && c[1] >= Math.min(a[1], b[1]) - 1e-12 && c[1] <= Math.max(a[1], b[1]) + 1e-12;
  return onSeg(p3, p4, p1) || onSeg(p3, p4, p2) || onSeg(p1, p2, p3) || onSeg(p1, p2, p4);
}

module.exports = { detectFaceOverlaps, polyArea, convexHull, clipPolygon, isSimplePolygon };
