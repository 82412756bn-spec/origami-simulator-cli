# canvas 跨平台安装取证（2026-11-26）

> **结论**：canvas 3.2.3 的预编译产物覆盖 **5 个主流平台**且**自带系统库**，
> 主流平台安装不会失败；但 **win32-arm64 与 linux-musl 没有预编译**，
> 那两类机器会退回源码编译。已做两件事：
> ① canvas 改为 **`optionalDependencies`**（装不上只影响 1 个命令，不是全部 36 个）
> ② CI 加 **windows / macos 矩阵**（跨平台从「声称」变成「每次提交都验」）

---

## §1 canvas 到底被谁用

**[实测]** 全仓库只有 **1 处** `require('canvas')`：

```
src/utils/procedural-texture.js:63   const { createCanvas } = require('canvas');
```

依赖链：`src/commands/render.js` → `src/utils/commercial-renderer.js` → `src/utils/procedural-texture.js`

→ canvas **只服务「商业级 PBR 渲染」这一条路径**（`origami render`），
其余 35 个命令都不需要它。

## §2 预编译产物矩阵（权威来源：node-canvas v3.2.3 的 GitHub release 资产）

```
canvas-v3.2.3-napi-v7-darwin-arm64.tar.gz   ← macOS Apple Silicon
canvas-v3.2.3-napi-v7-darwin-x64.tar.gz     ← macOS Intel
canvas-v3.2.3-napi-v7-linux-arm64.tar.gz    ← Linux ARM
canvas-v3.2.3-napi-v7-linux-x64.tar.gz      ← Linux x64
canvas-v3.2.3-napi-v7-win32-x64.tar.gz      ← Windows x64
```

**全部是 `napi-v7`** → N-API 向后兼容，**一个二进制跨 node 版本通用**
（本机 node v20.20.2 / napi 9，用的是 napi-v7 的产物）。

### 缺 prebuild 的平台

| 平台 | 后果 |
|---|---|
| **win32-arm64**（Windows on ARM） | 退回 `node-gyp` 编译，需 Visual Studio Build Tools |
| **linux-musl**（Alpine） | 退回 `node-gyp` 编译，需 musl 工具链 |

## §3 是否依赖系统库 —— 不依赖（已验）

**[实测]** `ldd node_modules/canvas/build/Release/canvas.node`：

```
libcairo.so.2      => .../canvas/build/Release/libcairo.so.2      ← 自带
libpangocairo-1.0  => .../canvas/build/Release/libpangocairo-1.0  ← 自带
libpixman-1.so.0   => .../canvas/build/Release/libpixman-1.so.0   ← 自带
libgobject-2.0     => .../canvas/build/Release/libgobject-2.0     ← 自带
...
not found 数量: 0
```

**prebuild 自带 cairo / pango / libpng / pixman / harfbuzz / freetype / rsvg** →
Linux 用户**不需要** `apt install libcairo2-dev libpango1.0-dev`。

已下载并验证另两个平台的包内容：
- `darwin-arm64`（6.6 MB）：`build/Release/libpango-1.0.0.dylib` 等 dylib **自带**
- `win32-x64`（15 MB）：`build/Release/libcairo-2.dll` 等 DLL **自带**

## §4 缺失时的降级路径 —— 代码本来就是设计好的

**[实测]** `src/utils/procedural-texture.js` 全文 **10 处 `createCanvas()` 调用，10 处都有守卫**：

```
行 205/251/265/301/386/431/460/474/487   const canvas = this.createCanvas();  →  if (!canvas) return null;
行 337                                   const normalCanvas = ...              →  if (!normalCanvas) return null;
```

`src/utils/commercial-renderer.js:229` 注释原文：

```js
// If texture generation fails (e.g., no canvas), return null
return null;
```

→ canvas 缺失时**优雅降级**（该纹理为 null），不会 TypeError 崩溃。

## §5 由此做出的两个改动

### 改动 1：canvas 从 `dependencies` → `optionalDependencies`

| | 之前（硬依赖） | 之后（可选依赖） |
|---|---|---|
| Alpine / Windows-ARM 装不上 | **整个 `npm install` 失败** → 36 个命令全部用不了 | 安装成功 → 只有 `origami render` 的纹理为空 |
| 用户看到的错误 | `npm ERR! node-gyp failed`（不知道是谁） | 安装不报错，render 降级 |

**35/36 个命令能用 vs 一个都不能用** —— 可选依赖明显更对。

新增单测 `tests/unit/canvas-optional-degradation.test.js`（6 例）锁住：
`require` 被 try/catch 包住 · 9 处 `!canvas` 守卫 · 1 处 `!normalCanvas` 守卫 ·
commercial-renderer 明确处理失败 · package.json 里 canvas 不在 `dependencies`。

### 改动 2：CI 加 windows / macos 矩阵

**之前**：CI 只有 `ubuntu-latest` + node 20 → 「跨平台可用」只是**声称**，从未验证。

**现在**：

```yaml
test:
  strategy:
    fail-fast: false
    matrix:
      os: [ubuntu-latest, windows-latest, macos-latest]
      node: ['20']
```

并加了一步**明确验证原生模块真的能用**（`npm ci` 成功 ≠ canvas 能加载）：

```bash
node -e "const {createCanvas}=require('canvas');const c=createCanvas(8,8);console.log('canvas ok', c.width+'x'+c.height)"
```

→ 以后只要哪个平台的 canvas 装不上或加载不了，**CI 直接红**。

## §6 仍然不确定的

- **Alpine（musl）与 Windows-ARM 的源码编译是否真能成功**：未实测（本机没有这两种环境）。
  但由于 canvas 现在是可选依赖，**最坏情况是 render 降级，不是装不上**。
- **canvas 的许可证与本项目分发方式是否相容**：MIT，未逐条核对条款。
