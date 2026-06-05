# Command Reference

**文档版本**: 0.2.0
**更新日期**: 2026-04-16
**CLI版本**: 0.2.0

---

## 命令概述

```
origami [options] [command]
```

### 全局选项

| 选项 | 说明 |
|------|------|
| `-V, --version` | 显示版本号 |
| `-h, --help` | 显示帮助信息 |

---

## load - 加载模型

加载 FOLD/SVG 文件或预设模型。

### 语法

```bash
origami load [options]
```

### 选项

| 选项 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `-f, --file <path>` | string | FOLD/SVG 文件路径 | `--file model.fold` |
| `-p, --preset <name>` | string | 预设模型名称 | `--preset miura-ori` |

### 示例

```bash
# 加载预设模型
origami load --preset cranes
origami load -p miura-ori

# 加载文件
origami load --file ./designs/origami.fold
```

### 可用预设 (27个)

#### Origami (8个)
| 预设名 | 说明 |
|--------|------|
| `cranes` | 仙鹤 (3D) |
| `flapping-bird` | 飞翔鸟 |
| `flat-crane` | 仙鹤 (平面) |
| `hypar` | Hypar |
| `square-twist` | 方扭曲 |
| `airplane` | 纸飞机 |
| `lang-cardinal` | Lang主教鸟 |
| `lang-orchid` | Lang兰花 |

#### Bases (5个)
| 预设名 | 说明 |
|--------|------|
| `bird-base` | 鸟型Base |
| `boat-base` | 船型Base |
| `frog-base` | 青蛙Base |
| `square-base` | 方型Base |
| `waterbomb-base` | 水弹Base |

#### Tessellations (5个)
| 预设名 | 说明 |
|--------|------|
| `miura-ori` | 三浦折叠 |
| `waterbomb` | 水弹 |
| `flower-tower` | 花塔 |
| `lang-honeycomb` | Lang蜂窝 |
| `huffman-extruded` | Huffman挤出盒 |

#### Curved (3个)
| 预设名 | 说明 |
|--------|------|
| `leafy-opus` | 叶状作品 |
| `shell14` | 贝壳14 |
| `rotating-star` | 旋转星 |

#### Pleating (2个)
| 预设名 | 说明 |
|--------|------|
| `box-pleat-tess` | 箱式折叠 tess |
| `box-pleat-pyramid` | 箱式折叠金字塔 |

#### 其他 (4个)
| 预设名 | 说明 |
|--------|------|
| `kirigami-triangle` | Kirigami三角形 |
| `popup-simple` | 简单弹出 |
| `bistable-curved` | 双稳态曲线 |
| `polygami-cross` | 多边形交叉 |

---

## list - 列出预设

列出所有可用的预设模型。

### 语法

```bash
origami list [options]
```

### 选项

| 选项 | 类型 | 说明 |
|------|------|------|
| `-c, --category <name>` | string | 按分类筛选 |
| `--simple` | boolean | 简洁列表 (只显示ID) |

### 示例

```bash
# 列出所有预设
origami list

# 简洁列表
origami list --simple

# 按分类筛选
origami list --category origami
origami list -c tessellations
```

---

## screenshot - 截图

截取模拟器当前状态的截图。

### 语法

```bash
origami screenshot [options]
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `-o, --output <path>` | string | `origami-screenshot.png` | 输出文件路径 |
| `-s, --scale <number>` | number | `2` | 图片缩放比例 |

### 示例

```bash
# 基本用法
origami screenshot

# 指定输出路径
origami screenshot -o ./output/preview.png

# 高清截图
origami screenshot --scale 4
```

---

## simulate - 运行模拟

运行折叠模拟。

### 语法

```bash
origami simulate [options]
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--percent <number>` | number | `1.0` | 折叠百分比 (0-1) |
| `--iterations <number>` | number | `50` | 求解器迭代次数 |

### 示例

```bash
# 完全折叠
origami simulate

# 半折叠
origami simulate --percent 0.5

# 高精度模拟
origami simulate --iterations 100
```

---

## view - 切换视图

切换显示视图模式。

### 语法

```bash
origami view [options]
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `-m, --mode <mode>` | string | `simulation` | 视图模式 |

### 视图模式

| 模式 | 说明 |
|------|------|
| `pattern` | 折痕图案视图 |
| `simulation` | 模拟视图 (默认) |
| `folded` | 折叠完成视图 |
| `strain` | 应力分析视图 |

### 示例

```bash
# 切换到应力视图
origami view --mode strain

# 切换到图案视图
origami view -m pattern
```

---

## export - 导出模型

导出模型为指定格式。

### 语法

```bash
origami export [options]
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `-f, --format <format>` | string | `png` | 导出格式 |
| `-o, --output <path>` | string | `./origami-export` | 输出路径 |

### 支持格式

| 格式 | 说明 | 用途 |
|------|------|------|
| `png` | 图片 | 截图 |
| `fold` | FOLD JSON | 折纸专用格式 |
| `stl` | STL 3D模型 | 3D打印 |
| `obj` | OBJ 3D模型 | 3D建模软件 |
| `svg` | SVG 矢量图 | 矢量编辑 |

### 示例

```bash
# 导出为STL (3D打印)
origami export --format stl --output ./prints/model.stl

# 导出为PNG
origami export -f png -o ./screenshots/model.png

# 导出FOLD格式
origami export -f fold -o ./exports/model.fold
```

---

## record - 录制视频

录制模拟过程为 GIF、WebM 或 MP4 视频。使用 Playwright 帧捕获 + FFmpeg 合成。

### 语法

```bash
origami record [options]
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--format <format>` | string | `gif` | 视频格式 (gif/webm/mp4) |
| `--fps <number>` | number | `30` | 帧率 |
| `--duration <seconds>` | number | `5` | 录制时长 (秒) |
| `-o, --output <path>` | string | `origami-record.gif` | 输出文件 |
| `-p, --preset <name>` | string | - | 预设模型名称 |
| `--start-percent <number>` | number | `0` | 起始折叠百分比 (0-1) |
| `--end-percent <number>` | number | `1` | 结束折叠百分比 (0-1) |
| `--scale <number>` | number | `2` | 录制缩放 (1-4) |
| `--frames <number>` | number | `60` | 捕获帧数 |
| `--temp-dir <path>` | string | `/tmp/origami-frames` | 临时帧目录 |

### 示例

```bash
# 录制5秒GIF (默认折叠0→100%)
origami record --preset miura-ori -o /tmp/miura.gif

# 录制10秒WebM
origami record --format webm --duration 10 --preset waterbomb -o /tmp/waterbomb.webm

# 高帧率录制
origami record --fps 60 --duration 3 --preset cranes -o /tmp/cranes60.gif

# 半折叠动画 (0→50%)
origami record --start-percent 0 --end-percent 0.5 --preset miura-ori -o /tmp/half.gif

# 录制MP4
origami record --format mp4 --preset miura-ori -o /tmp/miura.mp4
```

### 技术实现

1. Playwright 截取多帧 PNG 图像
2. FFmpeg 合成视频/GIF

---

## analyze - 分析模型

分析模型属性。

### 语法

```bash
origami analyze [options]
```

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--all` | boolean | `false` | 显示所有分析数据 |

### 分析项目

| 项目 | 说明 |
|------|------|
| `vertices` | 顶点数 |
| `edges` | 边数 |
| `faces` | 面数 |
| `foldability` | 可折叠性 |
| `symmetry` | 对称性 |

### 示例

```bash
# 基础分析
origami analyze

# 完整分析
origami analyze --all
```

---

## batch - 批量处理

批量处理多个模型。

### 语法

```bash
origami batch [options]
```

### 选项

| 选项 | 类型 | 说明 |
|------|------|------|
| `--models <list>` | string | 逗号分隔的模型路径 |
| `--action <action>` | string | 要执行的操作 |

### 示例

```bash
# 批量截图
origami batch --models model1.fold,model2.fold,model3.fold --action screenshot

# 批量导出STL
origami batch --models ./designs/*.fold --action export --format stl
```

---

## verify - 验证文件

验证模型文件的有效性。

### 语法

```bash
origami verify <file>
```

### 示例

```bash
origami verify ./designs/origami.fold
```

---

## config - 配置参数

配置模拟参数。

### 语法

```bash
origami config [options]
```

### 选项

| 选项 | 类型 | 说明 |
|------|------|------|
| `--axial-stiffness <n>` | number | 轴向刚度 (0-1) |
| `--crease-stiffness <n>` | number | 折痕刚度 (0-1) |
| `--gravity <n>` | number | 重力强度 (-1 to 1) |
| `--num-iterations <n>` | number | 迭代次数 |

### 示例

```bash
# 设置高刚度
origami config --axial-stiffness 0.9 --crease-stiffness 0.8

# 零重力
origami config --gravity 0
```

---

## 工作流示例

### 医疗器械设计验证

```bash
#!/bin/bash
# 1. 加载设计
origami load --file coronary-stent.fold

# 2. 配置参数
origami config --axial-stiffness 0.95 --crease-stiffness 0.8

# 3. 模拟折叠
origami simulate --percent 1.0 --iterations 100

# 4. 应力分析
origami view --mode strain
origami screenshot --output strain_analysis.png

# 5. 导出3D模型
origami export --format stl --output ./output/stent.stl

# 6. 分析报告
origami analyze --all
```

---

**最后更新**: 2026-04-16
