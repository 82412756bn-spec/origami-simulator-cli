# OrigamiSimulator CLI - 项目文档

**项目名称**: origami-simulator-cli
**版本**: 0.2.0
**更新日期**: 2026-04-16
**状态**: ✅ 功能完成

---

## 📋 项目概述

### 目标

创建 OrigamiSimulator.org 的命令行工具，实现折纸模拟器的自动化操作，包括模型加载、模拟控制、截图导出、视频录制等功能。

### 核心价值

- **自动化**: 批量处理折纸模型
- **集成**: 无缝对接 CI/CD 流水线
- **可编程**: 易于 AI Agent 调用
- **跨平台**: 支持 Windows/macOS/Linux

### 技术栈

| 技术 | 用途 |
|------|------|
| Node.js (≥18) | 运行时 |
| Playwright | 浏览器自动化 |
| Commander.js | CLI 框架 |
| FFmpeg | 视频合成 |

---

## ✅ 功能完成状态

### Phase 1 - 基础功能 (v0.1.0) ✅

- [x] CLI 框架搭建
- [x] 基础命令结构
- [x] 浏览器自动化基础
- [x] 预设模型加载
- [x] 截图功能

### Phase 2 - 核心功能 (v0.2.0) ✅

- [x] 文件上传 (FOLD/SVG)
- [x] 模拟参数配置
- [x] 导出功能 (STL/OBJ/FOLD/PNG)
- [x] 视频录制 (GIF/WebM/MP4) - Playwright + FFmpeg
- [x] 模型验证
- [x] 预设模型扩展 (8 → 27个)

### Phase 3 - 高级功能 (v0.2.0) ✅

- [x] 批量处理 (完整实现)
- [x] 分析功能
- [x] 预设创建 - 27个预设
- [x] Claude Code Skill 集成
- [x] 视图切换 (pattern/simulation/folded/strain)

### Phase 4 - 生态建设 (v1.0.0)

- [ ] npm 发布
- [x] 文档完善
- [x] 测试覆盖
- [x] CI/CD 集成 (GitHub Actions)

---

## 📁 项目结构

```
origami-simulator-cli/
├── src/
│   └── index.js              # 主入口 (所有命令实现)
├── docs/
│   ├── origami-simulator-cli.md  # 详细使用文档
│   ├── PROJECT.md             # 本文档
│   ├── COMMAND-REFERENCE.md  # 命令参考
│   └── ARCHITECTURE.md       # 架构文档
├── tests/
│   ├── unit/                 # 单元测试
│   │   └── file-utils.test.js
│   ├── e2e/                  # E2E 测试
│   │   └── commands.test.js
│   └── server-test.sh        # 服务器测试脚本
├── examples/
│   ├── basic-usage.sh        # 基础用法
│   └── sample-crane.fold      # 示例文件
├── .github/
│   └── workflows/
│       └── test.yml          # CI/CD 配置
├── .opencli/
│   └── origami-adapter.yaml   # OpenCLI 配置
├── .claude/
│   └── skills/
│       └── SKILL.md          # Claude Code Skill
├── package.json
├── jest.config.js
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── TESTS.md
```

---

## 🎮 已实现的命令

| 命令 | 功能 | 状态 |
|------|------|------|
| `list` | 列出27个预设 | ✅ |
| `load` | 加载模型/文件 | ✅ |
| `screenshot` | 截图 | ✅ |
| `simulate` | 模拟控制 | ✅ |
| `view` | 视图切换 | ✅ |
| `export` | 导出PNG/STL/OBJ/FOLD | ✅ |
| `record` | 录制GIF/MP4/WebM | ✅ |
| `analyze` | 模型分析 | ✅ |
| `batch` | 批量处理 | ✅ |
| `verify` | 文件验证 | ✅ |
| `config` | 参数配置 | ✅ |

---

## 🔧 开发指南

### 环境要求

- Node.js ≥ 18.0.0
- npm ≥ 9.0.0
- Chromium (通过 Playwright 安装)
- FFmpeg (用于视频合成)

### 本地开发

```bash
# 进入项目目录
cd /home/rayna/文档/origami-simulator-cli

# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium

# 运行单元测试
npm test

# 运行 CLI
node src/index.js --help
```

### 快速使用

```bash
# 列出所有预设
node src/index.js list

# 截图
node src/index.js screenshot --preset miura-ori -o /tmp/model.png

# 录制视频
node src/index.js record --preset miura-ori -o /tmp/video.gif

# 导出模型
node src/index.js export -f stl --preset waterbomb -o /tmp/model.stl

# 验证文件
node src/index.js verify examples/sample-crane.fold
```

---

## 📊 技术亮点

### 视频录制实现

使用 Playwright + FFmpeg 实现可靠的视频录制：

1. Playwright 截取多帧 PNG 图像
2. FFmpeg 合成高质量 GIF/MP4/WebM

```bash
# 录制 GIF
node src/index.js record --preset miura-ori -o out.gif

# 录制 MP4
node src/index.js record --format mp4 --preset miura-ori -o out.mp4

# 半折叠动画
node src/index.js record --start-percent 0 --end-percent 0.5 --preset miura-ori -o half.gif
```

### 预设模型

27个预设，覆盖多个分类：

- **origami** (8个): cranes, flapping-bird, hypar等
- **bases** (5个): bird-base, boat-base, frog-base等
- **tessellations** (5个): miura-ori, waterbomb, flower-tower等
- **curved** (3个): leafy-opus, shell14, rotating-star
- **pleating** (2个): box-pleat-tess, box-pleat-pyramid
- **其他** (4个): kirigami-triangle, popup-simple等

---

## 📚 相关资源

- **研究文档**: `/home/rayna/文档/Unbuntu_system/deployed-projects/research/opencli-origamisimulator/`
- **OrigamiSimulator**: https://origamisimulator.org/
- **OrigamiSimulator GitHub**: https://github.com/amandaghassaei/OrigamiSimulator
- **OrigamiSimulator MIT License**: 开源项目

---

**最后更新**: 2026-04-16
**版本**: 0.2.0
**状态**: ✅ 功能完成
**修复内容**: batch命令浏览器初始化、view命令实现、版本号统一
