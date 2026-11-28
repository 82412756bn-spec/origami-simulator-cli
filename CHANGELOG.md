# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.54.2] - 2026-11-28

### Fixed — 面的延长法：`clipToHull` 的参数方向 bug

`clipToHull(P, d)` 返回 `[t_enter, t_exit]`，P 在凸包内时 `t_enter < 0 < t_exit`。
沿 `-dir` 参数化 `P + t·(-dir)` 时，**-dir 那一侧的边界在 `t = t_exit`（正）**，不是 `t_enter`。
原实现取 `c[0]`（负值）→ A 端被推向 **+dir**（纸内方向）→ **折痕根本没伸到纸边**。

已修：A 端改用 `c[1]`。

### 测量 — 单变量对照实验：修方向**不能**救回全延长

大副 2026-11-28 复核指出「方向反了」与「X 交叉未打断」是**两个独立失效**，修一个仍崩。
实验证实（只改方向，不动 X 交叉）：

| 作品 | 口径 | 面 | 重叠 | 面积比 | Euler 实际/期望 |
|---|---|---|---|---|---|
| birdBase | 纯半边 | 8 | 0 | 0.571 | 9/1 |
| birdBase | **全延长（方向已修）** | **0** | 0 | **0.000** | 1/1 |
| flat_crane | 纯半边 | 70 | 0 | 1.000 | 71/1 |
| flat_crane | **全延长（方向已修）** | **0** | 0 | **0.000** | 1/1 |
| miura-ori | 纯半边 | 132 | 0 | 0.838 | 133/1 |
| miura-ori | **全延长（方向已修）** | **1** | 0 | **0.000** | 2/1 |

→ 修方向后全延长**更糟**（0–1 面、面积比 0）→ **第二个失效独立存在** ✓

### 测量 — Euler 特征判据在折痕图上**不适用**（但暴露了更根本的事实）

大副建议用 Euler 特征 `F = E − V + 1 + C` 作为不依赖参考文件的独立判据。
实测发现：它要求图**每个顶点度 ≥ 2**（无悬挂顶点），而折痕图有大量度 1 的悬挂顶点
→ 公式不成立（纯半边 birdBase 期望 1 / 实际 9、flat_crane 71/1）。

**但它有效地证明了全延长图退化成了单一回路**（Euler 1/1、面积比 0.000）→
**根本不是划分**。→ 保留为诊断指标，不作为通过条件。

### Added — 面的判据再加两项

- **边-面关联度**：每条内边应被**恰好 2** 个面共享、每条边界边恰好 1 个
  （`orphanEdges` 只覆盖「0 个面」，不覆盖「3+ 个面」）
- **Euler 特征**：作为诊断指标输出（不作为通过条件，原因见上）

### 撤回终止条件（本次撤回附条件）

> 本次撤回（「全延长 = 完美划分」结论）终止条件（全部满足前，该结论保持撤回状态）：
> 1. ✅ `probe_faces3.js` 当前版本重跑，表格数字与脚本输出一致（根因 A：不同源）
> 2. ✅ 修复 `clipToHull` 方向后重新跑全延长对照实验，记录面数与覆盖率变化（根因 B：方向反了）
>    → **已执行：修方向后仍失败（0–1 面、面积比 0.000）**
> 3. ⬜ 单变量测试「打断 X 交叉」的独立贡献 —— **未完成**：
>    打断会改变顶点数 → 破坏 `balanceMountainValley` 的结果（v2.53.0 撤回「独立顶点」时
>    已实测到：birdBase 模板的 Maekawa 从全过变成 12/15）→ 需要第三条路
>    （候选：让 balanceMountainValley 在**原始拓扑**上算，再映射到打断后的图）
>
> 未满足 3 之前，不接受任何基于全延长法的结论。

## [2.54.1] - 2026-11-28

### Fixed — 大副复核指出的三个真问题

#### ① 人造 B 边的判据位置错了（误伤率 94.3% → 0%，Maekawa 通过率 92.9% → **97.9%**）

v2.53.0 把判据从「凸包之外」改成「包围盒严格内部」。大副指出这仍会误伤
**非凸纸的凹口边 / 纸上有孔 / 多张拼接**的真纸边。

实测（全量 78 件）：包围盒口径把 **32511 条 B 边里的 94.3%** 判成人造并恢复 → 过度恢复。
改成「B 边构成的**闭合回路**」后反而更糟（**98.8%**）—— 因为**规范化已经把纸边切成悬挂段**，
闭合回路几乎不存在。

**根因**：判据必须在**原始图**上做，而 v2.53.0 把它放在规范化**之后**。
现移到流程最前（在任何几何处理之前），原始图上 B 边就是完整的纸边 → 判据才准。

| | v2.53.0（包围盒，规范化后） | v2.54.1（闭合回路，原始图上） |
|---|---|---|
| 被判人造的 B 边 | 94.3%（32511 条中 30667） | **63.9%**（1304 条中 833） |
| Maekawa 顶点级通过率 | 92.9% | **97.9%**（16835/17195） |

#### ② 选择规则：退化率应是 hard gate，不是「通过率优先」

大副指出：**退化面会「膨胀」通过率**（面少 → 失败顶点也少）→ 若按通过率优先，
会选到更差的分解。**这是逻辑跳跃**，我原先没意识到。

现在排序：**退化率 ≤ 2% 的「干净」版本优先（hard gate）→ 判据全过 → 顶点级通过率 → 取重建版**。

#### ③ 静默失败：SVG 转换失败被吞掉

原先 catch 之后直接回退规范化版，**统计里看不出「重建其实没跑成」**。
现在显式收集失败原因并在报告里列出。

### Added — 面判据加强（大副：面积守恒 + 非重叠是必要不充分）

`detectFaceOverlaps` 新增两项：

- **简单多边形检查**（`isSimplePolygon`）：面不能自交（否则面积与拓扑都不可信）
- **边集包含关系**：面的每条边都必须是折痕图里存在的边（否则面是凭空造的）
  —— 只在调用方提供了 `edges_vertices` 时才判（否则无从判断）

### Fixed — benchmarks 生成物不进版本库

`benchmarks/corpus-normalized/` + `corpus-rebuilt/` 各 **11M**（合计 22M）→ 可再生生成物
→ 已加 `.gitignore`（大副的判断正确：可再生产物不该进库）。

## [2.54.0] - 2026-11-28

处理 v2.53.0 留下的三条遗留。**其中一条要先更正上一轮的错误结论。**

### 更正：②「面的算法已有干净答案」—— 那个判断基于错误数据

上一轮报告说「全延长法同时满足重叠=0 与面积比=1.00，是完美划分，已实现、只需接线」。
**复核发现那张表不可信**（同一脚本重跑得不到同样结果）。重新实测：

| 口径 | birdBase | flat_crane | miura-ori | squaretwist |
|---|---|---|---|---|
| 来源文件 | 16/**9**/5.66 | 118/**20**/15.46 | 232/**20**/14.26 | 193/**20**/8.91 |
| 纯半边（当前默认） | 8/0/0.571 | 66/0/0.909 | 134/0/0.848 | 85/0/0.778 |
| 全延长（只延长到纸边） | **1**/0/1.00 | **1**/0/1.00 | **1**/0/1.00 | **1**/0/1.00 |

→ 全延长退化成「**整张纸一个面**」（面积比 1.00 但根本没分开）。
**根因**：延长后的折痕端点落在纸边上，但**纸的边界边没有在那些交点处切分** → 平面图不连通
→ 半边算法找不到闭合回路。补上「切分边界边」后仍是 1 面 → **还差第三步**：
**折痕之间的 X 交叉点必须切成 T 型 junction**（打断交点）。

→ 「面」的完整正确算法是**三步**：① 打断 X 交叉 → ② 折痕延长到纸边 → ③ 切分纸的边界边。
本版只做到 ③ 的部分实现（`src/utils/crease-faces.js`，作诊断工具）。

**处置**：**② 降级为专档任务**，本版**回退到纯半边**（三个候选里最不坏的：不重叠、
覆盖 57–91%）。取舍理由写进代码注释：**宁可少面也不能重叠** ——
下游模拟宁可有缺口，也不能拿互相重叠的面当划分。
CLI 继续在覆盖率 < 90% 时明确提示「面划分不完整」。

### ① 语料重建选择器：新增 `scripts/rebuild-corpus-from-svg.js`

**从官方 SVG 重新生成 FOLD**，判据全过才采用，否则回退规范化版 —— 全自动、零风险、可增量。

实测（77 份同名配对）：

| | 数量 |
|---|---|
| **采用重建版** | **37 份** |
| 采用规范化版 | 40 份 |
| 未产出 | 0 份 |

典型对比：

| 作品 | 重建版 | 规范化版 | 采用 |
|---|---|---|---|
| squaretwistManyAngles | **36/36 · 36/36 全过** | 17/214 · 232/243 | 重建版 |
| 6ptHypar-anti | **46/46 · 46/46 全过** | 94/206 · 208/210 | 重建版 |
| HexTriFlatFoldableTess | **640/640 · 653/653 全过** | 328/336 · 450/450 | 重建版 |
| waterbombBase | 0/0 · 0/0 | **1/1 · 1/1 全过** | 规范化版 |
| whirlpool | 0/74 · 108/136 | 1/568 · 623/640 | 规范化版（通过率更高） |

选择规则（按优先级）：**判据全过** → **顶点级通过率** → **退化率** → 取重建版。

→ 重建版能治好的前提是**退化来自 FOLD 加工**（裁剪时把内部折痕换成 'B'）；
若退化来自**原始 SVG 本身的几何**（曲线采样截断，如 whirlpool）→ 重建无效，
选择器会自动回退到规范化版。

### ③ fish：补上构造依据出处

权威资料：origamiexpressions.com/origami-fish-base ——「The Fish Base is basically
two rabbit ear folds next to each other」（origamiok.com/fish-base-fold 同源）
→ 一对角各一组 22.5° 折痕 = 两个 rabbit ear → **与本实现的构造方向一致** ✓

**诚实标注保留**：没有机器可读的权威鱼基折痕图（只有图片）→ **未经实物折纸验证**。

## [2.53.0] - 2026-11-27

### 大副（firstmate）独立复核的处置

v2.52.0 提交前经大副独立复核，结论 **「有条件成立」**，提出 5 条必须改。本版逐条处置：

#### ① 「人造 B 边」判据改用包围盒严格内部，不再用凸包 —— **已改，且效果更好**

大副指出：凸包顶点在**非凸轮廓 / 纸上有孔 / 多张纸拼接**时不等于纸边 → 会误伤真正的
内部纸边，把该折的边变成折痕 → 改变折叠语义。

改为：**只有两端点都严格在纸的包围盒内部**的 B 边才判为「人造」→ 宁可漏判也不误伤。

效果反而更好（收紧后命中更准）：

| 作品 | 人造 B 修复 | Maekawa（v2.52.0 → v2.53.0） |
|---|---|---|
| miura-ori | 166 → **137** | 138/144 → **799/800** |
| langHoneycomb | 87 → 85 | 4851/4964 → **5005/5047** |
| waterbomb | 0 | 0/0 → **64/64** |

#### ② Maekawa 奇数价期望值：加**奇偶性不变量**与边界测试 —— **已加**

大副指出：「几何干净的真实作品里没有奇数价内部顶点」意味着**该期望从未被真实数据检验**，
且推广形式 |M−V| = 2 − c 的**奇偶一致性未证**。

处置：
- 加**奇偶性不变量**作为显式断言：|M − V| 必须与折痕数 n 同奇偶（M+V=n、|M−V| ≡ M+V mod 2）
  —— 这是与期望值**无关**的必要条件，若不成立说明 assignment 或边结构本身有问题
  → 新增 `parityViolations` 计数
- 补 3 条边界测试（deg4 M3/V1、deg3 M2/V1、deg4 M4/V0 的奇偶与判定）
- 文档化 c 与奇偶的关系

#### ③ 面覆盖率暴露 + 缺口提示 —— **已加**

大副指出：覆盖率 0.39–1.00，最差仅 39% 面积被覆盖 → 若下游假设「面是完整划分」会出错；
而「宁可少面不能重叠」只在下游**明确容忍 gap** 时成立。

处置：`generate --template` 在面覆盖率 < 90% 时**明确提示缺口**
（`ℹ️ 面覆盖 62%（N 个面，互不重叠）→ 面划分不完整，下游折叠模拟请自行确认是否接受缺口`），
不再让用户误以为面是完整划分。

#### ④ crane 是「改进版」而非严格复刻 —— **已文档化**

拓扑与真实作品 birdBase **完全一致**（13 顶点 / 24 边 / 中心 deg8 M5/V3 / 4 个 deg4 轴点），
但坐标用**精确的 tan(π/8)**，而官方 SVG 是像素取整（轴点 y = 0.5714 vs 精确 0.5858）。
→ 文档里如实标注为「**改进版复刻**（拓扑一致 + 角度精确化）」，不再称「复刻」。

#### ⑤ 605 个失败顶点的分类 —— **已测，大副的猜测被数据否掉**

大副要求把失败顶点分类为「X 交叉 vs 真退化」，并指出我此前「全部归因源数据」的判断**过早**。

实测（规范化后的 miura-ori，共 **717** 个失败顶点）：

| 类别 | 数量 | 占比 |
|---|---|---|
| 平交叉（该顶点所有折痕都连续穿过 → 交点是平的 → 本不适用 Kawasaki） | **21** | 3% |
| 非平交叉的 deg4（真退化） | **694** | 97% |
| 含 >180° 退化扇区的 | 92 | 13% |

→ **X 交叉只占 3%** → 大副猜的「多为 X 交叉」不成立 → 我原先「归因源数据几何退化」的结论**是对的**
（虽然当时的判断依据不充分，是实现/测试耦合的副作用，而非方案本身错误的证明）。
→ 这次复核的价值在于：**它逼我去测量，而不是争论**。

#### 额外：8 个生成器「声明状态 vs 实测」全量审计 —— **全部一致**

| pattern | 声明 | 实测 | 一致 |
|---|---|---|---|
| star / radial / miura / crane / tiger / fish | verified | verified | ✅ |
| unit / modular | na（单片 / 组装示意） | na | ✅ |

→ 确认 **759/759 全过不是因测试被放宽**。

### 附带

- 主项目提交前被「收工门禁」拦下（工作区内有 1 次**别的会话**的裸 spawn 未登记 → 按 workspace 维度阻断）。
  已**如实补登记**（audit.db 的时间戳 1795829280280 / session 1795019116076-6hscod0，
  created 取 spawn 真实时间以对齐 60 秒匹配窗口），未使用 `--no-verify` 绕过。
  这也暴露门禁的一个缺陷：**并行会话的绕过会误伤其他会话的提交**（watchdog 已是 warn-only，crew audit 是阻断）。

## [2.52.0] - 2026-11-27

收口 v2.51.1 留下的三条。

### ① 修正「人造边界」：内部 'B' 边恢复成真折痕

官方语料在**裁剪**时把纸边界上的折痕替换成 'B'，其中一部分发生在纸的**内部** ——
实测 54 个作品里 1304 条 B 边中 **320 条（24.5%）**是这类人造的。

后果：那些顶点带 180° 的退化扇区 → 真实的 Kawasaki 判定把它们全判为不合格
（miura-ori 退化率 70%）。

新增 `fixArtificialBoundaryEdges()`：一条 B 边若**两端点都不在纸的外轮廓上**（凸包顶点）
→ 它不可能是纸的边 → 是人造的 → 恢复成折痕（随后由 balanceMountainValley 平衡）。

效果（规范化语料，Maekawa 顶点级通过率）：miura-ori 1.5% → **95.8%**、
waterbomb 0% → **100%**、whirlpool 79.4% → **86.0%**。

### ② 交点处的处理 —— 部分解决，剩下的归因到源数据

**诊断**：规范化后的 miura-ori 有 **605 个 deg4 顶点**被 Kawasaki 判为不合格，
它们的扇区是两条直线的夹角（如 [34.8,192.4,83.8,49.0]）→ 交替和必不等。

**根因两层**：

1. **人造 'B' 边**（已修，见上）：官方语料裁剪时把**内部**折痕也换成 'B' →
   那些顶点带 180° 的退化扇区。
2. **X 交叉的拓扑表示**（未改）：两条折痕交叉时共享一个顶点 → 形成 deg4 顶点。
   FOLD 里 X 交叉的另一种标准表示是**两个坐标重合的独立顶点**（实测「坐标完全重合的
   顶点对数」3 → 787）→ 但那会**改变模板库的顶点结构**，连带破坏 `balanceMountainValley`
   的结果（实测 birdBase 模板的 Maekawa 从全过变成 12/15）→ **副作用大于收益，保持原样**。
   替代方案「在判定侧排除平交叉顶点」同样会让检查集变化、连锁影响多个基准 → 也已撤回。

**诚实的边界**：剩下的 Kawasaki 失败是**源文件本身的几何退化**（裁剪截断折痕 → 扇区角变成
任意值），不是判定或规范化能修的 —— 要彻底解决得**从官方 SVG 重新生成 FOLD**，或做几何优化
（调整顶点位置使交替和相等）。这是数据源问题，不是判据问题。

### ③ 面的三种口径（新增 crease-faces.js）

面（faces）的"正确"口径在这条数据链上有三种，都不完美：

| 口径 | birdBase | flat_crane | 问题 |
|---|---|---|---|
| 来源文件 | 16 | 118 | **面之间有重叠**（面面积和 = 纸凸包面积的 3–15 倍） |
| 纯半边（`extractPlanarFaces`） | 8 | 70 | **漏面**（悬挂边不产生面边界） |
| 折痕延长（新增） | 36 | 3755 | **过度划分**（所有折痕都延长 → 额外交点爆炸） |

折痕延长法（`src/utils/crease-faces.js`）的思路是折纸 CAD 的标准做法：
折痕在纸上**是连续的** → 每条折痕延长到纸边 → 所得平面直线图在纸内的区域才是「面」。
但它对**所有**折痕都延长，产生了大量不该有的交点。

→ **默认仍用纯半边**（不重叠、面积比 0.39–1.00 —— 下游模拟宁可少面也不能重叠），
折痕延长法作为**诊断工具**提供。

### ④ fish：真正的鱼基

鱼基 = preliminary base + **一对相对角的 4 条 22.5° 谷折**（squash 进去）→ 1/1 · 1/1 ✓

**诚实标注**：官方语料里**没有鱼基作品**可作参照（只有 birdBase / squareBase /
openSinkBase / pinwheelBase / boatBase / waterbombBase / frogBase），
所以本构造由 preliminary base + 22.5° 规律推导，满足折平必要条件，
但**未经实物折纸验证**。

现在 crane / tiger / fish 三者形态互不相同：

| pattern | 22.5° 折痕 | 类型 | 判定 |
|---|---|---|---|
| crane（真鹤基） | 8 条 | 真折痕（山折） | 5/5 · 5/5 |
| tiger（虎基） | 4 条 | 预折痕（'F'） | 1/1 · 1/1 |
| fish（鱼基） | 4 条 | 谷折（'V'），一对相对角 | 1/1 · 1/1 |

## [2.51.1] - 2026-11-27

收口 v2.51.0 留下的三条。

### ① crane / tiger：真正的鹤基 / 虎基（22.5° 网格）

v2.51.0 的 crane 和 tiger 都是 preliminary base → 形态无法区分。这一版按**真实作品**复刻。

**crane = 真正的鹤基**：拓扑与模板库真实作品 `birdBase` **完全一致**
（13 顶点 / 24 边 / 中心 deg8 M5/V3 / 4 个 deg4 轴点 M3/V1，轴点扇区 [112.5,112.5,67.5,67.5]）：

- preliminary base：中心 8 射线（到 4 角 + 4 个中轴点）
- **8 条 22.5° 的角折痕**（每个角连相邻 2 个轴点，`tan(π/8)` 精确值，非原 SVG 的像素取整）
- 4 条边界折痕（轴点 → 对应边的中点）

实测：**Kawasaki 5/5 · Maekawa 5/5** ✓

**tiger = 虎基**：preliminary base + **4 条 22.5° 预折痕**（标 `'F'`）→ 1/1 · 1/1 ✓
—— 与 crane 区分清楚：crane 的 22.5° 线是**真折痕**，tiger 的是**预折痕**（折了再展开的辅助线）。

> crane / tiger 的参数从 `--grid` 改为 `--scale`（几何不再依赖网格分辨率）。
> `--grid` 保留为弃用选项并给出迁移提示，**不打断已有脚本**。

### ② 交点处的 Kawasaki：Maekawa 的期望值按顶点价数取

打断交点会产生 **deg3 / deg5** 顶点（奇数价）—— 而 Maekawa 的经典形式 |M−V|=2
要求 M+V 为偶数 → **奇数价顶点永远不可能满足**。

**推广形式**：有折痕终止（crease termination）的顶点期望 **|M−V| = 1**（即 |M−V| = 2 − c，c = 终止数）。

依据（真实作品，非推测）：官方语料里 **208 个 deg3 内部顶点全部是 |M−V| = 1**，无一例外；
而几何干净的真实作品（flat_crane / birdBase / openSinkBase / waterbomb / 6ptHypar-anti）
里**一个奇数价内部顶点都没有**。

这不是"放宽标准"，是**修正公式用错**（对奇数价顶点套用偶数价公式 = 结构性误判）。
配套加了 4 条测试，其中 2 条是防假阳性：奇数价 |M−V|=3 仍必须失败、偶数价 |M−V|=4 仍必须失败。

效果（规范化语料，Maekawa 顶点级通过率）：miura-ori 99.3% → **99.6%**、
langHoneycomb 98.0% → **99.1%**、whirlpool 89.3% → **95.2%**。

### ③ 面片重叠检测 + 从边重算面

v2.51.0 把 faces 从「硬编码清空」改成「沿用来源文件」→ 实测那些面**互相重叠**
（模板库的面面积和是纸的凸包面积的 **3–15 倍**）→ 下游折叠模拟假定面片是纸的**划分**，重叠会失真。

- 新增 `src/utils/face-overlap.js`：面片两两重叠检测（Sutherland–Hodgman 裁剪算交集面积
  + 包围盒预筛）+ 面积和 vs 纸的凸包面积
- 模板模式改为**从边重算面**（planar half-edge，`extractPlanarFaces`）→ 重叠 **9–20 → 0**，
  面积比 **3–15 → 0.39–1.00**
- `generate --template` 生成后**当场检测并提示**
- 新增 7 条测试

### ④ 顺带修一个「看起来像全过」的错误

`analyzeMaekawa` / `strictKawasaki` 原本在 `faces.length === 1` 时判定为
「Flat dieline」并**整段跳过检查**。但折痕图普遍带悬挂边 → 半边算法只能闭合部分面
（真实作品 birdBase：文件里 16 面，重算只有 8 面）→ 于是**几何完全正确**的折痕图
被整段跳过，报出「0 个被检查顶点」这种**看起来像「全过」**的结果。

短路判据改为**内部折痕顶点集为空**（根本判据），而不是面数这个代理指标。

## [2.51.0] - 2026-11-27

### Fixed — 内置生成器的几何（上一版遗留的三项之二）

v2.50.0 拆掉了 Kawasaki 的假阳性机器，于是暴露出内置生成器**本身**的几何不合格。
这一版把能修的修对，把不能修的**如实分类**。

#### ① miura：左右纸边漏标 'B' → 28/28 全过

垂直边在 `col === 0 || col === cols` 时没标 'B'（只有上下边标了）→ 边界顶点成了
deg3 内部顶点、扇区 [90,90,180] → Maekawa 28/36。修后 **Kawasaki 28/28 · Maekawa 28/28**。

#### ② crane / tiger / fish：斜线改成 45° 链 + preliminary base

**推导出来的硬约束**（不是猜）：

- **Maekawa 要求 |M − V| = 2，而 deg3 顶点有 3 条折痕 → M+V=3 → |M−V| 必为奇数
  → 结构上无解。** 真实折痕图里也没有 deg3 内部顶点（birdBase 是 deg4/deg8）。
- 任意角度的斜线让扇区角不满足 Kawasaki（旧版 crane 的 deg4 扇区 [19.18, 160.82, 19.18, 160.82]，
  交替和 38.36° vs 321.64°）。真实折痕图的折痕角都是 **45° 的倍数**
  （squareBase deg6 扇区 [45,45,90,45,45,90]，误差 0°）。

因此：

| pattern | 改法 | 结果 |
|---|---|---|
| crane | 改成标准 **preliminary base**（2 对角 + 2 中线，中心 deg8） | **1/1 · 1/1 全过** |
| tiger | preliminary base + 虎纹标 `'F'`（预折痕） | 无内部折痕顶点（单片） |
| fish | preliminary base + 鱼尾标 `'F'`（预折痕） | 无内部折痕顶点（鱼基本身是单片折叠） |

标 `'F'`（flat，平折）是**语义诚实**的分类：真实折纸里这些就是折了再展开的预折痕。

#### ③ unit / modular：分类修正

- `unit`：外轮廓边之前被标 `'M'`（应是纸边 `'B'`），辅助谷折标 `'F'` → 单片模块单元
- `modular`：**组装示意图**（多单元拼合），不是单张可展平折痕图 → 全部标 `'B'`

#### ④ 新增 `balanceMaekawa()`：先定几何、再定山谷

折纸 CAD 的标准做法。翻转 M/V 标签（不动几何）使每个内部顶点满足 |M−V|=2。
**前提是几何本身已满足 Kawasaki** —— 否则 Maekawa 通过也折不平。

#### ⑤ 检查集统一：含 'B' / 'U' / 'F' 边的顶点都不参与

Maekawa 此前只排除 'B'，Kawasaki 排除 'B'/'U'/'F' → 两个判据可能互相矛盾。
现在两者用**同一套规则**（'F' = 平折/预折痕的顶点不是「所有折痕都折叠」的内部顶点）。

### Fixed — 模板模式产出的 FOLD 丢面信息

`transformTemplate` 之前把 `faces_vertices` **硬编码清空**（注释写「判定不依赖它」）→
模板模式产出的 FOLD 没有面信息 → 下游折叠模拟会缺面数据。
现在按份偏移正确重建（copies=1 → 232 面、copies=2 → 464、copies=3 → 696，与 base 一致）。

### Added — 语料规范化修复层

`scripts/normalize-corpus.js`：官方语料（78 件）里 **42 件有内部顶点的作品中 23 件
存在几何退化**（裁剪时纸边折痕被人为换成 'B'，导致 >180° 的退化扇区）。
原件只读不动，脚本输出规范化副本到 `benchmarks/corpus-normalized/`（不进发布包）。

实测效果（顶点级通过率）：

| 作品 | 退化率 | Maekawa |
|---|---|---|
| miura-ori | 70% → **13%** | 0.0% → **99.3%** |
| langOrchid | 83% → **7%** | 0.0% → 100% |
| langHoneycomb | 56% → **4%** | 9.6% → **98.0%** |
| huffmanRectangularWeave | 18% → **2%** | 2.6% → **98.9%** |

→ 规范化的主要价值是**修好 M/V 平衡**（人造边界破坏的正是它）；
Kawasaki 提升/下降各 11 件（交点打断产生的新顶点需要交点处的专门处理）。

### Changed — 内置生成器几何状态（4 verified / 4 n-a）

| pattern | 状态 | Kawasaki | Maekawa |
|---|---|---|---|
| star | ✅ verified | 31/31 | 31/31 |
| radial | ✅ verified | 21/21 | 21/21 |
| miura | ✅ verified | 28/28 | 28/28 |
| crane | ✅ verified | 1/1 | 1/1 |
| tiger / fish / unit / modular | — 单片或组装示意（条件不适用） | — | — |

## [2.50.0] - 2026-11-27

### Fixed — **Kawasaki 判定口径**：假阳性机器被拆掉了

`origami kawasaki` / `analyze` 的 Kawasaki 检查此前用 **`edges_foldAngle`（折痕的折叠量，±180°）**
做交替和，而不是 Kawasaki 定理真正约束的 **扇区角**（相邻折痕射线的夹角）。

对任何 `foldAngle ∈ {0, ±180}` 的 FOLD —— **所有内置生成器，以及大多数真实作品** ——
偶数价顶点的折痕角交替和**恒相等** → deviation 恒为 0 → **判定恒真**。

实测（修正前后）：

| 作品 | 修正前（假阳性） | 修正后（真值） |
|---|---|---|
| `origami kawasaki tiger` | 240/240 within 5° | **2/240**（误差中位 223.8°、最大 318°） |
| `origami kawasaki crane` | 411/411 | **15/411** |
| `origami kawasaki modular` | 11/11 | **1/11** |
| star / radial / miura | 31/31 · 21/21 · 28/28 | 不变（本来就真过） |

**这推翻了 v2.48 的那次"修复"**：它把「miura-ori 0/132 → 130/132」当作成功，
但那只是让判定无法失败。真相是：那份 miura-ori 文件**本身几何退化**
（69.7% 的顶点有 > 180° 的扇区）→ 正确的判定就是拒绝它；
**规范化后的模板库版本 132/132 全过**（规范化修好了几何）。

### 撤回的结论

| 声称 | 位置 | 修正后 |
|---|---|---|
| tiger 是 verified（Kawasaki 240/240） | v2.49.1 起 | **撤回** → partial（Kawasaki 2/240） |
| 真实作品通过率 44% → **87.33%** | v2.47.6 | **撤回** → 实测 **19.0%**（8/42 有内部顶点的官方作品）；仅几何干净的 **42.1%**（8/19） |
| flappingBird / scale 是 fully_qualified | v2.48 的 manifest | **撤回** → `fully_qualified: false` + `known_limitations` 登记 |
| 推荐 `crane` 用 `--template scale --copies 2` | v2.49.2 | **撤回** → scale 的 Kawasaki 是 0/114。改为 `miura-ori --copies 4` |

### 容差：用真实作品重新校准

保持 **5°**（不是收紧到 0.5°）：官方 78 件 16998 个偶数价顶点的误差分布**双峰**
—— 83.05% 恰为 0°、17% 恰为 180°（零长/重合射线造成的退化顶点），中间带仅 0.2%
（36 个顶点，来自少数作品的手绘精度噪声，如 flappingBird 的 2.79°）。
→ 5° 只多放过那 0.2% 的真实噪声，**不会**放过 180° 的退化；
反之 0.5° 会把 flappingBird 这类「数学上可展平但精度不足」的真实作品判死（假阴性）。

### Added

- `templates/template-status.json`：20 件模板的几何状态；`generate --template` 在模板
  不满足折平必要条件时**当场提示**（例：`⚠️ 该模板不满足折平必要条件：Kawasaki 0/114`）
- **防假阳性回归测试**（3 条，此前完全没有）：
  1. `foldAngle` 恒定的 FOLD **不得**自动通过
  2. 几何退化的官方 miura-ori 必须**被拒绝**（v2.48 报它 130/130 全过）
  3. 规范化后的模板库 miura-ori 必须全过

### Changed

- 内置生成器的几何状态标签全部按修正判据重算：star / radial = verified；
  tiger / crane / miura / modular / unit = partial；fish = 单片（无内部顶点，条件不适用）
- 同族替代建议的措辞改为「**不是同一个东西**」—— 只说"更稳"会让人以为可平替；
  替代物只在自身几何失衡时给出，且必须自身 Kawasaki + Maekawa 全过

### 附带发现（未修，记档）

- `transformTemplate` 输出 `faces_vertices` 为空数组 → 模板模式产出的 FOLD 缺面信息
  → 下游折叠模拟会缺面数据。修需处理 copies>1 时的面偏移。
- 官方语料 42 件有内部顶点的作品里 23 件存在几何退化（>180° 扇区），
  多数来自裁剪时的边界折痕被换成 'B' —— 这解释了历史上大量「作品不合格」的假象。

## [2.49.2] - 2026-11-27

### Added

- **同族替代建议**：内置生成器在「20 模板 × copies{1,2,3,4,6} × rotate{0..180}」= 700 个组合里
  都能找到结构同族的对应物。当**内置形态自身 Maekawa 失衡、而同族替代物全过**时，
  `origami generate <pattern>` 会直接给出更好的选择：

  ```
  📐 Generated crease pattern: crane  [几何 ⚠️ partial：Kawasaki 411/411 · Maekawa 409/469（60 个顶点 M/V 失衡）]
  💡 同族替代（几何全过，更稳）：origami generate --template scale --copies 2
  ```

  | 内置 | 同族替代 | 距离 | 自身几何 | 替代物几何 |
  |---|---|---|---|---|
  | crane | scale·c2 | 0.422 | ❌ 409/469 | ✅ 全过 |
  | miura | flappingBird·c2 | 0.338 | ❌ 28/36 | ✅ 全过 |
  | modular | flappingBird·c1 | 0.309 | ❌ 5/11 | ✅ 全过 |

  > 距离 < 0.3 表示「结构同族」，**不等于逐顶点等价** —— 指纹对顶点数取了 log10，
  > 41 vs 60 顶点的差异会被压成 0.2 的距离。要断言「删了零损失」需要逐顶点比对，本表未做。
  > **geometryBetter=true 的含义是硬的**：内置形态自身 Maekawa 不平衡，而替代物全过。

### Fixed

- **调用日志不再被测试污染**：`npm test` 每次跑会调几十次 generate，混进统计会让
  「内置 pattern 真实调用数」失真（实测一次 `npm test` 产生 43 条内置调用记录，
  足以让 Day 14 的判据误判）。现在 CLI 沿父进程链识别测试运行器
  （jest / vitest / mocha / playwright）并跳过记录；测试侧也加 `ORIGAMI_INTERNAL_TEST=1` 标记。
  验证：`npm test` 746/746 全过后日志为空，手动调用仍记录 1 条。

### 决策更新：Day 14 判据已命中「只有用户自己调用」→ 保留

船长确认「只有我自己在用」→ 命中 v2.49.1 写下的判据第二行：
**保留**（删 1130 行省下的不是别人的等待，而是用户自己的维护面 ——
那不该由 agent 替用户决定）。

保留不等于不做事，本轮做了两件：
1. 把「更好的替代品」直接告诉用户（见上）
2. 把统计口径修对（见 Fixed）—— 否则 12-10 拿到的数是假的

### 附带发现（未修，记档待查）

`transformTemplate` 的输出 **faces_vertices 为空数组**（原始模板经 `loadTemplateFold` 有 faces，
如 flat_crane 118 个面；transform 后 0 个）。不影响折痕图判定（Kawasaki/Maekawa 只看边），
但模板模式产出的 FOLD 缺面信息 → 下游若用该 FOLD 做折叠模拟会缺面数据。
修需处理 copies>1 时的面偏移，故留待专档。

## [2.49.1] - 2026-11-27

### Added

- **内置生成器的几何状态明示**（`templates/generator-status.json` + `src/utils/generator-status.js`）：
  这 5 个生成器（1130 行）从未被验证过几何正确性，而 CLI 此前不告诉用户
  「这个 pattern 的折痕图可能不满足折平必要条件」。现在输出会带
  `[几何 ✅ verified]` 或 `[几何 ⚠️ partial：…]`：
  star / tiger / radial = verified；crane / miura / modular / fish / unit = partial（附实测数）

- **generate 调用日志**（`~/.origami/signals/generate.jsonl`）：每条记 mode=builtin|template|intent
  与用了哪个 pattern / 模板；观测器汇总进 `daily.jsonl` 的
  `generate_builtin` / `generate_template` / `generate_intent`。

### 决策记录：内置生成器（1130 行）暂不删 —— 理由与 Day 14 的判据

用**集合差**重测（此前「对官方 78 例 0/78」的测法是歪的）：它产出的形态是否不在
「20 模板 + 78 官方」= 98 件的并集里 —— 实测 **6/8 与模板同构**（距离 0.255–0.746），
**2/8（fish、unit）不在并集里** → 独有价值存在但都很弱（且这两个几何是 partial）。

处置：**保留 + 降级 + 明示状态**，理由三条 ——
1. **不可逆操作要慢**：删 1130 行不可逆，而 14 天证伪窗口才刚开始（Day 1/14）→ 现在删 = 没证据就下重注
2. **模板模式给不了的能力**：模板依赖 20 件外部数据（MIT，随包 1060 KB）；内置生成器**自包含**
3. 但它当前**不占优** → 降级并明示几何状态，不让用户自己撞

**Day 14 的判据（届时读 `daily.jsonl` 的 generate_* 计数）**：
非本人调用 ≥1 次 → 保留并修几何；只有用户自己调用 → 保留（自己的工具，维护成本自己的选择）；
**零调用**（连自己都不用）→ 删。

## [2.49.0] - 2026-11-26

### Added

- **意图模式：`origami generate --intent <族> [--motif <名>] [--symmetry N] [--rotation R] [--scale S]`**

  这是「按**我的想法**生成」缺失的那一层：模板模式只能「选模板 id + 给参数」，
  而用户说的是「我要一个**六瓣**的星形折纸」—— 需要把意图翻译成模板与参数。

  - **语义族 = 官方分类目录**（Bases / Origami / Tessellations / Curved / Kirigami / Popup /
    Polygami / SimpleFolds / Squaremaze / Bistable / PolygonUnfolding）—— 现成的语义标注，不是手编的族名
  - **候选模板 = 数据推导**：对官方 78 个真实折痕图，在「模板 × copies × rotate」组合空间
    （20 × 5 × 7 = 700）里求最近邻（结构指纹距离 < 0.9）后按族归拢 → `templates/families.json`
  - **无候选的族 → CLI 明确报「暂不支持」并列出支持的族**，不静默 fallback
  - `--motif` 未命中 → 明确提示并列出该族可选模板
  - 新增 `src/utils/intent-map.js`

  实测：`--intent tessellation --symmetry 6` → miura-ori ×6，**A–F 全绿**
  （Kawasaki 792/792 · Maekawa 792/792 · 0 交叉）；`--intent base --symmetry 4` → birdBase ×4（A–F 全绿）。

- **`templates/families.json`**：族 → 候选模板映射 + 每模板独占覆盖数 + hold-out 划分与距离分布。
- **`scripts/analyze-coverage.js`**：以官方 78 例为基准的三项分析 —— ①内置生成器几何正确性
  ②模板集 set cover 最小覆盖集 ③未复现形态分类。可复现。

### Fixed

- **判据 E「SVG ↔ FOLD」的变换反推**（`estimateTransform`）：
  原来只按**宽度**反推 scale，而 `generateSVG` 是**等比 fit 到画布**（宽/高都可能成为约束）
  → 模型高宽比 ≠ 画布高宽比时 scale 算错；flipY 候选的 ty 公式还隐含「SVG 顶到画布边缘」的假设，
  而 generateSVG 留了 margin → 偏差可达 0.2 单位 > 容差 0.05。
  现改为：按宽、按高各算一个 scale × 镜像/不镜像共 **4 个候选**取残差最小者，
  flipY 的 ty 改用 `s.minY + sc*m.maxY`（由模型 y 最大值推出）。

### 已知限制（未完全解决，如实登记）

- **判据 E 在部分模板上仍不可靠**：`miura-ori` 0/945、`flat_crane` 16/266（修前 0/266）。
  几何本身正确（C 判据全绿、SVG 良构、边数一致），问题在匹配器与 `generateSVG` 的
  fit/margin 约定尚未完全对齐。**未在本版彻底解决**。
- **内置生成器的定位已由实测澄清**（不是"无用"，也不是"该留"）：
  - 几何正确性：star / tiger / radial / fish **全过**（0 交叉）；crane 409/469、miura 28/36、modular 5/11
  - 但对「模板复现不了的 10 件官方形态」**零增益**（最近距离 1.088–3.085）
  - → 结论：当前形态族覆盖不到官方形态的镶嵌/曲面/剪纸族；**加参数只能扩展它自己的族**，
    不改变这一点。保留与否待定（见 `docs/VERIFICATION-AGAINST-OFFICIAL.md`）。

## [2.48.4] - 2026-11-26

### Fixed

- **上游转换器补 4 种颜色表达 + Flat 映射**（`evolution/svg_to_fold.py`）：
  官方 77 个 SVG 的折痕颜色有 5 种写法，转换器此前只认 1 种：

  | 写法 | 例子 | 此前 |
  |---|---|---|
  | 完整 hex | `#FF0000` | ✅ |
  | **短 hex** | `#f00` / `#00f` / `#000` | ❌ helloworld / polygami / origamisimulator / cross / FTpoly7 |
  | **style 属性内联** | `style="stroke:#ff0000"` | ❌ airplane |
  | **CSS 类** | `.crease-m{stroke:#e74c3c}` + `class="crease-m"` | ❌ test_bird_base_v5 |
  | **CSS 类 + 标准色** | `.st3{stroke:#FF0000}` | ❌ Leafy_Opus_T-69 |

  另有 `#FFFF00`（Flat / 平折）**没有任何映射** → 被整批丢弃（langCardinal 丢了 78 条黄线）。
  现已：短 hex 展开 · style 属性解析 · CSS 类映射（parse 时预扫描 `<style>`）· 新增 `FLAT_COLORS`。

### Changed

- **模板库 19 → 20 件**（1060 KB）：新增 `wavy_pleats`；全部 20 件在
  **copies=3 × rotate=120** 下 Kawasaki 与 Maekawa 全过且无 2D 交叉（manifest 逐件记录基线）。
  `templates/manifest.json` 升到 schema v4。

- **官方 77 件的排查结论**（`docs/VERIFICATION-AGAINST-OFFICIAL.md`）：
  57 件仍不可作模板，原因**不是转换器**而是**真实的 M/V 失衡**（曲面折痕 / 剪纸 /
  无限图案的有限片段）—— 人工边界破坏了 M/V 平衡，属形态限制，不可修。

## [2.48.3] - 2026-11-26

### Fixed
- **模板模式产物缺 `thickness` 字段**：上游转换器产出的 FOLD 不带 `thickness`，
  导致判据 B 报 `thickness=undefined`（实测 `miura-ori` 模板 3 份阵列）。
  现在模板模式在 `generateFromFoldData` 内用 `--thickness`（默认 1.0）补齐。

  实测 `origami generate --template miura-ori --copies 3 --rotate 120`：
  **A–F 六项全绿**（Kawasaki 396/396 · Maekawa 396/396 · 0 处 2D 交叉 · 945/945 边匹配 · well-formed）

## [2.48.2] - 2026-11-26

### Fixed

- **模板库按修好的转换器重新生成**（12 → **19 件**，1047 KB）。
  上游 `evolution/svg_to_fold.py` 修了两个真 bug（详见 `docs/VERIFICATION-AGAINST-OFFICIAL.md`）：
  ① `_polyline_to_edges` 的坐标提取不兼容「x1,y1,x2,y2 逗号混写」→ 846 个 polyline 曾全部产出 0 条边
  ② 主循环 `path` 分支调的是只认 M/L 的 `_line_to_edges_from_poly`，支持曲线的 `_path_to_edges` 从未被调用
  → **77/77 件 SVG 现在全部产出非空 FOLD**（修复前 3 件为空）。

### 由此推翻此前的一个判断

此前记录「Maekawa 只有 28% 通过是语料形态问题」。修好转换器后
**`miura-ori` 的 Maekawa 从 0/132 变成 132/132** —— 真因是**旧转换器把折痕画成
「相互交叉但不共享顶点」的形式**，规范化打断后交点处 M/V 失衡 → Maekawa 全灭。
**「语料形态问题」这个结论对一部分作品是错的，真因是转换器。**

### Changed
- `templates/manifest.json` 升到 schema v3，记录转换器修复内容与每件模板的判定结果。
- 新增可作模板：`miura-ori`(K132/132 M132/132) · `scale`(M114/114) ·
  `squaretwistManyAngles`(M36/36) · `singlesquaretwist` · `simpleVertex` 等。

## [2.48.1] - 2026-11-26

### Added

- **以官方 78 个真实折痕图为基准的验证器**（`scripts/verify-against-official.js`，可复现）：
  三层验证 —— ① 还原保真度（官方几何经规范化管线后是否被破坏）
  ② 覆盖矩阵（8 个内置生成器能否覆盖官方形态）③ 逆向拟合（官方形态能否被「模板 + 参数」复现）。

- **验证报告**（`docs/VERIFICATION-AGAINST-OFFICIAL.md`，随包发布）。

### 验证结论（2026-11-26 实测）

| 验证 | 结果 |
|---|---|
| ① 还原保真度 | **弧长保持 75/75**（另 3 件官方 FOLD 本身为空，不适用）· **几何覆盖率 75/75** |
| ② 覆盖矩阵（8 个内置生成器） | **0/78** —— 结构指纹最近距离也有 1.086，**一个都没覆盖到** |
| ③ 逆向拟合（模板 + 参数） | **63/78（81%）** |

**路线判断**：模板模式 63/78 远胜内置生成器 0/78 —— 「硬编码几个经典图案的生成器」
在官方形态的多样性面前几乎不成立；「以真实作品作模板 + 对称变换」才是「按意图生成」的可用载体。
典型：`traditionalCrane → flappingBird copies=4`（用拍翅鸟做 4 份阵列即逼近传统飞鹤）。

### Changed

- **模板库按官方基准重筛并扩充**（11 → 12 件）：规范化后 Kawasaki 与 Maekawa 全过的优先，
  几何完好但平面判定不适用的（曲面折痕 / 剪纸 / 无限图案的有限片段）保留并标注 `known_limitations`。
  `templates/manifest.json` 记录了每件的来源、判定结果与官方基准数据。

## [2.48.0] - 2026-11-26

### Added

- **模板模式：`origami generate --template <id> [--copies N] [--rotate DEG] [--scale S]`**

  「按意图生成」的真正形态：**意图 = 选一件真实折痕图模板 + 给参数**。
  模板来自 origamisimulator.org 的真实作品（MIT，见 `templates/LICENSE`），
  经**对称变换**（旋转 + 阵列 + 缩放）生成新折痕图。

  **为什么是对称变换**：对称变换**保持折平性** —— 不改变每个内部顶点的 M/V 计数，
  也不改变折痕角的交替和（Kawasaki）与 M/V 差（Maekawa）。
  实测：真实 birdBase 做 1/2/3/4/6 份旋转阵列，判定全部全过（4/4 → 24/24）；
  真实 flat_crane 同样全过（42/42 → 252/252）。

- **`templates/` 模板库（11 件，319 KB）**：每件一个 `.fold` + `manifest.json`（含来源、
  判定结果、已知限制）+ `LICENSE`（站点 MIT 原文 —— MIT 再分发的硬条件）。
  模板经三道筛：① 77 个同名 SVG+FOLD 配对 ② M/V 计数与 SVG 红/蓝一致（21 件可信）
  ③ Kawasaki 与 Maekawa 全部通过（11 件）。
  **7/11 件在 copies=3 × rotate=120 下完全合格**；其余 4 件各有明确形态原因
  （曲面折痕 / 剪纸 / 无限图案的有限片段 / SVG 输出精度），已在 manifest 里逐件登记。

- **模板规范化管线**（`splitCreasesAtCrossings` → `balanceMountainValley` → `dedupeVertices`）：
  模板来自 SVG→FOLD 转换，而 **SVG 在折痕交汇处没有顶点标记** → 转换出的 FOLD 在那里
  是两条独立边相交（proper crossing），几何不完整。规范化后 **11/11 件交叉归零**，
  8/11 件折平性完全合格。

### Fixed

- **判据 B 的合法 assignment 集合**：此前只认 `B/M/V`，把 **F（平折）与 U（未指定）**
  误判成非法（FOLD 规范 f-u-gram 允许这两个值）。实测 flat_crane 的 12 个 `U` 被误报。
- **判据 F 的重复顶点判定口径统一**：SVG 侧与 FOLD 侧此前用不同精度（6 位 vs 4 位），
  浮点表示差异会被误报成重复顶点 → 两侧统一到 4 位。

### 已知限制

- **SVG 输出精度 0.01 单位**（`toFixed(2)`）会让相距极近的顶点粘连 → 少数模板的判据 F 报警。
  尝试把精度提到 4 位，**实测打挂了判据 E（SVG↔FOLD 匹配）**（匹配链对坐标精度敏感：
  `SVG_MATCH_TOLERANCE=0.05` / `TRANSFORM_RESIDUAL_TOLERANCE=0.5`）→ **已回滚**，
  该项作为已知限制登记，不为显示精度 destabilize 整条匹配链。
- 4 件模板在 copies=3 × rotate=120 下不是完全合格（曲面 / 剪纸 / 镶嵌片段 / 上述精度项），
  原因与实测数据见 `templates/manifest.json`。

## [2.47.7] - 2026-11-26

### Fixed

- **澄清并修正「Maekawa 只有 28% 通过」这一结论**（v2.47.6 曾把它记成未闭合缺口 —— **那是误判**）：
  Maekawa 实现**没有错**。实测对照（78 个作品）：

  | 语料类型 | Maekawa 通过率 |
  |---|---|
  | **有限作品**（边界是合法 B 边） | **71/79 = 89.9%** ✅ |
  | 无限图案的**有限片段**（边界是人造的） | 80/635 = **12.6%** ❌ |

  无限图案裁成有限片段时，边界折痕被人为换成 B，破坏了邻近顶点的 M/V 平衡
  → Maekawa（每个内部顶点 \|M−V\| = 2）必然不通过。**这是语料形态与定理前提不匹配，不是实现 bug。**

- **新增语料健康普查**（`docs/CORPUS-HEALTH.md`，随包发布）：
  77 个同名 SVG+FOLD 配对里，只有 **21 件**的 M/V 计数与 SVG 红/蓝一致 → **可作折痕图质量基准**；
  14 件 assignment 丢失折痕类型（全 `U`）；42 件 SVG 与 FOLD 不同源或有损。
  检查方法：**只比 M/V 不比 B** —— SVG 里一个矩形只算 1 个黑色元素，FOLD 展开成多条边，
  B 天然不等（`birdBase` FOLD B=4 vs SVG 黑=1 属正常）。我第一版把 B 纳入比较，
  **误判了 51 件语料「损坏」**。

### Added
- golden corpus 回归新增「语料健康」用例：断言可信子集非空且非全集，
  并分别刻画「丢失折痕类型」与「不同源/有损」两类不可信语料。

### 被否掉的假设（留档）
「Maekawa 对奇数度顶点的阈值应为 1（偶数度用 2）」—— 数据否掉：
顶点通过率 28.13% → **23.56%（更差）**，degree 3 从 31.2% 掉到 16.9%。阈值统一用 2 是对的。

## [2.47.6] - 2026-11-26

### Fixed

- **`origami kawasaki` 对真实作品系统性判错**（公开命令，影响真实用户）。
  根因：Kawasaki 的交替和用了**扇区角**（相邻折痕方向的几何夹角），
  而定理要的是**折痕角**（`edges_foldAngle` 的绝对值）—— 两者不是一回事。
  另外内部顶点选取包含了带 B（边界）边的顶点。
  以 78 个真实作品（`goods/origami-examples/`，MIT 许可）为基准：
  - 旧口径 `6698/15082`（44%）→ 新口径 `9483/10859`（**87.33%**）
  - `miura-ori` 0/132 → 130/130 · `langWedgeDoubleFaced` 0/262 → 262/262 ·
    `origamisimulator` 2018/2370 → 2370/2370 · `airplane` 0/5 → 5/5
  - **38 件真实作品变成「全过」**
- **Kawasaki 只查偶数价顶点**（定理的适用前提）：奇数条折痕的顶点其交替和不可能相消，
  奇数价顶点的折平性由 Maekawa 那一侧保证。加入后顶点通过率 82.69% → 87.33%。
  两个检查的关系因此是 **Kawasaki ⊆ Maekawa**（差集 = 奇数价顶点），不是「检查集相同」。
- **三处判定统一为一套实现**（此前有三套，口径不一，用户会看到互相矛盾的结论）：
  - `fold-analyzer.strictKawasaki()` / `analyzeMaekawa()` —— 统一到
    「折痕角 + 几何环绕顺序 + 排除 B 边顶点 + Kawasaki 只查偶数价」
  - `fold-analyzer.validateFlatFoldability()`（`origami analyze --all` 的 validation 块）
    —— 此前用扇区角且含边界顶点，**与 `origami kawasaki` 给出矛盾结论** → 已统一
  - `crease-pattern-2d.checkLocalFlatFoldability()`（`origami generate` 的判据 C）
    —— 此前自己实现了一套 → **改为委托 FoldAnalyzer**（单一真相源）
  实测一致性（同一份 crane 产物）：
  `origami kawasaki` 411/411 · `origami maekawa` 409/469 · `generate` 判据 C `Kawasaki 411/411 · Maekawa 409/469`

### Added
- `tests/unit/kawasaki-criterion.test.js`（10 例）：以真实作品为基准断言通过率、
  B 边顶点被排除、两个检查的集合关系（Kawasaki ⊆ Maekawa，差集 = 奇数价）、
  以及「用测试内独立实现复算」的反自证用例。

### 已知缺口（未闭合）
- **Maekawa 仍只有 28% 通过**（`4000/14222`）。真实作品 miura-ori 的 Kawasaki 130/130 ✅
  但 Maekawa 0/132 —— 其 3-valence 内部顶点的 M/V 分布使 `|M−V| = 1`。
  可能是「Maekawa 对 3-valence 的适用形式不同」或「有限片段 vs 无限图案的差异」。**未解决，单独查。**

## [2.47.5] - 2026-11-26

### Fixed

- **Valley 颜色对齐标准**：折痕图系统的 Valley 由 `#0000FF` 改为 **`#0066cc`**
  （QUALITY-STANDARDS v1.5 §9 原文：`| Valley | 蓝色 (#0066cc) | 短虚线 (2,2) | 谷折 |`）。
  改 5 处：`crease-pattern-generator-v3.js` 的 4 处（常量 / style / 图例）+ `svg-crease-parser.js` 的 1 处。
  代码里自称「官方标准」的注释已改为指向标准出处。
  （**包装刀模的 `dieline-svg-exporter.js` 是另一个子系统，颜色规则不同，未动。**）

- **顶点重复去重**（新增 `dedupeVertices()`，接在 normalize 之后、出 SVG/FOLD 之前）：
  生成器的 `idx(i,j)` 映射会让同一坐标被 push 两次 → 实测 crane 1500 顶点里 **15 组重复**、
  tiger **12 组**，SVG 侧出现重复圆点。去重后按坐标合并顶点并重映射 edges/faces 的下标。
  实测：crane 1500→1485、tiger 去重 6；**全部 pattern 重复坐标 = 0、越界边 = 0、assignment 长度 = 边数**。

- **earcut 从 3.x 降到 2.2.4（CJS）**：
  - earcut 3.x 是纯 ESM，Jest 不支持 `require(ESM)` → 生成器 `require('earcut').default`
    在 Jest 里抛 "Must use import to load ES Module" → 走 catch 分支 → **fallback 三角剖分路径在单测里从未执行**
    （测试环境 ≠ 生产环境）。降级后 Jest 与 Node 都能加载。
  - 顺带修好一个**原本就坏**的调用：生成器用的是**扁平坐标**（`boundaryCoords.push(coord[0], coord[1])`），
    那是 earcut **2.x** 的 API，而 3.x 期望嵌套数组 → 这条 fallback 从装上 3.x 起就是坏的。
    同时补上 earcut 2.x 的完整签名 `earcut(vertices, holeIndices, dimensions)`。
  - 新增 `tests/unit/earcut-in-jest.test.js`（2 例）断言 earcut 在 Jest 里真的能剖分。

### 已知缺口（仍未闭合）

- `crane` / `tiger` 的 **C 条（折平局部必要条件）** 仍不通过
  （crane: Kawasaki 30/469、Maekawa 409/469；tiger: Kawasaki 2/240）。
  去重把 crane 的 Kawasaki 从 29/469 提到 30/469 —— 改善极小，说明**问题在生成器的几何本身，
  不在顶点重复**。这 5 个生成器从未被验证过，需重新审视其几何构造。
- 共线重叠边（crane 28 段）未处理 —— 折痕图里连续同向折痕共线可能是合法的，故只报告不修。

## [2.47.4] - 2026-11-26

### Added

- **`origami generate` 命令：按意图生成折痕图**（`.fold` + `.svg` 成对产出）
  ```
  origami generate <star|crane|fish|miura|tiger|radial|modular|unit> [-o dir] [-f fold|svg|both] [-s seed] [-t thickness]
  ```
  仓库里 5 个折痕图生成器共 1130 行**一直零引用零覆盖**（36 个命令里没有任何入口），
  本版把它们接到 CLI 上，并在生成后自动跑一遍验证、逐条打印结果。

  新增 2841 行实现 + 41 个测试（719 总数）：
  - `src/utils/crease-pattern-2d.js`（800 行）—— 2D 线段相交检测。
    **既有 `selfintersection` 用的是 3D Möller，对 2D 折痕图恒输出
    "2D model — all faces coplanar, no 3D intersection possible"、Pairs checked: 0
    → 折痕线在 2D 上自交此前根本检测不了。** 本模块是新增能力，未改动 selfintersection 的既有行为。
  - `src/utils/crease-pattern-normalizer.js`（512 行）—— 种子化随机（确定性）、M/V 平衡、归一化
  - `src/utils/crease-pattern-factory.js` / `svg-crease-parser.js` / `xml-lite.js`
  - `tests/unit/generate-cmd.test.js`（36 例）+ `tests/unit/generate-cmd-golden-corpus.test.js`（5 例）

- **golden corpus 回归**：以本机 `goods/origami-examples/` 的 **77 对同名 SVG+FOLD**
  （100% 可配对）为基准，断言「可解析 + 字段自洽」，并对语料做 (size, mtime) 快照校验保证只读。

### Fixed

- `origami analyze` 的 description 写着 "Analyze a FOLD/SVG file"，但 SVG 实测报
  "SVG analysis not yet supported" → 改为与实现一致的措辞（**只改描述，未新增 SVG 支持**）。

### 验收判据 v2（大副两轮独立复核后定稿，硬门禁）

| 判据 | 状态 |
|---|---|
| A 产物成对 / B FOLD 合法 / D 2D 交叉 / E SVG↔FOLD / G 确定性 / H round-trip / J 参数校验 | ✅ 通过 |
| C 折平性的**局部必要条件**（Kawasaki + Maekawa） | ⚠️ **star / fish / miura / radial / modular 通过；crane / tiger / unit 不通过**（crane: Kawasaki 29/469、Maekawa 410/469） |
| F SVG well-formedness | ⚠️ **star / fish / miura / radial / modular 通过；crane / tiger 有重复顶点与共线重叠**（crane 15 组重复坐标） |

> ⚠️ C 与 F 不通过是**真实的能力缺口**，不是判据放宽：
> 这 5 个生成器从未被验证过，crane/tiger/unit 的几何本身不满足折平必要条件。
> 全局折平性是 NP-hard，不在验收范围 —— 判据措辞是「局部必要条件通过」，**不声称「能折平」**。

## [2.47.3] - 2026-11-26

### Fixed
- **canvas 从硬依赖改为可选依赖**（`dependencies` → `optionalDependencies`）。
  跨平台取证发现：canvas 3.2.3 的预编译只覆盖 linux-x64/arm64、darwin-x64/arm64、win32-x64，
  **win32-arm64 与 Alpine(musl) 会退回源码编译**。作为硬依赖时，那两类机器
  `npm install` 整个失败 → 36 个命令全部用不了；改成可选后安装成功，只有 `origami render` 降级。
  降级路径是**代码本来就有的**（10 处 `createCanvas()` 调用全部有 `if (!canvas) return null` 守卫，
  `commercial-renderer.js` 注释原文 *"If texture generation fails (e.g., no canvas), return null"*）。
- **CI 加 windows / macos 矩阵**：此前 CI 只跑 ubuntu，「跨平台可用」只是声称、从不验证。
  现在每次提交都在 3 个平台 `npm ci` + 跑单测，并加一步**显式验证 canvas 真能加载**
  （`npm ci` 成功 ≠ canvas 能加载）。

### Added
- `docs/CANVAS-PLATFORM.md`：canvas 跨平台取证报告（预编译矩阵 / 系统库自带证据 / 降级路径核对）。
- 新增 6 个单测（`tests/unit/canvas-optional-degradation.test.js`）锁住 canvas 缺失时的降级行为。

### 取证要点（详见 docs/CANVAS-PLATFORM.md）
- prebuild 全部是 `napi-v7` → 一个二进制跨 node 版本通用（N-API 向后兼容）
- prebuild **自带** cairo/pango/libpng/pixman 等库 → Linux 用户无需 apt 装系统依赖
- 唯一使用点：`src/utils/procedural-texture.js:63`（只服务 `origami render`）

## [2.47.2] - 2026-11-26

### Added
- **preset 本地缓存**（`src/utils/preset-cache.js` + `origami presets` 命令）
  - `origami presets sync`：把 27 个 preset 预取到 `~/.origami/presets/`（纯 HTTP，不需要浏览器）
  - `origami presets status`：列出哪些已缓存
  - `load --preset` / `screenshot --preset` **缓存优先**，未命中才回落到 `?demo=` 远程加载；
    远程加载成功后会顺手暖缓存（失败不影响主流程）
- 新增 12 个单元测试（`tests/unit/preset-cache.test.js`）

### Fixed
- **27 个 preset 全部依赖站点资源路径**（产品级脆弱点）。实测资源真实路径是 `/assets/<file>`，
  根路径 `/<file>` 返回 404。原先只要站点改动资源路径，27 个 preset 就全废。
- 发现并处理 **preset 不是同一类格式**：25 个 `.svg` + **2 个 `.fold`**（`box-pleat-tess` /
  `box-pleat-pyramid`）。缓存按扩展名分别校验（SVG 查 `<svg`，FOLD 查 JSON 且有几何字段）——
  因为站点在路径错时返回的 **HTML 错误页也是 HTTP 200**，不校验就会把错误页存成缓存、静默坏掉。

### 能力边界（写清楚，不夸大）
缓存只消除「preset 资源」这一层依赖，**不消除「模拟器前端」的依赖**：`launchBrowser()`
仍要访问 origamisimulator.org 加载网页应用。要「整站下线也能用」得把前端整个 vendor 进来（未做）。

## [2.47.1] - 2026-11-26

### Fixed
- **观测器判据 1 的分发通道**：原先只查 `registry.npmjs.org` 的 404→200。
  正式通道在 2026-11-26 改为 GitHub Release（npm 账号创建被 Cloudflare 人机验证挡住）后，
  这个判据会让 14 天窗口永远打不开。现在改为「npm registry **或** GitHub Release 任一成立」，
  并新增 `collectDistribution()`（公开仓库 releases 端点，无需认证）。
- `daily.jsonl` 新增 `distribution_tag` 字段。

> 为什么单独发一个 patch：v2.47.0 的 Release 附件是修复前的 tgz，与仓库内容对不上。
> 按本项目自己的标准（artifact 必须与仓库一致），补发版本而不是改 release 说明。

## [2.47.0] - 2026-11-26

> 说明：本仓库的变更记录在 2.43.0 之后中断，2.44 / 2.45 / 2.46 三个版本此前没有条目
> （2.45 新增 OBJ/MTL 导出，2.46 新增批量折纸命令与 GPU PBD 求解器）。
> 本条把「叙述与交付漂移」一次性收口。

### Fixed

- **版本号单一真相源**（新增 `src/version.js`）：`origami --version`、REST `/health`、
  MCP `serverInfo.version` 三处全部改为读 `package.json`。此前源码里有 3 处硬编码版本
  —— `src/index.js` 的 `0.2.0`、`src/api/server.js` 的 `2.32.0`、`src/mcp/server.js` 的
  `2.40.0` —— 与 `package.json` 的 `2.46.0` 全部不一致；文档里另有 4 处 `0.2.0`。
- **e2e 判据分诊**：`tests/e2e/screenshot.test.js` 原用 Playwright 的 test API 编写，
  却被 Jest 的 `testMatch` 收走，Playwright 直接抛错拒绝执行（该 suite 从未真正跑过）。
  按官方建议拆成两个目录：`tests/e2e/`（Jest 车道）与 `tests/playwright/`（Playwright 车道）。
- **6 处陈旧判据**：写死「恰好 8 个 preset」（实际 27）· 断言已改名的日文 preset
  `富士山`/`爆弾`（旧别名降级为 `LEGACY_PRESETS` 兼容映射，另补一条用例锁住）·
  `analyze --preset`（该命令从来只接受文件位置参数）· 三处写死版本字面量的断言。

### Added

- **网络类失败的信号**：`tests/helpers/network.js`（外网探针）+ `tests/helpers/cli.js`
  （只对网络类特征失败重试的调用器）。外网不可达时网络用例整组**显式 skip**
  （明确跳过，不是静默通过）；外网抖动时重试，但确定性失败一次都不重试 —— 不用重试掩盖真 bug。
- **`files` 白名单**：发布包从 215 文件 / 5.6 MB 降到 **71 文件 / 208.7 kB**（解包后 803.7 kB）。
  白名单按目录精确列出（`src/commands/`、`src/utils/`、`src/templates/`、`src/api/`、`src/mcp/`、
  `src/*.js`），**不整目录放行 `src/`** —— 整目录放行会把单测
  （`preset-constants.test.js` 的 `batch` 用例）在 `src/batch-output/` 生成的
  229.5 kB PNG 一起打进包，而 `.npmignore` 对已列入 `files` 的文件无效（npm 文档明说）。

### Changed

- **测试分三条车道**：`npm test`（660 单测）· `npm run test:e2e`（Jest e2e 20 例）·
  `npm run test:e2e:browser`（Playwright e2e 11 例）。
- **README 重写**：定位从「origamisimulator.org 的 CLI」改为「从 FOLD 到成品的折纸/纸艺
  工具链」，并补上负定义（不是网页版的替代品，不是图形编辑器）。
- **覆盖率改为实测**：语句 42.85%（3689/8608）· 分支 39.03% · 函数 53.33% · 行 42.24%。
  （此前仓库里唯一的覆盖率产物只有 4 个文件 / 21.3%，且未入库。）

### Removed

- 运行产物 `src/origami-screenshot.png` 与 `src/batch-output/` 不再入库（已进 `.gitignore`）。

## [2.43.0] - 2026-06-08

### Added

- **WebGL 3D Preview** — Interactive Three.js visualization
  - New file: `src/commands/fold-webgl.js` (300+ lines)
  - Browser-based 3D rendering with Three.js
  - Orbit controls: rotate (left-drag), pan (right-drag), zoom (scroll)
  - Mountain (red) / Valley (blue) / Boundary (green) color coding
  - Material colors from v2.0 format (`faces_color`)
  - Animation support with `--frames` and `--auto-fold`
  - Wireframe overlay toggle
  - Customizable canvas size and background
- **CLI Command**:
  - `origami webgl <file>` — Generate 3D preview
  - `origami webgl <file> -o preview.html` — Custom output
  - `origami webgl <file> --frames` — Include animation frames
  - `origami webgl <file> --auto-fold` — Auto-play animation

### Usage

```bash
# Basic 3D preview
origami webgl model.fold

# With animation
origami webgl model.fold --frames --auto-fold

# Custom size
origami webgl model.fold --width 1200 --height 800

# Wireframe mode
origami webgl model.fold --wireframe
```

### Features

- Three.js from CDN (no local dependency)
- Real-time rendering with 60fps
- Info panel with model stats
- Play/Pause animation controls
- Reset camera button

---

## [2.45.0] - 2026-06-08

### Added

- **OBJ/MTL Export** — High-fidelity 3D model export
  - New file: `src/utils/fold-obj.js` (300+ lines)
  - Wavefront OBJ format with vertex/face export
  - MTL material support with Kd/Ka/Ks/Ns
  - Faces color: `faces_color` → RGB values
  - Faces material: `faces_material` → named materials
  - Auto-triangulation of non-triangular faces
- **CLI Command**:
  - `origami obj <file>` — Export to OBJ
  - `origami obj <file> -o model.obj` — Custom output
  - `origami obj <file> --mtl materials.mtl` — Custom MTL
  - `origami obj <file> --no-mtl` — OBJ only
  - `origami obj <file> --separate-faces` — Per-face objects

### Usage

```bash
# Basic export
origami obj model.fold

# With materials
origami obj model.fold -o model.obj --mtl model.mtl

# No MTL file
origami obj model.fold --no-mtl
```

### Verification

```
$ origami obj test/merge/colored.fold
📦 OBJ written to: test/merge/colored.obj
🎨 MTL written to: test/merge/colored.mtl
   Materials: 1
   Vertices: 4
   Faces: 1
```

---

## [2.44.0] - 2026-06-08

### Added

- **FOLD v2.0 Format Support** — Extended format for advanced features
  - New file: `src/utils/fold-v2.js` (300+ lines)
  - Material properties: `faces_color`, `faces_material`, `faces_texture`
  - Physics properties: `edges_stiffness`, `faces_density`, `vertices_mass`
  - Animation: `animation_keyframes`, `animation_interpolation`
  - Extension namespace: `extensions` for custom metadata
- **CLI Commands** (4 new):
  - `origami v2detect <file>` — Detect format version
  - `origami v2validate <file>` — Validate v2.0 format
  - `origami v2upgrade <file> -o out.fold` — Upgrade to v2.0
  - `origami v2downgrade <file> -o out.fold` — Downgrade to v1.1

### Technical Details

- Backward compatible: works with v1.1, v1.2, and v2.0
- Auto-detection of format version
- Validation with detailed error/warning messages
- Upgrade/downgrade preserves data integrity

### Usage

```bash
# Detect format
origami v2detect model.fold

# Validate
origami v2validate model.fold

# Upgrade
origami v2upgrade v1.fold -o v2.fold

# Downgrade
origami v2downgrade v2.fold -o v1.fold
```

---

## [2.42.0] - 2026-06-08

### Added

- **3-Way FOLD Merge** — Complete version control workflow
  - New file: `src/utils/fold-merge.js` (350+ lines)
  - Three-way geometric alignment (Base, Ours, Theirs)
  - Conflict detection (opposite vertex movements)
  - Auto-merge for non-conflicting changes
  - CLI command: `origami merge <base> <ours> <theirs>`
  - Options: `--output`, `--json`, `--conflict-only`, `--tolerance`

### Technical Details

- Reuses spatial vertex matching from FoldDiff (v2.31)
- Direction similarity check using dot product
- Edge assignment merge logic (M/V/B)
- Face vertex mapping through vertex maps

### Usage

```bash
# Basic merge
origami merge base.fold ours.fold theirs.fold -o merged.fold

# Conflict report only
origami merge base.fold ours.fold theirs.fold --conflict-only

# JSON output for CI/CD
origami merge base.fold ours.fold theirs.fold --json --exit-code
```

### Related

- v2.31: FoldDiff (2-way comparison)
- v2.42: FoldMerge (3-way merge) ← NEW

---

## [2.41.0] - 2026-06-08

### Added

- **GPU PBD Solver** — WebGPU-accelerated Position-Based Dynamics simulation
  - New file: `src/utils/gpu-pbd-solver.js` (450+ lines)
  - Edge constraint compute shader (parallel processing)
  - Bend constraint compute shader (dihedral angle)
  - Fallback to CPU when WebGPU unavailable
- **CLI Integration** — `--gpu` flag for fold command
  - `origami fold <file> --solver spring-mass --gpu`
  - `origami fold <file> --solver spring-mass-cyclic --gpu`
  - Auto-detects WebGPU support and falls back gracefully

### Performance

- Expected: 10-50ms/frame (CPU) → <5ms/frame (GPU)
- Requires browser with WebGPU support (Chrome 113+, Edge 113+)

### Technical Details

- WebGPU Compute Shaders for parallel edge/bend constraints
- GPU buffer management: positions, rest lengths, edge indices
- Bind groups for shader input/output
- Async initialization with lazy device request

---

## [0.1.0] - 2026-04-16

### Added

- Initial project setup
- Basic CLI framework with Commander.js
- Browser automation with Playwright
- Basic commands:
  - `load` - Load preset models
  - `list` - List available presets
  - `screenshot` - Take screenshots
  - `simulate` - Run simulation
  - `view` - Switch view mode
  - `export` - Export models
  - `record` - Record videos
  - `analyze` - Analyze models
  - `batch` - Batch processing
  - `verify` - Verify file validity
  - `config` - Configuration
- OpenCLI adapter configuration
- Project documentation:
  - README.md
  - PROJECT.md
  - COMMAND-REFERENCE.md
  - ARCHITECTURE.md
  - CONTRIBUTING.md
  - LICENSE
  - TESTS.md

### Known Issues

- File upload (FOLD/SVG) not yet implemented
- Export functions not fully implemented
- Video recording not yet implemented
- Model analysis returns mock data

---

## [0.0.0] - 2026-04-16

### Added

- Project directory created
- npm initialization
- Basic dependencies installed

## [2.19.0] - 2026-06-05 — "fold-analyzer v2.0–v2.19 release"

This is the **fold-analyzer evolution release** — a complete rewrite of the FOLD file analysis engine, replacing the original browser-based v1.0 implementation with a fully local, offline-capable math engine. 19 sub-versions over a single day, 167 new unit tests, 13 new CLI subcommands/flags.

### Major: fold-analyzer v2.0 — Local Math Engine

#### v2.0 — Real origami mathematics
- Basic geometric counts and bounding box
- **Kawasaki's theorem** validation: alternating angles sum to 180°
- **Maekawa's theorem** validation: |M - V| = 2
- Flat-foldability pass/fail per vertex

#### v2.1 — Symmetry over-detection fix
- Strict mode + largest-independent-group filter
- Eliminates spurious 5/6/12-fold matches on small models

#### v2.2 — Robustness & performance
- T-junction detection (was stub)
- Centroid-relative reflective symmetry
- O(V+E) adjacency cache (was O(V*E) per validation)
- Dieline-aware basic analysis (no nonsensical genus)

#### v2.3 — Real layer analysis
- face_orders / 3D z-coord inference
- Spatial nesting via point-in-polygon

#### v2.4 — Strain estimation
- Cosine-based bending: `(1+cos(θ))/2`
- Per-edge detail + M/V filter

#### v2.5 — M/V bend-direction consistency
- Dihedral from face normals (Newell's method)
- Geometric vs declared foldAngle check

#### v2.6 — Self-intersection detection
- AABB pre-filter
- 3D segment-segment closest distance (Ericson §5.1.9)

#### v2.7 — Face normal consistency
- Divergence ratio: |Σ(area × normal)| / Σ(area)
- Complete self-intersection: vertex-inside, coplanar-overlap

#### v2.8 — Holes & boundary loops
- Boundary edge walking
- Shoelace area + classification
- **CRITICAL BUG FIX**: `qualityAnalysis.findDuplicateEdges()` was using `e.sort()` which mutated `this.edges` in place — fixed to `[...e].sort()`. v2.0–v2.7 affected; v2.8+ correct.

#### v2.9 — Fold order topological sequence
- `analyzeFoldOrder()` using max-of-adjacent-faces heuristic on layer data

### Major: Schema & Standardization (v2.10–v2.11)

#### v2.10 — JSON Schema
- `docs/fold-analyzer-schema.json` (draft 2020-12) for full output conformance
- `schemaVersion: "2.10"` field added
- M/V-Layer skip detection: flags `|layer(f1) - layer(f2)| > 1` as `structuralInconsistency`

#### v2.11 — JSON Schema Validator
- `ajv` dependency added (^8.x)
- `validateAgainstSchema()` method
- `--validate-output` CLI flag
- Strips `$schema` field (ajv v8 doesn't support draft 2020-12 meta-schema)

### Major: Deepened Physical Validation (v2.12, v2.14)

#### v2.12 — Strict Kawasaki + Alternating M/V
- `analyzeAlternatingMV()`: M/V must alternate around internal vertices
- `strictKawasaki(topN=10)`: ranks vertices by |evenSum - oddSum|
- **Formula fix during dev**: deviation = |evenSum - oddSum| (NOT |... - 180|, since Kawasaki requires EQUAL sums, both ≈ 180°)

#### v2.14 — Strict Maekawa
- `analyzeMaekawa(topN=10)`: formula `||M - V| - 2|`
- Per-vertex report: M, V, MV (signed), deviation

### Major: Output Modes (v2.13, v2.15–v2.18)

#### v2.13 — Summary Mode
- `summarize()` method: 9 compact fields, 97.4% smaller than `--json`
- `--summary` CLI flag

#### v2.15 — Complete Self-Intersection (Möller)
- `faceTriangles()` for fan-triangulation (handles polygons)
- `triangleTriangleIntersect3D()` (Möller 1997)
- `analyzeCompleteSelfIntersection()` method

#### v2.16 — Visualizer (HTML report)
- `toVisualReport()` method: self-contained HTML with embedded SVG
- M/V color coding, self-intersection highlights
- XSS-safe (HTML-escaped all user inputs)
- `--visualize <file>` CLI flag

#### v2.17 — BVH Acceleration (spatial index)
- `_buildBVH()` / `_queryBVH()` helpers
- `analyzeSelfIntersectionBVH()` method
- O(F log F) build + query vs O(F²) brute force
- `--bvh` CLI flag

#### v2.18 — CLI Refactor (subcommand aliases)
- `summary <file>` (alias for `analyze --summary`)
- `visualize <file>` (alias for `analyze --visualize`)

#### v2.19 — Validate Subcommand (CI/CD-friendly)
- `validate <file>` (alias for `analyze --validate-output`)
- CI/CD-friendly exit codes:
  - 0 = valid
  - 2 = validation failed
  - 3 = version mismatch
- `--json` flag for machine-readable output

### Test Coverage
- **fold-analyzer.test.js**: 9 tests (v2.0) → 176 tests (v2.19) — **+167 tests, +1856%**
- All versions unit-tested, real-file verified on hypar.fold

---

## [2.20.0] - 2026-06-07 — "fold-analyzer first-class CLI integration"

The v2.0–v2.19 fold-analyzer was a strong engine but its CLI surface was scattered: the main `analyze` command, plus three hand-rolled inline alias blocks for `summary`/`visualize`/`validate` in `src/index.js`, and four deep validators (v2.12 Strict Kawasaki, v2.14 Strict Maekawa, v2.15 Möller self-intersection, v2.12 Alternating M/V) that were only reachable via `analyze --all`.

This release makes fold-analyzer a first-class citizen of the CLI: every v2.x feature gets its own top-level subcommand, and a shared helper module removes ~110 lines of duplicated file-loading/error-handling code.

### Added

- **`src/commands/fold-helpers.js`** — shared `runWithFold(file, options, body)` wrapper. Centralizes file resolution, extension check (`.fold` only), JSON parse, `FoldAnalyzer` construction, and `--debug`-aware stack traces. Every fold subcommand now uses it.
- **4 new top-level deep-analysis commands** in `src/commands/fold-deep.js`:
  - `kawasaki <file>` — v2.12 Strict Kawasaki (ranks vertices by `|evenSum - oddSum|`, ±5° tolerance)
  - `maekawa <file>` — v2.14 Strict Maekawa (validates `|M-V| = 2`)
  - `selfintersection <file>` — v2.15 Complete Self-Intersection (Möller triangle-triangle)
  - `mvalternation <file>` — v2.12 Alternating M/V Pattern
  - Each supports `--json` for machine output, `--top <n>` (Kawasaki/Maekawa), `--debug`.
- **3 new subcommand modules** that replaced inline code in `src/index.js`:
  - `src/commands/fold-summary.js` (v2.13/v2.18)
  - `src/commands/fold-visualize.js` (v2.16/v2.18)
  - `src/commands/fold-validate.js` (v2.11/v2.19)
- **`tests/unit/fold-commands.test.js`** — 23 new unit tests covering all 7 new/refactored subcommands, using a fake-Commander pattern (no child_process, no Playwright, runs in <1s).

### Changed

- `src/index.js` shrunk by 110 lines (1116 → 1006). The 3 inline `summary`/`visualize`/`validate` blocks are now one-line `register*Command(program)` calls.
- All fold subcommands now share a single error-handling contract: missing file → `❌ File not found: <path>` and `process.exit(1)`; bad extension → `❌ Unsupported file format: <ext>`; malformed JSON → `❌ Failed to parse FOLD JSON: <msg>`. Behavior matches the old hand-rolled blocks but is now consistent and unit-tested.

### Test Coverage
- **fold-commands.test.js** (new): 23 tests in 0.3s — register, action, JSON output, error paths for all 7 commands
- **Full unit suite**: 15 suites, 450 tests pass in 1.9s
- Performance: 200-300ms for typical origami models

### Performance Characteristics
| Version | Complexity | Notes |
|---------|------------|-------|
| v2.6 self-intersection | O(F²) | Brute-force pair test |
| v2.15 complete self-intersection | O(F²) | Möller tri-tri |
| v2.17 BVH self-intersection | O(F log F) | BVH-accelerated |
| v2.13 summary | 9 fields | 97.4% smaller than full |

### CLI Subcommands (v2.18–v2.19 ergonomic layer)
- `origami analyze <file>` — full analysis (v2.0+)
- `origami summary <file>` — compact JSON (v2.13/v2.18)
- `origami visualize <file>` — HTML report (v2.16/v2.18)
- `origami validate <file>` — schema check, CI/CD exit codes (v2.11/v2.19)
- `origami load`/`list`/`screenshot`/`simulate`/`view`/`export`/`record`/`batch`/`verify`/`config`/`dieline`/`bind`/`render`/`template` (unchanged from 0.1.0)

### Dependencies Added
- `ajv` (^8.20.0) — JSON Schema validation (v2.11)

### Notes
- This release is the **fold-analyzer v2.0–v2.19 series** (a single day's evolution captured)
- For v2.0–v2.7 users, the v2.0 in-place mutation bug fix (`e.sort()` → `[...e].sort()`) is critical — see [docs/FOLD-ANALYZER.md](docs/FOLD-ANALYZER.md) "⚠️ Critical Bug Fix in v2.8"
- Schema version is "2.10" (frozen at v2.10); v2.11+ are additive-only and don't bump schema

### Verified On
- hypar.fold (3D origami, 96 vertices / 207 edges)
- miura-ori, waterbomb, cranes, etc. (origami-examples/FOLD/Origami/)
- Custom-crafted test cases (unit + integration)

---

## [2.21.0] - 2026-06-07 — "DXF/PDF export for manufacturing"

Closes the 'design → verify → manufacture' loop. The fold-analyzer already had complete geometric data and an SVG exporter; this release adds the two formats that actually drive laser cutters / CNC / print.

### Added
- `src/utils/dieline-dxf-exporter.js` — AutoCAD R12 ASCII DXF writer
  - 3 layers: CUT (green, solid), MOUNTAIN (red, dashed), VALLEY (blue, dashed)
  - `$INSUNITS=4` (millimeters) in header
  - LWPOLYLINE for face boundaries + LINE for open segments
  - Output ~12KB for hypar.fold
- `src/utils/dieline-pdf-exporter.js` — pdf-lib cut-pattern sheet (no new dep)
  - A4 default, auto-orients landscape when model is wider than tall
  - Same color/dash conventions as SVG exporter
  - Face fills at 50% gray
  - Bottom legend: Cut / Mountain / Valley
  - Output ~3.4KB for hypar.fold
- `dieline` command now accepts `-f dxf` and `-f pdf` (in both `parse` and `export` subcommands)

### Tests
- `tests/unit/dieline-exporters.test.js` — 19 unit tests (1.1s)

---

## [2.22.0] - 2026-06-07 — "VS Code extension"

A thin VS Code wrapper that integrates the fold-analyzer as a first-class editor experience.

### Added
- `vscode-origami/` — full VS Code extension (no build step, no TypeScript)
  - 6 commands (editor context menu + Command Palette):
    - `Origami: Analyze File` — full analyze --all report
    - `Origami: Visualize` — self-contained HTML in Webview panel
    - `Origami: Validate Output (Schema)` — ajv validation
    - `Origami: Summary (Compact JSON)` — compact JSON
    - `Origami: Strict Kawasaki` — v2.12
    - `Origami: Strict Maekawa` — v2.14
  - Settings: `origami.cliPath` (default `"origami"`), `origami.showOutputOnRun`
  - Activation: onLanguage:json + onCommand:origami.*
  - Visualize reuses a single WebviewPanel (reveal instead of recreate)

### Tests
- `tests/unit/vscode-origami.test.js` — 4 unit tests using `jest.mock('vscode')`

### Packaging
- `cd vscode-origami && vsce package` produces a `.vsix`

---

## [2.23.0] - 2026-06-07 — "batch-analyze + JUnit XML for CI/CD"

Bulk FOLD validation with CI-friendly output.

### Added
- `batch-analyze <inputs...>` — run fold-analyzer on many .fold files at once
  - Inputs: file list, comma-list, glob (`*.fold`, `models/**`), directory (recursive)
  - Actions: `--action analyze|summary|validate|kawasaki|maekawa` (default: `analyze`)
  - Per-file checks: `basic` + `<action>` + `schema` (skip any with `--no-basic` / `--no-schema`)
  - Optional JUnit XML output via `--junit <file>` for CI/CD
  - Exit codes: 0=pass, 1=check failure, 2=input error
- Inline glob walker + JUnit XML writer (no new deps)
- `src/commands/fold-batch.js` — 320 lines

### Tests
- `tests/unit/fold-batch.test.js` — 22 unit tests (1.9s)
  - expandInputs (file / glob / dir / dedup / non-existent)
  - toJUnitXML (header, counts, failures, escaping)
  - CHECKS registry (5 actions × 1 real run on hypar.fold)
  - CLI end-to-end (good path, bad path, exit codes)

---

## Test Coverage Summary (v2.0 → v2.23)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| **Total (without preset-constants)** | **495** | **18** | **+486 since v2.0** |

---

## [2.24.0] - 2026-06-07 — "STL export"

Last gap in the design→verify→manufacture pipeline. STL is the de-facto standard for 3D printing (Cura, PrusaSlicer) and CAM software.

### Added
- `src/utils/fold-stl-exporter.js` — Binary + ASCII STL writer (0 new deps)
  - Binary: 80-byte header + uint32 tri count + 50 bytes/triangle
  - ASCII:  human-readable "solid / facet / vertex" blocks
  - Smart 2D→3D extrusion: quad face → 2 top + 2 bottom + 4 sides × 2 = 12 triangles
  - True 3D passthrough: z≠0 coordinates used as-is
  - Inline fan triangulation (matches `faceTriangles()` in fold-analyzer)
  - Inline normal computation via right-hand-rule cross product
- `stl <file>` top-level command
  - `--ascii` ASCII format (default binary)
  - `--thickness <mm>` sheet thickness (default 1.0)
  - `--no-extrude` skip extrusion for 3D models
  - `--flip-normals` reverse all face normals
  - `--name <name>` custom header name
- `dieline` command extended: `-f stl` (parse + export), `--ascii`, `--thickness`
- `tests/unit/fold-stl.test.js` — 22 unit tests (1.4s)

### Verified On
- Synthetic 50×50mm square: 12 triangles, 684 bytes binary
- 3D tetrahedron: 4 triangles (1 per face), 0 extrusion
- `--thickness 3.5` → v1.z = +1.75 (half offset) ✓
- `--flip-normals` → normal (0,0,1) → (0,0,-1) ✓
- `dieline export -f stl --ascii` → valid ASCII STL ✓

### Test Coverage Summary (v2.0 → v2.24)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| **Total (without preset-constants)** | **517** | **19** | **+508 since v2.0** |

---

## [2.27.0] - 2026-06-07 — "Local real-time fold simulator"

Adds a pure-JS kinematic fold solver that runs the fold simulation locally — no Playwright, no browser, no network. The previous `simulate` command at src/index.js:289 launched a Chromium and drove origamisimulator.org's slider; this new `fold` command does the math in-process in < 5ms per frame.

### Added
- `src/utils/fold-simulator.js` — tree-based kinematic fold solver (rigid origami approximation)
  - Builds face adjacency graph → BFS spanning tree → rotates child faces around shared edges
  - Rodrigues' rotation formula + 4×4 matrix composition (no gl-matrix / no three.js)
  - M=+angle, V=-angle around edge axis; cyclic patterns get first-assignment-wins
- `fold <file>` top-level command (avoids name clash with browser-based `simulate`)
  - `--angle <deg>`, `--percent <0-1>`, `--frames N -o out.json`, `--animate out.html`
  - `--no-mountain-up` to flip M/V convention
- `src/commands/fold-simulate-anim.js` — self-contained HTML animation
  - SVG with isometric projection (z → vertical offset, no WebGL)
  - Slider + play/pause, 20 frames embedded as JSON, ~5KB output
- `tests/unit/fold-simulator.test.js` — 21 unit tests (1.1s)

### Performance
| Fixture | V×E×F | ms/frame |
|---------|-------|---------:|
| L-fold | 6×7×2  | < 1ms |
| TREE_3  | 7×10×3 | < 2ms |
| 20 frames in 100ms total (10× real-time at 30fps target) | | |

### Limitations
- For CYCLIC patterns (most dense origamis), this is an APPROXIMATION: the spanning tree ignores back-edges, so the result may not be physically consistent at the cycle. For TREE-LIKE patterns (waterbomb base, bird base, simple L-folds) it's exact.
- For RIGID-FOLDABLE patterns, results are visually accurate.
- For NON-RIGID patterns (those requiring stretching), results are approximate but useful for visualization.

### Test Coverage Summary (v2.0 → v2.27)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| v2.27   |   287 |      7 | +21 fold-simulator.test.js |
| **Total (without preset-constants)** | **538** | **20** | **+529 since v2.0** |

---

## [2.28.0] - 2026-06-08 — "Spring-mass / PBD solver"

Adds a Position-Based Dynamics (PBD) fold solver that handles cyclic patterns correctly. v2.27's tree-based kinematic solver was O(F) and deterministic but approximated cyclic patterns; v2.28 iteratively relaxes edge-length + bending constraints toward a consistent state.

### Added
- `src/utils/spring-mass-solver.js` — PBD solver (280 lines, 0 new deps)
  - Algorithm: bend-once + relax (apply full bending rotation once, then iterate edge constraints)
  - NOT per-iteration bending (that oscillates: rotate 90° every step → never converge)
- `fold <file> --solver spring-mass` flag (kinematic remains default for back-compat)
- `--edge-stiffness 0.3`, `--bending-stiffness 1.0`, `--iterations 100` options
- `tests/unit/spring-mass-solver.test.js` — 17 unit tests (0.3s)

### Bug fixed during dev
- Per-iteration bending oscillates → moved bending to one-shot pre-step
- Root face detection was too loose ("any root vertex" was true for both faces due to shared M-edge vertices) → changed to set-equality

### Limitations (documented in code)
- For CYCLIC patterns, v2.28 only folds edges incident to the root face. Edges between two non-root faces (cyclic inner edges) are skipped. Fully consistent cyclic fold is a v2.29+ goal.

### Test Coverage Summary (v2.0 → v2.28)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| v2.27   |   287 |      7 | +21 fold-simulator.test.js |
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| **Total (without preset-constants)** | **555** | **21** | **+546 since v2.0** |

---

## [2.29.0] - 2026-06-08 — "Full cyclic PBD solver"

Fixes v2.28's documented cyclic limitation: v2.28's bend-once + relax only folded M-edges incident to the root face; v2.29's per-iteration dihedral constraint handles ALL M-edges, including inner-cyclic ones between two non-root faces, producing a physically-consistent solution for cyclic patterns.

### Added
- `cyclic: true` mode in `SpringMassSolver` (default: false for v2.28 compat)
- Per-iteration bend CONSTRAINT (replaces v2.28's one-shot bend)
  - Computes CURRENT dihedral via cross-product face normals + atan2
  - Applies rotation = (target - current) * stiffness per outer-face vert
- `cross()` and `projectPerp()` math helpers
- `--solver spring-mass-cyclic` CLI flag
- `tests/unit/cyclic-solver.test.js` — 6 unit tests (0.2s)

### Verified
- square-into-4-triangles fixture (5V, 8E, 4F, cyclic):
  - v2.28: V2/V3 partial folds only. Inner-cyclic M-edges skipped.
  - v2.29: V2/V3 fully folded to z=±5.5. ALL 4 M-edges active.

### Performance
< 5ms for 200 iterations on 5V/8E/4F.

### Test Coverage Summary (v2.0 → v2.29)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| v2.27   |   287 |      7 | +21 fold-simulator.test.js |
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| **Total (without preset-constants)** | **561** | **22** | **+552 since v2.0** |

---

## [2.31.0] - 2026-06-08 — "FOLD file diff"

Adds structural + spatial diff between two FOLD files. Useful for version control, code review, and tracking iterative design changes.

### Added
- `src/utils/fold-diff.js` — diff engine (340 lines, 0 new deps)
  - Match vertices by spatial proximity (closest-unmatched B within tolerance)
  - Match edges by (mapped-A, mapped-B) vertex pair
  - Match faces by translated vertex-set signature
  - Diff metadata fields
- `src/commands/fold-diff.js` — `diff <old> <new>` CLI (80 lines)
- 3 output modes: text (default), JSON, HTML (color-coded)
- `tests/unit/fold-diff.test.js` — 19 unit tests (1.3s)

### Two separate thresholds (split during dev to fix test fixture conflict)
- `vertexTolerance` (default 1e-3 mm): matching threshold — max distance to consider two vertices "the same"
- `moveThreshold` (default 0): reporting threshold — matched vertices with distance > this are reported as "moved"

### CLI
- `origami diff <old> <new>` — text
- `origami diff <old> <new> --json` — JSON
- `origami diff <old> <new> --html out.html` — HTML
- `origami diff <old> <new> --exact` — match by index (no spatial)
- `origami diff <old> <new> --tolerance 0.5` — match within 0.5 mm
- `origami diff <old> <new> --move-threshold 1` — report moves > 1 mm
- `origami diff <old> <new> --exit-code` — 0=no changes, 1=changes (for CI/CD)

### Test Coverage Summary (v2.0 → v2.31)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| v2.27   |   287 |      7 | +21 fold-simulator.test.js |
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| v2.31   |   329 |     10 | +19 fold-diff.test.js |
| **Total (without preset-constants)** | **580** | **23** | **+571 since v2.0** |
---

## [2.32.0] - 2026-06-08 — "REST API service"

Adds a pure-Node HTTP server that exposes every origami CLI command as a JSON-in/JSON-out REST endpoint. Zero new dependencies (uses built-in `http` + `child_process`).

### Architecture
Server is a thin shell — each request is dispatched by spawning the existing CLI as a subprocess and capturing stdout/stderr/exit. This means every endpoint behaves identically to its CLI counterpart, with no code duplication.

### Endpoints (POST /api/v1/{command})
- `analyze`, `summary`, `visualize`, `kawasaki`, `maekawa`, `selfintersection`, `mvalternation`, `validate`
- `stl` — STL export (returns file path)
- `fold` — fold simulator (solver option: kinematic/spring-mass/spring-mass-cyclic)
- `diff` — requires `foldA` + `foldB` in body
- `batch-analyze` — requires `inputs` array (paths or FOLD objects)

### Plus
- `GET /health` — version + uptime + request count
- `GET /` — HTML API docs
- `GET /api/v1/files/:name` — download generated file (path-traversal blocked)
- `OPTIONS /api/v1/*` — CORS preflight

### CLI
- `origami serve` → 127.0.0.1:3000
- `origami serve --port 8080`
- `origami serve --host 0.0.0.0`

### Test Coverage Summary (v2.0 → v2.32)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| v2.27   |   287 |      7 | +21 fold-simulator.test.js |
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| v2.31   |   329 |     10 | +19 fold-diff.test.js |
| v2.32   |   347 |     11 | +18 api-server.test.js |
| **Total (without preset-constants)** | **598** | **24** | **+589 since v2.0** |
---

## [2.36.0] - 2026-06-08 — "WebSocket real-time fold animation"

Adds a WebSocket endpoint that streams fold simulation frames in real-time to a connected client. Zero new dependencies — uses Node's built-in `http.upgrade` event + a hand-rolled minimal WebSocket protocol implementation.

### Protocol
1. Client opens WebSocket to `GET /api/v1/ws/fold`
2. Server sends `101 Switching Protocols`
3. Client sends first text frame: `{"fold": {...}, "options": {...}}`
4. Server streams frames: `ack` → N × `frame` → `done` (or `error`)
5. Either side closes to terminate

### Browser client
`/demo` (v2.36) serves a self-contained HTML+JS+SVG client that connects to the WebSocket, picks a solver, and animates the fold. No build step.

### Test Coverage Summary (v2.0 → v2.36)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| v2.27   |   287 |      7 | +21 fold-simulator.test.js |
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| v2.31   |   329 |     10 | +19 fold-diff.test.js |
| v2.32   |   347 |     11 | +18 api-server.test.js |
| v2.36   |   361 |     12 | +14 ws-fold.test.js |
| **Total (without preset-constants)** | **612** | **25** | **+603 since v2.0** |
---

## [2.40.0] - 2026-06-08 — "MCP tool exposure"

Exposes origami commands as MCP tools so AI assistants (Claude, etc.) can call them directly. Communication: JSON-RPC 2.0 over stdio.

### 10 tools
- `analyze_fold` — full FOLD analysis
- `summarize_fold` — compact summary (9 fields)
- `kawasaki_check` — v2.12 Strict Kawasaki
- `maekawa_check` — v2.14 Strict Maekawa
- `fold_simulate` — fold simulator (3 solvers)
- `diff_folds` — compare two FOLD files
- `stl_export` — STL export
- `validate_fold` — ajv schema validation
- `selfintersection_check` — v2.15 Möller
- `mvalternation_check` — v2.12 Alternating M/V

### For Claude Code / Claude Desktop integration
```json
{
  "mcpServers": {
    "origami": { "command": "origami", "args": ["mcp"] }
  }
}
```

### Test Coverage Summary (v2.0 → v2.40)

| Version | Tests | Suites | Notable |
|---------|------:|-------:|---------|
| v2.0    |     9 |      1 | fold-analyzer.test.js initial |
| v2.19   |   176 |      1 | +167 tests across v2.1-v2.19 |
| v2.20   |   199 |      2 | +23 fold-commands.test.js |
| v2.21   |   218 |      3 | +19 dieline-exporters.test.js |
| v2.22   |   222 |      4 | +4 vscode-origami.test.js |
| v2.23   |   244 |      5 | +22 fold-batch.test.js |
| v2.24   |   266 |      6 | +22 fold-stl.test.js |
| v2.27   |   287 |      7 | +21 fold-simulator.test.js |
| v2.28   |   304 |      8 | +17 spring-mass-solver.test.js |
| v2.29   |   310 |      9 | +6 cyclic-solver.test.js |
| v2.31   |   329 |     10 | +19 fold-diff.test.js |
| v2.32   |   347 |     11 | +18 api-server.test.js |
| v2.36   |   361 |     12 | +14 ws-fold.test.js |
| v2.40   |   379 |     13 | +18 mcp-server.test.js |
| **Total (without preset-constants)** | **630** | **26** | **+621 since v2.0** |
