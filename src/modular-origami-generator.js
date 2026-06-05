/**
 * Modular Origami Unit Generator v2.0
 * 模块化折纸单元生成器
 *
 * 基于数学公式生成放射状折纸单元
 *
 * 设计原理：
 * - 星形结构由多个相同锥形单元组装而成
 * - 10角对称 = 10个主尖刺
 * - 每个尖刺的底部角度 = 36° (360°/10)
 * - 相邻单元底部重叠约10%
 */

const fs = require('fs');
const path = require('path');

class ModularOrigamiGenerator {
  constructor(options = {}) {
    this.spikeCount = options.spikeCount || 10;
    this.radius = options.radius || 10.0;
    this.unitLength = options.unitLength || 8.0;
    this.paperThickness = options.paperThickness || 0.1;
  }

  /**
   * 计算单元参数
   */
  calculateParameters() {
    const n = this.spikeCount;
    const r = this.radius;

    // 单元角度
    const alpha = 360 / n;

    // 底部宽度
    const bottomWidth = 2 * r * Math.sin(alpha / 2 * Math.PI / 180);

    // 折叠角
    const foldAngle = alpha / 2;

    // 尖顶角
    const tipAngle = 180 - alpha;

    // 建议重叠量
    const overlap = bottomWidth * 0.1;

    return {
      n,
      alpha,
      bottomWidth,
      foldAngle,
      tipAngle,
      overlap,
      unitLength: this.unitLength
    };
  }

  /**
   * 生成单个锥形单元的折痕图
   *
   * 单元展开图为等腰三角形
   *       A（尖顶，尖端角度 = tipAngle）
   *      / \
   *     /   \
   *    /     \
   *   B-------C  （底部边长 = bottomWidth）
   */
  generateSpikeUnit(params = null) {
    if (!params) params = this.calculateParameters();

    const { tipAngle, bottomWidth, unitLength } = params;

    // 计算等腰三角形的坐标
    // A = (0, unitLength) 尖顶
    // B = (-bottomWidth/2, 0) 左下
    // C = (bottomWidth/2, 0) 右下

    const vertices = [
      [0, unitLength, 0],                    // 0: 尖顶 A
      [-bottomWidth / 2, 0, 0],             // 1: 左下 B
      [bottomWidth / 2, 0, 0]               // 2: 右下 C
    ];

    // 折痕
    const edges = [
      [0, 1],  // A-B
      [0, 2],  // A-C
      [1, 2]   // B-C 底部
    ];

    // 折痕赋值：M=山折, V=谷折, B=边界
    const edges_assignment = ['M', 'M', 'B'];
    const edges_foldAngle = [180, 180, 0];

    // 面：单个三角形
    const faces = [[0, 1, 2]];

    return {
      file_spec: 1.1,
      file_creator: 'ModularOrigamiGenerator v2.0',
      file_classes: ['singleModel'],
      frame_title: `Spike Unit (tipAngle=${tipAngle.toFixed(1)}°, bottom=${bottomWidth.toFixed(2)}cm)`,
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment,
      edges_foldAngle,
      metadata: {
        type: 'modular_unit',
        parameters: params
      }
    };
  }

  /**
   * 生成带折叠导向的单元（更精确的折痕）
   */
  generateDetailedSpikeUnit(params = null) {
    if (!params) params = this.calculateParameters();

    const { tipAngle, bottomWidth, unitLength, foldAngle } = params;

    // 更复杂的折痕设计
    // 添加中线和辅助折痕

    const vertices = [
      [0, unitLength, 0],                    // 0: 尖顶 A
      [-bottomWidth / 2, 0, 0],             // 1: 左下 B
      [bottomWidth / 2, 0, 0],               // 2: 右下 C
      [0, 0, 0],                              // 3: 底部中点 D（折痕终点）
      [-bottomWidth / 4, unitLength / 2, 0], // 4: 左中折痕辅助点
      [bottomWidth / 4, unitLength / 2, 0]   // 5: 右中折痕辅助点
    ];

    // 主折痕 A-B, A-C, A-D
    // 辅助折痕用于精确折叠
    const edges = [
      [0, 1],  // A-B 主折痕
      [0, 2],  // A-C 主折痕
      [0, 3],  // A-D 中心折痕
      [1, 2],  // B-C 底部
      [1, 4],  // B-4 辅助
      [2, 5],  // C-5 辅助
      [4, 5]   // 4-5 横向辅助
    ];

    const edges_assignment = ['M', 'M', 'M', 'B', 'V', 'V', 'B'];
    const edges_foldAngle = [180, 180, 180, 0, -45, -45, 0];

    const faces = [[0, 1, 3], [0, 3, 2], [1, 4, 3], [2, 3, 5]];

    return {
      file_spec: 1.1,
      file_creator: 'ModularOrigamiGenerator v2.0 (detailed)',
      file_classes: ['singleModel'],
      frame_title: `Detailed Spike Unit (foldAngle=${foldAngle}°)`,
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment,
      edges_foldAngle,
      metadata: {
        type: 'modular_unit_detailed',
        parameters: params
      }
    };
  }

  /**
   * 生成组装示意图（显示10个单元如何排列）
   */
  generateAssemblyGuide() {
    const params = this.calculateParameters();
    const { n, alpha, bottomWidth } = params;

    const vertices = [];
    const edges = [];
    const faces = [];

    // 中心点
    const centerIdx = 0;
    vertices.push([0, 0, 0]);

    // 生成n个单元的位置点（底部端点）
    for (let i = 0; i < n; i++) {
      const angle = (alpha * i - 90) * Math.PI / 180; // 从顶部开始
      const x = bottomWidth / 2 * Math.cos(angle);
      const y = bottomWidth / 2 * Math.sin(angle);
      vertices.push([x, y, 0]);
    }

    // 添加组装线（显示如何连接）
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      edges.push([0, i + 1]); // 中心到各点
      edges.push([i + 1, next + 1]); // 相邻点连接
    }

    // 边界
    const edges_assignment = edges.map(() => 'B');
    const edges_foldAngle = edges.map(() => 0);

    return {
      file_spec: 1.1,
      file_creator: 'ModularOrigamiGenerator v2.0',
      file_classes: ['singleModel'],
      frame_title: `Assembly Guide (${n} units at ${alpha}° intervals)`,
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment,
      edges_foldAngle,
      metadata: {
        type: 'assembly_guide',
        unitCount: n,
        unitAngle: alpha,
        bottomWidth,
        assemblyInstructions: `Arrange ${n} units at ${alpha}° intervals around center. Overlap bottoms by ~10%.`
      }
    };
  }

  /**
   * 生成完整的星形组装折痕图（模拟组装后的效果）
   */
  generateAssembledStar() {
    const params = this.calculateParameters();
    const { n, alpha, bottomWidth, unitLength } = params;

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    // 中心点
    vertices.push([0, 0, 0]);
    const centerIdx = 0;

    // 生成10个尖刺顶点
    for (let i = 0; i < n; i++) {
      const angle = (alpha * i - 90) * Math.PI / 180;
      vertices.push([
        Math.cos(angle) * unitLength,
        Math.sin(angle) * unitLength,
        unitLength * 0.5 // 高度
      ]);
    }

    // 中心到每个尖刺的折痕（山折）
    for (let i = 0; i < n; i++) {
      edges.push([centerIdx, i + 1]);
      edges_assignment.push('M');
      edges_foldAngle.push(180);
    }

    // 相邻尖刺之间的连接（谷折）
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      edges.push([i + 1, next + 1]);
      edges_assignment.push('V');
      edges_foldAngle.push(-180);
    }

    // 添加底部连接形成星形轮廓
    for (let i = 0; i < n; i++) {
      const angle = (alpha * i - 90 + alpha / 2) * Math.PI / 180;
      const idx = vertices.length;
      vertices.push([
        Math.cos(angle) * bottomWidth * 0.3,
        Math.sin(angle) * bottomWidth * 0.3,
        0
      ]);
    }

    // 外层连接
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const currInner = n + 1 + i;
      const nextInner = n + 1 + next;

      // 内圈到外圈
      edges.push([i + 1, currInner]);
      edges_assignment.push('M');
      edges_foldAngle.push(180);
    }

    // 面：从中心到相邻尖刺的三角形
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      faces.push([centerIdx, i + 1, next + 1]);
    }

    return {
      file_spec: 1.1,
      file_creator: 'ModularOrigamiGenerator v2.0',
      file_classes: ['singleModel'],
      frame_title: `Assembled Star (${n}-point radial symmetry)`,
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment,
      edges_foldAngle,
      metadata: {
        type: 'assembled_star',
        parameters: params,
        description: 'Simulation of assembled modular origami star'
      }
    };
  }

  /**
   * 批量生成单元 FOLD 文件
   */
  generateBatchUnits(outputDir, options = {}) {
    const params = this.calculateParameters();
    const count = options.count || this.spikeCount;
    const type = options.type || 'simple';

    // 确保目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const results = [];

    for (let i = 0; i < count; i++) {
      const foldData = type === 'detailed'
        ? this.generateDetailedSpikeUnit(params)
        : this.generateSpikeUnit(params);

      const filename = `unit_${String(i + 1).padStart(2, '0')}.fold`;
      const filepath = path.join(outputDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(foldData, null, 2));
      results.push({ index: i + 1, filename, filepath });
    }

    return {
      params,
      unitsGenerated: count,
      outputDir,
      files: results
    };
  }

  /**
   * 保存为 FOLD 文件
   */
  saveFOLD(foldData, outputPath) {
    fs.mkdirSync(path.dirname(outputPath) || '.', { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(foldData, null, 2));
    console.log(`✅ FOLD 文件已保存: ${outputPath}`);
    return outputPath;
  }

  /**
   * 生成完整报告
   */
  generateReport() {
    const params = this.calculateParameters();

    const report = `
================================================================================
模块化折纸单元设计报告
Modular Origami Unit Design Report
================================================================================

设计参数 Design Parameters
--------------------------------------------------------------------------------
尖刺数量 (Spike Count):    ${params.n}
单元角度 (Unit Angle):       ${params.alpha}°
底部宽度 (Bottom Width):     ${params.bottomWidth.toFixed(3)} cm
折叠角 (Fold Angle):         ${params.foldAngle}°
尖顶角 (Tip Angle):          ${params.tipAngle}°
建议重叠 (Overlap):          ${params.overlap.toFixed(3)} cm
单元长度 (Unit Length):       ${params.unitLength} cm

组装说明 Assembly Instructions
--------------------------------------------------------------------------------
1. 准备 ${params.n} 个相同的锥形单元
2. 每个单元底部宽度: ${params.bottomWidth.toFixed(2)} cm
3. 按 ${params.alpha}° 间隔排列单元，围绕中心点
4. 相邻单元底部重叠约 ${params.overlap.toFixed(2)} cm
5. 在中心点汇聚并固定

数学公式 Mathematical Formulas
--------------------------------------------------------------------------------
单元角度:     α = 360°/n = 360°/${params.n} = ${params.alpha}°
底部宽度:     W = 2r × sin(α/2) = 2 × ${this.radius} × sin(${params.alpha}/2) = ${params.bottomWidth.toFixed(3)}
尖顶角:       θ = 180° - α = 180° - ${params.alpha} = ${params.tipAngle}°

与 Origami Simulator 的结合
--------------------------------------------------------------------------------
1. 生成 assembled_star.fold 在 Origami Simulator 中预览整体效果
2. 生成 spike_unit_detailed.fold 验证单元折叠可行性
3. 生成 assembly_guide.fold 了解组装位置

================================================================================
`;

    return report;
  }
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const outputDir = args[1] || './modular-origami-output';

  const generator = new ModularOrigamiGenerator({
    spikeCount: 10,
    radius: 10.0,
    unitLength: 8.0
  });

  switch (command) {
    case 'unit': {
      // 生成单个单元
      const foldData = generator.generateSpikeUnit();
      const outputPath = path.join(outputDir, 'spike_unit.fold');
      generator.saveFOLD(foldData, outputPath);
      break;
    }

    case 'detailed': {
      // 生成详细单元
      const foldData = generator.generateDetailedSpikeUnit();
      const outputPath = path.join(outputDir, 'spike_unit_detailed.fold');
      generator.saveFOLD(foldData, outputPath);
      break;
    }

    case 'assembly': {
      // 生成组装示意图
      const foldData = generator.generateAssemblyGuide();
      const outputPath = path.join(outputDir, 'assembly_guide.fold');
      generator.saveFOLD(foldData, outputPath);
      break;
    }

    case 'star': {
      // 生成组装体预览
      const foldData = generator.generateAssembledStar();
      const outputPath = path.join(outputDir, 'assembled_star.fold');
      generator.saveFOLD(foldData, outputPath);
      break;
    }

    case 'batch': {
      // 批量生成
      const result = generator.generateBatchUnits(outputDir, { count: 10, type: 'simple' });
      console.log(`✅ 生成了 ${result.unitsGenerated} 个单元`);
      console.log(`📁 输出目录: ${result.outputDir}`);

      // 保存设计报告
      const report = generator.generateReport();
      const reportPath = path.join(outputDir, 'design_report.txt');
      fs.writeFileSync(reportPath, report);
      console.log(`📄 设计报告: ${reportPath}`);
      console.log(report);
      break;
    }

    case 'params': {
      // 只显示参数
      const params = generator.calculateParameters();
      console.log('设计参数:');
      console.log(JSON.stringify(params, null, 2));
      break;
    }

    case 'all': {
      // 生成所有文件
      console.log('生成所有文件...\n');

      generator.saveFOLD(generator.generateSpikeUnit(), path.join(outputDir, 'spike_unit.fold'));
      generator.saveFOLD(generator.generateDetailedSpikeUnit(), path.join(outputDir, 'spike_unit_detailed.fold'));
      generator.saveFOLD(generator.generateAssemblyGuide(), path.join(outputDir, 'assembly_guide.fold'));
      generator.saveFOLD(generator.generateAssembledStar(), path.join(outputDir, 'assembled_star.fold'));

      const report = generator.generateReport();
      const reportPath = path.join(outputDir, 'design_report.txt');
      fs.writeFileSync(reportPath, report);
      console.log(report);
      break;
    }

    default:
      console.log(`
模块化折纸单元生成器 v2.0
Modular Origami Unit Generator v2.0

用法:
  node modular-origami-generator.js <command> [output_dir]

命令:
  unit       生成单个锥形单元
  detailed   生成详细单元（带辅助折痕）
  assembly   生成组装示意图
  star       生成组装体预览
  batch      批量生成10个单元
  params     显示设计参数
  all        生成所有文件
  help       显示帮助

示例:
  node modular-origami-generator.js unit ./output
  node modular-origami-generator.js all ./modular-output
      `);
  }
}

module.exports = ModularOrigamiGenerator;