# 📦 origami-simulator-cli 包装设计增强 v1.5.0

## 🎯 核心提升

**厚度约束解决物理冲突** — 当纸张厚度 t > 0 时，折叠角度被唯一确定，避免了多解导致的非物理重叠。

## 📊 提升对比

| 维度 | v0.2.0 (Before) | v1.5.0 (After) |
|------|-----------------|----------------|
| 折叠角度 | `[0, 0, 0, 0]` 无意义 | `[0, 177, 177, -177, -177]` 物理正确 |
| 厚度参数 | ❌ 无 | ✅ 0.5~3mm 可配置 |
| Mountain 角度 | 不确定 | 177° (t=1mm) |
| Valley 角度 | 不确定 | -177° (t=1mm) |
| **材料预设** | ❌ 无 | ✅ 8 种真实材料 |
| **SVG 打印输出** | ❌ 无 | ✅ 含图例的可打印 SVG |
| **批量生成** | ❌ 无 | ✅ 一次生成多种厚度 |
| 功能模块 | 1个 (模拟) | 7个 (解析+绑定+渲染+模板+材料+SVG+批量) |
| 单元测试 | 基础测试 | **129 个全部通过** ✅ |

## 🔧 新增模块

### 1. Dieline 解析 (`dieline`)

```bash
origami dieline parse <file>      # 解析 PDF/EPS/SVG/FOLD
origami dieline export <file>     # 导出为不同格式
origami dieline validate <file>    # 验证文件
origami dieline info <file>        # 查看文件信息
```

### 2. Face Binding (`bind`)

```bash
origami bind add <m> <f> <a>       # 绑定 artwork 到面
origami bind batch <m> <dir>        # 批量绑定
origami bind list <model>           # 列出绑定
origami bind generate <model>       # 生成模板
```

### 3. 商业级渲染 (`render`)

```bash
origami render single <model>      # 单图渲染
origami render batch <model>       # 批量多角度
origami render presets              # 渲染预设 (web/social/print/transparent/product)
```

### 4. 盒型模板 (`template`) ⭐ 重大升级

```bash
origami template list                # 列出盒型
origami template materials           # ⭐ 列出材料预设
origami template generate <name>    # ⭐ 支持 --material 和 --thickness
origami template batch <name>       # ⭐ 批量生成不同厚度
origami template info <name>         # 模板信息

# ⭐ 新增选项
--material <id>                    # 使用材料预设
--thickness <mm>                   # 自定义厚度
--export-svg <path>                # ⭐ 导出可打印 SVG
```

### 5. 材料预设系统 ⭐ 新增

8 种真实材料配置：

| ID | 中文 | 厚度 | 推荐用途 |
|----|------|------|----------|
| `copy-paper` | 复印纸 | 0.1mm | tube, small-carton |
| `cardboard-1mm` | 标准纸板 | 1mm | mailer, pizza, aircraft |
| `cardboard-2mm` | 厚纸板 | 2mm | mailer, rigid-box |
| `cardboard-3mm` | 重型纸板 | 3mm | rigid-box, heavy-mailer |
| `kraft-paper` | 牛皮纸 | 0.3mm | pouch, envelope |
| `corrugated` | 瓦楞纸板 | 4mm | shipping-box |
| `folding-cart` | 折叠纸盒板 | 0.5mm | carton, cosmetics |
| `tissue-paper` | 薄页纸 | 0.04mm | tube, decorative |

### 6. SVG 打印导出 ⭐ 新增

可生成包含图例的印刷级 SVG：
- 红色虚线 = Mountain 折叠
- 蓝色虚线 = Valley 折叠
- 黑色实线 = 切割线
- 自动添加尺寸标注

### 7. 批量生成 ⭐ 新增

一次性生成多个厚度变体，用于 A/B 测试：

```bash
origami template batch mailer --thicknesses 0,0.5,1,2,3 -o ./variants
```

## 📦 内置盒型 (5种)

| ID | 中文 | 类型 |
|----|------|------|
| `folding-carton` | 折叠纸盒 | 通用 |
| `aircraft` | 飞机盒 | 通用 |
| `mailer` | 邮寄盒 | 物流 |
| `pizza` | 披萨盒 | 食品 |
| `tube` | 圆管盒 | 圆柱 |

## 💡 完整工作流

```bash
# 1. 使用材料预设生成盒型
origami template generate mailer --material cardboard-1mm -o box.fold

# 2. 同时导出可打印 SVG
origami template generate mailer --material cardboard-2mm \
  --export-svg box-dieline.svg -o box.fold

# 3. 批量生成多种厚度做对比
origami template batch mailer --thicknesses 0.5,1,2,3 -o ./variants

# 4. 生成面模板 SVG
origami bind generate box.fold -o ./artwork/

# 5. 绑定实际设计图
origami bind add box.fold 0 artwork/face0.png

# 6. 渲染商业图片
origami render single box.fold -o mockup.png --dpi 300 --shadow
```

## 📁 文件结构

```
origami-simulator-cli/
├── src/
│   ├── utils/
│   │   ├── dieline-parser.js          # Dieline 解析
│   │   ├── dieline-svg-exporter.js    # ⭐ SVG 打印导出
│   │   ├── box-batch-generator.js     # ⭐ 批量生成器
│   │   ├── face-binding.js            # Artwork 绑定
│   │   ├── renderer.js                # 商业渲染
│   │   └── ...
│   ├── commands/
│   │   ├── dieline.js
│   │   ├── bind.js
│   │   ├── render.js
│   │   └── template.js                # ⭐ 升级版
│   └── templates/
│       └── packaging/
│           ├── box-templates.js       # 盒型生成器
│           ├── materials.js            # ⭐ 材料预设
│           └── validator.js            # 验证器
└── tests/
    └── unit/
        ├── dieline-parser.test.js      # 17 tests
        ├── dieline-svg-exporter.test.js  # ⭐ 13 tests
        ├── face-binding.test.js        # 19 tests
        ├── renderer.test.js            # 27 tests
        ├── box-templates.test.js       # 32 tests
        ├── box-batch-generator.test.js  # ⭐ 5 tests
        └── materials.test.js            # ⭐ 16 tests
```

## 🔬 物理原理

### 厚度约束公式

```
当厚度 t > 0 时:
  - Mountain 角度从 180° 减小 (纸张围绕自身厚度弯曲)
  - Valley 角度从 -180° 增大
  - 唯一物理解, 避免非物理重叠

基础公式:
  M = 180 - min(t × 3, 30)
  V = -180 + min(t × 3, 30)
```

### 材料增强公式

```
考虑材料弹性系数:
  reduction = min(thickness × elasticityFactor × 3, maxAngleReduction)
  
  M = 180 - reduction
  V = -180 + reduction
```

## 📈 测试结果

```
Test Suites: 7 passed, 7 total
Tests:       129 passed, 129 total ✅
```

| 测试套件 | 通过数 |
|----------|--------|
| `dieline-parser.test.js` | 17 ✅ |
| `face-binding.test.js` | 19 ✅ |
| `renderer.test.js` | 27 ✅ |
| `box-templates.test.js` | 32 ✅ |
| `materials.test.js` ⭐ | 16 ✅ |
| `dieline-svg-exporter.test.js` ⭐ | 13 ✅ |
| `box-batch-generator.test.js` ⭐ | 5 ✅ |
| **总计** | **129 ✅** |

## 🎨 SVG 输出示例

生成的 SVG 包含：
- 标题和说明文字
- 切割线 (黑色实线)
- Mountain 折叠线 (红色虚线)
- Valley 折叠线 (蓝色虚线)
- 完整图例
- 尺寸标注

可直接用于：
- 📄 印刷打样
- 🖨️ 激光切割
- ✂️ 手工制作
- 📐 CAD 软件导入
