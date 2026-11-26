/**
 * preset 本地缓存的单元测试（纯本地，不联网）
 *
 * 覆盖的正是这次改动最容易错的两处：
 *   1. 扩展名区分（25 个 .svg + 2 个 .fold，混为一谈会把 JSON 当错误页拒掉）
 *   2. 内容校验（站点路径错时返回的 HTML 错误页也是 200，必须能识别）
 */
const path = require('path');
const os = require('os');

const cache = require('../../src/utils/preset-cache');

describe('preset-cache · 扩展名', () => {
  test('.svg 保持 .svg', () => {
    expect(cache.cacheExt('Origami/traditionalCrane.svg')).toBe('.svg');
  });

  test('.fold 保持 .fold', () => {
    expect(cache.cacheExt('Pleating/BoxPleatTessellation.fold')).toBe('.fold');
  });

  test('大写扩展名归一', () => {
    expect(cache.cacheExt('X/Y.SVG')).toBe('.svg');
    expect(cache.cacheExt('X/Y.FOLD')).toBe('.fold');
  });

  test('没有扩展名时默认 .svg', () => {
    expect(cache.cacheExt('no-ext')).toBe('.svg');
    expect(cache.cacheExt('')).toBe('.svg');
  });

  test('cachePath 落在 ~/.origami/presets 下且带对扩展名', () => {
    const p = cache.cachePath('cranes', 'Origami/traditionalCrane.svg');
    expect(p.startsWith(path.join(os.homedir(), '.origami', 'presets'))).toBe(true);
    expect(p.endsWith('cranes.svg')).toBe(true);

    const f = cache.cachePath('box-pleat-tess', 'Pleating/BoxPleatTessellation.fold');
    expect(f.endsWith('box-pleat-tess.fold')).toBe(true);
  });
});

describe('preset-cache · 内容校验', () => {
  test('合法 SVG 通过', () => {
    expect(cache.looksValid('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'a.svg')).toBe(true);
    expect(cache.looksValid('<SVG>', 'a.svg')).toBe(true);
  });

  test('HTML 错误页被拒（这是实测踩过的坑：路径错时站点返回 200 的 HTML）', () => {
    expect(cache.looksValid('<!DOCTYPE html><html><body>Not Found</body></html>', 'a.svg')).toBe(false);
    expect(cache.looksValid('', 'a.svg')).toBe(false);
  });

  test('合法 FOLD（JSON）通过', () => {
    expect(cache.looksValid('{"vertices_coords":[[0,0]]}', 'a.fold')).toBe(true);
    expect(cache.looksValid('{"edges_vertices":[[0,1]]}', 'a.fold')).toBe(true);
  });

  test('无几何字段的 JSON 被拒', () => {
    expect(cache.looksValid('{"foo":1}', 'a.fold')).toBe(false);
    expect(cache.looksValid('{}', 'a.fold')).toBe(false);
    expect(cache.looksValid('不是 JSON', 'a.fold')).toBe(false);
  });

  test('把 SVG 内容喂给 .fold 也会被拒（格式与扩展名必须一致）', () => {
    expect(cache.looksValid('<svg></svg>', 'a.fold')).toBe(false);
  });
});

describe('preset-cache · hasCache', () => {
  test('不存在的 id 返回 false，不抛异常', () => {
    expect(cache.hasCache('__definitely_not_a_preset__', 'X/y.svg')).toBe(false);
  });

  test('assetUrl 用 /assets/ 前缀（根路径实测 404）', () => {
    expect(cache.assetUrl('Origami/traditionalCrane.svg'))
      .toBe('https://origamisimulator.org/assets/Origami/traditionalCrane.svg');
  });
});
