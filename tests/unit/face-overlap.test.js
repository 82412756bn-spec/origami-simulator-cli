/**
 * 面片（faces）重叠检测 + 模板模式的面重算
 *
 * 背景：v2.51.0 把 transformTemplate 的 faces_vertices 从「硬编码清空」改成「按份偏移重建」，
 * 但沿用来源文件的 faces —— 实测那些面**互相重叠**（模板库的面面积和是纸的凸包面积的
 * 3–15 倍）→ 下游折叠模拟假定面片是纸的划分，重叠会让层序/厚度计算失真。
 *
 * v2.51.1 改为**从边重算**面（planar half-edge），并加上重叠检测。
 */
const path = require('path');
const fs = require('fs');
const { detectFaceOverlaps } = require('../../src/utils/face-overlap');
const { loadTemplateFold, transformTemplate, loadManifest } = require('../../src/utils/template-transform');

describe('面片重叠检测', () => {
  test('两个完全重合的面 → 判为重叠', () => {
    const fold = {
      vertices_coords: [[0, 0], [1, 0], [1, 1], [0, 1]],
      faces_vertices: [[0, 1, 2, 3], [0, 1, 2, 3]],
    };
    const r = detectFaceOverlaps(fold);
    expect(r.faces).toBe(2);
    expect(r.overlaps.length).toBe(1);
    expect(r.ok).toBe(false);
  });

  test('两个相邻不重叠的面 → 通过', () => {
    const fold = {
      vertices_coords: [[0, 0], [1, 0], [1, 1], [0, 1], [2, 0], [2, 1]],
      faces_vertices: [[0, 1, 2, 3], [1, 4, 5, 2]],
    };
    const r = detectFaceOverlaps(fold);
    expect(r.overlaps.length).toBe(0);
    expect(r.ok).toBe(true);
  });

  test('没有 faces → 不报错', () => {
    const r = detectFaceOverlaps({ vertices_coords: [[0, 0], [1, 1]], faces_vertices: [] });
    expect(r.faces).toBe(0);
    expect(r.ok).toBe(true);
  });
});

describe('模板模式的面：从边重算，不沿用来源文件的 faces', () => {
  const manifest = loadManifest();

  test.each(['miura-ori', 'flat_crane', 'birdBase'])('%s 的面互不重叠且面积比 ≤ 1', (id) => {
    const t = manifest.templates.find((x) => x.id === id);
    const base = loadTemplateFold(t).foldData;
    const tr = transformTemplate(base, { copies: 3, rotate: 120, scale: 1 });
    const r = detectFaceOverlaps(tr);
    expect(r.faces).toBeGreaterThan(0);
    expect(r.overlaps.length).toBe(0);
    expect(r.areaRatio).toBeLessThanOrEqual(1.0001);
  });

  test('copies=3 的面数 = 单份的 3 倍', () => {
    const t = manifest.templates.find((x) => x.id === 'flat_crane');
    const base = loadTemplateFold(t).foldData;
    const one = transformTemplate(base, { copies: 1, rotate: 0, scale: 1 });
    const three = transformTemplate(base, { copies: 3, rotate: 0, scale: 1 });
    expect(three.faces_vertices.length).toBe(one.faces_vertices.length * 3);
  });
});
