# 以官方 78 例为基准的验证报告（v2.48.1）

> 验证对象：**v2.48.0 的「按意图生成」**（`origami generate`）
> 基准：**官方 origamisimulator.org 的 78 个真实折痕图**（MIT 许可，本地副本在
> `goods/origami-examples/`）
> 可复现：`node scripts/verify-against-official.js`
> 日期：2026-11-26

---

## 结论（三层验证）

| 验证 | 口径 | 结果 |
|---|---|---|
| ① **还原保真度** | 官方几何经我的规范化管线后是否被破坏 | **弧长保持 75/75**（另 3 件官方 FOLD 本身为空，不适用）· **几何覆盖率 75/75** |
| ② **覆盖矩阵** | 我的 8 个内置生成器能否覆盖官方形态 | **0/78** —— 结构指纹距离普遍 1.08–1.9，**一个都没覆盖到** |
| ③ **逆向拟合** | 官方形态能否被「模板 + 参数」复现 | **63/78（81%）** |

**这组数字给出了一个明确的路线判断**：

> 模板模式（63/78）远胜内置生成器（0/78）。
> 「硬编码几个经典图案的生成器」这条路在官方形态的多样性面前**几乎不成立**；
> 「以真实作品作模板 + 对称变换」才是「按意图生成」的可用载体。

---

## ① 还原保真度：规范化管线不破坏官方几何

模板来自 SVG→FOLD 转换，而 **SVG 在折痕交汇处没有顶点标记** → 转换出的 FOLD 在那里是
两条独立边相交（proper crossing），几何不完整。规范化管线：

```
splitCreasesAtCrossings  →  balanceMountainValley  →  dedupeVertices
（求交点建共享顶点）      （交点处重新平衡 M/V）        （合并重复顶点）
```

实测（78 件官方示例）：

| 指标 | 结果 |
|---|---|
| **折痕总弧长保持**（比值偏离 < 0.5%） | **75/75**（3 件官方 FOLD 本身为空，不适用） |
| **几何覆盖率**（新折痕落在原折痕线上的比例） | **75/75**（100%） |
| 交叉被规范化消除 | **46/78**（原本有交叉的都被消掉） |
| 规范化后折平性全过 | 27/78（其余是曲面折痕 / 剪纸 / 无限图案片段，见 `docs/CORPUS-HEALTH.md`） |

→ **规范化只拆边、加顶点，不动几何位置**。

## ② 覆盖矩阵：内置生成器覆盖不了官方形态

结构指纹 = `log(顶点数) · log(边数) · log(内部顶点数) · log(面数) · M/V/B 比例 · 内部顶点度数直方图(3/4/5/6/7+)`

| 内置生成器 | 最近邻命中数 |
|---|---|
| miura | 21 |
| modular | 19 |
| unit | 19 |
| tiger | 17 |
| crane | 2 |

**距离 < 0.9（视为覆盖该形态）：0/78** —— 最近的距离也有 1.086（`flappingBird → modular`）。

**这不是生成器"不够好"，是形态谱系不同**：官方 78 例里镶嵌与模块化占大头
（miura/modular/unit/tiger 合计 76 件的最近邻），
而我的内置生成器是 5 个手工几何 + 3 个参数化生成器。

## ③ 逆向拟合：模板 + 参数能复现 81% 的官方形态

搜索空间：模板库 × copies{1,2,3,4,6} × rotate{0,30,45,60,90,120,180}

**复现最好（距离 0）**：
`birdBase → birdBase (1,0)` · `openSinkBase → Bases-openSinkBase (1,0)` ·
`flat_crane → Origami-flat_crane (1,0)` · `traditionalCrane → Origami-flappingBird (4,0)` ·
`miura-ori → Tessellations-huffmanWaterbomb (1,0)` · `langOvalTessellation → Origami-flat_crane (6,0)` ·
`langHoneycomb → Tessellations-huffmanWaterbomb (6,0)` · `langCardinal → Kirigami-honeycombKiri (2,0)`

> 注意 `traditionalCrane → flappingBird copies=4`：**用拍翅鸟做 4 份阵列，
> 结构上就逼近了传统飞鹤** —— 这正是「按意图生成」该有的能力。

**复现不了（模板库该扩充的清单）**：
`wavy_pleats` · `Improvisation-62` · `Tri-Wing_Boomerang_Tiling` · `simpleVertex` ·
`russianTriangle` · `HexSpiralTess` · `Treble_Clef` · `auxetic_triangle` · …

---

## 这次验证带来的两个改动

1. **模板库从 11 件扩到 12 件**（按官方基准重新筛：规范化后判定全过的优先，
   几何完好但平面判定不适用的保留并标注 `known_limitations`）。
2. **验证脚本进仓库**（`scripts/verify-against-official.js`），任何人可复现上述三层结论。

## 仍然存在的缺口（如实登记）

- **内置生成器的形态覆盖 0/78** —— 要覆盖得给它们加参数（行/列/角度/单元比例），
  或干脆把官方 78 例全部做成模板。
- **Maekawa 在官方作品上仍只有 27/78 全过** —— 主因是无限图案的有限片段
  人为边界破坏了 M/V 平衡（见 `docs/CORPUS-HEALTH.md`），不是实现问题。
- **拟合用的结构指纹是启发式**（不是折痕图的真正同构判定）—— 距离 < 0.9 是工程阈值，
  不是数学定理。


---

## 追加：转换器修复（2026-11-26 晚）

验证中发现 **3 件官方 FOLD 是空的**（`HexSpiralTess` / `Treble_Clef` / `auxetic_triangle`）。
追到主项目的 `evolution/svg_to_fold.py`，找到**两个真 bug**：

| bug | 表现 |
|---|---|
| `_polyline_to_edges` 的坐标提取 | SVG 的 `points` 允许「x1,y1,x2,y2 逗号混写」，旧实现按空白切分再 `split(',')` → 得到 4 段 → `len != 2` → **丢掉整条边**。实测 `auxetic_triangle` 的 **846 个 polyline 全部产出 0 条边** |
| 主循环 `path` 分支调错函数 | 调的是只认 M/L 的 `_line_to_edges_from_poly`，而支持 Q/C 的 `_path_to_edges` **从未被调用（死代码）** → 含贝塞尔曲线的 path 全废（`HexSpiralTess` 131 条、`Treble_Clef` 2 条） |

修复：① 坐标改用「正则提取数字再两两配对」② path 分支改调 `_path_to_edges`
③ `_path_to_edges` 重写为支持 `M/L/H/V/C/S/Q/T/A/Z`，曲线按**尺度自适应**采样（2–6 段，
固定 8 段会让曲面折痕膨胀到 9.5 MB）。

**修复结果：77/77 件 SVG 全部产出非空 FOLD**（修复前 3 件为空）。

### 由此推翻此前的一个判断

此前记录「Maekawa 只有 28% 通过，是语料形态问题（无限图案的有限片段）」。
修好转换器后，**`miura-ori` 的 Maekawa 从 0/132 变成 132/132**。

真因是：**旧转换器把折痕画成了「相互交叉但不共享顶点」的形式** → 规范化打断后
边数从 312 涨到 682 → 交点处的 M/V 分配失衡 → Maekawa 全灭。
新转换器直接生成规范折痕图（规范化不再改变它：182/315 不变）→ Maekawa 通过。

→ **「语料形态问题」这个结论对一部分作品是错的，真因是转换器。**

### 模板库从 12 件扩到 19 件

按修好的语料重筛（规范化 → Kawasaki 与 Maekawa 全过）：

新增可作模板：`miura-ori`（M132/132）· `scale`（M114/114）· `squaretwistManyAngles`（M36/36）·
`singlesquaretwist` · `simpleVertex` · 以及若干无内部顶点的造型件（K0/0 M0/0）。


### 模板库扩充到 20 件后的最终排查

| 类别 | 件数 | 可否修 |
|---|---|---|
| ✅ 规范化后 Kawasaki + Maekawa 全过 | **20** | — |
| ❌ 真实 M/V 失衡（曲面折痕 / 剪纸 / 无限图案的有限片段） | 57 | **不可修**：人工边界破坏了 M/V 平衡，是形态限制 |

颜色解析修好前，那 57 件里有 15 件的失格原因是**转换器没认出颜色写法**（短 hex / style 内联 /
CSS 类），现已全部修好；剩下的是真的 M/V 失衡。
