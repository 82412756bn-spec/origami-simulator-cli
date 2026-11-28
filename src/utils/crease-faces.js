/**
 * 折痕图的面计算（折痕**延长**法）
 * =================================
 *
 * 为什么需要
 * ----------
 * 折痕图的边大量是**悬挂边**（折痕终止于纸内部），例如真实作品 birdBase 的 24 条边
 * **全部**是悬挂的 → 纯半边算法只能闭合部分面（实测：文件里 16 面，重算只有 8 面）。
 *
 * 物理上正确的算法
 * ----------------
 * 折痕在纸上**是连续的**：一条终止于纸内部的折痕，在真实折叠里会继续延伸
 * （直到纸边或与其他折痕相交）→ 折痕图的「面」= 把每条折痕**延长到纸边**后，
 * 所得平面直线图在纸内的区域。
 *
 * 这是折纸 CAD 的标准做法（否则面数永远算不对）。
 *
 * 算法
 * ----
 * 1. 取每条折痕的**支撑直线**（两点式）
 * 2. 求所有直线两两交点（落在纸的范围内才保留）
 * 3. 用交点把直线在纸范围内切分成线段
 * 4. 加入纸的外轮廓边 → 平面图 → 半边算法求面
 */
const { extractPlanarFaces } = require('./crease-pattern-normalizer');

function convexHullIndices(V) {
  if (V.length < 3) return V.map((_, i) => i);
  const idx = V.map((_, i) => i).sort((i, j) => (V[i][0] - V[j][0]) || (V[i][1] - V[j][1]));
  const cross = (o, a, b) =>
    (V[a][0] - V[o][0]) * (V[b][1] - V[o][1]) - (V[a][1] - V[o][1]) * (V[b][0] - V[o][0]);
  const lower = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** 点是否在凸包内（含边界） */
function pointInHull(pt, hull, V) {
  if (hull.length < 3) return true;
  for (let i = 0; i < hull.length; i++) {
    const a = V[hull[i]], b = V[hull[(i + 1) % hull.length]];
    if ((b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]) < -1e-9) return false;
  }
  return true;
}

/** 直线与凸包的参数区间 [t0, t1]（直线 = P0 + t·dir） */
function clipLineToHull(P0, dir, hull, V) {
  if (hull.length < 3) return null;
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = V[hull[i]], b = V[hull[(i + 1) % hull.length]];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    // 半平面：cross(edge, P - a) >= 0
    const denom = ex * dir[1] - ey * dir[0];
    const num = ex * (P0[1] - a[1]) - ey * (P0[0] - a[0]);
    if (Math.abs(denom) < 1e-12) {
      if (num < 0) return null;             // 平行且在外侧
      continue;
    }
    const t = -num / denom;
    if (denom > 0) { if (t > t0) t0 = t; }
    else { if (t < t1) t1 = t; }
  }
  if (t0 > t1) return null;
  return [t0, t1];
}

/**
 * 计算折痕图的面（折痕延长法）。
 * @returns {{faces:Array<number[]>, vertices:Array, method:string}}
 */
function extractFacesByCreaseExtension(foldData, options = {}) {
  const V = (foldData.vertices_coords || []).map((v) => [v[0], v[1]]);
  const E = foldData.edges_vertices || [];
  if (V.length < 3 || E.length === 0) {
    return { faces: [], vertices: [], method: 'none' };
  }

  const hull = convexHullIndices(V);
  const hullPts = hull.map((i) => V[i]);

  // 1. 折痕的支撑直线
  const lines = [];
  for (const e of E) {
    if (!e || e.length < 2) continue;
    const a = V[e[0]], b = V[e[1]];
    if (!a || !b) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) continue;
    lines.push({ p: a, d: [dx, dy] });
  }
  if (!lines.length) return { faces: [], vertices: [], method: 'none' };

  // 2. 直线两两求交（只保留落在纸内的）
  const cuts = lines.map(() => []);   // 每条直线上的参数 t 列表
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const L1 = lines[i], L2 = lines[j];
      const den = L1.d[0] * L2.d[1] - L1.d[1] * L2.d[0];
      if (Math.abs(den) < 1e-12) continue;                 // 平行
      const ex = L2.p[0] - L1.p[0], ey = L2.p[1] - L1.p[1];
      const t1 = (ex * L2.d[1] - ey * L2.d[0]) / den;
      const t2 = (ex * L1.d[1] - ey * L1.d[0]) / den;
      const pt = [L1.p[0] + L1.d[0] * t1, L1.p[1] + L1.d[1] * t1];
      if (!pointInHull(pt, hull, V)) continue;
      cuts[i].push(t1);
      cuts[j].push(t2);
    }
  }

  // 3. 每条直线在纸内切分成线段
  const outV = [];
  const outE = [];
  const vid = new Map();
  const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const addVert = (p) => {
    const k = key(p);
    if (vid.has(k)) return vid.get(k);
    outV.push([p[0], p[1], 0]);
    const i = outV.length - 1;
    vid.set(k, i);
    return i;
  };

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const clip = clipLineToHull(L.p, L.d, hull, V);
    if (!clip) continue;
    const ts = cuts[i].filter((t) => t >= clip[0] - 1e-9 && t <= clip[1] + 1e-9);
    ts.push(clip[0], clip[1]);
    ts.sort((a, b) => a - b);
    // 去重
    const uniq = [];
    for (const t of ts) if (!uniq.length || Math.abs(t - uniq[uniq.length - 1]) > 1e-9) uniq.push(t);
    for (let k = 0; k + 1 < uniq.length; k++) {
      const t1 = uniq[k], t2 = uniq[k + 1];
      if (t2 - t1 < 1e-9) continue;
      const p1 = [L.p[0] + L.d[0] * t1, L.p[1] + L.d[1] * t1];
      const p2 = [L.p[0] + L.d[0] * t2, L.p[1] + L.d[1] * t2];
      const i1 = addVert(p1), i2 = addVert(p2);
      if (i1 !== i2) outE.push([i1, i2]);
    }
  }

  // 4. 加入纸的外轮廓
  for (let i = 0; i < hull.length; i++) {
    const a = hullPts[i], b = hullPts[(i + 1) % hull.length];
    const i1 = addVert(a), i2 = addVert(b);
    if (i1 !== i2) outE.push([i1, i2]);
  }

  // 5. 半边算法求面
  const sub = { vertices_coords: outV, edges_vertices: outE, edges_assignment: outE.map(() => 'B') };
  const faces = extractPlanarFaces(sub) || [];

  return { faces, vertices: outV, method: 'crease-extension (half-edge)' };
}

module.exports = { extractFacesByCreaseExtension, convexHullIndices, pointInHull };
