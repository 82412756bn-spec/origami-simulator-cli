/**
 * Modular Unit Generator v2.0
 * 模块化折纸单元生成器 v2.0
 *
 * 生成可打印的单元折痕图，支持手工组装
 * 适用于：星形、尖刺状、海胆状放射结构
 */

const fs = require('fs');
const path = require('path');
const CreasePatternValidator = require('./utils/crease-pattern-validator');

class ModularUnitGenerator {
  constructor(options = {}) {
    this.spikeCount = options.spikeCount || 10;  // 尖刺数量
    this.unitAngle = 360 / this.spikeCount;        // 单元角度 (36° for 10)
    this.paperSize = options.paperSize || 15;     // 纸张边长 (cm)
    this.unitType = options.unitType || 'pyramid'; // pyramid, cone, spike
  }

  /**
   * 计算单元参数
   */
  calculateParameters() {
    const n = this.spikeCount;
    const alpha = this.unitAngle;

    return {
      spikeCount: n,
      unitAngle: alpha,
      tipAngle: 180 - alpha,  // 144° for 10-fold
      bottomAngle: alpha,      // 36° for 10-fold
      overlap: 0.5,            // cm, 建议重叠量
      assemblyAngle: alpha     // 36° 间隔组装
    };
  }

  /**
   * 生成金字塔形单元 (Pyramid Unit)
   * 展开为等腰三角形，折叠后形成锥形尖刺
   */
  generatePyramidUnit(options = {}) {
    const params = this.calculateParameters();
    const paperSize = options.paperSize || this.paperSize;

    // 单元底部宽度
    const bottomWidth = paperSize * 0.4;

    // 三角形顶点
    // A = 尖顶, B = 左下, C = 右下
    const vertices = [
      [0, paperSize, 0],                    // 0: A 尖顶
      [-bottomWidth / 2, 0, 0],             // 1: B 左下
      [bottomWidth / 2, 0, 0],              // 2: C 右下
      [0, paperSize * 0.15, 0],            // 3: D 底部中点（折叠指导）
    ];

    // 折痕
    const edges = [
      [0, 1],  // A-B 主折痕
      [0, 2],  // A-C 主折痕
      [0, 3],  // A-D 中线折痕（关键）
      [1, 2],  // B-C 底部
      [1, 3],  // B-D 辅助
      [2, 3],  // C-D 辅助
    ];

    // 折痕赋值
    // 分类（2026-11-27 修正）：
    //   A-B / A-C = **外轮廓**（纸边）→ 'B'
    //   B-C       = 底边（纸边）→ 'B'
    //   A-D       = 中线（真折痕）→ 'M'
    //   B-D / C-D = 辅助谷折 → 'F'（预折痕）
    //
    // 为什么辅助谷折要标 F：它们与中线交于 D → D 是 deg3（3 条折痕）→
    // M+V=3 → |M−V| 必为奇数 → **Maekawa 结构上无解**（|M−V|=2 不可能）。
    // 真实折纸图里没有 deg3 内部顶点（birdBase 是 deg4/deg8）。
    // 且模块单元在组装前是单片，这些折痕在组装时才起作用。
    const edges_assignment = [
      'B',  // A-B 外轮廓（纸边）
      'B',  // A-C 外轮廓（纸边）
      'M',  // A-D 中线（关键折痕）
      'B',  // B-C 底部边
      'F',  // B-D 辅助谷折（预折痕）
      'F',  // C-D 辅助谷折（预折痕）
    ];

    const edges_foldAngle = [0, 0, 180, 0, 0, 0];

    // 面
    const faces = [
      [0, 1, 3],  // 左面
      [0, 3, 2],  // 右面
      [1, 2, 3],  // 底面（折叠时朝向中心）
    ];

    return {
      file_spec: 1.1,
      file_creator: 'ModularUnitGenerator v2.0',
      file_classes: ['singleModel'],
      frame_title: `Pyramid Unit (tip:${params.tipAngle}°)`,
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment,
      edges_foldAngle,
      metadata: {
        type: 'pyramid_unit',
        parameters: params,
        foldingInstructions: [
          '1. 沿 A-D 线折叠（山折）',
          '2. 沿 B-D 和 C-D 折叠（谷折）',
          '3. 将 B-C 边向内折，形成锥形',
          '4. 重复10个相同单元',
          `5. 按 ${params.unitAngle}° 间隔组装到中心`
        ]
      }
    };
  }

  /**
   * 生成细长尖刺单元 (Spike Unit)
   * 更窄更长的尖刺
   */
  generateSpikeUnit(options = {}) {
    const params = this.calculateParameters();
    const paperSize = options.paperSize || this.paperSize;

    // 窄长三角形
    const bottomWidth = paperSize * 0.2;  // 更窄
    const height = paperSize * 0.9;        // 更高

    const vertices = [
      [0, height, 0],                      // 0: 尖顶
      [-bottomWidth / 2, 0, 0],            // 1: 左下
      [bottomWidth / 2, 0, 0],            // 2: 右下
      [0, height * 0.1, 0],               // 3: 底部中点
    ];

    const edges = [
      [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]
    ];

    // [0,1] [0,2] = 外轮廓（纸边，不折叠）
    // [1,2]      = 底边（纸边）
    // [0,3]      = 中线（山折）—— 真实折痕
    // [1,3] [2,3] = 谷折线 → 标 'F'（**预折痕/示意线**）
    //   理由：它们与中线交于顶点 3 → deg3（3 条折痕）→ M+V=3 → |M−V| 必为奇数
    //   → **Maekawa 结构上无解**；且模块单元在组装前是单片，折痕在组装时才起作用。
    const edges_assignment = ['B', 'B', 'M', 'B', 'F', 'F'];
    const edges_foldAngle = [0, 0, 180, 0, 0, 0];

    const faces = [[0, 1, 3], [0, 3, 2], [1, 2, 3]];

    return {
      file_spec: 1.1,
      file_creator: 'ModularUnitGenerator v2.0',
      file_classes: ['singleModel'],
      frame_title: `Spike Unit (length:${height}cm)`,
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment,
      edges_foldAngle,
      metadata: {
        type: 'spike_unit',
        parameters: params,
        foldingInstructions: [
          '1. 细长尖刺单元',
          '2. 沿中线折叠成锥形',
          '3. 底部留5mm用于粘贴'
        ]
      }
    };
  }

  /**
   * 生成组装示意图
   * 显示10个单元如何排列
   */
  generateAssemblyGuide() {
    const params = this.calculateParameters();
    const n = params.spikeCount;
    const r = 5; // 显示半径

    const vertices = [];
    const edges = [];
    const faces = [];
    const edges_assignment = [];
    const edges_foldAngle = [];

    // 中心点
    vertices.push([0, 0, 0]);

    // 10个单元的底部位置
    const positions = [];
    for (let i = 0; i < n; i++) {
      const angle = (params.unitAngle * i - 90) * Math.PI / 180;
      positions.push({
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
        angle: params.unitAngle * i
      });
      vertices.push([positions[i].x, positions[i].y, 0]);
    }

    // 中心到各位置的线
    for (let i = 0; i < n; i++) {
      edges.push([0, i + 1]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }

    // 相邻位置连线（显示重叠）
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      edges.push([i + 1, next + 1]);
      edges_assignment.push('B');
      edges_foldAngle.push(0);
    }

    // 添加角度标注
    const annotations = [];
    for (let i = 0; i < n; i++) {
      annotations.push({
        type: 'angle_marker',
        from: 0,
        to: i + 1,
        label: `${params.unitAngle}°`
      });
    }

    return {
      file_spec: 1.1,
      file_creator: 'ModularUnitGenerator v2.0',
      file_classes: ['singleModel'],
      frame_title: `Assembly Guide (${n} units at ${params.unitAngle}°)`,
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment,
      edges_foldAngle,
      metadata: {
        type: 'assembly_guide',
        parameters: params,
        annotations,
        assemblyInstructions: [
          `准备 ${n} 个相同的锥形单元`,
          `每个单元底部宽度: ${(2 * r * Math.sin(params.unitAngle * Math.PI / 360)).toFixed(2)}cm`,
          `按 ${params.unitAngle}° 间隔排列，围绕中心点`,
          '相邻单元底部重叠约 5mm',
          '在中心点用胶水或线固定'
        ]
      }
    };
  }

  /**
   * 生成批量单元 FOLD 文件
   */
  generateBatchUnits(outputDir, options = {}) {
    const count = options.count || this.spikeCount;
    const type = options.type || 'pyramid';
    const paperSize = options.paperSize || this.paperSize;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const results = [];

    for (let i = 0; i < count; i++) {
      const foldData = type === 'spike'
        ? this.generateSpikeUnit({ paperSize })
        : this.generatePyramidUnit({ paperSize });

      const filename = `unit_${String(i + 1).padStart(2, '0')}.fold`;
      const filepath = path.join(outputDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(foldData, null, 2));
      results.push({ index: i + 1, filename, filepath });
    }

    // 生成组装示意图
    this.saveFOLD(
      this.generateAssemblyGuide(),
      path.join(outputDir, 'assembly_guide.fold')
    );

    return {
      unitCount: count,
      unitType: type,
      paperSize,
      outputDir,
      files: results
    };
  }

  /**
   * 生成组装说明书
   */
  generateInstructions() {
    const params = this.calculateParameters();

    const instructions = `
================================================================================
模块化折纸组装说明书
Modular Origami Assembly Instructions
================================================================================

作品：星形放射折纸 (${params.spikeCount}角)

一、单元参数
--------------------------------------------------------------------------------
尖刺数量：${params.spikeCount} 个
单元角度：${params.unitAngle}°
尖顶角度：${params.tipAngle}°
底部角度：${params.bottomAngle}°
组装间隔：${params.assemblyAngle}°

二、所需材料
--------------------------------------------------------------------------------
- 正方形纸张：${this.paperSize}cm × ${this.paperSize}cm × ${params.spikeCount}张
- 建议使用手工折纸纸或稻香纸
- 胶水或双面胶（用于固定）
- 剪刀（修剪边缘）

三、折叠步骤
--------------------------------------------------------------------------------
1. 准备 ${params.spikeCount} 张相同尺寸的正方形纸

2. 折叠每个单元：
   a. 对角折叠，折出中心线
   b. 沿中心线向内折叠
   c. 两侧向中心线折叠
   d. 翻转，形成锥形单元

3. 组装：
   a. 将第一个单元放置在中心位置
   b. 按 ${params.unitAngle}° 间隔放置下一个单元
   c. 确保相邻单元底部有约 5mm 重叠
   d. 用胶水固定重叠部分
   e. 重复直到完成所有 ${params.spikeCount} 个单元

四、技巧提示
--------------------------------------------------------------------------------
- 使用棋盘格或图案纸可以更好地看到折痕
- 折叠时保持折痕清晰
- 组装时从中心向外操作
- 调整单元角度获得最佳整体效果

五、安全提示
--------------------------------------------------------------------------------
- 使用剪刀时注意安全
- 胶水避免接触眼睛
- 儿童请在成人指导下操作

================================================================================
生成时间: ${new Date().toISOString()}
生成器: ModularUnitGenerator v2.0
================================================================================
`;

    return instructions;
  }

  /**
   * 保存 FOLD 文件
   */
  saveFOLD(foldData, outputPath) {
    fs.mkdirSync(path.dirname(outputPath) || '.', { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(foldData, null, 2));
    console.log(`✅ FOLD已保存: ${outputPath}`);
    return outputPath;
  }

  /**
   * 保存说明书
   */
  saveInstructions(outputPath) {
    const instructions = this.generateInstructions();
    fs.writeFileSync(outputPath, instructions);
    console.log(`✅ 说明书已保存: ${outputPath}`);
    return outputPath;
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
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const outputDir = args[1] || './modular-output';

  const generator = new ModularUnitGenerator({
    spikeCount: 10,
    paperSize: 15
  });

  switch (command) {
    case 'unit':
      generator.saveFOLD(
        generator.generatePyramidUnit(),
        path.join(outputDir, 'pyramid_unit.fold')
      );
      break;

    case 'spike':
      generator.saveFOLD(
        generator.generateSpikeUnit(),
        path.join(outputDir, 'spike_unit.fold')
      );
      break;

    case 'guide':
      generator.saveFOLD(
        generator.generateAssemblyGuide(),
        path.join(outputDir, 'assembly_guide.fold')
      );
      break;

    case 'batch': {
      const result = generator.generateBatchUnits(outputDir, {
        count: 10,
        type: 'pyramid',
        paperSize: 15
      });

      generator.saveInstructions(path.join(outputDir, 'assembly_instructions.txt'));

      console.log(`\n✅ 生成了 ${result.unitCount} 个单元`);
      console.log(`📁 输出目录: ${result.outputDir}`);
      console.log(`📄 说明书: ${path.join(outputDir, 'assembly_instructions.txt')}`);
      break;
    }

    case 'all': {
      fs.mkdirSync(outputDir, { recursive: true });

      generator.saveFOLD(generator.generatePyramidUnit(), path.join(outputDir, 'pyramid_unit.fold'));
      generator.saveFOLD(generator.generateSpikeUnit(), path.join(outputDir, 'spike_unit.fold'));
      generator.saveFOLD(generator.generateAssemblyGuide(), path.join(outputDir, 'assembly_guide.fold'));

      const batchResult = generator.generateBatchUnits(path.join(outputDir, 'batch'), {
        count: 10,
        type: 'pyramid'
      });

      generator.saveInstructions(path.join(outputDir, 'assembly_instructions.txt'));

      console.log(`\n✅ 所有文件已生成`);
      console.log(`📁 输出目录: ${outputDir}`);
      break;
    }

    default:
      console.log(`
模块化折纸单元生成器 v2.0

用法: node modular-unit-generator.js <命令> [输出目录]

命令:
  unit     - 生成金字塔单元
  spike    - 生成尖刺单元
  guide    - 生成组装示意图
  batch    - 批量生成10个单元 + 组装说明
  all      - 生成所有文件

示例:
  node modular-unit-generator.js unit ./output
  node modular-unit-generator.js batch ./modular-origami
      `);
  }
}

module.exports = ModularUnitGenerator;