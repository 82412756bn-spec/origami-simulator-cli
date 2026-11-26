/**
 * canvas 缺失时的降级行为（2026-11-26）
 *
 * 背景：canvas 是原生模块，prebuild 只覆盖 5 个平台
 * （linux-x64/arm64、darwin-x64/arm64、win32-x64），**没有 win32-arm64 与 linux-musl**。
 * 若它是硬依赖，那两类机器 `npm install` 整个失败 → 36 个命令全部用不了。
 * 改成 optionalDependencies 后，装不上只影响「商业级 PBR 渲染」这一条路径。
 *
 * 这个测试锁住两件事：
 *   1. procedural-texture 的 4 个 createCanvas 调用点都有 `if (!canvas) return null` 守卫
 *   2. commercial-renderer 明确处理「纹理生成失败 → 返回 null」
 *
 * 注意：这里不 mock canvas —— 我们要验的是**降级路径存在**，而不是 canvas 本身可用。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/utils/procedural-texture.js');
const RENDERER = path.join(__dirname, '../../src/utils/commercial-renderer.js');

describe('canvas 可选化 · 降级路径存在', () => {
  const texture = fs.readFileSync(SRC, 'utf8');
  const renderer = fs.readFileSync(RENDERER, 'utf8');

  test('canvas 的 require 被 try/catch 包住（加载失败不抛）', () => {
    expect(texture).toMatch(/require\(['"]canvas['"]\)/);
    expect(texture).toMatch(/catch[\s\S]{0,200}return null/);
  });

  test('9 个 createCanvas 调用点都有 null 守卫', () => {
    // 用 [ \t] 而不是 \s —— \s 含换行，会跨代码块匹配（实测数出 9 个假匹配）
    // 实测：全文共 10 处 createCanvas 调用，9 处用 canvas 变量 + 1 处用 normalCanvas，全部有守卫
    const guards = texture.match(/createCanvas\(\);[ \t]*\n[ \t]*if \(!canvas\) return null;/g) || [];
    expect(guards.length).toBe(9);
  });

  test('normalFromHeight 内的 normalCanvas 也有守卫（第 5 处）', () => {
    const guards = texture.match(/createCanvas\(\);[ \t]*\n[ \t]*if \(!normalCanvas\) return null;/g) || [];
    expect(guards.length).toBe(1);
  });

  test('normalFromHeight 也有 null 守卫', () => {
    expect(texture).toMatch(/normalFromHeight\(heightCanvas\)\s*\{\s*\n\s*if \(!heightCanvas\) return null;/);
  });

  test('commercial-renderer 明确处理纹理生成失败', () => {
    expect(renderer).toMatch(/texture generation fails[\s\S]{0,120}return null/i);
  });

  test('package.json 里 canvas 是 optionalDependencies（不是 dependencies）', () => {
    const pkg = require('../../package.json');
    expect(pkg.dependencies && pkg.dependencies.canvas).toBeUndefined();
    expect(pkg.optionalDependencies && pkg.optionalDependencies.canvas).toBeTruthy();
  });
});
