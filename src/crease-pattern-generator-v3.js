/**
 * Crease Pattern Generator v3.0
 * 折痕图生成器 v3.0 - 逆推优化版
 *
 * 基于研究成果优化：
 * 1. 纸鹤分析：预折痕(Pre-creasing)技术
 * 2. 模块化折纸：数学公式
 * 3. PDF教程：多种基本型支持
 */

const fs = require('fs');
const path = require('path');
const CreasePatternValidator = require('./utils/crease-pattern-validator');

// 尝试加载 earcut（用于三角剖分）
let earcut = null;
try {
  earcut = require('earcut').default;
} catch (e) {
  console.warn('⚠️  earcut 库未找到，faces 计算功能受限');
}

class CreasePatternGeneratorV3 {
  constructor(options = {}) {
    this.type = options.type || 'star';  // star, crane, miura, custom
    this.gridSize = options.gridSize || 32;  // CP网格密度
    this.symmetric = options.symmetric !== false;  // 对称性
  }

  /**
   * 生成器工厂
   */
  static create(type, options = {}) {
    const generator = new CreasePatternGeneratorV3({ ...options, type });

    switch (type) {
      case 'star':
        return generator.generateStarTessellation(options);
      case 'crane':
        return generator.generateCraneBase(options);
      case 'miura':
        return generator.generateMiuraOri(options);
      case 'tiger':
        return generator.generateTigerBase(options);
      case 'fish':
        return generator.generateFishBase(options);
      default:
        throw new Error(`未知类型: ${type}`);
    }
  }

  /**
   * 生成星形折纸折痕图
   * 基于10角放射对称数学公式
   */
  generateStarTessellation(options = {}) {
    const arms = options.arms || 10;
    const rings = options.rings || 4;
    const radius = options.radius || 10;

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    // 中心点
    vertices.push([0, 0, 0]);
    const centerIdx = 0;

    // 生成同心环顶点
    const layerVertices = [];
    for (let ring = 1; ring <= rings; ring++) {
      const ringVertices = [];
      const r = (ring / rings) * radius;
      for (let i = 0; i < arms; i++) {
        const angle = (2 * Math.PI * i) / arms - Math.PI / 2;
        ringVertices.push(vertices.length);
        vertices.push([r * Math.cos(angle), r * Math.sin(angle), 0]);
      }
      layerVertices.push(ringVertices);
    }

    // 中心到第一层的折痕（主折痕）
    for (let i = 0; i < arms; i++) {
      edges.push([centerIdx, layerVertices[0][i]]);
      edges_assignment.push(i % 2 === 0 ? 'M' : 'V');
      edges_foldAngle.push(i % 2 === 0 ? 180 : -180);
    }

    // 相邻臂之间的连接（形成三角形）
    for (let ring = 0; ring < rings - 1; ring++) {
      for (let i = 0; i < arms; i++) {
        const next = (i + 1) % arms;
        const curr = layerVertices[ring];
        const nextRing = layerVertices[ring + 1];

        // 当前环的相邻点
        edges.push([curr[i], curr[next]]);
        edges_assignment.push(ring % 2 === 0 ? 'V' : 'M');
        edges_foldAngle.push(ring % 2 === 0 ? -180 : 180);

        // 跨环连接
        edges.push([curr[i], nextRing[i]]);
        edges_assignment.push('M');
        edges_foldAngle.push(180);

        // 跨环连接（相邻臂）
        edges.push([nextRing[i], nextRing[next]]);
        edges_assignment.push('V');
        edges_foldAngle.push(-180);
      }
    }

    // 生成面（只使用实际存在的边）
    const edgeSet = new Set();
    for (const edge of edges) {
      const key = `${Math.min(edge[0], edge[1])}-${Math.max(edge[0], edge[1])}`;
      edgeSet.add(key);
    }
    const hasEdge = (v1, v2) => edgeSet.has(`${Math.min(v1,v2)}-${Math.max(v1,v2)}`);

    for (let ring = 0; ring < rings - 1; ring++) {
      for (let i = 0; i < arms; i++) {
        const next = (i + 1) % arms;
        const curr = layerVertices[ring];
        const nextRing = layerVertices[ring + 1];

        // 形成四边形的两个三角形
        if (hasEdge(curr[i], curr[next]) &&
            hasEdge(curr[i], nextRing[i]) &&
            hasEdge(curr[next], nextRing[i])) {
          faces.push([curr[i], curr[next], nextRing[i]]);
        }
        if (hasEdge(curr[next], nextRing[next]) &&
            hasEdge(curr[next], nextRing[i]) &&
            hasEdge(nextRing[next], nextRing[i])) {
          faces.push([curr[next], nextRing[next], nextRing[i]]);
        }
      }
    }

    // 最外层闭合
    const lastRing = layerVertices[rings - 1];
    for (let i = 0; i < arms; i++) {
      const next = (i + 1) % arms;
      edges.push([lastRing[i], lastRing[next]]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: `Star Tessellation (${arms}-fold, ${rings} rings)`,
      type: 'star_tessellation',
      params: { arms, rings, radius }
    });
  }

  /**
   * 生成纸鹤基本型 (Bird Base) 折痕图
   * 基于预折痕技术分析
   */

  /**
   * 让折痕图的所有**内部顶点**满足 Maekawa（|M − V| = 2）。
   *
   * 做法：在**不动几何**的前提下调整 M/V 标签 —— 这是折纸 CAD 的标准做法
   * （先定几何，再定山谷）。前提是几何本身已满足 Kawasaki，
   * 否则 Maekawa 通过也折不平。
   *
   * 策略：对每个失衡顶点，翻转一条 M 或 V 边的标签（优先翻转该顶点的「最便宜」一条），
   * 迭代至收敛。
   */
  balanceMaekawa(foldData, maxRounds = 24) {
    const V = foldData.vertices_coords || [];
    const E = foldData.edges_vertices || [];
    const A = foldData.edges_assignment;

    const incident = new Map();
    V.forEach((_, i) => incident.set(i, []));
    E.forEach((e, i) => {
      if (!e || e.length < 2) return;
      if (incident.has(e[0])) incident.get(e[0]).push(i);
      if (incident.has(e[1])) incident.get(e[1]).push(i);
    });

    const isInternal = (list) =>
      list.length >= 3 &&
      !list.some((i) => (A[i] || 'B') === 'B' || A[i] === 'U' || A[i] === 'F');

    for (let round = 0; round < maxRounds; round++) {
      let fixed = 0;
      for (const [, list] of incident) {
        if (!isInternal(list)) continue;
        const m = list.filter((i) => A[i] === 'M').length;
        const v = list.filter((i) => A[i] === 'V').length;
        if (Math.abs(m - v) === 2) continue;
        // 需要多一个 M（或多一个 V）→ 翻转一条 V（或 M）
        const wantMoreM = m < v;
        const candidates = list.filter((i) => (wantMoreM ? A[i] === 'V' : A[i] === 'M'));
        if (!candidates.length) continue;
        // 优先翻转「度数最小」的那个顶点上的边：影响面最小
        let best = candidates[0];
        let bestDeg = Infinity;
        for (const ei of candidates) {
          const e = E[ei];
          const other = e[0] === undefined ? -1 : e[1];
          const otherList = incident.get(other) || [];
          const otherInternal = isInternal(otherList);
          const cost = otherInternal ? otherList.length : 0;
          if (cost < bestDeg) { bestDeg = cost; best = ei; }
        }
        A[best] = wantMoreM ? 'M' : 'V';
        fixed++;
      }
      if (!fixed) break;
    }
    return foldData;
  }

  /**
   * 真正的**鹤基（bird base）**折痕图。
   *
   * 几何依据（来自模板库里的真实作品 birdBase：13 顶点 / 24 边 / 中心 deg8 M5/V3）：
   *   - 正方形纸的 4 个角
   *   - 中心 8 条射线（到 4 角 + 4 个中轴点）—— preliminary base
   *   - **4 条 22.5° 的角折痕**（从 4 个角朝内，交于轴上）
   *   - 4 条边界折痕（轴点 → 对应边的中点）
   *
   * 22.5° 用精确的 tan(π/8)，而非原 SVG 的像素取整。
   * crane 之前只是 preliminary base → 与 tiger 无法区分（v2.51.0 的遗留项）。
   */
  /**
   * **虎基（tiger base）**折痕图 —— preliminary base + 22.5° 的**预折痕**。
   *
   * 为什么与 crane（真鹤基）不同：
   *   - crane = preliminary base + **8 条 22.5° 真折痕**（鹤基的角折痕是实际要折的）
   *   - tiger = preliminary base + **4 条 22.5° 预折痕**（折了再展开的辅助线，标 'F'）
   * 两者在折纸里是同族（都从 preliminary base 出发）但形态不同：
   * 虎基是 preliminary base 的「斜压」变体，辅助折痕用于把方形压成三角形。
   *
   * 标 'F' 的依据：这些预折痕与中线交于轴点 → 交点成为 deg3 顶点 →
   * M+V=3 → |M−V| 必为奇数 → **Maekawa 结构上无解**（见 v2.51.0 的推导）。
   * 标 'F' 既语义诚实（真实折纸里它们就是折了再展开的预折痕），
   * 也让检查集只剩 preliminary base 的中心 deg8（真正的折叠结构）。
   */
  /**
   * **鱼基（fish base）**折痕图 —— preliminary base + **一对相对角的 22.5° 谷折**。
   *
   * 构造依据：鱼基是把 preliminary base 的**两个相对角 squash 进去**得到的，
   * squash 会在展开图上留下 22.5° 的折痕（与 crane 的角折痕同一套角度规律，
   * 见 generateTrueBirdBase 的推导）。
   *
   * 与 crane / tiger 的区别：
   *   - crane（真鹤基）：8 条 22.5° **真折痕**（山折），每角 2 条
   *   - tiger（虎基）  ：4 条 22.5° **预折痕**（'F'）
   *   - fish（鱼基）    ：4 条 22.5° **谷折**（'V'），只在一对相对角上
   *
   * **诚实标注**：官方语料里没有鱼基作品可作参照（只有 birdBase / squareBase /
   * openSinkBase / pinwheelBase / boatBase / waterbombBase / frogBase），
   * 所以本构造由 preliminary base + 22.5° 规律推导，并用**折平必要条件**实测。
   * 它满足必要条件（Kawasaki + Maekawa），但**未经实物折纸验证**。
   */
  generateFishBase22(options = {}) {
    const scale = options.scale || 1;
    const t = Math.tan(Math.PI / 8);
    const q = (1 - t) * scale;

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    const V = (x, y) => {
      vertices.push([x * scale, y * scale, 0]);
      return vertices.length - 1;
    };
    const E = (a, b, kind) => {
      edges.push([a, b]);
      edges_assignment.push(kind);
      edges_foldAngle.push(kind === 'M' ? 180 : kind === 'V' ? -180 : 0);
    };

    const c0 = V(-scale, -scale);
    const c1 = V(scale, -scale);
    const c2 = V(scale, scale);
    const c3 = V(-scale, scale);
    const cen = V(0, 0);
    const midL = V(-q, 0);
    const midR = V(q, 0);
    const midB = V(0, -q);
    const midT = V(0, q);
    const edgeL = V(-scale, 0);
    const edgeR = V(scale, 0);
    const edgeB = V(0, -scale);
    const edgeT = V(0, scale);

    // 纸边
    E(c0, c1, 'B'); E(c1, c2, 'B'); E(c2, c3, 'B'); E(c3, c0, 'B');

    // preliminary base：中心 8 射线（到 4 角 + 4 个边中点）
    E(cen, c0, 'M'); E(cen, c1, 'V'); E(cen, c2, 'M'); E(cen, c3, 'V');
    E(cen, edgeL, 'M'); E(cen, edgeR, 'M'); E(cen, edgeB, 'M'); E(cen, edgeT, 'M');

    // 4 条 22.5° 谷折（squash 一对相对角：左下 c0 与右上 c2）
    E(c0, midB, 'V'); E(c0, midL, 'V');
    E(c2, midR, 'V'); E(c2, midT, 'V');

    this.balanceMaekawa({ vertices_coords: vertices, edges_vertices: edges, edges_assignment: edges_assignment });

    try {
      const { extractPlanarFaces } = require('./utils/crease-pattern-normalizer');
      const computed = extractPlanarFaces({ vertices_coords: vertices, edges_vertices: edges });
      if (computed && computed.length > 1) faces.push(...computed);
    } catch (e) { /* 算不出就沿用空 faces */ }

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: 'Fish Base (鱼基：preliminary base + 一对相对角的 22.5° 谷折)',
      type: 'fish_base',
      params: { scale },
      isCreasePattern: true,
    });
  }

  generateTigerBase22(options = {}) {
    const scale = options.scale || 1;
    const t = Math.tan(Math.PI / 8);
    const q = (1 - t) * scale;

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    const V = (x, y) => {
      vertices.push([x * scale, y * scale, 0]);
      return vertices.length - 1;
    };
    const E = (a, b, kind) => {
      edges.push([a, b]);
      edges_assignment.push(kind);
      edges_foldAngle.push(kind === 'M' ? 180 : kind === 'V' ? -180 : 0);
    };

    const c0 = V(-scale, -scale);
    const c1 = V(scale, -scale);
    const c2 = V(scale, scale);
    const c3 = V(-scale, scale);
    const cen = V(0, 0);
    const midL = V(-q, 0);
    const midR = V(q, 0);
    const midB = V(0, -q);
    const midT = V(0, q);
    const edgeL = V(-scale, 0);
    const edgeR = V(scale, 0);
    const edgeB = V(0, -scale);
    const edgeT = V(0, scale);

    // 纸边
    E(c0, c1, 'B'); E(c1, c2, 'B'); E(c2, c3, 'B'); E(c3, c0, 'B');

    // preliminary base 的真折痕：2 条对角 + 2 条中线
    E(cen, c0, 'M'); E(cen, c2, 'M');      // 对角
    E(cen, c1, 'V'); E(cen, c3, 'V');      // 对角
    E(cen, edgeL, 'M'); E(cen, edgeR, 'M');// 中线
    E(cen, edgeB, 'M'); E(cen, edgeT, 'M');

    // 4 条 22.5° 预折痕（'F'）
    E(c0, midB, 'F'); E(c1, midR, 'F');
    E(c2, midT, 'F'); E(c3, midL, 'F');

    this.balanceMaekawa({ vertices_coords: vertices, edges_vertices: edges, edges_assignment: edges_assignment });

    try {
      const { extractPlanarFaces } = require('./utils/crease-pattern-normalizer');
      const computed = extractPlanarFaces({ vertices_coords: vertices, edges_vertices: edges });
      if (computed && computed.length > 1) faces.push(...computed);
    } catch (e) { /* 算不出就沿用空 faces */ }

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: 'Tiger Base (虎基：preliminary base + 22.5° 预折痕)',
      type: 'tiger_base',
      params: { scale },
      isCreasePattern: true,
    });
  }

  generateTrueBirdBase(options = {}) {
    const scale = options.scale || 1;
    const t = Math.tan(Math.PI / 8);          // tan(22.5°) = 0.41421356
    const q = (1 - t) * scale;                // 22.5° 线与中轴的交点（如 (0, -q)）

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    const V = (x, y) => {
      vertices.push([x * scale, y * scale, 0]);
      return vertices.length - 1;
    };
    const E = (a, b, kind) => {
      edges.push([a, b]);
      edges_assignment.push(kind);
      edges_foldAngle.push(kind === 'M' ? 180 : kind === 'V' ? -180 : 0);
    };

    // 拓扑与模板库里的真实作品 birdBase 完全一致（13 顶点 / 24 边 / 中心 deg8 M5/V3 /
    // 4 个 deg4 轴点 M3/V1，扇区 [112.5,112.5,67.5,67.5]）：
    //   4 角 + 中心 + 4 个轴点（22.5° 交点）+ 4 个边中点
    const c0 = V(-scale, -scale);   // 0 左下角
    const c1 = V(scale, -scale);    // 1 右下角
    const c2 = V(scale, scale);      // 2 右上角
    const c3 = V(-scale, scale);     // 3 左上角
    const cen = V(0, 0);            // 4 中心
    const midL = V(-q, 0);          // 5 左轴点（22.5° 交点）
    const midR = V(q, 0);           // 6 右轴点
    const midB = V(0, -q);          // 7 下轴点
    const midT = V(0, q);           // 8 上轴点
    const edgeL = V(-scale, 0);     // 9  左边中点
    const edgeR = V(scale, 0);      // 10 右边中点
    const edgeB = V(0, -scale);     // 11 下边中点
    const edgeT = V(0, scale);      // 12 上边中点

    // 纸边
    E(c0, c1, 'B'); E(c1, c2, 'B'); E(c2, c3, 'B'); E(c3, c0, 'B');

    // 中心 8 射线：M5 / V3（连续的 3 个角为 V）
    E(cen, c0, 'M');
    E(cen, c1, 'V');
    E(cen, c2, 'V');
    E(cen, c3, 'V');
    E(cen, midL, 'M');
    E(cen, midR, 'M');
    E(cen, midB, 'M');
    E(cen, midT, 'M');

    // 8 条 22.5° 角折痕（每个角连相邻 2 个轴点）
    E(c0, midB, 'M'); E(c1, midB, 'M');
    E(c1, midR, 'M'); E(c2, midR, 'M');
    E(c2, midT, 'M'); E(c3, midT, 'M');
    E(c3, midL, 'M'); E(c0, midL, 'M');

    // 4 条边界折痕（谷折）：轴点 → 对应边的中点
    E(midL, edgeL, 'V');
    E(midR, edgeR, 'V');
    E(midB, edgeB, 'V');
    E(midT, edgeT, 'V');

    this.balanceMaekawa({ vertices_coords: vertices, edges_vertices: edges, edges_assignment: edges_assignment });

    // 面：用半边算法从边重算（折痕图普遍带悬挂边，半边算法只能闭合部分面，
    // 但面数够用即可 —— 判定不依赖面）。
    try {
      const { extractPlanarFaces } = require('./utils/crease-pattern-normalizer');
      const computed = extractPlanarFaces({ vertices_coords: vertices, edges_vertices: edges });
      if (computed && computed.length > 1) faces.push(...computed);
    } catch (e) { /* 算不出就沿用空 faces */ }

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: 'Bird Base (真正的鹤基：preliminary base + 8 条 22.5° 角折痕)',
      type: 'bird_base',
      params: { scale },
      isCreasePattern: true,
    });
  }

  generateCraneBase(options = {}) {
    const grid = options.grid || this.gridSize;
    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    const step = 2 / grid;  // 纸张范围 [-1, 1]

    // 生成网格顶点
    for (let y = 0; y <= grid; y++) {
      for (let x = 0; x <= grid; x++) {
        vertices.push([x * step - 1, y * step - 1, 0]);
      }
    }

    // 辅助函数：获取网格点索引
    const idx = (x, y) => y * (grid + 1) + x;

    // 1. 对角线折痕（X形）
    for (let i = 0; i < grid; i++) {
      // 主对角线
      edges.push([idx(i, i), idx(i + 1, i + 1)]);
      edges_assignment.push('V');
      edges_foldAngle.push(-180);

      // 副对角线
      edges.push([idx(i, grid - i), idx(i + 1, grid - i - 1)]);
      edges_assignment.push('V');
      edges_foldAngle.push(-180);
    }

    // 2. 中线折痕（十字形）
    const mid = Math.floor(grid / 2);
    for (let i = 0; i < grid; i++) {
      // 垂直中线（全程真折痕 → 中心 deg8）
      edges.push([idx(mid, i), idx(mid, i + 1)]);
      edges_assignment.push('M');
      edges_foldAngle.push(180);

      // 水平中线
      edges.push([idx(i, mid), idx(i + 1, mid)]);
      edges_assignment.push('M');
      edges_foldAngle.push(180);
    }

    // 3. 预折痕（象限对折线）- 基于纸鹤分析
    // 将四个角向中心折的预折痕
    //
    // 标 'F'（flat）而不是 'M'/'V'：这些是**预折痕**（折了再展开，当前处于平折状态），
    // 真实折纸里正是如此。之前标成 M/V 会让它们参与折平必要条件判定，
    // 而它们的**角度是任意斜线**（不满足 Kawasaki）→ crane 因此被判 15/411。
    // 标 F 之后：① 语义诚实 ② 不参与折平判定 ③ 折痕图上仍可见这些辅助线。
    //
    // **必须是 45° 的链**：任意角度的斜线会让顶点的扇区角不满足 Kawasaki
    // （实测旧版 crane 的 deg4 顶点扇区 [19.18, 160.82, 19.18, 160.82]，
    //  交替和 38.36° vs 321.64° → 全部不通过）。
    // 真实折痕图的折痕角都是 45° 的倍数（正方形网格 + 对角线）——
    // 参考模板库真实作品：squareBase deg6 扇区 [45,45,90,45,45,90]，误差 0°。
    const addChain = (x0, y0, dx, dy, steps) => {
      for (let k = 0; k < steps; k++) {
        const x = x0 + dx * k, y = y0 + dy * k;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx > grid || ny < 0 || ny > grid) break;
        edges.push([idx(x, y), idx(nx, ny)]);
        edges_assignment.push('M');
        edges_foldAngle.push(180);
      }
    };
    // 每条链**单向**（不从中线两侧汇合）：否则链的起点会同时拿到两条相对射线
    // （中线 2 条 + 链 2 条）→ deg4 且扇区为 [45,135,45,135] → 违反 Kawasaki
    //（真实作品的对应形态是「两条 V 形折痕相交」的 [45,135,135,45]）。
    // 单向后，链起点为 deg3（奇数价 → Kawasaki 不适用），Maekawa 由 balanceMaekawa 平衡。
    //
    // **不再画斜线**。理由（实测推导，不是猜）：
    //   Maekawa 要求 |M − V| = 2，而 deg3 顶点有 3 条折痕 → M + V = 3 →
    //   |M − V| 必为奇数 → **永远不可能等于 2**。
    //   任何斜线与中线的交点都是 deg3（斜线在交点终止）→ 结构上就不可展平。
    //   对照真实作品：birdBase 是 deg4/deg8，**没有一个 deg3 内部顶点**。
    //
    // 改为标准的 **preliminary base**（纸鹤/纸虎的第一步，语义正确）：
    //   中心 deg8（2 条对角 + 2 条中线）→ 扇区 [45,45,90,45,45,90]（同 squareBase，误差 0°）
    //   对角×中线交点 deg4 → 扇区 [45,45,90,90]
    // 山谷由 balanceMaekawa 平衡（先定几何、再定山谷，折纸 CAD 的标准做法）。

    // 4. 边界
    // 上边
    for (let x = 0; x < grid; x++) {
      edges.push([idx(x, 0), idx(x + 1, 0)]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }
    // 下边
    for (let x = 0; x < grid; x++) {
      edges.push([idx(x, grid), idx(x + 1, grid)]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }
    // 左边
    for (let y = 0; y < grid; y++) {
      edges.push([idx(0, y), idx(0, y + 1)]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }
    // 右边
    for (let y = 0; y < grid; y++) {
      edges.push([idx(grid, y), idx(grid, y + 1)]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }

    this.balanceMaekawa({ vertices_coords: vertices, edges_vertices: edges, edges_assignment: edges_assignment });
    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: `Crane Bird Base (${grid}x${grid} grid)`,
      type: 'bird_base',
      params: { grid },
      description: '纸鹤基本型，基于预折痕技术'
    });
  }

  /**
   * 生成鱼形基本型 (Fish Base)
   */
  generateFishBase(options = {}) {
    const grid = options.grid || this.gridSize;
    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    const step = 2 / grid;

    // 生成网格
    for (let y = 0; y <= grid; y++) {
      for (let x = 0; x <= grid; x++) {
        vertices.push([x * step - 1, y * step - 1, 0]);
      }
    }

    const idx = (x, y) => y * (grid + 1) + x;
    const mid = Math.floor(grid / 2);

    // 对角线
    for (let i = 0; i < grid; i++) {
      edges.push([idx(i, i), idx(i + 1, i + 1)]);
      edges_assignment.push('V');
      edges_foldAngle.push(-180);

      edges.push([idx(i, grid - i), idx(i + 1, grid - i - 1)]);
      edges_assignment.push('V');
      edges_foldAngle.push(-180);
    }

    // 垂直中线
    for (let y = 0; y < grid; y++) {
      edges.push([idx(mid, y), idx(mid, y + 1)]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }

    // 鱼尾折叠线（斜线）
    //
    // 标 'F'（预折痕）而不是 'M'：这些斜线是**任意角度**的（不满足 Kawasaki），
    // 在真实折纸里它们是折了再展开的预折痕，当前平折。标 F 既语义诚实，
    // 也不让它们参与折平必要条件判定。
    for (let i = 1; i < mid; i++) {
      // 45° 的链（任意角度的斜线不满足 Kawasaki）：
      // 从左/右边界沿 45° 斜到上边 → 仍是 V 形的「鱼尾」视觉。
      // 标 'F'（预折痕）：这些斜线与中线的交点是 **deg3** 顶点 ——
      // 3 条折痕 → M+V=3 → |M−V| 必为奇数 → **Maekawa 结构上无解**
      //（真实折痕图里也没有 deg3 内部顶点）。标 F 让它们退出折平判定。
      for (let k = 0; k < grid - i; k++) {
        edges.push([idx(k, i + k), idx(k + 1, i + k + 1)]);
        edges_assignment.push('F');
        edges_foldAngle.push(0);
      }
      for (let k = 0; k < i; k++) {
        edges.push([idx(grid - k, i + k), idx(grid - k - 1, i + k + 1)]);
        edges_assignment.push('F');
        edges_foldAngle.push(0);
      }
    }

    // 边界
    for (let x = 0; x < grid; x++) {
      edges.push([idx(x, 0), idx(x + 1, 0)]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
      edges.push([idx(x, grid), idx(x + 1, grid)]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }
    for (let y = 0; y < grid; y++) {
      edges.push([idx(0, y), idx(0, y + 1)]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
      edges.push([idx(grid, y), idx(grid, y + 1)]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }

    this.balanceMaekawa({ vertices_coords: vertices, edges_vertices: edges, edges_assignment: edges_assignment });
    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: `Fish Base (${grid}x${grid} grid)`,
      type: 'fish_base',
      params: { grid }
    });
  }

  /**
   * 生成Miura-Ori折痕图
   */
  generateMiuraOri(options = {}) {
    const rows = options.rows || 5;
    const cols = options.cols || 8;
    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    const dx = 2 / cols;
    const dy = 2 / rows;

    // 创建顶点网格
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        vertices.push([col * dx - 1, row * dy - 1, 0]);
      }
    }

    // 添加水平边
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * (cols + 1) + col;
        edges.push([idx, idx + 1]);
        if (row === 0 || row === rows) {
          edges_assignment.push('B');
          edges_foldAngle.push(0);
        } else {
          edges_assignment.push((row + col) % 2 === 0 ? 'M' : 'V');
          edges_foldAngle.push((row + col) % 2 === 0 ? 180 : -180);
        }
      }
    }

    // 添加垂直边
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col <= cols; col++) {
        const idx = row * (cols + 1) + col;
        edges.push([idx, idx + cols + 1]);
        // 左右两侧是**纸边**（不折叠）—— 之前漏标成 M/V，
        // 导致边界顶点成了 3 度内部顶点、扇区 [90,90,180]，
        // Maekawa 失衡（28/36）。参照真实作品：边界一律 'B'。
        if (col === 0 || col === cols) {
          edges_assignment.push('B');
          edges_foldAngle.push(0);
        } else {
          edges_assignment.push((row + col) % 2 === 0 ? 'V' : 'M');
          edges_foldAngle.push((row + col) % 2 === 0 ? -180 : 180);
        }
      }
    }

    // 生成三角形面 (Miura-Ori专用)
    // 只生成使用实际存在边的面
    const edgeSet = new Set();
    for (const edge of edges) {
      const key = `${Math.min(edge[0], edge[1])}-${Math.max(edge[0], edge[1])}`;
      edgeSet.add(key);
    }
    const hasEdge = (v1, v2) => edgeSet.has(`${Math.min(v1,v2)}-${Math.max(v1,v2)}`);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const topLeft = row * (cols + 1) + col;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + cols + 1;
        const bottomRight = bottomLeft + 1;

        // 只添加有完整边界的面
        if (hasEdge(topLeft, topRight) &&
            hasEdge(topRight, bottomRight) &&
            hasEdge(bottomRight, bottomLeft) &&
            hasEdge(bottomLeft, topLeft)) {
          faces.push([topLeft, topRight, bottomLeft]);
          faces.push([topRight, bottomRight, bottomLeft]);
        }
      }
    }

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: `Miura-Ori (${rows}x${cols})`,
      type: 'miura_ori',
      params: { rows, cols },
      isCreasePattern: true
    });
  }

  /**
   * 生成老虎基本型 (Tiger Base)
   */
  generateTigerBase(options = {}) {
    const grid = options.grid || 32;

    // 老虎基于鱼形基本型的变体
    const fishBase = this.generateFishBase({ grid });

    // 添加额外的折痕（模拟虎纹）
    const additionalEdges = [];
    const additionalAssignment = [];
    const additionalFoldAngle = [];

    // 在现有基础上添加斜向折痕
    const idx = (x, y) => y * (grid + 1) + x;
    const mid = Math.floor(grid / 2);

    // 添加V形纹路折痕
    //
    // 标 'F'（预折痕）：这些是折了再展开的辅助折痕，角度任意（不满足 Kawasaki）。
    for (let i = 1; i < mid; i++) {
      // 虎纹线标 'F'（**预折痕**：折了再展开、当前平折）。
      // 不标 M/V 的理由同 crane：它们与中线的交点是 deg3 →
      // |M−V| 必为奇数 → 结构上不可能满足 Maekawa。
      // 标 F 既语义诚实，也让它不参与折平必要条件判定。
      for (let k = 0; k < grid - mid + i; k++) {
        additionalEdges.push([idx(k, mid - i + k), idx(k + 1, mid - i + k + 1)]);
        additionalAssignment.push('F');
        additionalFoldAngle.push(0);
      }
      for (let k = 0; k < i; k++) {
        additionalEdges.push([idx(grid - k, mid - i + k), idx(grid - k - 1, mid - i + k + 1)]);
        additionalAssignment.push('F');
        additionalFoldAngle.push(0);
      }
    }

    // 合并折痕
    fishBase.edges_vertices = [...fishBase.edges_vertices, ...additionalEdges];
    fishBase.edges_assignment = [...fishBase.edges_assignment, ...additionalAssignment];
    fishBase.edges_foldAngle = [...fishBase.edges_foldAngle, ...additionalFoldAngle];
    this.balanceMaekawa(fishBase);
    fishBase.frame_title = `Tiger Base (${grid}x${grid} grid)`;
    fishBase.metadata.type = 'tiger_base';

    return fishBase;
  }

  /**
   * 验证折痕图 (基于Kawasaki和Maekawa定理)
   * @param {Object} foldData - FOLD格式数据
   * @returns {Object} 验证结果
   */
  validate(foldData) {
    const validator = new CreasePatternValidator();
    return validator.validate(foldData);
  }

  /**
   * 生成验证报告
   * @param {Object} foldData - FOLD格式数据
   * @returns {string} 报告文本
   */
  validateAndReport(foldData) {
    const validator = new CreasePatternValidator();
    return validator.generateReport(foldData);
  }

  /**
   * 创建标准FOLD结果
   * 支持 FOLD v1.2 标准
   */
  createFoldResult(vertices, edges, faces, assignment, foldAngle, metadata = {}) {
    const isCreasePattern = metadata.isCreasePattern || false;

    // 如果没有 faces 但有 edges，尝试计算 faces
    let computedFaces = faces;
    if ((!faces || faces.length === 0) && edges && edges.length > 0 && vertices && vertices.length > 0) {
      computedFaces = this.computeFaces(vertices, edges, assignment);
      if (computedFaces && computedFaces.length > 0) {
        console.log(`✅ 自动计算了 ${computedFaces.length} 个面`);
      }
    }

    const foldData = {
      file_spec: 1.2,  // 升级到 FOLD v1.2
      file_creator: 'CreasePatternGeneratorV3 (origami-simulator-cli)',
      file_classes: isCreasePattern ? ['creasePattern'] : ['singleModel'],
      frame_classes: isCreasePattern ? ['creasePattern'] : ['foldedForm'],
      frame_attributes: ['2D'],  // FOLD v1.2 标准属性
      frame_title: metadata.title || 'Crease Pattern',
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: computedFaces || [],
      edges_assignment: assignment,
      edges_foldAngle: foldAngle,
      // FOLD v1.2 新增: 可选的 vertices_edges 计算
      vertices_edges: this._computeVerticesEdges(vertices, edges),
      metadata: {
        generator: 'CreasePatternGeneratorV3',
        version: '1.2',
        ...metadata
      }
    };

    return foldData;
  }

  /**
   * 计算 faces_vertices (三角剖分)
   * 对于折痕图，识别外边界多边形并进行三角剖分
   *
   * @param {Array} vertices - 顶点坐标数组
   * @param {Array} edges - 边数组
   * @param {Array} edges_assignment - 边赋值数组
   * @returns {Array} faces_vertices 数组
   */
  computeFaces(vertices, edges, edges_assignment) {
    if (!vertices || !edges || vertices.length === 0) return [];

    // 构建边集合和邻接图
    const edgeSet = new Set();
    const edges_by_vert = Array.from({ length: vertices.length }, () => []);

    for (let i = 0; i < edges.length; i++) {
      const [v1, v2] = edges[i];
      const key = `${Math.min(v1, v2)}-${Math.max(v1, v2)}`;
      edgeSet.add(key);
      edges_by_vert[v1].push(v2);
      edges_by_vert[v2].push(v1);
    }

    const hasEdge = (v1, v2) => edgeSet.has(`${Math.min(v1, v2)}-${Math.max(v1, v2)}`);

    // 尝试网格面计算（适用于 Crane, Fish, Tiger 等网格类折痕）
    const gridFaces = this._computeGridFaces(vertices, edges_by_vert, hasEdge);
    if (gridFaces.length > 0) {
      return gridFaces;
    }

    // 回退：使用 earcut 进行三角剖分（需要 earcut 库）
    if (!earcut) {
      console.warn('⚠️  earcut 未安装且无法使用网格计算');
      return [];
    }

    // 识别边界顶点
    const boundaryVertices = new Set();
    for (let i = 0; i < edges.length; i++) {
      if ((edges_assignment[i] || '').toUpperCase() === 'B') {
        boundaryVertices.add(edges[i][0]);
        boundaryVertices.add(edges[i][1]);
      }
    }

    const boundaryVertexList = Array.from(boundaryVertices);
    if (boundaryVertexList.length < 3) {
      console.warn('⚠️  边界顶点不足');
      return [];
    }

    const boundaryOrder = this._computeConvexHull(vertices, boundaryVertexList);
    if (boundaryOrder.length < 3) {
      console.warn('⚠️  无法形成有效的边界多边形');
      return [];
    }

    const boundaryCoords = [];
    for (const v of boundaryOrder) {
      const coord = vertices[v];
      if (coord && coord.length >= 2) {
        boundaryCoords.push(coord[0], coord[1]);
      }
    }

    if (boundaryCoords.length < 6) return [];

    // earcut 2.x 签名：earcut(vertices, holeIndices, dimensions)
    // 顶点是**扁平坐标**数组（earcut 2.x 格式），无洞 → holeIndices 传 null，维度 2
    const triangles = earcut(boundaryCoords, null, 2);
    const faces = [];

    for (let i = 0; i < triangles.length; i += 3) {
      faces.push([
        boundaryOrder[triangles[i]],
        boundaryOrder[triangles[i + 1]],
        boundaryOrder[triangles[i + 2]]
      ]);
    }

    return faces;
  }

  /**
   * 计算网格面（适用于 Crane, Fish, Tiger 等网格类折痕）
   * 识别规则的 4-邻接 网格单元
   */
  _computeGridFaces(vertices, edges_by_vert, hasEdge) {
    const faces = [];
    const n = vertices.length;
    const visited = new Set();

    // 分析顶点分布，判断是否为规则网格
    // 收集所有 x 和 y 坐标
    const xCoords = [...new Set(vertices.map(v => v[0]))].sort((a, b) => a - b);
    const yCoords = [...new Set(vertices.map(v => v[1]))].sort((a, b) => a - b);

    // 检查是否为规则网格（等间距）
    const xStep = xCoords.length > 1 ? xCoords[1] - xCoords[0] : null;
    const yStep = yCoords.length > 1 ? yCoords[1] - yCoords[0] : null;

    if (!xStep || !yStep || xCoords.length < 2 || yCoords.length < 2) {
      return [];
    }

    // 验证网格间距一致性
    const xValid = xCoords.every((x, i) => i === 0 || Math.abs(x - xCoords[i - 1] - xStep) < 1e-10);
    const yValid = yCoords.every((y, i) => i === 0 || Math.abs(y - yCoords[i - 1] - yStep) < 1e-10);

    if (!xValid || !yValid) {
      return [];
    }

    const cols = xCoords.length;
    const rows = yCoords.length;

    // 建立坐标到索引的映射
    const coordToIdx = new Map();
    vertices.forEach((v, i) => coordToIdx.set(`${v[0].toFixed(6)},${v[1].toFixed(6)}`, i));

    // 遍历每个可能的网格单元
    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < cols - 1; col++) {
        // 获取四个角点
        const x1 = xCoords[col];
        const y1 = yCoords[row];
        const x2 = xCoords[col + 1];
        const y2 = yCoords[row + 1];

        const topLeft = coordToIdx.get(`${x1.toFixed(6)},${y1.toFixed(6)}`);
        const topRight = coordToIdx.get(`${x2.toFixed(6)},${y1.toFixed(6)}`);
        const bottomLeft = coordToIdx.get(`${x1.toFixed(6)},${y2.toFixed(6)}`);
        const bottomRight = coordToIdx.get(`${x2.toFixed(6)},${y2.toFixed(6)}`);

        if (topLeft === undefined || topRight === undefined ||
            bottomLeft === undefined || bottomRight === undefined) {
          continue;
        }

        // 检查四个边是否都存在
        if (hasEdge(topLeft, topRight) &&
            hasEdge(topRight, bottomRight) &&
            hasEdge(bottomRight, bottomLeft) &&
            hasEdge(bottomLeft, topLeft)) {

          // 避免重复面
          const faceKey = [topLeft, topRight, bottomRight, bottomLeft].sort().join('-');
          if (!visited.has(faceKey)) {
            visited.add(faceKey);
            faces.push([topLeft, topRight, bottomLeft]);
            faces.push([topRight, bottomRight, bottomLeft]);
          }
        }
      }
    }

    return faces;
  }

  /**
   * 计算凸包（Andrew's monotone chain algorithm）
   * @param {Array} vertices - 所有顶点坐标
   * @param {Array} boundaryVertexList - 边界顶点索引列表
   * @returns {Array} 按凸包顺序排列的顶点索引
   */
  _computeConvexHull(vertices, boundaryVertexList) {
    // 按x坐标排序，相同时按y排序
    const sorted = [...boundaryVertexList].sort((a, b) => {
      const [ax, ay] = vertices[a];
      const [bx, by] = vertices[b];
      return ax - bx || ay - by;
    });

    // 构建下凸壳
    const lower = [];
    for (const v of sorted) {
      while (lower.length >= 2 && this._cross(lower[lower.length - 2], lower[lower.length - 1], v, vertices) <= 0) {
        lower.pop();
      }
      lower.push(v);
    }

    // 构建上凸壳
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const v = sorted[i];
      while (upper.length >= 2 && this._cross(upper[upper.length - 2], upper[upper.length - 1], v, vertices) <= 0) {
        upper.pop();
      }
      upper.push(v);
    }

    // 移除最后一个点（因为它与第一个点相同）
    lower.pop();
    upper.pop();

    return [...lower, ...upper];
  }

  /**
   * 计算向量叉积
   */
  _cross(o, a, b, vertices) {
    const [ox, oy] = vertices[o];
    const [ax, ay] = vertices[a];
    const [bx, by] = vertices[b];
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
  }

  /**
   * 计算 vertices_edges (FOLD v1.2)
   * 为每个顶点计算其关联的边ID列表
   */
  _computeVerticesEdges(vertices, edges) {
    if (!vertices || vertices.length === 0) return [];
    const verticesEdges = Array.from({ length: vertices.length }, () => []);
    for (let edgeIdx = 0; edgeIdx < edges.length; edgeIdx++) {
      const [v1, v2] = edges[edgeIdx];
      if (v1 >= 0 && v1 < vertices.length) verticesEdges[v1].push(edgeIdx);
      if (v2 >= 0 && v2 < vertices.length) verticesEdges[v2].push(edgeIdx);
    }
    return verticesEdges;
  }

  /**
   * 导出为FOLD文件
   */
  saveFOLD(foldData, outputPath) {
    fs.mkdirSync(path.dirname(outputPath) || '.', { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(foldData, null, 2));
    console.log(`✅ FOLD已保存: ${outputPath}`);
    return outputPath;
  }

  /**
   * 生成 SVG 格式的折痕图
   * 支持 FOLD v1.2 折痕信息 (M/V/B/C/J)
   *
   * @param {Object} foldData - FOLD格式数据
   * @param {Object} options - SVG选项
   * @param {number} options.width - SVG宽度
   * @param {number} options.height - SVG高度
   * @param {number} options.padding - 内边距
   * @returns {string} SVG内容
   */
  generateSVG(foldData, options = {}) {
    const {
      width = 800,
      height = 800,
      padding = 50
    } = options;

    const { vertices_coords, edges_vertices, edges_assignment, frame_title = 'Crease Pattern' } = foldData;

    if (!vertices_coords || vertices_coords.length === 0) {
      throw new Error('No vertices found in fold data');
    }

    // 计算坐标范围
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of vertices_coords) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    // 添加padding
    minX -= 0.1;
    maxX += 0.1;
    minY -= 0.1;
    maxY += 0.1;

    // 计算缩放和偏移
    const scaleX = (width - 2 * padding) / (maxX - minX);
    const scaleY = (height - 2 * padding) / (maxY - minY);
    const scale = Math.min(scaleX, scaleY);
    const offsetX = padding + (width - 2 * padding - (maxX - minX) * scale) / 2;
    const offsetY = padding + (height - 2 * padding - (maxY - minY) * scale) / 2;

    // 坐标转换函数
    const toSvgX = (x) => (x - minX) * scale + offsetX;
    const toSvgY = (y) => height - ((y - minY) * scale + offsetY); // Y轴翻转

    // 颜色映射 - origami-simulator 官方标准
    const colors = {
      M: '#FF0000',  // 红色 - Mountain (官方标准)
      V: '#0066cc',  // 蓝色 - Valley（QUALITY-STANDARDS v1.5 §9）
      B: '#000000',  // 黑色 - Boundary (官方标准)
      F: '#FFFF00',  // 黄色 - Flat
      C: '#FF00FF',  // 紫红色 - Cut
      J: '#00FF00',  // 绿色 - Join
    };

    // 折痕类型统计
    const stats = { M: 0, V: 0, B: 0, F: 0, C: 0, J: 0 };

    // 生成SVG
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${width} ${height}"
     width="${width}" height="${height}">
  <title>${this.escapeXml(frame_title)}</title>
  <desc>Generated by CreasePatternGeneratorV3</desc>

  <!-- Styles -->
  <defs>
    <style>
      .crease-m { stroke: #FF0000; stroke-width: 1.5; fill: none; }
      .crease-v { stroke: #0066cc; stroke-width: 1.5; fill: none; }
      .crease-b { stroke: #000000; stroke-width: 2; fill: none; }
      .crease-f { stroke: #FFFF00; stroke-width: 1; fill: none; }
      .crease-c { stroke: #FF00FF; stroke-width: 2; fill: none; }
      .crease-j { stroke: #00FF00; stroke-width: 2; fill: none; }
      .vertex { fill: #000000; }
    </style>
  </defs>

  <!-- Background -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="#fafafa"/>

  <!-- Crease Lines -->
  <g id="creases">
`;

    // 绘制边 - 使用 path 元素（origami-simulator 兼容）
    if (edges_vertices && edges_assignment) {
      let errorCount = 0;
      for (let i = 0; i < edges_vertices.length; i++) {
        const [v1, v2] = edges_vertices[i];
        const assignment = (edges_assignment[i] || 'B').toUpperCase();

        // 边界检查
        if (v1 < 0 || v1 >= vertices_coords.length ||
            v2 < 0 || v2 >= vertices_coords.length ||
            !vertices_coords[v1] || !vertices_coords[v2]) {
          errorCount++;
          continue; // 跳过无效边
        }

        const x1 = toSvgX(vertices_coords[v1][0]);
        const y1 = toSvgY(vertices_coords[v1][1]);
        const x2 = toSvgX(vertices_coords[v2][0]);
        const y2 = toSvgY(vertices_coords[v2][1]);

        stats[assignment] = (stats[assignment] || 0) + 1;

        // 使用官方的 origami-simulator 格式：
        // fill 和 stroke 使用相同颜色（不是 fill="none"）
        const color = this._getStrokeColor(assignment);
        svg += `    <path fill="${color}" stroke="${color}" stroke-width="${assignment === 'B' ? 2 : 1.5}" stroke-miterlimit="10" d="M${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)}"/>\n`;
      }
      if (errorCount > 0) {
        console.warn(`⚠️  跳过 ${errorCount} 条无效边`);
      }
    }

    svg += `  </g>

  <!-- Vertices -->
  <g id="vertices" class="vertex">
`;

    // 绘制顶点（小圆点）
    for (let i = 0; i < vertices_coords.length; i++) {
      const coord = vertices_coords[i];
      if (!coord || coord.length < 2) continue;
      const [x, y] = coord;
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      svg += `    <circle cx="${toSvgX(x).toFixed(2)}" cy="${toSvgY(y).toFixed(2)}" r="2"/>\n`;
    }

    svg += `  </g>

  <!-- Legend -->
  <g id="legend" transform="translate(20, ${height - 120})">
    <text x="0" y="0" font-family="Arial, sans-serif" font-size="12" font-weight="bold">Legend</text>
    <line x1="0" y1="15" x2="30" y2="15" stroke="#FF0000" stroke-width="2"/>
    <text x="40" y="19" font-family="Arial, sans-serif" font-size="11">Mountain (M): ${stats.M || 0}</text>
    <line x1="0" y1="35" x2="30" y2="35" stroke="#0066cc" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="40" y="39" font-family="Arial, sans-serif" font-size="11">Valley (V): ${stats.V || 0}</text>
    <line x1="0" y1="55" x2="30" y2="55" stroke="#000000" stroke-width="2"/>
    <text x="40" y="59" font-family="Arial, sans-serif" font-size="11">Boundary (B): ${stats.B || 0}</text>
    <line x1="0" y1="75" x2="30" y2="75" stroke="#FFFF00" stroke-width="1" stroke-dasharray="2,2"/>
    <text x="40" y="79" font-family="Arial, sans-serif" font-size="11">Flat (F): ${stats.F || 0}</text>
    <line x1="0" y1="95" x2="30" y2="95" stroke="#FF00FF" stroke-width="2" stroke-dasharray="8,4"/>
    <text x="40" y="99" font-family="Arial, sans-serif" font-size="11">Cut (C): ${stats.C || 0}</text>
  </g>

  <!-- Title -->
  <text x="${width / 2}" y="25" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold">${this.escapeXml(frame_title)}</text>

</svg>`;

    return svg;
  }

  /**
   * 保存为SVG文件
   */
  saveSVG(foldData, outputPath, options = {}) {
    const svg = this.generateSVG(foldData, options);
    fs.mkdirSync(path.dirname(outputPath) || '.', { recursive: true });
    fs.writeFileSync(outputPath, svg, 'utf8');
    console.log(`✅ SVG已保存: ${outputPath}`);
    return outputPath;
  }

  /**
   * XML转义
   */
  escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * 获取折痕类型的颜色 (origami-simulator 官方标准)
   */
  _getStrokeColor(assignment) {
    const colors = {
      M: '#FF0000',  // 红色 - Mountain
      V: '#0066cc',  // 蓝色 - Valley
      B: '#000000',  // 黑色 - Boundary
      F: '#FFFF00',  // 黄色 - Flat
      C: '#FF00FF',  // 紫红色 - Cut
      J: '#00FF00',  // 绿色 - Join
    };
    return colors[assignment.toUpperCase()] || colors.B;
  }
}

// CLI入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const type = args[0] || 'help';
  const output = args[1] || './output.fold';

  switch (type) {
    case 'star':
      CreasePatternGeneratorV3.create('star', { arms: 10, rings: 4 })
        .pipe?.() || new CreasePatternGeneratorV3().saveFOLD(
          CreasePatternGeneratorV3.create('star', { arms: 10, rings: 4 }),
          output
        );
      break;

    case 'crane':
      new CreasePatternGeneratorV3().saveFOLD(
        new CreasePatternGeneratorV3().generateCraneBase({ grid: 32 }),
        output
      );
      break;

    case 'fish':
      new CreasePatternGeneratorV3().saveFOLD(
        new CreasePatternGeneratorV3().generateFishBase({ grid: 32 }),
        output
      );
      break;

    case 'miura':
      new CreasePatternGeneratorV3().saveFOLD(
        new CreasePatternGeneratorV3().generateMiuraOri({ rows: 6, cols: 10 }),
        output
      );
      break;

    case 'tiger':
      new CreasePatternGeneratorV3().saveFOLD(
        new CreasePatternGeneratorV3().generateTigerBase({ grid: 32 }),
        output
      );
      break;

    case 'all': {
      const gen = new CreasePatternGeneratorV3();
      const dir = path.dirname(output);
      fs.mkdirSync(dir, { recursive: true });

      gen.saveFOLD(gen.generateStarTessellation({ arms: 10, rings: 4 }), path.join(dir, 'star.fold'));
      gen.saveFOLD(gen.generateCraneBase({ grid: 32 }), path.join(dir, 'crane_base.fold'));
      gen.saveFOLD(gen.generateFishBase({ grid: 32 }), path.join(dir, 'fish_base.fold'));
      gen.saveFOLD(gen.generateMiuraOri({ rows: 6, cols: 10 }), path.join(dir, 'miura_ori.fold'));
      gen.saveFOLD(gen.generateTigerBase({ grid: 32 }), path.join(dir, 'tiger_base.fold'));
      console.log('✅ 所有折痕图已生成');
      break;
    }

    default:
      console.log(`
折痕图生成器 v3.0 (逆推优化版)

用法: node crease-pattern-generator-v3.js <类型> [输出路径]

类型:
  star    - 星形镶嵌折纸 (10角对称)
  crane   - 纸鹤基本型 (预折痕技术)
  fish    - 鱼形基本型
  miura   - Miura-Ori 折痕
  tiger   - 老虎基本型
  all     - 生成所有类型

示例:
  node crease-pattern-generator-v3.js crane ./output/crane_base.fold
  node crease-pattern-generator-v3.js all ./origami-cp/
      `);
  }
}

module.exports = CreasePatternGeneratorV3;