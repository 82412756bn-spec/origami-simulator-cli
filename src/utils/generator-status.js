/**
 * 内置生成器的几何状态（2026-11-26 以官方 78 例为基准实测）
 *
 * 为什么需要它：这些生成器从未被验证过几何正确性，而 CLI 此前不告诉用户
 * 「这个 pattern 的折痕图可能不满足折平必要条件」—— 用户只能自己撞。
 * 现在状态随包发布并在 CLI 里明示。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'templates', 'generator-status.json');
const TEMPLATE_FILE = path.join(__dirname, '..', '..', 'templates', 'template-status.json');

let cached = null;

function loadStatus(file = FILE) {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    cached = { patterns: {}, measured_at: null };
  }
  return cached;
}

/** 取某个内置 pattern 的几何状态 */
function statusOf(pattern, file = FILE) {
  const s = loadStatus(file);
  return (s.patterns || {})[pattern] || null;
}

/** 给一行输出加几何状态后缀（CLI 用） */
function suffix(pattern, file = FILE) {
  const st = statusOf(pattern, file);
  if (!st) return '';
  // 措辞诚实性（Kun 2026-11-28 判断）：
  //   ① 不得用 "verified" —— 它字面读起来像「验证过了」，而我们只验证了
  //      **折平必要条件**（Kawasaki + Maekawa），**从未实物折过**。
  //   ② 「未经实物折纸验证」必须对**所有**生成器都写出来 —— 不是只有 fish；
  //      藏进 JSON 的 note 字段 = 用户看不见 = 等于没标。
  const geo = st.geometry === 'verified'
    ? '  [几何 ✅ 满足折平必要条件 · 未经实物折纸验证]'
    : st.geometry === 'na'
      ? `  [几何 — ${st.note}]`
      : `  [几何 ⚠️ 不满足折平必要条件：${st.note} · 未经实物折纸验证]`;

  // 同族替代物：当内置形态自身几何失衡、而同族替代物几何全过时，给出更稳的选择。
  // 必须说明「不是同一个形态」—— 只说"更稳"会让人以为可平替。
  const sub = st.substitute;
  if (!sub || !sub.template) return geo;
  if (st.geometry === 'verified') return geo;
  const cmd = `origami generate --template ${sub.template} --copies ${sub.copies}`;
  return `${geo}\n  💡 几何全过的同族形态（**不是同一个东西**）：${cmd}`;
}

/** 取某个模板的几何状态 */
function templateStatus(templateId, file = TEMPLATE_FILE) {
  let tpl = null;
  try {
    tpl = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
  return (tpl.templates || {})[templateId] || null;
}

/** 模板不满足折平必要条件时的提示（无状态 = 该模板无内部顶点，条件不适用） */
function templateWarning(templateId, file = TEMPLATE_FILE) {
  const st = templateStatus(templateId, file);
  if (!st) return '';
  const kawaOk = st.kawasaki && st.kawasaki.split('/')[0] === st.kawasaki.split('/')[1];
  const maekOk = st.maekawa && st.maekawa.split('/')[0] === st.maekawa.split('/')[1];
  if (kawaOk && maekOk) return '';
  const parts = [];
  if (!kawaOk) parts.push(`Kawasaki ${st.kawasaki}`);
  if (!maekOk) parts.push(`Maekawa ${st.maekawa}`);
  return `\n  ⚠️ 该模板不满足折平必要条件：${parts.join(' · ')}`;
}

module.exports = { FILE, TEMPLATE_FILE, loadStatus, statusOf, suffix, templateStatus, templateWarning };
