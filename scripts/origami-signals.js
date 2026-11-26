#!/usr/bin/env node
/**
 * origami-signals — 14 天证伪窗观测器（v2.47）
 *
 *   node scripts/origami-signals.js            每日采集：追加一行到 ~/.origami/signals/daily.jsonl
 *   node scripts/origami-signals.js --report   输出 4 条判据的三档结论 + 整体结论 + 缺失项
 *
 * 判据定义见设计稿 research/31-origami-signals-design.md：
 *   1. registry 404 → 200          （包已发布）
 *   2. 出现 1 个非本人下游 artifact （计数层自动，语义层不可自动 → 信息不足）
 *   3. 出现 1 个非本人提问 issue    （需要 GH_TOKEN）
 *   4. 非本人 agent 调用 ≥5 次      （读 mcp.jsonl + rest.jsonl 的 peer / peer_ip）
 *
 * 纪律：
 *   - 结论只有三档：成立 / 不成立 / 信息不足。不允许第四态措辞。
 *   - 判据 1（registry 404→200）是**发布核验**，不是需求信号，不参与需求判定。
 *   - 判据 2/3/4 是**需求信号**，语义为「任一条成立 = 有需求；可观测的信号全为 0 = 无需求」
 *     （对应 2026-11-25 决策原文「全 0 → 承认没需求」）。
 *   - 判据 4 对本地 CLI **结构不可观测**（MCP 只有 stdio、REST 默认绑回环）：
 *     标 observable:false，不参与判定，但必须在报告里显式列出「未观测」——
 *     「我们没提供入口」不能报成「没人用」。否则窗口永远关不掉，等于没有窗口。
 *   - 只读：不写任何外部状态。网络失败写 null + note，不编造数字。
 *   - 隐私：只读 peer / peer_ip / 计数，绝不把请求体或参数原文写进日志。
 *
 * 环境变量：
 *   ORIGAMI_SIGNALS_DIR   日志目录（默认 ~/.origami/signals）
 *   ORIGAMI_SIGNALS_DATE  覆盖采集日期（YYYY-MM-DD），用于补录历史行
 *   GH_TOKEN              GitHub API token；缺则 GitHub 相关字段写 null + note
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PACKAGE_NAME = 'origami-simulator-cli';
const REPO_OWNER = '82412756bn-spec';
const REPO_NAME = 'origami-simulator-cli';
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}`;
const GITHUB_API = 'https://api.github.com';
const NONOWNER_CALL_THRESHOLD = 5;
const USER_AGENT = 'origami-simulator-cli-signals';

const SIGNALS_DIR = process.env.ORIGAMI_SIGNALS_DIR || path.join(os.homedir(), '.origami', 'signals');
const DAILY_LOG = path.join(SIGNALS_DIR, 'daily.jsonl');
const MCP_LOG = path.join(SIGNALS_DIR, 'mcp.jsonl');
const REST_LOG = path.join(SIGNALS_DIR, 'rest.jsonl');

// ────────────────────────────────────────────────────────────────────
// 时间与格式
// ────────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Local ISO-8601 timestamp with UTC offset, e.g. 2026-11-27T09:00:00+08:00. */
function isoTimestamp(d = new Date()) {
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Local calendar date (YYYY-MM-DD), overridable for back-fill. */
function localDate() {
  if (process.env.ORIGAMI_SIGNALS_DATE) return process.env.ORIGAMI_SIGNALS_DATE;
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ────────────────────────────────────────────────────────────────────
// 「非本人」判定（唯一实现，采集与判据共用）
// ────────────────────────────────────────────────────────────────────

/**
 * Loopback addresses: 127.0.0.0/8, ::1, ::ffff:127.x.x.x, localhost.
 * An unknown / empty address is treated as loopback — it is NOT counted
 * as a non-owner call, because there is no evidence of a third party.
 */
function isLoopbackAddress(ip) {
  if (ip === null || ip === undefined || ip === '') return true;
  let addr = String(ip).trim().toLowerCase();
  if (addr.startsWith('::ffff:')) addr = addr.slice('::ffff:'.length);
  if (addr === '::1' || addr === '0:0:0:0:0:0:0:1' || addr === 'localhost') return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(addr)) return true;
  return false;
}

/**
 * Is this log record a call by somebody other than the author?
 *   MCP: peer !== 'local'  (the stdio transport is always local)
 *   REST: peer_ip is not loopback
 */
function isNonOwnerCall(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.peer_ip !== undefined) return !isLoopbackAddress(record.peer_ip);
  if (record.peer !== undefined) return record.peer !== null && record.peer !== 'local';
  return false;
}

/** True when the record carries no usable identity at all. */
function hasUnknownPeer(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.peer_ip !== undefined) return !record.peer_ip;
  if (record.peer !== undefined) return !record.peer;
  return false;
}

/**
 * Read the call logs and count non-owner calls.
 * Returns { count, note } — count is null when neither log file exists.
 */
function countNonOwnerCalls() {
  const files = [MCP_LOG, REST_LOG];
  const existing = files.filter((f) => fs.existsSync(f));
  if (existing.length === 0) {
    return { count: null, note: `读不到调用日志（${files.map((f) => path.basename(f)).join(' / ')} 均不存在）`, firstSeen: null, total: 0 };
  }

  let count = 0;
  let total = 0;
  let unknown = 0;
  let firstSeen = null;

  for (const file of existing) {
    let lines;
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
    } catch (err) {
      continue;
    }
    for (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch (err) {
        continue;
      }
      total++;
      if (hasUnknownPeer(record)) unknown++;
      if (isNonOwnerCall(record)) count++;
      if (record && record.ts && (!firstSeen || record.ts < firstSeen)) firstSeen = record.ts;
    }
  }

  const notes = [];
  if (firstSeen) notes.push(`观测自 ${firstSeen}`);
  if (unknown > 0) notes.push(`${unknown} 条记录缺少 peer/peer_ip，未计入非本人`);
  if (existing.length < files.length) {
    const missing = files.filter((f) => !fs.existsSync(f)).map((f) => path.basename(f));
    notes.push(`缺少 ${missing.join(' / ')}`);
  }
  return { count, note: notes.join('；'), firstSeen, total };
}

// ────────────────────────────────────────────────────────────────────
// 网络采集（registry / GitHub）
// ────────────────────────────────────────────────────────────────────

async function fetchJson(url, headers = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
      signal: controller.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch (err) {
      json = null;
    }
    return { status: res.status, ok: res.ok, json };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * npm registry — no auth needed.
 * 404 → the package is not published yet (a real answer, not an error).
 */
async function collectRegistry() {
  try {
    const res = await fetchJson(REGISTRY_URL);
    if (res.status === 404) {
      return { registry_version: null, published_days_ago: null, published: false, notes: ['registry 返回 404：包尚未发布'] };
    }
    if (!res.ok || !res.json) {
      return { registry_version: null, published_days_ago: null, published: false, notes: [`registry HTTP ${res.status}`] };
    }
    const data = res.json;
    const version = (data['dist-tags'] && data['dist-tags'].latest) || null;
    const publishedAt = version && data.time ? data.time[version] : null;
    let publishedDaysAgo = null;
    if (publishedAt) {
      const ts = Date.parse(publishedAt);
      if (!Number.isNaN(ts)) publishedDaysAgo = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
    }
    const notes = [];
    if (!version) notes.push('registry 响应里没有 latest 版本号');
    return { registry_version: version, published_days_ago: publishedDaysAgo, published: true, notes };
  } catch (err) {
    return { registry_version: null, published_days_ago: null, published: false, notes: [`registry 不可达：${err.message}`] };
  }
}

/**
 * 分发通道核验 —— 2026-11-26 起正式通道是 GitHub Release，不是 npm。
 * 公开仓库的 releases 端点无需认证；404/无 tag = 还没有 release。
 * 存在的理由：判据 1 若只查 npm registry，GitHub 通道下会永远判「未发布」→ 窗口打不开。
 */
async function collectDistribution() {
  try {
    const res = await fetchJson(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.status === 404) {
      return { channel: null, tag: null, published: false, notes: ['GitHub 无 release（404）'] };
    }
    if (!res.ok || !res.json) {
      return { channel: null, tag: null, published: false, notes: [`GitHub releases HTTP ${res.status}`] };
    }
    const tag = res.json.tag_name || null;
    return {
      channel: tag ? 'github' : null,
      tag,
      published: Boolean(tag),
      notes: [tag ? `GitHub Release ${tag}` : 'release 里没有 tag'],
    };
  } catch (err) {
    return { channel: null, tag: null, published: false, notes: [`GitHub releases 不可达：${err.message}`] };
  }
}

/** Heuristic: does this issue/PR body look like a question? */
const ASK_PATTERNS = [
  /[?？]/,
  /能不能/, /能否/, /可不可以/, /可以吗/, /是否支持/, /怎么用/,
  /how\s+to\b/i, /can\s+it\b/i, /can\s+i\b/i, /is\s+there\s+a\s+way\b/i,
  /would\s+it\s+be\s+possible\b/i, /\bsupport(s|ed)?\b/i, /支持/,
];

/** Heuristic: artifact-ish keywords — a lead counter, never a verdict. */
const ARTIFACT_PATTERNS = [
  /https?:\/\/\S+/i,
  /\.fold\b/i, /\.svg\b/i, /\.dxf\b/i, /\.stl\b/i, /dieline/i, /template/i,
  /packaging/i, /artifact/i, /generated?\b/i, /output\b/i,
  /折纸/, /折痕/, /生成/, /产物/, /作品/, /示例/,
];

function isAsking(item) {
  const text = `${item.title || ''}\n${item.body || ''}`;
  return ASK_PATTERNS.some((re) => re.test(text));
}

function countArtifactLeads(items) {
  let leads = 0;
  for (const item of items) {
    const text = `${item.title || ''}\n${item.body || ''}`;
    for (const re of ARTIFACT_PATTERNS) {
      const matches = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
      if (matches) leads += matches.length;
    }
  }
  return leads;
}

function isOwner(login) {
  if (!login) return true;
  const name = String(login).toLowerCase();
  if (name === REPO_OWNER.toLowerCase()) return true;
  if (name.endsWith('[bot]')) return true;
  return false;
}

/**
 * GitHub — needs GH_TOKEN. Without it every GitHub field is null and the
 * note says why. The script never writes to GitHub.
 */
async function collectGithub() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    return {
      available: false, reason: 'no-token',
      issues_total: null, issues_asking: null, nonowner_issues_asking: null,
      artifact_leads: null, forks: null, stars: null, prs: null,
      notes: ['缺 GH_TOKEN，判据 2 / 3 无法采集（GitHub 字段为 null）'],
    };
  }

  const headers = { Authorization: `Bearer ${token}` };
  const notes = [];
  let repo = null;
  try {
    const res = await fetchJson(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}`, headers);
    if (res.status === 404) {
      return {
        available: false, reason: 'repo-unreachable',
        issues_total: null, issues_asking: null, nonowner_issues_asking: null,
        artifact_leads: null, forks: null, stars: null, prs: null,
        notes: [`仓库 ${REPO_OWNER}/${REPO_NAME} 不可访问（HTTP 404）`],
      };
    }
    if (!res.ok) {
      return {
        available: false, reason: 'http-error',
        issues_total: null, issues_asking: null, nonowner_issues_asking: null,
        artifact_leads: null, forks: null, stars: null, prs: null,
        notes: [`GitHub API HTTP ${res.status}`],
      };
    }
    repo = res.json;
  } catch (err) {
    return {
      available: false, reason: 'network',
      issues_total: null, issues_asking: null, nonowner_issues_asking: null,
      artifact_leads: null, forks: null, stars: null, prs: null,
      notes: [`GitHub API 不可达：${err.message}`],
    };
  }

  let items = [];
  try {
    const res = await fetchJson(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=all&per_page=100`, headers);
    if (res.ok && Array.isArray(res.json)) {
      items = res.json;
    } else {
      notes.push(`issues 列表不可用（HTTP ${res.status}）`);
    }
  } catch (err) {
    notes.push(`issues 列表不可达：${err.message}`);
  }

  const issues = items.filter((i) => !i.pull_request);
  const prs = items.filter((i) => !!i.pull_request);
  const asking = issues.filter((i) => isAsking(i));
  const nonownerAsking = asking.filter((i) => !isOwner(i.user && i.user.login));

  return {
    available: true, reason: null,
    issues_total: issues.length,
    issues_asking: asking.length,
    nonowner_issues_asking: nonownerAsking.length,
    artifact_leads: countArtifactLeads(items),
    forks: typeof repo.forks_count === 'number' ? repo.forks_count : null,
    stars: typeof repo.stargazers_count === 'number' ? repo.stargazers_count : null,
    prs: prs.length,
    notes,
  };
}

// ────────────────────────────────────────────────────────────────────
// 采集
// ────────────────────────────────────────────────────────────────────

async function collect() {
  const [registry, github, distribution] = await Promise.all([collectRegistry(), collectGithub(), collectDistribution()]);
  const calls = countNonOwnerCalls();

  const notes = [];
  notes.push(...registry.notes);
  notes.push(...github.notes);
  notes.push(...distribution.notes);
  if (calls.note) notes.push(calls.note);

  const row = {
    date: localDate(),
    registry_version: registry.registry_version,
    published_days_ago: registry.published_days_ago,
    issues_total: github.issues_total,
    issues_asking: github.issues_asking,
    nonowner_calls: calls.count,
    artifact_leads: github.artifact_leads,
    forks: github.forks,
    stars: github.stars,
    prs: github.prs,
    distribution_tag: distribution.tag,
    note: notes.join('；'),
  };

  return { row, registry, github, distribution, calls };
}

function appendDailyRow(row) {
  fs.mkdirSync(SIGNALS_DIR, { recursive: true });
  fs.appendFileSync(DAILY_LOG, JSON.stringify(row) + '\n');
}

// ────────────────────────────────────────────────────────────────────
// 报告（三档结论）
// ────────────────────────────────────────────────────────────────────

const ESTABLISHED = '成立';
const NOT_ESTABLISHED = '不成立';
const INSUFFICIENT = '信息不足';

// 强弱排序：信息不足 < 不成立 < 成立 —— 整体结论取最弱的一档。
const RANK = { [ESTABLISHED]: 3, [NOT_ESTABLISHED]: 2, [INSUFFICIENT]: 1 };

function buildVerdicts(collected) {
  const { registry, github, distribution, calls } = collected;
  const verdicts = [];

  // 判据 1 — 分发通道就绪（npm registry **或** GitHub Release，任一成立即可）
  // 2026-11-26：正式通道改为 GitHub Release（npm 账号创建被 Cloudflare 人机验证挡住）。
  // 只查 registry 会让 GitHub 通道下永远判「未发布」→ 14 天窗口打不开。
  if (registry.published && registry.registry_version) {
    verdicts.push({
      id: 1, label: '分发通道就绪', state: ESTABLISHED,
      detail: `npm registry ${registry.registry_version}，发布 ${registry.published_days_ago === null ? '?' : registry.published_days_ago} 天前`,
      missing: null,
    });
  } else if (distribution && distribution.published) {
    verdicts.push({
      id: 1, label: '分发通道就绪', state: ESTABLISHED,
      detail: `GitHub Release ${distribution.tag}（npm registry 尚未发布）`,
      missing: null,
    });
  } else if (
    registry.published === false &&
    registry.notes.some((n) => n.includes('404')) &&
    distribution && distribution.notes.some((n) => n.includes('404'))
  ) {
    verdicts.push({
      id: 1, label: '分发通道就绪', state: NOT_ESTABLISHED,
      detail: 'npm registry 404 且 GitHub 无 release —— 两个通道都还没发',
      missing: null,
    });
  } else {
    verdicts.push({
      id: 1, label: '分发通道就绪', state: INSUFFICIENT,
      detail: [...registry.notes, ...(distribution ? distribution.notes : [])].join('；') || '分发通道数据缺失',
      missing: '判据1 的分发通道数据',
    });
  }

  // 判据 2 — 非本人下游 artifact：计数层可自动，语义层不可自动 → 信息不足
  const leads = github.artifact_leads;
  verdicts.push({
    id: 2, label: '非本人下游 artifact', state: INSUFFICIENT,
    detail: leads === null
      ? '线索无法采集；语义层「谁做的」未判定'
      : `线索 ${leads} 条；语义层「谁做的」未判定`,
    missing: '判据2 的语义判定（非本人产物的归属）',
  });

  // 判据 3 — 非本人提问 issue
  if (!github.available) {
    const why = github.reason === 'no-token'
      ? '缺 GH_TOKEN，issue 无法采集'
      : (github.notes[0] || 'issue 数据缺失');
    verdicts.push({
      id: 3, label: '非本人提问 issue', state: INSUFFICIENT,
      detail: why,
      missing: '判据3 的 issue 数据（GH_TOKEN）',
    });
  } else if ((github.nonowner_issues_asking || 0) > 0) {
    verdicts.push({
      id: 3, label: '非本人提问 issue', state: ESTABLISHED,
      detail: `${github.nonowner_issues_asking} 条（非本人，排除本人与机器人账号）`,
      missing: null,
    });
  } else {
    verdicts.push({
      id: 3, label: '非本人提问 issue', state: NOT_ESTABLISHED,
      detail: `0 条（提问 issue 共 ${github.issues_asking} 条，均为本人或机器人账号）`,
      missing: null,
    });
  }

  // 判据 4 — 非本人 agent 调用 ≥5
  if (calls.count === null) {
    verdicts.push({
      id: 4, label: '非本人 agent 调用 ≥5', state: INSUFFICIENT,
      detail: '调用日志缺失，无法计数',
      missing: '判据4 的调用日志',
    });
  } else if (calls.count >= NONOWNER_CALL_THRESHOLD) {
    verdicts.push({
      id: 4, label: '非本人 agent 调用 ≥5', state: ESTABLISHED,
      detail: `${calls.count} 次（MCP 仅 stdio 本地通道，不计非本人）`,
      missing: null,
    });
  } else {
    verdicts.push({
      id: 4, label: '非本人 agent 调用 ≥5', state: INSUFFICIENT,
      detail: `${calls.count} 次；MCP 仅 stdio、REST 默认绑回环 → 他人调用结构上观测不到`,
      missing: '判据4 的远程入口（结构不可观测）',
      observable: false,
    });
  }

  return verdicts;
}

/** Display width: CJK / full-width characters occupy two columns. */
function displayWidth(str) {
  let width = 0;
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    const wide = (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

/** Pad to a display width (not a character count). */
function padDisplay(str, width) {
  const pad = Math.max(0, width - displayWidth(str));
  return str + ' '.repeat(pad);
}

/**
 * 整体结论的合成规则（v2 —— 修正 v1 的致命缺陷）。
 *
 * v1（错的）：4 条判据取最弱的一档。后果 —— 判据 2 的语义层与判据 4 的远程入口
 * 天然「信息不足」，于是整体结论恒为信息不足，**14 天窗口永远关不掉** = 没有窗口。
 *
 * v2（按 2026-11-25 决策原文）：把两件事分开 ——
 *   ① 发布核验（判据 1）：只是前置条件，不参与需求判定
 *   ② 需求信号（判据 2/3/4）：语义是「任一条成立 = 有需求；可观测的全为 0 = 无需求」
 *      （原文：「全 0 → 承认『折纸品类无需求』」）
 *
 * observable:false 的信号（当前是判据 4）不参与判定，但必须在报告里显式列出
 * 「未观测」—— 「我们没提供远程入口」不等于「没人用」。
 */
function synthesize(verdicts) {
  const publish = verdicts.find((v) => v.id === 1);
  const signals = verdicts.filter((v) => v.id !== 1);
  const observable = signals.filter((v) => v.observable !== false);
  const unobservable = signals.filter((v) => v.observable === false);

  // 前置：发布未完成 → 窗口未开始，任何需求判定都无意义
  if (publish.state === NOT_ESTABLISHED) {
    return {
      state: INSUFFICIENT,
      reason: '发布未完成 → 14 天窗口尚未开始（判据 1 尚未成立）',
      observed: observable, unobservable,
    };
  }
  if (publish.state === INSUFFICIENT) {
    return {
      state: INSUFFICIENT,
      reason: '发布核验数据缺失 → 无法确认窗口是否已开始',
      observed: observable, unobservable,
    };
  }

  // 发布已成立 → 看需求信号（只看可观测的）
  const hits = observable.filter((v) => v.state === ESTABLISHED);
  if (hits.length > 0) {
    return {
      state: ESTABLISHED,
      reason: `需求信号已出现 ${hits.length} 条：${hits.map((v) => v.label).join(' / ')}`,
      observed: observable, unobservable,
    };
  }

  const allZero = observable.length > 0 && observable.every((v) => v.state === NOT_ESTABLISHED);
  if (allZero) {
    const tail = unobservable.length > 0
      ? `（未观测通道 ${unobservable.length} 条：${unobservable.map((v) => v.label).join(' / ')}）`
      : '';
    return {
      state: NOT_ESTABLISHED,
      reason: `发布已完成，可观测的需求信号全为 0 → 无需求${tail}`,
      observed: observable, unobservable,
    };
  }

  return {
    state: INSUFFICIENT,
    reason: '无信号出现，但至少一条可观测信号缺数据 → 不能判定为无需求',
    observed: observable, unobservable,
  };
}

function renderReport(collected) {
  const verdicts = buildVerdicts(collected);
  const symbols = { [ESTABLISHED]: '✅', [NOT_ESTABLISHED]: '❌', [INSUFFICIENT]: '⚠️' };
  const labelWidth = Math.max(...verdicts.map((v) => displayWidth(v.label))) + 2;

  const lines = [];
  lines.push('origami-signals —— 14 天证伪窗报告');
  lines.push(`采集时间: ${isoTimestamp()}　观测目录: ${SIGNALS_DIR}`);
  lines.push('');
  for (const v of verdicts) {
    lines.push(`判据 ${v.id} ${padDisplay(v.label, labelWidth)}: ${symbols[v.state]} ${v.state}（${v.detail}）`);
  }

  const result = synthesize(verdicts);
  lines.push('');
  lines.push(`整体结论: ${result.state}`);
  lines.push(`判定依据: ${result.reason}`);

  const missing = result.observed
    .filter((v) => v.state === INSUFFICIENT)
    .map((v) => v.missing);
  lines.push(missing.length > 0 ? `缺失项: ${missing.join('；')}` : '缺失项: 无');

  if (result.unobservable.length > 0) {
    lines.push(
      `未观测（结构限制，不参与判定）: ${result.unobservable
        .map((v) => `判据${v.id} ${v.label} —— ${v.missing}`)
        .join('；')}`
    );
  }
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────

function usage() {
  return [
    'origami-signals — 14 天证伪窗观测器',
    '',
    '  node scripts/origami-signals.js            每日采集（追加一行到 ~/.origami/signals/daily.jsonl）',
    '  node scripts/origami-signals.js --report   输出三档结论 + 整体结论 + 缺失项',
    '',
    '环境变量: ORIGAMI_SIGNALS_DIR / ORIGAMI_SIGNALS_DATE / GH_TOKEN',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return 0;
  }

  const report = args.includes('--report');
  const collected = await collect();

  if (report) {
    console.log(renderReport(collected));
    return 0;
  }

  try {
    appendDailyRow(collected.row);
    console.log(`已写入 ${DAILY_LOG}`);
    console.log(JSON.stringify(collected.row));
  } catch (err) {
    console.error(`写入 ${DAILY_LOG} 失败：${err.message}`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`origami-signals 运行失败：${err && err.message ? err.message : err}`);
      process.exit(1);
    });
}

module.exports = {
  collect, buildVerdicts, renderReport, countNonOwnerCalls,
  isNonOwnerCall, isLoopbackAddress, isAsking, isOwner,
  ESTABLISHED, NOT_ESTABLISHED, INSUFFICIENT, RANK,
};
