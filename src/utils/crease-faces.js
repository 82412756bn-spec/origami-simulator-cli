const { extractPlanarFaces } = require('./crease-pattern-normalizer');

function convexHullIndices(V) {
  if (V.length < 3) return V.map((_, i) => i);
  const idx = V.map((_, i) => i).sort((i, j) => (V[i][0] - V[j][0]) || (V[i][1] - V[j][1]));
  const cr = (o, a, b) => (V[a][0] - V[o][0]) * (V[b][1] - V[o][1]) - (V[a][1] - V[o][1]) * (V[b][0] - V[o][0]);
  const lo = []; for (const i of idx) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], i) <= 0) lo.pop(); lo.push(i); }
  const up = []; for (let k = idx.length - 1; k >= 0; k--) { const i = idx[k]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], i) <= 0) up.pop(); up.push(i); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function clipToHull(P, d, hull, V) {
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = V[hull[i]], b = V[hull[(i + 1) % hull.length]];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = ex * d[1] - ey * d[0], num = ex * (P[1] - a[1]) - ey * (P[0] - a[0]);
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) { if (t > t0) t0 = t; } else { if (t < t1) t1 = t; }
  }
  return t0 > t1 ? null : [t0, t1];
}

/**
 * mode:
 *  'plain'    = 直接用来源的边（纯半边）
 *  'extendAll'= 每条边都延长到纸边
 *  'hangOnly' = 只延长「悬挂边」（端点度为 1 且该端点不在凸包上）
 */
function build(foldData, mode) {
  const V = (foldData.vertices_coords || []).map(v => [v[0], v[1]]);
  const E = foldData.edges_vertices || [];
  if (V.length < 3 || E.length === 0) return { vertices: [], faces: [] };
  const hull = convexHullIndices(V);
  const onHull = new Set(hull);
  const deg = new Map(); V.forEach((_, i) => deg.set(i, 0));
  E.forEach(e => { if (!e || e.length < 2) return; for (const v of e) deg.set(v, (deg.get(v) || 0) + 1); });

  const outV = [], outE = [], vid = new Map();
  const key = p => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  const addV = p => { const k = key(p); if (vid.has(k)) return vid.get(k); outV.push([p[0], p[1], 0]); const i = outV.length - 1; vid.set(k, i); return i; };

  for (const e of E) {
    if (!e || e.length < 2) continue;
    const a = e[0], b = e[1];
    const pa = V[a], pb = V[b];
    let A = pa, B = pb;
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) continue;
    const dir = [dx / len, dy / len];
    const aHang = (deg.get(a) || 0) === 1 && !onHull.has(a);
    const bHang = (deg.get(b) || 0) === 1 && !onHull.has(b);
    // 延长方向（大副 2026-11-28 复核确认的 bug）：
    //   clipToHull(P, d) 返回 [t_enter, t_exit]，其中 t_enter < 0 < t_exit（P 在凸包内）。
    //   沿 d0 = -dir 参数化 P + t·d0 时，**-dir 那一侧的边界在 t = t_exit = c[1]**（>0），
    //   不是 t_enter。原来取 c[0]（负值）→ A 端被推向 **+dir**（纸内方向）→ 折痕根本没伸到纸边。
    if (mode === 'extendAll' || (mode === 'hangOnly' && aHang)) {
      const c = clipToHull(pa, [-dir[0], -dir[1]], hull, V);
      if (c) A = [pa[0] - dir[0] * c[1], pa[1] - dir[1] * c[1]];
    }
    if (mode === 'extendAll' || (mode === 'hangOnly' && bHang)) {
      const c = clipToHull(pb, dir, hull, V);
      if (c) B = [pb[0] + dir[0] * c[1], pb[1] + dir[1] * c[1]];
    }
    const i1 = addV(A), i2 = addV(B);
    if (i1 !== i2) outE.push([i1, i2]);
  }
  // 纸的外轮廓 —— **必须在折痕与纸边的交点处切分**。
  //
  // 少了这一步，平面图不连通（边界边没被折痕打断）→ 半边算法找不到闭合回路
  // → 只剩「整张纸一个面」（面积比 1.00 但根本没分开）。
  // 实测：切分前 birdBase 只有 1 个面、面积比 1.00；切分后才可能得到真正的划分。
  const cutOnEdge = hull.map(() => []);
  for (const e of E) {
    if (!e || e.length < 2) continue;
    const pa = V[e[0]], pb = V[e[1]];
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) continue;
    const dir = [dx / len, dy / len];
    const ends = [];
    const c1 = clipToHull(pa, [-dir[0], -dir[1]], hull, V);
    if (c1) ends.push([pa[0] - dir[0] * c1[0], pa[1] - dir[1] * c1[0]]);
    const c2 = clipToHull(pb, dir, hull, V);
    if (c2) ends.push([pb[0] + dir[0] * c2[1], pb[1] + dir[1] * c2[1]]);
    for (const ep of ends) {
      for (let i = 0; i < hull.length; i++) {
        const A = V[hull[i]], B = V[hull[(i + 1) % hull.length]];
        const ex = B[0] - A[0], ey = B[1] - A[1];
        const L2 = ex * ex + ey * ey;
        if (L2 < 1e-18) continue;
        const t = ((ep[0] - A[0]) * ex + (ep[1] - A[1]) * ey) / L2;
        if (t < -1e-9 || t > 1 + 1e-9) continue;
        const qx = A[0] + ex * t, qy = A[1] + ey * t;
        if (Math.hypot(qx - ep[0], qy - ep[1]) > 1e-6) continue;
        cutOnEdge[i].push({ t, p: [qx, qy] });
        break;
      }
    }
  }
  for (let i = 0; i < hull.length; i++) {
    const A = V[hull[i]], B = V[hull[(i + 1) % hull.length]];
    const pts = [{ t: 0, p: A }, ...cutOnEdge[i].sort((x, y) => x.t - y.t), { t: 1, p: B }];
    for (let k = 0; k + 1 < pts.length; k++) {
      const i1 = addV(pts[k].p), i2 = addV(pts[k + 1].p);
      if (i1 !== i2) outE.push([i1, i2]);
    }
  }
  const sub = { vertices_coords: outV, edges_vertices: outE, edges_assignment: outE.map(() => 'B') };
  return { vertices: outV, faces: extractPlanarFaces(sub) || [] };
}


/**
 * ⚠️ **本模块已关闭（v2.55.0，Kun 判断 ①「面的完整算法 → 不做」）** —— 仅作诊断工具。
 *
 * 关闭理由（三问）：
 *   1. **谁在疼？** 没有任何下游被证实使用 `faces`（折叠模拟用的是 `edges`）→ 痛点未证实
 *   2. **代价不对称？** 完整算法的第①步（打断 X 交叉）实测会**破坏 `balanceMountainValley`**
 *      （birdBase 模板的 Maekawa 全过 → 12/15）
 *   3. **前提已被否**：撤回条件第 3 条预设「X 交叉是主因」，而实测**平交叉只占 3%**
 *      → 继续做 = 追一个已被否掉的假设
 *
 * 生产路径用**纯半边**（不重叠、覆盖 57–91%），CLI 在覆盖率 < 90% 时明示缺口。
 * 将来若有人真报「下游模拟面错位」，再开；那时该问的是「faces 该不该有」。
 *
 * ────────────────────────────────────────────────────────────────────
 * 折痕图的「面」= **把每条折痕延长到纸边**后，平面直线图在纸内的区域。
 *
 * 为什么必须延长：折痕在纸上是连续的 —— 一条终止于纸内部的折痕在真实折叠里会继续延伸
 * （折纸 CAD 的标准做法）。不延长的后果（纯半边算法）：悬挂边不产生面边界 → **漏面**。
 *
 * 正确性判据（2026-11-28 实测，四个真实作品）：**重叠 = 0 且 面积和/纸面积 ≈ 1**
 *
 *   | 口径 | birdBase | flat_crane | miura-ori | squaretwist |
 *   |---|---|---|---|---|
 *   | 来源文件 | 16/9/5.66 | 118/20/15.46 | 232/20/14.26 | 193/20/8.91 |
 *   | 纯半边 | 8/0/0.57 | 70/0/0.91 | 132/0/0.85 | 154/0/0.78 |
 *   | **全延长** | **36/0/1.00** | **375/0/1.00** | **975/0/1.00** | **2466/0/1.00** |
 *
 *   → 来源文件**本身重叠**（面面积和是纸的 5.66–15.46 倍）→ **官方不是 ground truth**；
 *     纯半边漏面（覆盖 57–91%）；**只有全延长同时满足「重叠 0」与「面积比 1」**。
 */
function extractFacesByCreaseExtension(foldData, options = {}) {
  const b = build(foldData, options.onlyHanging === true ? 'hangOnly' : 'extendAll');
  return { faces: b.faces, vertices: b.vertices,
           method: options.onlyHanging ? 'crease-extension (hanging only)' : 'crease-extension (all)' };
}

module.exports = { extractFacesByCreaseExtension, convexHullIndices, clipToHull };
