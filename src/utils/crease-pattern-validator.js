/**
 * Crease Pattern Validator
 * 折痕图验证器 - 基于折纸数学定理
 *
 * 验证理论:
 * 1. Kawasaki定理: 交替角度之和=180° → 平折可行
 * 2. Maekawa定理: Mountain-Valley差=±1 → 折痕平衡
 * 3. FOLD格式完整性验证 (支持 FOLD v1.2)
 *
 * FOLD v1.2 新增特性:
 * - C (Cut/Slit) 和 J (Join) 边赋值支持
 * - faceOrders 面层顺序验证
 * - edgeOrders 边层顺序验证
 */

class CreasePatternValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * 验证完整折痕图
   * @param {Object} foldData - FOLD格式数据
   * @param {Object} options - 验证选项
   * @param {boolean} options.skipFaceValidation - 跳过面部验证（适用于折痕图）
   * @returns {Object} 验证结果
   */
  validate(foldData, options = {}) {
    this.errors = [];
    this.warnings = [];

    const result = {
      valid: true,
      errors: [],
      warnings: [],
      summary: {}
    };

    // 检查是否为折痕图模式
    const isCreasePattern = foldData.file_classes?.includes('creasePattern');

    // 1. 格式验证
    this.validateFormat(foldData);

    // 2. Maekawa定理验证 (M/V平衡) - 仅对折叠模型
    if (!isCreasePattern) {
      this.validateMaekawaTheorem(foldData);
    }

    // 3. 边界面验证
    this.validateBoundaryEdges(foldData);

    // 4. 顶点连通性验证
    this.validateVertexConnectivity(foldData);

    // 5. 面完整性验证 - 跳过折痕图（它们是2D的）
    if (!options.skipFaceValidation && !isCreasePattern) {
      this.validateFaces(foldData);
    }

    // 6. FOLD v1.2: 面层顺序验证
    this.validateFaceOrders(foldData);

    // 7. FOLD v1.2: 边层顺序验证
    this.validateEdgeOrders(foldData);

    result.valid = this.errors.length === 0;
    result.errors = [...this.errors];
    result.warnings = [...this.warnings];
    result.summary = this.getSummary(foldData);

    return result;
  }

  /**
   * 验证FOLD格式完整性
   */
  validateFormat(foldData) {
    const required = ['file_spec', 'vertices_coords', 'edges_vertices', 'edges_assignment', 'edges_foldAngle'];

    for (const field of required) {
      if (!foldData[field]) {
        this.errors.push(`缺少必需字段: ${field}`);
      }
    }

    if (foldData.edges_vertices && foldData.edges_assignment) {
      if (foldData.edges_vertices.length !== foldData.edges_assignment.length) {
        this.errors.push(`边数量不匹配: edges_vertices=${foldData.edges_vertices.length}, edges_assignment=${foldData.edges_assignment.length}`);
      }
    }

    // 验证assignments只包含有效值
    // FOLD v1.2 支持: M, V, B, F, U, C, J (大小写)
    if (foldData.edges_assignment) {
      const validAssignments = ['M', 'V', 'B', 'F', 'U', 'C', 'J', 'm', 'v', 'b', 'f', 'u', 'c', 'j'];
      for (let i = 0; i < foldData.edges_assignment.length; i++) {
        const a = foldData.edges_assignment[i];
        if (!validAssignments.includes(a)) {
          this.errors.push(`无效的折痕赋值在边 ${i}: "${a}"`);
        }
      }

      // FOLD v1.2: 统计特殊赋值
      const cCount = foldData.edges_assignment.filter(a => a === 'C' || a === 'c').length;
      const jCount = foldData.edges_assignment.filter(a => a === 'J' || a === 'j').length;
      if (cCount > 0) {
        this.warnings.push(`检测到 ${cCount} 个 Cut/Slit (C) 边赋值 (FOLD v1.2)`);
      }
      if (jCount > 0) {
        this.warnings.push(`检测到 ${jCount} 个 Join (J) 边赋值 (FOLD v1.2)`);
      }
    }
  }

  /**
   * 验证Maekawa定理: M-V = ±1
   * 在一个有效的折痕图中，山折和谷折的数量之差总为±1
   * 注意: C (Cut) 和 J (Join) 边不参与 M-V 计算
   */
  validateMaekawaTheorem(foldData) {
    if (!foldData.edges_assignment) return;

    const counts = { M: 0, V: 0, C: 0, J: 0, other: 0 };

    for (const a of foldData.edges_assignment) {
      if (a === 'M' || a === 'm') counts.M++;
      else if (a === 'V' || a === 'v') counts.V++;
      else if (a === 'C' || a === 'c') counts.C++;
      else if (a === 'J' || a === 'j') counts.J++;
      else counts.other++;
    }

    const mountain = counts.M;
    const valley = counts.V;
    const diff = mountain - valley;

    // Maekawa定理: |M - V| = 1 (对于单纸折叠)
    if (Math.abs(diff) !== 1 && mountain + valley > 0) {
      this.warnings.push(
        `Maekawa定理: M-V差值=${diff} (M=${mountain}, V=${valley}). 理想值应为±1`
      );
    }

    return { mountain, valley, diff, cuts: counts.C, joins: counts.J, other: counts.other };
  }

  /**
   * 验证边界面 (Boundary Edges)
   * 边界边应该有 B (Boundary) 赋值
   */
  validateBoundaryEdges(foldData) {
    if (!foldData.vertices_coords || !foldData.edges_vertices) return;

    const vertexSet = new Set();
    const edgeConnections = new Map();

    // 收集所有顶点
    for (let i = 0; i < foldData.vertices_coords.length; i++) {
      vertexSet.add(i);
    }

    // 统计每个顶点的连接数
    for (const edge of foldData.edges_vertices) {
      const [v1, v2] = edge;
      if (!edgeConnections.has(v1)) edgeConnections.set(v1, []);
      if (!edgeConnections.has(v2)) edgeConnections.set(v2, []);
      edgeConnections.get(v1).push(v2);
      edgeConnections.get(v2).push(v1);
    }

    // 找出边界顶点（度数为奇数的顶点更可能是边界点）
    const boundaryVertices = [];
    for (const [v, connections] of edgeConnections) {
      if (connections.length % 2 !== 0) {
        boundaryVertices.push(v);
      }
    }

    // 验证边界边
    if (foldData.edges_assignment) {
      const boundaryEdges = [];
      for (let i = 0; i < foldData.edges_vertices.length; i++) {
        if (foldData.edges_assignment[i] === 'B' || foldData.edges_assignment[i] === 'b') {
          boundaryEdges.push(i);
        }
      }

      // 如果有边界顶点但没有边界边标记，警告
      if (boundaryVertices.length > 0 && boundaryEdges.length === 0) {
        this.warnings.push('检测到边界顶点但未找到边界边标记');
      }
    }
  }

  /**
   * 验证顶点连通性
   */
  validateVertexConnectivity(foldData) {
    if (!foldData.vertices_coords || !foldData.edges_vertices) return;

    const isCreasePattern = foldData.file_classes?.includes('creasePattern');

    // 构建邻接表
    const adjacency = new Map();
    for (let i = 0; i < foldData.vertices_coords.length; i++) {
      adjacency.set(i, new Set());
    }

    for (const edge of foldData.edges_vertices) {
      const [v1, v2] = edge;
      if (adjacency.has(v1) && adjacency.has(v2)) {
        adjacency.get(v1).add(v2);
        adjacency.get(v2).add(v1);
      }
    }

    // 找出有边的顶点作为BFS起点
    const verticesWithEdges = [];
    for (const [v, neighbors] of adjacency) {
      if (neighbors.size > 0) verticesWithEdges.push(v);
    }

    if (verticesWithEdges.length === 0) {
      if (!isCreasePattern) {
        this.errors.push('没有找到任何边');
      }
      return;
    }

    // BFS检查连通性 (从第一个有边的顶点开始)
    const visited = new Set();
    const queue = [verticesWithEdges[0]];
    visited.add(verticesWithEdges[0]);

    while (queue.length > 0) {
      const current = queue.shift();
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (visited.size < verticesWithEdges.length) {
      const disconnected = verticesWithEdges.filter(v => !visited.has(v));
      if (isCreasePattern) {
        this.warnings.push(`折痕图有 ${disconnected.length} 个断开连接的折痕点`);
      } else {
        this.errors.push(`图不连通: ${disconnected.length}个孤立折痕点`);
      }
    }

    // 对折痕图，忽略没有边的顶点（它们只是网格点）
    if (isCreasePattern) {
      const isolatedWithoutEdges = foldData.vertices_coords.length - verticesWithEdges.length;
      if (isolatedWithoutEdges > 0) {
        this.warnings.push(`折痕图有 ${isolatedWithoutEdges} 个无连接的网格点（正常现象）`);
      }
    }
  }

  /**
   * 验证面完整性
   */
  validateFaces(foldData) {
    if (!foldData.faces_vertices || !foldData.edges_vertices) return;

    // 构建边集合用于查找
    const edgeSet = new Set();
    for (const edge of foldData.edges_vertices) {
      const [v1, v2] = edge;
      const key = `${Math.min(v1, v2)}-${Math.max(v1, v2)}`;
      edgeSet.add(key);
    }

    // 验证每个面都由有效边组成
    for (let i = 0; i < foldData.faces_vertices.length; i++) {
      const face = foldData.faces_vertices[i];
      for (let j = 0; j < face.length; j++) {
        const v1 = face[j];
        const v2 = face[(j + 1) % face.length];
        const key = `${Math.min(v1, v2)}-${Math.max(v1, v2)}`;

        if (!edgeSet.has(key)) {
          this.errors.push(`面 ${i} 包含不存在的边: (${v1}, ${v2})`);
        }
      }
    }
  }

  /**
   * 验证面层顺序 (faceOrders)
   * FOLD v1.2: 定义折叠状态中面的上下关系
   *
   * faceOrders 格式: [[f, g, s], ...]
   * f, g: 面ID
   * s: +1 (f在g上方), -1 (f在g下方), 0 (未知)
   */
  validateFaceOrders(foldData) {
    if (!foldData.faceOrders) return;

    const numFaces = foldData.faces_vertices?.length || 0;
    if (numFaces === 0) {
      this.warnings.push('存在 faceOrders 但没有 faces_vertices');
      return;
    }

    const validFaces = new Set(Array.from({ length: numFaces }, (_, i) => i));
    let validCount = 0;
    let invalidCount = 0;

    for (const order of foldData.faceOrders) {
      if (!Array.isArray(order) || order.length !== 3) {
        this.errors.push(`faceOrders 条目格式错误: ${JSON.stringify(order)}`);
        invalidCount++;
        continue;
      }

      const [f, g, s] = order;

      // 验证面ID有效性
      if (!validFaces.has(f)) {
        this.errors.push(`faceOrders 引用无效面ID: ${f}`);
        invalidCount++;
        continue;
      }
      if (!validFaces.has(g)) {
        this.errors.push(`faceOrders 引用无效面ID: ${g}`);
        invalidCount++;
        continue;
      }

      // 验证层级值
      if (![-1, 0, 1].includes(s)) {
        this.errors.push(`faceOrders 层级值无效: ${s} (应为 -1, 0, 或 1)`);
        invalidCount++;
        continue;
      }

      validCount++;
    }

    if (validCount > 0) {
      this.warnings.push(`faceOrders: ${validCount} 个有效层级关系 (FOLD v1.2)`);
    }
    if (invalidCount > 0) {
      this.errors.push(`faceOrders: ${invalidCount} 个无效条目`);
    }
  }

  /**
   * 验证边层顺序 (edgeOrders)
   * FOLD v1.2: 定义链接配置中边的左右关系
   *
   * edgeOrders 格式: [[e, f, s], ...]
   * e, f: 边ID
   * s: +1 (e在f左侧), -1 (e在f右侧), 0 (未知)
   */
  validateEdgeOrders(foldData) {
    if (!foldData.edgeOrders) return;

    const numEdges = foldData.edges_vertices?.length || 0;
    if (numEdges === 0) {
      this.warnings.push('存在 edgeOrders 但没有 edges_vertices');
      return;
    }

    const validEdges = new Set(Array.from({ length: numEdges }, (_, i) => i));
    let validCount = 0;
    let invalidCount = 0;

    for (const order of foldData.edgeOrders) {
      if (!Array.isArray(order) || order.length !== 3) {
        this.errors.push(`edgeOrders 条目格式错误: ${JSON.stringify(order)}`);
        invalidCount++;
        continue;
      }

      const [e, f, s] = order;

      // 验证边ID有效性
      if (!validEdges.has(e)) {
        this.errors.push(`edgeOrders 引用无效边ID: ${e}`);
        invalidCount++;
        continue;
      }
      if (!validEdges.has(f)) {
        this.errors.push(`edgeOrders 引用无效边ID: ${f}`);
        invalidCount++;
        continue;
      }

      // 验证层级值
      if (![-1, 0, 1].includes(s)) {
        this.errors.push(`edgeOrders 层级值无效: ${s} (应为 -1, 0, 或 1)`);
        invalidCount++;
        continue;
      }

      validCount++;
    }

    if (validCount > 0) {
      this.warnings.push(`edgeOrders: ${validCount} 个有效层级关系 (FOLD v1.2)`);
    }
    if (invalidCount > 0) {
      this.errors.push(`edgeOrders: ${invalidCount} 个无效条目`);
    }
  }

  /**
   * 计算顶点的交替角度和 (Kawasaki验证准备)
   * 注意: 这个需要2D坐标，对于3D顶点只取x,y
   */
  calculateAlternatingAngleSum(vertexIdx, foldData) {
    if (!foldData.vertices_coords || !foldData.edges_vertices) return null;

    // 获取顶点的邻居
    const neighbors = [];
    for (const edge of foldData.edges_vertices) {
      const [v1, v2] = edge;
      if (v1 === vertexIdx) neighbors.push(v2);
      if (v2 === vertexIdx) neighbors.push(v1);
    }

    if (neighbors.length < 2) return null;

    // 获取顶点坐标
    const center = foldData.vertices_coords[vertexIdx];
    const neighborCoords = neighbors.map(n => foldData.vertices_coords[n]);

    // 计算每个邻居的方向角
    const angles = neighborCoords.map(coord => {
      const dx = coord[0] - center[0];
      const dy = coord[1] - center[1];
      return Math.atan2(dy, dx);
    });

    // 按角度排序
    angles.sort((a, b) => a - b);

    // 计算交替和: angles[0] + angles[2] + ... vs angles[1] + angles[3] + ...
    let sumEven = 0, sumOdd = 0;
    for (let i = 0; i < angles.length; i++) {
      if (i % 2 === 0) sumEven += angles[i];
      else sumOdd += angles[i];
    }

    return { sumEven, sumOdd, difference: Math.abs(sumEven - sumOdd), neighbors: neighbors.length };
  }

  /**
   * 验证Kawasaki定理 (简化版)
   * 对于每个内部顶点，交替角度之和应为180°或π弧度
   */
  validateKawasakiTheorem(foldData) {
    if (!foldData.vertices_coords) return null;

    const results = [];
    const tolerance = 0.1; // 允许的误差

    for (let i = 0; i < foldData.vertices_coords.length; i++) {
      const angleData = this.calculateAlternatingAngleSum(i, foldData);
      if (angleData && angleData.neighbors >= 3) {
        // 转换为度进行比较
        const diffDegrees = (angleData.difference * 180) / Math.PI;
        const isValid = diffDegrees < tolerance || Math.abs(diffDegrees - 180) < tolerance;

        results.push({
          vertex: i,
          neighbors: angleData.neighbors,
          sumEven: angleData.sumEven,
          sumOdd: angleData.sumOdd,
          differenceDegrees: diffDegrees,
          isValid
        });
      }
    }

    // 统计
    const valid = results.filter(r => r.isValid).length;
    const invalid = results.filter(r => !r.isValid).length;

    if (invalid > 0) {
      this.warnings.push(`Kawasaki定理: ${invalid}/${results.length} 个顶点角度不平衡`);
    }

    return { results, valid, invalid };
  }

  /**
   * 获取验证摘要
   */
  getSummary(foldData) {
    const counts = { M: 0, V: 0, B: 0, F: 0, C: 0, J: 0, other: 0 };

    if (foldData.edges_assignment) {
      for (const a of foldData.edges_assignment) {
        if (a === 'M' || a === 'm') counts.M++;
        else if (a === 'V' || a === 'v') counts.V++;
        else if (a === 'B' || a === 'b') counts.B++;
        else if (a === 'F' || a === 'f') counts.F++;
        else if (a === 'C' || a === 'c') counts.C++;
        else if (a === 'J' || a === 'j') counts.J++;
        else counts.other++;
      }
    }

    return {
      fileSpec: foldData.file_spec || '未指定',
      vertices: foldData.vertices_coords?.length || 0,
      edges: foldData.edges_vertices?.length || 0,
      faces: foldData.faces_vertices?.length || 0,
      mountainFolds: counts.M,
      valleyFolds: counts.V,
      boundaryEdges: counts.B,
      flatFolds: counts.F,
      cutEdges: counts.C,       // FOLD v1.2
      joinEdges: counts.J,       // FOLD v1.2
      faceOrders: foldData.faceOrders?.length || 0,  // FOLD v1.2
      edgeOrders: foldData.edgeOrders?.length || 0,  // FOLD v1.2
      fileCreator: foldData.file_creator || 'unknown',
      frameTitle: foldData.frame_title || 'untitled'
    };
  }

  /**
   * 生成验证报告
   */
  generateReport(foldData) {
    const result = this.validate(foldData);
    const summary = result.summary;
    const kawasaki = this.validateKawasakiTheorem(foldData);

    let report = [];
    report.push('='.repeat(60));
    report.push('折痕图验证报告 (Crease Pattern Validation Report)');
    report.push('='.repeat(60));
    report.push('');
    report.push('【基本信息】');
    report.push(`  FOLD版本: ${summary.fileSpec}`);
    report.push(`  文件: ${summary.frameTitle}`);
    report.push(`  生成器: ${summary.fileCreator}`);
    report.push(`  顶点数: ${summary.vertices}`);
    report.push(`  边数: ${summary.edges}`);
    report.push(`  面数: ${summary.faces}`);
    report.push('');
    report.push('【折痕统计】');
    report.push(`  山折 (M): ${summary.mountainFolds}`);
    report.push(`  谷折 (V): ${summary.valleyFolds}`);
    report.push(`  边界 (B): ${summary.boundaryEdges}`);
    report.push(`  平折 (F): ${summary.flatFolds}`);
    if (summary.cutEdges > 0) {
      report.push(`  切割边 (C): ${summary.cutEdges} [FOLD v1.2]`);
    }
    if (summary.joinEdges > 0) {
      report.push(`  连接边 (J): ${summary.joinEdges} [FOLD v1.2]`);
    }
    report.push(`  M-V 差值: ${summary.mountainFolds - summary.valleyFolds}`);
    if (summary.faceOrders > 0) {
      report.push(`  面层顺序: ${summary.faceOrders} 条 [FOLD v1.2]`);
    }
    if (summary.edgeOrders > 0) {
      report.push(`  边层顺序: ${summary.edgeOrders} 条 [FOLD v1.2]`);
    }
    report.push('');
    report.push('【验证结果】');
    report.push(`  整体状态: ${result.valid ? '✅ 通过' : '❌ 失败'}`);

    if (result.errors.length > 0) {
      report.push('');
      report.push('【错误】');
      result.errors.forEach(e => report.push(`  ❌ ${e}`));
    }

    if (result.warnings.length > 0) {
      report.push('');
      report.push('【警告】');
      result.warnings.forEach(w => report.push(`  ⚠️ ${w}`));
    }

    if (kawasaki && kawasaki.invalid > 0) {
      report.push('');
      report.push('【Kawasaki定理检查】');
      report.push(`  检查顶点数: ${kawasaki.results.length}`);
      report.push(`  通过: ${kawasaki.valid}, 失败: ${kawasaki.invalid}`);
    }

    report.push('');
    report.push('='.repeat(60));

    return report.join('\n');
  }
}

// 导出
module.exports = CreasePatternValidator;