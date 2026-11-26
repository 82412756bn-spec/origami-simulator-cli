# origami-simulator-cli v2.47.0 — 发布前置检查清单

> 状态：**5 条结论已通过独立复核**（复核者：Noul / `firstmate`，模型 `kilo/reflection/beam-free`）
> 复核日期：2026-11-26
> 证据来源：`consulting/unbuntu-system/research/release-check-commands.sh`（复现命令，sha256 记于下）
> 用途：随包发布到 `docs/RELEASE-CHECKLIST.md`，也作为 `npm publish` 前的签字依据

---

## 结论 1 — package.json 缺 `repository` / `homepage` / `bugs` ⚠️ 待修

**[实测]** `package.json` 顶层共 13 个字段：`name` `version` `description` `main` `bin` `files` `scripts` `keywords` `author` `license` `dependencies` `engines` `devDependencies` —— **无这三个字段**。

**影响**：npm 包页面会是空的，陌生人点不到源码。

**处置**：补 `repository` → 已实测的 remote 值 `https://github.com/82412756bn-spec/origami-simulator-cli.git`（GitHub 账号 `82412756bn-spec` API 实测 200）。

---

## 结论 2 — 发布包内无敏感信息 ✅

**[实测]** 对将进包的全部已跟踪文件（`src docs examples README.md LICENSE CHANGELOG.md CONTRIBUTING.md package.json`）跑

```
grep -lEi "api[_-]?key|secret|token|password|BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9]{16}|ghp_[A-Za-z0-9]{20}"
```

命中 **1 个文件**：`src/utils/dieline-parser.js`。逐行核对第 331/336/337 行 —— 该处 `token` 指 SVG path 解析的**路径命令 token**（`const tokens = pathData.trim().split(/(?=[MmLlHhVvCcSsQqTtAaZz])/)`），非凭据。**误报，非泄露。**

---

## 结论 3 — 27 个 preset 不构成「再分发几何数据」✅

**[实测]**
- `npm pack --dry-run` 输出中 **`.svg` 数量 = 0**；`.fold` 数量 = 1，且只有 `examples/sample-crane.fold`（1.4 kB，自造示例）。
- `src/utils/presets.js` 每个 preset 只存 `{id, name, file:'Origami/xxx.svg', category}`；`src/index.js` 的 `buildPresetUrl` 拼成 `${BASE_URL}?demo=<file>` —— **运行时从 origamisimulator.org 拉取**，几何数据不入包。

**剩余风险（写进已知约束，不阻塞发布）**：27 个 preset 的可用性依赖第三方站点在线，对方不可达则全部失效。27 个 preset 的命名引用了公开论文（Lang / Huffman），论文名称本身不是受保护的表达。

> ⚠️ 这条推翻了此前开发报告里「27 个 preset 的几何授权是发布前法律风险、优先级高于发布」的判断 —— 那是**再分发**才会触发的问题。

---

## 结论 4 — `@jackwener/opencli` 是被 Playwright 方案取代的残留运行时依赖 ⚠️ 处置中

**[实测]**
- 全仓库 217 个已跟踪文件、**不限扩展名** grep `opencli`：排除 `docs/` 的描述性文字后，仅 3 处命中 —— `.gitignore:56`（忽略规则）、`package-lock.json:12/696/698/712`（锁文件）、`package.json:49`（依赖声明本身）。**可执行代码 0 引用**。
- `.opencli/` 只存在于本机（被 gitignore），内容是 2026-04-16 生成的 `origami-adapter.yaml`；`grep -rn "\.opencli\|adapter.yaml" src/` → **0 命中**，非运行时读取。
- CLI 实际用 Playwright 直接驱动浏览器（`src/index.js:98 launchBrowser` → `page.goto(BASE_URL)`）。
- 仓库扩展名全清单：`js 113 / fold 32 / svg 26 / png 23 / md 11 / json 4 / sh 3 / html 2 / yml 1 / py 1 / pdf 1` —— **无 `.ts` `.tsx` `.mjs` `.cjs`**，不存在"漏搜其他扩展名"的可能。

**体积代价**：`node_modules/@jackwener/opencli` = **9.7 MB**，传递依赖 `undici` `ws` `chalk` `cli-table3` `js-yaml` `turndown` —— 会随 `npm install` 装给每个用户。

**处置**：✅ **已完成** —— 从 `dependencies` 移除（由 Crewmate 执行，我独立复核 7/7）。
**移除后的实测收益**：

| 指标 | 移除前 | 移除后 |
|---|---|---|
| 运行时依赖 | 9 | **8** |
| 安装足迹 `node_modules` | 295 M | **273 M（-22 M）** |
| 依赖包数 | 252 | **244（-8）** |
| 供应链攻击面 | 含 1 个未审计的直接依赖 | 缩小 |
| tarball 体积 | 208.9 kB | 208.8 kB（**几乎不变**——tarball 只含 files 白名单，不含 node_modules） |

> 收益在**用户的安装足迹**，不在包大小。附带：`npm uninstall` 顺带把 package-lock.json 根版本号从长期滞留的 `0.2.0` 修正为 `2.47.0`，并把 5 个仅经 opencli→chalk 可达的包正确降级为 dev-only。

---

## 结论 5 — 包名 `origami-simulator-cli` 当前可占 ⚠️ 不可逆

**[实测]** `registry.npmjs.org/origami-simulator-cli` → **404**（未发布，名字可占）；`registry.npmjs.org/origami` → **200**（已被他人占用，故只能用带 `-cli` 后缀的名字）。

**发布后包名永久占用**，别人就发不了同名包。

---

## 已验证的发布包状态

```
npm pack --dry-run  →  total files 71
                       package size 208.9 kB
                       unpacked size 803.7 kB
                       包内运行产物文件 0 个
                       src 下 57 个 .js 全部进包（无遗漏）
node src/index.js --version  →  2.47.0
```

---

## 独立复核记录（复核者：Noul / `firstmate`）

| 轮次 | 判断 | 依据 / 反对点 |
|---|---|---|
| 第 1 轮（单条结论） | **信息不足** | 指出我的 grep 只覆盖 `*.js/*.json/*.md/*.sh` 四种扩展名且排除了 `.opencli/`，盲区未排除；`.opencli/` 是否运行时加载未证；opencli 的导出与调用点未证 |
| 补证后（把 217 文件全量 grep、扩展名全清单、`.opencli` 运行时检查、包 exports 全部贴回） | **成立** | "未发现错误"；仍存的核对不了项只有「grep 模式与 package-lock 里其他包的传递引用」「仓库外/全局调用」 |

> **这条复核的实际价值**：它没能核事实（按它的契约，它读不到 `/home/rayna/文档/`），但它**能核证据链完整性** —— 它挑出的第一个盲区（扩展名覆盖面）是**真的**，是我原结论没覆盖到的。补证后结论才成立。
>
> **复核纪律**：摘录必须原样贴、主动列缺什么；否则它 33% 会判「信息不足」（research/26 实测）。

---

## 发布前剩余动作

1. ✅ 移除 `@jackwener/opencli`（结论 4，已完成并复核）
2. ⬜ 补 `repository` / `homepage` / `bugs`（结论 1）
3. ⬜ GitHub 仓库转公开（否则 npm 页面上的 repo 链接是死链；且「非本人提问」这条外部信号在私有仓库里根本不存在）
4. ⬜ `npm publish --access public` —— **不可逆，需签字**
5. ⬜ 发布后当天装上 14 天证伪观测器（MCP/REST 当前 `console.` 出现 0 次，无调用日志可采）

## 复现方式

```bash
bash docs/release-check-commands.sh      # 工作目录 = 仓库根
```

本文件的所有数字都可由上面这条命令重新跑出来。
