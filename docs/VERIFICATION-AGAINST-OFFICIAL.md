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
`birdBase → Bases-birdBase (1,0)` · `openSinkBase → Bases-openSinkBase (1,0)` ·
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
