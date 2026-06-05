# Architecture Overview

**文档版本**: 0.1.0
**更新日期**: 2026-04-16

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      User / AI Agent                        │
│                  (CLI Interface Layer)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Commander.js CLI                         │
│                  (Command Parser & Router)                   │
├─────────────────────────────────────────────────────────────┤
│  load │ list │ screenshot │ simulate │ export │ record...  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Command Handlers                         │
│                  (Business Logic Layer)                     │
├─────────────────────────────────────────────────────────────┤
│  BrowserManager │ FileProcessor │ ModelAnalyzer │ Exporter  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Playwright Core                          │
│                  (Browser Automation Layer)                  │
├─────────────────────────────────────────────────────────────┤
│     Chromium │ Firefox │ WebKit │ Page │ Context           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  OrigamiSimulator.org                       │
│                    (Target Application)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心模块

### 1. CLI 入口 (src/index.js)

职责:
- 解析命令行参数
- 路由到对应命令处理器
- 显示帮助信息

依赖:
- Commander.js

### 2. 浏览器管理器 (src/utils/browser.js)

职责:
- 启动/关闭浏览器实例
- 管理页面导航
- 处理浏览器错误

```javascript
class BrowserManager {
  async launch()      // 启动浏览器
  async close()       // 关闭浏览器
  async navigate(url) // 导航到URL
  async screenshot()  // 截图
}
```

### 3. 命令模块 (src/commands/*.js)

职责:
- 实现各命令的业务逻辑
- 与浏览器交互
- 返回结果给用户

每个命令模块结构:

```javascript
// src/commands/load.js
module.exports = {
  command: 'load',
  describe: 'Load origami model',
  handler: async (options) => { /* ... */ }
}
```

---

## 数据流

### 典型命令执行流程

```
用户输入
    │
    ▼
node src/index.js load --preset cranes
    │
    ▼
Commander.js 解析参数
    │
    ▼
路由到 load 命令处理器
    │
    ▼
BrowserManager.launch() → 创建浏览器
    │
    ▼
page.goto(origamisimulator.org/?preset=cranes)
    │
    ▼
等待页面加载完成
    │
    ▼
执行操作 (截图/分析/导出)
    │
    ▼
BrowserManager.close() → 关闭浏览器
    │
    ▼
输出结果给用户
```

---

## 文件解析 (FOLD 格式)

### FOLD 文件结构

```json
{
  "file_spec": 1.1,
  "file_creator": "OrigamiSimulator",
  "vertices_coords": [[x, y, z], ...],
  "edges_vertices": [[i, j], ...],
  "faces_vertices": [[a, b, c], ...],
  "faces_references": [...],
  "edges_assignment": ["B", "M", "V", ...],
  "frame_title": "Model Name"
}
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `vertices_coords` | 顶点坐标数组 |
| `edges_vertices` | 边连接关系 |
| `faces_vertices` | 面顶点索引 |
| `edges_assignment` | 边类型 (B=Mountain/Valley, M=Mountain, V=Valley) |

---

## OpenCLI 集成

### 适配器配置 (.opencli/origami-adapter.yaml)

```yaml
name: origami
version: 0.1.0
base_url: https://origamisimulator.org/

commands:
  load:
    action: navigate
    url_pattern: "{base_url}?preset={preset}"
  screenshot:
    action: capture
    output: "{output}"
```

---

## 错误处理

### 错误类型

| 错误类型 | 说明 | 处理方式 |
|----------|------|----------|
| `BrowserError` | 浏览器启动/操作失败 | 重试或退出 |
| `PageLoadError` | 页面加载超时 | 增加超时时间 |
| `ExportError` | 导出操作失败 | 检查路径权限 |
| `ValidationError` | 参数验证失败 | 显示错误信息 |

### 错误处理流程

```
发生错误
    │
    ▼
判断错误类型
    │
    ├─→ 可恢复错误 → 重试 (最多3次)
    │                      │
    │                      ▼
    │                  仍失败 → 记录日志 → 退出
    │
    └─→ 不可恢复错误 → 显示错误信息 → 退出
```

---

## 配置管理

### 配置文件

- `package.json` - npm 配置
- `.opencli/origami-adapter.yaml` - OpenCLI 适配器配置
- `playwright.config.js` - Playwright 配置 (可选)

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ORIGAMI_BROWSER` | 使用的浏览器 | `chromium` |
| `ORIGAMI_HEADLESS` | 是否无头模式 | `true` |
| `ORIGAMI_TIMEOUT` | 超时时间 (ms) | `30000` |

---

## 扩展性设计

### 添加新命令

1. 在 `src/commands/` 创建新文件 (如 `newcmd.js`)
2. 实现命令模块

```javascript
// src/commands/newcmd.js
module.exports = {
  command: 'newcmd',
  describe: 'Description of new command',
  builder: (yargs) => {
    yargs.option('option-name', {
      describe: 'option description',
      type: 'string'
    })
  },
  handler: async (argv) => {
    // 实现逻辑
  }
}
```

3. 在 `src/index.js` 中注册

```javascript
program
  .command(require('./commands/newcmd'))
```

---

**最后更新**: 2026-04-16
