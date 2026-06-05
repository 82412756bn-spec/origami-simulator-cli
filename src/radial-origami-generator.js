/**
 * Radial Origami Generator v1.2
 * 放射状折纸生成器
 *
 * 更新内容 (2026-04-18):
 * - v1.2: 新增折痕图验证模块 (Kawasaki/Maekawa定理)
 * - v1.1: 新增 Rings8 风格环形放射结构
 * - v1.1: 新增 Curved Square Weave 风格
 * - v1.1: 优化 M/V 折痕分配
 *
 * 基于研究: langorigami.com 图案资源
 */

const fs = require('fs');
const path = require('path');
const CreasePatternValidator = require('./utils/crease-pattern-validator');

class RadialOrigamiGenerator {
  constructor(options = {}) {
    this.arms = options.arms || 10;        // 放射臂数量
    this.radius = options.radius || 10;     // 整体半径
    this.spikeHeight = options.spikeHeight || 6;  // 尖刺高度
    this.layers = options.layers || 3;       // 层数
  }

  /**
   * 生成单中心放射星形折纸
   */
  generateRadialStar(options = {}) {
    const arms = options.arms || this.arms;
    const layers = options.layers || this.layers;
    const radius = options.radius || this.radius;
    const spikeHeight = options.spikeHeight || this.spikeHeight;

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    // 1. 中心点
    vertices.push([0, 0, 0]);
    const centerIdx = 0;

    // 2. 生成各层顶点
    // 每层有 arms 个顶点，位于不同半径
    const layerRadii = [];
    for (let l = 1; l <= layers; l++) {
      layerRadii.push((l / layers) * radius);
    }

    // 存储每层的顶点索引
    const layerVertices = [];

    for (let l = 0; l < layers; l++) {
      const ringVertices = [];
      const r = layerRadii[l];

      for (let i = 0; i < arms; i++) {
        const angle = (2 * Math.PI * i) / arms - Math.PI / 2;
        // 尖刺顶点（在放射线上）
        const spikeR = r * 1.2; // 尖刺稍微向外延伸
        const spikeZ = (l === layers - 1) ? spikeHeight : (r * 0.3); // 最外层尖刺最高

        ringVertices.push(vertices.length);
        vertices.push([
          spikeR * Math.cos(angle),
          spikeR * Math.sin(angle),
          spikeZ
        ]);
      }
      layerVertices.push(ringVertices);
    }

    // 3. 中心到第一层每个尖刺的折痕（主折痕）
    for (let i = 0; i < arms; i++) {
      edges.push([centerIdx, layerVertices[0][i]]);
      edges_assignment.push('M');
      edges_foldAngle.push(180);
    }

    // 4. 相邻层之间连接
    for (let l = 0; l < layers - 1; l++) {
      for (let i = 0; i < arms; i++) {
        const nextI = (i + 1) % arms;

        // 同一臂上的跨层连接
        edges.push([layerVertices[l][i], layerVertices[l + 1][i]]);
        edges_assignment.push('M');
        edges_foldAngle.push(180);

        // 相邻臂之间的连接（形成三角形带）
        edges.push([layerVertices[l][i], layerVertices[l][nextI]]);
        edges_assignment.push(l % 2 === 0 ? 'V' : 'M');
        edges_foldAngle.push(l % 2 === 0 ? -180 : 180);
      }
    }

    // 5. 最外层闭合（相邻臂末端连接）
    const lastLayer = layerVertices[layers - 1];
    for (let i = 0; i < arms; i++) {
      const nextI = (i + 1) % arms;
      edges.push([lastLayer[i], lastLayer[nextI]]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }

    // 6. 生成面（只使用实际存在的边）
    // 构建边集合用于验证
    const edgeSet = new Set();
    for (const edge of edges) {
      const key = `${Math.min(edge[0], edge[1])}-${Math.max(edge[0], edge[1])}`;
      edgeSet.add(key);
    }

    // 辅助函数：检查边是否存在
    const hasEdge = (v1, v2) => edgeSet.has(`${Math.min(v1,v2)}-${Math.max(v1,v2)}`);

    // 中心区域扇形: [center, layer[0][i], layer[1][i]] (如果layer[1]存在)
    // 由于 layer[0][i]->layer[1][i] 存在，且 center->layer[0][i] 存在
    for (let i = 0; i < arms; i++) {
      const nextI = (i + 1) % arms;
      // 中心到第一层两点形成的三角形
      // edges: center->layer[0][i], center->layer[0][nextI], layer[0][i]->layer[0][nextI]
      if (hasEdge(centerIdx, layerVertices[0][i]) &&
          hasEdge(centerIdx, layerVertices[0][nextI]) &&
          hasEdge(layerVertices[0][i], layerVertices[0][nextI])) {
        faces.push([centerIdx, layerVertices[0][i], layerVertices[0][nextI]]);
      }
    }

    // 层间楔形
    for (let l = 0; l < layers - 1; l++) {
      for (let i = 0; i < arms; i++) {
        const nextI = (i + 1) % arms;
        const curr = layerVertices[l];
        const nextL = layerVertices[l + 1];

        // 三角形: [curr[i], curr[nextI], nextL[i]]
        if (hasEdge(curr[i], curr[nextI]) &&
            hasEdge(curr[i], nextL[i]) &&
            hasEdge(curr[nextI], nextL[i])) {
          faces.push([curr[i], curr[nextI], nextL[i]]);
        }

        // 三角形: [curr[nextI], nextL[nextI], nextL[i]]
        if (hasEdge(curr[nextI], nextL[nextI]) &&
            hasEdge(curr[nextI], nextL[i]) &&
            hasEdge(nextL[nextI], nextL[i])) {
          faces.push([curr[nextI], nextL[nextI], nextL[i]]);
        }
      }
    }

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: `Radial Star (${arms}-fold, ${layers} layers)`,
      type: 'radial_star'
    });
  }

  /**
   * 生成海胆状放射体 - 简化版
   * 直接从中心放射，无中间环
   */
  generateUrchin(options = {}) {
    const arms = options.arms || this.arms;
    const radius = options.radius || this.radius;
    const spikeHeight = options.spikeHeight || this.spikeHeight;

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    // 中心
    vertices.push([0, 0, 0]);
    const centerIdx = 0;

    // 外层尖刺顶点 - 只在最外层
    const spikeVertices = [];
    for (let i = 0; i < arms; i++) {
      const angle = (2 * Math.PI * i) / arms - Math.PI / 2;
      spikeVertices.push(vertices.length);
      vertices.push([
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        spikeHeight
      ]);
    }

    // 中心到每个尖刺的折痕
    for (let i = 0; i < arms; i++) {
      edges.push([centerIdx, spikeVertices[i]]);
      edges_assignment.push('M');
      edges_foldAngle.push(180);
    }

    // 相邻尖刺连接（底部）
    for (let i = 0; i < arms; i++) {
      const nextI = (i + 1) % arms;
      edges.push([spikeVertices[i], spikeVertices[nextI]]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }

    // 面：中心三角形
    for (let i = 0; i < arms; i++) {
      const nextI = (i + 1) % arms;
      faces.push([centerIdx, spikeVertices[i], spikeVertices[nextI]]);
    }

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: `Urchin Simple (${arms}-fold)`,
      type: 'urchin_simple'
    });
  }

  /**
   * 生成雪花状放射体
   */
  generateSnowflake(options = {}) {
    const arms = options.arms || 6;
    const layers = options.layers || 4;
    const radius = options.radius || 10;

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    // 中心
    vertices.push([0, 0, 0]);

    // 生成雪花层
    const allLayers = [];

    // 中心到外层的每臂顶点数递增（模拟雪花分支）
    const pointsPerArm = [1, 2, 4, 6]; // 每层每臂的分支数

    for (let l = 0; l < layers; l++) {
      const layerPoints = [];
      const numPoints = pointsPerArm[l] || arms;
      const r = ((l + 1) / layers) * radius;

      for (let i = 0; i < arms; i++) {
        for (let j = 0; j < numPoints / arms; j++) {
          const angle = (2 * Math.PI * i) / arms - Math.PI / 2 + (j * Math.PI) / (arms * 3);
          layerPoints.push(vertices.length);
          vertices.push([
            Math.cos(angle) * r * (1 + j * 0.2),
            Math.sin(angle) * r * (1 + j * 0.2),
            r * 0.1 * (l + 1)
          ]);
        }
      }
      allLayers.push(layerPoints);
    }

    // 简化：只生成6臂雪花
    // 中心到每个主臂的折痕
    for (let i = 0; i < arms; i++) {
      const idx = allLayers[0][i];
      edges.push([0, idx]);
      edges_assignment.push('M');
      edges_foldAngle.push(180);
    }

    // 主臂之间的连接
    for (let i = 0; i < arms; i++) {
      const nextI = (i + 1) % arms;
      const idx1 = allLayers[0][i];
      const idx2 = allLayers[0][nextI];

      edges.push([idx1, idx2]);
      edges_assignment.push('V');
      edges_foldAngle.push(-180);
    }

    // 面
    for (let i = 0; i < arms; i++) {
      const nextI = (i + 1) % arms;
      faces.push([0, allLayers[0][i], allLayers[0][nextI]]);
    }

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: `Snowflake (${arms}-fold)`,
      type: 'snowflake'
    });
  }

  /**
   * 生成纸鹤（简化版）
   */
  generateSimpleCrane() {
    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    // 简化的纸鹤基本型 - 4个主顶点
    // 正方形纸张的四个角点
    vertices.push([-1, -1, 0]);  // 0: 左下
    vertices.push([1, -1, 0]);   // 1: 右下
    vertices.push([1, 1, 0]);    // 2: 右上
    vertices.push([-1, 1, 0]);   // 3: 左上
    vertices.push([0, 0, 0.5]);  // 4: 中心顶点（折起）

    // 对角线
    edges.push([0, 2]); edges_assignment.push('V'); edges_foldAngle.push(-180);
    edges.push([1, 3]); edges_assignment.push('V'); edges_foldAngle.push(-180);

    // 边界
    edges.push([0, 1]); edges_assignment.push('B'); edges_foldAngle.push(0);
    edges.push([1, 2]); edges_assignment.push('B'); edges_foldAngle.push(0);
    edges.push([2, 3]); edges_assignment.push('B'); edges_foldAngle.push(0);
    edges.push([3, 0]); edges_assignment.push('B'); edges_foldAngle.push(0);

    // 中心到四个角（形成X折痕）
    edges.push([4, 0]); edges_assignment.push('M'); edges_foldAngle.push(180);
    edges.push([4, 1]); edges_assignment.push('M'); edges_foldAngle.push(180);
    edges.push([4, 2]); edges_assignment.push('M'); edges_foldAngle.push(180);
    edges.push([4, 3]); edges_assignment.push('M'); edges_foldAngle.push(180);

    // 面
    faces.push([4, 0, 1]); // 前
    faces.push([4, 1, 2]); // 右
    faces.push([4, 2, 3]); // 后
    faces.push([4, 3, 0]); // 左

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: 'Simple Crane Base',
      type: 'simple_crane'
    });
  }

  /**
   * 生成 Rings8 风格折痕图
   * 基于 langorigami.com Rings8
   *
   * 结构: 同心环 + 放射线, 8重对称
   * 关键: 需要真正的放射状结构，而非网格
   */
  generateRings8(options = {}) {
    const arms = options.arms || 8;  // 8重对称
    const rings = options.rings || 5; // 同心环数量
    const radius = options.radius || 10;

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    // 中心点
    vertices.push([0, 0, 0]);
    const centerIdx = 0;

    // 生成同心环顶点 - 每环有 arms 个顶点
    const ringVertsList = [];

    for (let ring = 0; ring <= rings; ring++) {
      const r = (ring / rings) * radius;
      const ringVerts = [];

      for (let i = 0; i < arms; i++) {
        const angle = (2 * Math.PI * i) / arms - Math.PI / 2;
        ringVerts.push(vertices.length);
        vertices.push([r * Math.cos(angle), r * Math.sin(angle), 0]);
      }
      ringVertsList.push(ringVerts);
    }

    // 1. 中心到第一环的放射线
    for (let i = 0; i < arms; i++) {
      edges.push([centerIdx, ringVertsList[0][i]]);
      edges_assignment.push('M');
      edges_foldAngle.push(180);
    }

    // 2. 每环的相邻顶点连接 (形成环)
    for (let ring = 0; ring <= rings; ring++) {
      for (let i = 0; i < arms; i++) {
        const nextI = (i + 1) % arms;
        edges.push([ringVertsList[ring][i], ringVertsList[ring][nextI]]);
        edges_assignment.push(ring % 2 === 0 ? 'M' : 'V');
        edges_foldAngle.push(ring % 2 === 0 ? 180 : -180);
      }
    }

    // 3. 相邻环之间的放射连接
    for (let ring = 0; ring < rings; ring++) {
      for (let i = 0; i < arms; i++) {
        const nextI = (i + 1) % arms;
        const currRing = ringVertsList[ring];
        const nextRing = ringVertsList[ring + 1];

        // 放射线: 当前环到下一环的同角度点
        edges.push([currRing[i], nextRing[i]]);
        edges_assignment.push('M');
        edges_foldAngle.push(180);

        // 斜向连接: 形成三角形
        edges.push([currRing[nextI], nextRing[i]]);
        edges_assignment.push('V');
        edges_foldAngle.push(-180);
      }
    }

    // 4. 生成面 - 每个扇形区域分成三角形
    for (let ring = 0; ring < rings; ring++) {
      for (let i = 0; i < arms; i++) {
        const nextI = (i + 1) % arms;
        const currRing = ringVertsList[ring];
        const nextRing = ringVertsList[ring + 1];

        // 外层三角形
        faces.push([currRing[i], currRing[nextI], nextRing[i]]);
        // 内层三角形
        faces.push([nextRing[i], currRing[nextI], nextRing[nextI]]);
      }
    }

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: `Rings8 (${arms}-fold, ${rings} rings)`,
      type: 'rings8',
      description: 'Rings8 style: concentric rings with radial lines, 8-fold symmetry'
    });
  }

  /**
   * 生成 Curved Square Weave 风格
   * 基于 langorigami.com Curved Square Weave
   *
   * 结构: 方格 + 对角线, 4重对称
   */
  generateCurvedSquareWeave(options = {}) {
    const grid = options.grid || 6;  // 网格大小
    const size = options.size || 10; // 整体尺寸

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    const step = (size * 2) / grid;

    // 生成网格顶点
    for (let y = 0; y <= grid; y++) {
      for (let x = 0; x <= grid; x++) {
        vertices.push([
          x * step - size,
          y * step - size,
          0
        ]);
      }
    }

    const idx = (x, y) => y * (grid + 1) + x;

    // 方格边
    for (let y = 0; y <= grid; y++) {
      for (let x = 0; x < grid; x++) {
        edges.push([idx(x, y), idx(x + 1, y)]);
        edges_assignment.push((x + y) % 2 === 0 ? 'M' : 'V');
        edges_foldAngle.push((x + y) % 2 === 0 ? 180 : -180);
      }
    }

    for (let x = 0; x <= grid; x++) {
      for (let y = 0; y < grid; y++) {
        edges.push([idx(x, y), idx(x, y + 1)]);
        edges_assignment.push((x + y) % 2 === 0 ? 'V' : 'M');
        edges_foldAngle.push((x + y) % 2 === 0 ? -180 : 180);
      }
    }

    // 对角线 (从左上到右下的斜线)
    for (let d = 0; d < grid; d++) {
      for (let x = 0; x < grid - d; x++) {
        const y = x + d;
        if (y < grid) {
          edges.push([idx(x, y), idx(x + 1, y + 1)]);
          edges_assignment.push('M');
          edges_foldAngle.push(180);
        }
      }
    }

    // 反对角线
    for (let d = 0; d < grid; d++) {
      for (let x = d; x < grid; x++) {
        const y = x - d;
        if (y >= 0 && y < grid) {
          edges.push([idx(x, y), idx(x + 1, y - 1)]);
          edges_assignment.push('V');
          edges_foldAngle.push(-180);
        }
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

    return this.createFoldResult(vertices, edges, faces, edges_assignment, edges_foldAngle, {
      title: `Curved Square Weave (${grid}x${grid})`,
      type: 'curved_square_weave',
      description: 'Curved Square Weave: grid with diagonal creases, alternating M/V'
    });
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
   * 优化M/V分配以满足Maekawa定理 (M-V = ±1)
   * 通过调整边界折痕的M/V类型来平衡
   * @param {Array} edges_assignment - 折痕赋值数组
   * @returns {Array} 优化后的赋值数组
   */
  optimizeMVAssignment(edges_assignment) {
    const optimized = [...edges_assignment];
    let mCount = 0, vCount = 0;

    // 统计当前M/V数量
    for (const a of optimized) {
      if (a === 'M') mCount++;
      if (a === 'V') vCount++;
    }

    let diff = mCount - vCount;

    // 如果差值绝对值大于1，尝试调整边界折痕
    while (Math.abs(diff) > 1) {
      const boundaryIdx = optimized.findIndex(a => a === 'B');
      if (boundaryIdx === -1) break;

      // 将边界转为M或V来平衡
      if (diff > 0) {
        // M太多，把B改成V
        optimized[boundaryIdx] = 'V';
        diff -= 2;
      } else {
        // V太多，把B改成M
        optimized[boundaryIdx] = 'M';
        diff += 2;
      }
    }

    return optimized;
  }

  /**
   * 创建标准FOLD结果
   */
  createFoldResult(vertices, edges, faces, assignment, foldAngle, metadata = {}) {
    return {
      file_spec: 1.1,
      file_creator: 'RadialOrigamiGenerator v1.0',
      file_classes: ['singleModel'],
      frame_title: metadata.title || 'Radial Origami',
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment: assignment,
      edges_foldAngle: foldAngle,
      metadata: {
        generator: 'RadialOrigamiGenerator v1.0',
        ...metadata
      }
    };
  }

  /**
   * 保存FOLD文件
   */
  saveFOLD(foldData, outputPath) {
    fs.mkdirSync(path.dirname(outputPath) || '.', { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(foldData, null, 2));
    console.log(`✅ FOLD已保存: ${outputPath}`);
    return outputPath;
  }
}

// CLI入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const type = args[0] || 'help';
  const output = args[1] || './output.fold';

  const gen = new RadialOrigamiGenerator();

  switch (type) {
    case 'star':
      gen.saveFOLD(gen.generateRadialStar({ arms: 10, layers: 3 }), output);
      break;

    case 'rings8':
      gen.saveFOLD(gen.generateRings8({ arms: 8, rings: 5 }), output);
      break;

    case 'csw':
      gen.saveFOLD(gen.generateCurvedSquareWeave({ grid: 6 }), output);
      break;

    case 'urchin':
      gen.saveFOLD(gen.generateUrchin({ arms: 10 }), output);
      break;

    case 'snowflake':
      gen.saveFOLD(gen.generateSnowflake({ arms: 6 }), output);
      break;

    case 'crane':
      gen.saveFOLD(gen.generateSimpleCrane(), output);
      break;

    case 'all': {
      const dir = path.dirname(output);
      fs.mkdirSync(dir || '.', { recursive: true });
      gen.saveFOLD(gen.generateRadialStar({ arms: 10, layers: 3 }), path.join(dir, 'radial_star.fold'));
      gen.saveFOLD(gen.generateUrchin({ arms: 10 }), path.join(dir, 'urchin.fold'));
      gen.saveFOLD(gen.generateSnowflake({ arms: 6 }), path.join(dir, 'snowflake.fold'));
      gen.saveFOLD(gen.generateSimpleCrane(), path.join(dir, 'simple_crane.fold'));
      console.log('✅ 所有折痕图已生成');
      break;
    }

    default:
      console.log(`
放射状折纸生成器 v1.1

用法: node radial-origami-generator.js <类型> [输出路径]

类型:
  star       - 放射星形 (10臂)
  rings8     - Rings8 风格环形放射 (8重对称)
  csw        - Curved Square Weave 风格
  urchin     - 海胆状放射体
  snowflake  - 雪花状 (6臂)
  crane      - 简化纸鹤
  all        - 生成所有类型

示例:
  node radial-origami-generator.js rings8 ./rings8.fold
  node radial-origami-generator.js csw ./csw.fold
  node radial-origami-generator.js all ./origami/
      `);
  }
}

module.exports = RadialOrigamiGenerator;