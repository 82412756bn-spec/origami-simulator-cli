# 学习语料（golden corpus）健康报告 · 2026-11-26

> 语料位置：`~/文档/Unbuntu_system/goods/origami-examples/`（origamisimulator.org 的副本，MIT 许可）
> 本报告回答一个问题：**这 77 个作品里，哪些能作为「折痕图质量」的基准？**

---

## 结论

| 类别 | 数量 | 含义 |
|---|---|---|
| ✅ **M/V 计数与同名 SVG 的红/蓝一致** | **21** | **可作基准**：折痕类型没丢，判定结果有意义 |
| ❌ assignment 丢失折痕类型（全 `U`） | 14 | 转换丢了 M/V 信息 → **完全不能作基准** |
| ⚠️ M/V 计数也与 SVG 不一致 | 42 | SVG 与 FOLD 不同源或转换有损 → 不能作基准 |

**检查方法**：FOLD 的 `edges_assignment` 里 M 的数量必须等于同名 SVG 里 `#FF0000` 的数量，
V 的数量必须等于 `#0000FF` 的数量。

> ⚠️ **只比 M/V，不比 B**：SVG 里一个矩形 / 一条 polyline 只算 1 个 `#000000` 元素，
> 而 FOLD 把它展开成多条边界边 → B 的计数天然不等（`birdBase`：FOLD B=4 vs SVG 黑=1 属**正常**）。
> 我第一版把 B 也纳入比较，误判了 51 件语料「损坏」—— 那是我的判据过严，不是数据问题。

---

## 可作基准的 21 件

```
  Bases/birdBase
  Bases/boatBase
  Bases/frogBase
  Bases/openSinkBase
  Bases/pinwheelBase
  Bases/squareBase
  Bases/waterbombBase
  Curved/CircularPleat-antiFacet
  Curved/curvedcrease2
  Curved/shell14
  Curved/shell6
  Kirigami/honeycombKiri
  Origami/6ptHypar-anti
  Origami/flappingBird
  Origami/flat_crane
  Origami/traditionalCrane
  Popup/castlePopup
  Popup/geometricPopup
  Popup/housePopup
  Popup/popupSimple
  Tessellations/huffmanWaterbomb
```

**它们几乎全是「有限作品」**（Bases / Popup / Curved 单件 / traditionalCrane / flat_crane / flappingBird），
而不是无限图案的有限片段 —— 这一点很关键，见下节。

## 不能作基准的 56 件

- **assignment 丢失折痕类型**（14 件）：FOLD 里 `edges_assignment` 全是 `U`
  （例：`Origami/airplane` FOLD U=29，而它 SVG 里有 红5 蓝16 黑25 → 折痕类型全丢）
- **SVG 与 FOLD 不同源 / 转换有损**（42 件）：例 `Curved/comet` FOLD(M,V)=(1384,1254)
  而 SVG(红,蓝)=(91,54)；`Origami/6ptHypar-anti` FOLD(M,V)=(69,52) vs SVG(红,蓝)=(2,1)

---

## 为什么 Maekawa 在这批语料上只有 28% 通过（**不是实现错**）

实测对照（78 个作品）：

| 语料类型 | Maekawa 通过率 |
|---|---|
| **有限作品**（边界是合法的 B 边） | **71/79 = 89.9%** ✅ |
| 无限图案的**有限片段**（边界是人造的） | 80/635 = **12.6%** ❌ |

**原因**：无限图案（miura-ori、langHoneycomb…）被裁成有限片段时，边界上的折痕被人为替换成 B 边，
破坏了邻近顶点的 M/V 平衡 → Maekawa（要求每个内部顶点 \|M−V\| = 2）必然不通过。
**这不是实现的 bug，是语料形态与定理前提不匹配。**

所以：
- **Kawasaki**（局部条件、与 M/V 平衡无关）→ 语料可靠 → 通过率 87.33% ✅
- **Maekawa** → 只有「有限作品」这一类语料可用 → 用上面那 21 件

## 附：被否掉的假设（留档免得重走）

「Maekawa 对奇数度顶点的阈值应是 1（偶数度 2）」—— 数据否掉了：
顶点通过率 28.13% → **23.56%（更差）**，degree 3 从 31.2% 掉到 16.9%。
所以阈值统一用 2 是对的，奇偶之分不成立。

---

## 维护方式

```bash
# 重跑本报告（语料在主项目，只读）
python3 ~/.qwenpaw/workspaces/default/consulting/unbuntu-system/research/../scripts/corpus_health.py
```

语料若被重新转换/更新，**本报告需要重跑** —— 判定基准变了，结论也要跟着变。
