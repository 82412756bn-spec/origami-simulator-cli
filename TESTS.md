# Testing Guide

**文档版本**: 2.47.0
**更新日期**: 2026-11-26

---

## 测试策略

### 测试金字塔

```
        ╱ E2E Tests (critical paths) ╲
       ╱                                   ╲
      ╱     Integration Tests (services)    ╲
     ╱                                        ╲
    ╱        Unit Tests (many, fast)          ╲
   ╱                                            ╲
  ╱______________________________________________╲

  - Many unit tests for isolated logic
  - Some integration tests for module interaction
  - Few E2E tests for critical user paths
```

### 当前测试覆盖

| 模块 | 覆盖率 | 测试数 |
|------|--------|--------|
| presets.js | **100%** | 42 |
| browser.js | **91.3%** | 8 |
| file-utils.js | **91.89%** | 14 |
| utils 汇总 | **93.82%** | 76 |
| **整体项目** | **13.4%** | 76 |

**说明**: 整体覆盖率较低是因为 index.js (1004行) 需要浏览器环境。utils 模块已达到 93.82% 的高覆盖率。

---

## 测试框架

| 类型 | 框架 | 说明 |
|------|------|------|
| Unit | Jest | 快速隔离测试，无需浏览器 |
| E2E | Jest + child_process | CLI 命令测试 |
| Integration | Bash Script | server-test.sh 综合测试 |

---

## 运行测试

### 单元测试 (快速，无浏览器)

```bash
npm test
```

### 带覆盖率报告

```bash
npm test -- --coverage
```

### 单个测试文件

```bash
npx jest tests/unit/presets.test.js
```

### E2E 测试 (需要浏览器)

```bash
npm run test:e2e
```

### 综合测试脚本

```bash
./tests/server-test.sh
```

---

## 测试模块说明

### Unit Tests (tests/unit/)

| 文件 | 覆盖模块 | 测试内容 |
|------|----------|---------|
| presets.test.js | presets.js | 预设解析、URL构建、验证 |
| browser.test.js | browser.js | 浏览器启动、页面等待、导航 |
| file-utils.test.js | file-utils.js | 文件验证、目录操作 |
| validators.test.js | - | 命令选项验证 (FOLD/SVG格式) |

### E2E Tests (tests/e2e/)

| 文件 | 测试命令 |
|------|---------|
| commands.test.js | load, list, screenshot, verify |
| screenshot.test.js | 截图功能详细测试 |

---

## 测试覆盖目标

### 短期目标 (已达成 ✅)

| 模块 | 目标 | 实际 | 状态 |
|------|------|------|------|
| presets.js | 80%+ | 100% | ✅ |
| browser.js | 70%+ | 91.3% | ✅ |
| file-utils.js | 80%+ | 91.89% | ✅ |
| utils 汇总 | 80%+ | 93.82% | ✅ |

### 长期目标

| 模块 | 目标 | 说明 |
|------|------|------|
| index.js | 50%+ | 需要浏览器环境，E2E测试 |
| 整体项目 | 40%+ | 需要更多集成测试 |

---

## CI/CD 集成

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx playwright install chromium
      - run: npm test          # Unit tests
      - run: npm run test:e2e  # E2E tests (需要浏览器)
```

---

## Mock 策略

### 浏览器 Mock

由于单元测试不能依赖真实浏览器，使用 mock：

```javascript
// tests/mocks/playwright.js
module.exports = {
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue(undefined),
          screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
          // ... 其他方法
        })
      })
    })
  }
};
```

---

## 测试最佳实践

1. **单元测试** - 测试纯函数和工具模块
2. **E2E测试** - 测试完整的 CLI 命令流程
3. **Mock外部依赖** - Playwright、文件系统等
4. **保持测试独立** - 每个测试可以独立运行
5. **清晰的测试名称** - 描述测试的行为

---

## 覆盖率报告

最近一次覆盖率报告（2026-11-26 实跑，`npx jest tests/unit --coverage --coverageReporters=text-summary`）:

```
Statements   : 42.85% ( 3689/8608 )
Branches     : 39.03% ( 1795/4598 )
Functions    : 53.33% (  488/915  )
Lines        : 42.24% ( 3230/7645 )
```

> 此前本文件里那张表只有 4 个文件（src/utils 93.82% ...），是旧产物，已删除。
> 完整口径必须用上面的命令现跑，不要抄表。

---

## 三条测试车道

| 命令 | 跑什么 | 规模 | 依赖网络 |
|---|---|---|---|
| `npm test` | 单元测试（`tests/unit/`） | 27 suites / 660 tests | 否 |
| `npm run test:e2e` | e2e · Jest 车道（`tests/e2e/`） | 20 用例 | 部分 |
| `npm run test:e2e:browser` | e2e · Playwright 车道（`tests/playwright/`） | 11 用例 | 部分 |

**为什么分两个 e2e 目录**：Playwright 的 test API 不能在 Jest 进程内运行，会直接抛
"Playwright Test needs to be invoked via 'npx playwright test'"。官方建议是 Playwright
与 Jest 各占一个目录。

**网络用例的信号契约**：

- `load --preset` / `screenshot` 都要开无头浏览器访问 origamisimulator.org
  （实测单例耗时 15-65s，随外网波动）。
- 外网**不可达** → 网络用例整组标记为 **skipped**（明确跳过，不是静默通过）。
- 外网**可达但抖动** → 失败按网络类特征重试；确定性失败（File not found /
  Unsupported file format / Unknown preset）一次都不重试。
- e2e 单例超时上限 180s（`--testTimeout=180000`），单测仍为 60s。

---

**最后更新**: 2026-11-26
