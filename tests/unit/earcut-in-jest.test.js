/**
 * earcut 在 Jest 里可加载（2026-11-26）
 *
 * 背景：earcut 3.x 是纯 ESM，Jest 的模块系统不支持 require(ESM)
 * → 生成器 `require('earcut').default` 在 Jest 里抛 "Must use import to load ES Module"
 * → 走 catch 分支打印「⚠️ earcut 库未找到」，**fallback 三角剖分路径在单测里从未执行**
 * → 测试环境与生产环境行为不一致。
 *
 * 修法：earcut 降到 2.2.4（CJS）。同时发现：生成器的调用格式
 * （boundaryCoords.push(coord[0], coord[1]) → **扁平坐标数组**）本来就是 2.x 的 API，
 * 而 3.x 期望嵌套数组 —— 也就是说这个 fallback 路径从装上 3.x 起就是坏的，
 * 降级反而一并修复了它。
 */
describe('earcut 在 Jest 环境可用', () => {
  test('能加载并对三角形做剖分', () => {
    const mod = require('earcut');
    const fn = mod.default || mod;
    expect(typeof fn).toBe('function');
    // earcut 2.x：earcut(vertices, holeIndices, dimensions)，顶点是扁平数组
    // earcut 2.x 返回**扁平索引数组** [i0, i1, i2]（3.x 才返回嵌套 [[i0,i1,i2]]）
    const tris = fn([0, 0, 1, 0, 0, 1], null, 2);
    expect(Array.isArray(tris)).toBe(true);
    expect(tris.length).toBe(3);            // 一个三角形 = 3 个索引
    expect(tris.every((i) => Number.isInteger(i) && i >= 0 && i <= 2)).toBe(true);
    // 三个索引互不相同（不能是退化三角形）
    expect(new Set(tris).size).toBe(3);
  });

  test('生成器能加载 earcut（不再走「未找到」分支）', () => {
    const mod = require('earcut');
    const fn = mod.default || mod;
    expect(typeof fn).toBe('function');
    // 生成器用的是 `require('earcut').default`，2.2.4 下它必须就是函数本身
    expect(typeof mod.default).toBe('function');
  });
});
