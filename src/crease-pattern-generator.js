/**
 * Crease Pattern Generator - 单中心放射对称版本
 * 针对星形折纸镶嵌艺术品（10角放射对称）
 */

const fs = require('fs');
const path = require('path');

class CreasePatternGenerator {
  constructor(options = {}) {
    this.symmetry = options.symmetry || 10;
    this.radius = options.radius || 1.0;
  }

  /**
   * 生成单中心放射对称星形折纸折痕图
   * 模拟雪花/星星形状，从中心向外放射
   */
  generateStarTessellation(options = {}) {
    const arms = options.arms || this.symmetry; // 放射臂数量
    const rings = options.rings || 4; // 每个臂的层数
    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    // 添加中心点
    const centerIdx = 0;
    vertices.push([0, 0, 0]);

    // 辅助函数：计算角度对应的顶点索引
    const getArmVertices = (arm, ring) => {
      // ring 0 = 中心, ring 1 = 第一层, ...
      const baseIdx = 1 + arm * rings + ring;
      return baseIdx;
    };

    // 生成顶点：按臂组织
    // 顶点索引: 0 = 中心
    // 1 到 symmetry*layers = 各臂各层的顶点
    for (let arm = 0; arm < arms; arm++) {
      for (let ring = 1; ring <= rings; ring++) {
        const angle = (2 * Math.PI * arm) / arms - Math.PI / 2;
        const r = (ring / rings) * this.radius;
        vertices.push([r * Math.cos(angle), r * Math.sin(angle), 0]);
      }
    }

    // 边界顶点（形成星形边界）
    const boundarySize = this.radius * 1.4;
    const boundaryIndices = [];

    // 8个边界点形成星形轮廓
    for (let i = 0; i < 8; i++) {
      const angle = (2 * Math.PI * i) / 8 - Math.PI / 8;
      const r = boundarySize;
      boundaryIndices.push(vertices.length);
      vertices.push([r * Math.cos(angle), r * Math.sin(angle), 0]);
    }

    // 添加边界边
    for (let i = 0; i < 8; i++) {
      edges.push([boundaryIndices[i], boundaryIndices[(i + 1) % 8]]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }

    // 添加从中心到第一层每个臂的折痕（主折痕）
    for (let arm = 0; arm < arms; arm++) {
      const firstRingIdx = 1 + arm * rings + 1; // 第一环的索引
      edges.push([centerIdx, firstRingIdx]);
      // 交替山折/谷折
      edges_assignment.push(arm % 2 === 0 ? 'M' : 'V');
      edges_foldAngle.push(arm % 2 === 0 ? 180 : -180);
    }

    // 添加每个臂内的垂直连接
    for (let arm = 0; arm < arms; arm++) {
      for (let ring = 1; ring < rings; ring++) {
        const currentIdx = 1 + arm * rings + ring;
        const nextRingIdx = 1 + arm * rings + ring + 1;
        edges.push([currentIdx, nextRingIdx]);
        edges_assignment.push('M');
        edges_foldAngle.push(180);
      }
    }

    // 添加相邻臂之间的连接（形成三角形网格）
    // 每层创建一个三角形带
    for (let ring = 1; ring <= rings; ring++) {
      for (let arm = 0; arm < arms; arm++) {
        const nextArm = (arm + 1) % arms;

        const idx1 = 1 + arm * rings + ring;
        const idx2 = 1 + nextArm * rings + ring;

        // 添加跨臂连接
        edges.push([idx1, idx2]);
        edges_assignment.push(ring % 2 === 0 ? 'V' : 'M');
        edges_foldAngle.push(ring % 2 === 0 ? -180 : 180);

        // 创建三角形面
        // 对于 ring=1: 中心-臂1-臂2 形成三角形
        if (ring === 1) {
          faces.push([centerIdx, idx1, idx2]);
        }

        // 对于 ring>1: 相邻臂的同层顶点与上一层形成四边形
        if (ring > 1) {
          const prevIdx1 = 1 + arm * rings + ring - 1;
          const prevIdx2 = 1 + nextArm * rings + ring - 1;

          // 两个三角形
          faces.push([prevIdx1, idx1, prevIdx2]);
          faces.push([prevIdx2, idx1, idx2]);
        }
      }
    }

    return {
      file_spec: 1.1,
      file_creator: 'CreasePatternGenerator v2.0 (Single-Center Radial)',
      file_classes: ['singleModel'],
      frame_title: `Star Tessellation (${arms}-fold single-center)`,
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment,
      edges_foldAngle
    };
  }

  /**
   * 生成 Miura-Ori 折痕图
   */
  generateMiuraOri(rows = 5, cols = 5) {
    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    const dx = this.radius / cols;
    const dy = this.radius / rows;

    // 创建顶点网格
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        vertices.push([col * dx, row * dy, 0]);
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
        edges_assignment.push((row + col) % 2 === 0 ? 'V' : 'M');
        edges_foldAngle.push((row + col) % 2 === 0 ? -180 : 180);
      }
    }

    // 生成三角形面
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const topLeft = row * (cols + 1) + col;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + cols + 1;
        const bottomRight = bottomLeft + 1;

        faces.push([topLeft, topRight, bottomLeft]);
        faces.push([topRight, bottomRight, bottomLeft]);
      }
    }

    return {
      file_spec: 1.1,
      file_creator: 'CreasePatternGenerator v2.0',
      file_classes: ['singleModel'],
      frame_title: 'Miura-Ori',
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment,
      edges_foldAngle
    };
  }

  /**
   * 保存为 FOLD 文件
   */
  saveFOLD(foldData, outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(foldData, null, 2));
    console.log(`FOLD 文件已保存: ${outputPath}`);
  }
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const type = args[0] || 'star';
  const output = args[1] || './output.fold';

  const generator = new CreasePatternGenerator({ symmetry: 10, radius: 1.0 });

  let foldData;
  switch (type) {
    case 'star':
      foldData = generator.generateStarTessellation({ arms: 10, rings: 5 });
      break;
    case 'miura':
      foldData = generator.generateMiuraOri(5, 5);
      break;
    default:
      console.error(`未知类型: ${type}`);
      console.log('可用类型: star, miura');
      process.exit(1);
  }

  const dir = path.dirname(output);
  if (dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  generator.saveFOLD(foldData, output);
}

module.exports = CreasePatternGenerator;