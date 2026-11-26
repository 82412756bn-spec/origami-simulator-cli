# origami-simulator-cli

**从 FOLD 到成品的折纸 / 纸艺工具链** —— 分析、校验、渲染、导出，一条命令走完；
既能人在终端用，也能直接交给 agent 调用（CLI / MCP / REST / Skill 四种入口）。

它解决的是「手工折一张纸」到「批量产出一批成品」之间那一段：给一个 FOLD 文件，
告诉你**能不能折平**、**哪里会自交**、**折完是什么形状**，并直接导出成 STL / OBJ /
图片 / 视频，或生成可打印的刀模与包装盒型。

> **它不是** origamisimulator.org 网页版的替代品（那是浏览器里的交互式模拟器），
> **也不是**图形编辑器。它是那一层之下的**批处理 / CI / agent 通道**：
> 无头浏览器跑、可脚本化、可进流水线。

---

## 安装

**不需要安装就能跑**（从 GitHub 直接执行）：

```bash
npx github:82412756bn-spec/origami-simulator-cli list
```

或全局安装：

```bash
npm install -g github:82412756bn-spec/origami-simulator-cli
npx playwright install chromium   # 需要截图 / 录屏 / 渲染时才用得上
```

> **只通过 GitHub 分发，不发 npm**（2026-11-26 决策，理由见 `docs/RELEASE-CHECKLIST.md`）。
> 安装用 `npx github:82412756bn-spec/origami-simulator-cli`，或下载 GitHub Releases 里的
> tgz（`npm install -g ./origami-simulator-cli-2.47.3.tgz`）。

Node ≥ 18。纯本地的命令（`analyze` / `kawasaki` / `stl` / `diff` …）不需要浏览器，也不需要联网。

---

## 第一条命令

```bash
# 0. 预取 27 个 preset 到本地（约 4 MB；之后不再依赖站点的资源路径）
npx github:82412756bn-spec/origami-simulator-cli presets sync

# 1. 看有什么 —— 27 个内置 preset，9 个类别
npx github:82412756bn-spec/origami-simulator-cli list

# 2. 拿你自己的 .fold 文件做本地分析（不开浏览器、不联网、毫秒级）
npx github:82412756bn-spec/origami-simulator-cli analyze <你的文件.fold>

# 3. 出成品 —— 截图 / 折叠动画（需要 chromium + ffmpeg）
npx github:82412756bn-spec/origami-simulator-cli screenshot --preset cranes -o crane.png
npx github:82412756bn-spec/origami-simulator-cli record --preset cranes --format mp4 -o crane.mp4
```

全局装过之后，把 `npx github:…` 换成 `origami` 即可。示例文件随包发布：全局安装后在
`$(npm root -g)/origami-simulator-cli/examples/sample-crane.fold`。

---

## 三块能力

### 一、FOLD 格式工具链（纯本地，学术级）

```bash
origami analyze <file.fold>          # 12 个分析字段：应变 / 自交 / M-V 一致性 / ...
origami kawasaki <file.fold>         # 严格 Kawasaki 定理：每个顶点能否折平
origami maekawa <file.fold>          # 严格 Maekawa 定理：|M-V| = 2
origami selfintersection <file.fold> # Möller (1997) 三角-三角自交检测
origami mvalternation <file.fold>    # 内部顶点的 M/V 必须交替
origami diff a.fold b.fold           # 两个文件的差异（text / JSON / HTML）
origami merge base ours theirs       # 三方合并
origami v2detect|v2validate|v2upgrade|v2downgrade <file.fold>   # FOLD v1.x ↔ v2.0
origami batch-analyze "models/*.fold" --junit   # 批量分析，出 JUnit XML 进 CI
origami validate <file.fold>         # 对照 JSON Schema 校验
origami summary <file.fold>          # 压缩 JSON
origami visualize <file.fold> -o report.html   # 自带样式的 HTML 报告
```

### 二、折纸模拟与出图（浏览器驱动，可无头）

```bash
origami list                         # 27 个 preset / 9 类
origami presets status               # 本地缓存状态（哪些已离线可用）
origami presets sync                 # 预取全部 27 个到 ~/.origami/presets
origami load --preset cranes         # 载入模型
origami simulate --preset cranes     # 跑折叠仿真
origami view --mode strain           # 切视图：pattern / simulation / folded / strain
origami screenshot -o crane.png      # 截图
origami record -o crane.mp4          # 录动画（GIF / WebM / MP4）
origami export --format stl          # 导出 FOLD / STL / OBJ / PNG / SVG
origami stl <file.fold>              # FOLD → STL（3D 打印 / 激光切割）
origami obj <file.fold>              # FOLD → OBJ / MTL
origami webgl <file.fold>            # Three.js 交互式 3D 预览
origami crane <file.fold>            # 传统仙鹤的 3D 预览（带边着色）
origami batch --models "cranes,miura-ori" --action screenshot --output-dir out/
```

### 三、按意图生成折痕图（`generate`）

```bash
# 生成一对产物：.fold（可验证）+ .svg（可打印 / 可渲染 / 可上传 origamisimulator.org）
origami generate crane --output-dir ./out
origami generate star --seed 42 --thickness 1.0

# 可用 pattern：star / crane / fish / miura / tiger / radial / modular / unit
```

生成后命令会**自动跑一遍验证**并逐条打印结果（产物成对 / FOLD 合法 / 折平局部必要条件 /
2D 折痕线自交 / SVG↔FOLD 一致 / SVG 良构）。

> **判定口径说明（2026-11-26 修正）**：此前这里报「crane / tiger 不满足折平必要条件」，
> 那是**判定实现的口径错**导致的误判 —— Kawasaki 的交替和误用了扇区角而非折痕角，
> 且把带 B（边界）边的顶点也算进了检查集。修正后（v2.47.6）：
> `crane` **Kawasaki 411/411** · `tiger` **240/240**，生成器几何本身基本合格。
> 以 78 个真实作品为基准，Kawasaki 通过率 **44% → 87.33%**，38 件真实作品变成「全过」。
> **Maekawa 仍只有 28% 通过**（独立议题，未解决）。

### 四、给 agent 用的接口

```bash
origami mcp                          # MCP server（JSON-RPC over stdio）
origami serve                        # REST API（默认 127.0.0.1:3000）
```

仓库自带 `.claude/skills/SKILL.md`（中英双语触发条件），agent 可直接按 SKILL 描述调用。

> 另外还带有包装刀模相关的命令（`dieline` 刀模→FOLD/DXF、`template` 5 种盒型 + 8 种材料、
> `bind` 版面绑定、`render` Three.js PBR 渲染）。**不主推但也不删**，细节见
> [`docs/COMMAND-REFERENCE.md`](docs/COMMAND-REFERENCE.md)。

---

## 质量（实测数字，2026-11-26）

| 项 | 结果 |
|---|---|
| 单元测试 | **27 suites / 660 tests 全过** |
| e2e（Jest 车道） | **20/20 全过** |
| e2e（Playwright 车道） | **11/11 全过** |
| 覆盖率 | 语句 **42.85%**（3689/8608）· 分支 39.03% · 函数 53.33% · 行 42.24% |
| 源码规模 | 56 个 .js / 20,638 行 · 36 个功能命令 |
| 运行时依赖 | 9 个 · 锁文件入库 |

复现覆盖率：

```bash
npx jest tests/unit --coverage --coverageReporters=text-summary
```

三条测试车道：

```bash
npm test              # 单测（660）
npm run test:e2e      # e2e · Jest 车道；外网不可达时网络用例显式 skip
npm run test:e2e:browser   # e2e · Playwright 车道
```

---

## 已知约束

- **preset 缓存只消除「资源」这一层依赖，不消除「模拟器本体」**：`load` / `screenshot`
  仍要打开 `origamisimulator.org` 加载网页应用。缓存防的是「站点可达但资源路径变了 / 个别资源拿不到」
  （27 个 preset 的 SVG/FOLD 实测分散在 `/assets/<file>`，根路径是 404），**不是「整站下线也能用」**。
- 27 个 preset 里 **25 个是 `.svg`、2 个是 `.fold`**（`box-pleat-tess` / `box-pleat-pyramid`），
  缓存按扩展名分别校验 —— 路径错时站点会返回 200 的 HTML 错误页，校验能挡住。

## 已知约束（跨平台）

- **canvas（原生模块）只服务 `origami render`**，且是 **`optionalDependencies`** ——
  装不上时安装不会失败，只有 render 的纹理降级为空。预编译覆盖 5 个平台
  （linux-x64/arm64、darwin-x64/arm64、win32-x64），**win32-arm64 与 Alpine(musl) 会退回源码编译**。
  详见 [`docs/CANVAS-PLATFORM.md`](docs/CANVAS-PLATFORM.md)。
- CI 在 ubuntu / windows / macos 三个平台跑单测并显式验证 canvas 能加载。

## 开发

```bash
npm install
npm test
npm run lint
```

版本号以 `package.json` 为**唯一真相源**（`src/version.js` 统一读取），
`origami --version`、REST `/health`、MCP `serverInfo.version` 三处输出恒等。

## License

MIT
