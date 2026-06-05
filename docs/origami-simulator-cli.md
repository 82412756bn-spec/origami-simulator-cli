# origami-simulator-cli

**Type**: Tool/CLI
**Project**: OrigamiSimulator CLI
**Path**: `/home/rayna/文档/origami-simulator-cli`

## 概述

 origami-simulator-cli 是 OrigamiSimulator.org 的命令行工具，通过 Playwright 浏览器自动化实现折纸模拟器的 CLI 操作。

## 快速开始

```bash
cd /home/rayna/文档/origami-simulator-cli
node src/index.js --help
```

## 核心命令

### 1. list - 列出预设

```bash
node src/index.js list                    # 分类显示
node src/index.js list --simple           # 简洁列表
node src/index.js list --category origami  # 按分类筛选
```

**预设分类**:
- origami (8个) - 折纸模型
- bases (5个) - 基础折型
- tessellations (5个) - 折叠图案
- curved (3个) - 曲线折叠
- pleating (2个) - 折叠
- kirigami, popup, bistable, polygami

### 2. load - 加载模型

```bash
node src/index.js load --preset miura-ori        # 加载预设
node src/index.js load --file ./model.fold       # 加载本地文件
```

**常用预设**: `miura-ori`, `waterbomb`, `cranes`, `flapping-bird`, `hypar`, `lang-honeycomb`

### 3. screenshot - 截图

```bash
node src/index.js screenshot --preset miura-ori -o /tmp/model.png
```

### 4. export - 导出

```bash
node src/index.js export -f png --preset miura-ori -o output.png
node src/index.js export -f stl --preset waterbomb -o output.stl
node src/index.js export -f obj --preset waterbomb -o output.obj
node src/index.js export -f fold --preset waterbomb -o output.fold
```

**支持的格式**: `png`, `stl`, `obj`, `fold`, `svg`

### 5. analyze - 分析

```bash
node src/index.js analyze --preset miura-ori      # 基础分析
node src/index.js analyze --preset miura-ori --all  # 完整分析
```

### 6. verify - 验证文件

```bash
node src/index.js verify examples/sample-crane.fold
```

### 7. simulate - 模拟控制

```bash
node src/index.js simulate --preset miura-ori --percent 0.5 --iterations 100
```

### 8. batch - 批量处理

```bash
node src/index.js batch --models miura-ori,waterbomb --action screenshot --output-dir /tmp/batch
```

## 项目结构

```
origami-simulator-cli/
├── src/index.js              # 主程序入口
├── docs/                     # 文档
│   ├── origami-simulator-cli.md  # 本文件
│   ├── PROJECT.md
│   ├── COMMAND-REFERENCE.md
│   └── ARCHITECTURE.md
├── tests/                    # 测试
├── examples/                 # 示例文件
├── package.json
└── README.md
```

## 常用操作示例

### 生成模型截图集

```bash
for preset in miura-ori waterbomb cranes; do
  node src/index.js screenshot --preset $preset -o /tmp/${preset}.png
done
```

### 导出多种格式

```bash
for format in png stl obj fold; do
  node src/index.js export -f $format --preset miura-ori -o /tmp/model.$format
done
```

### 分析并截图

```bash
node src/index.js analyze --preset miura-ori --all
node src/index.js screenshot --preset miura-ori -o /tmp/analysis.png
```

## 注意事项

1. **浏览器超时**: 如果页面加载慢，命令可能超时
2. **网络依赖**: 需要访问 origamisimulator.org
3. **Playwright**: 首次运行会自动安装 Chromium

## 测试

```bash
npm test           # 单元测试 (快速)
npm run test:e2e   # E2E测试 (需要浏览器)
```
